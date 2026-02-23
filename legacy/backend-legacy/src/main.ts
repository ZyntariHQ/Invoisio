import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ConfigService } from '@nestjs/config';
import { setupSwagger } from '../docs/swagger';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';



async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Get config service
  const configService = app.get(ConfigService);
  
  // Enable CORS
  // app.enableCors({
  //   origin: configService.get('app.corsOrigin'),
  // });

  app.enableCors({
    origin: [
      'http://localhost:3000', 
      'https://invoisio-roan.vercel.app'
    ], // or use your deployed frontend URL
    credentials: true, // Needed if you're using cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  });

  
  app.use(cookieParser());

   app.use(
    csurf({
      cookie: {
        key: '_csrf',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // Important for cross-origin
      },
    }),
  );
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: true,
  }));
  
  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());
  
  // Global response transform interceptor
  app.useGlobalInterceptors(new TransformInterceptor());
  
  // Setup Swagger
  setupSwagger(app);
  
  // Start server
  const port = process.env.PORT || configService.get('app.port') || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://localhost:${port}`);

}
bootstrap();
