// Free inbound "email" for vendor replies, without owning a domain: vendors reply to a Gmail
// "+" alias (e.g. brkkrj+V3_reqid@gmail.com) that still lands in the buyer's normal Gmail inbox.
// We read that inbox via the Gmail API (OAuth refresh token), pull the alias tag out of the
// To/Delivered-To header to identify which vendor+requirement a reply answers, and feed the body
// + any attachment through the same extraction pipeline Telegram uses. No SDK — plain fetch,
// matching the style of telegram.ts.

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
export const GMAIL_ADDRESS = process.env.GMAIL_ADDRESS || "brkkrj@gmail.com";

export function isConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
}

// Same tag shape as the Telegram deep-link payload (vendorId_requirementId) — reused as the
// Gmail "+" alias tag so a vendor's reply-to address doubles as the lookup key.
export function replyToAddress(vendorId: string, requirementId: string): string {
  const [local, domain] = GMAIL_ADDRESS.split("@");
  return `${local}+${vendorId}_${requirementId}@${domain}`;
}

function parseTag(headerValue: string): { vendorId: string; requirementId: string } | null {
  const m = headerValue.match(/\+([A-Za-z0-9]+)_([A-Za-z0-9]+)@/);
  if (!m) return null;
  return { vendorId: m[1], requirementId: m[2] };
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 30_000) return cachedAccessToken.token;
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) throw new Error("Gmail OAuth env vars are not set");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Gmail token refresh failed: ${JSON.stringify(json)}`);
  cachedAccessToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedAccessToken.token;
}

async function gmailFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Gmail API error (${path}): ${JSON.stringify(json)}`);
  return json as T;
}

interface GmailPart {
  mimeType: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  payload: GmailPart;
}

function decodeBase64Url(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function findHeader(payload: GmailPart, name: string): string | null {
  const h = payload.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

interface Attachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
}

function collectParts(part: GmailPart, textParts: string[], attachments: Attachment[]) {
  if (part.filename && part.body?.attachmentId) {
    attachments.push({ filename: part.filename, mimeType: part.mimeType, attachmentId: part.body.attachmentId });
    return;
  }
  if (part.mimeType === "text/plain" && part.body?.data) {
    textParts.push(decodeBase64Url(part.body.data).toString("utf-8"));
    return;
  }
  if (part.parts) {
    for (const p of part.parts) collectParts(p, textParts, attachments);
  }
}

export interface InboundEmail {
  gmailId: string;
  vendorId: string;
  requirementId: string;
  from: string;
  subject: string;
  text: string;
  attachments: Attachment[];
}

// Scans recent unread mail (bounded — this is a personal inbox, not a firehose) and returns only
// the ones addressed to our "+vendorId_requirementId" alias; anything else (the buyer's own
// unread personal mail) is left untouched and unread.
export async function listInboundReplies(): Promise<InboundEmail[]> {
  const list = await gmailFetch<{ messages?: { id: string }[] }>("/messages?q=is:unread&maxResults=25");
  const results: InboundEmail[] = [];
  for (const m of list.messages ?? []) {
    const msg = await gmailFetch<GmailMessage>(`/messages/${m.id}?format=full`);
    const to = findHeader(msg.payload, "Delivered-To") ?? findHeader(msg.payload, "To") ?? "";
    const tag = parseTag(to);
    if (!tag) continue; // not one of our vendor-reply aliases — leave it alone
    const textParts: string[] = [];
    const attachments: Attachment[] = [];
    collectParts(msg.payload, textParts, attachments);
    results.push({
      gmailId: msg.id,
      vendorId: tag.vendorId,
      requirementId: tag.requirementId,
      from: findHeader(msg.payload, "From") ?? "",
      subject: findHeader(msg.payload, "Subject") ?? "",
      text: textParts.join("\n").trim(),
      attachments,
    });
  }
  return results;
}

export async function downloadAttachment(gmailId: string, attachmentId: string): Promise<Buffer> {
  const res = await gmailFetch<{ data: string }>(`/messages/${gmailId}/attachments/${attachmentId}`);
  return decodeBase64Url(res.data);
}

export async function markRead(gmailId: string): Promise<void> {
  await gmailFetch(`/messages/${gmailId}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
}
