// import 'dotenv/config';

// export default {
//   datasource: {
//     url: process.env.DATABASE_URL,
//   },
//   migrations: {
//     seed: 'npx ts-node prisma/seed.ts',
//   },
// }

// Prisma configuration for CLI tooling.
// DATABASE_URL must be set in the environment (or .env) before running
// any prisma CLI commands (migrate, generate, studio, etc.).
require("dotenv").config();

// import { defineConfig, env } from "prisma/config";

// export default defineConfig({
//   schema: "prisma/schema.prisma",
//   migrations: {
//     path: "prisma/migrations",
//   },
//   datasource: {
//     url: env("DATABASE_URL"),
//   },
// });
