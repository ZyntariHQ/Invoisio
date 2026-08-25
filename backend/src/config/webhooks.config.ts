import { registerAs } from "@nestjs/config";

export default registerAs("webhooks", () => ({
  retentionDays: parseInt(process.env.WEBHOOK_RETENTION_DAYS || "90", 10),
}));
