import { listProducts } from "@/lib/medusa/products"
import ProductCard from "@/components/product/ProductCard"
import type { Metadata } from "next"

interface SearchParams {
  q?: string
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return {
    title: searchParams.q ? `Busca: ${searchParams.q}` : "Busca",
  }
}

export default async function BuscaPage({ searchParams }: { searchParams: SearchParams }) {
  const query = searchParams.q || ""

  const { products, count } = query
    ? await listProducts({ q: query, limit: 20 })
    : { products: [], count: 0 }

  return (
    <div className="content-container py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-bibelo-dark">
          {query ? `Resultados para "${query}"` : "Busca"}
        </h1>
        {query && (
          <p className="text-gray-500 text-sm mt-1">
            {count} produto{count !== 1 ? "s" : ""} encontrado{count !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {!query && (
        <div className="text-center py-20">
          <p className="text-gray-500">Digite algo na busca para encontrar produtos</p>
        </div>
      )}

      {query && products.length === 0 && (
        <div className="text-center py-20">
          <p className="text-lg font-semibold text-gray-700 mb-2">Nenhum resultado encontrado</p>
          <p className="text-gray-500 text-sm mb-4">Tente outros termos ou explore nosso catálogo</p>
          <a href="/produtos" className="btn-primary">Ver todos os produtos</a>
        </div>
      )}

      {products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product as Parameters<typeof ProductCard>[0]["product"]}
            />
          ))}
        </div>
      )}
    </div>
  )
}
