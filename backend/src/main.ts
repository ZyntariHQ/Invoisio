import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { writeFileSync } from "fs";
import { join } from "path";
import helmet from "helmet";
import express from "express";

/**
 * Bootstrap the NestJS application
 *
 * Features:
 * - Port 3001 (configurable via PORT env var)
 * - CORS enabled for frontend (localhost:3000)
 * - Global validation pipe for DTOs
 * - OpenAPI/Swagger docs at /api/docs (non-production only)
 * - Graceful shutdown with SIGTERM/SIGINT handling
 * - Security headers with Helmet
 * - Request body size limit (10MB)
 */
async function bootstrap() {
  const app =
    await NestFactory.create<
      import("@nestjs/platform-express").NestExpressApplication
    >(AppModule);
  app.set("trust proxy", 1);

  // Get config service
  const configService = app.get(ConfigService);

  // ─── Security Headers ─────────────────────────────────────────────
  app.use(helmet());

  // ─── Request Body Size Limit ─────────────────────────────────────
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // ─── CORS ──────────────────────────────────────────────────────────
  const corsOrigin = configService.get("app.corsOrigin");
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Correlation-ID",
      "X-Request-ID",
    ],
    exposedHeaders: ["X-Correlation-ID"],
  });

  // ─── Global Validation Pipe ──────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // ─── OpenAPI / Swagger ────────────────────────────────────────────
  const nodeEnv =
    configService.get<string>("app.nodeEnv") ?? process.env.NODE_ENV;

  if (nodeEnv !== "production") {
    const config = new DocumentBuilder()
      .setTitle("Invoisio API")
      .setDescription("Invoice and payment management API")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);

    // Write OpenAPI spec to file for client generation
    try {
      writeFileSync(
        join(process.cwd(), "openapi.json"),
        JSON.stringify(document, null, 2),
      );
    } catch (error) {
      console.warn("Failed to write OpenAPI spec:", error.message);
    }
  }

  // ─── Enable Shutdown Hooks ────────────────────────────────────────
  app.enableShutdownHooks();

  // ─── Get Port ──────────────────────────────────────────────────────
  const port = configService.get<number>("app.port") ?? 3001;

  // ─── Start Server ─────────────────────────────────────────────────
  await app.listen(port);

  console.log(` Application running on http://localhost:${port}`);
  if (nodeEnv !== "production") {
    console.log(` Swagger docs: http://localhost:${port}/api/docs`);
  }
  console.log(` Security headers enabled (Helmet)`);
  console.log(` Request body limit: 10MB`);
  console.log(` Graceful shutdown enabled (SIGTERM/SIGINT)`);
}

// ─── Handle Unhandled Rejections ──────────────────────────────────
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Application specific logging, throwing an error, or other logic here
});

bootstrap();
