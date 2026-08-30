import { Linking } from "react-native";
import type { DeepLinkType } from "./deep-links";
import { ID_LINK_TYPES } from "./deep-links";

/**
 * Generate an app-scheme deep link URL (invoisio://…).
 *
 * See `./deep-links.ts` → ROUTE CONTRACT for the full routing table.
 * This module intentionally re-uses the exported `DeepLinkType` so that
 * link generation and link parsing cannot drift out of sync.
 *
 * @param type  One of the supported DeepLinkType route segments.
 * @param id    Required when `type` is in `ID_LINK_TYPES` (invoice/payment/receipt).
 * @param params Optional query-string parameters forwarded to the destination.
 */
export function generateDeepLink(
  type: DeepLinkType,
  id?: string,
  params?: Record<string, string>,
): string {
  if (ID_LINK_TYPES.has(type) && !id) {
    throw new Error(`generateDeepLink: "${type}" requires an id`);
  }
  if (!ID_LINK_TYPES.has(type) && id) {
    throw new Error(`generateDeepLink: "${type}" does not accept an id`);
  }

  let url = `invoisio://${type}`;

  if (id) {
    url += `/${id}`;
  }

  if (params) {
    const queryString = Object.entries(params)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      )
      .join("&");
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return url;
}

/**
 * Generate a universal / web URL (https://invoisio.com/…).
 *
 * Mirrors `generateDeepLink` but produces the web-domain equivalent that
 * Android intent filters and iOS associated domains will route back into
 * the installed app. See `./deep-links.ts` → ROUTE CONTRACT.
 *
 * @param type  One of the supported DeepLinkType route segments.
 * @param id    Required when `type` is in `ID_LINK_TYPES` (invoice/payment/receipt).
 * @param params Optional query-string parameters forwarded to the destination.
 */
export function generateWebUrl(
  type: DeepLinkType,
  id?: string,
  params?: Record<string, string>,
): string {
  if (ID_LINK_TYPES.has(type) && !id) {
    throw new Error(`generateWebUrl: "${type}" requires an id`);
  }
  if (!ID_LINK_TYPES.has(type) && id) {
    throw new Error(`generateWebUrl: "${type}" does not accept an id`);
  }

  let url = `https://invoisio.com/${type}`;

  if (id) {
    url += `/${id}`;
  }

  if (params) {
    const queryString = Object.entries(params)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      )
      .join("&");
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return url;
}

/**
 * Open a deep link
 */
export async function openDeepLink(url: string): Promise<boolean> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return true;
    }
    console.warn("Cannot open URL:", url);
    return false;
  } catch (error) {
    console.error("Failed to open deep link:", error);
    return false;
  }
}