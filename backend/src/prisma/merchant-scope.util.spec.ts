import { applyMerchantScope } from "./merchant-scope.util";

describe("applyMerchantScope", () => {
  it("logs and auto-scopes findMany queries missing merchant filter", () => {
    const logger = { error: jest.fn() };
    const params: any = {
      model: "Invoice",
      action: "findMany",
      args: {
        where: { status: "pending" },
      },
    };

    applyMerchantScope(params, "merchant-a", logger);

    expect(logger.error).toHaveBeenCalledWith(
      "[TenantScope] Invoice.findMany missing merchant filter",
    );
    expect(params.args.where).toEqual({
      AND: [{ status: "pending" }, { merchantId: "merchant-a" }],
    });
  });

  it("logs when findUnique query is missing merchant filter", () => {
    const logger = { error: jest.fn() };
    const params: any = {
      model: "Invoice",
      action: "findUnique",
      args: {
        where: { id: "invoice-1" },
      },
    };

    applyMerchantScope(params, "merchant-a", logger);

    expect(logger.error).toHaveBeenCalledWith(
      "[TenantScope] Invoice.findUnique missing merchant filter",
    );
    expect(params.args.where).toEqual({ id: "invoice-1" });
  });

  it("does not log when merchant filter is present", () => {
    const logger = { error: jest.fn() };
    const params: any = {
      model: "Invoice",
      action: "findMany",
      args: {
        where: { merchantId: "merchant-a" },
      },
    };

    applyMerchantScope(params, "merchant-a", logger);

    expect(logger.error).not.toHaveBeenCalled();
  });
});
