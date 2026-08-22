"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { Shell } from "@/components/ui";
import { api } from "@/lib/api";

interface ChatMsg {
  who: "you" | "aera";
  text: string;
}

// Covers all 5 mandatory fields (category, item, grade, delivery date, site address) plus a
// couple of optional ones (qty/uom, payment terms, transport) in one message, so sending it as-is
// demonstrates the single-shot path straight to the confirm screen; editing it demonstrates the
// multi-turn one.
const SAMPLE_MESSAGE =
  "I need 10mm Aggregate, Ambuja grade, 500 UOM, delivered to Plot 7, Yeshwantpur Industrial Suburb, " +
  "Bangalore 560022, by 30th August 2026. Payment terms: 50% advance, transport should be included.";

export default function NewRequirementPage() {
  const router = useRouter();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState(SAMPLE_MESSAGE);
  const [thinking, setThinking] = useState(false);
  const [requirementId, setRequirementId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  function scrollDown() {
    setTimeout(() => boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" }), 50);
  }

  async function send(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { who: "you", text }]);
    setInput("");
    setThinking(true);
    scrollDown();
    try {
      if (!requirementId) {
        const { requirement, reply, isComplete } = await api.createRequirement(text);
        setRequirementId(requirement.id);
        setMsgs((m) => [...m, { who: "aera", text: reply }]);
        setReady(isComplete);
      } else {
        const { reply, isComplete } = await api.postMessage(requirementId, text);
        setMsgs((m) => [...m, { who: "aera", text: reply }]);
        setReady(isComplete);
      }
    } finally {
      setThinking(false);
      scrollDown();
    }
  }

  function goToConfirm() {
    if (requirementId) router.push(`/requirements/${requirementId}`);
  }

  return (
    <Shell>
      <Header />
      <div style={{ minHeight: "calc(100vh - 63px)", display: "flex", justifyContent: "center", padding: "0" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 760,
            display: "flex",
            flexDirection: "column",
            background: "var(--white)",
            borderLeft: "1px solid var(--border)",
            borderRight: "1px solid var(--border)",
          }}
        >
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--charcoal)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "700 12px var(--font-inter), sans-serif",
                color: "var(--coral)",
              }}
            >
              Ae
            </div>
            <div>
              <div style={{ font: "600 14px/1.15 var(--font-inter), sans-serif" }}>Aera</div>
              <div style={{ font: "400 13px/1.2 var(--font-inter), sans-serif", color: "var(--success)" }}>Online</div>
            </div>
          </div>

          <div ref={boxRef} style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 16, overflow: "auto", maxHeight: 480, minHeight: 320 }}>
            {msgs.length === 0 && (
              <div style={{ color: "var(--text-secondary)", font: "400 14px/1.5 var(--font-inter), sans-serif" }}>
                Tell Aera what you need to buy.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={m.who === "aera" ? { display: "flex", gap: 10, alignItems: "flex-end" } : { display: "flex", justifyContent: "flex-end" }}>
                <div
                  style={
                    m.who === "aera"
                      ? { maxWidth: "76%", background: "var(--charcoal)", color: "var(--white)", borderRadius: "14px 14px 14px 4px", padding: "13px 16px", font: "400 14px/1.55 var(--font-inter), sans-serif" }
                      : { maxWidth: "76%", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--charcoal)", borderRadius: "14px 14px 4px 14px", padding: "13px 16px", font: "400 14px/1.55 var(--font-inter), sans-serif" }
                  }
                >
                  {m.text}
                </div>
              </div>
            ))}
            {thinking && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div style={{ background: "var(--charcoal)", color: "var(--white)", borderRadius: "14px 14px 14px 4px", padding: "13px 16px", font: "400 14px/1.55 var(--font-inter), sans-serif" }}>
                  Aera is thinking…
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: 20, borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="Type a message…"
              style={{
                flex: 1,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "12px 16px",
                font: "400 14px/1 var(--font-inter), sans-serif",
                outline: "none",
              }}
            />
            {ready ? (
              <button
                onClick={goToConfirm}
                style={{ background: "var(--charcoal)", color: "var(--white)", border: "none", borderRadius: 10, padding: "0 20px", font: "600 14px/1 var(--font-inter), sans-serif", cursor: "pointer" }}
              >
                Review requirement
              </button>
            ) : (
              <button
                onClick={() => send(input)}
                style={{ background: "var(--charcoal)", color: "var(--white)", border: "none", borderRadius: 10, padding: "0 20px", font: "600 14px/1 var(--font-inter), sans-serif", cursor: "pointer" }}
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
