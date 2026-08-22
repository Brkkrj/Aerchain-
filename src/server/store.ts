// Server-side store — real request/response logic behind every API route, backed by Postgres via
// Prisma (see prisma/schema.prisma). Previously this was an in-memory Map, which on Vercel loses
// or fails to share state across serverless cold starts/instances — that was the root cause of
// requirements, offers, and vendor-Telegram links disappearing in production. Every mutation here
// is genuine: actual DB writes, actual extraction parsing, an actual audit trail.
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { extractOffer, detectFormat, rankOffers, recognizeImageText, extractTextFromDocument } from "@/lib/extraction";
import { draftTurn, buildSummary } from "@/lib/aera";
import * as tg from "@/lib/telegram";
import * as gmail from "@/lib/gmail";
import {
  AuditEntry,
  Buyer,
  DispatchLogEntry,
  Message,
  Notification,
  Offer,
  ReplyChannel,
  Requirement,
  RequirementStatus,
  Vendor,
} from "@/lib/types";

type OfferRow = NonNullable<Awaited<ReturnType<typeof prisma.offer.findFirst>>>;
type MessageRow = NonNullable<Awaited<ReturnType<typeof prisma.message.findFirst>>>;
type NotificationRow = NonNullable<Awaited<ReturnType<typeof prisma.notification.findFirst>>>;
type AuditRow = NonNullable<Awaited<ReturnType<typeof prisma.auditEntry.findFirst>>>;
type DispatchRow = NonNullable<Awaited<ReturnType<typeof prisma.dispatchLogEntry.findFirst>>>;
type VendorRow = NonNullable<Awaited<ReturnType<typeof prisma.vendor.findFirst>>>;
type RequirementRow = NonNullable<Awaited<ReturnType<typeof prisma.requirement.findFirst>>> & {
  messages: MessageRow[];
  offers: OfferRow[];
};

const REQUIREMENT_INCLUDE = {
  messages: { orderBy: { createdAt: "asc" as const } },
  offers: { orderBy: { receivedAt: "asc" as const } },
};

function mapOffer(o: OfferRow): Offer {
  return {
    id: o.id,
    vendorId: o.vendorId,
    requirementId: o.requirementId,
    rawSource: o.rawSource,
    replyChannel: o.replyChannel as ReplyChannel,
    sourceFormat: o.sourceFormat as Offer["sourceFormat"],
    rate: o.rate,
    rateBasis: o.rateBasis,
    brandOffered: o.brandOffered,
    paymentTerms: o.paymentTerms,
    transportIncluded: o.transportIncluded,
    deliveryDate: o.deliveryDate,
    capacityUom: o.capacityUom,
    capacityLeadDays: o.capacityLeadDays,
    extractionConfidence: o.extractionConfidence,
    missingFields: o.missingFields,
    needsReview: o.needsReview,
    receivedAt: o.receivedAt.toISOString(),
  };
}

function mapMessage(m: MessageRow): Message {
  return { id: m.id, sender: m.sender as Message["sender"], text: m.text, createdAt: m.createdAt.toISOString() };
}

function mapRequirement(r: RequirementRow): Requirement {
  return {
    id: r.id,
    code: r.code,
    itemCategory: r.itemCategory,
    itemName: r.itemName,
    itemGrade: r.itemGrade,
    deliveryDate: r.deliveryDate,
    siteAddress: r.siteAddress,
    qty: r.qty,
    uom: r.uom,
    brandPreference: r.brandPreference,
    paymentTerms: r.paymentTerms,
    transportIncluded: r.transportIncluded,
    siteCoordinator: r.siteCoordinator,
    summaryText: r.summaryText,
    summaryEdited: r.summaryEdited,
    status: r.status as RequirementStatus,
    dealAmount: r.dealAmount,
    winningOfferId: r.winningOfferId,
    createdAt: r.createdAt.toISOString(),
    messages: r.messages.map(mapMessage),
    offers: r.offers.map(mapOffer),
    shortlistedVendorIds: r.shortlistedVendorIds,
  };
}

function mapVendor(v: VendorRow): Vendor {
  return {
    id: v.id,
    name: v.name,
    suppliesCategories: v.suppliesCategories,
    serviceLocations: v.serviceLocations,
    capacityUomPerMonth: v.capacityUomPerMonth,
    dealsLast30Days: v.dealsLast30Days,
    replyChannel: v.replyChannel as ReplyChannel,
    email: v.email,
    telegramPhone: v.telegramPhone,
  };
}

function mapNotification(n: NotificationRow): Notification {
  return {
    id: n.id,
    requirementId: n.requirementId,
    text: n.text,
    meta: n.meta,
    type: n.type as Notification["type"],
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

function mapAudit(a: AuditRow): AuditEntry {
  return { id: a.id, requirementId: a.requirementId, actor: a.actor as AuditEntry["actor"], action: a.action, detail: a.detail, createdAt: a.createdAt.toISOString() };
}

function mapDispatch(d: DispatchRow): DispatchLogEntry {
  return { id: d.id, requirementId: d.requirementId, vendorId: d.vendorId, channel: d.channel as ReplyChannel, to: d.to, message: d.message, delivered: d.delivered, sentAt: d.sentAt.toISOString() };
}

async function getRequirementRow(id: string): Promise<RequirementRow | null> {
  return prisma.requirement.findUnique({ where: { id }, include: REQUIREMENT_INCLUDE });
}

async function audit(requirementId: string, actor: AuditEntry["actor"], action: string, detail: string) {
  await prisma.auditEntry.create({ data: { requirementId, actor, action, detail } });
}

async function nextCode(): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { name: "requirement_seq" },
    update: { value: { increment: 1 } },
    create: { name: "requirement_seq", value: 3001 },
  });
  return `REQ-${counter.value}`;
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// This is the only automatic way a brand-new vendor finds out Aera exists at all: Telegram's
// Bot API refuses to let a bot message someone who hasn't started a chat with it (a hard
// platform anti-spam rule, not something we can configure around), so the initial contact has
// to arrive over a channel a bot CAN push to unprompted — email. The email carries the same RFx
// text as the Telegram dispatch, plus that vendor's personal "start the bot" link.
async function sendEmail(to: string, subject: string, body: string, replyTo?: string): Promise<boolean> {
  if (!resend) return false; // no RESEND_API_KEY configured — composed and logged, not delivered
  try {
    await resend.emails.send({ from: "Aera <onboarding@resend.dev>", to, subject, text: body, ...(replyTo ? { replyTo } : {}) });
    return true;
  } catch (err) {
    console.error("email send failed", err);
    return false;
  }
}

export async function listRequirements(params: {
  q?: string;
  status?: string;
  category?: string;
  sortDesc?: boolean;
  dateRange?: "7" | "30" | "90" | "all";
  page?: number;
  pageSize?: number;
}): Promise<{ requirements: Requirement[]; total: number }> {
  const q = (params.q ?? "").trim();
  const where: Record<string, unknown> = {};
  if (params.status && params.status !== "all") where.status = params.status;
  if (params.category && params.category !== "all") where.itemCategory = params.category;
  if (params.dateRange && params.dateRange !== "all") {
    const days = Number(params.dateRange);
    where.createdAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  }
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { itemName: { contains: q, mode: "insensitive" } },
      { offers: { some: { vendor: { name: { contains: q, mode: "insensitive" } } } } },
    ];
  }
  const pageSize = params.pageSize ?? 10;
  const page = Math.max(1, params.page ?? 1);
  const [rows, total] = await Promise.all([
    prisma.requirement.findMany({
      where,
      include: REQUIREMENT_INCLUDE,
      orderBy: { createdAt: params.sortDesc === false ? "asc" : "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.requirement.count({ where }),
  ]);
  return { requirements: rows.map(mapRequirement), total };
}

export async function getRequirement(id: string): Promise<Requirement | undefined> {
  const row = await getRequirementRow(id);
  return row ? mapRequirement(row) : undefined;
}

export async function createRequirement(firstMessage: string): Promise<{ requirement: Requirement; reply: string; isComplete: boolean }> {
  const code = await nextCode();
  const blank: Requirement = {
    id: "", code, itemCategory: null, itemName: null, itemGrade: null, deliveryDate: null,
    siteAddress: null, qty: null, uom: null, brandPreference: null, paymentTerms: null,
    transportIncluded: null, siteCoordinator: null, summaryText: null, summaryEdited: false,
    status: "draft", dealAmount: null, winningOfferId: null, createdAt: new Date().toISOString(),
    messages: [], offers: [], shortlistedVendorIds: [],
  };
  const result = draftTurn(firstMessage, blank);
  const merged: Requirement = { ...blank, ...result.patch };
  const summaryText = result.isComplete ? buildSummary(merged) : null;

  const created = await prisma.requirement.create({
    data: {
      code,
      itemCategory: merged.itemCategory,
      itemName: merged.itemName,
      itemGrade: merged.itemGrade,
      deliveryDate: merged.deliveryDate,
      siteAddress: merged.siteAddress,
      qty: merged.qty,
      uom: merged.uom,
      brandPreference: merged.brandPreference,
      paymentTerms: merged.paymentTerms,
      transportIncluded: merged.transportIncluded,
      siteCoordinator: merged.siteCoordinator,
      summaryText,
      status: "draft",
      messages: {
        create: [
          { sender: "buyer", text: firstMessage },
          { sender: "aera", text: result.reply },
        ],
      },
    },
    include: REQUIREMENT_INCLUDE,
  });
  await audit(created.id, "buyer", "requirement_created", `From chat: "${firstMessage}"`);
  return { requirement: mapRequirement(created), reply: result.reply, isComplete: result.isComplete };
}

export async function postMessage(id: string, text: string) {
  const row = await getRequirementRow(id);
  if (!row) throw new Error("not_found");
  const current = mapRequirement(row);
  const result = draftTurn(text, current);
  const merged: Requirement = { ...current, ...result.patch };
  const summaryText = result.isComplete ? buildSummary(merged) : current.summaryText;

  const updated = await prisma.requirement.update({
    where: { id },
    data: {
      itemCategory: merged.itemCategory,
      itemName: merged.itemName,
      itemGrade: merged.itemGrade,
      deliveryDate: merged.deliveryDate,
      siteAddress: merged.siteAddress,
      qty: merged.qty,
      uom: merged.uom,
      brandPreference: merged.brandPreference,
      paymentTerms: merged.paymentTerms,
      transportIncluded: merged.transportIncluded,
      siteCoordinator: merged.siteCoordinator,
      summaryText,
      messages: { create: [{ sender: "buyer", text }, { sender: "aera", text: result.reply }] },
    },
    include: REQUIREMENT_INCLUDE,
  });
  await audit(id, "buyer", "message_sent", text);
  return { requirement: mapRequirement(updated), reply: result.reply, isComplete: result.isComplete };
}

export async function patchRequirement(id: string, patch: Partial<Requirement> & { summaryText?: string }) {
  const before = await getRequirementRow(id);
  if (!before) throw new Error("not_found");
  const { messages: _m, offers: _o, ...rest } = patch as Record<string, unknown>;
  const data: Record<string, unknown> = { ...rest };
  if (patch.summaryText) data.summaryEdited = true;
  const updated = await prisma.requirement.update({ where: { id }, data, include: REQUIREMENT_INCLUDE });
  await audit(id, "buyer", "field_edited", `${JSON.stringify(mapRequirement(before))} -> ${JSON.stringify(patch)}`);
  return mapRequirement(updated);
}

const METRO_CITIES = ["Bangalore", "Mumbai", "Delhi", "Chennai", "Kolkata", "Ahmedabad", "Pune", "Hyderabad"];

function shortlistVendors(req: Requirement, allVendors: Vendor[]): { shortlisted: string[]; funnel: string[] } {
  const funnel: string[] = [];
  let pool = allVendors.slice();
  funnel.push(`${pool.length} vendors total`);
  if (req.itemCategory) {
    pool = pool.filter((v) => v.suppliesCategories.includes(req.itemCategory as string));
    funnel.push(`${pool.length} stock ${req.itemCategory}`);
  }
  const addressLower = (req.siteAddress ?? "").toLowerCase();
  const city = METRO_CITIES.find((c) => addressLower.includes(c.toLowerCase())) ?? null;
  if (city) {
    pool = pool.filter((v) => v.serviceLocations.includes(city));
    funnel.push(`${pool.length} deliver to ${city}`);
  }
  if (req.qty) {
    pool = pool.filter((v) => v.capacityUomPerMonth >= Math.min(req.qty as number, v.capacityUomPerMonth));
  }
  return { shortlisted: pool.map((v) => v.id), funnel };
}

function rfxMessageText(req: Requirement, buyerName: string, telegramLink?: string | null): string {
  return (
    `New RFx from ${buyerName} via Aerchain\n\n` +
    `${req.code}: ${req.itemName ?? req.itemCategory}${req.itemGrade ? ` (${req.itemGrade})` : ""}\n` +
    (req.qty && req.uom ? `Quantity: ${req.qty} ${req.uom}\n` : "") +
    `Deliver to: ${req.siteAddress}\n` +
    `Needed by: ${req.deliveryDate}\n\n` +
    `Please reply with your rate, payment terms, transport (included/excluded), and delivery date. ` +
    `Any format is fine — plain text, a pasted rate card, a PDF/Excel/Word file, or a photo. You can ` +
    `reply directly to this email, too.` +
    (telegramLink
      ? `\n\nFastest way to reply: open this link and send your quote on Telegram — ${telegramLink}`
      : "")
  );
}

async function logDispatch(entry: Omit<DispatchLogEntry, "id" | "sentAt">) {
  await prisma.dispatchLogEntry.create({ data: entry });
}

export async function getDispatchLog(requirementId: string): Promise<DispatchLogEntry[]> {
  const rows = await prisma.dispatchLogEntry.findMany({ where: { requirementId }, orderBy: { sentAt: "asc" } });
  return rows.map(mapDispatch);
}

export function repliedCount(req: Requirement): { replied: number; total: number; remaining: number } {
  const replied = new Set(req.offers.map((o) => o.vendorId)).size;
  const total = req.shortlistedVendorIds.length;
  return { replied, total, remaining: Math.max(0, total - replied) };
}

// Once any vendor sharing a dummy test phone number has linked a chat via /start, every other
// vendor on that same number can be dispatched to through the same chat (lets one real Telegram
// account role-play several demo vendors) — replaces the old in-memory linkedChatIdByPhone map.
async function resolveChatIdForVendor(vendor: VendorRow): Promise<string | null> {
  if (vendor.telegramChatId) return vendor.telegramChatId;
  const sibling = await prisma.vendor.findFirst({ where: { telegramPhone: vendor.telegramPhone, telegramChatId: { not: null } } });
  return sibling?.telegramChatId ?? null;
}

export async function confirmRequirement(id: string, action: "send" | "draft") {
  const row = await getRequirementRow(id);
  if (!row) throw new Error("not_found");
  if (action === "draft") {
    await audit(id, "buyer", "draft_saved", "Saved as draft");
    return mapRequirement(row);
  }
  const req = mapRequirement(row);
  const buyer = await prisma.buyer.findFirst();
  const vendorRows = await prisma.vendor.findMany();
  const { shortlisted, funnel } = shortlistVendors(req, vendorRows.map(mapVendor));
  await audit(id, "aera", "vendor_shortlisted", funnel.join(" -> "));

  const updatedRow = await prisma.requirement.update({
    where: { id },
    data: { status: "sent_to_vendor", shortlistedVendorIds: shortlisted },
    include: REQUIREMENT_INCLUDE,
  });
  const updated = mapRequirement(updatedRow);
  await audit(id, "system", "dispatched", `Sent to vendors: ${shortlisted.join(", ") || "none matched"}`);

  const botUsername = await getBotUsername();

  // Every shortlisted vendor gets contacted on BOTH channels — this is the "quote sent, waiting
  // for rates" moment the buyer sees on screen. Telegram can only push to a vendor who has
  // already started a chat with the bot (a hard platform rule), so a vendor who hasn't linked
  // yet gets their personal "start the bot" link in the email instead — that's the only
  // automatic way a brand-new vendor discovers Aera at all.
  for (const vendorId of shortlisted) {
    const vendor = vendorRows.find((v) => v.id === vendorId);
    if (!vendor) continue;
    const chatId = tg.isConfigured() ? await resolveChatIdForVendor(vendor) : null;
    const telegramLink = !chatId && botUsername ? tg.botDeepLink(botUsername, getVendorLinkToken(vendorId, id)) : null;
    const body = rfxMessageText(updated, buyer?.name ?? "the buyer", telegramLink);

    const replyTo = gmail.isConfigured() ? gmail.replyToAddress(vendorId, id) : undefined;
    const delivered = await sendEmail(vendor.email, `New RFx: ${updated.code} — ${updated.itemName ?? updated.itemCategory}`, body, replyTo);
    await logDispatch({ requirementId: id, vendorId, channel: "email", to: vendor.email, message: body, delivered });
    await audit(id, "system", delivered ? "email_sent" : "email_logged_not_sent", `To ${vendor.email} for ${vendor.name}`);

    if (tg.isConfigured()) {
      if (chatId) {
        if (!vendor.telegramChatId) await prisma.vendor.update({ where: { id: vendor.id }, data: { telegramChatId: chatId } });
        await prisma.telegramLink.upsert({
          where: { chatId },
          update: { vendorId, requirementId: id },
          create: { chatId, vendorId, requirementId: id },
        });
        try {
          await tg.sendMessage(chatId, `=== Quote request for ${vendor.name} ===\n\n${body}`);
          await logDispatch({ requirementId: id, vendorId, channel: "telegram", to: vendor.telegramPhone, message: body, delivered: true });
          await audit(id, "system", "telegram_sent", `Message sent to ${vendor.name} (${vendor.telegramPhone})`);
        } catch (err) {
          await logDispatch({ requirementId: id, vendorId, channel: "telegram", to: vendor.telegramPhone, message: body, delivered: false });
          await audit(id, "system", "telegram_send_failed", `${vendorId}: ${(err as Error).message}`);
        }
      } else {
        await logDispatch({ requirementId: id, vendorId, channel: "telegram", to: vendor.telegramPhone, message: body, delivered: false });
      }
    }
  }
  return updated;
}

export async function listOffers(id: string) {
  const row = await getRequirementRow(id);
  if (!row) throw new Error("not_found");
  const vendorRows = await prisma.vendor.findMany();
  const dealsLookup = Object.fromEntries(vendorRows.map((v) => [v.id, v.dealsLast30Days]));
  const offers = row.offers.map(mapOffer);
  const ranking = rankOffers(offers, dealsLookup);
  return { offers, ranking, vendors: vendorRows.map(mapVendor) };
}

export async function submitVendorReply(requirementId: string, vendorId: string, rawText: string, channelOverride?: ReplyChannel) {
  const row = await getRequirementRow(requirementId);
  if (!row) throw new Error("not_found");
  const req = mapRequirement(row);
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  const extraction = extractOffer(rawText);
  const format = detectFormat(rawText);

  const offerRow = await prisma.offer.create({
    data: {
      requirementId,
      vendorId,
      rawSource: rawText,
      replyChannel: channelOverride ?? vendor?.replyChannel ?? "email",
      sourceFormat: format,
      rate: extraction.rate,
      rateBasis: extraction.rateBasis,
      brandOffered: extraction.brandOffered,
      paymentTerms: extraction.paymentTerms,
      transportIncluded: extraction.transportIncluded,
      deliveryDate: extraction.deliveryDate,
      capacityUom: extraction.capacityUom,
      capacityLeadDays: extraction.capacityLeadDays,
      extractionConfidence: extraction.confidence,
      missingFields: extraction.missingFields,
      needsReview: extraction.confidence < 0.7,
    },
  });
  const wasFirst = req.offers.length === 0;
  const updatedRow = await prisma.requirement.update({ where: { id: requirementId }, data: { status: "rate_received" }, include: REQUIREMENT_INCLUDE });
  const updated = mapRequirement(updatedRow);
  await audit(requirementId, "system", "offer_received", `${vendor?.name ?? vendorId} via ${offerRow.replyChannel} (${format}), confidence ${offerRow.extractionConfidence}`);

  const { replied, total, remaining } = repliedCount(updated);
  const vendorName = vendor?.name ?? vendorId;
  const allIn = remaining === 0;
  const text = allIn
    ? `All ${total} vendor${total === 1 ? "" : "s"} have replied — compare rates now`
    : wasFirst
      ? `${vendorName}'s rate has arrived`
      : `${vendorName}'s rate has arrived too`;
  const meta =
    `${req.code} · ${req.itemName ?? req.itemCategory} · ${replied} of ${total} vendor(s) replied` +
    (remaining > 0 ? ` · ${remaining} remaining` : " · all in");
  const type: Notification["type"] = allIn ? "all_replied" : "vendor_replied";
  await prisma.notification.create({ data: { requirementId, text, meta, type, read: false } });
  await audit(requirementId, "system", "customer_notified", text);
  return { requirement: updated, offer: mapOffer(offerRow) };
}

export async function selectOffer(id: string, offerId: string) {
  const row = await getRequirementRow(id);
  if (!row) throw new Error("not_found");
  await audit(id, "buyer", "offer_selected", offerId);
  return mapRequirement(row);
}

export async function acceptOffer(id: string, offerId: string) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) throw new Error("offer_not_found");
  const row = await getRequirementRow(id);
  if (!row) throw new Error("not_found");
  const dealAmount = offer.rate != null && row.qty ? offer.rate * row.qty : offer.rate;
  const updatedRow = await prisma.requirement.update({
    where: { id },
    data: { status: "closed_deal", winningOfferId: offerId, dealAmount },
    include: REQUIREMENT_INCLUDE,
  });
  const vendor = await prisma.vendor.update({ where: { id: offer.vendorId }, data: { dealsLast30Days: { increment: 1 } } });
  await audit(id, "buyer", "winner_selected", offer.vendorId);
  await audit(id, "system", "confirmation_sent", `To ${vendor.name}`);
  await audit(id, "system", "requirement_closed", `Deal amount ${dealAmount}`);
  return mapRequirement(updatedRow);
}

export async function cancelRequirement(id: string, reason: string) {
  const updatedRow = await prisma.requirement.update({ where: { id }, data: { status: "cancelled" }, include: REQUIREMENT_INCLUDE }).catch(() => null);
  if (!updatedRow) throw new Error("not_found");
  await audit(id, "buyer", "requirement_cancelled", reason);
  return mapRequirement(updatedRow);
}

export async function getNotifications(): Promise<Notification[]> {
  const rows = await prisma.notification.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(mapNotification);
}

export async function markNotificationRead(notifId: string): Promise<Notification[]> {
  await prisma.notification.update({ where: { id: notifId }, data: { read: true } }).catch(() => null);
  return getNotifications();
}

export async function getAuditLog(id: string): Promise<AuditEntry[]> {
  const rows = await prisma.auditEntry.findMany({ where: { requirementId: id }, orderBy: { createdAt: "asc" } });
  return rows.map(mapAudit);
}

export async function getProfile(): Promise<Buyer> {
  const buyer = await prisma.buyer.findFirst();
  if (!buyer) throw new Error("no_buyer_seeded");
  return { name: buyer.name, billingAddress: buyer.billingAddress, siteAddress: buyer.siteAddress };
}

export async function updateProfile(patch: Partial<Buyer>): Promise<Buyer> {
  const buyer = await prisma.buyer.findFirst();
  if (!buyer) throw new Error("no_buyer_seeded");
  const updated = await prisma.buyer.update({ where: { id: buyer.id }, data: patch });
  return { name: updated.name, billingAddress: updated.billingAddress, siteAddress: updated.siteAddress };
}

export async function getVendors(): Promise<Vendor[]> {
  const rows = await prisma.vendor.findMany();
  return rows.map(mapVendor);
}

let cachedBotUsername: string | null = null;

export async function getBotUsername(): Promise<string | null> {
  if (!tg.isConfigured()) return null;
  if (cachedBotUsername) return cachedBotUsername;
  try {
    const me = await tg.getMe();
    cachedBotUsername = me.username;
    return me.username;
  } catch {
    return null;
  }
}

export function getVendorLinkToken(vendorId: string, requirementId: string): string {
  return `${vendorId}_${requirementId}`;
}

export async function isVendorLinked(vendorId: string): Promise<boolean> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  return !!vendor?.telegramChatId;
}

async function findPendingRequirementForVendor(vendorId: string): Promise<string | null> {
  const rows = await prisma.requirement.findMany({
    where: { status: { in: ["sent_to_vendor", "rate_received"] }, shortlistedVendorIds: { has: vendorId } },
    include: { offers: true },
    orderBy: { createdAt: "desc" },
  });
  const candidate = rows.find((r) => !r.offers.some((o) => o.vendorId === vendorId));
  return candidate?.id ?? null;
}

// Handles both the long-poll loop (local dev) and the webhook route (deployed) — same logic,
// same effect: a real vendor reply flows into the exact same extraction pipeline as the
// in-app "reply as vendor" panel. Vendor-chat linking is DB-backed (TelegramLink/Vendor rows),
// so this resolves correctly no matter which serverless instance handles the request.
export async function handleTelegramUpdate(update: tg.TgUpdate) {
  const msg = update.message;
  if (!msg) return;
  const chatId = String(msg.chat.id);
  const text = msg.text ?? "";

  if (text.startsWith("/start")) {
    const payload = text.slice(6).trim();
    const sep = payload.indexOf("_");
    if (sep === -1) {
      await tg.sendMessage(chatId, "This link doesn't look right — ask your buyer to resend it.");
      return;
    }
    const vendorId = payload.slice(0, sep);
    const requirementId = payload.slice(sep + 1);
    const [row, vendor, buyer] = await Promise.all([
      getRequirementRow(requirementId),
      prisma.vendor.findUnique({ where: { id: vendorId } }),
      prisma.buyer.findFirst(),
    ]);
    if (!row || !vendor) {
      await tg.sendMessage(chatId, "This requirement no longer exists.");
      return;
    }
    await prisma.vendor.update({ where: { id: vendorId }, data: { telegramChatId: chatId } });
    await prisma.telegramLink.upsert({
      where: { chatId },
      update: { vendorId, requirementId },
      create: { chatId, vendorId, requirementId },
    });
    await audit(requirementId, "system", "vendor_telegram_linked", `${vendor.name} linked chat ${chatId}`);
    await tg.sendMessage(chatId, `Hi, this is Aera on behalf of ${buyer?.name ?? "the buyer"}.\n\n${rfxMessageText(mapRequirement(row), buyer?.name ?? "the buyer")}`);
    return;
  }

  // Since every dummy vendor shares one real chat, a reply can start with "V2:" to say which
  // vendor it's answering for; otherwise it's assumed to answer whichever vendor was dispatched
  // to most recently in this chat.
  let link = await prisma.telegramLink.findUnique({ where: { chatId } });
  const prefixMatch = text.match(/^(V\d+)[:\-.,]?\s*/i);
  if (prefixMatch) {
    const vendorId = prefixMatch[1].toUpperCase();
    const pendingReqId = await findPendingRequirementForVendor(vendorId);
    if (pendingReqId) {
      link = await prisma.telegramLink.upsert({
        where: { chatId },
        update: { vendorId, requirementId: pendingReqId },
        create: { chatId, vendorId, requirementId: pendingReqId },
      });
    }
  }
  if (!link) {
    await tg.sendMessage(chatId, "I don't have an open request for this chat. Ask your buyer to resend the link.");
    return;
  }

  let rawText = (prefixMatch ? text.slice(prefixMatch[0].length) : text) || msg.caption || "";
  const photo = msg.photo?.[msg.photo.length - 1];
  if (!rawText && photo) {
    try {
      const buffer = await tg.downloadFile(photo.file_id);
      const ocrText = await recognizeImageText(buffer);
      rawText = ocrText ? `[OCR of photographed rate card]\n${ocrText}` : "[Photo received, OCR found no readable text]";
    } catch (err) {
      console.error("photo OCR pipeline failed", err);
      rawText = "[Photo received, could not be read]";
    }
  } else if (!rawText && msg.document) {
    const fileLabel = msg.document.file_name ?? "attached file";
    try {
      const buffer = await tg.downloadFile(msg.document.file_id);
      const docText = await extractTextFromDocument(buffer, msg.document.mime_type ?? "", msg.document.file_name);
      rawText = docText
        ? `[Extracted from ${fileLabel}]\n${docText}`
        : `[Received ${fileLabel}, no readable text found — likely a scanned/image-only file]`;
    } catch (err) {
      console.error("document extraction pipeline failed", err);
      rawText = `[Received ${fileLabel}, could not be read]`;
    }
  }
  if (!rawText) return;

  const { requirement } = await submitVendorReply(link.requirementId, link.vendorId, rawText, "telegram");
  const vendor = await prisma.vendor.findUnique({ where: { id: link.vendorId } });
  const { remaining } = repliedCount(requirement);
  await tg.sendMessage(
    chatId,
    `Got it — thanks. Your quote for ${requirement.code} has been recorded.` +
      (remaining > 0 ? ` Still waiting on ${remaining} other vendor(s).` : "")
  );
  await audit(link.requirementId, "system", "telegram_reply_received", `${vendor?.name ?? link.vendorId}: "${rawText.slice(0, 120)}"`);
}

// Polled from the client (piggybacking on the existing notification-poll interval) rather than
// pushed via webhook — there's no domain here for Gmail/Resend to push inbound mail to, so we
// pull instead. Only scans the buyer's own unread mail for the "+vendorId_requirementId" alias
// tag (see lib/gmail.ts); anything else in the inbox is left completely alone.
export async function checkInboundEmail(): Promise<{ processed: number }> {
  if (!gmail.isConfigured()) return { processed: 0 };
  const emails = await gmail.listInboundReplies();
  let processed = 0;
  for (const email of emails) {
    let rawText = email.text;
    const attachment = email.attachments[0]; // first attachment only, same simplification as Telegram
    if (!rawText.trim() && attachment) {
      try {
        const buffer = await gmail.downloadAttachment(email.gmailId, attachment.attachmentId);
        const docText = attachment.mimeType.startsWith("image/")
          ? await recognizeImageText(buffer)
          : await extractTextFromDocument(buffer, attachment.mimeType, attachment.filename);
        rawText = docText
          ? `[Extracted from ${attachment.filename}]\n${docText}`
          : `[Received ${attachment.filename}, no readable text found]`;
      } catch (err) {
        console.error("email attachment extraction failed", err);
        rawText = `[Received ${attachment.filename}, could not be read]`;
      }
    }
    if (rawText.trim()) {
      try {
        await submitVendorReply(email.requirementId, email.vendorId, rawText, "email");
        await audit(email.requirementId, "system", "email_reply_received", `${email.from}: "${rawText.slice(0, 120)}"`);
        processed++;
      } catch (err) {
        console.error("failed to process inbound email", email.gmailId, err);
      }
    }
    await gmail.markRead(email.gmailId).catch((err) => console.error("failed to mark email read", email.gmailId, err));
  }
  return { processed };
}
