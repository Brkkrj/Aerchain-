"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Notification } from "@/lib/types";

function Logo() {
  return (
    <span style={{ fontFamily: "var(--font-inter)", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>
      <span style={{ color: "var(--charcoal)" }}>AERCH</span>
      <span style={{ color: "var(--coral)" }}>AI</span>
      <span style={{ color: "var(--charcoal)" }}>N</span>
    </span>
  );
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
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      marginTop: 6,
                      flex: "none",
                      background: !n.read ? "var(--coral)" : "var(--border)",
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 14, color: "var(--charcoal)" }}>{n.text}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{n.meta}</div>
                  </div>
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
