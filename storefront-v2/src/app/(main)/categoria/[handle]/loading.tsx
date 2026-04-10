export default function CategoriaLoading() {
  return (
    <div className="content-container py-8">
      {/* Breadcrumb skeleton */}
      <div className="flex items-center gap-2 mb-5">
        <div className="h-3 w-10 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-2 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-2 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Título skeleton */}
      <div className="mb-6">
        <div className="h-3 w-16 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-8 w-52 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Sort skeleton */}
      <div className="flex gap-2 mb-5 pb-4 border-b border-gray-100">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-7 w-24 bg-gray-200 rounded-full animate-pulse" />
        ))}
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-2xl overflow-hidden animate-pulse">
            <div className="aspect-square bg-gray-200" />
            <div className="p-3 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
              <div className="h-4 bg-gray-200 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
