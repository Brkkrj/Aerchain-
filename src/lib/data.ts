import { Buyer, Notification, Requirement, Vendor } from "./types";

export const BUYER: Buyer = {
  name: "Ramesh Murthy",
  billingAddress: "No. 142, 3rd Floor, Sampige Road, Malleswaram, Bangalore 560003",
  siteAddress: "Plot 7, Yeshwantpur Industrial Suburb, Bangalore 560022",
};

// Dummy contact info for this prototype — every vendor is reached over Telegram (email
// dispatch isn't a real channel here, so it's not offered as a reply path). Most vendors point
// at the same real number so you can play every vendor role while testing; one vendor uses a
// second real number so you can test two vendors replying independently at the same time.
const DUMMY_EMAIL = "brkkrj@gmail.com";
const DUMMY_PHONE = "9654600676";
const ALT_PHONE = "8006604235";

export const VENDORS: Vendor[] = [
  { id: "V1", name: "Vendor 1", suppliesCategories: ["Aggregate", "Cement", "Sand"], serviceLocations: ["Bangalore"], capacityUomPerMonth: 100, dealsLast30Days: 45, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
  { id: "V2", name: "Vendor 2", suppliesCategories: ["Aggregate", "TMT Bars"], serviceLocations: ["Bangalore"], capacityUomPerMonth: 150, dealsLast30Days: 20, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
  { id: "V3", name: "Vendor 3", suppliesCategories: ["Aggregate", "Cement", "M-Sand"], serviceLocations: ["Bangalore"], capacityUomPerMonth: 500, dealsLast30Days: 50, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
  { id: "V4", name: "Vendor 4", suppliesCategories: ["Aggregate"], serviceLocations: ["Bangalore"], capacityUomPerMonth: 80, dealsLast30Days: 15, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: ALT_PHONE },
  { id: "V5", name: "Shah Steels", suppliesCategories: ["TMT Bars"], serviceLocations: ["Bangalore"], capacityUomPerMonth: 200, dealsLast30Days: 30, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
  { id: "V6", name: "Sree Cements", suppliesCategories: ["Cement"], serviceLocations: ["Bangalore"], capacityUomPerMonth: 300, dealsLast30Days: 18, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
  { id: "V7", name: "Not a real match Co.", suppliesCategories: ["Bricks"], serviceLocations: ["Chennai"], capacityUomPerMonth: 50, dealsLast30Days: 5, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
];

// Raw "vendor reply" fixtures — four different formats, on purpose, to demo format-agnostic
// intake. These stand in for a PDF, an Excel export, a plain email, and a photographed rate
// card (per the assignment brief: PDF, Excel, plain email body, photographed rate card).
export const VENDOR_REPLY_FIXTURES: Record<string, { text: string; sourceFormat: Requirement["offers"][number]["sourceFormat"] }> = {
  V1: {
    sourceFormat: "pdf",
    text:
      "AMBUJA CEMENTS — AUTHORISED DEALER\nQUOTATION\n" +
      "Item: 10mm Aggregate (Ambuja)\n" +
      "Rate: Rs. 100 per UOM\n" +
      "Payment Terms: 30% advance, balance 70% within 30 days\n" +
      "Transport: Included\n" +
      "Delivery Date: 25 Aug 2026\n" +
      "Capacity: 100 UOM within 20 days",
  },
  V2: {
    sourceFormat: "excel",
    text:
      "Item | Rate | Payment | Transport | Delivery | Capacity\n" +
      "10mm Aggregate (Ambuja) | Rs.200/UOM | 100% Advance | Excluded | 26 Aug 2026 | 150 UOM in 30 days",
  },
  V3: {
    sourceFormat: "plain_text",
    text:
      "Hi, thanks for reaching out. We can do 10mm Ambuja aggregate at Rs 120 per unit. " +
      "Payment - 100% after 5 days of delivery. We'll handle transport ourselves, no extra charge. " +
      "Can deliver by 27 Aug 2026, and we can supply up to 500 UOM within 30 days if needed.",
  },
  V4: {
    sourceFormat: "image",
    text:
      "RATE CARD (photo, handwritten)\n" +
      "10mm Agg - amb..ja\n" +
      "Rate: Rs 140/uom\n" +
      "50% adv + 50% *15 days\n" +
      "xport: incl\n" +
      "cap: 80uom/10dy",
  },
};

export const OTHER_REQUIREMENTS: Requirement[] = [
  {
    id: "req-2402", code: "REQ-2402", itemCategory: "TMT Bars", itemName: "TMT Bars 12mm", itemGrade: "Tata",
    deliveryDate: "2026-08-21", siteAddress: "Whitefield, Bangalore", qty: 200, uom: "UOM",
    brandPreference: "Tata", paymentTerms: null, transportIncluded: null, siteCoordinator: null,
    summaryText: "You want TMT Bars 12mm (Tata) delivered to Whitefield, Bangalore, by 21 Aug 2026.",
    summaryEdited: false, status: "rate_received", dealAmount: null, winningOfferId: null,
    createdAt: "2026-08-14T10:00:00Z", messages: [], shortlistedVendorIds: ["V5"],
    offers: [{
      id: "off-2402-1", vendorId: "V5", requirementId: "req-2402", rawSource: "Shah Steels reply",
      replyChannel: "email", sourceFormat: "pdf", rate: 58, rateBasis: "per UOM", brandOffered: "Tata",
      paymentTerms: "50% advance", transportIncluded: true, deliveryDate: "2026-08-22",
      capacityUom: 200, capacityLeadDays: 15, extractionConfidence: 0.94, missingFields: [], needsReview: false,
      receivedAt: "2026-08-14T15:00:00Z",
    }],
  },
  {
    id: "req-2391", code: "REQ-2391", itemCategory: "Cement", itemName: "OPC 53 Cement", itemGrade: "UltraTech",
    deliveryDate: "2026-08-16", siteAddress: "Hosur Road, Bangalore", qty: 500, uom: "bags",
    brandPreference: "UltraTech", paymentTerms: null, transportIncluded: null, siteCoordinator: null,
    summaryText: "You want OPC 53 Cement (UltraTech) delivered to Hosur Road, Bangalore, by 16 Aug 2026.",
    summaryEdited: false, status: "sent_to_vendor", dealAmount: null, winningOfferId: null,
    createdAt: "2026-08-09T09:00:00Z", messages: [], shortlistedVendorIds: ["V6"], offers: [],
  },
  {
    id: "req-2377", code: "REQ-2377", itemCategory: "Sand", itemName: "M-Sand", itemGrade: "Standard",
    deliveryDate: "2026-08-05", siteAddress: "Yeshwantpur, Bangalore", qty: 300, uom: "UOM",
    brandPreference: null, paymentTerms: null, transportIncluded: true, siteCoordinator: null,
    summaryText: "You want M-Sand delivered to Yeshwantpur, Bangalore, by 5 Aug 2026.",
    summaryEdited: false, status: "closed_deal", dealAmount: 96000, winningOfferId: "off-2377-1",
    createdAt: "2026-08-02T09:00:00Z", messages: [], shortlistedVendorIds: ["V2"],
    offers: [{
      id: "off-2377-1", vendorId: "V2", requirementId: "req-2377", rawSource: "Vendor 2 reply",
      replyChannel: "telegram", sourceFormat: "plain_text", rate: 320, rateBasis: "per UOM", brandOffered: null,
      paymentTerms: "100% advance", transportIncluded: false, deliveryDate: "2026-08-06",
      capacityUom: 300, capacityLeadDays: 10, extractionConfidence: 0.9, missingFields: [], needsReview: false,
      receivedAt: "2026-08-02T14:00:00Z",
    }],
  },
  {
    id: "req-2365", code: "REQ-2365", itemCategory: null, itemName: null, itemGrade: null,
    deliveryDate: null, siteAddress: null, qty: null, uom: null,
    brandPreference: null, paymentTerms: null, transportIncluded: null, siteCoordinator: null,
    summaryText: null, summaryEdited: false, status: "draft", dealAmount: null, winningOfferId: null,
    createdAt: "2026-07-28T09:00:00Z", messages: [], shortlistedVendorIds: [], offers: [],
  },
];

export const INITIAL_NOTIFICATIONS: Notification[] = [];

let seq = 3000;
export function nextCode(): string {
  seq += 1;
  return `REQ-${seq}`;
}
