import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { RequestContextService } from "./request-context.service";

const CORRELATION_HEADER = "x-correlation-id";
const REQUEST_ID_HEADER = "x-request-id";

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming =
      this.readHeader(req, CORRELATION_HEADER) ??
      this.readHeader(req, REQUEST_ID_HEADER);
    const correlationId = incoming ?? randomUUID();

    res.setHeader(CORRELATION_HEADER, correlationId);

    void this.requestContext.runWithContext(
      {
        correlationId,
        traceId: correlationId,
        httpMethod: req.method,
        httpPath: req.originalUrl ?? req.url,
      },
      () => {
        next();
      },
    );
  }

  private readHeader(req: Request, name: string): string | undefined {
    const value = req.headers[name];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    return undefined;
  }
}
