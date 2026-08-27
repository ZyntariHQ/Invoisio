export function getNotificationDeepLink(
  data: Record<string, unknown>,
): string | null {
  for (const key of ["deepLink", "url", "link"]) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  for (const key of ["invoiceId", "invoice_id"]) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) {
      return `invoisio://invoice/${encodeURIComponent(value)}`;
    }
  }

  return null;
}