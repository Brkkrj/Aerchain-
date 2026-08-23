"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { BackLink, Shell } from "@/components/ui";
import { api } from "@/lib/api";

interface ChatMsg {
  who: "you" | "aera";
  text: string;
}

// Covers all 5 mandatory fields (category, item, grade, delivery date, site address) plus a
// couple of optional ones (qty/uom, payment terms, transport) in one message, so sending it as-is
// demonstrates the single-shot path straight to the confirm screen; editing it demonstrates the
// multi-turn one.
const SAMPLE_MESSAGE = "Need 500 UOM of 10mm Aggregate, Ambuja grade, at Yeshwantpur, Bangalore by 30 Aug. 50% advance, transport included.";

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
      <div style={{ padding: "24px 24px 0" }}>
        <BackLink />
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 16px" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 720,
            display: "flex",
            flexDirection: "column",
            background: "var(--white)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            maxHeight: "calc(100vh - 100px)",
          }}
        >
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--charcoal)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "700 11px var(--font-inter), sans-serif",
                color: "var(--coral)",
              }}
            >
              Ae
            </div>
            <div>
              <div style={{ font: "600 13px/1.15 var(--font-inter), sans-serif" }}>Aera</div>
              <div style={{ font: "400 12px/1.2 var(--font-inter), sans-serif", color: "var(--success)" }}>Online</div>
            </div>
          </div>

          <div ref={boxRef} style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 14, overflow: "auto", maxHeight: 340, minHeight: 160 }}>
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
                      ? { maxWidth: "76%", background: "var(--charcoal)", color: "var(--white)", borderRadius: "14px 14px 14px 4px", padding: "13px 16px", font: "400 14px/1.55 var(--font-inter), sans-serif", wordBreak: "break-word" }
                      : { maxWidth: "76%", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--charcoal)", borderRadius: "14px 14px 4px 14px", padding: "13px 16px", font: "400 14px/1.55 var(--font-inter), sans-serif", wordBreak: "break-word" }
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

          <div style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "flex-end", flex: "none" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="What do you need to procure?"
              rows={2}
              style={{
                flex: 1,
                minWidth: 0,
                resize: "none",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "10px 14px",
                font: "400 14px/1.4 var(--font-inter), sans-serif",
                outline: "none",
                wordBreak: "break-word",
              }}
            />
            {ready ? (
              <button
                onClick={goToConfirm}
                style={{
                  flex: "none",
                  height: 42,
                  background: "var(--charcoal)",
                  color: "var(--white)",
                  border: "none",
                  borderRadius: 9,
                  padding: "0 18px",
                  font: "600 14px/1 var(--font-inter), sans-serif",
                  cursor: "pointer",
                }}
              >
                Review Requirement
              </button>
            ) : (
              <button
                onClick={() => send(input)}
                style={{
                  flex: "none",
                  height: 42,
                  background: "var(--charcoal)",
                  color: "var(--white)",
                  border: "none",
                  borderRadius: 9,
                  padding: "0 18px",
                  font: "600 14px/1 var(--font-inter), sans-serif",
                  cursor: "pointer",
                }}
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
