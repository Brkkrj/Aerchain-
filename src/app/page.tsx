"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { Card, Container, PageTitle, PrimaryButton, Shell, StatusPill, Subtitle } from "@/components/ui";
import { api } from "@/lib/api";
import { Requirement } from "@/lib/types";

const STATUSES = ["all", "draft", "sent_to_vendor", "rate_received", "closed_deal", "cancelled"];
const CATEGORIES = ["all", "Aggregate", "Cement", "TMT Bars", "Sand"];

export default function HomePage() {
  const router = useRouter();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);

  async function load() {
    const { requirements } = await api.listRequirements({ q, status, category, sort });
    setRequirements(requirements);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, category, sort]);

  // Vendor replies (and any status change) can land at any time via Telegram/email — poll so
  // the list reflects them without the buyer needing to manually refresh or touch a filter.
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, category, sort]);

  async function startNew() {
    router.push("/requirements/new");
  }

  return (
    <Shell>
      <Header />
      <Container>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <PageTitle>Requirements</PageTitle>
            <Subtitle>Everything you have raised, newest first.</Subtitle>
          </div>
          <PrimaryButton onClick={startNew} style={{ marginLeft: "auto" }}>
            New requirement
          </PrimaryButton>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by Req ID, item or vendor name"
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
                {s === "all" ? "All statuses" : s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All items" : c}
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
            {sort === "desc" ? "Latest first ↓" : "Oldest first ↑"}
          </button>
        </div>

        <Card style={{ overflow: "auto" }}>
          <div style={{ minWidth: 640 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr 2fr 1fr 1fr",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              font: "600 12px/1 var(--font-inter), sans-serif",
              letterSpacing: "0.04em",
              color: "var(--text-secondary)",
            }}
          >
            <span>REQ ID</span>
            <span>DATE</span>
            <span>ITEM</span>
            <span>DEAL AMOUNT</span>
            <span>STATUS</span>
          </div>
          {!loading && requirements.length === 0 && (
            <div style={{ padding: 32, textAlign: "center" }}>
              <p style={{ margin: 0, font: "400 14px/1.55 var(--font-inter), sans-serif", color: "var(--text-secondary)" }}>
                Clear the search or pick a different filter — or start your first requirement with Aera.
              </p>
            </div>
          )}
          {requirements.map((r, i) => (
            <div
              key={r.id}
              onClick={() => router.push(`/requirements/${r.id}`)}
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 1fr 2fr 1fr 1fr",
                padding: "16px 16px",
                borderBottom: i < requirements.length - 1 ? "1px solid #EFEFED" : "none",
                cursor: "pointer",
                alignItems: "center",
                font: "400 14px/1.3 var(--font-inter), sans-serif",
              }}
            >
              <span style={{ fontWeight: 600 }}>{r.code}</span>
              <span style={{ color: "var(--text-secondary)" }}>{r.createdAt.slice(0, 10)}</span>
              <span>
                {r.itemName ?? "Not sent yet"}
                {r.siteAddress ? <span style={{ color: "var(--text-secondary)" }}> · {r.siteAddress}</span> : null}
              </span>
              <span>{r.dealAmount ? `₹${r.dealAmount.toLocaleString("en-IN")}` : "—"}</span>
              <span>
                <StatusPill status={r.status} />
              </span>
            </div>
          ))}
          </div>
        </Card>
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
