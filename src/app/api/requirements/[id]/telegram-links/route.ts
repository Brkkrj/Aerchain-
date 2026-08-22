import { NextResponse } from "next/server";
import { getBotUsername, getRequirement, getVendorLinkToken, isVendorLinked } from "@/server/store";
import { botDeepLink } from "@/lib/telegram";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requirement = await getRequirement(id);
  if (!requirement) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const username = await getBotUsername();
  const links = await Promise.all(
    requirement.shortlistedVendorIds.map(async (vendorId) => ({
      vendorId,
      linked: await isVendorLinked(vendorId),
      link: username ? botDeepLink(username, getVendorLinkToken(vendorId, id)) : null,
    }))
  );
  return NextResponse.json({ configured: !!username, links });
}
