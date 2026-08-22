// Real Telegram Bot API client — no SDK, just HTTPS calls. Requires TELEGRAM_BOT_TOKEN.
// Two ways this gets messages from vendors, in order of what's actually running:
// 1. Long polling (getUpdates) — used automatically in local dev (`npm run dev`), no public
//    URL needed. Started once by server/telegramPoller.ts.
// 2. Webhook (/api/telegram/webhook) — used once deployed, so Telegram pushes to us instead
//    of us polling a serverless function that isn't always running.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

export function isConfigured(): boolean {
  return !!API;
}

export interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; username?: string; first_name?: string };
    text?: string;
    caption?: string;
    photo?: { file_id: string }[];
    document?: { file_id: string; file_name?: string; mime_type?: string };
  };
}

async function call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  if (!API) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram API error (${method}): ${JSON.stringify(json)}`);
  return json.result as T;
}

export async function getMe() {
  return call<{ id: number; username: string; first_name: string }>("getMe");
}

export async function sendMessage(chatId: string | number, text: string) {
  return call("sendMessage", { chat_id: chatId, text });
}

export async function getUpdates(offset: number, timeoutSec = 25) {
  return call<TgUpdate[]>("getUpdates", { offset, timeout: timeoutSec });
}

export async function setWebhook(url: string) {
  return call("setWebhook", { url });
}

export async function deleteWebhook() {
  return call("deleteWebhook", {});
}

export async function getFileUrl(fileId: string): Promise<string> {
  const file = await call<{ file_path: string }>("getFile", { file_id: fileId });
  return `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
}

// Downloads a Telegram-hosted photo/document so it can be OCR'd — see extraction.ts's
// recognizeImageText. Telegram photo arrays are smallest-to-largest; callers pass the last one.
export async function downloadFile(fileId: string): Promise<Buffer> {
  const url = await getFileUrl(fileId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download Telegram file: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export function botDeepLink(botUsername: string, payload: string): string {
  return `https://t.me/${botUsername}?start=${payload}`;
}
