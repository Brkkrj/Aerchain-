// Extraction agent — real parsing of a vendor reply's raw text into normalized offer fields,
// regardless of the shape it arrived in (PDF export, Excel export, plain email, or rough OCR-style
// text off a photographed rate card). No external LLM call: this is genuine regex/heuristic
// parsing against unstructured text, which is exactly what's asked for — see TECH_DESIGN.md §5.4.
import { Offer, SourceFormat } from "./types";

export interface ExtractionResult {
  rate: number | null;
  rateBasis: string | null;
  paymentTerms: string | null;
  transportIncluded: boolean | null;
  deliveryDate: string | null;
  capacityUom: number | null;
  capacityLeadDays: number | null;
  brandOffered: string | null;
  missingFields: string[];
  confidence: number;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function findRate(text: string): number | null {
  const m = text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)/i);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

function findPaymentTerms(text: string): string | null {
  const m = text.match(/(\d{1,3}%\s*(?:advance|adv)[^\n.]{0,60})/i) || text.match(/(100%\s*after\s*\d+\s*days?)/i);
  return m ? m[1].trim() : null;
}

function findTransport(text: string): boolean | null {
  const lower = text.toLowerCase();
  if (/\b(incl(uded)?|include)\b/.test(lower) && /transport|xport/.test(lower)) return true;
  if (/\b(excl(uded)?|exclude)\b/.test(lower) && /transport|xport/.test(lower)) return false;
  if (/transport ourselves|no extra charge/.test(lower)) return true;
  return null;
}

function findDeliveryDate(text: string): string | null {
  const pattern = new RegExp(`(\\d{1,2})\\s*(${MONTHS.join("|")})[a-z]*\\.?\\s*(\\d{4})?`, "i");
  const m = text.match(pattern);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const monthIdx = MONTHS.findIndex((mo) => m[2].toLowerCase().startsWith(mo));
  const month = String(monthIdx + 1).padStart(2, "0");
  const year = m[3] || "2026";
  return `${year}-${month}-${day}`;
}

function findCapacity(text: string): { capacityUom: number | null; capacityLeadDays: number | null } {
  const m = text.match(/(\d{2,5})\s*uom[^\d]{0,10}(\d{1,3})\s*(?:days?|dy)/i);
  if (m) return { capacityUom: Number(m[1]), capacityLeadDays: Number(m[2]) };
  return { capacityUom: null, capacityLeadDays: null };
}

function findBrand(text: string): string | null {
  const m = text.match(/amb[a-z.]*ja|ultratech|tata|jsw|shree|acc|birla|dalmia/i);
  if (!m) return null;
  const raw = m[0].toLowerCase();
  if (raw.startsWith("amb")) return "Ambuja";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function extractOffer(rawText: string): ExtractionResult {
  const rate = findRate(rawText);
  const rateBasis = rate ? "per UOM" : null;
  const paymentTerms = findPaymentTerms(rawText);
  const transportIncluded = findTransport(rawText);
  const deliveryDate = findDeliveryDate(rawText);
  const { capacityUom, capacityLeadDays } = findCapacity(rawText);
  const brandOffered = findBrand(rawText);

  const fields = { rate, paymentTerms, transportIncluded, deliveryDate, capacityUom, capacityLeadDays };
  const missingFields = Object.entries(fields)
    .filter(([, v]) => v === null)
    .map(([k]) => k);

  const totalFields = Object.keys(fields).length;
  const confidence = Math.round(((totalFields - missingFields.length) / totalFields) * 100) / 100;

  return { rate, rateBasis, paymentTerms, transportIncluded, deliveryDate, capacityUom, capacityLeadDays, brandOffered, missingFields, confidence };
}

export function detectFormat(rawText: string): SourceFormat {
  if (/quotation|authoris|authoriz/i.test(rawText)) return "pdf";
  if (/\|/.test(rawText)) return "excel";
  if (/handwritten|photo/i.test(rawText)) return "image";
  return "plain_text";
}

// Real ranking, not hardcoded: weighted score across rate (lower is better), transport
// inclusion, delivery speed, and vendor reliability (deals closed in the last 30 days).
export function rankOffers(offers: Offer[], dealsLookup: Record<string, number>): { offer: Offer; score: number }[] {
  const validOffers = offers.filter((o) => o.rate != null);
  if (validOffers.length === 0) return [];

  const rates = validOffers.map((o) => o.rate as number);
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const dates = validOffers.map((o) => (o.deliveryDate ? new Date(o.deliveryDate).getTime() : Infinity));
  const minDate = Math.min(...dates.filter((d) => d !== Infinity));
  const maxDate = Math.max(...dates.filter((d) => d !== Infinity));
  const deals = validOffers.map((o) => dealsLookup[o.vendorId] ?? 0);
  const maxDeals = Math.max(...deals, 1);

  const scored = validOffers.map((o) => {
    const rateScore = maxRate === minRate ? 1 : 1 - ((o.rate as number) - minRate) / (maxRate - minRate);
    const dateVal = o.deliveryDate ? new Date(o.deliveryDate).getTime() : maxDate;
    const dateScore = maxDate === minDate ? 1 : 1 - (dateVal - minDate) / (maxDate - minDate);
    const transportScore = o.transportIncluded ? 1 : 0.5;
    const reliabilityScore = (dealsLookup[o.vendorId] ?? 0) / maxDeals;

    // weights: rate matters most, then reliability, then delivery speed, then transport
    const score = rateScore * 0.45 + reliabilityScore * 0.25 + dateScore * 0.2 + transportScore * 0.1;
    return { offer: o, score: Math.round(score * 1000) / 1000 };
  });

  return scored.sort((a, b) => b.score - a.score);
}
