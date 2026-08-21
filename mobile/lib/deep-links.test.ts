import {
  parseDeepLink,
  navigateToDeepLink,
  type DeepLinkData,
  type DeepLinkRouter,
} from "./deep-links";

describe("parseDeepLink - drafts support", () => {
  it("parses invoisio://drafts app scheme deep link", () => {
    const result = parseDeepLink("invoisio://drafts");
    expect(result).toEqual({ type: "drafts" });
  });

  it("parses https://invoisio.com/drafts web universal link", () => {
    const result = parseDeepLink("https://invoisio.com/drafts");
    expect(result).toEqual({ type: "drafts" });
  });

  it("rejects drafts deep link with an id (drafts has no detail route)", () => {
    const result = parseDeepLink("invoisio://drafts/some-id");
    expect(result).toBeNull();
  });

  it("rejects unknown host deep links", () => {
    const result = parseDeepLink("https://evil.com/drafts");
    expect(result).toBeNull();
  });

  it("parses query params on drafts deep links", () => {
    const result = parseDeepLink("invoisio://drafts?filter=ready");
    expect(result).toEqual({
      type: "drafts",
      params: { filter: "ready" },
    });
  });
});

describe("navigateToDeepLink - drafts routing", () => {
  let router: DeepLinkRouter;
  let pushSpy: jest.Mock;

  beforeEach(() => {
    pushSpy = jest.fn();
    router = { push: pushSpy };
  });

  it("navigates to /drafts for drafts deep link", () => {
    const data: DeepLinkData = { type: "drafts" };
    const success = navigateToDeepLink(data, router);
    expect(success).toBe(true);
    expect(pushSpy).toHaveBeenCalledWith("/drafts");
  });

  it("navigates correctly alongside other protected merchant routes", () => {
    const cases: Array<{ data: DeepLinkData; expected: string }> = [
      { data: { type: "dashboard" }, expected: "/dashboard" },
      { data: { type: "create-invoice" }, expected: "/create-invoice" },
      { data: { type: "drafts" }, expected: "/drafts" },
    ];

    for (const { data, expected } of cases) {
      pushSpy.mockClear();
      const success = navigateToDeepLink(data, router);
      expect(success).toBe(true);
      expect(pushSpy).toHaveBeenCalledWith(expected);
    }
  });

  it("navigates public routes independently of merchant auth", () => {
    const cases: Array<{ data: DeepLinkData; expected: string }> = [
      { data: { type: "payment", id: "pay-1" }, expected: "/payments/pay-1" },
      { data: { type: "receipt", id: "rec-1" }, expected: "/receipts/rec-1" },
    ];

    for (const { data, expected } of cases) {
      pushSpy.mockClear();
      const success = navigateToDeepLink(data, router);
      expect(success).toBe(true);
      expect(pushSpy).toHaveBeenCalledWith(expected);
    }
  });
});
