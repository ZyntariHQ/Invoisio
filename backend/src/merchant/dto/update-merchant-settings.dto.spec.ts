import "reflect-metadata";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { useContainer } from "class-validator";
import { UpdateMerchantSettingsDto } from "./update-merchant-settings.dto";
import { IsSafeWebhookUrlConstraint } from "../../common/validators/is-safe-webhook-url.validator";

class FakeContainer {
  private allowLocalWebhooks: boolean;

  constructor(allowLocalWebhooks: boolean) {
    this.allowLocalWebhooks = allowLocalWebhooks;
  }

  get(_type: any) {
    if (_type === IsSafeWebhookUrlConstraint) {
      return new IsSafeWebhookUrlConstraint({
        get: () => this.allowLocalWebhooks,
      } as any);
    }
    return new _type();
  }
}

async function validateUrl(
  url: string | undefined,
  allowLocalWebhooks = false,
) {
  useContainer(new FakeContainer(allowLocalWebhooks), {
    fallbackOnErrors: true,
  });
  const dto = plainToInstance(UpdateMerchantSettingsDto, { webhookUrl: url });
  return validate(dto);
}

describe("UpdateMerchantSettingsDto", () => {
  it("accepts a valid https URL", async () => {
    const errors = await validateUrl("https://webhooks.example.com/hook");
    expect(errors).toHaveLength(0);
  });

  it("rejects plain http by default", async () => {
    const errors = await validateUrl("http://example.com/hook");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects non-http(s) schemes", async () => {
    const errors = await validateUrl("ftp://example.com/hook");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects URLs with embedded credentials", async () => {
    const errors = await validateUrl("https://user:pass@example.com/hook");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects literal loopback hosts even over https, without needing DNS", async () => {
    for (const url of [
      "https://127.0.0.1/hook",
      "https://localhost/hook",
      "https://[::1]/hook",
    ]) {
      const errors = await validateUrl(url);
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it("does not itself resolve DNS for non-loopback hostnames (deferred to SsrfProtectionService)", async () => {
    // 10.x and 169.254.x here are literal IPs in the URL, which this
    // decorator does NOT special-case (only exact loopback literals are
    // checked synchronously) - the private-range check for these happens
    // in SsrfProtectionService.assertSafeForWrite via DNS/IP inspection,
    // called from MerchantsService.updateSettings before persisting.
    for (const url of [
      "https://10.0.0.5/hook",
      "https://169.254.169.254/latest/meta-data/",
    ]) {
      const errors = await validateUrl(url);
      expect(errors).toHaveLength(0);
    }
  });

  it("allows http://localhost only when the local-dev escape hatch is enabled", async () => {
    const blocked = await validateUrl("http://localhost:4000/hook", false);
    expect(blocked.length).toBeGreaterThan(0);

    const allowed = await validateUrl("http://localhost:4000/hook", true);
    expect(allowed).toHaveLength(0);
  });

  it("is optional", async () => {
    const errors = await validateUrl(undefined);
    expect(errors).toHaveLength(0);
  });
});
