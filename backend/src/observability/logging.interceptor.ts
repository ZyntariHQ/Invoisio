import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { Request, Response } from "express";
import { StructuredLogger } from "./structured-logger.service";
import { RequestContextService } from "./request-context.service";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: StructuredLogger,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    const user = (req as Request & { user?: { id?: string; merchantId?: string } })
      .user;
    if (user?.id || user?.merchantId) {
      this.requestContext.setUserContext(user.id, user.merchantId ?? undefined);
    }

    this.logger.info("http.request.start", {
      method: req.method,
      path: req.originalUrl ?? req.url,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.info("http.request.complete", {
            method: req.method,
            path: req.originalUrl ?? req.url,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
          });
        },
        error: (error: unknown) => {
          this.logger.error("http.request.error", {
            method: req.method,
            path: req.originalUrl ?? req.url,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      }),
    );
  }
}
