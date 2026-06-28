import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type RequestContextStore = {
  correlationId: string;
  traceId: string;
  workerRunId?: string;
  workerName?: string;
  httpMethod?: string;
  httpPath?: string;
  merchantId?: string;
  userId?: string;
};

export type WorkerContextOptions = {
  workerName: string;
  correlationId?: string;
  attributes?: Record<string, string | undefined>;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  runWithContext<T>(
    store: RequestContextStore,
    callback: () => Promise<T> | T,
  ): Promise<T> {
    return Promise.resolve(this.storage.run(store, callback));
  }

  runWithWorkerContext<T>(
    options: WorkerContextOptions,
    callback: () => Promise<T> | T,
  ): Promise<T> {
    const correlationId = options.correlationId ?? randomUUID();
    const store: RequestContextStore = {
      correlationId,
      traceId: correlationId,
      workerRunId: randomUUID(),
      workerName: options.workerName,
    };
    return this.runWithContext(store, callback);
  }

  runWithChildContext<T>(
    partial: Partial<RequestContextStore>,
    callback: () => Promise<T> | T,
  ): Promise<T> {
    const parent = this.storage.getStore();
    const correlationId =
      partial.correlationId ?? parent?.correlationId ?? randomUUID();
    const store: RequestContextStore = {
      correlationId,
      traceId: parent?.traceId ?? correlationId,
      workerRunId: partial.workerRunId ?? parent?.workerRunId,
      workerName: partial.workerName ?? parent?.workerName,
      httpMethod: partial.httpMethod ?? parent?.httpMethod,
      httpPath: partial.httpPath ?? parent?.httpPath,
      merchantId: partial.merchantId ?? parent?.merchantId,
      userId: partial.userId ?? parent?.userId,
    };
    return this.runWithContext(store, callback);
  }

  getStore(): RequestContextStore | undefined {
    return this.storage.getStore();
  }

  getCorrelationId(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }

  getTraceId(): string | undefined {
    return this.storage.getStore()?.traceId;
  }

  setUserContext(userId?: string, merchantId?: string): void {
    const store = this.storage.getStore();
    if (!store) return;
    if (userId !== undefined) store.userId = userId;
    if (merchantId !== undefined) store.merchantId = merchantId;
  }
}
