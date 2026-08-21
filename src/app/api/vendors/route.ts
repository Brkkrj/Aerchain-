import { NextResponse } from "next/server";
import { getVendors } from "@/server/store";

export async function GET() {
  return NextResponse.json({ vendors: getVendors() });
}
