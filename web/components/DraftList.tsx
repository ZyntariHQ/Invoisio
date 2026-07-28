"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, FileText, Clock, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { DraftService } from "@/lib/draft-service";
import type { DraftInvoice } from "@/lib/types/draft.types";

interface DraftListProps {
  onDraftSelected?: (draftId: string) => void;
  onDraftDiscarded?: (draftId: string) => void;
}

/**
 * DraftList component displays all saved drafts for a merchant
 * Allows resuming, discarding, and converting drafts
 */
export function DraftList({ onDraftSelected, onDraftDiscarded }: DraftListProps) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const loadDrafts = useCallback(async (pageNum = 1) => {
    try {
      setIsLoading(true);
      const response = await DraftService.getDrafts(pageNum, 20);
      if (pageNum === 1) {
        setDrafts(response.items);
      } else {
        setDrafts((prev) => [...prev, ...response.items]);
      }
      setHasMore(response.hasMore);
      setTotal(response.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drafts");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const handleDiscard = async (draftId: string) => {
    if (!confirm("Are you sure you want to discard this draft?")) return;

    setDiscardingId(draftId);
    try {
      await DraftService.discardDraft(draftId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      onDraftDiscarded?.(draftId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discard draft");
    } finally {
      setDiscardingId(null);
    }
  };

  const handleResume = (draftId: string) => {
    if (onDraftSelected) {
      onDraftSelected(draftId);
    } else {
      router.push(`/invoices/new?draftId=${draftId}`);
    }
  };

  const handleConvert = async (draftId: string) => {
    try {
      const invoice = await DraftService.convertDraftToInvoice(draftId);
      // Remove from list and navigate to invoice
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      router.push(`/invoices/${(invoice as any).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to convert draft to invoice");
    }
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadDrafts(nextPage);
  };

  const getStatusIcon = (draft: DraftInvoice) => {
    const isComplete = DraftService.isDraftComplete(draft);
    const percentage = DraftService.getCompletionPercentage(draft);

    if (isComplete) {
      return <CheckCircle className="h-5 w-5 text-emerald-500" />;
    }
    if (percentage > 50) {
      return <Clock className="h-5 w-5 text-amber-500" />;
    }
    return <AlertCircle className="h-5 w-5 text-blue-500" />;
  };

  const getStatusText = (draft: DraftInvoice) => {
    const isComplete = DraftService.isDraftComplete(draft);
    const percentage = DraftService.getCompletionPercentage(draft);

    if (isComplete) return "Ready to send";
    if (percentage > 50) return "In progress";
    return "Just started";
  };

  const getStatusColor = (draft: DraftInvoice) => {
    const isComplete = DraftService.isDraftComplete(draft);
    const percentage = DraftService.getCompletionPercentage(draft);

    if (isComplete) return "text-emerald-700 bg-emerald-50";
    if (percentage > 50) return "text-amber-700 bg-amber-50";
    return "text-blue-700 bg-blue-50";
  };

  if (isLoading && drafts.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="h-3 w-48 rounded bg-gray-100" />
              </div>
              <div className="h-8 w-20 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 border border-rose-200 p-4" role="alert">
        <div className="flex items-center gap-3">
          <XCircle className="h-5 w-5 text-rose-600" />
          <p className="text-sm font-medium text-rose-950">{error}</p>
          <button
            onClick={() => loadDrafts()}
            className="ml-auto text-sm font-semibold text-rose-700 hover:text-rose-900"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <FileText className="h-8 w-8" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-gray-900">No saved drafts</h3>
        <p className="mt-2 text-sm text-gray-500">
          Start creating an invoice and it will be automatically saved as a draft.
        </p>
        <Link
          href="/invoices/new"
          className="mt-6 inline-flex items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Create Invoice
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Saved Drafts</h2>
          <p className="text-sm text-gray-500">{total} draft{total !== 1 ? 's' : ''} saved</p>
        </div>
        <Link
          href="/invoices/new"
          className="inline-flex items-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          + New Invoice
        </Link>
      </div>

      <div className="space-y-3">
        {drafts.map((draft) => {
          const isComplete = DraftService.isDraftComplete(draft);
          const percentage = DraftService.getCompletionPercentage(draft);
          const formattedDraft = DraftService.formatDraftForDisplay(draft);

          return (
            <div
              key={draft.id}
              className="group rounded-xl bg-white border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:border-blue-200"
            >
              <div className="flex items-center justify-between gap-4">
                {/* Left: Icon + Info */}
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="mt-1 flex-shrink-0">
                    {getStatusIcon(draft)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {formattedDraft.displayName}
                      </h3>
                      {draft.invoiceNumber && (
                        <span className="text-xs font-mono text-gray-400">
                          #{draft.invoiceNumber}
                        </span>
                      )}
                    </div>
                    
                    <div className="mt-1 flex items-center gap-3 flex-wrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(draft)}`}>
                        {getStatusText(draft)}
                      </span>
                      {draft.amount && (
                        <span className="text-sm font-medium text-gray-700">
                          {draft.amount.toFixed(2)} {draft.assetCode || 'XLM'}
                        </span>
                      )}
                      {draft.dueDate && (
                        <span className="text-xs text-gray-400">
                          Due: {new Date(draft.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {Math.round(percentage)}% complete
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2 w-full max-w-xs">
                      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleResume(draft.id)}
                    className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-all"
                  >
                    Resume
                  </button>
                  
                  {isComplete && (
                    <button
                      onClick={() => handleConvert(draft.id)}
                      className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition-all"
                    >
                      Send
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleDiscard(draft.id)}
                    disabled={discardingId === draft.id}
                    className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="Discard draft"
                  >
                    {discardingId === draft.id ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-red-600" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={loadMore}
            className="inline-flex rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Load More Drafts
          </button>
        </div>
      )}
    </div>
  );
}