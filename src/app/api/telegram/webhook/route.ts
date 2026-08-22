import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/server/store";

// Used once deployed (Telegram pushes here instead of us long-polling). Not active locally —
// local dev uses src/server/telegramPoller.ts instead, since long-polling and a webhook can't
// both be active on the same bot at once.
export async function POST(req: NextRequest) {
  const update = await req.json();
  await handleTelegramUpdate(update).catch((err) => console.error("telegram webhook error", err));
  return NextResponse.json({ ok: true });
}
