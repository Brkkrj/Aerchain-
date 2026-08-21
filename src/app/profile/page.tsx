"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { Card, Container, PrimaryButton, SecondaryButton, Shell } from "@/components/ui";
import { api } from "@/lib/api";
import { Buyer } from "@/lib/types";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Buyer | null>(null);
  const [editing, setEditing] = useState(false);
  const [billingDraft, setBillingDraft] = useState("");
  const [siteDraft, setSiteDraft] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getProfile().then(({ profile }) => setProfile(profile));
  }, []);

  if (!profile) return null;

  function startEdit() {
    setBillingDraft(profile!.billingAddress);
    setSiteDraft(profile!.siteAddress);
    setEditing(true);
    setSaved(false);
  }

  async function save() {
    const { profile: updated } = await api.updateProfile({ billingAddress: billingDraft, siteAddress: siteDraft });
    setProfile(updated);
    setEditing(false);
    setSaved(true);
  }

  return (
    <Shell>
      <Header />
      <Container style={{ maxWidth: 720, display: "flex", justifyContent: "center", flexDirection: "column" }}>
        <SecondaryButton onClick={() => router.push("/")} style={{ alignSelf: "flex-start", border: "none", padding: 0, height: "auto", background: "none" }}>
          ← Requirements
        </SecondaryButton>

        <Card style={{ marginTop: 16, overflow: "hidden" }}>
          <div style={{ padding: 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", borderBottom: "1px solid #EFEFED" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", font: "600 18px var(--font-inter), sans-serif" }}>
              RM
            </div>
            <div>
              <div style={{ font: "600 20px/1.25 var(--font-inter), sans-serif" }}>{profile.name}</div>
              <div style={{ font: "400 13px/1.3 var(--font-inter), sans-serif", color: "var(--text-secondary)" }}>Buyer</div>
            </div>
          </div>

          <div style={{ padding: 24 }}>
            {editing ? (
              <>
                <Field label="Billing address">
                  <textarea value={billingDraft} onChange={(e) => setBillingDraft(e.target.value)} style={fieldStyle} />
                </Field>
                <Field label="Site address">
                  <textarea value={siteDraft} onChange={(e) => setSiteDraft(e.target.value)} style={fieldStyle} />
                </Field>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <PrimaryButton onClick={save}>Save</PrimaryButton>
                  <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
                </div>
              </>
            ) : (
              <>
                <Field label="Billing address">
                  <p style={{ margin: 0, fontSize: 14 }}>{profile.billingAddress}</p>
                </Field>
                <Field label="Site address">
                  <p style={{ margin: 0, fontSize: 14 }}>{profile.siteAddress}</p>
                </Field>
                {saved && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>Saved.</div>}
                <SecondaryButton onClick={startEdit}>Edit</SecondaryButton>
              </>
            )}
          </div>
        </Card>
      </Container>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ font: "600 12px/1 var(--font-inter), sans-serif", letterSpacing: "0.04em", color: "var(--text-secondary)", marginBottom: 8 }}>
        {label.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 70,
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "10px 14px",
  font: "400 14px/1.5 var(--font-inter), sans-serif",
  outline: "none",
  resize: "vertical",
};
