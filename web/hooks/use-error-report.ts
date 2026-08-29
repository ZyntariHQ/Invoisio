import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { getLastCorrelationId } from '@/lib/api-client';

export interface ErrorReportOptions {
  /** Exclude sending reports in local development */
  enabled?: boolean;
}

export function useErrorReport(options: ErrorReportOptions = {}) {
  const pathname = usePathname();
  
  // Default to false in development, true in production
  const enabled = options.enabled ?? process.env.NODE_ENV === 'production';

  const reportError = useCallback(
    (error: Error, errorInfo?: React.ErrorInfo) => {
      const correlationId = getLastCorrelationId();
      
      const errorReport = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo?.componentStack,
        route: pathname,
        correlationId,
        timestamp: new Date().toISOString(),
      };

      if (enabled) {
        // In a real application, you would send this to a backend endpoint or error tracking service (e.g., Sentry)
        // fetch('/api/metrics/errors', { method: 'POST', body: JSON.stringify(errorReport) });
        console.error('[Error Reporter - Prod Mode]', errorReport);
      } else {
        // In local development, just log it out clearly so developers see what would have been reported.
        console.error('[Error Reporter - Dev Mode] Suppressed error report:', errorReport);
      }
    },
    [pathname, enabled]
  );

  return { reportError };
}
