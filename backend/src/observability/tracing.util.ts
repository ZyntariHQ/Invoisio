import { randomUUID } from "node:crypto";
import { StructuredLogger } from "./structured-logger.service";

export type TraceCategory = "database" | "network";

export type TraceOptions = {
  operation: string;
  category: TraceCategory;
  slowThresholdMs: number;
  attributes?: Record<string, unknown>;
};

export async function traceAsync<T>(
  logger: StructuredLogger,
  options: TraceOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  const spanId = randomUUID();

  logger.debug("span.start", {
    spanId,
    operation: options.operation,
    category: options.category,
    ...options.attributes,
  });

  try {
    const result = await fn();
    const durationMs = Date.now() - startedAt;
    const slow = durationMs >= options.slowThresholdMs;

    const payload = {
      spanId,
      operation: options.operation,
      category: options.category,
      durationMs,
      slow,
      ...options.attributes,
    };

    if (slow) {
      logger.warn("span.slow", payload);
    } else {
      logger.debug("span.complete", payload);
    }

    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.error("span.error", {
      spanId,
      operation: options.operation,
      category: options.category,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      ...options.attributes,
    });
    throw error;
  }
}
