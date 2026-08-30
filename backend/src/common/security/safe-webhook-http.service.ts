import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosRequestConfig } from "axios";
import * as http from "http";
import * as https from "https";
import { SsrfProtectionService } from "./ssrf-protection.service";

export type WebhookDeliveryFailureCode =
  | "invalid_destination"
  | "unreachable"
  | "timeout"
  | "too_many_redirects"
  | "non_2xx"
  | "unknown";

export interface SafeWebhookPostResult {
  success: boolean;
  httpStatus: number | null;
  durationMs: number;
  failureCode: WebhookDeliveryFailureCode | null;
  /** Short, generic, safe-to-return-to-the-merchant description. */
  failureReason: string | null;
}

/**
 * Outbound HTTP client for webhook deliveries (both real deliveries and
 * test deliveries) that is hardened against SSRF:
 *
 *  - The destination hostname is resolved and validated immediately before
 *    each connection attempt (not just at write time).
 *  - The validated IP address is pinned for that connection via a custom
 *    `lookup` on the socket, so nothing can re-resolve DNS between our
 *    check and the actual TCP/TLS handshake (DNS rebinding).
 *  - Automatic redirect following is disabled. Each redirect hop is
 *    extracted, re-validated from scratch (structure + DNS + IP), and
 *    followed manually, up to a small configured limit.
 *  - Failure details returned to callers are generic categories, not raw
 *    network error text, so this endpoint can't be used as a port/host
 *    reachability oracle against internal infrastructure.
 */
@Injectable()
export class SafeWebhookHttpService {
  private readonly logger = new Logger(SafeWebhookHttpService.name);

  constructor(
    private readonly ssrf: SsrfProtectionService,
    private readonly configService: ConfigService,
  ) {}

  async post(
    initialUrl: string,
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<SafeWebhookPostResult> {
    const startMs = Date.now();
    const maxRedirects = this.configService.get<number>(
      "app.webhookMaxRedirects",
      3,
    );
    const timeout = this.configService.get<number>(
      "app.webhookRequestTimeoutMs",
      10_000,
    );

    let currentUrl = initialUrl;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      let structure;
      let resolved;
      try {
        structure = this.ssrf.validateStructure(currentUrl);
        resolved = await this.ssrf.resolveSafeAddress(structure.hostname);
      } catch {
        return this.result(startMs, {
          success: false,
          httpStatus: null,
          failureCode: "invalid_destination",
          failureReason: "The webhook destination is not a permitted address.",
        });
      }

      const pinnedLookup: (
        hostname: string,
        options: dnsLookupOptions,
        callback: dnsLookupCallback,
      ) => void = (_hostname, options, callback) => {
        if (options && typeof options === "object" && options.all) {
          return callback(null, [
            { address: resolved.address, family: resolved.family },
          ]);
        }
        callback(null, resolved.address, resolved.family);
      };

      const isHttps = structure.url.protocol === "https:";
      const agentOptions = { lookup: pinnedLookup as any };
      const agent = isHttps
        ? new https.Agent(agentOptions)
        : new http.Agent(agentOptions);

      const axiosConfig: AxiosRequestConfig = {
        headers,
        timeout,
        maxRedirects: 0,
        validateStatus: () => true,
        httpAgent: !isHttps ? agent : undefined,
        httpsAgent: isHttps ? agent : undefined,
        // Belt-and-suspenders: some axios versions still consult this.
        proxy: false,
      };

      let response;
      try {
        response = await axios.post(currentUrl, payload, axiosConfig);
      } catch (error: any) {
        return this.result(startMs, this.classifyNetworkError(error));
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers?.location as string | undefined;
        if (!location) {
          return this.result(startMs, {
            success: false,
            httpStatus: response.status,
            failureCode: "non_2xx",
            failureReason: `Endpoint responded with HTTP ${response.status}.`,
          });
        }

        if (hop === maxRedirects) {
          return this.result(startMs, {
            success: false,
            httpStatus: response.status,
            failureCode: "too_many_redirects",
            failureReason: "Endpoint redirected too many times.",
          });
        }

        try {
          currentUrl = new URL(location, currentUrl).toString();
        } catch {
          return this.result(startMs, {
            success: false,
            httpStatus: response.status,
            failureCode: "invalid_destination",
            failureReason: "Endpoint redirected to an invalid location.",
          });
        }
        // loop -> re-validate the new hop from scratch before following it
        continue;
      }

      const success = response.status >= 200 && response.status < 300;
      return this.result(startMs, {
        success,
        httpStatus: response.status,
        failureCode: success ? null : "non_2xx",
        failureReason: success
          ? null
          : `Endpoint responded with HTTP ${response.status}.`,
      });
    }

    return this.result(startMs, {
      success: false,
      httpStatus: null,
      failureCode: "too_many_redirects",
      failureReason: "Endpoint redirected too many times.",
    });
  }

  private classifyNetworkError(error: any): {
    success: false;
    httpStatus: null;
    failureCode: WebhookDeliveryFailureCode;
    failureReason: string;
  } {
    // Deliberately generic: we do not tell the caller whether the failure
    // was DNS, connection refused, TLS, or a timeout at a specific host -
    // that would turn this endpoint into an internal reachability oracle.
    if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
      return {
        success: false,
        httpStatus: null,
        failureCode: "timeout",
        failureReason: "The endpoint did not respond in time.",
      };
    }

    this.logger.debug(
      `Webhook delivery network error (not exposed to caller): ${error?.message}`,
    );

    return {
      success: false,
      httpStatus: null,
      failureCode: "unreachable",
      failureReason: "The endpoint could not be reached.",
    };
  }

  private result(
    startMs: number,
    outcome: {
      success: boolean;
      httpStatus: number | null;
      failureCode: WebhookDeliveryFailureCode | null;
      failureReason: string | null;
    },
  ): SafeWebhookPostResult {
    return {
      ...outcome,
      durationMs: Date.now() - startMs,
    };
  }
}

// Minimal local type aliases so this file doesn't depend on Node's
// internal dns.lookup overload typings, which vary across Node versions.
type dnsLookupOptions = { all?: boolean } & Record<string, unknown>;
type dnsLookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | { address: string; family: number }[],
  family?: number,
) => void;
