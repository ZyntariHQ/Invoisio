import { Global, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { CorrelationIdMiddleware } from "./correlation-id.middleware";
import { HttpExceptionFilter } from "./http-exception.filter";
import { LoggingInterceptor } from "./logging.interceptor";
import { RequestContextService } from "./request-context.service";
import { StructuredLogger } from "./structured-logger.service";

@Global()
@Module({
  providers: [
    RequestContextService,
    StructuredLogger,
    CorrelationIdMiddleware,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
  exports: [RequestContextService, StructuredLogger],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes("*");
  }
}
