import { CSSProperties, ReactNode } from "react";
import { RequirementStatus } from "@/lib/types";
import { statusLabel, statusTag } from "@/lib/theme";

export function PrimaryButton({
  children,
  onClick,
  disabled,
  style,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#B9B6B6" : "var(--charcoal)",
        color: "var(--white)",
        border: "none",
        borderRadius: 10,
        padding: "13px 22px",
        font: "600 14px/1 var(--font-inter), sans-serif",
        cursor: disabled ? "not-allowed" : "pointer",
        height: 44,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "var(--white)",
        color: "var(--charcoal)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "13px 22px",
        font: "600 14px/1 var(--font-inter), sans-serif",
        cursor: "pointer",
        height: 44,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--white)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function StatusPill({ status }: { status: RequirementStatus }) {
  const t = statusTag[status];
  return (
    <span
      style={{
        font: "600 12px/1 var(--font-inter), sans-serif",
        color: t.fg,
        background: t.bg,
        border: `1px solid ${t.bd}`,
        padding: "6px 9px",
        borderRadius: 6,
        display: "inline-block",
      }}
    >
      {statusLabel[status]}
    </span>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 style={{ margin: 0, font: "600 28px/1.2 var(--font-inter), sans-serif", letterSpacing: "-0.02em" }}>{children}</h1>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <p style={{ margin: "6px 0 0", font: "400 14px/1.55 var(--font-inter), sans-serif", color: "var(--text-secondary)" }}>{children}</p>;
}

export function Shell({ children }: { children: ReactNode }) {
  return <div style={{ minHeight: "100vh", background: "var(--bg)" }}>{children}</div>;
}

export function Container({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px 48px", ...style }}>{children}</div>;
}
