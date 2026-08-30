import { registerAs } from "@nestjs/config";

/**
 * Application configuration
 * Reads from environment variables with sensible defaults
 */
export default registerAs("app", () => ({
  port: parseInt(process.env.PORT || "3001", 10),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  version: "0.0.1",

  /**
   * SECURITY: SSRF escape hatch for local development / CI only.
   *
   * When true, webhook URLs are allowed to target loopback / localhost
   * over plain HTTP. This must be `false` (the default) in every
   * deployed environment. It is never read from anywhere except the
   * webhook validation and delivery paths.
   */
  allowLocalWebhooks: process.env.ALLOW_LOCAL_WEBHOOKS === "true",

  /**
   * Maximum number of HTTP redirects the webhook delivery client will
   * follow. Each hop is re-validated against the SSRF blocklist before
   * being followed. Keep this small.
   */
  webhookMaxRedirects: parseInt(process.env.WEBHOOK_MAX_REDIRECTS || "3", 10),

  /**
   * Per-request timeout (ms) for outbound webhook deliveries and test
   * deliveries.
   */
  webhookRequestTimeoutMs: parseInt(
    process.env.WEBHOOK_REQUEST_TIMEOUT_MS || "10000",
    10,
  ),
}));
