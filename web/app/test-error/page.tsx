'use client';

import { useState } from 'react';

export default function TestErrorPage() {
  const [shouldCrash, setShouldCrash] = useState(false);

  if (shouldCrash) {
    throw new Error('Intentional test error to verify ErrorBoundary');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Error Boundary Test
        </h1>
        <p className="text-gray-600 mb-6">
          This page is used to test the ErrorBoundary component. Click the button below to trigger an intentional error.
        </p>
        <button
          onClick={() => setShouldCrash(true)}
          className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          Trigger Error
        </button>
      </div>
    </div>
  );
}
