import { NextResponse } from "next/server";
import { getNotifications } from "@/server/store";

export async function GET() {
  return NextResponse.json({ notifications: await getNotifications() });
}
