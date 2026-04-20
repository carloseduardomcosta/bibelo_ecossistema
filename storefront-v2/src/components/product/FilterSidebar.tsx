"use client"

import { useState } from "react"
import Link from "next/link"

interface Category {
  id: string
  name: string
  handle: string
  parent_category_id?: string | null
  category_children?: Category[]
}

interface Props {
  categories: Category[]
  currentCategory?: string
  currentSort?: string
  currentQ?: string
}

function buildUrl(params: { categoria?: string; sort?: string; q?: string }) {
  const sp = new URLSearchParams()
  if (params.categoria) sp.set("categoria", params.categoria)
  if (params.sort) sp.set("sort", params.sort)
  if (params.q) sp.set("q", params.q)
  const qs = sp.toString()
  return `/produtos${qs ? `?${qs}` : ""}`
}

export default function FilterSidebar({
  categories,
  currentCategory,
  currentSort,
  currentQ,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Apenas raízes, com filhos incluídos via category_children
  const groups = categories
    .filter((c) => !c.parent_category_id)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((c) => ({
      ...c,
      children: (c.category_children || []).sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR")
      ),
    }))

  // Identificar se a categoria ativa é filha (para destacar o pai também)
  const currentCatObj = categories.find((c) => c.handle === currentCategory)
  const currentParentId = currentCatObj?.parent_category_id ?? null
  const currentParentHandle = currentParentId
    ? categories.find((c) => c.id === currentParentId)?.handle
    : null

  const categoryLinks = (
    <ul className="space-y-0.5">
      {/* "Todos os produtos" */}
      <li>
        <Link
          href={buildUrl({ sort: currentSort, q: currentQ })}
          onClick={() => setDrawerOpen(false)}
          className={`flex items-center px-3 py-2 rounded-xl text-sm transition-colors ${
            !currentCategory
              ? "bg-bibelo-pink text-white font-semibold"
              : "text-gray-600 hover:bg-bibelo-rosa hover:text-bibelo-pink"
          }`}
        >
          Todos os produtos
        </Link>
      </li>

      {groups.map((cat) => {
        const isParentActive =
          currentCategory === cat.handle || currentParentHandle === cat.handle
        const hasChildren = cat.children.length > 0

        return (
          <li key={cat.id}>
            {/* Categoria raiz */}
            <Link
              href={buildUrl({ categoria: cat.handle, sort: currentSort, q: currentQ })}
              onClick={() => setDrawerOpen(false)}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${
                currentCategory === cat.handle
                  ? "bg-bibelo-pink text-white font-semibold"
                  : isParentActive && currentCategory !== cat.handle
                  ? "text-bibelo-pink font-semibold bg-bibelo-rosa/40"
                  : "text-gray-600 hover:bg-bibelo-rosa hover:text-bibelo-pink"
              }`}
            >
              <span>{cat.name}</span>
              {hasChildren && (
                <span
                  className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 ${
                    currentCategory === cat.handle
                      ? "bg-white/20 text-white"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {cat.children.length}
                </span>
              )}
            </Link>

            {/* Subcategorias indentadas */}
            {hasChildren && (
              <ul className="mt-0.5 ml-3 pl-3 border-l-2 border-bibelo-rosa/60 space-y-0.5 mb-1">
                {cat.children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={buildUrl({ categoria: child.handle, sort: currentSort, q: currentQ })}
                      onClick={() => setDrawerOpen(false)}
                      className={`flex items-center px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        currentCategory === child.handle
                          ? "bg-bibelo-pink text-white font-semibold"
                          : "text-gray-500 hover:bg-bibelo-rosa hover:text-bibelo-pink"
                      }`}
                    >
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <>
      {/* Mobile: botão abre drawer */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="lg:hidden flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:border-bibelo-pink hover:text-bibelo-pink transition-colors mb-4"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        Filtros
        {currentCategory && (
          <span className="w-2 h-2 rounded-full bg-bibelo-pink flex-shrink-0" />
        )}
      </button>

      {/* Mobile: drawer overlay */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative ml-auto w-72 max-w-[80vw] bg-white h-full shadow-2xl p-6 overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-bibelo-dark text-base">Filtrar por</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Fechar filtros"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Categorias
              </p>
              {categoryLinks}
            </div>
          </div>
        </div>
      )}

      {/* Desktop: sidebar fixa */}
      <aside className="hidden lg:block w-56 flex-shrink-0">
        <div className="sticky top-24 space-y-6">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Categorias
            </p>
            {categoryLinks}
          </div>
        </div>
      </aside>
    </>
  )
}
