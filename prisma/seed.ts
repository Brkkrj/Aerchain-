// Seeds the demo fixtures the app has always used — kept as labeled demo/seed data per project
// decision. Safe to re-run: only ever adds missing rows, never overwrites real edits (e.g. a
// buyer profile edited through the app, or requirements/offers created by real use).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DUMMY_EMAIL = "brkkrj@gmail.com";
const DUMMY_PHONE = "9654600676";
const ALT_PHONE = "8006604235";

async function main() {
  const existingBuyer = await prisma.buyer.findFirst();
  if (!existingBuyer) {
    await prisma.buyer.create({
      data: {
        name: "Ramesh Murthy",
        billingAddress: "No. 142, 3rd Floor, Sampige Road, Malleswaram, Bangalore 560003",
        siteAddress: "Plot 7, Yeshwantpur Industrial Suburb, Bangalore 560022",
      },
    });
  }

  const vendors = [
    { id: "V1", name: "Mahalaxmi Building Materials", suppliesCategories: ["Aggregate", "Cement", "Sand"], serviceLocations: ["Bangalore"], capacityUomPerMonth: 100, dealsLast30Days: 45, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
    { id: "V2", name: "Patel Traders", suppliesCategories: ["Aggregate", "TMT Bars"], serviceLocations: ["Delhi"], capacityUomPerMonth: 150, dealsLast30Days: 20, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
    { id: "V3", name: "Ganesh Enterprises", suppliesCategories: ["Aggregate", "Cement", "M-Sand"], serviceLocations: ["Bangalore"], capacityUomPerMonth: 500, dealsLast30Days: 50, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
    { id: "V4", name: "Sri Ranga Aggregates", suppliesCategories: ["Aggregate"], serviceLocations: ["Pune"], capacityUomPerMonth: 80, dealsLast30Days: 15, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: ALT_PHONE },
    { id: "V5", name: "Shah Steels", suppliesCategories: ["TMT Bars"], serviceLocations: ["Delhi"], capacityUomPerMonth: 200, dealsLast30Days: 30, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
    { id: "V6", name: "Sree Cements", suppliesCategories: ["Cement"], serviceLocations: ["Pune"], capacityUomPerMonth: 300, dealsLast30Days: 18, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
    { id: "V7", name: "Deccan Bricks & Blocks", suppliesCategories: ["Bricks"], serviceLocations: ["Pune"], capacityUomPerMonth: 50, dealsLast30Days: 5, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
    { id: "V8", name: "Reliable RMC Suppliers", suppliesCategories: ["RMC", "Cement"], serviceLocations: ["Delhi"], capacityUomPerMonth: 250, dealsLast30Days: 22, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
    { id: "V9", name: "Metro Tiles & Sanitaryware", suppliesCategories: ["Tiles"], serviceLocations: ["Bangalore"], capacityUomPerMonth: 400, dealsLast30Days: 12, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
    { id: "V10", name: "Shree Plywood House", suppliesCategories: ["Plywood", "Steel"], serviceLocations: ["Pune"], capacityUomPerMonth: 150, dealsLast30Days: 28, replyChannel: "telegram", email: DUMMY_EMAIL, telegramPhone: DUMMY_PHONE },
  ];
  for (const v of vendors) {
    await prisma.vendor.upsert({ where: { id: v.id }, update: v, create: v });
  }

  const requirements = [
    {
      id: "req-2402", code: "REQ-2402", itemCategory: "TMT Bars", itemName: "TMT Bars 12mm", itemGrade: "Tata",
      deliveryDate: "2026-08-21", siteAddress: "Whitefield, Bangalore", qty: 200, uom: "UOM",
      brandPreference: "Tata", summaryText: "You want TMT Bars 12mm (Tata) delivered to Whitefield, Bangalore, by 21 Aug 2026.",
      status: "rate_received", createdAt: new Date("2026-08-14T10:00:00Z"), shortlistedVendorIds: ["V5"],
      offers: [{ id: "off-2402-1", vendorId: "V5", rawSource: "Shah Steels reply", replyChannel: "email", sourceFormat: "pdf", rate: 58, rateBasis: "per UOM", brandOffered: "Tata", paymentTerms: "50% advance", transportIncluded: true, deliveryDate: "2026-08-22", capacityUom: 200, capacityLeadDays: 15, extractionConfidence: 0.94, missingFields: [], needsReview: false, receivedAt: new Date("2026-08-14T15:00:00Z") }],
    },
    {
      id: "req-2391", code: "REQ-2391", itemCategory: "Cement", itemName: "OPC 53 Cement", itemGrade: "UltraTech",
      deliveryDate: "2026-08-16", siteAddress: "Hosur Road, Bangalore", qty: 500, uom: "bags",
      brandPreference: "UltraTech", summaryText: "You want OPC 53 Cement (UltraTech) delivered to Hosur Road, Bangalore, by 16 Aug 2026.",
      status: "sent_to_vendor", createdAt: new Date("2026-08-09T09:00:00Z"), shortlistedVendorIds: ["V6"], offers: [],
    },
    {
      id: "req-2377", code: "REQ-2377", itemCategory: "Sand", itemName: "M-Sand", itemGrade: "Standard",
      deliveryDate: "2026-08-05", siteAddress: "Yeshwantpur, Bangalore", qty: 300, uom: "UOM",
      transportIncluded: true, summaryText: "You want M-Sand delivered to Yeshwantpur, Bangalore, by 5 Aug 2026.",
      status: "closed_deal", dealAmount: 96000, winningOfferId: "off-2377-1",
      createdAt: new Date("2026-08-02T09:00:00Z"), shortlistedVendorIds: ["V2"],
      offers: [{ id: "off-2377-1", vendorId: "V2", rawSource: "Vendor 2 reply", replyChannel: "telegram", sourceFormat: "plain_text", rate: 320, rateBasis: "per UOM", paymentTerms: "100% advance", transportIncluded: false, deliveryDate: "2026-08-06", capacityUom: 300, capacityLeadDays: 10, extractionConfidence: 0.9, missingFields: [], needsReview: false, receivedAt: new Date("2026-08-02T14:00:00Z") }],
    },
    {
      id: "req-2365", code: "REQ-2365", status: "draft", createdAt: new Date("2026-07-28T09:00:00Z"),
      shortlistedVendorIds: [], offers: [],
    },
  ];
  for (const r of requirements) {
    const { offers, ...reqData } = r;
    await prisma.requirement.upsert({
      where: { id: r.id },
      update: {},
      create: {
        ...reqData,
        offers: { create: offers },
      },
    });
  }

  await prisma.counter.upsert({ where: { name: "requirement_seq" }, update: {}, create: { name: "requirement_seq", value: 3000 } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
