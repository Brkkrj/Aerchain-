import { NextResponse } from "next/server";
import { markNotificationRead } from "@/server/store";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notifications = markNotificationRead(id);
  return NextResponse.json({ notifications });
}
