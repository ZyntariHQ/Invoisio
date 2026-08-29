import { UNSCOPED_MERCHANT_CONTEXT } from "./merchant-context.service";

type PrismaQueryParams = {
  model?: string;
  action: string;
  args?: Record<string, any>;
};

type LoggerLike = {
  error: (message: string) => void;
};

const TENANT_SCOPED_MODELS = new Set([
  "ActivityEvent",
  "Customer",
  "Invoice",
  "InvoiceEngagementEvent",
  "Merchant",
  "MerchantActivationChecklist",
  "Payment",
  "PaymentReview",
  "ProcessedEvent",
  "PushNotification",
  "RecurringInvoiceRun",
  "RecurringSchedule",
  "User",
  "WebhookDeadLetter",
  "WebhookDelivery"
]);

export function applyMerchantScope(
  params: PrismaQueryParams,
  merchantId: string | typeof UNSCOPED_MERCHANT_CONTEXT | undefined,
  logger: LoggerLike,
) {
  if (!params.model || !TENANT_SCOPED_MODELS.has(params.model)) {
    return params;
  }

  if (merchantId === UNSCOPED_MERCHANT_CONTEXT) {
    return params;
  }

  if (!merchantId) {
    logger.error(
      `[TenantScope] ${params.model}.${params.action} executed without a merchant context`,
    );
    return params;
  }

  const isMerchantRoot = params.model === "Merchant";
  const tenantKey = isMerchantRoot ? "id" : "merchantId";

  const args = (params.args ??= {});
  const hasMerchantFilter = hasMerchantFilterInWhere(args.where, tenantKey);
  const requiresWhereFilterCheck = shouldCheckWhere(params.action);
  const allowsAutoWhereScoping = canAutoScopeWhere(params.action);

  if (params.action === "create" && args.data && !isMerchantRoot) {
    args.data = {
      ...args.data,
      [tenantKey]: args.data[tenantKey] ?? merchantId,
    };
  }

  if (params.action === "createMany" && Array.isArray(args.data) && !isMerchantRoot) {
    args.data = args.data.map((record: Record<string, unknown>) => ({
      ...record,
      [tenantKey]: record[tenantKey] ?? merchantId,
    }));
  }

  if (params.action === "upsert" && args.create && !isMerchantRoot) {
    args.create = {
      ...args.create,
      [tenantKey]: args.create[tenantKey] ?? merchantId,
    };
  }

  if (requiresWhereFilterCheck && !hasMerchantFilter) {
    logger.error(
      `[TenantScope] ${params.model}.${params.action} missing merchant filter`,
    );

    if (allowsAutoWhereScoping) {
      args.where = withMerchantFilter(args.where, merchantId, tenantKey);
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

function withMerchantFilter(where: unknown, merchantId: string, tenantKey: string) {
  if (!where || typeof where !== "object") {
    return { [tenantKey]: merchantId };
  }

  return {
    AND: [where, { [tenantKey]: merchantId }],
  };
}

function hasMerchantFilterInWhere(where: unknown, tenantKey: string): boolean {
  if (!where || typeof where !== "object") {
    return false;
  }

  const w = where as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(w, tenantKey)) {
    return true;
  }

  const and = w.AND;
  if (
    (Array.isArray(and) &&
      and.some((entry) => hasMerchantFilterInWhere(entry, tenantKey))) ||
    hasMerchantFilterInWhere(and, tenantKey)
  ) {
    return true;
  }

  const or = w.OR;
  if (
    (Array.isArray(or) &&
      or.some((entry) => hasMerchantFilterInWhere(entry, tenantKey))) ||
    hasMerchantFilterInWhere(or, tenantKey)
  ) {
    return true;
  }

  const not = w.NOT;
  if (
    (Array.isArray(not) &&
      not.some((entry) => hasMerchantFilterInWhere(entry, tenantKey))) ||
    hasMerchantFilterInWhere(not, tenantKey)
  ) {
    return true;
  }

  return false;
}
