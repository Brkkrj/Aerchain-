// Seed/demo addresses only carry a city, never a state — this fills in the state for display
// (list table shows "City, State", never the full address) from the small set of cities the
// demo vendors/buyer actually use. Falls back to just the city when it's not a known one.
const CITY_STATE: Record<string, string> = {
  bangalore: "Karnataka",
  bengaluru: "Karnataka",
  pune: "Maharashtra",
  mumbai: "Maharashtra",
  delhi: "Delhi",
  "new delhi": "Delhi",
  chennai: "Tamil Nadu",
  hyderabad: "Telangana",
  ahmedabad: "Gujarat",
  kolkata: "West Bengal",
};

export function cityState(address: string | null): string {
  if (!address) return "—";
  // Strip a trailing pincode, split on commas, and take the last word-only segment as the city
  // (addresses read like "Plot 7, Yeshwantpur Industrial Suburb, Bangalore 560022").
  const cleaned = address.replace(/\b\d{6}\b\s*$/, "").trim();
  const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);
  const city = parts[parts.length - 1] ?? cleaned;
  const state = CITY_STATE[city.toLowerCase()];
  return state ? `${city}, ${state}` : city;
}
