"use client"

import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useEffect, useRef, useState } from "react"

type MegaMenuProps = {
  categories: HttpTypes.StoreProductCategory[]
  collections: { id: string; title: string; handle: string }[]
}

const CATEGORY_GROUPS: Record<string, string[]> = {
  "Escrita": [
    "caneta", "caneta-esferografica", "caneta-gel", "caneta-hidrocor",
    "caneta-acrilica", "lapis", "lapiseira", "grafite", "liner",
    "marcador-de-linha", "marcador-de-texto",
  ],
  "Papelaria": [
    "caderno", "caderneta", "cadernico", "agenda", "planner",
    "bloco-de-anotacoes", "post-it", "marcador-de-pagina",
    "papel-de-carta", "papel-carta-pautada",
  ],
  "Organização": [
    "estojo", "penal", "mochila", "porta-caneta", "porta-clips", "prancheta",
  ],
  "Escritório": [
    "cola", "cola-em-fita", "tesoura", "grampeador", "clips-prendedor",
    "corretivo", "apontador", "compasso", "regua", "estilete", "borracha",
  ],
  "Artes e Cor": [
    "lapis-de-cor",
  ],
  "Kits e Especiais": [
    "kit-presente", "kit-papelaria", "kit-canetas", "bobbie-goods",
    "mousepad", "perfume-para-papel", "protetor-de-carregador-de-celular",
  ],
}

const NAV_CATEGORIES = [
  "Caneta", "Caderno", "Lápis de Cor", "Estojo", "Agenda", "Post-it",
]

const MegaMenu = ({ categories, collections }: MegaMenuProps) => {
  const [open, setOpen] = useState(false)
  const [panelTop, setPanelTop] = useState(0)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const categoryMap = new Map(categories.map((c) => [c.handle, c]))
  const nameToHandle = new Map(categories.map((c) => [c.name, c.handle]))

  const groups = Object.entries(CATEGORY_GROUPS)
    .map(([groupName, handles]) => ({
      name: groupName,
      items: handles
        .map((h) => categoryMap.get(h))
        .filter(Boolean) as HttpTypes.StoreProductCategory[],
    }))
    .filter((g) => g.items.length > 0)

  const groupedHandles = new Set(Object.values(CATEGORY_GROUPS).flat())
  // Categorias que são coleções/tags, não categorias de produto no menu
  const HIDDEN_CATEGORIES = new Set(["novidade", "promocao"])
  const ungrouped = categories.filter(
    (c) => !groupedHandles.has(c.handle ?? "") && !HIDDEN_CATEGORIES.has(c.handle ?? "")
  )

  // Calcular o top do painel baseado na posição real do botão no DOM
  const updatePanelTop = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPanelTop(rect.bottom)
    }
  }

  const handleOpen = () => {
    updatePanelTop()
    setOpen(true)
  }

  // Fechar ao clicar fora
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  // Atualizar posição ao rolar (header sticky muda de posição)
  useEffect(() => {
    if (!open) return
    const handleScroll = () => updatePanelTop()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [open])

  return (
    <div className="hidden small:flex items-center gap-x-0 h-full">
      {/* Links de categoria diretos na barra de navegação */}
      {NAV_CATEGORIES.map((name) => {
        const handle = nameToHandle.get(name)
        if (!handle) return null
        return (
          <LocalizedClientLink
            key={handle}
            href={`/categories/${handle}`}
            className="px-4 h-full flex items-center text-xs font-semibold uppercase tracking-widest text-bibelo-dark/80 hover:text-bibelo-pink border-b-2 border-transparent hover:border-bibelo-pink transition-all whitespace-nowrap"
          >
            {name}
          </LocalizedClientLink>
        )
      })}

      {/* Botão "Todas as Categorias" */}
      <button
        ref={btnRef}
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className={`px-4 h-full flex items-center gap-x-1 text-xs font-semibold uppercase tracking-widest border-b-2 transition-all outline-none whitespace-nowrap ${
          open
            ? "text-bibelo-pink border-bibelo-pink"
            : "text-bibelo-dark/80 border-transparent hover:text-bibelo-pink hover:border-bibelo-pink"
        }`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        Todas as Categorias
        <svg
          className={`w-3 h-3 mt-0.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Painel do mega menu — fixed, top calculado via JS */}
      {open && (
        <div
          ref={panelRef}
          className="fixed left-0 right-0 z-[200] bg-white border-t border-bibelo-rosa/40 shadow-2xl"
          style={{ top: `${panelTop}px` }}
        >
          <div className="content-container py-8">
            <div className="flex gap-8">
              {/* Grupos de categorias */}
              <div className="flex-1 grid grid-cols-3 gap-x-8 gap-y-6">
                {groups.map((group) => (
                  <div key={group.name}>
                    <h3 className="text-xs font-bold text-bibelo-dark mb-3 uppercase tracking-wider border-b border-bibelo-rosa pb-1.5">
                      {group.name}
                    </h3>
                    <ul className="space-y-1.5">
                      {group.items.map((cat) => (
                        <li key={cat.id}>
                          <LocalizedClientLink
                            href={`/categories/${cat.handle}`}
                            className="text-sm text-gray-600 hover:text-bibelo-pink transition-colors"
                            onClick={() => setOpen(false)}
                          >
                            {cat.name}
                          </LocalizedClientLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {ungrouped.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-bibelo-dark mb-3 uppercase tracking-wider border-b border-bibelo-rosa pb-1.5">
                      Mais
                    </h3>
                    <ul className="space-y-1.5">
                      {ungrouped.slice(0, 8).map((cat) => (
                        <li key={cat.id}>
                          <LocalizedClientLink
                            href={`/categories/${cat.handle}`}
                            className="text-sm text-gray-600 hover:text-bibelo-pink transition-colors"
                            onClick={() => setOpen(false)}
                          >
                            {cat.name}
                          </LocalizedClientLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Sidebar de coleções */}
              {collections.length > 0 && (
                <div className="w-44 border-l border-bibelo-rosa/40 pl-8 shrink-0">
                  <h3 className="text-xs font-bold text-bibelo-dark mb-3 uppercase tracking-wider border-b border-bibelo-rosa pb-1.5">
                    Destaques
                  </h3>
                  <ul className="space-y-2.5">
                    {collections.map((col) => (
                      <li key={col.id}>
                        <LocalizedClientLink
                          href={`/collections/${col.handle}`}
                          className="text-sm font-medium text-bibelo-pink hover:underline"
                          onClick={() => setOpen(false)}
                        >
                          {col.title}
                        </LocalizedClientLink>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 pt-4 border-t border-bibelo-rosa/40">
                    <LocalizedClientLink
                      href="/store"
                      className="text-xs font-semibold text-bibelo-dark hover:text-bibelo-pink transition-colors uppercase tracking-wider"
                      onClick={() => setOpen(false)}
                    >
                      Ver todos os produtos →
                    </LocalizedClientLink>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MegaMenu
