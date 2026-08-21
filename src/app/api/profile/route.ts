import { NextRequest, NextResponse } from "next/server";
import { getProfile, updateProfile } from "@/server/store";

export async function GET() {
  return NextResponse.json({ profile: getProfile() });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const profile = updateProfile(body);
  return NextResponse.json({ profile });
}
