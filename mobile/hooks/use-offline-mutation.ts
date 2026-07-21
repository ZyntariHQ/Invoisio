import { useState, useCallback } from "react";
import { offlineQueue } from "../lib/offline-queue";
import { useConnectivity } from "./use-connectivity";

export interface OfflineMutationOptions<TData, TError> {
  onSuccess?: (data: TData) => void;
  onError?: (error: TError) => void;
  onQueue?: () => void;
  retryOnConnect?: boolean;
}

export function useOfflineMutation<TData = any, TError = any>(
  mutationFn: (variables: any) => Promise<TData>,
  options: OfflineMutationOptions<TData, TError> = {}
) {
  const [isLoading, setIsLoading] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [error, setError] = useState<TError | null>(null);
  const [data, setData] = useState<TData | null>(null);
  const { isOffline } = useConnectivity();

  const mutate = useCallback(
    async (variables: any) => {
      setIsLoading(true);
      setError(null);

      try {
        // If offline, queue the request
        if (isOffline) {
          const queueId = await offlineQueue.enqueue(
            window.location.href, // Should be replaced with actual API URL
            "POST",
            variables
          );
          setIsQueued(true);
          options.onQueue?.();
          setIsLoading(false);
          return;
        }

        // Try the mutation
        const result = await mutationFn(variables);
        setData(result);
        options.onSuccess?.(result);
        setIsLoading(false);
        return result;
      } catch (err) {
        const error = err as TError;
        setError(error);

        // If request failed due to network, queue it
        if (
          err instanceof Error &&
          (err.message.includes("Network") ||
            err.message.includes("Failed to fetch"))
        ) {
          await offlineQueue.enqueue(window.location.href, "POST", variables);
          setIsQueued(true);
          options.onQueue?.();
        } else {
          options.onError?.(error);
        }
        setIsLoading(false);
        throw error;
      }
    },
    [isOffline, mutationFn, options]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
    setIsQueued(false);
  }, []);

  return {
    mutate,
    isLoading,
    isQueued,
    error,
    data,
    reset,
  };
}