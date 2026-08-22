import { NextResponse } from "next/server";
import { getDispatchLog } from "@/server/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ entries: await getDispatchLog(id) });
}
