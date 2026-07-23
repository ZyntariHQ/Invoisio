import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { RequestContextService } from "./request-context.service";
import { StructuredLogger } from "./structured-logger.service";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly logger: StructuredLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : "Internal server error";

    const correlationId = this.requestContext.getCorrelationId();

    this.logger.error("http.exception", {
      statusCode: status,
      error: typeof message === "string" ? message : JSON.stringify(message),
    });

    response.status(status).json({
      error:
        typeof message === "string"
          ? message
          : (message as { message?: string }).message ||
            "Internal server error",
      correlationId,
      traceId: this.requestContext.getTraceId(),
    });
  }
}
