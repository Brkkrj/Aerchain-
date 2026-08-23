// Design language — see TECH_DESIGN.md / Design_Brief_BK.docx
import { Requirement } from "./types";

export const colors = {
  charcoal: "#231F20",
  coral: "#EF5433",
  white: "#FFFFFF",
  bg: "#F7F7F5",
  textSecondary: "#666666",
  border: "#E6E6E6",
  success: "#0B7A52",
  successBg: "#ECF7F1",
  successBorder: "#BFE3D0",
  warning: "#B45309",
  warningBg: "#FEF3C7",
  warningBorder: "#FDE68A",
  danger: "#B42318",
  dangerBg: "#FEF0EE",
  grey: "#666666",
  greyBg: "#F0F0EE",
  greyBorder: "#E6E6E6",
  blue: "#1D4ED8",
  blueBg: "#EAF1FF",
  blueBorder: "#CBDBFB",
  coralBg: "#FDEDE9",
  coralBorder: "#F6C9BC",
};

export const font = "'Inter', system-ui, sans-serif";

export const statusTag: Record<string, { fg: string; bg: string; bd: string }> = {
  draft: { fg: colors.textSecondary, bg: "#F0F0EE", bd: colors.border },
  sent_to_vendor: { fg: colors.warning, bg: colors.warningBg, bd: colors.warningBorder },
  rate_received: { fg: colors.blue, bg: colors.blueBg, bd: colors.blueBorder },
  ready_to_compare: { fg: colors.coral, bg: colors.coralBg, bd: colors.coralBorder },
  closed_deal: { fg: colors.success, bg: colors.successBg, bd: colors.successBorder },
  cancelled: { fg: colors.danger, bg: colors.dangerBg, bd: "#F3C6C0" },
};

export const statusLabel: Record<string, string> = {
  draft: "Draft",
  sent_to_vendor: "Waiting for Quotes",
  rate_received: "Partially Received",
  ready_to_compare: "Ready to Compare",
  closed_deal: "Closed",
  cancelled: "Cancelled",
};

// Requirement.status only has 5 DB values; "rate_received" covers both "some rates in" and
// "every shortlisted vendor has replied" — this splits that one DB status into the two distinct
// list-view states the design calls for (Partially Received vs Ready to Compare) without a
// schema change.
export function displayStatusKey(r: Requirement): string {
  if (r.status !== "rate_received") return r.status;
  const responded = new Set(r.offers.map((o) => o.vendorId)).size;
  const total = r.shortlistedVendorIds.length;
  return total > 0 && responded >= total ? "ready_to_compare" : "rate_received";
}
