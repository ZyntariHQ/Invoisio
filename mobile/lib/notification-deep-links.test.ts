import { getNotificationDeepLink } from "./notification-deep-links";

describe("getNotificationDeepLink", () => {
  it("prefers an explicit deep link over legacy fields", () => {
    expect(
      getNotificationDeepLink({
        deepLink: "invoisio://invoice/inv-1",
        invoiceId: "inv-2",
      }),
    ).toBe("invoisio://invoice/inv-1");
  });

  it("converts an invoice id fallback into an app deep link", () => {
    expect(getNotificationDeepLink({ invoice_id: "inv/1" })).toBe(
      "invoisio://invoice/inv%2F1",
    );
  });

  it("returns null when no navigation target is present", () => {
    expect(getNotificationDeepLink({ title: "Invoice paid" })).toBeNull();
  });
});