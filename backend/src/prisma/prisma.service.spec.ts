import { Logger } from "@nestjs/common";
import { prismaExtensionCallback } from "./prisma.service";
import { MerchantContextService } from "./merchant-context.service";
import { StructuredLogger } from "../observability/structured-logger.service";

type Deps = Parameters<typeof prismaExtensionCallback>[0];
type Ctx = Parameters<typeof prismaExtensionCallback>[1];

const buildDeps = (overrides: Partial<Deps> = {}): Deps => ({
  merchantContext: {
    getMerchantId: jest.fn().mockReturnValue("merchant-a"),
  } as unknown as MerchantContextService,
  structuredLogger: { warn: jest.fn() } as unknown as StructuredLogger,
  slowThresholdMs: 200,
  logger: { error: jest.fn() } as unknown as Logger,
  ...overrides,
});

describe("prismaExtensionCallback", () => {
  it("auto-scopes findMany when merchant filter is missing", async () => {
    const deps = buildDeps();
    const query = jest.fn().mockResolvedValue([{ id: "inv-1" }]);

    await prismaExtensionCallback(deps, {
      model: "Invoice",
      operation: "findMany",
      args: { where: { status: "pending" } },
      query,
    });

    expect(deps.logger.error).toHaveBeenCalledWith(
      "[TenantScope] Invoice.findMany missing merchant filter",
    );
    expect(query).toHaveBeenCalledWith({
      where: { AND: [{ status: "pending" }, { merchantId: "merchant-a" }] },
    });
  });

  it("does not modify args when merchant filter is already present", async () => {
    const deps = buildDeps();
    const query = jest.fn().mockResolvedValue([]);

    await prismaExtensionCallback(deps, {
      model: "Invoice",
      operation: "findMany",
      args: { where: { merchantId: "merchant-b" } },
      query,
    });

    expect(deps.logger.error).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith({
      where: { merchantId: "merchant-b" },
    });
  });

  it("creates an empty args object when caller passes none", async () => {
    const deps = buildDeps();
    const query = jest.fn().mockResolvedValue([]);

    await prismaExtensionCallback(deps, {
      model: "Invoice",
      operation: "findMany",
      args: undefined,
      query,
    });

    expect(query).toHaveBeenCalledWith({ where: { merchantId: "merchant-a" } });
  });

  it("injects merchantId into create data", async () => {
    const deps = buildDeps();
    const query = jest.fn().mockResolvedValue({ id: "inv-new" });

    await prismaExtensionCallback(deps, {
      model: "Invoice",
      operation: "create",
      args: { data: { amount: 100 } },
      query,
    });

    expect(query).toHaveBeenCalledWith({
      data: { amount: 100, merchantId: "merchant-a" },
    });
  });

  it("does not enforce scope on models outside TENANT_SCOPED_MODELS", async () => {
    const deps = buildDeps();
    const query = jest.fn().mockResolvedValue([]);

    await prismaExtensionCallback(deps, {
      model: "WebhookDelivery",
      operation: "findMany",
      args: { where: { id: "wd-1" } },
      query,
    });

    expect(deps.logger.error).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith({ where: { id: "wd-1" } });
  });

  it("logs an error when no merchant is in scope for a scoped model", async () => {
    const deps = buildDeps({
      merchantContext: {
        getMerchantId: jest.fn().mockReturnValue(undefined),
      } as unknown as MerchantContextService,
    });
    const query = jest.fn().mockResolvedValue([]);

    await prismaExtensionCallback(deps, {
      model: "Invoice",
      operation: "findMany",
      args: { where: { status: "pending" } },
      query,
    });

    expect(deps.logger.error).toHaveBeenCalledWith(
      "[TenantScope] Invoice.findMany executed without a merchant context",
    );
    expect(query).toHaveBeenCalledWith({ where: { status: "pending" } });
  });

  it("passes args through unchanged when UNSCOPED_MERCHANT_CONTEXT is in scope", async () => {
    const { UNSCOPED_MERCHANT_CONTEXT } = require("./merchant-context.service");
    const deps = buildDeps({
      merchantContext: {
        getMerchantId: jest.fn().mockReturnValue(UNSCOPED_MERCHANT_CONTEXT),
      } as unknown as MerchantContextService,
    });
    const query = jest.fn().mockResolvedValue([]);

    await prismaExtensionCallback(deps, {
      model: "Invoice",
      operation: "findMany",
      args: { where: { status: "pending" } },
      query,
    });

    expect(deps.logger.error).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith({ where: { status: "pending" } });
  });

  it("logs slow queries via structured logger with model.operation label", async () => {
    const deps = buildDeps();
    const query = jest.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return [];
    });

    await prismaExtensionCallback(deps, {
      model: "Invoice",
      operation: "findMany",
      args: {},
      query,
    });

    expect(deps.structuredLogger.warn).toHaveBeenCalledWith(
      "db.query.slow",
      expect.objectContaining({
        category: "database",
        operation: "Invoice.findMany",
        slow: true,
        durationMs: expect.any(Number),
      }),
    );
  });

  it("uses the raw operation label when no model is provided", async () => {
    const deps = buildDeps();
    const query = jest.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return [];
    });

    await prismaExtensionCallback(deps, {
      model: undefined,
      operation: "executeRaw",
      args: undefined,
      query,
    });

    expect(deps.structuredLogger.warn).toHaveBeenCalledWith(
      "db.query.slow",
      expect.objectContaining({ operation: "executeRaw" }),
    );
  });

  it("does not log queries faster than the slow threshold", async () => {
    const deps = buildDeps();
    const query = jest.fn().mockResolvedValue([]);

    await prismaExtensionCallback(deps, {
      model: "Invoice",
      operation: "findMany",
      args: {},
      query,
    });

    expect(deps.structuredLogger.warn).not.toHaveBeenCalled();
  });

  it("returns the underlying query result untouched", async () => {
    const deps = buildDeps();
    const expected = [{ id: "inv-1" }, { id: "inv-2" }];
    const query = jest.fn().mockResolvedValue(expected);

    const result = await prismaExtensionCallback(deps, {
      model: "Invoice",
      operation: "findMany",
      args: { where: { merchantId: "merchant-a" } },
      query,
    });

    expect(result).toBe(expected);
  });
});
