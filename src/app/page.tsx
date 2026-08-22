"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { Card, Container, PageTitle, PrimaryButton, Shell, StatusPill, Subtitle } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/aera";
import { statusLabel } from "@/lib/theme";
import { Requirement, Vendor } from "@/lib/types";

const STATUSES = ["all", "draft", "sent_to_vendor", "rate_received", "closed_deal", "cancelled"];
const CATEGORIES = ["all", "Aggregate", "Cement", "TMT Bars", "Sand"];
const DATE_RANGES: { value: "all" | "7" | "30" | "90"; label: string }[] = [
  { value: "all", label: "Any Date" },
  { value: "7", label: "Last 7 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "90", label: "This Quarter" },
];
const PAGE_SIZE = 10;

function vendorSummary(r: Requirement, vendorNameById: Record<string, string>): string {
  if (r.status === "closed_deal" && r.winningOfferId) {
    const offer = r.offers.find((o) => o.id === r.winningOfferId);
    return (offer && vendorNameById[offer.vendorId]) || "—";
  }
  if (r.status === "rate_received") {
    const responded = new Set(r.offers.map((o) => o.vendorId)).size;
    return `${responded} Responded`;
  }
  return "—";
}

export default function HomePage() {
  const router = useRouter();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [dateRange, setDateRange] = useState<"all" | "7" | "30" | "90">("all");
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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const columns = "0.9fr 0.9fr 1.4fr 1fr 1.3fr 0.9fr 1fr";

  return (
    <Shell>
      <Header />
      <Container style={{ maxWidth: 1240 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <PageTitle>Requirements</PageTitle>
            <Subtitle>Everything You Have Raised, Newest First.</Subtitle>
          </div>
          <PrimaryButton onClick={startNew} style={{ marginLeft: "auto" }}>
            New Requirement
          </PrimaryButton>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by Req ID, Item or Vendor Name"
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

        <Card style={{ overflow: "auto" }}>
          <div style={{ minWidth: 860 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: columns,
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                font: "600 12px/1 var(--font-inter), sans-serif",
                letterSpacing: "0.04em",
                color: "var(--text-secondary)",
              }}
            >
              <span>Req ID</span>
              <span>Date</span>
              <span>Item</span>
              <span>Vendor</span>
              <span>Address</span>
              <span>Amount</span>
              <span>Status</span>
            </div>
            {!loading && requirements.length === 0 && (
              <div style={{ padding: 32, textAlign: "center" }}>
                <p style={{ margin: 0, font: "400 14px/1.55 var(--font-inter), sans-serif", color: "var(--text-secondary)" }}>
                  Clear The Search Or Pick A Different Filter — Or Start Your First Requirement With Aera.
                </p>
              </div>
            )}
            {requirements.map((r, i) => (
              <div
                key={r.id}
                onClick={() => router.push(`/requirements/${r.id}`)}
                style={{
                  display: "grid",
                  gridTemplateColumns: columns,
                  padding: "16px 16px",
                  borderBottom: i < requirements.length - 1 ? "1px solid #EFEFED" : "none",
                  cursor: "pointer",
                  alignItems: "center",
                  font: "400 14px/1.3 var(--font-inter), sans-serif",
                  gap: 8,
                }}
              >
                <span style={{ fontWeight: 600 }}>{r.code}</span>
                <span style={{ color: "var(--text-secondary)" }}>{formatDate(r.createdAt.slice(0, 10))}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span>{r.itemName ?? "Not Sent Yet"}</span>
                  {(r.itemGrade || r.brandPreference) && (
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{r.itemGrade ?? r.brandPreference}</span>
                  )}
                </div>
                <span style={{ color: vendorSummary(r, vendorNameById) === "—" ? "var(--text-secondary)" : undefined }}>
                  {vendorSummary(r, vendorNameById)}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>{r.siteAddress ?? "—"}</span>
                <span>{r.dealAmount ? `₹${r.dealAmount.toLocaleString("en-IN")}` : "—"}</span>
                <span>
                  <StatusPill status={r.status} />
                </span>
              </div>
            ))}
          </div>
        </Card>

        {total > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 16 }}>
            <span style={{ font: "400 13px/1 var(--font-inter), sans-serif", color: "var(--text-secondary)" }}>
              Page {page} Of {totalPages} · {total} Total
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
