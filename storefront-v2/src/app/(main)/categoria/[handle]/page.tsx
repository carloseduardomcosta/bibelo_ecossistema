import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { listProducts, listCategories } from "@/lib/medusa/products"
import ProductCard from "@/components/product/ProductCard"
import { EMOJI_MAP } from "@/components/home/CategoriesSection"

export const revalidate = 3600
export const dynamicParams = true

const SORT_OPTIONS = [
  { value: "created_at",  label: "Mais recentes" },
  { value: "-created_at", label: "Mais antigos" },
  { value: "price_asc",   label: "Menor preço" },
  { value: "price_desc",  label: "Maior preço" },
]

interface CategoryType {
  id: string
  name: string
  handle: string
  parent_category_id?: string | null
  category_children?: CategoryType[]
}

interface PageProps {
  params: Promise<{ handle: string }>
  searchParams: Promise<{ sort?: string; page?: string; sub?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params
  const categories = await listCategories() as CategoryType[]
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

  // listCategories é cacheada — sem custo extra de rede
  const categories = await listCategories() as CategoryType[]
  const category = categories.find((c) => c.handle === handle)
  if (!category) notFound()

  // Determinar posição na hierarquia
  const children = (category.category_children || []) as CategoryType[]
  const isParent = children.length > 0
  const parentCategory = category.parent_category_id
    ? categories.find((c) => c.id === category.parent_category_id)
    : null

  // Subcategoria selecionada via pill (?sub=handle)
  const selectedSub = sp.sub
    ? children.find((c) => c.handle === sp.sub) ?? null
    : null

  // Determinar quais IDs de categoria buscar produtos
  let productFetchParams: { categoryId?: string; categoryIds?: string[] }
  if (isParent) {
    if (selectedSub) {
      productFetchParams = { categoryIds: [selectedSub.id] }
    } else {
      // Pai + todos os filhos para mostrar o acervo completo da categoria
      productFetchParams = { categoryIds: [category.id, ...children.map((c) => c.id)] }
    }
  } else {
    productFetchParams = { categoryId: handle }
  }

  const { products, count } = await listProducts({
    limit,
    offset,
    order: sp.sort,
    ...productFetchParams,
  })

  const totalPages = Math.ceil(count / limit)
  const emoji = EMOJI_MAP[handle] || "📦"

  function sortUrl(sort: string) {
    const p = new URLSearchParams()
    p.set("sort", sort)
    if (selectedSub) p.set("sub", selectedSub.handle)
    return `/categoria/${handle}?${p.toString()}`
  }

  function pageUrl(p: number) {
    const params = new URLSearchParams()
    params.set("page", String(p))
    if (sp.sort) params.set("sort", sp.sort)
    if (selectedSub) params.set("sub", selectedSub.handle)
    return `/categoria/${handle}?${params.toString()}`
  }

  function pillUrl(sub?: CategoryType) {
    const p = new URLSearchParams()
    if (sub) p.set("sub", sub.handle)
    if (sp.sort) p.set("sort", sp.sort)
    const qs = p.toString()
    return `/categoria/${handle}${qs ? `?${qs}` : ""}`
  }

  const contextLabel = selectedSub
    ? selectedSub.name
    : isParent
    ? `${category.name} e subcategorias`
    : category.name

  return (
    <div className="content-container py-8">
      {/* Breadcrumb — inclui pai quando for categoria filha */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-5 flex-wrap">
        <Link href="/" className="hover:text-bibelo-pink transition-colors">Início</Link>
        <span>/</span>
        <Link href="/produtos" className="hover:text-bibelo-pink transition-colors">Categorias</Link>
        {parentCategory && (
          <>
            <span>/</span>
            <Link
              href={`/categoria/${parentCategory.handle}`}
              className="hover:text-bibelo-pink transition-colors"
            >
              {parentCategory.name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-bibelo-pink font-medium">{category.name}</span>
      </nav>

      {/* Título */}
      <div className="mb-5">
        <p className="text-bibelo-pink text-xs font-semibold uppercase tracking-widest mb-1">
          {parentCategory ? parentCategory.name : "Categoria"}
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-bibelo-dark">
          {emoji} {category.name}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {count} produto{count !== 1 ? "s" : ""} em {contextLabel}
        </p>
      </div>

      {/* Pills de subcategorias — apenas para categorias pai */}
      {isParent && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Link
            href={pillUrl()}
            className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              !selectedSub
                ? "bg-bibelo-pink text-white border-bibelo-pink"
                : "border-gray-200 text-gray-600 hover:border-bibelo-pink hover:text-bibelo-pink"
            }`}
          >
            Todos
          </Link>
          {children.map((child) => (
            <Link
              key={child.id}
              href={pillUrl(child)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                selectedSub?.handle === child.handle
                  ? "bg-bibelo-pink text-white border-bibelo-pink"
                  : "border-gray-200 text-gray-600 hover:border-bibelo-pink hover:text-bibelo-pink"
              }`}
            >
              {child.name}
            </Link>
          ))}
        </div>
      )}

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
