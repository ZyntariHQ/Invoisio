import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { SafeWebhookHttpService } from "./safe-webhook-http.service";
import { SsrfProtectionService } from "./ssrf-protection.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("SafeWebhookHttpService", () => {
  let ssrf: jest.Mocked<SsrfProtectionService>;
  let service: SafeWebhookHttpService;

  beforeEach(async () => {
    jest.clearAllMocks();

    ssrf = {
      validateStructure: jest.fn(),
      resolveSafeAddress: jest.fn(),
      assertSafeForWrite: jest.fn(),
    } as unknown as jest.Mocked<SsrfProtectionService>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        SafeWebhookHttpService,
        { provide: SsrfProtectionService, useValue: ssrf },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def: unknown) => {
              const overrides: Record<string, unknown> = {
                "app.webhookMaxRedirects": 3,
                "app.webhookRequestTimeoutMs": 5000,
              };
              return overrides[key] ?? def;
            },
          },
        },
      ],
    }).compile();

    service = moduleRef.get(SafeWebhookHttpService);
  });

  it("delivers successfully to an allowed public destination", async () => {
    ssrf.validateStructure.mockReturnValue({
      url: new URL("https://public.example.com/hook"),
      hostname: "public.example.com",
    });
    ssrf.resolveSafeAddress.mockResolvedValue({
      address: "93.184.216.34",
      family: 4,
    });
    mockedAxios.post.mockResolvedValue({ status: 200, headers: {} });

    const result = await service.post(
      "https://public.example.com/hook",
      { hello: "world" },
      { "Content-Type": "application/json" },
    );

    expect(result.success).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(ssrf.resolveSafeAddress).toHaveBeenCalledWith("public.example.com");
  });

  it("does not follow a redirect to an internal address", async () => {
    // Hop 0: public URL responds with a redirect to an internal address.
    ssrf.validateStructure.mockImplementationOnce((url: string) => ({
      url: new URL(url),
      hostname: new URL(url).hostname,
    }));
    ssrf.resolveSafeAddress.mockResolvedValueOnce({
      address: "93.184.216.34",
      family: 4,
    });
    mockedAxios.post.mockResolvedValueOnce({
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data/" },
    });

    // Hop 1: re-validating the redirect target must fail because it's an
    // internal / link-local address.
    ssrf.validateStructure.mockImplementationOnce(() => {
      throw new Error("blocked scheme/host");
    });

    const result = await service.post(
      "https://public.example.com/hook",
      { hello: "world" },
      {},
    );

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("invalid_destination");
    // Only the first hop's structure/DNS should ever have led to a real
    // network call; the second hop must never reach axios.post again with
    // the internal URL.
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it("blocks a hostname that resolves to a private address at request time (DNS rebinding)", async () => {
    ssrf.validateStructure.mockReturnValue({
      url: new URL("https://rebinder.example.com/hook"),
      hostname: "rebinder.example.com",
    });
    ssrf.resolveSafeAddress.mockRejectedValue(
      new Error("resolves to a non-public address"),
    );

    const result = await service.post(
      "https://rebinder.example.com/hook",
      {},
      {},
    );

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("invalid_destination");
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("returns a generic failure reason on network errors instead of leaking error detail", async () => {
    ssrf.validateStructure.mockReturnValue({
      url: new URL("https://public.example.com/hook"),
      hostname: "public.example.com",
    });
    ssrf.resolveSafeAddress.mockResolvedValue({
      address: "93.184.216.34",
      family: 4,
    });
    const err: any = new Error("connect ECONNREFUSED 93.184.216.34:443");
    err.code = "ECONNREFUSED";
    mockedAxios.post.mockRejectedValue(err);
    (mockedAxios.isAxiosError as unknown as jest.Mock) = jest
      .fn()
      .mockReturnValue(true);

    const result = await service.post(
      "https://public.example.com/hook",
      {},
      {},
    );

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("unreachable");
    expect(result.failureReason).not.toMatch(/ECONNREFUSED/);
    expect(result.failureReason).not.toMatch(/93\.184\.216\.34/);
  });

  it("stops after the configured max redirects", async () => {
    ssrf.validateStructure.mockImplementation((url: string) => ({
      url: new URL(url),
      hostname: new URL(url).hostname,
    }));
    ssrf.resolveSafeAddress.mockResolvedValue({
      address: "93.184.216.34",
      family: 4,
    });
    mockedAxios.post.mockResolvedValue({
      status: 302,
      headers: { location: "https://public.example.com/next" },
    });

    const result = await service.post(
      "https://public.example.com/start",
      {},
      {},
    );

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("too_many_redirects");
  });
});
