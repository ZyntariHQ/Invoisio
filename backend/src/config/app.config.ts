import { registerAs } from '@nestjs/config';

/**
 * Application configuration
 * Reads from environment variables with sensible defaults
 */
export default registerAs('app', () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  version: '0.0.1',
}));
