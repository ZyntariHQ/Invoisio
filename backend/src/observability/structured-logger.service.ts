import { Injectable } from "@nestjs/common";
import { RequestContextService } from "./request-context.service";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type StructuredLogFields = Record<string, unknown>;

@Injectable()
export class StructuredLogger {
  constructor(private readonly requestContext: RequestContextService) {}

  debug(message: string, fields?: StructuredLogFields): void {
    this.write("debug", message, fields);
  }

  info(message: string, fields?: StructuredLogFields): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields?: StructuredLogFields): void {
    this.write("warn", message, fields);
  }

  error(message: string, fields?: StructuredLogFields): void {
    this.write("error", message, fields);
  }

  private write(
    level: LogLevel,
    message: string,
    fields?: StructuredLogFields,
  ): void {
    const ctx = this.requestContext.getStore();
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
      ...(ctx?.traceId ? { traceId: ctx.traceId } : {}),
      ...(ctx?.workerRunId ? { workerRunId: ctx.workerRunId } : {}),
      ...(ctx?.workerName ? { workerName: ctx.workerName } : {}),
      ...(ctx?.httpMethod ? { httpMethod: ctx.httpMethod } : {}),
      ...(ctx?.httpPath ? { httpPath: ctx.httpPath } : {}),
      ...(ctx?.merchantId ? { merchantId: ctx.merchantId } : {}),
      ...(ctx?.userId ? { userId: ctx.userId } : {}),
      ...fields,
    };

    const line = JSON.stringify(entry);
    if (level === "error") {
      console.error(line);
      return;
    }
    if (level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  }
}
