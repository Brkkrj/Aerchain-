import { NextRequest, NextResponse } from "next/server";
import { getAuditLog } from "@/server/store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ entries: await getAuditLog(id) });
}
