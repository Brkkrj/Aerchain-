import { NextRequest, NextResponse } from "next/server";
import { submitVendorReply } from "@/server/store";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.requirementId || !body.vendorId || !body.text) {
    return NextResponse.json({ error: "requirementId, vendorId and text are required" }, { status: 400 });
  }
  try {
    const result = submitVendorReply(body.requirementId, body.vendorId, body.text);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
