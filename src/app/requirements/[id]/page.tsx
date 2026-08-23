"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import { BackLink, Card, Container, PageTitle, PrimaryButton, SecondaryButton, Shell, Subtitle } from "@/components/ui";
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
      <div style={{ padding: "24px 24px 0", maxWidth: 1080, margin: "0 auto" }}>
        <BackLink />
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

const LOADER_STAGES = [
  { heading: "Finding the right vendors…", subtext: "Aera is matching your requirement with the best-fit suppliers." },
  { heading: "Sending your RFQ…", subtext: "Almost there — getting vendors ready to quote." },
];

function ConfirmScreen({ req, onDone, router }: { req: Requirement; onDone: () => void; router: ReturnType<typeof useRouter> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(req.summaryText ?? "");
  const [loaderStage, setLoaderStage] = useState<0 | 1 | 2>(0);

  async function saveEdit() {
    await api.patchRequirement(req.id, { summaryText: draft });
    setEditing(false);
    onDone();
  }

  async function proceedAndSend() {
    setLoaderStage(1);
    const apiDone = api.confirm(req.id, "send");
    const stage2At = new Promise<void>((res) => setTimeout(res, 1200)).then(() => setLoaderStage(2));
    await Promise.all([apiDone, stage2At]);
    await new Promise((res) => setTimeout(res, 900));
    onDone();
  }

  async function saveDraft() {
    await api.confirm(req.id, "draft");
    router.push("/");
  }

  if (loaderStage > 0) {
    const stage = LOADER_STAGES[loaderStage - 1];
    return (
      <Container style={{ maxWidth: 480, textAlign: "center", paddingTop: 96 }}>
        <div
          style={{
            width: 40,
            height: 40,
            margin: "0 auto 20px",
            borderRadius: "50%",
            border: "3px solid var(--border)",
            borderTopColor: "var(--coral)",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
        <PageTitle>{stage.heading}</PageTitle>
        <Subtitle>{stage.subtext}</Subtitle>
      </Container>
    );
  }

  return (
    <Container style={{ maxWidth: 800, display: "flex", justifyContent: "center", flexDirection: "column", paddingTop: 20 }}>
      <PageTitle>Review your requirement</PageTitle>
      <Subtitle>Check the details before we send this to vendors.</Subtitle>
      <Card style={{ marginTop: 20, padding: 24 }}>
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ width: "100%", minHeight: 100, resize: "vertical", border: "1px solid var(--charcoal)", borderRadius: 10, padding: "14px 16px", font: "400 17px/1.55 var(--font-inter), sans-serif", outline: "none" }}
            />
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <PrimaryButton onClick={saveEdit}>Save</PrimaryButton>
              <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: 0, font: "400 17px/1.55 var(--font-inter), sans-serif" }}>{req.summaryText}</p>
            <div style={{ marginTop: 16 }}>
              <SecondaryButton onClick={() => setEditing(true)}>Edit</SecondaryButton>
            </div>
          </>
        )}
      </Card>
      <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
        <PrimaryButton onClick={proceedAndSend}>Send to Vendors</PrimaryButton>
        <SecondaryButton onClick={saveDraft}>Save as Draft</SecondaryButton>
      </div>
    </Container>
  );
}

function SentScreen({ req }: { req: Requirement; onDone: () => void }) {
  const router = useRouter();
  const total = req.shortlistedVendorIds.length;
  const replied = new Set(req.offers.map((o) => o.vendorId)).size;
  return (
    <Container style={{ maxWidth: 480, textAlign: "center", paddingTop: 56 }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--success-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
        <span style={{ font: "400 18px/1 var(--font-inter), sans-serif", color: "var(--success)" }}>✓</span>
      </div>
      <PageTitle>Your requirement is with the vendors.</PageTitle>
      <Subtitle>We&apos;ll notify you as soon as quotes start coming in.</Subtitle>
      <div style={{ marginTop: 14, display: "inline-block", background: "var(--white)", border: "1px solid var(--border)", borderRadius: 9, padding: "10px 16px" }}>
        <div style={{ font: "600 14px/1 var(--font-inter), sans-serif" }}>
          {replied} of {total} quote{total === 1 ? "" : "s"} received
        </div>
        <div style={{ font: "400 12px/1 var(--font-inter), sans-serif", color: "var(--text-secondary)", marginTop: 4 }}>
          Waiting for {total} vendor{total === 1 ? "" : "s"}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <SecondaryButton onClick={() => router.push("/")}>Back to Requirements</SecondaryButton>
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
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmedMsg, setConfirmedMsg] = useState(false);
  const bestId = ranking[0]?.offer.id;
  const bestRate = Math.min(...offers.filter((o) => o.rate != null).map((o) => o.rate as number));
  const earliest = offers
    .filter((o) => o.deliveryDate)
    .reduce((min, o) => (new Date(o.deliveryDate as string) < new Date(min) ? (o.deliveryDate as string) : min), offers[0]?.deliveryDate ?? "");

  async function confirmVendor(offerId: string) {
    setConfirming(offerId);
    await api.acceptOffer(req.id, offerId);
    setConfirming(null);
    setConfirmedMsg(true);
    await new Promise((res) => setTimeout(res, 1300));
    onDone();
  }

  if (confirmedMsg) {
    return (
      <Container style={{ maxWidth: 480, textAlign: "center", paddingTop: 96 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--success-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <span style={{ font: "400 18px/1 var(--font-inter), sans-serif", color: "var(--success)" }}>✓</span>
        </div>
        <PageTitle>Vendor confirmed</PageTitle>
        <Subtitle>We&apos;ve notified the vendor to prepare for delivery.</Subtitle>
      </Container>
    );
  }

  return (
    <Container style={{ maxWidth: 1080 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <PageTitle>Compare offers</PageTitle>
          <Subtitle>
            {req.code} · {req.itemName} — {offers.length} of {req.shortlistedVendorIds.length} vendors have replied.
            {req.siteAddress && <> · Delivering to {req.siteAddress}</>}
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
                  {selected === o.id && (
                    <span style={{ font: "600 11px/1 var(--font-inter), sans-serif", color: "var(--coral)", background: "#FDEDE9", padding: "3px 6px", borderRadius: 6, width: "fit-content" }}>
                      Vendor Selected
                    </span>
                  )}
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
                    <button
                      onClick={() => confirmVendor(o.id)}
                      disabled={confirming === o.id}
                      style={{ background: "var(--charcoal)", color: "var(--white)", border: "1px solid var(--charcoal)", borderRadius: 9, padding: "10px 14px", font: "600 13px/1 var(--font-inter), sans-serif", cursor: confirming === o.id ? "not-allowed" : "pointer", opacity: confirming === o.id ? 0.7 : 1 }}
                    >
                      {confirming === o.id ? "Confirming…" : "Confirm Vendor"}
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
  const others = offers.filter((o) => o.id !== req.winningOfferId);
  const facts = [
    { label: "Final Rate", value: winner?.rate != null ? `₹${winner.rate} / UOM` : "—" },
    { label: "Total Deal Value", value: req.dealAmount ? `₹${req.dealAmount.toLocaleString("en-IN")}` : "—" },
    { label: "Expected Delivery", value: winner?.deliveryDate ? formatDate(winner.deliveryDate) : "—" },
    { label: "Payment Terms", value: winner?.paymentTerms ?? "—" },
    { label: "Delivery Address", value: req.siteAddress ?? "—" },
  ];
  return (
    <Container style={{ maxWidth: 520, textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--success-bg)", display: "flex", alignItems: "center", justifyContent: "center", margin: "48px auto 20px" }}>
        <span style={{ font: "400 20px/1 var(--font-inter), sans-serif", color: "var(--success)" }}>✓</span>
      </div>
      <PageTitle>Vendor confirmed successfully</PageTitle>
      <Subtitle>{vendor?.name ?? "The vendor"} has been notified and is preparing for delivery.</Subtitle>
      <p style={{ margin: "6px 0 0", font: "400 14px/1.5 var(--font-inter), sans-serif", color: "var(--text-secondary)" }}>
        Your requirement {req.code} is now marked as closed.
      </p>
      <Card style={{ marginTop: 24, textAlign: "left", overflow: "hidden" }}>
        {facts.map((f, i) => (
          <div key={f.label} style={{ padding: "16px 20px", borderBottom: i < facts.length - 1 ? "1px solid #EFEFED" : "none", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>{f.label}</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{f.value}</span>
          </div>
        ))}
      </Card>

      {others.length > 0 && (
        <Card style={{ marginTop: 16, textAlign: "left", overflow: "hidden" }}>
          {others.map((o, i) => {
            const v = vendors.find((x) => x.id === o.vendorId);
            return (
              <div key={o.id} style={{ padding: "12px 20px", borderBottom: i < others.length - 1 ? "1px solid #EFEFED" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14 }}>{v?.name ?? o.vendorId}</span>
                <span style={{ font: "600 11px/1 var(--font-inter), sans-serif", color: "var(--text-secondary)", background: "var(--bg)", border: "1px solid var(--border)", padding: "4px 8px", borderRadius: 6 }}>
                  Not Selected
                </span>
              </div>
            );
          })}
        </Card>
      )}

      <p style={{ marginTop: 20, font: "400 13px/1.5 var(--font-inter), sans-serif", color: "var(--text-secondary)" }}>
        Everything is confirmed. We&apos;ll keep you updated on the delivery status.
      </p>
    </Container>
  );
}
