// Real, format-agnostic extraction for email replies — the fix for repeatedly-broken native
// libraries (tesseract.js crashed outright under Vercel's serverless module loader; pdf-parse's
// pdfjs-dist/native-canvas deps were unreliable even when marked external) and for regex gaps
// that keep surfacing on real-world phrasing (bold markdown, bullet lists, "30 days from
// invoice", capacity/lead time on separate lines). One multimodal API call reads the email body
// text and every attachment (PDF, image, or otherwise) together and returns structured fields
// directly — no bundling-fragile native parsing, no regex guessing. Plain fetch against the
// REST API, matching the style of telegram.ts/gmail.ts (no SDK dependency).
import { ExtractionResult } from "./extraction";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.6-flash";

export function isConfigured(): boolean {
  return !!API_KEY;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    transcription: { type: "STRING", description: "Verbatim transcription of all readable text across the email body and every attachment." },
    rate: { type: "NUMBER", nullable: true, description: "The quoted rate/price per unit. Null if not present or illegible." },
    rate_basis: { type: "STRING", nullable: true, description: "What the rate is per, e.g. 'per MT', 'per bag'." },
    brand_offered: { type: "STRING", nullable: true },
    payment_terms: { type: "STRING", nullable: true, description: "e.g. '50% advance, balance on delivery', '30 days from invoice'." },
    transport_included: { type: "BOOLEAN", nullable: true },
    delivery_date: { type: "STRING", nullable: true, description: "ISO format YYYY-MM-DD. Null if not present." },
    capacity_uom: { type: "NUMBER", nullable: true, description: "Quantity the vendor can supply (may be stated separately from lead time)." },
    capacity_lead_days: { type: "NUMBER", nullable: true, description: "Lead time in days." },
    confidence: { type: "NUMBER", description: "0 to 1: confidence that `rate` specifically was read correctly (not confused with a subtotal/GST/grand-total figure)." },
  },
  required: ["transcription", "confidence"],
};

interface Attachment {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

export interface GeminiExtraction {
  transcription: string;
  extraction: ExtractionResult;
}

// Gemini reads whatever mime types it natively understands (PDF, common image formats, plain
// text); anything else (Excel/Word) is skipped here since xlsx/mammoth already parse those
// reliably without bundling issues — this is specifically for the formats that broke.
const SUPPORTED_MIME = /^(application\/pdf|image\/|text\/plain)/;

export async function extractOfferFromEmail(bodyText: string, attachments: Attachment[]): Promise<GeminiExtraction | null> {
  if (!API_KEY) return null;
  const parts: Record<string, unknown>[] = [
    {
      text:
        "This is a vendor's reply to a construction-materials rate request — read the email body and every attached file (rate card, quotation, invoice, or photo) together and extract the fields. " +
        "Only report a value you can actually see in the provided content — never guess, infer from typical/plausible values, or fabricate a company name, order number, or rate that isn't genuinely present. " +
        "If the rate (or any other field) isn't clearly stated anywhere in what you were given, its value must be null, and `confidence` must be low (0.2 or under). " +
        (bodyText ? `Email body:\n${bodyText}` : "(No body text — see attachment(s).)"),
    },
  ];
  let attachedAny = false;
  for (const att of attachments) {
    if (!SUPPORTED_MIME.test(att.mimeType)) continue;
    parts.push({ inlineData: { mimeType: att.mimeType, data: att.buffer.toString("base64") } });
    attachedAny = true;
  }
  if (!attachedAny) return null; // nothing readable was actually attached — don't let it guess from a bare "see attached" note

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Gemini API error: ${JSON.stringify(json)}`);
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const r = JSON.parse(text) as Record<string, unknown>;
    const fields = {
      rate: r.rate,
      paymentTerms: r.payment_terms,
      transportIncluded: r.transport_included,
      deliveryDate: r.delivery_date,
      capacityUom: r.capacity_uom,
      capacityLeadDays: r.capacity_lead_days,
    };
    const missingFields = Object.entries(fields)
      .filter(([, v]) => v == null)
      .map(([k]) => k);
    return {
      transcription: String(r.transcription ?? ""),
      extraction: {
        rate: (r.rate as number) ?? null,
        rateBasis: (r.rate_basis as string) ?? null,
        brandOffered: (r.brand_offered as string) ?? null,
        paymentTerms: (r.payment_terms as string) ?? null,
        transportIncluded: (r.transport_included as boolean) ?? null,
        deliveryDate: (r.delivery_date as string) ?? null,
        capacityUom: (r.capacity_uom as number) ?? null,
        capacityLeadDays: (r.capacity_lead_days as number) ?? null,
        missingFields,
        confidence: typeof r.confidence === "number" ? r.confidence : 0.5,
      },
    };
  } catch (err) {
    console.error("gemini extraction failed", err);
    return null;
  }
}
