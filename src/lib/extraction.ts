// Extraction agent — rule-based parsing of a vendor reply's raw text into normalized offer
// fields, regardless of the shape it arrived in (PDF export, Excel export, plain email, or OCR
// text off a photographed rate card). No external LLM call available for this project — see
// TECH_DESIGN.md §5.4 for the contract this mirrors; a real Claude vision call is a drop-in
// replacement later (same function signatures/shape).
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
  const withCurrency = text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)/i);
  if (withCurrency) return Number(withCurrency[1].replace(/,/g, ""));
  // currency word AFTER the number — "50 rupees", "120 rs", "200/-"
  const trailingCurrency = text.match(/([\d,]+(?:\.\d+)?)\s*(?:rupees?|rs\.?|inr|\/-)\b/i);
  if (trailingCurrency) return Number(trailingCurrency[1].replace(/,/g, ""));
  const withLabel = text.match(/rate[:\-]?\s*([\d,]+(?:\.\d+)?)\s*(?:\/|per)?\s*(?:uom|unit)?/i);
  if (withLabel) return Number(withLabel[1].replace(/,/g, ""));
  return null;
}

function findPaymentTerms(text: string): string | null {
  // Only extend past the initial "N% advance" clause when what follows is clearly a genuine
  // continuation of the SAME payment term (a balance/remaining split) — otherwise a comma is
  // just the next unrelated field, whether that's prose ("...advance, transport included") or a
  // CSV/table cell boundary ("...Advance,Included,29 Aug 2026,...").
  const m =
    text.match(/(\d{1,3}%\s*(?:advance|adv)(?:\s*[+,]\s*(?:(?:balance|remaining|bal)|\d{1,3}%)[^\n,.]{0,40})?)/i) ||
    text.match(/(100%\s*after\s*\d+\s*days?)/i) ||
    text.match(/(\d{1,3}%\s*on\s*delivery)/i) ||
    text.match(/(payment\s*within\s*\d+\s*days?(?:\s*of\s*delivery)?)/i) ||
    text.match(/(\d{1,3}\s*-\s*\d{1,3}\b(?:\s*split)?)/i) ||
    text.match(/(cash on delivery|cod)/i) ||
    text.match(/(net\s*\d{1,3})/i);
  if (!m) return null;
  // The greedy "advance" pattern can run on past its own clause into an unrelated one in the
  // same reply (e.g. "50% advance, transport included") — trim that off so it isn't duplicated
  // against the separately-extracted transportIncluded field.
  return m[1].replace(/,?\s*(?:transport|xport)\b.*$/i, "").trim();
}

function findTransport(text: string): boolean | null {
  const lower = text.toLowerCase();
  if (/\b(incl(uded)?|include)\b/.test(lower) && /transport|xport/.test(lower)) return true;
  if (/\b(excl(uded)?|exclude)\b/.test(lower) && /transport|xport/.test(lower)) return false;
  if (/transport ourselves|no extra charge|free delivery|delivery (is )?free/.test(lower)) return true;
  if (/transport chargeable|extra for transport|buyer (will )?arrange(s)? transport/.test(lower)) return false;
  return null;
}

function findDeliveryDate(text: string): string | null {
  const pattern = new RegExp(`(\\d{1,2})\\s*(${MONTHS.join("|")})[a-z]*\\.?\\s*(\\d{4})?`, "i");
  const named = text.match(pattern);
  if (named) {
    const day = named[1].padStart(2, "0");
    const monthIdx = MONTHS.findIndex((mo) => named[2].toLowerCase().startsWith(mo));
    const month = String(monthIdx + 1).padStart(2, "0");
    const year = named[3] || "2026";
    return `${year}-${month}-${day}`;
  }
  const numeric = text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/);
  if (numeric) {
    const day = numeric[1].padStart(2, "0");
    const month = numeric[2].padStart(2, "0");
    return `${numeric[3]}-${month}-${day}`;
  }
  return null;
}

function findCapacity(text: string): { capacityUom: number | null; capacityLeadDays: number | null } {
  // The unit ("uom"/"mt"/"units") must be present right after the quantity — otherwise this
  // false-matches unrelated number pairs elsewhere in the message (e.g. "100% after 5 days" in
  // a payment-terms clause).
  const m = text.match(/(\d{2,5})\s*(?:uom|mt|units?)[^\d]{0,20}(\d{1,3})\s*(?:days?|dy|weeks?|wk)/i);
  if (m) {
    const isWeeks = /week|wk/i.test(m[0]);
    return { capacityUom: Number(m[1]), capacityLeadDays: isWeeks ? Number(m[2]) * 7 : Number(m[2]) };
  }
  return { capacityUom: null, capacityLeadDays: null };
}

const BRAND_WORDS = [
  "ambuja", "ultratech", "tata", "jsw", "shree", "acc", "birla", "dalmia", "ramco",
  "wonder", "century", "kesoram", "bangur", "sagar", "chettinad", "zuari", "coromandel",
  "tiscon", "sail", "kamdhenu",
];

function findBrand(text: string): string | null {
  const lower = text.toLowerCase();
  // tolerate OCR/typo noise like "amb..ja" or "amb*ja" before the exact-match pass
  if (/amb[a-z.*_ ]{0,4}ja/i.test(lower)) return "Ambuja";
  for (const b of BRAND_WORDS) {
    if (lower.includes(b)) return b.charAt(0).toUpperCase() + b.slice(1);
  }
  return null;
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
  if (/handwritten|photo/i.test(rawText)) return "image";
  if (/\[extracted from .*\.(xlsx|xls|csv)\]/i.test(rawText) || /\|/.test(rawText)) return "excel";
  if (/\[extracted from .*\.docx?\]/i.test(rawText)) return "word";
  if (/\[extracted from .*\.pdf\]/i.test(rawText) || /quotation|authoris|authoriz/i.test(rawText)) return "pdf";
  return "plain_text";
}

// Real (non-scanned) PDF/Word/Excel attachments a vendor sends as a Telegram document — reads
// actual file content, not just a filename stub. A scanned/image-only PDF has no extractable
// text layer; that case falls through to null and the caller flags it for manual review, same as
// a photo OCR that finds nothing, rather than pretending to have read it.
export async function extractTextFromDocument(buffer: Buffer, mimeType: string, fileName?: string): Promise<string | null> {
  const name = (fileName ?? "").toLowerCase();
  try {
    if (mimeType.includes("pdf") || name.endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      // pdf-parse's underlying pdfjs-dist/native-canvas init is flaky on a cold process — the
      // exact same real (non-scanned) PDF intermittently comes back with empty text on the first
      // attempt and succeeds on a second. Retrying once in the same invocation is cheap and
      // fixes it, rather than the caller wrongly concluding the file has no text layer.
      for (let attempt = 1; attempt <= 2; attempt++) {
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        await parser.destroy();
        const text = result.text?.trim();
        if (text) return text;
        if (attempt === 1) console.warn("pdf-parse returned empty text on first attempt, retrying");
      }
      return null;
    }
    if (mimeType.includes("wordprocessingml") || name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value?.trim() || null;
    }
    if (mimeType.includes("spreadsheetml") || mimeType.includes("ms-excel") || name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "buffer" });
      const text = wb.SheetNames.map((sheetName) => XLSX.utils.sheet_to_csv(wb.Sheets[sheetName])).join("\n\n");
      return text.trim() || null;
    }
  } catch (err) {
    console.error("document extraction failed", err);
  }
  return null;
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
