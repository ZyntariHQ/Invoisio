import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, "id" | "durationMs"> & { durationMs?: number }) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback<ToastContextValue["pushToast"]>((toast) => {
    const id = `toast-${++toastIdCounter}`;
    const item: ToastItem = {
      id,
      title: toast.title,
      description: toast.description,
      variant: toast.variant,
      durationMs: toast.durationMs ?? 3000,
    };
    setToasts((prev) => [...prev, item]);
    if (item.durationMs > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, item.durationMs);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, pushToast, dismissToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:items-end sm:px-0"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const variantStyles: Record<ToastVariant, string> = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-rose-200 bg-rose-50 text-rose-900",
    info: "border-blue-200 bg-blue-50 text-blue-900",
  };

  const variantIcon: Record<ToastVariant, string> = {
    success: "✓",
    error: "!",
    info: "ℹ",
  };

  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ring-1 ring-black/5 backdrop-blur transition-all duration-200 ${
        variantStyles[toast.variant]
      } ${mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
    >
      <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white/80 text-sm font-bold shadow-sm">
        {variantIcon[toast.variant]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-5">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-xs opacity-80 leading-4">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="flex-none rounded p-0.5 opacity-50 transition-opacity hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  const { pushToast, dismissToast } = ctx;

  const success = useCallback(
    (title: string, description?: string, durationMs?: number) => {
      pushToast({ title, description, variant: "success", durationMs });
    },
    [pushToast],
  );

  const error = useCallback(
    (title: string, description?: string, durationMs?: number) => {
      pushToast({ title, description, variant: "error", durationMs });
    },
    [pushToast],
  );

  const info = useCallback(
    (title: string, description?: string, durationMs?: number) => {
      pushToast({ title, description, variant: "info", durationMs });
    },
    [pushToast],
  );

  return { success, error, info, dismiss: dismissToast };
}
