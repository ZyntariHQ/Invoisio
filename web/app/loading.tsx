export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center p-8">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-200" />
        </div>
        
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 w-full animate-pulse rounded-2xl bg-gray-200" />
          ))}
        </div>

        <div className="h-96 w-full animate-pulse rounded-2xl bg-gray-200" />
      </div>
    </div>
  );
}
