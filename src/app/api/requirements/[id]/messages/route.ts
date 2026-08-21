import { NextRequest, NextResponse } from "next/server";
import { postMessage } from "@/server/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (!body.message) return NextResponse.json({ error: "message is required" }, { status: 400 });
  try {
    const result = postMessage(id, body.message);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
