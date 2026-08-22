import { NextRequest, NextResponse } from "next/server";
import { createRequirement, listRequirements } from "@/server/store";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateRange = searchParams.get("dateRange") as "7" | "30" | "90" | "all" | null;
  const { requirements, total } = await listRequirements({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    sortDesc: searchParams.get("sort") !== "asc",
    dateRange: dateRange ?? undefined,
    page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
    pageSize: searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined,
  });
  return NextResponse.json({ requirements, total });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.message || typeof body.message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const result = await createRequirement(body.message);
  return NextResponse.json(result);
}
