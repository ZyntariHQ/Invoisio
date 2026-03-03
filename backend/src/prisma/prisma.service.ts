import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import * as PrismaPkg from "@prisma/client";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  // allow dynamic access to generated client's properties (user, invoice, etc.)
  [key: string]: any;

  private client: any;

  constructor() {
    // Use runtime require to avoid TypeScript resolution issues with generated client types.
    // The generated client is created by `npx prisma generate` and provides `PrismaClient` at runtime.
    // We instantiate it and copy its members onto `this` so existing code can call `prisma.user.findUnique(...)`.
    // Using `any` keeps TS happy when client types are not resolvable.

    const maybe: any = PrismaPkg as any;
    const PrismaClient =
      maybe.PrismaClient ??
      maybe.default?.PrismaClient ??
      maybe.default ??
      maybe;
    this.client = new PrismaClient();
    Object.assign(this, this.client);
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
