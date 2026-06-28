import { registerAs } from "@nestjs/config";

export default registerAs("observability", () => ({
  slowDbThresholdMs: parseInt(
    process.env.SLOW_DB_THRESHOLD_MS || "200",
    10,
  ),
  slowNetworkThresholdMs: parseInt(
    process.env.SLOW_NETWORK_THRESHOLD_MS || "500",
    10,
  ),
}));
