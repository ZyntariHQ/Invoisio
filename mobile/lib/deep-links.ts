import { Linking } from "react-native";

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

const WEB_HOSTS = new Set(["invoisio.com"]);
const ID_LINK_TYPES = new Set<DeepLinkType>(["invoice", "payment", "receipt"]);
const LINK_TYPES = new Set<DeepLinkType>([
  ...ID_LINK_TYPES,
  "dashboard",
  "create-invoice",
  "drafts",
]);

function normaliseType(value: string): DeepLinkType | null {
  const type = value === "pay" ? "payment" : value;
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
