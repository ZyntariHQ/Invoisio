import {
  PUBLIC_ROUTES,
  PROTECTED_ROUTES,
  AUTH_REQUIRED_DEEP_LINK_TYPES,
  PUBLIC_DEEP_LINK_TYPES,
  isPublicRoute,
  isProtectedRoute,
  deepLinkRequiresAuth,
} from "./auth-routes";

describe("PUBLIC_ROUTES - route classification contract", () => {
  it("exposes only the expected public entry points", () => {
    expect(Array.from(PUBLIC_ROUTES).sort()).toEqual(["index", "login"].sort());
  });

  it("does not include drafts in public routes", () => {
    expect(PUBLIC_ROUTES.has("drafts")).toBe(false);
  });

  it("does not include merchant workspace routes in public routes", () => {
    const merchantRoutes = [
      "dashboard",
      "create-invoice",
      "drafts",
      "settings",
      "invoices",
    ];
    for (const route of merchantRoutes) {
      expect(PUBLIC_ROUTES.has(route)).toBe(false);
    }
  });
});

describe("PROTECTED_ROUTES - route classification contract", () => {
  it("includes drafts alongside other merchant workspace routes", () => {
    expect(PROTECTED_ROUTES.has("drafts")).toBe(true);
  });

  it("includes the expected core merchant routes", () => {
    expect(PROTECTED_ROUTES.has("dashboard")).toBe(true);
    expect(PROTECTED_ROUTES.has("create-invoice")).toBe(true);
    expect(PROTECTED_ROUTES.has("settings")).toBe(true);
  });

  it("does not include public landing or auth routes", () => {
    expect(PROTECTED_ROUTES.has("index")).toBe(false);
    expect(PROTECTED_ROUTES.has("login")).toBe(false);
  });
});

describe("isPublicRoute() - classification helper", () => {
  it.each([
    ["index", true],
    ["login", true],
    ["dashboard", false],
    ["create-invoice", false],
    ["drafts", false],
    ["settings", false],
    ["invoices", false],
    ["scan", false],
    ["payments", false],
    ["receipts", false],
  ])("classifies root segment '%s' as public=%s", (segment, expected) => {
    expect(isPublicRoute(segment)).toBe(expected);
  });

  it("returns false for undefined segments (fresh boot)", () => {
    expect(isPublicRoute(undefined)).toBe(false);
  });
});

describe("isProtectedRoute() - classification helper", () => {
  it.each([
    ["dashboard", true],
    ["create-invoice", true],
    ["drafts", true],
    ["settings", true],
    ["invoices", true],
    ["index", false],
    ["login", false],
    ["scan", false],
    ["payments", false],
    ["receipts", false],
  ])("classifies root segment '%s' as protected=%s", (segment, expected) => {
    expect(isProtectedRoute(segment)).toBe(expected);
  });

  it("returns false for undefined segments (fresh boot)", () => {
    expect(isProtectedRoute(undefined)).toBe(false);
  });

  it("protects invoices nested routes (invoices/[id])", () => {
    expect(isProtectedRoute("invoices")).toBe(true);
  });

  it("treats drafts consistently with dashboard and create-invoice", () => {
    const merchantRoutes = ["dashboard", "create-invoice", "drafts", "settings"];
    const results = merchantRoutes.map((r) => isProtectedRoute(r));
    expect(results.every(Boolean)).toBe(true);
  });
});

describe("AUTH_REQUIRED_DEEP_LINK_TYPES - deep link contract", () => {
  it("includes drafts as a merchant-only deep link type", () => {
    expect(AUTH_REQUIRED_DEEP_LINK_TYPES.has("drafts")).toBe(true);
  });

  it("includes other authenticated merchant deep links", () => {
    expect(AUTH_REQUIRED_DEEP_LINK_TYPES.has("invoice")).toBe(true);
    expect(AUTH_REQUIRED_DEEP_LINK_TYPES.has("create-invoice")).toBe(true);
  });

  it("does not include payer-facing public deep link types", () => {
    expect(AUTH_REQUIRED_DEEP_LINK_TYPES.has("payment")).toBe(false);
    expect(AUTH_REQUIRED_DEEP_LINK_TYPES.has("receipt")).toBe(false);
  });
});

describe("PUBLIC_DEEP_LINK_TYPES - deep link contract", () => {
  it("includes payer-facing routes that do not need merchant auth", () => {
    expect(Array.from(PUBLIC_DEEP_LINK_TYPES).sort()).toEqual(
      ["payment", "receipt"].sort(),
    );
  });

  it("does not include drafts", () => {
    expect(PUBLIC_DEEP_LINK_TYPES.has("drafts")).toBe(false);
  });
});

describe("deepLinkRequiresAuth() - helper", () => {
  it.each([
    ["invoice", true],
    ["create-invoice", true],
    ["drafts", true],
    ["dashboard", false],
    ["payment", false],
    ["receipt", false],
  ])("requires auth for type '%s' = %s", (type, expected) => {
    expect(deepLinkRequiresAuth(type)).toBe(expected);
  });
});
