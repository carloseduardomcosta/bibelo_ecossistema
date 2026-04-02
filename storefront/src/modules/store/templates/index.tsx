import { Suspense } from "react"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <div className="content-container py-8" data-testid="category-container">
      {/* Page header */}
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.15em] text-bibelo-pink font-semibold mb-1">
          Explore
        </p>
        <h1
          className="font-heading text-3xl small:text-4xl font-semibold text-bibelo-dark"
          data-testid="store-page-title"
        >
          Todos os produtos
        </h1>
      </div>

      {/* Filtros + Grid */}
      <div className="flex flex-col small:flex-row small:items-start gap-6">
        {/* Sidebar de filtros */}
        <div className="small:w-56 shrink-0">
          <RefinementList sortBy={sort} />
        </div>

        {/* Grid de produtos */}
        <div className="flex-1 min-w-0">
          <Suspense fallback={<SkeletonProductGrid />}>
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              countryCode={countryCode}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

export default StoreTemplate
