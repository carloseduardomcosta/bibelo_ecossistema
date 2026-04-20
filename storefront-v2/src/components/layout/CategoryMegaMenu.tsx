"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { listCategories } from "@/lib/medusa/products"

interface Category {
  id: string
  name: string
  handle: string
  parent_category_id?: string | null
  category_children?: Category[]
}

const EXCLUDED = ["novidade", "promocao"]

export default function CategoryMegaMenu() {
  const [open, setOpen] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listCategories()
      .then((cats) => setCategories(cats as Category[]))
      .catch(() => setCategories([]))
  }, [])

  // Apenas raízes, com seus filhos filtrados
  const groups = categories
    .filter((c) => !c.parent_category_id && !EXCLUDED.includes(c.handle))
    .map((c) => ({
      ...c,
      children: (c.category_children || []).filter((ch) => !EXCLUDED.includes(ch.handle)),
    }))

  // Fechar ao clicar fora
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [])

  // Fechar ao pressionar Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  if (groups.length === 0) return null

  // Separar categorias com e sem filhos para layout no dropdown
  const withChildren = groups.filter((g) => g.children.length > 0)
  const withoutChildren = groups.filter((g) => g.children.length === 0)

  const totalCount = groups.length + groups.reduce((acc, g) => acc + g.children.length, 0)

  return (
    <div ref={containerRef} className="relative h-full">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`px-4 h-full flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest
                   border-b-2 transition-all whitespace-nowrap
                   ${open
                     ? "text-bibelo-pink border-bibelo-pink"
                     : "text-bibelo-dark hover:text-bibelo-pink border-transparent hover:border-bibelo-pink"
                   }`}
      >
        Categorias
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-0 bg-white border border-gray-100 shadow-xl rounded-b-2xl
                     min-w-[600px] max-w-[720px] p-5 animate-in fade-in slide-in-from-top-2 duration-150"
          role="menu"
        >
          {/* Categorias com subcategorias — exibidas como grupos */}
          {withChildren.length > 0 && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-4">
              {withChildren.map((group) => (
                <div key={group.id}>
                  {/* Cabeçalho do grupo — clicável para a categoria pai */}
                  <Link
                    href={`/categoria/${group.handle}`}
                    onClick={() => setOpen(false)}
                    role="menuitem"
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-bibelo-rosa/50
                               transition-colors group mb-1"
                  >
                    <span className="text-sm font-semibold text-bibelo-dark group-hover:text-bibelo-pink
                                     transition-colors leading-tight">
                      {group.name}
                    </span>
                    <svg className="w-3 h-3 text-gray-300 group-hover:text-bibelo-pink transition-colors flex-shrink-0"
                         fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </Link>
                  {/* Subcategorias indentadas */}
                  <div className="pl-3 border-l-2 border-bibelo-rosa/60 space-y-0.5">
                    {group.children.map((child) => (
                      <Link
                        key={child.id}
                        href={`/categoria/${child.handle}`}
                        onClick={() => setOpen(false)}
                        role="menuitem"
                        className="flex items-center px-2 py-1 rounded-md hover:bg-bibelo-rosa/40
                                   transition-colors group/child"
                      >
                        <span className="text-xs text-gray-500 group-hover/child:text-bibelo-pink
                                         transition-colors leading-tight">
                          {child.name}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Categorias sem subcategorias — grid compacto */}
          {withoutChildren.length > 0 && (
            <>
              {withChildren.length > 0 && (
                <div className="border-t border-gray-100 pt-3 mb-2">
                  <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest px-2 mb-1">
                    Outras categorias
                  </p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-1">
                {withoutChildren.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/categoria/${cat.handle}`}
                    onClick={() => setOpen(false)}
                    role="menuitem"
                    className="px-3 py-2 rounded-lg hover:bg-bibelo-rosa/50 transition-colors group"
                  >
                    <span className="text-sm font-medium text-gray-700 group-hover:text-bibelo-pink
                                     transition-colors leading-tight line-clamp-2">
                      {cat.name}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {/* Rodapé */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">{totalCount} categorias disponíveis</p>
            <Link
              href="/produtos"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-bibelo-pink hover:underline flex items-center gap-1"
            >
              Ver todos os produtos
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
