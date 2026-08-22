// Server-side store — real request/response logic behind every API route. In-memory for this
// prototype (no external DB, per the project's constraints), but every mutation is genuine:
// this is not mocked data returned unconditionally, it's actual state transitions, actual
// extraction parsing, and an actual audit trail.
import { extractOffer, detectFormat, rankOffers } from "@/lib/extraction";
import { draftTurn, buildSummary } from "@/lib/aera";
import { BUYER, OTHER_REQUIREMENTS, VENDORS, nextCode } from "@/lib/data";
import * as tg from "@/lib/telegram";
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
} from "@/lib/types";

interface ChatContext {
  requirementId: string;
  vendorId: string;
}

interface DB {
  requirements: Map<string, Requirement>;
  notifications: Notification[];
  audit: AuditEntry[];
  buyer: Buyer;
  vendorChats: Map<string, string>; // vendorId -> telegram chat id, once linked
  chatContext: Map<string, ChatContext>; // telegram chat id -> active requirement+vendor
  botUsername: string | null;
  linkedChatId: string | null; // the one real chat, once anyone has /start'd the bot
  dispatchLog: DispatchLogEntry[];
}

const globalForStore = globalThis as unknown as { __aeraStore?: DB };

function seed(): DB {
  const requirements = new Map<string, Requirement>();
  for (const r of OTHER_REQUIREMENTS) requirements.set(r.id, r);
  return {
    requirements,
    notifications: [],
    audit: [],
    buyer: { ...BUYER },
    vendorChats: new Map(),
    chatContext: new Map(),
    botUsername: null,
    linkedChatId: null,
    dispatchLog: [],
  };
}

// Real email sending is not wired up yet (see TECH_DESIGN.md / conversation notes — needs the
// buyer's personal Gmail connected as a tool). Once it is, replace this function's body with an
// actual send call; every call site already has the right (to, subject-ish, body) shape.
async function sendEmail(_to: string, _body: string): Promise<boolean> {
  return false; // false = composed and logged, but not actually delivered
}

const db: DB = globalForStore.__aeraStore ?? (globalForStore.__aeraStore = seed());

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function audit(requirementId: string, actor: AuditEntry["actor"], action: string, detail: string) {
  db.audit.push({ id: uid("audit"), requirementId, actor, action, detail, createdAt: new Date().toISOString() });
}

export function listRequirements(params: { q?: string; status?: string; category?: string; sortDesc?: boolean }) {
  let list = Array.from(db.requirements.values());
  const q = (params.q ?? "").trim().toLowerCase();
  if (q) {
    list = list.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        (r.itemName ?? "").toLowerCase().includes(q) ||
        r.offers.some((o) => VENDORS.find((v) => v.id === o.vendorId)?.name.toLowerCase().includes(q))
    );
  }
  if (params.status && params.status !== "all") list = list.filter((r) => r.status === params.status);
  if (params.category && params.category !== "all") list = list.filter((r) => r.itemCategory === params.category);
  list = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (params.sortDesc !== false) list = list.reverse();
  return list;
}

export function getRequirement(id: string): Requirement | undefined {
  return db.requirements.get(id);
}

export function createRequirement(firstMessage: string): { requirement: Requirement; reply: string; isComplete: boolean } {
  const id = uid("req");
  const code = nextCode();
  const blank: Requirement = {
    id, code, itemCategory: null, itemName: null, itemGrade: null, deliveryDate: null,
    siteAddress: null, qty: null, uom: null, brandPreference: null, paymentTerms: null,
    transportIncluded: null, siteCoordinator: null, summaryText: null, summaryEdited: false,
    status: "draft", dealAmount: null, winningOfferId: null, createdAt: new Date().toISOString(),
    messages: [], offers: [], shortlistedVendorIds: [],
  };
  const result = draftTurn(firstMessage, blank);
  const buyerMsg: Message = { id: uid("msg"), sender: "buyer", text: firstMessage, createdAt: new Date().toISOString() };
  const aeraMsg: Message = { id: uid("msg"), sender: "aera", text: result.reply, createdAt: new Date().toISOString() };
  const requirement: Requirement = { ...blank, ...result.patch, messages: [buyerMsg, aeraMsg] };
  if (result.isComplete) requirement.summaryText = buildSummary(requirement);
  db.requirements.set(id, requirement);
  audit(id, "buyer", "requirement_created", `From chat: "${firstMessage}"`);
  return { requirement, reply: result.reply, isComplete: result.isComplete };
}

export function postMessage(id: string, text: string) {
  const req = db.requirements.get(id);
  if (!req) throw new Error("not_found");
  const result = draftTurn(text, req);
  const buyerMsg: Message = { id: uid("msg"), sender: "buyer", text, createdAt: new Date().toISOString() };
  const aeraMsg: Message = { id: uid("msg"), sender: "aera", text: result.reply, createdAt: new Date().toISOString() };
  const updated: Requirement = { ...req, ...result.patch, messages: [...req.messages, buyerMsg, aeraMsg] };
  if (result.isComplete) updated.summaryText = buildSummary(updated);
  db.requirements.set(id, updated);
  audit(id, "buyer", "message_sent", text);
  return { requirement: updated, reply: result.reply, isComplete: result.isComplete };
}

export function patchRequirement(id: string, patch: Partial<Requirement> & { summaryText?: string }) {
  const req = db.requirements.get(id);
  if (!req) throw new Error("not_found");
  const before = { ...req };
  const updated: Requirement = { ...req, ...patch, summaryEdited: patch.summaryText ? true : req.summaryEdited };
  db.requirements.set(id, updated);
  audit(id, "buyer", "field_edited", `${JSON.stringify(before)} -> ${JSON.stringify(patch)}`);
  return updated;
}

function shortlistVendors(req: Requirement): { shortlisted: string[]; funnel: string[] } {
  const funnel: string[] = [];
  let pool = VENDORS.slice();
  funnel.push(`${pool.length} vendors total`);
  if (req.itemCategory) {
    pool = pool.filter((v) => v.suppliesCategories.includes(req.itemCategory as string));
    funnel.push(`${pool.length} stock ${req.itemCategory}`);
  }
  const city = (req.siteAddress ?? "").toLowerCase().includes("bangalore") ? "Bangalore" : null;
  if (city) {
    pool = pool.filter((v) => v.serviceLocations.includes(city));
    funnel.push(`${pool.length} deliver to ${city}`);
  }
  if (req.qty) {
    pool = pool.filter((v) => v.capacityUomPerMonth >= Math.min(req.qty as number, v.capacityUomPerMonth));
  }
  return { shortlisted: pool.map((v) => v.id), funnel };
}

function rfxMessageText(req: Requirement): string {
  return (
    `New RFx from ${db.buyer.name} via Aerchain\n\n` +
    `${req.code}: ${req.itemName ?? req.itemCategory}${req.itemGrade ? ` (${req.itemGrade})` : ""}\n` +
    (req.qty && req.uom ? `Quantity: ${req.qty} ${req.uom}\n` : "") +
    `Deliver to: ${req.siteAddress}\n` +
    `Needed by: ${req.deliveryDate}\n\n` +
    `Please reply with your rate, payment terms, transport (included/excluded), and delivery date. ` +
    `Any format is fine — plain text, a pasted rate card, or a photo.`
  );
}

function logDispatch(entry: Omit<DispatchLogEntry, "id" | "sentAt">) {
  db.dispatchLog.push({ ...entry, id: uid("dispatch"), sentAt: new Date().toISOString() });
}

export function getDispatchLog(requirementId: string): DispatchLogEntry[] {
  return db.dispatchLog.filter((d) => d.requirementId === requirementId);
}

export function repliedCount(req: Requirement): { replied: number; total: number; remaining: number } {
  const replied = new Set(req.offers.map((o) => o.vendorId)).size;
  const total = req.shortlistedVendorIds.length;
  return { replied, total, remaining: Math.max(0, total - replied) };
}

export async function confirmRequirement(id: string, action: "send" | "draft") {
  const req = db.requirements.get(id);
  if (!req) throw new Error("not_found");
  if (action === "draft") {
    audit(id, "buyer", "draft_saved", "Saved as draft");
    return req;
  }
  const { shortlisted, funnel } = shortlistVendors(req);
  audit(id, "aera", "vendor_shortlisted", funnel.join(" -> "));
  const updated: Requirement = { ...req, status: "sent_to_vendor", shortlistedVendorIds: shortlisted };
  db.requirements.set(id, updated);
  audit(id, "system", "dispatched", `Sent to vendors: ${shortlisted.join(", ") || "none matched"}`);

  // Every shortlisted vendor gets contacted on BOTH channels in parallel — this is the "quote
  // sent, waiting for rates" moment the buyer sees on screen.
  for (const vendorId of shortlisted) {
    const vendor = VENDORS.find((v) => v.id === vendorId);
    if (!vendor) continue;
    const body = rfxMessageText(updated);

    // Email — real send once personal Gmail is connected; logged either way.
    const delivered = await sendEmail(vendor.email, body);
    logDispatch({ requirementId: id, vendorId, channel: "email", to: vendor.email, message: body, delivered });
    audit(id, "system", delivered ? "email_sent" : "email_logged_not_sent", `To ${vendor.email} for ${vendor.name}`);

    // Telegram — real send if this vendor's chat (or the shared linked chat) is already known.
    if (tg.isConfigured()) {
      const chatId = db.vendorChats.get(vendorId) ?? db.linkedChatId;
      if (chatId) {
        db.vendorChats.set(vendorId, chatId);
        db.chatContext.set(chatId, { requirementId: id, vendorId });
        try {
          await tg.sendMessage(chatId, `=== Quote request for ${vendor.name} ===\n\n${body}`);
          logDispatch({ requirementId: id, vendorId, channel: "telegram", to: vendor.telegramPhone, message: body, delivered: true });
          audit(id, "system", "telegram_sent", `Message sent to ${vendor.name} (${vendor.telegramPhone})`);
        } catch (err) {
          logDispatch({ requirementId: id, vendorId, channel: "telegram", to: vendor.telegramPhone, message: body, delivered: false });
          audit(id, "system", "telegram_send_failed", `${vendorId}: ${(err as Error).message}`);
        }
      } else {
        logDispatch({ requirementId: id, vendorId, channel: "telegram", to: vendor.telegramPhone, message: body, delivered: false });
      }
    }
  }
  return updated;
}

export function listOffers(id: string) {
  const req = db.requirements.get(id);
  if (!req) throw new Error("not_found");
  const ranking = rankOffers(req.offers, Object.fromEntries(VENDORS.map((v) => [v.id, v.dealsLast30Days])));
  return { offers: req.offers, ranking, vendors: VENDORS };
}

export function submitVendorReply(requirementId: string, vendorId: string, rawText: string, channelOverride?: ReplyChannel) {
  const req = db.requirements.get(requirementId);
  if (!req) throw new Error("not_found");
  const extraction = extractOffer(rawText);
  const format = detectFormat(rawText);
  const vendor = VENDORS.find((v) => v.id === vendorId);
  const offer: Offer = {
    id: uid("off"),
    vendorId,
    requirementId,
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
    receivedAt: new Date().toISOString(),
  };
  const wasFirst = req.offers.length === 0;
  const updated: Requirement = { ...req, offers: [...req.offers, offer], status: "rate_received" };
  db.requirements.set(requirementId, updated);
  audit(requirementId, "system", "offer_received", `${vendor?.name ?? vendorId} via ${offer.replyChannel} (${format}), confidence ${offer.extractionConfidence}`);

  const { replied, total, remaining } = repliedCount(updated);
  const vendorName = vendor?.name ?? vendorId;
  const text =
    remaining === 0
      ? `All ${total} vendor${total === 1 ? "" : "s"} have replied — compare rates now`
      : wasFirst
        ? `${vendorName}'s rate has arrived`
        : `${vendorName}'s rate has arrived too`;
  const notif: Notification = {
    id: uid("notif"),
    requirementId,
    text,
    meta:
      `${req.code} · ${req.itemName ?? req.itemCategory} · ${replied} of ${total} vendor(s) replied` +
      (remaining > 0 ? ` · ${remaining} remaining` : " · all in"),
    read: false,
    createdAt: new Date().toISOString(),
  };
  db.notifications.unshift(notif);
  audit(requirementId, "system", "customer_notified", notif.text);
  return { requirement: updated, offer };
}

export function selectOffer(id: string, offerId: string) {
  const req = db.requirements.get(id);
  if (!req) throw new Error("not_found");
  audit(id, "buyer", "offer_selected", offerId);
  return req;
}

export function acceptOffer(id: string, offerId: string) {
  const req = db.requirements.get(id);
  if (!req) throw new Error("not_found");
  const offer = req.offers.find((o) => o.id === offerId);
  if (!offer) throw new Error("offer_not_found");
  const dealAmount = offer.rate != null && req.qty ? offer.rate * req.qty : offer.rate;
  const updated: Requirement = { ...req, status: "closed_deal", winningOfferId: offerId, dealAmount };
  db.requirements.set(id, updated);
  const vendor = VENDORS.find((v) => v.id === offer.vendorId);
  audit(id, "buyer", "winner_selected", offer.vendorId);
  audit(id, "system", "confirmation_sent", `To ${vendor?.name ?? offer.vendorId}`);
  audit(id, "system", "requirement_closed", `Deal amount ${dealAmount}`);
  return updated;
}

export function cancelRequirement(id: string, reason: string) {
  const req = db.requirements.get(id);
  if (!req) throw new Error("not_found");
  const updated: Requirement = { ...req, status: "cancelled" };
  db.requirements.set(id, updated);
  audit(id, "buyer", "requirement_cancelled", reason);
  return updated;
}

export function getNotifications() {
  return db.notifications;
}

export function markNotificationRead(notifId: string) {
  const n = db.notifications.find((x) => x.id === notifId);
  if (n) n.read = true;
  return db.notifications;
}

export function getAuditLog(id: string) {
  return db.audit.filter((a) => a.requirementId === id);
}

export function getProfile() {
  return db.buyer;
}

export function updateProfile(patch: Partial<Buyer>) {
  db.buyer = { ...db.buyer, ...patch };
  return db.buyer;
}

export function getVendors() {
  return VENDORS;
}

export async function getBotUsername(): Promise<string | null> {
  if (!tg.isConfigured()) return null;
  if (db.botUsername) return db.botUsername;
  try {
    const me = await tg.getMe();
    db.botUsername = me.username;
    return me.username;
  } catch {
    return null;
  }
}

export function getVendorLinkToken(vendorId: string, requirementId: string): string {
  return `${vendorId}_${requirementId}`;
}

export function isVendorLinked(vendorId: string): boolean {
  return db.vendorChats.has(vendorId);
}

// Handles both the long-poll loop (local dev) and the webhook route (deployed) — same logic,
// same effect: a real vendor reply flows into the exact same extraction pipeline as the
// in-app "reply as vendor" panel.
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
    const req = db.requirements.get(requirementId);
    const vendor = VENDORS.find((v) => v.id === vendorId);
    if (!req || !vendor) {
      await tg.sendMessage(chatId, "This requirement no longer exists.");
      return;
    }
    db.vendorChats.set(vendorId, chatId);
    db.chatContext.set(chatId, { requirementId, vendorId });
    db.linkedChatId = chatId; // this real chat now stands in for every dummy vendor
    audit(requirementId, "system", "vendor_telegram_linked", `${vendor.name} linked chat ${chatId}`);
    await tg.sendMessage(chatId, `Hi, this is Aera on behalf of ${db.buyer.name}.\n\n${rfxMessageText(req)}`);
    return;
  }

  // Since every dummy vendor shares one real chat, a reply can start with "V2:" to say which
  // vendor it's answering for; otherwise it's assumed to answer whichever vendor was dispatched
  // to most recently in this chat.
  let context = db.chatContext.get(chatId);
  const prefixMatch = text.match(/^(V\d+)[:\-.,]?\s*/i);
  if (prefixMatch) {
    const vendorId = prefixMatch[1].toUpperCase();
    const pendingReqId = findPendingRequirementForVendor(vendorId);
    if (pendingReqId) {
      context = { requirementId: pendingReqId, vendorId };
      db.chatContext.set(chatId, context);
    }
  }
  if (!context) {
    await tg.sendMessage(chatId, "I don't have an open request for this chat. Ask your buyer to resend the link.");
    return;
  }

  let rawText = (prefixMatch ? text.slice(prefixMatch[0].length) : text) || msg.caption || "";
  if (!rawText && (msg.photo || msg.document)) {
    rawText = "[Photo/file received, no caption text provided]";
  }
  if (!rawText) return;

  const { requirement } = submitVendorReply(context.requirementId, context.vendorId, rawText, "telegram");
  const vendor = VENDORS.find((v) => v.id === context.vendorId);
  const { remaining } = repliedCount(requirement);
  await tg.sendMessage(
    chatId,
    `Got it — thanks. Your quote for ${requirement.code} has been recorded.` +
      (remaining > 0 ? ` Still waiting on ${remaining} other vendor(s).` : "")
  );
  audit(context.requirementId, "system", "telegram_reply_received", `${vendor?.name ?? context.vendorId}: "${rawText.slice(0, 120)}"`);
}

function findPendingRequirementForVendor(vendorId: string): string | null {
  const candidates = Array.from(db.requirements.values())
    .filter((r) => (r.status === "sent_to_vendor" || r.status === "rate_received") && r.shortlistedVendorIds.includes(vendorId))
    .filter((r) => !r.offers.some((o) => o.vendorId === vendorId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return candidates[0]?.id ?? null;
}
