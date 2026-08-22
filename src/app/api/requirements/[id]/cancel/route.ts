import { NextRequest, NextResponse } from "next/server";
import { cancelRequirement } from "@/server/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const requirement = await cancelRequirement(id, body.reason ?? "No reason given");
    return NextResponse.json({ requirement });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
