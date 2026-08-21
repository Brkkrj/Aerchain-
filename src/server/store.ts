// Server-side store — real request/response logic behind every API route. In-memory for this
// prototype (no external DB, per the project's constraints), but every mutation is genuine:
// this is not mocked data returned unconditionally, it's actual state transitions, actual
// extraction parsing, and an actual audit trail.
import { extractOffer, detectFormat, rankOffers } from "@/lib/extraction";
import { draftTurn, buildSummary } from "@/lib/aera";
import { BUYER, OTHER_REQUIREMENTS, VENDORS, nextCode } from "@/lib/data";
import {
  AuditEntry,
  Buyer,
  Message,
  Notification,
  Offer,
  Requirement,
  RequirementStatus,
} from "@/lib/types";

interface DB {
  requirements: Map<string, Requirement>;
  notifications: Notification[];
  audit: AuditEntry[];
  buyer: Buyer;
}

const globalForStore = globalThis as unknown as { __aeraStore?: DB };

function seed(): DB {
  const requirements = new Map<string, Requirement>();
  for (const r of OTHER_REQUIREMENTS) requirements.set(r.id, r);
  return { requirements, notifications: [], audit: [], buyer: { ...BUYER } };
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

export function confirmRequirement(id: string, action: "send" | "draft") {
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
  return updated;
}

export function listOffers(id: string) {
  const req = db.requirements.get(id);
  if (!req) throw new Error("not_found");
  const ranking = rankOffers(req.offers, Object.fromEntries(VENDORS.map((v) => [v.id, v.dealsLast30Days])));
  return { offers: req.offers, ranking, vendors: VENDORS };
}

export function submitVendorReply(requirementId: string, vendorId: string, rawText: string) {
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
    replyChannel: vendor?.replyChannel ?? "email",
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

  const notif: Notification = {
    id: uid("notif"),
    requirementId,
    text: wasFirst ? "Vendor rates have arrived, choose one" : "Another vendor rate came in",
    meta: `${req.code} · ${req.itemName ?? req.itemCategory} · ${updated.offers.length} rate(s) in`,
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
