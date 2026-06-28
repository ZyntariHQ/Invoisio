import { Test, TestingModule } from "@nestjs/testing";
import { RequestContextService } from "./request-context.service";
import { StructuredLogger } from "./structured-logger.service";

describe("RequestContextService", () => {
  let service: RequestContextService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RequestContextService, StructuredLogger],
    }).compile();

    service = module.get(RequestContextService);
  });

  it("propagates correlationId across async boundaries", async () => {
    const seen: string[] = [];

    await service.runWithContext(
      { correlationId: "corr-1", traceId: "corr-1" },
      async () => {
        seen.push(service.getCorrelationId() ?? "");
        await Promise.resolve();
        seen.push(service.getCorrelationId() ?? "");
      },
    );

    expect(seen).toEqual(["corr-1", "corr-1"]);
  });

  it("inherits traceId in child worker context", async () => {
    let childTraceId: string | undefined;

    await service.runWithWorkerContext(
      { workerName: "horizon-watcher", correlationId: "worker-corr" },
      async () => {
        await service.runWithChildContext(
          { correlationId: "horizon:tx-123" },
          async () => {
            childTraceId = service.getTraceId();
          },
        );
      },
    );

    expect(childTraceId).toBe("worker-corr");
  });
});
