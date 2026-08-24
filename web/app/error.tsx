"use client";

import { useEffect } from "react";
import { notFound } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useErrorReport } from "@/hooks/use-error-report";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string; status?: number; response?: { status?: number } };
  reset: () => void;
}) {
  const { reportError } = useErrorReport();

  useEffect(() => {
    // Determine if this is actually a 404 bubbling up as an error
    const is404 =
      error.status === 404 ||
      error.response?.status === 404 ||
      error.message?.includes("404");

    if (is404) {
      // It's a missing resource, trigger Next.js not-found boundary
      notFound();
    } else {
      // It's a real unexpected crash, report it
      reportError(error);
    }
  }, [error, reportError]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 mb-6">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
      <p className="text-gray-500 mb-8 max-w-md">
        An unexpected error occurred while loading this section. Our team has been notified of the issue.
      </p>
      <div className="flex gap-4">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-white border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
