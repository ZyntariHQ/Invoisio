"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { useErrorReport } from "@/hooks/use-error-report";

export default function ReceiptError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { reportError } = useErrorReport();

  useEffect(() => {
    reportError(error);
  }, [error, reportError]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="mx-auto max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden p-8 text-center border border-gray-100">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 mb-6">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Unable to Load Receipt Details
        </h1>
        <p className="text-gray-600 mb-8">
          There was a problem loading this receipt. Please try again, or contact the merchant if the issue persists.
        </p>
        <div className="space-y-4">
          <button
            onClick={() => reset()}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-lg bg-white border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    </div>
  );
}
