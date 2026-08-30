import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as dns from "dns";
import { isBlockedIpAddress, isLoopbackLiteral } from "./ip-range-blocklist";

export interface SafeUrlStructure {
  url: URL;
  hostname: string;
}

export interface ResolvedSafeAddress {
  address: string;
  family: 4 | 6;
}

/**
 * Centralizes every SSRF-relevant decision about merchant-supplied webhook
 * URLs: allowed schemes, credential stripping, and validating the address a
 * request would actually connect to (not just the hostname).
 *
 * This is deliberately the *only* place that knows about the local-dev
 * escape hatch (`app.allowLocalWebhooks`), so that flag can never be
 * accidentally honored by some other code path.
 */
@Injectable()
export class SsrfProtectionService {
  constructor(private readonly configService: ConfigService) {}

  private get allowLocalWebhooks(): boolean {
    return this.configService.get<boolean>("app.allowLocalWebhooks", false);
  }

  /**
   * Validates scheme, credentials, and general shape of a webhook URL.
   * Does NOT perform DNS resolution - callers that need the request-time
   * guarantee must also call `resolveSafeAddress`.
   */
  validateStructure(rawUrl: string): SafeUrlStructure {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException("webhookUrl must be a valid absolute URL.");
    }

    if (url.username || url.password) {
      throw new BadRequestException(
        "webhookUrl must not contain embedded credentials.",
      );
    }

    const hostname = url.hostname;
    if (!hostname) {
      throw new BadRequestException("webhookUrl must include a hostname.");
    }

    const isLocalTarget = isLoopbackLiteral(hostname);

    if (url.protocol === "https:") {
      // always fine
    } else if (url.protocol === "http:") {
      if (!this.allowLocalWebhooks || !isLocalTarget) {
        throw new BadRequestException(
          "webhookUrl must use https:// (plain http is only permitted for " +
            "localhost when local webhook development is explicitly enabled).",
        );
      }
    } else {
      throw new BadRequestException(
        "webhookUrl must use the http or https scheme.",
      );
    }

    if (isLocalTarget && !this.allowLocalWebhooks) {
      throw new BadRequestException(
        "webhookUrl may not point at localhost or a loopback address.",
      );
    }

    return { url, hostname };
  }

  /**
   * Resolves a hostname to concrete IP addresses and validates every
   * returned address against the SSRF blocklist. Must be called
   * immediately before establishing the actual connection (request-time),
   * not only when the merchant saves the URL, to defend against DNS
   * rebinding.
   *
   * Returns the validated addresses so the caller can pin the connection
   * to one of them and avoid re-resolving (and re-trusting) DNS later.
   */
  async resolveSafeAddress(hostname: string): Promise<ResolvedSafeAddress> {
    // A literal IP in the URL still goes through `dns.lookup`, which
    // resolves it to itself - no special-casing needed.
    let records: dns.LookupAddress[];
    try {
      records = await dns.promises.lookup(hostname, {
        all: true,
        verbatim: true,
      });
    } catch {
      throw new BadRequestException(
        "webhookUrl hostname could not be resolved.",
      );
    }

    if (records.length === 0) {
      throw new BadRequestException(
        "webhookUrl hostname did not resolve to any address.",
      );
    }

    const allowLocal = this.allowLocalWebhooks && isLoopbackLiteral(hostname);

    for (const record of records) {
      const blocked = isBlockedIpAddress(record.address);
      if (blocked && !(allowLocal && isLoopbackLiteral(record.address))) {
        throw new BadRequestException(
          "webhookUrl resolves to a non-public address that cannot be used " +
            "as a webhook destination.",
        );
      }
    }

    const first = records[0];
    return { address: first.address, family: first.family as 4 | 6 };
  }

  /**
   * Convenience helper for write-time validation (DTO/service layer):
   * checks structure and does a best-effort DNS check. This is defense in
   * depth only - the delivery path must independently re-validate at
   * request time, since DNS can change between save and send.
   */
  async assertSafeForWrite(rawUrl: string): Promise<void> {
    const { hostname } = this.validateStructure(rawUrl);
    await this.resolveSafeAddress(hostname);
  }
}
