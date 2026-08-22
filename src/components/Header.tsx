"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Notification, NotificationType } from "@/lib/types";

function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

function NotificationIcon({ type }: { type: NotificationType }) {
  const style = { flex: "none" as const, marginTop: 1 };
  if (type === "all_replied") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--success)" strokeWidth="1.5" style={style}>
        <circle cx="8" cy="8" r="6.5" />
        <path d="M5.3 8.2l1.8 1.8 3.6-3.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--coral)" strokeWidth="1.5" style={style}>
      <path d="M3 3.5h10v7a1 1 0 0 1-1 1H6.5L3 14.5v-11Z" strokeLinejoin="round" />
      <path d="M5.5 6.5h5M5.5 8.7h3" strokeLinecap="round" />
    </svg>
  );
}

function Logo() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/aerchain-logo.avif" alt="Aerchain" style={{ height: 22, width: "auto", display: "block" }} />;
}

export default function Header() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function poll() {
    try {
      const { notifications } = await api.getNotifications();
      setNotifications(notifications);
    } catch {
      /* ignore transient errors */
    }
  }

  useEffect(() => {
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, []);

  // There's no domain here for Gmail to push inbound vendor replies to, so we pull instead —
  // piggybacking on this component's existing poll cadence rather than adding a cron job. A
  // longer interval than the notification poll since email replies aren't as time-sensitive as
  // Telegram, and it's a no-op instantly if Gmail OAuth isn't configured.
  useEffect(() => {
    const check = () =>
      api
        .checkEmail()
        .then((r) => {
          if (r.processed > 0) poll();
        })
        .catch(() => {});
    check();
    const t = setInterval(check, 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = notifications.filter((n) => !n.read).length;

  async function openNotification(n: Notification) {
    await api.markNotificationRead(n.id);
    setOpen(false);
    router.push(`/requirements/${n.requirementId}`);
    poll();
  }

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--white)",
        padding: "14px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <a href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Logo />
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }} ref={ref}>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setOpen((o) => !o)}
            style={{
              position: "relative",
              width: 34,
              height: 34,
              borderRadius: 9,
              background: open ? "var(--bg)" : "var(--white)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--charcoal)",
              cursor: "pointer",
            }}
            aria-label="Notifications"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M8 1.5a4 4 0 0 0-4 4v2.2c0 .5-.2 1-.5 1.4L2 11h12l-1.5-1.9a2.2 2.2 0 0 1-.5-1.4V5.5a4 4 0 0 0-4-4Z" />
              <path d="M6.3 13.5a1.8 1.8 0 0 0 3.4 0" />
            </svg>
            {unread > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -3,
                  right: -3,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--coral)",
                  border: "1.5px solid var(--white)",
                }}
              />
            )}
          </button>
          {open && (
            <div
              style={{
                position: "absolute",
                top: 42,
                right: 0,
                width: 320,
                background: "var(--white)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                boxShadow: "0 12px 32px rgba(35,31,32,.12)",
                zIndex: 50,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 14 }}>
                Notifications
              </div>
              {notifications.length === 0 && (
                <div style={{ padding: 16, fontSize: 13, color: "var(--text-secondary)" }}>No notifications yet.</div>
              )}
              {notifications.map((n, i) => (
                <div
                  key={n.id}
                  onClick={() => openNotification(n)}
                  style={{
                    padding: "14px 16px",
                    cursor: "pointer",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    borderBottom: i < notifications.length - 1 ? "1px solid #EFEFED" : "none",
                    background: !n.read ? "#FBFBFA" : "var(--white)",
                  }}
                >
                  <NotificationIcon type={n.type} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 14, color: "var(--charcoal)" }}>{n.text}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", flex: "none" }}>{formatNotificationTime(n.createdAt)}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{n.meta}</div>
                  </div>
                  {!n.read && (
                    <span
                      style={{ width: 7, height: 7, borderRadius: "50%", marginTop: 6, flex: "none", background: "var(--coral)" }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <a
          href="/profile"
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          RM
        </a>
      </div>
    </div>
  );
}
