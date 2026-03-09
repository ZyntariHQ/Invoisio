import { registerAs } from "@nestjs/config";

/**
 * Rate limiting configuration
 * Reads from environment variables with sensible defaults
 */
export default registerAs("throttler", () => ({
  // General rate limiting (fallback)
  ttl: parseInt(process.env.THROTTLE_TTL || "60", 10), // seconds
  limit: parseInt(process.env.THROTTLE_LIMIT || "100", 10), // requests per ttl

  // Auth endpoints rate limiting (stricter)
  authTtl: parseInt(process.env.THROTTLE_AUTH_TTL || "900", 10), // 15 minutes
  authLimit: parseInt(process.env.THROTTLE_AUTH_LIMIT || "5", 10), // 5 attempts per 15 min per IP

  // Invoice creation rate limiting
  invoiceTtl: parseInt(process.env.THROTTLE_INVOICE_TTL || "3600", 10), // 1 hour
  invoiceLimit: parseInt(process.env.THROTTLE_INVOICE_LIMIT || "20", 10), // 20 invoices per hour per user

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || "0", 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || "invoisio:throttle:",
  },
}));
