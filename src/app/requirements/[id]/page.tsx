"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import { Card, Container, PageTitle, PrimaryButton, SecondaryButton, Shell, StatusPill, Subtitle } from "@/components/ui";
import { api } from "@/lib/api";
import { Offer, Requirement, Vendor } from "@/lib/types";
import { formatDate } from "@/lib/aera";

export default function RequirementPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [req, setReq] = useState<Requirement | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [ranking, setRanking] = useState<{ offer: Offer; score: number }[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { requirement } = await api.getRequirement(id);
    setReq(requirement);
    if (requirement.offers.length > 0 || requirement.status !== "draft") {
      const o = await api.listOffers(id);
      setOffers(o.offers);
      setRanking(o.ranking);
      setVendors(o.vendors);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Vendor replies over Telegram arrive asynchronously — poll while waiting so the screen
  // updates on its own when a real reply comes in, not just after a manual action.
  useEffect(() => {
    if (!req || req.status === "closed_deal" || req.status === "cancelled" || req.status === "draft") return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [req, load]);

  if (loading || !req) {
    return (
      <Shell>
        <Header />
        <Container>
          <Subtitle>Loading…</Subtitle>
        </Container>
      </Shell>
    );
  }

  return (
    <Shell>
      <Header />
      <div style={{ padding: "16px 24px 0", maxWidth: 1080, margin: "0 auto" }}>
        <SecondaryButton
          onClick={() => router.push("/")}
          style={{ border: "none", padding: 0, height: "auto", background: "none" }}
        >
          ← Requirements
        </SecondaryButton>
      </div>
      {req.status === "draft" && !req.summaryText && <ChatContinue req={req} onDone={load} />}
      {req.status === "draft" && req.summaryText && <ConfirmScreen req={req} onDone={load} router={router} />}
      {req.status === "sent_to_vendor" && <SentScreen req={req} onDone={load} />}
      {req.status === "rate_received" && (
        <CompareScreen req={req} offers={offers} ranking={ranking} vendors={vendors} onDone={load} />
      )}
      {req.status === "closed_deal" && <ClosedScreen req={req} offers={offers} vendors={vendors} />}
      {req.status === "cancelled" && (
        <Container>
          <PageTitle>Requirement cancelled</PageTitle>
          <Subtitle>{req.code} was cancelled with no vendor selected.</Subtitle>
        </Container>
      )}
    </Shell>
  );
}

function ChatContinue({ req, onDone }: { req: Requirement; onDone: () => void }) {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState(req.messages);
  const [thinking, setThinking] = useState(false);

  async function send() {
    if (!input.trim()) return;
    setMsgs((m) => [...m, { id: "tmp", sender: "buyer", text: input, createdAt: new Date().toISOString() }]);
    const text = input;
    setInput("");
    setThinking(true);
    const { reply, isComplete } = await api.postMessage(req.id, text);
    setMsgs((m) => [...m, { id: "tmp2", sender: "aera", text: reply, createdAt: new Date().toISOString() }]);
    setThinking(false);
    if (isComplete) onDone();
  }

  return (
    <Container style={{ maxWidth: 760 }}>
      <PageTitle>Continue with Aera</PageTitle>
      <Card style={{ marginTop: 16, padding: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ fontSize: 14 }}>
              <strong>{m.sender === "aera" ? "Aera: " : "You: "}</strong>
              {m.text}
            </div>
          ))}
          {thinking && <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>Aera is thinking…</div>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}
          />
          <PrimaryButton onClick={send}>Send</PrimaryButton>
        </div>
      </Card>
    </Container>
  );
}

function ConfirmScreen({ req, onDone, router }: { req: Requirement; onDone: () => void; router: ReturnType<typeof useRouter> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(req.summaryText ?? "");
  const [busy, setBusy] = useState(false);

  async function saveEdit() {
    await api.patchRequirement(req.id, { summaryText: draft });
    setEditing(false);
    onDone();
  }

  async function proceedAndSend() {
    setBusy(true);
    await api.confirm(req.id, "send");
    setBusy(false);
    onDone();
  }

  async function saveDraft() {
    await api.confirm(req.id, "draft");
    router.push("/");
  }

  return (
    <Container style={{ maxWidth: 640, display: "flex", justifyContent: "center", flexDirection: "column" }}>
      <PageTitle>Is this right?</PageTitle>
      <Subtitle>Here&apos;s what Aera understood.</Subtitle>
      <Card style={{ marginTop: 24, padding: "28px 28px 24px" }}>
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ width: "100%", minHeight: 110, resize: "vertical", border: "1px solid var(--charcoal)", borderRadius: 10, padding: "14px 16px", font: "400 18px/1.55 var(--font-inter), sans-serif", outline: "none" }}
            />
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <PrimaryButton onClick={saveEdit}>Save</PrimaryButton>
              <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: 0, font: "400 18px/1.55 var(--font-inter), sans-serif" }}>{req.summaryText}</p>
            <div style={{ marginTop: 16 }}>
              <SecondaryButton onClick={() => setEditing(true)}>Edit</SecondaryButton>
            </div>
          </>
        )}
      </Card>
      <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
        <PrimaryButton onClick={proceedAndSend} disabled={busy}>
          Proceed &amp; Send to Vendors
        </PrimaryButton>
        <SecondaryButton onClick={saveDraft}>Save as Draft</SecondaryButton>
      </div>
    </Container>
  );
}

function SentScreen({ req }: { req: Requirement; onDone: () => void }) {
  const total = req.shortlistedVendorIds.length;
  const replied = new Set(req.offers.map((o) => o.vendorId)).size;
  const remaining = Math.max(0, total - replied);
  return (
    <Container style={{ maxWidth: 640, textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--success-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "40px auto 20px" }}>
        <span style={{ font: "400 20px/1 var(--font-inter), sans-serif", color: "var(--success)" }}>✓</span>
      </div>
      <PageTitle>We&apos;ve sent the quote to vendors.</PageTitle>
      <Subtitle>Once we get the rates, we&apos;ll notify you. Nothing else to do here.</Subtitle>
      <div style={{ marginTop: 16, display: "inline-block", background: "var(--white)", border: "1px solid var(--border)", borderRadius: 9, padding: "10px 16px", font: "600 13px/1 var(--font-inter), sans-serif" }}>
        {replied} of {total} vendor{total === 1 ? "" : "s"} replied
        {remaining > 0 && <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}> · {remaining} remaining</span>}
      </div>
    </Container>
  );
}

function CompareScreen({
  req,
  offers,
  ranking,
  vendors,
  onDone,
}: {
  req: Requirement;
  offers: Offer[];
  ranking: { offer: Offer; score: number }[];
  vendors: Vendor[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const bestId = ranking[0]?.offer.id;
  const bestRate = Math.min(...offers.filter((o) => o.rate != null).map((o) => o.rate as number));
  const earliest = offers
    .filter((o) => o.deliveryDate)
    .reduce((min, o) => (new Date(o.deliveryDate as string) < new Date(min) ? (o.deliveryDate as string) : min), offers[0]?.deliveryDate ?? "");

  async function accept(offerId: string) {
    await api.acceptOffer(req.id, offerId);
    onDone();
  }

  return (
    <Container style={{ maxWidth: 1080 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <PageTitle>Compare offers</PageTitle>
          <Subtitle>
            {req.code} · {req.itemName} — {offers.length} of {req.shortlistedVendorIds.length} vendors have replied.
          </Subtitle>
        </div>
      </div>

      {bestId && (
        <Card style={{ padding: 16, marginBottom: 16, background: "var(--success-bg)", border: `1px solid var(--success-border)` }}>
          <span style={{ font: "600 13px/1 var(--font-inter), sans-serif", color: "var(--success)" }}>
            Aera&apos;s recommendation: {vendors.find((v) => v.id === offers.find((o) => o.id === bestId)?.vendorId)?.name} — best combination of rate,
            reliability, and delivery time.
          </span>
        </Card>
      )}

      <Card style={{ overflow: "auto" }}>
        <div style={{ minWidth: 900 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.3fr .9fr 1.5fr .9fr .9fr 1.2fr 1.3fr 1fr",
              padding: "12px 14px",
              borderBottom: "1px solid var(--border)",
              font: "600 12px/1.3 var(--font-inter), sans-serif",
              letterSpacing: "0.04em",
              color: "var(--text-secondary)",
            }}
          >
            <span>VENDOR</span>
            <span>RATE/UOM</span>
            <span>PAYMENT TERMS</span>
            <span>DEALS (30D)</span>
            <span>TRANSPORT</span>
            <span>CAPACITY/MONTH</span>
            <span>DELIVERY</span>
            <span></span>
          </div>
          {offers.map((o) => {
            const vendor = vendors.find((v) => v.id === o.vendorId);
            const isBest = o.rate === bestRate;
            const isEarliest = o.deliveryDate === earliest;
            const cellBest = { padding: "16px 14px", display: "flex", flexDirection: "column" as const, gap: 6, background: "#F3FAF6", color: "var(--success)" };
            const cell = { padding: "16px 14px", display: "flex", flexDirection: "column" as const, gap: 6 };
            return (
              <div
                key={o.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.3fr .9fr 1.5fr .9fr .9fr 1.2fr 1.3fr 1fr",
                  borderBottom: "1px solid #EFEFED",
                  background: selected === o.id ? "#FBFBFA" : "var(--white)",
                  alignItems: "center",
                }}
              >
                <div style={cell}>
                  <strong>{vendor?.name ?? o.vendorId}</strong>
                  {o.needsReview && (
                    <span style={{ font: "500 11px/1 var(--font-inter), sans-serif", color: "var(--warning)", background: "var(--warning-bg)", border: "1px solid var(--warning-border)", padding: "3px 6px", borderRadius: 6, width: "fit-content" }}>
                      Needs review
                    </span>
                  )}
                </div>
                <div style={isBest ? cellBest : cell}>{o.rate != null ? `₹${o.rate}` : <Missing />}</div>
                <div style={cell}>{o.paymentTerms ?? <Missing />}</div>
                <div style={cell}>{vendor?.dealsLast30Days ?? "—"}</div>
                <div style={cell}>
                  {o.transportIncluded === null ? (
                    <Missing />
                  ) : o.transportIncluded ? (
                    "Included"
                  ) : (
                    <span style={{ font: "500 13px/1 var(--font-inter), sans-serif", color: "var(--warning)", background: "var(--warning-bg)", border: "1px solid var(--warning-border)", padding: "5px 8px", borderRadius: 6 }}>Excluded</span>
                  )}
                </div>
                <div style={cell}>{vendor?.capacityUomPerMonth ? `${vendor.capacityUomPerMonth} UOM/month` : <Missing />}</div>
                <div style={isEarliest ? cellBest : cell}>
                  {o.deliveryDate ? `${formatDate(o.deliveryDate)}${o.capacityLeadDays ? ` (${o.capacityLeadDays} days)` : ""}` : <Missing />}
                </div>
                <div style={{ padding: "16px 14px" }}>
                  {selected === o.id ? (
                    <button onClick={() => accept(o.id)} style={{ background: "var(--charcoal)", color: "var(--white)", border: "1px solid var(--charcoal)", borderRadius: 9, padding: "10px 14px", font: "600 13px/1 var(--font-inter), sans-serif", cursor: "pointer" }}>
                      Accept
                    </button>
                  ) : (
                    <button onClick={() => setSelected(o.id)} style={{ background: "var(--white)", color: "var(--charcoal)", border: "1px solid var(--border)", borderRadius: 9, padding: "10px 14px", font: "600 13px/1 var(--font-inter), sans-serif", cursor: "pointer" }}>
                      Select
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </Container>
  );
}

function Missing() {
  return (
    <span style={{ font: "500 12px/1 var(--font-inter), sans-serif", color: "#B42318", background: "#FEF0EE", padding: "3px 7px", borderRadius: 6 }}>
      Missing
    </span>
  );
}

function ClosedScreen({ req, offers, vendors }: { req: Requirement; offers: Offer[]; vendors: Vendor[] }) {
  const winner = offers.find((o) => o.id === req.winningOfferId);
  const vendor = vendors.find((v) => v.id === winner?.vendorId);
  const facts = [
    { label: "Final rate", value: winner?.rate != null ? `₹${winner.rate} / UOM` : "—" },
    { label: "Deal amount", value: req.dealAmount ? `₹${req.dealAmount.toLocaleString("en-IN")}` : "—" },
    { label: "Delivery date", value: winner?.deliveryDate ? formatDate(winner.deliveryDate) : "—" },
    { label: "Payment terms", value: winner?.paymentTerms ?? "—" },
  ];
  return (
    <Container style={{ maxWidth: 520, textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--success-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "60px auto 20px" }}>
        <span style={{ font: "400 20px/1 var(--font-inter), sans-serif", color: "var(--success)" }}>✓</span>
      </div>
      <PageTitle>Deal closed with {vendor?.name ?? "vendor"}</PageTitle>
      <Subtitle>
        {vendor?.name} has been notified. {req.code} now shows as Closed Deal on your list.
      </Subtitle>
      <Card style={{ marginTop: 24, textAlign: "left", overflow: "hidden" }}>
        {facts.map((f, i) => (
          <div key={f.label} style={{ padding: "16px 20px", borderBottom: i < facts.length - 1 ? "1px solid #EFEFED" : "none", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>{f.label}</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{f.value}</span>
          </div>
        ))}
      </Card>
    </Container>
  );
}
