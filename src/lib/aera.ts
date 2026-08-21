// Drafting agent — real rule-based NLU (no external LLM call). Parses free text into the
// Requirement's fields, tracks what's still missing among the 5 mandatory fields, and asks for
// exactly one missing thing per turn. See TECH_DESIGN.md §5.1 for the contract this mirrors.
import { MANDATORY_FIELDS, Requirement } from "./types";

const CATEGORY_WORDS: Record<string, string[]> = {
  Aggregate: ["aggregate", "agg"],
  Cement: ["cement"],
  "TMT Bars": ["tmt", "tmt bar", "tmt bars", "steel bar"],
  Sand: ["sand", "m-sand", "msand"],
  Bricks: ["brick", "bricks"],
};

const BRAND_WORDS = ["ambuja", "ultratech", "tata", "jsw", "shree", "acc", "birla", "dalmia"];

function findCategory(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) {
    if (words.some((w) => lower.includes(w))) return cat;
  }
  return null;
}

function findItemName(text: string, category: string | null): string | null {
  // "10mm Aggregate", "12mm TMT Bars", "OPC 53 Cement" style extraction.
  const sizeMatch = text.match(/(\d+\s?mm)\s*([a-zA-Z ]*)/i);
  if (sizeMatch && category) return `${sizeMatch[1].replace(/\s+/, "")} ${category}`;
  const opcMatch = text.match(/(OPC\s?\d+)/i);
  if (opcMatch) return `${opcMatch[1]} Cement`;
  return category;
}

function findBrand(text: string): string | null {
  const lower = text.toLowerCase();
  for (const b of BRAND_WORDS) {
    if (lower.includes(b)) return b.charAt(0).toUpperCase() + b.slice(1);
  }
  return null;
}

function findQty(text: string): { qty: number | null; uom: string | null } {
  const m = text.match(/(\d{2,6})\s*(uom|units?|bags?|tonnes?|tons?)/i);
  if (m) return { qty: Number(m[1]), uom: m[2].toUpperCase() };
  return { qty: null, uom: null };
}

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
function findDate(text: string): string | null {
  const m = text.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*(${MONTHS})[a-z]*\\.?\\s*(\\d{4})?`, "i"));
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthIdx = monthNames.findIndex((mo) => m[2].toLowerCase().startsWith(mo));
  const month = String(monthIdx + 1).padStart(2, "0");
  const year = m[3] || "2026";
  return `${year}-${month}-${day}`;
}

function findAddress(text: string): string | null {
  // Non-greedy capture that stops at " by/on/before <date>" or end of sentence — NOT at the
  // first comma, since real addresses ("Yeshwantpur, Bangalore") contain commas.
  const m = text.match(/(?:delivered to|deliver(?:y)? (?:at|to)|to|at)\s+([A-Za-z0-9,.\- ]{6,80}?)(?=\s+(?:by|on|before)\b|\.\s|\.$|$)/i);
  if (!m) return null;
  return m[1].replace(/[.,\s]+$/, "").trim();
}

function findPaymentTerms(text: string): string | null {
  const m = text.match(/(\d{1,3}%\s*(?:advance|adv)[^.]{0,40})/i);
  return m ? m[1].trim() : null;
}

function findTransport(text: string): boolean | null {
  const lower = text.toLowerCase();
  if (/transport (should be |is )?included|include transport/.test(lower)) return true;
  if (/transport (should be |is )?excluded|exclude transport|no transport/.test(lower)) return false;
  return null;
}

function findCoordinator(text: string): string | null {
  const m = text.match(/(?:site coordinator|coordinator)\s+(?:is|will be)?\s*([A-Za-z ]{2,40})/i);
  return m ? m[1].trim() : null;
}

export interface DraftPatch {
  itemCategory?: string | null;
  itemName?: string | null;
  itemGrade?: string | null;
  deliveryDate?: string | null;
  siteAddress?: string | null;
  qty?: number | null;
  uom?: string | null;
  brandPreference?: string | null;
  paymentTerms?: string | null;
  transportIncluded?: boolean | null;
  siteCoordinator?: string | null;
}

export function extractFromMessage(text: string): DraftPatch {
  const category = findCategory(text);
  const brand = findBrand(text);
  const { qty, uom } = findQty(text);
  const patch: DraftPatch = {};
  if (category) patch.itemCategory = category;
  const itemName = findItemName(text, category);
  if (itemName) patch.itemName = itemName;
  if (brand) {
    // brand doubles as "grade" in this domain's usage (matches the design mock's dummy data)
    patch.itemGrade = brand;
    patch.brandPreference = brand;
  }
  const date = findDate(text);
  if (date) patch.deliveryDate = date;
  const address = findAddress(text);
  if (address) patch.siteAddress = address;
  if (qty) patch.qty = qty;
  if (uom) patch.uom = uom;
  const terms = findPaymentTerms(text);
  if (terms) patch.paymentTerms = terms;
  const transport = findTransport(text);
  if (transport !== null) patch.transportIncluded = transport;
  const coordinator = findCoordinator(text);
  if (coordinator) patch.siteCoordinator = coordinator;
  return patch;
}

function missingMandatory(req: Requirement): (typeof MANDATORY_FIELDS)[number][] {
  return MANDATORY_FIELDS.filter((f) => !req[f]);
}

const QUESTIONS: Record<(typeof MANDATORY_FIELDS)[number], string> = {
  itemCategory: "What material do you need? (e.g. Aggregate, Cement, TMT Bars, Sand)",
  itemName: "What's the exact item/size? (e.g. 10mm Aggregate)",
  itemGrade: "Which brand or grade should it be?",
  deliveryDate: "When do you need it delivered by?",
  siteAddress: "What's the delivery site address?",
};

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

export function buildSummary(req: Requirement): string {
  const parts: string[] = [];
  parts.push(`You want ${req.itemName ?? req.itemCategory}${req.itemGrade ? ` (${req.itemGrade})` : ""}`);
  if (req.qty && req.uom) parts.push(`, ${req.qty} ${req.uom}`);
  if (req.siteAddress) parts.push(` delivered to ${req.siteAddress}`);
  if (req.deliveryDate) parts.push(`, by ${formatDate(req.deliveryDate)}`);
  if (req.transportIncluded === true) parts.push(". Transport should be included");
  if (req.paymentTerms) parts.push(`. Payment terms: ${req.paymentTerms}`);
  if (req.siteCoordinator) parts.push(`. Site coordinator: ${req.siteCoordinator}`);
  return parts.join("") + ".";
}

export interface DraftTurnResult {
  patch: DraftPatch;
  reply: string;
  isComplete: boolean;
}

export function draftTurn(message: string, current: Requirement): DraftTurnResult {
  const patch = extractFromMessage(message);
  const merged: Requirement = { ...current, ...patch };
  const missing = missingMandatory(merged);

  if (missing.length === 0) {
    return { patch, reply: "Got it — that's everything I need.", isComplete: true };
  }

  const gotSomething = Object.keys(patch).length > 0;
  const nextQuestion = QUESTIONS[missing[0]];
  const reply = gotSomething ? `Got it. ${nextQuestion}` : `Sure — ${nextQuestion.charAt(0).toLowerCase()}${nextQuestion.slice(1)}`;
  return { patch, reply, isComplete: false };
}
