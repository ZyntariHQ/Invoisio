import { useState, useEffect, useRef, useCallback } from "react";
import { DraftService } from "@/lib/draft-service";
import type { DraftInvoice, UpdateDraftDto, CreateDraftDto } from "@/lib/types/draft.types";

/**
 * Configuration for the draft autosave hook
 */
interface UseDraftAutosaveConfig {
  /** Delay in milliseconds before autosave triggers (default: 3000) */
  autosaveDelay?: number;
  /** Minimum interval between autosaves (default: 5000) */
  minAutosaveInterval?: number;
  /** Whether to enable autosave (default: true) */
  enabled?: boolean;
  /** Callback when draft is successfully saved */
  onSave?: (draft: DraftInvoice) => void;
  /** Callback when draft save fails */
  onError?: (error: Error) => void;
  /** Callback when draft is converted to invoice */
  onConvert?: (invoice: unknown) => void;
}

/**
 * Return type for useDraftAutosave hook
 */
interface UseDraftAutosaveReturn {
  /** Current draft data */
  draft: DraftInvoice | null;
  /** Whether draft is currently loading */
  isLoading: boolean;
  /** Whether draft is currently saving */
  isSaving: boolean;
  /** Whether draft is being converted */
  isConverting: boolean;
  /** Error message if any */
  error: string | null;
  /** Last save time */
  lastSavedAt: Date | null;
  /** Update draft fields (triggers autosave) */
  updateDraft: (updates: UpdateDraftDto) => void;
  /** Manually save the draft immediately */
  saveDraft: () => Promise<DraftInvoice>;
  /** Manually trigger autosave (bypasses debounce) */
  triggerAutosave: () => Promise<DraftInvoice>;
  /** Convert draft to invoice */
  convertToInvoice: () => Promise<unknown>;
  /** Discard the draft */
  discardDraft: () => Promise<{ id: string; discarded: boolean }>;
  /** Reset the draft state */
  resetDraft: () => void;
  /** Check if draft has all required fields */
  isComplete: boolean;
  /** Draft completion percentage */
  completionPercentage: number;
  /** Refetch the draft from server */
  refreshDraft: () => Promise<void>;
}

/**
 * Hook for managing draft invoice autosave functionality
 * Handles debounced autosave, error recovery, and draft lifecycle
 */
export function useDraftAutosave(
  draftId?: string,
  config: UseDraftAutosaveConfig = {}
): UseDraftAutosaveReturn {
  const {
    autosaveDelay = 3000,
    minAutosaveInterval = 5000,
    enabled = true,
    onSave,
    onError,
    onConvert,
  } = config;

  const [draft, setDraft] = useState<DraftInvoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<UpdateDraftDto>({});

  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutosaveTimeRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  const isDraftCreatedRef = useRef(false);

  // Load draft on mount or draftId change
  useEffect(() => {
    async function loadDraft() {
      if (!draftId) {
        // Create a new empty draft if no ID provided
        try {
          const newDraft = await DraftService.createDraft({});
          if (isMountedRef.current) {
            setDraft(newDraft);
            isDraftCreatedRef.current = true;
            setLastSavedAt(new Date());
          }
        } catch (err) {
          if (isMountedRef.current) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            setError(`Failed to create draft: ${errorMsg}`);
            onError?.(err instanceof Error ? err : new Error(errorMsg));
          }
        } finally {
          if (isMountedRef.current) {
            setIsLoading(false);
          }
        }
        return;
      }

      try {
        const existingDraft = await DraftService.getDraft(draftId);
        if (isMountedRef.current) {
          setDraft(existingDraft);
          setLastSavedAt(existingDraft.lastAutoSavedAt ? new Date(existingDraft.lastAutoSavedAt) : null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          setError(`Failed to load draft: ${errorMsg}`);
          onError?.(err instanceof Error ? err : new Error(errorMsg));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }

    loadDraft();

    return () => {
      isMountedRef.current = false;
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [draftId, onError]);

  const performAutosaveRef = useRef<(updates: UpdateDraftDto) => Promise<DraftInvoice | void>>(
    async () => {},
  );

  // Debounced autosave
  const performAutosave = useCallback(async (updates: UpdateDraftDto): Promise<DraftInvoice | void> => {
    if (!isMountedRef.current || !enabled) return;
    if (!draft && !isDraftCreatedRef.current) {
      // Draft not yet created, create it first
      try {
        const newDraft = await DraftService.createDraft(updates as CreateDraftDto);
        if (isMountedRef.current) {
          setDraft(newDraft);
          isDraftCreatedRef.current = true;
          setLastSavedAt(new Date());
          onSave?.(newDraft);
        }
        return newDraft;
      } catch (err) {
        if (isMountedRef.current) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          setError(`Failed to create draft: ${errorMsg}`);
          onError?.(err instanceof Error ? err : new Error(errorMsg));
        }
        return;
      }
    }

    // Check if enough time has passed since last autosave
    const now = Date.now();
    if (now - lastAutosaveTimeRef.current < minAutosaveInterval) {
      // Schedule a delayed autosave if too soon
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
      autosaveTimeoutRef.current = setTimeout(() => {
        performAutosaveRef.current(updates);
      }, minAutosaveInterval - (now - lastAutosaveTimeRef.current));
      return;
    }

    const draftToUpdate = draft || { id: draftId };
    if (!draftToUpdate.id) return;

    setIsSaving(true);
    try {
      const updatedDraft = await DraftService.autoSaveDraft(draftToUpdate.id, updates);
      if (isMountedRef.current) {
        setDraft(updatedDraft);
        setLastSavedAt(new Date());
        setPendingUpdates({});
        onSave?.(updatedDraft);
        lastAutosaveTimeRef.current = now;
      }
      return updatedDraft;
    } catch (err) {
      if (isMountedRef.current) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`Autosave failed: ${errorMsg}`);
        onError?.(err instanceof Error ? err : new Error(errorMsg));
      }
      return;
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [draft, draftId, enabled, minAutosaveInterval, onSave, onError]);

  // Keep the ref pointed at the latest performAutosave after every render
  // in which it changes.
  useEffect(() => {
    performAutosaveRef.current = performAutosave;
  }, [performAutosave]);

  // Debounce update function
  const updateDraft = useCallback((updates: UpdateDraftDto) => {
    if (!isMountedRef.current) return;

    // Merge pending updates
    setPendingUpdates((prev) => ({
      ...prev,
      ...updates,
    }));

    // Clear existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    // Schedule autosave
    autosaveTimeoutRef.current = setTimeout(() => {
      const updatesToSave = { ...pendingUpdates, ...updates };
      performAutosaveRef.current(updatesToSave);
    }, autosaveDelay);
  }, [pendingUpdates, autosaveDelay]);

  // Manual save (bypasses debounce)
  const saveDraft = useCallback(async (): Promise<DraftInvoice> => {
    if (!draft && !draftId) {
      throw new Error('No draft exists to save');
    }

    const draftToUpdate = draft || { id: draftId };
    if (!draftToUpdate.id) {
      throw new Error('Draft ID is required');
    }

    // Clear any pending autosave
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }

    setIsSaving(true);
    try {
      const updates = pendingUpdates;
      const updatedDraft = await DraftService.updateDraft(draftToUpdate.id, updates);
      if (isMountedRef.current) {
        setDraft(updatedDraft);
        setLastSavedAt(new Date());
        setPendingUpdates({});
        onSave?.(updatedDraft);
        lastAutosaveTimeRef.current = Date.now();
      }
      return updatedDraft;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Save failed: ${errorMsg}`);
      onError?.(err instanceof Error ? err : new Error(errorMsg));
      throw err;
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [draft, draftId, pendingUpdates, onSave, onError]);

  // Trigger immediate autosave
  const triggerAutosave = useCallback(async (): Promise<DraftInvoice> => {
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    const result = await performAutosave(pendingUpdates);
    if (result) return result;
    if (draft) return draft;
    throw new Error("Autosave did not complete");
  }, [pendingUpdates, performAutosave, draft]);

  // Convert draft to invoice
  const convertToInvoice = useCallback(async () => {
    if (!draft && !draftId) {
      throw new Error('No draft exists to convert');
    }

    const draftToConvert = draft || { id: draftId };
    if (!draftToConvert.id) {
      throw new Error('Draft ID is required');
    }

    // Ensure all pending changes are saved first
    if (Object.keys(pendingUpdates).length > 0) {
      await saveDraft();
    }

    setIsConverting(true);
    try {
      const invoice = await DraftService.convertDraftToInvoice(draftToConvert.id);
      if (isMountedRef.current) {
        onConvert?.(invoice);
      }
      return invoice;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Conversion failed: ${errorMsg}`);
      onError?.(err instanceof Error ? err : new Error(errorMsg));
      throw err;
    } finally {
      if (isMountedRef.current) {
        setIsConverting(false);
      }
    }
  }, [draft, draftId, pendingUpdates, saveDraft, onConvert, onError]);

  // Discard draft
  const discardDraft = useCallback(async () => {
    if (!draft && !draftId) {
      throw new Error('No draft exists to discard');
    }

    const draftToDiscard = draft || { id: draftId };
    if (!draftToDiscard.id) {
      throw new Error('Draft ID is required');
    }

    // Clear any pending autosave
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }

    try {
      const result = await DraftService.discardDraft(draftToDiscard.id);
      if (isMountedRef.current) {
        setDraft(null);
        setPendingUpdates({});
        isDraftCreatedRef.current = false;
      }
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to discard draft: ${errorMsg}`);
      onError?.(err instanceof Error ? err : new Error(errorMsg));
      throw err;
    }
  }, [draft, draftId, onError]);

  // Reset draft state
  const resetDraft = useCallback(() => {
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    setPendingUpdates({});
    setError(null);
  }, []);

  // Refresh draft from server
  const refreshDraft = useCallback(async () => {
    if (!draftId && !draft?.id) return;
    const id = draftId || draft?.id;
    if (!id) return;

    try {
      const refreshedDraft = await DraftService.getDraft(id);
      if (isMountedRef.current) {
        setDraft(refreshedDraft);
        setLastSavedAt(refreshedDraft.lastAutoSavedAt ? new Date(refreshedDraft.lastAutoSavedAt) : null);
        setError(null);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to refresh draft: ${errorMsg}`);
      onError?.(err instanceof Error ? err : new Error(errorMsg));
    }
  }, [draftId, draft?.id, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, []);

  // Computed properties
  const isComplete = draft ? DraftService.isDraftComplete(draft) : false;
  const completionPercentage = draft ? DraftService.getCompletionPercentage(draft) : 0;

  return {
    draft,
    isLoading,
    isSaving,
    isConverting,
    error,
    lastSavedAt,
    updateDraft,
    saveDraft,
    triggerAutosave,
    convertToInvoice,
    discardDraft,
    resetDraft,
    isComplete,
    completionPercentage,
    refreshDraft,
  };
}
