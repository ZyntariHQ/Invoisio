import { defineConfig, env } from "prisma/config";

export default defineConfig({
  datasource: {
    url:
      env("DATABASE_URL") ||
      "postgresql://postgres:postgres@localhost:5432/postgres?schema=public",
  },
});
