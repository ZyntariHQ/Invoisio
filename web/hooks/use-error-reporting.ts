import { useCallback } from 'react';

export interface ErrorMetadata {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: string;
  userAgent?: string;
  url?: string;
  userId?: string;
  additionalContext?: Record<string, unknown>;
}

export interface ErrorReport extends ErrorMetadata {
  id: string;
  level: 'error' | 'warning' | 'info';
}

/**
 * Hook for structured error reporting
 * Captures error metadata and provides a consistent interface for error logging
 * Can be extended to integrate with external error reporting services (Sentry, LogRocket, etc.)
 */
export function useErrorReporting() {
  const generateErrorId = useCallback(() => {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const captureError = useCallback(
    (error: Error | string, context?: Record<string, unknown>): ErrorReport => {
      const errorObj = typeof error === 'string' ? new Error(error) : error;
      const errorId = generateErrorId();
      
      const metadata: ErrorMetadata = {
        message: errorObj.message,
        stack: errorObj.stack,
        timestamp: new Date().toISOString(),
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        additionalContext: context,
      };

      const report: ErrorReport = {
        id: errorId,
        level: 'error',
        ...metadata,
      };

      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.group(`[Error Report] ${errorId}`);
        console.error('Error:', errorObj);
        console.log('Metadata:', metadata);
        console.groupEnd();
      }

      // Store in window for ErrorBoundary to access
      if (typeof window !== 'undefined') {
        (window as any).lastErrorReport = report;
      }

      // TODO: Send to external error reporting service
      // Example: Sentry.captureException(errorObj, { extra: context });

      return report;
    },
    [generateErrorId]
  );

  const captureWarning = useCallback(
    (message: string, context?: Record<string, unknown>): ErrorReport => {
      const errorId = generateErrorId();
      
      const metadata: ErrorMetadata = {
        message,
        timestamp: new Date().toISOString(),
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        additionalContext: context,
      };

      const report: ErrorReport = {
        id: errorId,
        level: 'warning',
        ...metadata,
      };

      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.group(`[Warning Report] ${errorId}`);
        console.warn('Warning:', message);
        console.log('Metadata:', metadata);
        console.groupEnd();
      }

      // Store in window for ErrorBoundary to access
      if (typeof window !== 'undefined') {
        (window as any).lastErrorReport = report;
      }

      return report;
    },
    [generateErrorId]
  );

  const captureInfo = useCallback(
    (message: string, context?: Record<string, unknown>): ErrorReport => {
      const errorId = generateErrorId();
      
      const metadata: ErrorMetadata = {
        message,
        timestamp: new Date().toISOString(),
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        additionalContext: context,
      };

      const report: ErrorReport = {
        id: errorId,
        level: 'info',
        ...metadata,
      };

      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.group(`[Info Report] ${errorId}`);
        console.info('Info:', message);
        console.log('Metadata:', metadata);
        console.groupEnd();
      }

      return report;
    },
    [generateErrorId]
  );

  const reportReactError = useCallback(
    (error: Error, errorInfo: React.ErrorInfo): ErrorReport => {
      return captureError(error, {
        componentStack: errorInfo.componentStack,
        errorBoundary: true,
      });
    },
    [captureError]
  );

  return {
    captureError,
    captureWarning,
    captureInfo,
    reportReactError,
  };
}
