import { NextRequest, NextResponse } from "next/server";
import { getRequirement, patchRequirement } from "@/server/store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requirement = getRequirement(id);
  if (!requirement) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ requirement });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  try {
    const requirement = patchRequirement(id, body);
    return NextResponse.json({ requirement });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
