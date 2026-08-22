import { NextRequest, NextResponse } from "next/server";
import { createRequirement, listRequirements } from "@/server/store";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const list = await listRequirements({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    sortDesc: searchParams.get("sort") !== "asc",
  });
  return NextResponse.json({ requirements: list });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.message || typeof body.message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const result = await createRequirement(body.message);
  return NextResponse.json(result);
}
