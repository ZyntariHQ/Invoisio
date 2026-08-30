"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useErrorReport } from "@/hooks/use-error-report";
import "./globals.css";

// global-error must include <html> and <body> tags
export default function GlobalError({
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
    <html lang="en">
      <body className="antialiased min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 mb-6">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            A critical error occurred
          </h1>
          <p className="text-gray-500 mb-8">
            We apologize for the inconvenience. Our technical team has been notified.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => reset()}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-lg bg-white border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              Refresh page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
