import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Bootstrap the NestJS application
 * 
 * Features:
 * - Port 3001 (configurable via PORT env var)
 * - CORS enabled for frontend (localhost:3000)
 * - Global validation pipe for DTOs
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Get config service
  const configService = app.get(ConfigService);
  
  // Enable CORS for frontend
  const corsOrigin = configService.get('app.corsOrigin');
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));
  
  // Get port from config
  const port = configService.get('app.port');
  
  await app.listen(port);
  
  const stellarConfig = configService.get('stellar');
  const network = stellarConfig?.networkPassphrase?.includes('Test') ? 'testnet' : 'mainnet';
  
  console.log(`🚀 Invoisio Backend running on: http://localhost:${port}`);
  console.log(`📡 Health check: http://localhost:${port}/health`);
  console.log(`🧾 Invoices API: http://localhost:${port}/invoices`);
  console.log(`🌐 Stellar Network: ${network}`);
  console.log(`\n✨ Ready for Stellar payments!`);
}

bootstrap();
