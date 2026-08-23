"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { Card, Container, PageTitle, PrimaryButton, Shell, StatusPill, Subtitle } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/aera";
import { cityState } from "@/lib/location";
import { statusLabel } from "@/lib/theme";
import { Requirement, Vendor } from "@/lib/types";

const STATUSES = ["all", "draft", "sent_to_vendor", "rate_received", "closed_deal", "cancelled"];
const CATEGORIES = ["all", "Aggregate", "Cement", "TMT Bars", "Sand", "Bricks", "Steel", "Tiles", "Plywood", "Paint", "RMC"];
const DATE_RANGES: { value: "all" | "1" | "3" | "30" | "90"; label: string }[] = [
  { value: "all", label: "Any Date" },
  { value: "1", label: "Today" },
  { value: "3", label: "Last 3 Days" },
  { value: "30", label: "Last Month" },
  { value: "90", label: "This Quarter" },
];
const PAGE_SIZE = 10;
const COLUMNS = "0.75fr 0.95fr 1.6fr 1.6fr 1.1fr 0.9fr 1.1fr 18px";

function formatDatePart(iso: string): string {
  return formatDate(iso.slice(0, 10));
}

function formatTimePart(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

function requirementSubtext(r: Requirement): string | null {
  const brand = r.itemGrade ?? r.brandPreference;
  const qty = r.qty && r.uom ? `${r.qty} ${r.uom}` : null;
  return [brand, qty].filter(Boolean).join(" · ") || null;
}

function TruncatedName({ name, maxWidth = 150, title }: { name: string; maxWidth?: number; title?: string }) {
  return (
    <span
      title={title ?? name}
      style={{ display: "block", maxWidth, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >
      {name}
    </span>
  );
}

function VendorCell({ r, vendorNameById }: { r: Requirement; vendorNameById: Record<string, string> }) {
  if (r.status === "closed_deal") {
    const offer = r.offers.find((o) => o.id === r.winningOfferId);
    const name = (offer && vendorNameById[offer.vendorId]) || "—";
    return <TruncatedName name={name} maxWidth={200} />;
  }
  const shortlisted = r.shortlistedVendorIds;
  if (shortlisted.length === 0) {
    return <span style={{ color: "var(--text-secondary)" }}>Not sent yet</span>;
  }
  const firstName = vendorNameById[shortlisted[0]] ?? "—";
  const extra = shortlisted.length - 1;
  const responded = new Set(r.offers.map((o) => o.vendorId)).size;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 0 }}>
        <TruncatedName name={firstName} />
        {extra > 0 && <span style={{ flex: "none", fontWeight: 600, fontSize: 13 }}>+{extra}</span>}
      </div>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        {responded} / {shortlisted.length} responses received
      </span>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [dateRange, setDateRange] = useState<"all" | "1" | "3" | "30" | "90">("all");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { requirements, total } = await api.listRequirements({ q, status, category, sort, dateRange, page, pageSize: PAGE_SIZE });
    setRequirements(requirements);
    setTotal(total);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, category, sort, dateRange, page]);

  // Reset to page 1 whenever a filter changes, so the buyer isn't stranded on a now-empty page.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, category, sort, dateRange]);

  useEffect(() => {
    api.getVendors().then(({ vendors }) => setVendors(vendors));
  }, []);

  // Vendor replies (and any status change) can land at any time via Telegram/email — poll so
  // the list reflects them without the buyer needing to manually refresh or touch a filter.
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, category, sort, dateRange, page]);

  async function startNew() {
    router.push("/requirements/new");
  }

  const vendorNameById = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Shell>
      <Header />
      <Container style={{ maxWidth: 1180, padding: "24px 24px 40px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <PageTitle>Requirements</PageTitle>
            <Subtitle>Track your sourcing requests, vendor responses and closed deals.</Subtitle>
          </div>
          <PrimaryButton
            onClick={startNew}
            style={{
              marginLeft: "auto",
              height: 42,
              padding: "0 18px",
              borderRadius: 8,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            + New Requirement
          </PrimaryButton>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by Request ID, item or vendor"
            style={{
              flex: "1 1 240px",
              minWidth: 200,
              background: "var(--white)",
              border: "1px solid var(--border)",
              borderRadius: 9,
              padding: "10px 14px",
              font: "400 14px/1 var(--font-inter), sans-serif",
              outline: "none",
            }}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All Statuses" : statusLabel[s]}
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All Items" : c}
              </option>
            ))}
          </select>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value as typeof dateRange)} style={selectStyle}>
            {DATE_RANGES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSort((s) => (s === "desc" ? "asc" : "desc"))}
            style={{
              background: "var(--white)",
              border: "1px solid var(--border)",
              borderRadius: 9,
              padding: "10px 14px",
              font: "500 14px/1 var(--font-inter), sans-serif",
              cursor: "pointer",
            }}
          >
            {sort === "desc" ? "Latest First ↓" : "Oldest First ↑"}
          </button>
        </div>

        <Card>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: COLUMNS,
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              font: "600 12px/1 var(--font-inter), sans-serif",
              letterSpacing: "0.04em",
              color: "var(--text-secondary)",
              gap: 8,
            }}
          >
            <span>Request ID</span>
            <span>Date</span>
            <span>Requirement</span>
            <span>Vendor / Responses</span>
            <span>Location</span>
            <span>Deal Amount</span>
            <span>Status</span>
            <span />
          </div>
          {!loading && requirements.length === 0 && (
            <div style={{ padding: 32, textAlign: "center" }}>
              <p style={{ margin: 0, font: "400 14px/1.55 var(--font-inter), sans-serif", color: "var(--text-secondary)" }}>
                No items found.
              </p>
            </div>
          )}
          {requirements.map((r, i) => (
            <div
              key={r.id}
              className="req-row"
              onClick={() => router.push(`/requirements/${r.id}`)}
              style={{
                display: "grid",
                gridTemplateColumns: COLUMNS,
                padding: "14px 16px",
                borderBottom: i < requirements.length - 1 ? "1px solid #EFEFED" : "none",
                alignItems: "center",
                font: "400 14px/1.3 var(--font-inter), sans-serif",
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 600 }}>{r.code}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "500 13px/1.2 var(--font-inter), sans-serif" }}>{formatDatePart(r.createdAt)}</span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{formatTimePart(r.createdAt)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <TruncatedName name={r.itemName ?? "Not Sent Yet"} maxWidth={220} />
                {requirementSubtext(r) && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{requirementSubtext(r)}</span>}
              </div>
              <VendorCell r={r} vendorNameById={vendorNameById} />
              <span style={{ color: "var(--text-secondary)" }}>{cityState(r.siteAddress)}</span>
              <span>{r.dealAmount ? `₹${r.dealAmount.toLocaleString("en-IN")}` : "—"}</span>
              <span>
                <StatusPill requirement={r} />
              </span>
              <span className="req-row-arrow" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
                →
              </span>
            </div>
          ))}
        </Card>

        {total > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 14 }}>
            <span style={{ font: "400 13px/1 var(--font-inter), sans-serif", color: "var(--text-secondary)" }}>
              {rangeStart}–{rangeEnd} of {total}
            </span>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{ ...pageButtonStyle, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "not-allowed" : "pointer" }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{ ...pageButtonStyle, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? "not-allowed" : "pointer" }}
            >
              Next
            </button>
          </div>
        )}
      </Container>
    </Shell>
  );
}

const selectStyle = {
  background: "var(--white)",
  border: "1px solid var(--border)",
  borderRadius: 9,
  padding: "10px 14px",
  font: "400 14px/1 var(--font-inter), sans-serif",
  outline: "none",
} as const;

const pageButtonStyle = {
  background: "var(--white)",
  border: "1px solid var(--border)",
  borderRadius: 9,
  padding: "8px 14px",
  font: "600 13px/1 var(--font-inter), sans-serif",
} as const;
