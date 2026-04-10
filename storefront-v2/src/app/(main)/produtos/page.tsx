import { listProducts, listCategories } from "@/lib/medusa/products"
import ProductCard from "@/components/product/ProductCard"
import FilterSidebar from "@/components/product/FilterSidebar"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Todos os Produtos",
  description: "Explore toda a linha de produtos da Papelaria Bibelô — cadernos, canetas, agendas e muito mais.",
}

export const revalidate = 300

interface SearchParams {
  page?: string
  sort?: string
  categoria?: string
  q?: string
}

const SORT_OPTIONS = [
  { value: "created_at", label: "Mais recentes" },
  { value: "-created_at", label: "Mais antigos" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
]

function buildSortUrl(sort: string, sp: SearchParams) {
  const params = new URLSearchParams()
  params.set("sort", sort)
  if (sp.categoria) params.set("categoria", sp.categoria)
  if (sp.q) params.set("q", sp.q)
  return `/produtos?${params.toString()}`
}

function buildPageUrl(page: number, sp: SearchParams) {
  const params = new URLSearchParams()
  params.set("page", String(page))
  if (sp.sort) params.set("sort", sp.sort)
  if (sp.categoria) params.set("categoria", sp.categoria)
  if (sp.q) params.set("q", sp.q)
  return `/produtos?${params.toString()}`
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const page = Math.max(1, Math.min(parseInt(sp.page || "1") || 1, 500))
  const limit = 20
  const offset = (page - 1) * limit

  // Busca produtos e categorias em paralelo
  const [{ products, count }, categories] = await Promise.all([
    listProducts({
      limit,
      offset,
      q: sp.q,
      order: sp.sort,
      categoryId: sp.categoria,
    }),
    listCategories(),
  ])

  const totalPages = Math.ceil(count / limit)

  // Nome da categoria ativa (para breadcrumb e título)
  const currentCatName = sp.categoria
    ? categories.find((c) => c.handle === sp.categoria)?.name
    : undefined

  return (
    <div className="content-container py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-5">
        <Link href="/" className="hover:text-bibelo-pink transition-colors">
          Início
        </Link>
        <span>/</span>
        {currentCatName ? (
          <>
            <Link href="/produtos" className="hover:text-bibelo-pink transition-colors">
              Produtos
            </Link>
            <span>/</span>
            <span className="text-bibelo-pink font-medium">{currentCatName}</span>
          </>
        ) : (
          <span className="text-gray-600">Produtos</span>
        )}
      </nav>

      {/* Título da página */}
      <div className="mb-6">
        <p className="text-bibelo-pink text-xs font-semibold uppercase tracking-widest mb-1">
          Catálogo
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-bibelo-dark">
          {sp.q ? `Resultados para "${sp.q}"` : currentCatName || "Todos os Produtos"}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {count} produto{count !== 1 ? "s" : ""} encontrado{count !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Layout: sidebar (desktop) + conteúdo principal */}
      <div className="lg:flex gap-8 items-start">
        {/* FilterSidebar: botão+drawer no mobile / aside no desktop */}
        <FilterSidebar
          categories={categories}
          currentCategory={sp.categoria}
          currentSort={sp.sort}
          currentQ={sp.q}
        />

        {/* Conteúdo principal */}
        <div className="min-w-0 lg:flex-1">
          {/* Barra de ordenação */}
          <div className="flex flex-wrap items-center gap-2 mb-5 pb-4 border-b border-gray-100">
            <span className="text-sm text-gray-600 font-medium mr-1">Ordenar:</span>
            <div className="flex flex-wrap gap-2">
              {SORT_OPTIONS.map((opt) => (
                <a
                  key={opt.value}
                  href={buildSortUrl(opt.value, sp)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    sp.sort === opt.value
                      ? "bg-bibelo-pink text-white border-bibelo-pink"
                      : "border-gray-200 text-gray-600 hover:border-bibelo-pink hover:text-bibelo-pink"
                  }`}
                >
                  {opt.label}
                </a>
              ))}
            </div>
          </div>

          {/* Grid de produtos */}
          {products.length > 0 ? (
            <>
              {/* Contagem de resultados acima do grid */}
              <p className="text-xs text-gray-400 mb-3">
                {count} produto{count !== 1 ? "s" : ""} encontrado{count !== 1 ? "s" : ""}
                {totalPages > 1 && ` — página ${page} de ${totalPages}`}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product as Parameters<typeof ProductCard>[0]["product"]}
                  />
                ))}
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-10">
                  {page > 1 && (
                    <a
                      href={buildPageUrl(page - 1, sp)}
                      className="px-4 py-2 rounded-full border border-gray-200 text-sm hover:border-bibelo-pink hover:text-bibelo-pink transition-colors"
                    >
                      ← Anterior
                    </a>
                  )}
                  <span className="text-sm text-gray-500">
                    Página {page} de {totalPages}
                  </span>
                  {page < totalPages && (
                    <a
                      href={buildPageUrl(page + 1, sp)}
                      className="px-4 py-2 rounded-full border border-gray-200 text-sm hover:border-bibelo-pink hover:text-bibelo-pink transition-colors"
                    >
                      Próxima →
                    </a>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-bibelo-pink/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-bibelo-pink"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-700 mb-2">
                Nenhum produto encontrado
              </h2>
              <p className="text-gray-500 text-sm mb-4">
                Tente buscar por outros termos ou explore nosso catálogo
              </p>
              <a href="/produtos" className="btn-primary">
                Ver todos os produtos
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
