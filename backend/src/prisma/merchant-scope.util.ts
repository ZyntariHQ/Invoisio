type PrismaQueryParams = {
  model?: string;
  action: string;
  args?: Record<string, any>;
};

type LoggerLike = {
  error: (message: string) => void;
};

const TENANT_SCOPED_MODELS = new Set(["Invoice", "User"]);

export function applyMerchantScope(
  params: PrismaQueryParams,
  merchantId: string | undefined,
  logger: LoggerLike,
) {
  if (!merchantId || !params.model || !TENANT_SCOPED_MODELS.has(params.model)) {
    return params;
  }

  const args = (params.args ??= {});
  const hasMerchantFilter = hasMerchantFilterInWhere(args.where);
  const requiresWhereFilterCheck = shouldCheckWhere(params.action);
  const allowsAutoWhereScoping = canAutoScopeWhere(params.action);

  if (params.action === "create" && args.data) {
    args.data = {
      ...args.data,
      merchantId: args.data.merchantId ?? merchantId,
    };
  }

  if (params.action === "createMany" && Array.isArray(args.data)) {
    args.data = args.data.map((record: Record<string, unknown>) => ({
      ...record,
      merchantId: record.merchantId ?? merchantId,
    }));
  }

  if (params.action === "upsert" && args.create) {
    args.create = {
      ...args.create,
      merchantId: args.create.merchantId ?? merchantId,
    };
  }

  if (requiresWhereFilterCheck && !hasMerchantFilter) {
    logger.error(
      `[TenantScope] ${params.model}.${params.action} missing merchant filter`,
    );

    if (allowsAutoWhereScoping) {
      args.where = withMerchantFilter(args.where, merchantId);
    }
  }

  return params;
}

function shouldCheckWhere(action: string): boolean {
  return [
    "findMany",
    "findFirst",
    "findUnique",
    "count",
    "aggregate",
    "groupBy",
    "update",
    "updateMany",
    "delete",
    "deleteMany",
    "upsert",
  ].includes(action);
}

function canAutoScopeWhere(action: string): boolean {
  return [
    "findMany",
    "findFirst",
    "count",
    "aggregate",
    "groupBy",
    "updateMany",
    "deleteMany",
  ].includes(action);
}

function withMerchantFilter(where: unknown, merchantId: string) {
  if (!where || typeof where !== "object") {
    return { merchantId };
  }

  return {
    AND: [where, { merchantId }],
  };
}

function hasMerchantFilterInWhere(where: unknown): boolean {
  if (!where || typeof where !== "object") {
    return false;
  }

  const w = where as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(w, "merchantId")) {
    return true;
  }

  const and = w.AND;
  if (
    (Array.isArray(and) &&
      and.some((entry) => hasMerchantFilterInWhere(entry))) ||
    hasMerchantFilterInWhere(and)
  ) {
    return true;
  }

  const or = w.OR;
  if (
    (Array.isArray(or) &&
      or.some((entry) => hasMerchantFilterInWhere(entry))) ||
    hasMerchantFilterInWhere(or)
  ) {
    return true;
  }

  const not = w.NOT;
  if (
    (Array.isArray(not) &&
      not.some((entry) => hasMerchantFilterInWhere(entry))) ||
    hasMerchantFilterInWhere(not)
  ) {
    return true;
  }

  return false;
}
