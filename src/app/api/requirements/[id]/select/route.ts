import { NextRequest, NextResponse } from "next/server";
import { selectOffer } from "@/server/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  try {
    const requirement = selectOffer(id, body.offerId);
    return NextResponse.json({ requirement });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
