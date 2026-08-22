export type RequirementStatus =
  | "draft"
  | "sent_to_vendor"
  | "rate_received"
  | "closed_deal"
  | "cancelled";

export type ReplyChannel = "email" | "telegram";
export type SourceFormat = "pdf" | "excel" | "image" | "plain_text";

export interface Vendor {
  id: string;
  name: string;
  suppliesCategories: string[];
  serviceLocations: string[];
  capacityUomPerMonth: number;
  dealsLast30Days: number;
  replyChannel: ReplyChannel;
  email: string;
  telegramPhone: string;
}

export interface DispatchLogEntry {
  id: string;
  requirementId: string;
  vendorId: string;
  channel: ReplyChannel;
  to: string; // email address or phone number this went "to"
  message: string;
  delivered: boolean; // true only for a channel that genuinely sent something
  sentAt: string;
}

export interface Offer {
  id: string;
  vendorId: string;
  requirementId: string;
  rawSource: string;
  replyChannel: ReplyChannel;
  sourceFormat: SourceFormat;
  rate: number | null;
  rateBasis: string | null;
  brandOffered: string | null;
  paymentTerms: string | null;
  transportIncluded: boolean | null;
  deliveryDate: string | null;
  capacityUom: number | null;
  capacityLeadDays: number | null;
  extractionConfidence: number;
  missingFields: string[];
  needsReview: boolean;
  receivedAt: string;
}

export interface Message {
  id: string;
  sender: "buyer" | "aera";
  text: string;
  createdAt: string;
}

export interface Requirement {
  id: string;
  code: string;
  itemCategory: string | null;
  itemName: string | null;
  itemGrade: string | null;
  deliveryDate: string | null;
  siteAddress: string | null;
  qty: number | null;
  uom: string | null;
  brandPreference: string | null;
  paymentTerms: string | null;
  transportIncluded: boolean | null;
  siteCoordinator: string | null;
  summaryText: string | null;
  summaryEdited: boolean;
  status: RequirementStatus;
  dealAmount: number | null;
  winningOfferId: string | null;
  createdAt: string;
  messages: Message[];
  offers: Offer[];
  shortlistedVendorIds: string[];
}

export interface Notification {
  id: string;
  requirementId: string;
  text: string;
  meta: string;
  read: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  requirementId: string;
  actor: "buyer" | "aera" | "system";
  action: string;
  detail: string;
  createdAt: string;
}

export interface Buyer {
  name: string;
  billingAddress: string;
  siteAddress: string;
}

export const MANDATORY_FIELDS = [
  "itemCategory",
  "itemName",
  "itemGrade",
  "deliveryDate",
  "siteAddress",
] as const;
