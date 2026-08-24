import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { writeFileSync } from "fs";
import { join } from "path";

/**
 * Bootstrap the NestJS application
 *
 * Features:
 * - Port 3001 (configurable via PORT env var)
 * - CORS enabled for frontend (localhost:3000)
 * - Global validation pipe for DTOs
 * - OpenAPI/Swagger docs at /api/docs (non-production only)
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Get config service
  const configService = app.get(ConfigService);

  // Enable CORS for frontend
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

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // OpenAPI / Swagger — serve only outside production
  const nodeEnv =
    configService.get<string>("app.nodeEnv") ?? process.env.NODE_ENV;
  if (nodeEnv !== "production") {
    const config = new DocumentBuilder()
      .setTitle("Invoisio API")
      .setDescription(
        "Invoisio backend API — invoices, payments, merchants, webhooks and notifications",
      )
      .setVersion("1.0")
      .addBearerAuth(
        { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        "access-token",
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);

    // Serve interactive docs at /api/docs
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    // Emit openapi.json as build artifact so it can be committed and diffed in CI
    const outputPath = join(process.cwd(), "openapi.json");
    writeFileSync(outputPath, JSON.stringify(document, null, 2), "utf8");
    console.log(`📄 OpenAPI spec written to ${outputPath}`);
  }

  // Get port from config
  const port = configService.get("app.port");

  await app.listen(port);

  const stellarConfig = configService.get("stellar");
  const network = stellarConfig?.networkPassphrase?.includes("Test")
    ? "testnet"
    : "mainnet";

  console.log(`🚀 Invoisio Backend running on: http://localhost:${port}`);
  console.log(`❤ Health check: http://localhost:${port}/health`);
  console.log(`📋 Invoices API: http://localhost:${port}/invoices`);
  if (nodeEnv !== "production") {
    console.log(`📖 API Docs: http://localhost:${port}/api/docs`);
  }
  console.log(`🌐 Stellar Network: ${network}`);
  console.log(`\n⚡ Ready for Stellar payments!`);
}

bootstrap();
