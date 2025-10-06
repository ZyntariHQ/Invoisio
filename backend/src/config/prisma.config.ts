import { registerAs } from '@nestjs/config';

export default registerAs('prisma', () => ({
  databaseUrl: process.env.DATABASE_URL,
}));