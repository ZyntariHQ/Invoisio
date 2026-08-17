'use client';

import React, { useState } from 'react';
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react';
import type { ImportSummary } from './CSVUploadDialog';

interface ImportResultsDisplayProps {
  summary: ImportSummary | null;
  onClose: () => void;
}

export function ImportResultsDisplay({
  summary,
  onClose,
}: ImportResultsDisplayProps) {
  const [expandedSections, setExpandedSections] = useState({
    created: true,
    failed: true,
    skipped: true,
  });

  if (!summary) return null;

  const toggleSection = (
    section: keyof typeof expandedSections
  ) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const downloadResultsAsJSON = () => {
    const dataStr = JSON.stringify(summary, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `import-results-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadErrorsAsCSV = () => {
    const allErrors = [...summary.failed, ...summary.skipped];
    if (allErrors.length === 0) return;

    const headers = ['Row', 'Field', 'Message'];
    const rows = allErrors.map((error) => [
      error.row,
      error.field || 'N/A',
      error.message,
    ]);

    const csv =
      [headers, ...rows]
        .map((row) =>
          row
            .map((cell) =>
              typeof cell === 'string' && cell.includes(',')
                ? `"${cell.replace(/"/g, '""')}"`
                : cell
            )
            .join(',')
        )
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `import-errors-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const hasErrors = summary.failedCount > 0 || summary.skippedCount > 0;
  const successRate = summary.totalRows > 0
    ? ((summary.createdCount / summary.totalRows) * 100).toFixed(1)
    : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg max-w-2xl w-full my-8">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Import Complete
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {summary.totalRows} total rows processed
              </p>
            </div>
            {!hasErrors && (
              <div className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 rounded-full">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-xs font-medium text-green-700 dark:text-green-300">
                  Success
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Created */}
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Created
                </p>
              </div>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                {summary.createdCount}
              </p>
            </div>

            {/* Success Rate */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Success Rate
                </p>
              </div>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {successRate}%
              </p>
            </div>

            {/* Skipped */}
            {summary.skippedCount > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Skipped
                  </p>
                </div>
                <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                  {summary.skippedCount}
                </p>
              </div>
            )}

            {/* Failed */}
            {summary.failedCount > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Failed
                  </p>
                </div>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {summary.failedCount}
                </p>
              </div>
            )}
          </div>

          {/* Created Rows Section */}
          {summary.createdCount > 0 && (
            <div>
              <button
                onClick={() => toggleSection('created')}
                className="w-full flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-green-900 dark:text-green-200">
                    Successfully Created ({summary.createdCount})
                  </span>
                </div>
                {expandedSections.created ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>
              {expandedSections.created && (
                <div className="mt-2 space-y-2">
                  {summary.created.map((row) => (
                    <div
                      key={`${row.row}-${row.id}`}
                      className="p-3 bg-green-50 dark:bg-green-900/20 rounded text-sm border border-green-200 dark:border-green-900/50"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-green-900 dark:text-green-200">
                            Row {row.row}: {row.invoiceNumber}
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-300 mt-1 font-mono">
                            ID: {row.id}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Skipped Rows Section */}
          {summary.skippedCount > 0 && (
            <div>
              <button
                onClick={() => toggleSection('skipped')}
                className="w-full flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  <span className="font-medium text-yellow-900 dark:text-yellow-200">
                    Validation Errors - Skipped ({summary.skippedCount})
                  </span>
                </div>
                {expandedSections.skipped ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>
              {expandedSections.skipped && (
                <div className="mt-2 space-y-2">
                  {summary.skipped.map((error, idx) => (
                    <div
                      key={`${error.row}-${idx}`}
                      className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm border border-yellow-200 dark:border-yellow-900/50"
                    >
                      <p className="font-medium text-yellow-900 dark:text-yellow-200">
                        Row {error.row}
                        {error.field && ` • Field: ${error.field}`}
                      </p>
                      <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                        {error.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Failed Rows Section */}
          {summary.failedCount > 0 && (
            <div>
              <button
                onClick={() => toggleSection('failed')}
                className="w-full flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <span className="font-medium text-red-900 dark:text-red-200">
                    Database Errors - Failed ({summary.failedCount})
                  </span>
                </div>
                {expandedSections.failed ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>
              {expandedSections.failed && (
                <div className="mt-2 space-y-2">
                  {summary.failed.map((error, idx) => (
                    <div
                      key={`${error.row}-${idx}`}
                      className="p-3 bg-red-50 dark:bg-red-900/20 rounded text-sm border border-red-200 dark:border-red-900/50"
                    >
                      <p className="font-medium text-red-900 dark:text-red-200">
                        Row {error.row}
                        {error.field && ` • Field: ${error.field}`}
                      </p>
                      <p className="text-red-700 dark:text-red-300 mt-1">
                        {error.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-sm text-gray-600 dark:text-gray-400">
            <p className="font-medium mb-2">About the Results</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>
                <strong>Created:</strong> Invoices successfully imported and saved to database
              </li>
              <li>
                <strong>Skipped:</strong> Rows with validation errors (e.g., invalid email, invalid amount)
              </li>
              <li>
                <strong>Failed:</strong> Rows that passed validation but failed to save (e.g., duplicate invoice number)
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800 flex-wrap">
          {(summary.failedCount > 0 || summary.skippedCount > 0) && (
            <button
              onClick={downloadErrorsAsCSV}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download Errors
            </button>
          )}
          <button
            onClick={downloadResultsAsJSON}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download Results
          </button>
          <button
            onClick={onClose}
            className="ml-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
