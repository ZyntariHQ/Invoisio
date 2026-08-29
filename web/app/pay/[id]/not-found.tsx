import { XCircle } from "lucide-react";

export default function PayNotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <div className="rounded-lg bg-white p-8 shadow-lg">
          <XCircle className="mx-auto h-16 w-16 text-red-500" />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            Invoice Not Found
          </h1>
          <p className="mt-2 text-gray-600">
            The payment request you are looking for does not exist or has expired. Please contact the merchant to issue a new one.
          </p>
        </div>
      </div>
    </div>
  );
}
