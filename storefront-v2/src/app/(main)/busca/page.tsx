"use client"

import { useState, useEffect, useMemo, Suspense, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import ProductCard from "@/components/product/ProductCard"
import { searchProducts } from "@/lib/medusa/products"
import { EMOJI_MAP } from "@/components/home/CategoriesSection"

// ── Tipos locais ──────────────────────────────────────────────
interface ProductCategory {
  id: string
  handle: string
  name: string
}

interface ProductVariant {
  id: string
  inventory_quantity?: number | null
  calculated_price?: {
    calculated_amount?: number | null
  } | null
}

interface Product {
  id: string
  title: string
  handle: string
  thumbnail?: string | null
  created_at?: string
  categories?: ProductCategory[]
  variants?: ProductVariant[]
}

// ── Helpers ───────────────────────────────────────────────────
function getPrice(p: Product): number {
  return p.variants?.[0]?.calculated_price?.calculated_amount ?? 0
}

function inStock(p: Product): boolean {
  return p.variants?.some((v) => (v.inventory_quantity ?? 0) > 0) ?? false
}

const SORT_OPTIONS = [
  { value: "relevance",  label: "Relevância" },
  { value: "price_asc",  label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
  { value: "newest",     label: "Novidades" },
  { value: "az",         label: "A–Z" },
]

// ── Skeleton ──────────────────────────────────────────────────
function BuscaSkeleton() {
  return (
    <div className="content-container py-8">
      <div className="h-7 w-48 bg-gray-200 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-2xl overflow-hidden animate-pulse">
            <div className="aspect-square bg-gray-200" />
            <div className="p-3 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-200 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Conteúdo principal (client) ───────────────────────────────
function BuscaContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const q         = searchParams.get("q") || ""
  const categoria = searchParams.get("categoria") || ""
  const minParam  = searchParams.get("min") || ""
  const maxParam  = searchParams.get("max") || ""
  const sort      = searchParams.get("sort") || "relevance"
  const soEstoque = searchParams.get("estoque") !== "0"   // true por padrão

  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  // inputs de preço controlados localmente (aplica ao pressionar Enter ou blur)
  const [minInput, setMinInput] = useState(minParam)
  const [maxInput, setMaxInput] = useState(maxParam)

  // Sincroniza inputs com URL quando volta/avança no browser
  useEffect(() => { setMinInput(minParam) }, [minParam])
  useEffect(() => { setMaxInput(maxParam) }, [maxParam])

  // Busca quando query muda
  useEffect(() => {
    if (!q.trim()) { setAllProducts([]); return }
    setLoading(true)
    searchProducts(q).then(({ products }) => {
      setAllProducts(products as Product[])
      setLoading(false)
    })
  }, [q])

  // Atualiza um param na URL sem scroll
  const setParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/busca?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  const clearAll = useCallback(() => {
    router.push(`/busca?q=${encodeURIComponent(q)}`, { scroll: false })
  }, [q, router])

  // Facets de categoria (derivado dos produtos retornados)
  const categoryFacets = useMemo(() => {
    const map = new Map<string, { id: string; handle: string; name: string; count: number }>()
    allProducts.forEach((p) => {
      p.categories?.forEach((cat) => {
        const prev = map.get(cat.handle) ?? { id: cat.id, handle: cat.handle, name: cat.name, count: 0 }
        map.set(cat.handle, { ...prev, count: prev.count + 1 })
      })
    })
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [allProducts])

  // Filtragem + ordenação client-side
  const minPriceNum = parseInt(minParam) || 0
  const maxPriceNum = parseInt(maxParam) || 0

  const filtered = useMemo(() => {
    let r = [...allProducts]

    if (categoria)
      r = r.filter((p) => p.categories?.some((c) => c.handle === categoria))

    if (soEstoque)
      r = r.filter(inStock)

    if (minPriceNum > 0)
      r = r.filter((p) => getPrice(p) >= minPriceNum * 100)

    if (maxPriceNum > 0)
      r = r.filter((p) => getPrice(p) <= maxPriceNum * 100)

    switch (sort) {
      case "price_asc":  r.sort((a, b) => getPrice(a) - getPrice(b)); break
      case "price_desc": r.sort((a, b) => getPrice(b) - getPrice(a)); break
      case "newest":     r.sort((a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      ); break
      case "az":         r.sort((a, b) => a.title.localeCompare(b.title, "pt-BR")); break
    }
    return r
  }, [allProducts, categoria, soEstoque, minPriceNum, maxPriceNum, sort])

  // Chips de filtros ativos
  const chips: Array<{ key: string; label: string }> = []
  if (categoria) {
    const cat = categoryFacets.find((c) => c.handle === categoria)
    chips.push({ key: "categoria", label: `${EMOJI_MAP[categoria] ?? "📦"} ${cat?.name ?? categoria}` })
  }
  if (minPriceNum > 0 || maxPriceNum > 0) {
    chips.push({
      key: "preco",
      label: `R$${minPriceNum > 0 ? minPriceNum : "0"}–${maxPriceNum > 0 ? `R$${maxPriceNum}` : "∞"}`,
    })
  }
  if (!soEstoque) chips.push({ key: "estoque", label: "Todos (com e sem estoque)" })

  function removeChip(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (key === "categoria") params.delete("categoria")
    if (key === "preco") { params.delete("min"); params.delete("max") }
    if (key === "estoque") params.set("estoque", "1")
    router.push(`/busca?${params.toString()}`, { scroll: false })
  }

  function applyPrice() {
    const params = new URLSearchParams(searchParams.toString())
    if (minInput) params.set("min", minInput); else params.delete("min")
    if (maxInput) params.set("max", maxInput); else params.delete("max")
    router.push(`/busca?${params.toString()}`, { scroll: false })
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="content-container py-8">
      {/* Título */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-bibelo-dark">
          {q ? `Resultados para "${q}"` : "Busca"}
        </h1>
        {q && !loading && (
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} produto{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
            {allProducts.length !== filtered.length && ` (de ${allProducts.length} no total)`}
          </p>
        )}
      </div>

      {/* Chips de filtros ativos */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-bibelo-pink/10 text-bibelo-pink text-xs font-medium rounded-full"
            >
              {chip.label}
              <button
                onClick={() => removeChip(chip.key)}
                className="hover:text-bibelo-pink/60 transition-colors leading-none"
                aria-label={`Remover filtro ${chip.label}`}
              >
                ×
              </button>
            </span>
          ))}
          {chips.length > 1 && (
            <button
              onClick={clearAll}
              className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
            >
              Limpar tudo
            </button>
          )}
        </div>
      )}

      {!q ? (
        <div className="text-center py-20">
          <p className="text-gray-500">Digite algo na busca acima para encontrar produtos</p>
        </div>
      ) : (
        <div className="flex gap-6 items-start">
          {/* ── Sidebar de filtros ── */}
          <aside className="hidden lg:block w-56 shrink-0 sticky top-24">
            {/* Categorias */}
            {categoryFacets.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categoria</p>
                <div className="space-y-1">
                  {categoryFacets.map((cat) => (
                    <button
                      key={cat.handle}
                      onClick={() => setParam("categoria", categoria === cat.handle ? "" : cat.handle)}
                      className={`w-full text-left flex items-center justify-between px-2 py-1.5 rounded-lg text-sm transition-colors ${
                        categoria === cat.handle
                          ? "bg-bibelo-pink/10 text-bibelo-pink font-semibold"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <span>{EMOJI_MAP[cat.handle] ?? "📦"} {cat.name}</span>
                      <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                        categoria === cat.handle ? "bg-bibelo-pink text-white" : "bg-gray-100 text-gray-400"
                      }`}>{cat.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Faixa de preço */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Faixa de preço</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="R$ Mín"
                  value={minInput}
                  onChange={(e) => setMinInput(e.target.value)}
                  onBlur={applyPrice}
                  onKeyDown={(e) => e.key === "Enter" && applyPrice()}
                  className="input-base text-sm py-1.5 w-full"
                />
                <span className="text-gray-400 shrink-0">–</span>
                <input
                  type="number"
                  min={0}
                  placeholder="R$ Máx"
                  value={maxInput}
                  onChange={(e) => setMaxInput(e.target.value)}
                  onBlur={applyPrice}
                  onKeyDown={(e) => e.key === "Enter" && applyPrice()}
                  className="input-base text-sm py-1.5 w-full"
                />
              </div>
            </div>

            {/* Disponibilidade */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Disponibilidade</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soEstoque}
                  onChange={(e) => setParam("estoque", e.target.checked ? "" : "0")}
                  className="w-4 h-4 accent-bibelo-pink"
                />
                <span className="text-sm text-gray-600">Só em estoque</span>
              </label>
            </div>
          </aside>

          {/* ── Resultados ── */}
          <div className="flex-1 min-w-0">
            {/* Mobile: filtros inline compactos */}
            <div className="lg:hidden mb-4 flex flex-wrap gap-2">
              {categoryFacets.slice(0, 4).map((cat) => (
                <button
                  key={cat.handle}
                  onClick={() => setParam("categoria", categoria === cat.handle ? "" : cat.handle)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    categoria === cat.handle
                      ? "bg-bibelo-pink text-white border-bibelo-pink"
                      : "border-gray-200 text-gray-600 hover:border-bibelo-pink hover:text-bibelo-pink"
                  }`}
                >
                  {EMOJI_MAP[cat.handle] ?? "📦"} {cat.name} ({cat.count})
                </button>
              ))}
            </div>

            {/* Sort + contagem */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <p className="text-xs text-gray-400">
                {loading ? "Buscando..." : `${filtered.length} produto${filtered.length !== 1 ? "s" : ""}`}
              </p>
              <select
                value={sort}
                onChange={(e) => setParam("sort", e.target.value === "relevance" ? "" : e.target.value)}
                className="text-sm border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 focus:outline-none focus:border-bibelo-pink bg-white"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Skeleton */}
            {loading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-gray-100 rounded-2xl overflow-hidden animate-pulse">
                    <div className="aspect-square bg-gray-200" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 bg-gray-200 rounded w-3/4" />
                      <div className="h-4 bg-gray-200 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Grid de resultados */}
            {!loading && filtered.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {filtered.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product as Parameters<typeof ProductCard>[0]["product"]}
                  />
                ))}
              </div>
            )}

            {/* Estado vazio */}
            {!loading && q && filtered.length === 0 && (
              <div className="text-center py-16">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <p className="font-semibold text-gray-700 mb-1">
                  Nenhum produto encontrado para &ldquo;{q}&rdquo;
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  {chips.length > 0 ? "Tente remover alguns filtros ou" : "Tente"} outros termos de busca
                </p>
                {chips.length > 0 && (
                  <button onClick={clearAll} className="btn-primary text-sm inline-block">
                    Limpar filtros
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Wrapper com Suspense (obrigatório para useSearchParams) ───
export default function BuscaPage() {
  return (
    <Suspense fallback={<BuscaSkeleton />}>
      <BuscaContent />
    </Suspense>
  )
}
