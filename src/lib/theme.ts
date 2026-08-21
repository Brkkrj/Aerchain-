// Design language — see TECH_DESIGN.md / Design_Brief_BK.docx
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
};

export const font = "'Inter', system-ui, sans-serif";

export const statusTag: Record<string, { fg: string; bg: string; bd: string }> = {
  draft: { fg: colors.textSecondary, bg: "#F0F0EE", bd: colors.border },
  sent_to_vendor: { fg: colors.textSecondary, bg: "#F0F0EE", bd: colors.border },
  rate_received: { fg: colors.warning, bg: colors.warningBg, bd: colors.warningBorder },
  closed_deal: { fg: colors.success, bg: colors.successBg, bd: colors.successBorder },
  cancelled: { fg: colors.danger, bg: colors.dangerBg, bd: "#F3C6C0" },
};

export const statusLabel: Record<string, string> = {
  draft: "Draft",
  sent_to_vendor: "Sent to Vendor",
  rate_received: "Rate Received",
  closed_deal: "Closed Deal",
  cancelled: "Cancelled",
};
