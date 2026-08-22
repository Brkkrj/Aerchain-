import { NextRequest, NextResponse } from "next/server";
import { confirmRequirement } from "@/server/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const action = body.action === "draft" ? "draft" : "send";
  try {
    const requirement = await confirmRequirement(id, action);
    return NextResponse.json({ requirement });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
