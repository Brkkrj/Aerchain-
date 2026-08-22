import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { handleTelegramUpdate } from "@/server/store";

// Used once deployed (Telegram pushes here instead of us long-polling). Not active locally —
// local dev uses src/server/telegramPoller.ts instead, since long-polling and a webhook can't
// both be active on the same bot at once.
//
// Telegram enforces its own response timeout on webhook deliveries — a slow update (document
// extraction can take a couple seconds) was blowing past it, so Telegram logged "Read timeout
// expired" and kept re-queuing the same update. Acknowledge immediately and do the actual
// processing in `after()`, which Vercel keeps the function alive for after the response has
// already gone out.
export async function POST(req: NextRequest) {
  const update = await req.json();
  after(() => handleTelegramUpdate(update).catch((err) => console.error("telegram webhook error", err)));
  return NextResponse.json({ ok: true });
}
