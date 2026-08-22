import { Buyer, Notification, Offer, Requirement, Vendor } from "./types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const api = {
  listRequirements: (params: { q?: string; status?: string; category?: string; sort?: "asc" | "desc" }) => {
    const usp = new URLSearchParams();
    if (params.q) usp.set("q", params.q);
    if (params.status) usp.set("status", params.status);
    if (params.category) usp.set("category", params.category);
    if (params.sort) usp.set("sort", params.sort);
    return jsonFetch<{ requirements: Requirement[] }>(`/api/requirements?${usp.toString()}`);
  },
  createRequirement: (message: string) =>
    jsonFetch<{ requirement: Requirement; reply: string; isComplete: boolean }>("/api/requirements", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  getRequirement: (id: string) => jsonFetch<{ requirement: Requirement }>(`/api/requirements/${id}`),
  patchRequirement: (id: string, patch: Record<string, unknown>) =>
    jsonFetch<{ requirement: Requirement }>(`/api/requirements/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  postMessage: (id: string, message: string) =>
    jsonFetch<{ requirement: Requirement; reply: string; isComplete: boolean }>(`/api/requirements/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  confirm: (id: string, action: "send" | "draft") =>
    jsonFetch<{ requirement: Requirement }>(`/api/requirements/${id}/confirm`, { method: "POST", body: JSON.stringify({ action }) }),
  listOffers: (id: string) =>
    jsonFetch<{ offers: Offer[]; ranking: { offer: Offer; score: number }[]; vendors: Vendor[] }>(`/api/requirements/${id}/offers`),
  selectOffer: (id: string, offerId: string) =>
    jsonFetch<{ requirement: Requirement }>(`/api/requirements/${id}/select`, { method: "POST", body: JSON.stringify({ offerId }) }),
  acceptOffer: (id: string, offerId: string) =>
    jsonFetch<{ requirement: Requirement }>(`/api/requirements/${id}/accept`, { method: "POST", body: JSON.stringify({ offerId }) }),
  cancelRequirement: (id: string, reason: string) =>
    jsonFetch<{ requirement: Requirement }>(`/api/requirements/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
  getAudit: (id: string) => jsonFetch<{ entries: { id: string; actor: string; action: string; detail: string; createdAt: string }[] }>(`/api/requirements/${id}/audit`),
  submitVendorReply: (requirementId: string, vendorId: string, text: string) =>
    jsonFetch<{ requirement: Requirement; offer: Offer }>("/api/vendor-reply", {
      method: "POST",
      body: JSON.stringify({ requirementId, vendorId, text }),
    }),
  getNotifications: () => jsonFetch<{ notifications: Notification[] }>("/api/notifications"),
  markNotificationRead: (id: string) => jsonFetch<{ notifications: Notification[] }>(`/api/notifications/${id}/read`, { method: "POST" }),
  getProfile: () => jsonFetch<{ profile: Buyer }>("/api/profile"),
  updateProfile: (patch: Partial<Buyer>) => jsonFetch<{ profile: Buyer }>("/api/profile", { method: "PATCH", body: JSON.stringify(patch) }),
  getVendors: () => jsonFetch<{ vendors: Vendor[] }>("/api/vendors"),
  getTelegramLinks: (id: string) =>
    jsonFetch<{ configured: boolean; links: { vendorId: string; linked: boolean; link: string | null }[] }>(
      `/api/requirements/${id}/telegram-links`
    ),
};
