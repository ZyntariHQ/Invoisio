import {
  buildErrorReport,
  isErrorReportingEnabled,
  redactSensitiveData,
} from "./error-reporting";

describe("redactSensitiveData", () => {
  it("redacts JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redactSensitiveData(jwt)).toBe("[REDACTED]");
  });

  it("redacts bearer tokens", () => {
    const value = "Authorization: Bearer abc123def456ghi789jkl012";
    expect(redactSensitiveData(value)).toContain("[REDACTED]");
    expect(redactSensitiveData(value)).not.toContain(
      "abc123def456ghi789jkl012",
    );
  });

  it("redacts Stellar secret keys", () => {
    const secret = `S${"B".repeat(55)}`;
    expect(redactSensitiveData(secret)).toBe("[REDACTED]");
  });

  it("redacts values under sensitive keys", () => {
    const input = {
      accessToken: "super-secret-token",
      clientName: "Acme Corp",
      nested: { walletSecret: "S-something", memo: "hello" },
    };
    const output = redactSensitiveData(input) as Record<string, unknown>;
    expect(output["accessToken"]).toBe("[REDACTED]");
    expect(output["clientName"]).toBe("Acme Corp");
    const nested = output["nested"] as Record<string, unknown>;
    expect(nested["walletSecret"]).toBe("[REDACTED]");
    expect(nested["memo"]).toBe("hello");
  });

  it("caps depth and string length", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: "x" } } } } } } };
    const output = redactSensitiveData(deep) as Record<string, unknown>;
    const a = output["a"] as Record<string, unknown>;
    const b = a["b"] as Record<string, unknown>;
    const c = b["c"] as Record<string, unknown>;
    const d = c["d"] as Record<string, unknown>;
    const e = d["e"] as Record<string, unknown>;
    // The subtree past the depth cap is replaced wholesale.
    expect(e["f"]).toBe("[TRUNCATED]");

    const long = "x".repeat(5000);
    expect(redactSensitiveData(long)).toBe("x".repeat(2000) + "…[TRUNCATED]");
  });
});

describe("buildErrorReport", () => {
  it("captures the error, stack, and component stack", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\n  at fake:1:1";
    const report = buildErrorReport(error, {
      componentStack: "\n    in Screen",
    });

    expect(report.name).toBe("Error");
    expect(report.message).toBe("boom");
    expect(report.stack).toBe("Error: boom\n  at fake:1:1");
    expect(report.componentStack).toBe("\n    in Screen");
    expect(report.app).toBe("invoisio-mobile");
    expect(report.timestamp).toEqual(expect.any(String));
  });

  it("normalises non-Error throwables", () => {
    const report = buildErrorReport("plain string");
    expect(report.name).toBe("Error");
    expect(report.message).toBe("plain string");
  });

  it("redacts secrets found inside stack frames", () => {
    const secret = `S${"B".repeat(55)}`;
    const error = new Error("failed with key");
    error.stack = `Error: failed with key ${secret}\n  at fake:1:1`;
    const report = buildErrorReport(error);
    expect(report.stack).not.toContain(secret);
  });

  it("redacts context and excludes sensitive keys", () => {
    const report = buildErrorReport(new Error("boom"), undefined, {
      context: {
        accessToken: "abc",
        screen: "invoices/[id]",
        nested: {
          publicKey: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
        },
      },
    });
    const context = report.context as Record<string, unknown>;
    expect(context["accessToken"]).toBe("[REDACTED]");
    expect(context["screen"]).toBe("invoices/[id]");
    const nested = context["nested"] as Record<string, unknown>;
    expect(nested["publicKey"]).toBe("[REDACTED]");
  });
});

describe("isErrorReportingEnabled", () => {
  it("is off by default (disabled in the env mock)", () => {
    expect(isErrorReportingEnabled()).toBe(false);
  });
});

describe("reporting pipeline when enabled", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalDev: unknown;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalDev = (globalThis as { __DEV__?: unknown }).__DEV__;
    (globalThis as { __DEV__?: unknown }).__DEV__ = false;
    jest.resetModules();
  });

  afterEach(() => {
    (globalThis as { __DEV__?: unknown }).__DEV__ = originalDev;
    globalThis.fetch = originalFetch;
    // doMock factories otherwise leak into later suites via the module registry.
    jest.unmock("@env");
    jest.resetModules();
  });

  it("POSTs a sanitised report to the configured endpoint", async () => {
    jest.doMock("@env", () => ({
      ERROR_REPORTING_ENABLED: "true",
      ERROR_REPORTING_URL: "https://errors.example.com/ingest",
      ERROR_REPORTING_DEV: "false",
    }));
    const fetchSpy = jest
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const mod = await import("./error-reporting");
    expect(mod.isErrorReportingEnabled()).toBe(true);
    mod.reportError(new Error("boom"), undefined, {
      context: { accessToken: "secret" },
    });

    // Let the fire-and-forget fetch promise settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://errors.example.com/ingest");
    const body = JSON.parse(init.body as string) as {
      message: string;
      context: Record<string, unknown>;
    };
    expect(body.message).toBe("boom");
    expect(body.context).toEqual({ accessToken: "[REDACTED]" });
  });

  it("stays disabled in dev builds unless ERROR_REPORTING_DEV=true", async () => {
    (globalThis as { __DEV__?: unknown }).__DEV__ = true;
    jest.doMock("@env", () => ({
      ERROR_REPORTING_ENABLED: "true",
      ERROR_REPORTING_URL: "https://errors.example.com/ingest",
      ERROR_REPORTING_DEV: "false",
    }));
    const mod = await import("./error-reporting");
    expect(mod.isErrorReportingEnabled()).toBe(false);
  });

  it("can be enabled in dev builds with an explicit opt-in", async () => {
    (globalThis as { __DEV__?: unknown }).__DEV__ = true;
    jest.doMock("@env", () => ({
      ERROR_REPORTING_ENABLED: "true",
      ERROR_REPORTING_URL: "https://errors.example.com/ingest",
      ERROR_REPORTING_DEV: "true",
    }));
    const mod = await import("./error-reporting");
    expect(mod.isErrorReportingEnabled()).toBe(true);
  });
});

interface RejectionTrackerOptions {
  allRejections: boolean;
  onUnhandled: (id: number, rejection: unknown) => void;
  onHandled?: (id: number) => void;
}

describe("installGlobalErrorHandlers", () => {
  const INSTALLED_FLAG = "__invoisio_error_handlers_installed__";

  afterEach(() => {
    const g = globalThis as {
      [INSTALLED_FLAG]?: boolean;
      HermesInternal?: unknown;
      ErrorUtils?: unknown;
    };
    g[INSTALLED_FLAG] = false;
    delete g.HermesInternal;
    delete g.ErrorUtils;
    jest.unmock("@env");
    jest.resetModules();
  });

  it("captures unhandled promise rejections via the Hermes tracker", async () => {
    const enableTracker = jest.fn<
      undefined,
      [options: RejectionTrackerOptions]
    >();
    (globalThis as Record<string, unknown>)["HermesInternal"] = {
      hasPromise: () => true,
      enablePromiseRejectionTracker: enableTracker,
    };

    const mod = await import("./error-reporting");
    const uninstall = mod.installGlobalErrorHandlers();

    expect(enableTracker).toHaveBeenCalledTimes(1);
    const options = enableTracker.mock.calls[0]?.[0];
    expect(options).toBeDefined();
    if (!options) {
      return;
    }
    expect(options.allRejections).toBe(true);

    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    options.onUnhandled(7, new Error("async boom"));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[error-report]"),
      expect.anything(),
    );
    errorSpy.mockRestore();

    uninstall();
  });
  it("wraps ErrorUtils and forwards to the previous handler", async () => {
    const previousHandler = jest.fn<
      undefined,
      [error: unknown, isFatal?: boolean]
    >();
    const setGlobalHandler = jest.fn<
      undefined,
      [handler: (error: unknown, isFatal?: boolean) => void]
    >();
    (globalThis as Record<string, unknown>)["ErrorUtils"] = {
      getGlobalHandler: () => previousHandler,
      setGlobalHandler,
    };

    const mod = await import("./error-reporting");
    const uninstall = mod.installGlobalErrorHandlers();

    expect(setGlobalHandler).toHaveBeenCalledTimes(1);
    const handler = setGlobalHandler.mock.calls[0]?.[0];
    expect(handler).toBeDefined();
    if (!handler) {
      return;
    }

    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    handler(new Error("fatal boom"), true);
    expect(previousHandler).toHaveBeenCalledWith(expect.any(Error), true);
    errorSpy.mockRestore();

    uninstall();
  });

  it("is idempotent across repeated calls", async () => {
    const enableTracker = jest.fn<
      undefined,
      [options: RejectionTrackerOptions]
    >();
    (globalThis as Record<string, unknown>)["HermesInternal"] = {
      hasPromise: () => true,
      enablePromiseRejectionTracker: enableTracker,
    };

    const mod = await import("./error-reporting");
    const uninstallA = mod.installGlobalErrorHandlers();
    const uninstallB = mod.installGlobalErrorHandlers();

    expect(enableTracker).toHaveBeenCalledTimes(1);
    uninstallA();
    uninstallB();
  });
});
