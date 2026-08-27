'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, AlertCircle, CheckCircle } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '@/lib/api-client';

export interface ImportSummary {
  totalRows: number;
  createdCount: number;
  failedCount: number;
  skippedCount: number;
  created: Array<{ row: number; id: string; invoiceNumber: string }>;
  failed: Array<{ row: number; field?: string; message: string }>;
  skipped: Array<{ row: number; field?: string; message: string }>;
}

interface CSVUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (summary: ImportSummary) => void;
}

export function CSVUploadDialog({ isOpen, onClose, onImportComplete }: CSVUploadDialogProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a .csv file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('File size must be less than 2MB');
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await apiClient.post<ImportSummary>(
        '/invoices/import',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      onImportComplete(response.data);
      handleClose();
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setError(null);
    setIsDragging(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Upload Invoices CSV
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Error Alert */}
          {error && (
            <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Drag and Drop Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
            } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Drag and drop your CSV file here
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              or
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
            >
              Select File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileInputChange}
              className="hidden"
              disabled={isUploading}
            />
          </div>

          {/* File Info */}
          {selectedFile && (
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-2 flex-1">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedFile(null)}
                disabled={isUploading}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-300">
            <p className="font-medium mb-1">CSV Format Requirements:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>invoiceNumber</li>
              <li>clientName</li>
              <li>clientEmail</li>
              <li>description</li>
              <li>amount</li>
              <li>asset_code</li>
              <li>asset_issuer</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
