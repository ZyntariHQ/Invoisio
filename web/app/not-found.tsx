import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[500px] flex-col items-center justify-center text-center p-8">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 mb-6">
        <FileQuestion className="h-10 w-10" />
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Page Not Found</h1>
      <p className="text-gray-500 mb-8 max-w-md">
        The page or resource you are looking for does not exist, has been removed, or is temporarily unavailable.
      </p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
      >
        Go Home
      </Link>
    </div>
  );
}
