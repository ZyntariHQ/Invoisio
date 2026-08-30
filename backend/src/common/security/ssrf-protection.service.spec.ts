import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import * as dns from "dns";
import { SsrfProtectionService } from "./ssrf-protection.service";

jest.mock("dns", () => ({
  promises: {
    lookup: jest.fn(),
  },
}));

const mockedLookup = dns.promises.lookup as jest.Mock;

async function buildService(
  configOverrides: Record<string, unknown> = {},
): Promise<SsrfProtectionService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      SsrfProtectionService,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string, defaultValue?: unknown) =>
            configOverrides[key] ?? defaultValue,
        },
      },
    ],
  }).compile();

  return moduleRef.get(SsrfProtectionService);
}

describe("SsrfProtectionService", () => {
  beforeEach(() => {
    mockedLookup.mockReset();
  });

  describe("validateStructure", () => {
    it("accepts a well-formed https URL", async () => {
      const service = await buildService();
      expect(() =>
        service.validateStructure("https://webhooks.example.com/hook"),
      ).not.toThrow();
    });

    it("rejects non-http(s) schemes", async () => {
      const service = await buildService();
      expect(() =>
        service.validateStructure("ftp://example.com/hook"),
      ).toThrow();
      expect(() => service.validateStructure("file:///etc/passwd")).toThrow();
      expect(() => service.validateStructure("gopher://example.com")).toThrow();
    });

    it("rejects embedded credentials", async () => {
      const service = await buildService();
      expect(() =>
        service.validateStructure("https://user:pass@example.com/hook"),
      ).toThrow();
    });

    it("rejects plain http by default", async () => {
      const service = await buildService({ "app.allowLocalWebhooks": false });
      expect(() =>
        service.validateStructure("http://example.com/hook"),
      ).toThrow();
    });

    it("rejects localhost even over https unless the escape hatch is on", async () => {
      const service = await buildService({ "app.allowLocalWebhooks": false });
      expect(() =>
        service.validateStructure("https://localhost/hook"),
      ).toThrow();
    });

    it("allows http://localhost only when explicitly configured", async () => {
      const service = await buildService({ "app.allowLocalWebhooks": true });
      expect(() =>
        service.validateStructure("http://localhost:4000/hook"),
      ).not.toThrow();
    });

    it("does not allow other private hosts through the localhost escape hatch", async () => {
      const service = await buildService({ "app.allowLocalWebhooks": true });
      expect(() => service.validateStructure("http://10.0.0.5/hook")).toThrow();
    });
  });

  describe("resolveSafeAddress", () => {
    it("allows a hostname that resolves to a public address", async () => {
      const service = await buildService();
      mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
      const result = await service.resolveSafeAddress("public.example.com");
      expect(result.address).toBe("93.184.216.34");
    });

    it.each([
      ["loopback", "127.0.0.1"],
      ["private 10/8", "10.1.2.3"],
      ["link-local metadata", "169.254.169.254"],
      ["unique local IPv6", "fd00::1"],
    ])("blocks a hostname resolving to %s", async (_label, ip) => {
      const service = await buildService();
      mockedLookup.mockResolvedValue([
        { address: ip, family: ip.includes(":") ? 6 : 4 },
      ]);
      await expect(
        service.resolveSafeAddress("attacker-controlled.example.com"),
      ).rejects.toThrow();
    });

    it("blocks a hostname with a mix of public and private records (blocks if ANY record is unsafe)", async () => {
      const service = await buildService();
      mockedLookup.mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ]);
      await expect(
        service.resolveSafeAddress("multi-record.example.com"),
      ).rejects.toThrow();
    });

    it("simulates DNS rebinding: passes structural+DNS check at 'write time' but is blocked at 'request time'", async () => {
      const service = await buildService();

      // "Write time": hostname resolves publicly.
      mockedLookup.mockResolvedValueOnce([
        { address: "93.184.216.34", family: 4 },
      ]);
      await expect(
        service.resolveSafeAddress("rebinder.example.com"),
      ).resolves.toBeDefined();

      // "Request time" later: same hostname now resolves to a private IP.
      mockedLookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
      await expect(
        service.resolveSafeAddress("rebinder.example.com"),
      ).rejects.toThrow();
    });

    it("propagates a clear error when DNS resolution fails outright", async () => {
      const service = await buildService();
      mockedLookup.mockRejectedValue(new Error("ENOTFOUND"));
      await expect(
        service.resolveSafeAddress("does-not-exist.invalid"),
      ).rejects.toThrow();
    });
  });
});
