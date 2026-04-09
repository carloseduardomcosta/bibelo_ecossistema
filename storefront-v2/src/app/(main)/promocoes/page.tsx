import { listProducts } from "@/lib/medusa/products"
import ProductCard from "@/components/product/ProductCard"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Promoções",
  description: "Produtos em promoção na Papelaria Bibelô — aproveite os descontos especiais.",
}

export const dynamic = "force-dynamic"

export default async function PromocoesPage() {
  const { products } = await listProducts({ limit: 100 })

  const promos = products.filter((p) => {
    const variant = p.variants?.[0]
    const price = variant?.calculated_price as { calculated_amount?: number; original_amount?: number } | undefined
    return price && price.original_amount && price.calculated_amount &&
      price.original_amount > price.calculated_amount
  })

  return (
    <div className="content-container py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-bibelo-pink text-xs font-semibold uppercase tracking-widest mb-1">Aproveite!</p>
        <h1 className="text-2xl md:text-3xl font-bold text-bibelo-dark">Promoções</h1>
        <p className="text-gray-500 text-sm mt-1">
          {promos.length > 0
            ? `${promos.length} produto${promos.length !== 1 ? "s" : ""} em promoção`
            : "Nenhuma promoção ativa no momento."}
        </p>
      </div>

      {promos.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-4xl mb-4">🏷️</p>
          <p className="text-gray-500 text-sm">Em breve novas promoções. Fique de olho!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {promos.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
