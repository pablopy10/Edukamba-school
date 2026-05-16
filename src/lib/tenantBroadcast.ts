export const TENANT_CHANGED_EVENT = "edukamba:tenant-changed";

export function broadcastTenantChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TENANT_CHANGED_EVENT));
}
