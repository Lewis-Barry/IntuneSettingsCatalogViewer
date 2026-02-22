export default function SettingLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* Breadcrumb skeleton */}
      <div className="flex items-center gap-2 mb-4">
        <div className="h-4 w-10 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-3 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-3 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Title skeleton */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-8 w-72 bg-gray-200 rounded animate-pulse" />
          <div className="h-6 w-16 bg-gray-200 rounded-md animate-pulse" />
        </div>
        <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mt-2" />
      </div>

      {/* Detail card skeleton */}
      <div className="fluent-card">
        <div className="px-6 py-4 space-y-4">
          {/* Platform pill */}
          <div className="flex items-center gap-2">
            <div className="h-6 w-20 bg-gray-200 rounded-md animate-pulse" />
            <div className="h-6 w-16 bg-gray-200 rounded-md animate-pulse" />
          </div>

          {/* Description */}
          <div>
            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="space-y-2">
              <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-5/6 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-2/3 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>

          {/* Options */}
          <div>
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="space-y-1">
              <div className="h-8 w-full bg-gray-100 rounded animate-pulse" />
              <div className="h-8 w-full bg-gray-100 rounded animate-pulse" />
              <div className="h-8 w-full bg-gray-100 rounded animate-pulse" />
            </div>
          </div>

          {/* CSP path */}
          <div className="h-3 w-64 bg-gray-200 rounded animate-pulse pt-1" />
        </div>
      </div>

      {/* Back button skeleton */}
      <div className="mt-8">
        <div className="h-9 w-32 bg-gray-200 rounded animate-pulse" />
      </div>
    </div>
  );
}
