import { StructuredLogger } from "./structured-logger.service";
import { RequestContextService } from "./request-context.service";
import { traceAsync } from "./tracing.util";

describe("traceAsync", () => {
  const requestContext = new RequestContextService();
  const logger = new StructuredLogger(requestContext);
  const infoSpy = jest.spyOn(logger, "info").mockImplementation(() => undefined);
  const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
  const debugSpy = jest.spyOn(logger, "debug").mockImplementation(() => undefined);
  const errorSpy = jest.spyOn(logger, "error").mockImplementation(() => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("flags slow network spans", async () => {
    await requestContext.runWithContext(
      { correlationId: "trace-1", traceId: "trace-1" },
      async () => {
        await traceAsync(
          logger,
          {
            operation: "test.slow",
            category: "network",
            slowThresholdMs: 0,
          },
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            return "ok";
          },
        );
      },
    );

    expect(warnSpy).toHaveBeenCalledWith(
      "span.slow",
      expect.objectContaining({
        operation: "test.slow",
        category: "network",
        slow: true,
      }),
    );
    expect(debugSpy).not.toHaveBeenCalledWith(
      "span.complete",
      expect.anything(),
    );
  });

  it("logs span errors", async () => {
    await expect(
      traceAsync(
        logger,
        {
          operation: "test.error",
          category: "database",
          slowThresholdMs: 200,
        },
        async () => {
          throw new Error("db failed");
        },
      ),
    ).rejects.toThrow("db failed");

    expect(errorSpy).toHaveBeenCalledWith(
      "span.error",
      expect.objectContaining({
        operation: "test.error",
        category: "database",
        error: "db failed",
      }),
    );
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
