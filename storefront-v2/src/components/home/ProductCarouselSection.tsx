import Link from "next/link"
import ProductCard from "@/components/product/ProductCard"

interface Product {
  id: string
  title: string
  handle: string
  thumbnail?: string | null
  created_at?: string | null
  variants?: Array<{
    id: string
    calculated_price?: {
      calculated_amount: number
      original_amount: number
    }
    inventory_quantity?: number | null
  }>
}

interface ProductCarouselSectionProps {
  eyebrow: string
  title: string
  products: Product[]
  viewAllHref?: string
}

export default function ProductCarouselSection({
  eyebrow,
  title,
  products,
  viewAllHref,
}: ProductCarouselSectionProps) {
  if (!products || products.length === 0) return null

  return (
    <section className="py-8 md:py-10">
      <div className="content-container">
        {/* Cabeçalho da seção */}
        <div className="flex items-end justify-between mb-4 md:mb-6">
          <div>
            <p className="text-bibelo-pink text-xs font-semibold uppercase tracking-widest mb-1">
              {eyebrow}
            </p>
            <h2 className="section-title mb-0 text-left">{title}</h2>
          </div>
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="text-sm text-bibelo-pink font-semibold hover:underline flex items-center gap-1 shrink-0"
            >
              Ver todos
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* Mobile: carousel scroll horizontal */}
      <div className="md:hidden overflow-x-auto scrollbar-hide pl-4 pr-2">
        <div className="flex gap-3" style={{ width: "max-content" }}>
          {products.map((product) => (
            <div key={product.id} className="w-[160px] shrink-0">
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: grid 4 colunas */}
      <div className="hidden md:block content-container">
        <div className="grid grid-cols-4 gap-4">
          {products.slice(0, 8).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  )
}
