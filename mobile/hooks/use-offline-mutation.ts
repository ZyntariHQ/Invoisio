import { useState, useCallback } from "react";
import { offlineQueue, QueuedRequest } from "../lib/offline-queue";
import { useConnectivity } from "./use-connectivity";

export interface RequestDescriptor<TVariables = any> {
  url: string | ((variables: TVariables) => string);
  method?: QueuedRequest["method"];
  headers?: Record<string, string> | ((variables: TVariables) => Record<string, string>);
  tag?: string;
}

export interface OfflineMutationOptions<TData = any, TVariables = any, TError = any> {
  descriptor?: RequestDescriptor<TVariables>;
  onSuccess?: (data: TData) => void;
  onError?: (error: TError) => void;
  onQueue?: (queueId?: string) => void;
  retryOnConnect?: boolean;
}

export function useOfflineMutation<TData = any, TVariables = any, TError = any>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: OfflineMutationOptions<TData, TVariables, TError> = {}
) {
  const [isLoading, setIsLoading] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [error, setError] = useState<TError | null>(null);
  const [data, setData] = useState<TData | null>(null);
  const { isOffline } = useConnectivity();

  const resolveDescriptor = useCallback(
    (variables: TVariables) => {
      if (!options.descriptor) return null;
      const url =
        typeof options.descriptor.url === "function"
          ? options.descriptor.url(variables)
          : options.descriptor.url;

      const method = options.descriptor.method ?? "POST";

      const headers =
        typeof options.descriptor.headers === "function"
          ? options.descriptor.headers(variables)
          : options.descriptor.headers ?? {};

      return { url, method, headers, tag: options.descriptor.tag };
    },
    [options.descriptor]
  );

  const mutate = useCallback(
    async (variables: TVariables) => {
      setIsLoading(true);
      setError(null);

      try {
        // If offline, queue the request safely using the request descriptor
        if (isOffline) {
          const desc = resolveDescriptor(variables);
          let queueId: string | undefined;

          if (desc && desc.url) {
            queueId = await offlineQueue.enqueue(
              desc.url,
              desc.method,
              variables,
              desc.headers,
              desc.tag
            );
          }

          setIsQueued(true);
          options.onQueue?.(queueId);
          setIsLoading(false);
          return;
        }

        // Online mutation attempt
        const result = await mutationFn(variables);
        setData(result);
        options.onSuccess?.(result);
        setIsLoading(false);
        return result;
      } catch (err) {
        const error = err as TError;
        setError(error);

        // If request failed due to network unavailability, queue it
        const isNetworkFailure =
          err instanceof Error &&
          (err.message.includes("Network") ||
            err.message.includes("Failed to fetch") ||
            err.message.includes("network") ||
            err.message.includes("fetch failed"));

        if (isNetworkFailure) {
          const desc = resolveDescriptor(variables);
          let queueId: string | undefined;

          if (desc && desc.url) {
            queueId = await offlineQueue.enqueue(
              desc.url,
              desc.method,
              variables,
              desc.headers,
              desc.tag
            );
          }

          setIsQueued(true);
          options.onQueue?.(queueId);
        } else {
          options.onError?.(error);
        }

        setIsLoading(false);
        throw error;
      }
    },
    [isOffline, mutationFn, options, resolveDescriptor]
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