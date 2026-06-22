import AsyncStorage from "@react-native-async-storage/async-storage";

const INVOICES_KEY = "invoices_cache_v1";
const INVOICES_TS_KEY = "invoices_cache_ts_v1";

export async function setCachedInvoices(pages: unknown[]) {
  try {
    await AsyncStorage.setItem(INVOICES_KEY, JSON.stringify(pages));
    await AsyncStorage.setItem(INVOICES_TS_KEY, String(Date.now()));
  } catch (err) {
    // silent
    console.error("setCachedInvoices error:", err);
  }
}

export async function getCachedInvoices(): Promise<{
  pages: unknown[];
  ts?: number | undefined;
} | null> {
  try {
    const raw = await AsyncStorage.getItem(INVOICES_KEY);
    const tsRaw = await AsyncStorage.getItem(INVOICES_TS_KEY);
    if (!raw) return null;
    const pages = JSON.parse(raw) as unknown[];
    const result: { pages: unknown[]; ts?: number | undefined } = { pages };
    if (tsRaw) {
      result["ts"] = Number(tsRaw);
    }
    return result;
  } catch (err) {
    console.error("getCachedInvoices error:", err);
    return null;
  }
}

export async function getInvoicesLastSynced(): Promise<number | undefined> {
  try {
    const tsRaw = await AsyncStorage.getItem(INVOICES_TS_KEY);
    return tsRaw ? Number(tsRaw) : undefined;
  } catch (err) {
    console.error("getInvoicesLastSynced error:", err);
    return undefined;
  }
}
