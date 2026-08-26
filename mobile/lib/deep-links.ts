import { Linking } from "react-native";

/**
 * Supported deep-link route types.
 *
 * --------------------------------------------------------------------------
 * ROUTE CONTRACT — KEEP THESE IN SYNC:
 *   1. mobile/app.json → android.intentFilters (Android pathPrefix / pathPattern)
 *   2. mobile/lib/deep-links.ts → DeepLinkType, LINK_TYPES, route parsing
 *   3. mobile/lib/share-links.ts → generateDeepLink / generateWebUrl types
 *
 * If you add a new route type, update ALL THREE locations above.
 * --------------------------------------------------------------------------
 *
 * Routes that REQUIRE an :id segment (parsed and validated):
 *   - invoice   → /invoice/:id        (merchant invoice detail)
 *   - payment   → /payment/:id or /pay/:id (payment view, "pay" is an alias)
 *   - receipt   → /receipt/:id      (receipt detail)
 *
 * Routes WITHOUT an :id segment (bare path only):
 *   - dashboard     → /dashboard or /     (root path defaults to dashboard)
 *   - create-invoice → /create-invoice  (new invoice form)
 */
export type DeepLinkType =
  | "invoice"
  | "payment"
  | "receipt"
  | "dashboard"
  | "create-invoice"
  | "drafts";

export interface DeepLinkData {
  type: DeepLinkType;
  id?: string;
  params?: Record<string, string>;
}

export interface DeepLinkRouter {
  push(href: string): void;
}

/** Web hostnames treated as authoritative universal-link sources. */
const WEB_HOSTS = new Set(["invoisio.com"]);

/**
 * Route types that carry a resource identifier in the second path segment.
 *   /{type}/{id}
 */
export const ID_LINK_TYPES: ReadonlySet<DeepLinkType> = new Set<DeepLinkType>([
  "invoice",
  "payment",
  "receipt",
]);

/**
 * Every route type path segments we accept from incoming links.
 * Union of id-bearing routes and static entry points.
 */
export const LINK_TYPES: ReadonlySet<DeepLinkType> = new Set<DeepLinkType>([
  ...ID_LINK_TYPES,
  "dashboard",
  "create-invoice",
  "drafts",
]);

/**
 * Alternative path segment aliases.
 *   web path → canonical DeepLinkType
 * Used when parsing; kept next to LINK_TYPES above so they stay in sync.
 */
export const PATH_ALIASES: Readonly<Record<string, DeepLinkType>> = {
  pay: "payment",
};

function normaliseType(value: string): DeepLinkType | null {
  const aliased = PATH_ALIASES[value];
  const type = aliased ?? value;
  return LINK_TYPES.has(type as DeepLinkType) ? (type as DeepLinkType) : null;
}

/** Parse only links owned by Invoisio into a validated navigation target. */
export function parseDeepLink(url: string): DeepLinkData | null {
  try {
    const parsedUrl = new URL(url);
    const isAppLink = parsedUrl.protocol === "invoisio:";
    const isWebLink =
      parsedUrl.protocol === "https:" &&
      WEB_HOSTS.has(parsedUrl.hostname.toLowerCase());

    if (!isAppLink && !isWebLink) return null;

    // URL treats the first component after `invoisio://` as the hostname.
    const segments = isAppLink
      ? [parsedUrl.hostname, ...parsedUrl.pathname.split("/")].filter(Boolean)
      : parsedUrl.pathname.split("/").filter(Boolean);
    const type = normaliseType(segments[0] ?? (isWebLink ? "dashboard" : ""));
    if (!type || segments.length > 2) return null;

    const rawId = segments[1];
    const id = rawId ? decodeURIComponent(rawId) : undefined;
    if (ID_LINK_TYPES.has(type) && !id) return null;
    if (!ID_LINK_TYPES.has(type) && id) return null;

    const params: Record<string, string> = {};
    parsedUrl.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return {
      type,
      ...(id !== undefined && { id }),
      ...(Object.keys(params).length > 0 && { params }),
    };
  } catch {
    return null;
  }
}

/** Navigate a validated deep link to its app screen. */
export function navigateToDeepLink(
  data: DeepLinkData,
  router: DeepLinkRouter,
): boolean {
  const { type, id } = data;

  switch (type) {
    case "invoice":
      if (!id) return false;
      router.push(`/invoices/${encodeURIComponent(id)}`);
      return true;
    case "payment":
      if (!id) return false;
      router.push(`/payments/${encodeURIComponent(id)}`);
      return true;
    case "receipt":
      if (!id) return false;
      router.push(`/receipts/${encodeURIComponent(id)}`);
      return true;
    case "dashboard":
      router.push("/dashboard");
      return true;
    case "create-invoice":
      router.push("/create-invoice");
      return true;
    case "drafts":
      router.push("/drafts");
      return true;
  }
}

export async function getInitialUrl(): Promise<string | null> {
  try {
    return await Linking.getInitialURL();
  } catch (error) {
    console.error("Failed to get initial URL:", error);
    return null;
  }
}
