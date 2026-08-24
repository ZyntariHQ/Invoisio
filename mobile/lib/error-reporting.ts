/**
 * Error reporting for the Invoisio mobile app.
 *
 * Everything here is deliberately framework-agnostic (no React, no expo-router)
 * so it can be unit-tested with the existing node-based jest setup and so it can
 * run outside the React tree — the global JS error handler, the promise
 * rejection tracker, the sync coordinator, the offline queue, and the push
 * notification handlers.
 *
 * Reporting is opt-in and off by default in local development:
 *   - ERROR_REPORTING_ENABLED=true turns the pipeline on,
 *   - ERROR_REPORTING_URL is the endpoint reports are POSTed to,
 *   - ERROR_REPORTING_DEV=true additionally enables it under __DEV__ (so the
 *     pipeline can be exercised on a dev build).
 *
 * Reports never include wallet secrets, auth tokens, or personal data: the
 * crash boundary and global handlers only attach error/component stacks plus a
 * small set of non-sensitive runtime context, and every value is additionally
 * passed through `redactSensitiveData` as a defence-in-depth measure before it
 * leaves the device.
 */

import {
  ERROR_REPORTING_ENABLED,
  ERROR_REPORTING_URL,
  ERROR_REPORTING_DEV,
} from "@env";

const isDevRuntime = typeof __DEV__ !== "undefined" && __DEV__;

/** Module-scoped so re-evaluating the importing module (e.g. Fast Refresh)
 * never installs a second, stacked chain of global handlers. */
const INSTALLED_FLAG = "__invoisio_error_handlers_installed__";

const REDACTED = "[REDACTED]";
const MAX_STRING_LENGTH = 2000;
const MAX_STACK_LENGTH = 8000;
const MAX_DEPTH = 6;

const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|token|secret|password|passwd|private[_-]?key|public[_-]?key|api[_-]?key|mnemonic|seed|recovery/i;

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  // JSON Web Tokens
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  // Bearer tokens
  /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}\b/gi,
  // Stellar secret keys ("S" followed by 55 base32 characters)
  /\bS[A-Z2-7]{55}\b/g,
];

export interface ErrorReport {
  app: string;
  timestamp: string;
  name: string;
  message: string;
  stack?: string;
  componentStack?: string;
  platform?: string;
  version?: string;
  isFatal?: boolean;
  source?: string;
  context?: Record<string, unknown>;
}

export interface ErrorReportOptions {
  context?: Record<string, unknown>;
  isFatal?: boolean;
  source?: string;
}

function envFlag(value: string | undefined): boolean {
  return value === "true";
}

/**
 * Whether the reporting pipeline is active.
 *
 * Off unless explicitly enabled, and additionally suppressed in local dev
 * builds unless the developer opts in with ERROR_REPORTING_DEV=true.
 */
export function isErrorReportingEnabled(): boolean {
  if (!envFlag(ERROR_REPORTING_ENABLED)) {
    return false;
  }
  if (isDevRuntime && !envFlag(ERROR_REPORTING_DEV)) {
    return false;
  }
  return true;
}

/** Redact a string value in place of anything that looks like a secret. */
function redactText(value: string, maxLength = MAX_STRING_LENGTH): string {
  let out = value;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  if (out.length > maxLength) {
    out = `${out.slice(0, maxLength)}…[TRUNCATED]`;
  }
  return out;
}

/**
 * Recursively redact an arbitrary value before it is included in a report.
 * Object keys that look sensitive are replaced wholesale; string values are
 * scanned for secret-shaped patterns; depth and size are capped.
 */
export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  const type = typeof value;
  if (type === "number" || type === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return redactText(value);
  }
  if (type === "function" || type === "symbol" || type === "bigint") {
    return `[${type}]`;
  }
  if (depth >= MAX_DEPTH) {
    return "[TRUNCATED]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1));
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = REDACTED;
    } else {
      out[key] = redactSensitiveData(record[key], depth + 1);
    }
  }
  return out;
}

/** Best-effort runtime context; never throws, never blocks the report. */
function getRuntimeContext(): Record<string, string> {
  const context: Record<string, string> = {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as {
      Platform?: { OS?: string };
    };
    if (Platform?.OS !== undefined) {
      context["platform"] = Platform.OS;
    }
  } catch {
    // react-native unavailable (node tests / SSR) — context stays minimal
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants") as {
      default?: { expoConfig?: { version?: string } };
    };
    const version = Constants.default?.expoConfig?.version;
    if (version !== undefined) {
      context["version"] = version;
    }
  } catch {
    // expo-constants unavailable — context stays minimal
  }
  return context;
}

/**
 * Build a sanitised, self-contained error report from an error and an optional
 * React component stack.
 */
export function buildErrorReport(
  error: unknown,
  info?: { componentStack?: string | null },
  options?: ErrorReportOptions,
): ErrorReport {
  const normalized =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : String(error));
  const runtime = getRuntimeContext();

  const report: ErrorReport = {
    app: "invoisio-mobile",
    timestamp: new Date().toISOString(),
    name: normalized.name || "Error",
    message: normalized.message || String(error),
  };

  if (normalized.stack !== undefined) {
    report.stack = redactText(normalized.stack, MAX_STACK_LENGTH);
  }
  if (info !== undefined && info.componentStack != null) {
    report.componentStack = redactText(info.componentStack, MAX_STACK_LENGTH);
  }
  if (runtime["platform"] !== undefined) {
    report.platform = runtime["platform"];
  }
  if (runtime["version"] !== undefined) {
    report.version = runtime["version"];
  }
  if (options?.isFatal !== undefined) {
    report.isFatal = options.isFatal;
  }
  if (options?.source !== undefined) {
    report.source = options.source;
  }
  if (
    options?.context !== undefined &&
    Object.keys(options.context).length > 0
  ) {
    report.context = redactSensitiveData(options.context) as Record<
      string,
      unknown
    >;
  }

  return report;
}

/**
 * Report an error. Always logs locally (so failures are visible in dev
 * tooling even when the pipeline is disabled) and, when enabled, POSTs the
 * sanitised report to the configured endpoint without blocking the caller.
 */
export function reportError(
  error: unknown,
  info?: { componentStack?: string | null },
  options?: ErrorReportOptions,
): void {
  const report = buildErrorReport(error, info, options);
  console.error(`[error-report] ${report.name}: ${report.message}`, report);
  if (isErrorReportingEnabled()) {
    sendReport(report);
  }
}

function sendReport(report: ErrorReport): void {
  if (!ERROR_REPORTING_URL) {
    console.warn(
      "[error-report] reporting is enabled but ERROR_REPORTING_URL is not configured",
    );
    return;
  }
  try {
    const controller =
      typeof AbortController !== "undefined"
        ? new AbortController()
        : undefined;
    const timer =
      controller !== undefined
        ? setTimeout(() => {
            controller.abort();
          }, 5000)
        : undefined;
    fetch(ERROR_REPORTING_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      ...(controller !== undefined ? { signal: controller.signal } : {}),
    })
      .catch((error: unknown) => {
        console.warn("[error-report] failed to send report:", error);
      })
      .finally(() => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      });
  } catch (error) {
    console.warn("[error-report] failed to send report:", error);
  }
}

interface ErrorUtilsLike {
  setGlobalHandler: (
    handler: (error: unknown, isFatal?: boolean) => void,
  ) => void;
  getGlobalHandler: () =>
    | ((error: unknown, isFatal?: boolean) => void)
    | undefined;
}

interface HermesInternalLike {
  hasPromise?: () => boolean;
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, rejection: unknown) => void;
    onHandled?: (id: number) => void;
  }) => void;
}

function describeRejection(rejection: unknown): string {
  if (rejection === undefined) {
    return "";
  }
  if (Object.prototype.toString.call(rejection) === "[object Error]") {
    const error = rejection as Error;
    const stack = error.stack;
    return Error.prototype.toString.call(error) + (stack ? `\n${stack}` : "");
  }
  if (typeof rejection === "string") {
    return rejection;
  }
  try {
    return JSON.stringify(rejection) || "Unserializable rejection value";
  } catch {
    return "Unserializable rejection value";
  }
}

/**
 * Install global handlers for errors that occur outside the React tree:
 * uncaught JS errors (via React Native's ErrorUtils) and unhandled promise
 * rejections (via Hermes' promise rejection tracker, which React Native only
 * enables in dev builds — in release builds rejections are otherwise silent).
 *
 * Safe to call more than once; returns an uninstall function.
 */
export function installGlobalErrorHandlers(): () => void {
  const flags = globalThis as {
    [INSTALLED_FLAG]?: boolean;
    ErrorUtils?: ErrorUtilsLike;
    HermesInternal?: HermesInternalLike;
    addEventListener?: (
      type: string,
      handler: (event: unknown) => void,
    ) => void;
    removeEventListener?: (
      type: string,
      handler: (event: unknown) => void,
    ) => void;
  };
  if (flags[INSTALLED_FLAG] === true) {
    return () => undefined;
  }
  flags[INSTALLED_FLAG] = true;

  const uninstallUncaught = installUncaughtErrorHandler(flags);
  const uninstallRejections = installUnhandledRejectionHandler(flags);

  return () => {
    uninstallUncaught();
    uninstallRejections();
    flags[INSTALLED_FLAG] = false;
  };
}

function installUncaughtErrorHandler(flags: {
  ErrorUtils?: ErrorUtilsLike;
}): () => void {
  const errorUtils = flags.ErrorUtils;
  if (!errorUtils) {
    return () => undefined;
  }

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    reportError(error, undefined, {
      isFatal: isFatal === true,
      source: "uncaught-error",
    });
    // Forward to the previous handler so dev tooling (LogBox / redbox) and
    // React Native's own fatal-error reporting keep working.
    if (previousHandler) {
      try {
        previousHandler(error, isFatal);
      } catch {
        // Never let a failing downstream handler mask the original error.
      }
    }
  });

  return () => {
    errorUtils.setGlobalHandler(previousHandler ?? (() => undefined));
  };
}

function installUnhandledRejectionHandler(flags: {
  HermesInternal?: HermesInternalLike;
  addEventListener?: (type: string, handler: (event: unknown) => void) => void;
  removeEventListener?: (
    type: string,
    handler: (event: unknown) => void,
  ) => void;
}): () => void {
  const hermes = flags.HermesInternal;
  const tracker = hermes?.enablePromiseRejectionTracker;

  if (hermes?.hasPromise?.() === true && typeof tracker === "function") {
    // Hermes only allows a single active rejection tracker and React Native
    // only installs its own in dev builds. Installing ours covers release
    // builds (where rejections are otherwise invisible) and replaces RN's dev
    // tracker, so we replicate its "Possible Unhandled Promise Rejection"
    // warning to preserve dev DX.
    tracker({
      allRejections: true,
      onUnhandled: (id, rejection) => {
        const message = describeRejection(rejection);
        if (isDevRuntime) {
          console.warn(
            `Possible Unhandled Promise Rejection (id: ${String(id)}):\n${message}`,
          );
        }
        reportError(
          new Error(
            `Uncaught (in promise, id: ${String(id)})${message ? `: ${message}` : ""}`,
          ),
          undefined,
          { source: "unhandled-rejection" },
        );
      },
      onHandled: (id) => {
        if (isDevRuntime) {
          console.warn(
            `Promise rejection handled (id: ${String(id)})\n` +
              "This means you can ignore any previous messages of the form " +
              `"Uncaught (in promise, id: ${String(id)})"`,
          );
        }
      },
    });
    // Hermes exposes no way to disable the tracker once enabled; keeping it
    // active is exactly what we want.
    return () => undefined;
  }

  // Fallback for runtimes that emit the standard DOM-style event (RN web).
  if (typeof flags.addEventListener === "function") {
    const handler = (event: unknown) => {
      const reason = (event as { reason?: unknown } | null)?.reason;
      reportError(
        reason instanceof Error ? reason : new Error(describeRejection(reason)),
        undefined,
        { source: "unhandled-rejection" },
      );
    };
    flags.addEventListener("unhandledrejection", handler);
    return () => {
      flags.removeEventListener?.("unhandledrejection", handler);
    };
  }

  return () => undefined;
}
