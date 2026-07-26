import { useEffect, useState } from "react";
import { offlineQueue } from "../lib/offline-queue";

export function useOfflineState() {
  const [queueSize, setQueueSize] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const unsubscribe = offlineQueue.subscribe(() => {
      setQueueSize(offlineQueue.getQueueSize());
    });
    setQueueSize(offlineQueue.getQueueSize());
    return unsubscribe;
  }, []);

  const processQueue = async () => {
    setIsProcessing(true);
    try {
      await offlineQueue.processQueue(
        () => console.log("Request processed"),
        (request, error) => console.error(`Failed: ${request.id}`, error)
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    queueSize,
    isProcessing,
    processQueue,
    clearQueue: offlineQueue.clearQueue.bind(offlineQueue),
  };
}