import { NextResponse } from "next/server";
import { checkInboundEmail } from "@/server/store";

// Polled by the client (see Header.tsx) since there's no domain here for Gmail to push inbound
// mail to — pulling on an interval is the free alternative. No-ops instantly if Gmail OAuth
// env vars aren't configured. A batch of several pending replies each doing a Gemini vision call
// can add up past the default 10s function timeout, so give it more room.
export const maxDuration = 60;

export async function GET() {
  const result = await checkInboundEmail().catch((err) => {
    console.error("check-email failed", err);
    return { processed: 0 };
  });
  return NextResponse.json(result);
}
