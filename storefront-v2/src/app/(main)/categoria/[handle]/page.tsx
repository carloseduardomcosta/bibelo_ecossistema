import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { listProducts, listCategories } from "@/lib/medusa/products"
import ProductCard from "@/components/product/ProductCard"
import { EMOJI_MAP } from "@/components/home/CategoriesSection"

export const revalidate = 300

const SORT_OPTIONS = [
  { value: "created_at",  label: "Mais recentes" },
  { value: "-created_at", label: "Mais antigos" },
  { value: "price_asc",   label: "Menor preço" },
  { value: "price_desc",  label: "Maior preço" },
]

interface PageProps {
  params: Promise<{ handle: string }>
  searchParams: Promise<{ sort?: string; page?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params
  const categories = await listCategories()
  const cat = categories.find((c) => c.handle === handle)
  if (!cat) return { title: "Categoria não encontrada" }
  const emoji = EMOJI_MAP[handle] || "📦"
  return {
    title: `${emoji} ${cat.name} — Papelaria Bibelô`,
    description: `Explore todos os produtos de ${cat.name} na Papelaria Bibelô — cadernos, canetas, agendas e muito mais com entrega para todo o Brasil.`,
  }
}

export default async function CategoriaPage({ params, searchParams }: PageProps) {
  const { handle } = await params
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page || "1") || 1)
  const limit = 20
  const offset = (page - 1) * limit

  const [{ products, count }, categories] = await Promise.all([
    listProducts({ limit, offset, categoryId: handle, order: sp.sort }),
    listCategories(),
  ])

  const category = categories.find((c) => c.handle === handle)
  if (!category) notFound()

  const totalPages = Math.ceil(count / limit)
  const emoji = EMOJI_MAP[handle] || "📦"

  function sortUrl(sort: string) {
    return `/categoria/${handle}?sort=${sort}${page > 1 ? `&page=${page}` : ""}`
  }
  function pageUrl(p: number) {
    return `/categoria/${handle}?page=${p}${sp.sort ? `&sort=${sp.sort}` : ""}`
  }

  return (
    <div className="content-container py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-5">
        <Link href="/" className="hover:text-bibelo-pink transition-colors">Início</Link>
        <span>/</span>
        <Link href="/produtos" className="hover:text-bibelo-pink transition-colors">Categorias</Link>
        <span>/</span>
        <span className="text-bibelo-pink font-medium">{category.name}</span>
      </nav>

      {/* Título */}
      <div className="mb-6">
        <p className="text-bibelo-pink text-xs font-semibold uppercase tracking-widest mb-1">
          Categoria
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-bibelo-dark">
          {emoji} {category.name}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {count} produto{count !== 1 ? "s" : ""} em {category.name}
        </p>
      </div>

      {/* Ordenação */}
      <div className="flex flex-wrap items-center gap-2 mb-5 pb-4 border-b border-gray-100">
        <span className="text-sm text-gray-600 font-medium mr-1">Ordenar:</span>
        <div className="flex flex-wrap gap-2">
          {SORT_OPTIONS.map((opt) => (
            <a
              key={opt.value}
              href={sortUrl(opt.value)}
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
                  href={pageUrl(page - 1)}
                  className="px-4 py-2 rounded-full border border-gray-200 text-sm hover:border-bibelo-pink hover:text-bibelo-pink transition-colors"
                >
                  ← Anterior
                </a>
              )}
              <span className="text-sm text-gray-500">Página {page} de {totalPages}</span>
              {page < totalPages && (
                <a
                  href={pageUrl(page + 1)}
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
            <span className="text-3xl">{emoji}</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            Nenhum produto nesta categoria
          </h2>
          <p className="text-gray-500 text-sm mb-4">
            Explore nossas outras categorias
          </p>
          <Link href="/produtos" className="btn-primary">
            Ver todos os produtos
          </Link>
        </div>
      )}
    </div>
  )
}
