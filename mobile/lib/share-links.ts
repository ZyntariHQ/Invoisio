import { Linking, Platform } from "react-native";

/**
 * Generate a deep link URL for the app
 */
export function generateDeepLink(
  type: "invoice" | "payment" | "receipt" | "dashboard" | "create-invoice",
  id?: string,
  params?: Record<string, string>
): string {
  let url = `invoisio://${type}`;
  
  if (id) {
    url += `/${id}`;
  }
  
  if (params) {
    const queryString = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  
  return url;
}

/**
 * Generate a web URL for the app (for universal links)
 */
export function generateWebUrl(
  type: "invoice" | "payment" | "receipt" | "dashboard" | "create-invoice",
  id?: string,
  params?: Record<string, string>
): string {
  let url = `https://invoisio.com/${type}`;
  
  if (id) {
    url += `/${id}`;
  }
  
  if (params) {
    const queryString = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
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