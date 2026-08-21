export const PUBLIC_ROUTES = new Set(["index", "login"]);

export const PROTECTED_ROUTES = new Set([
  "dashboard",
  "create-invoice",
  "drafts",
  "settings",
]);

export const AUTH_REQUIRED_DEEP_LINK_TYPES = new Set([
  "invoice",
  "create-invoice",
  "drafts",
]);

export const PUBLIC_DEEP_LINK_TYPES = new Set(["payment", "receipt"]);

export function isPublicRoute(rootSegment: string | undefined): boolean {
  if (rootSegment === undefined) return false;
  return PUBLIC_ROUTES.has(rootSegment);
}

export function isProtectedRoute(rootSegment: string | undefined): boolean {
  if (rootSegment === undefined) return false;
  if (PROTECTED_ROUTES.has(rootSegment)) return true;
  if (rootSegment === "invoices") return true;
  return false;
}

export function deepLinkRequiresAuth(type: string): boolean {
  return AUTH_REQUIRED_DEEP_LINK_TYPES.has(type as any);
}
