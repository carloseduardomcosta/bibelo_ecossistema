"use client"

import { Popover, PopoverButton, PopoverPanel, Transition } from "@headlessui/react"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Fragment } from "react"

type MegaMenuProps = {
  categories: HttpTypes.StoreProductCategory[]
  collections: { id: string; title: string; handle: string }[]
}

const CATEGORY_GROUPS: Record<string, string[]> = {
  "Escrita": [
    "caneta", "caneta-esferografica", "caneta-gel", "caneta-hidrocor",
    "lapis", "lapiseira", "marcador-de-linha", "liner", "marca-texto",
  ],
  "Papelaria": [
    "caderno", "agenda", "post-it", "bloco-de-anotacoes", "fichario", "washi-tape",
  ],
  "Organização": [
    "estojo", "mochila", "penal", "porta-caneta", "porta-clips", "prancheta",
  ],
  "Escritório": [
    "cola", "tesoura", "grampeador", "clips", "corretivo", "apontador",
    "compasso", "regua", "fita-adesiva", "estilete", "borracha",
  ],
  "Artes": [
    "tinta", "pincel", "giz-de-cera", "lapis-de-cor", "aquarela",
  ],
  "Especiais": [
    "kit-presente", "kit-papelaria", "kit-canetas", "bobbie-goods", "mousepad",
  ],
}

// Top-level category pills for the navbar
const NAV_CATEGORIES = [
  "Canetas", "Cadernos", "Lápis de Cor", "Estojos", "Agendas", "Post-it",
]

const MegaMenu = ({ categories, collections }: MegaMenuProps) => {
  const categoryMap = new Map(categories.map((c) => [c.handle, c]))
  // Map display name to handle for nav pills
  const nameToHandle = new Map(categories.map((c) => [c.name, c.handle]))

  const groups = Object.entries(CATEGORY_GROUPS)
    .map(([groupName, handles]) => ({
      name: groupName,
      items: handles
        .map((h) => categoryMap.get(h))
        .filter(Boolean) as HttpTypes.StoreProductCategory[],
    }))
    .filter((g) => g.items.length > 0)

  // Categories not in any group
  const groupedHandles = new Set(Object.values(CATEGORY_GROUPS).flat())
  const ungrouped = categories.filter((c) => !groupedHandles.has(c.handle ?? ""))

  return (
    <div className="hidden small:flex items-center gap-x-1 h-full">
      {/* Horizontal category pills */}
      {NAV_CATEGORIES.map((name) => {
        const handle = nameToHandle.get(name)
        if (!handle) return null
        return (
          <LocalizedClientLink
            key={handle}
            href={`/categories/${handle}`}
            className="text-sm font-medium text-bibelo-dark/80 hover:text-bibelo-pink px-3 py-1.5 rounded-full hover:bg-bibelo-rosa/50 transition-colors whitespace-nowrap"
          >
            {name}
          </LocalizedClientLink>
        )
      })}

      {/* "Mais" dropdown with full mega menu */}
      <Popover className="flex items-center h-full relative">
        {({ close }) => (
          <>
            <PopoverButton className="h-full flex items-center gap-x-1 text-sm font-medium text-bibelo-dark/80 hover:text-bibelo-pink px-3 py-1.5 rounded-full hover:bg-bibelo-rosa/50 transition-colors outline-none whitespace-nowrap">
              Mais
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </PopoverButton>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-200"
              enterFrom="opacity-0 -translate-y-1"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 -translate-y-1"
            >
              <PopoverPanel className="fixed left-0 right-0 top-[calc(var(--nav-top,6.5rem))] z-50 bg-white border-t border-bibelo-rosa shadow-lg">
                <div className="content-container py-8">
                  <div className="flex gap-8">
                    {/* Category groups */}
                    <div className="flex-1 grid grid-cols-3 gap-x-8 gap-y-6">
                      {groups.map((group) => (
                        <div key={group.name}>
                          <h3 className="text-sm font-semibold text-bibelo-dark mb-3 uppercase tracking-wider">
                            {group.name}
                          </h3>
                          <ul className="space-y-2">
                            {group.items.map((cat) => (
                              <li key={cat.id}>
                                <LocalizedClientLink
                                  href={`/categories/${cat.handle}`}
                                  className="text-sm text-gray-600 hover:text-bibelo-pink transition-colors"
                                  onClick={close}
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
                          <h3 className="text-sm font-semibold text-bibelo-dark mb-3 uppercase tracking-wider">
                            Mais
                          </h3>
                          <ul className="space-y-2">
                            {ungrouped.slice(0, 8).map((cat) => (
                              <li key={cat.id}>
                                <LocalizedClientLink
                                  href={`/categories/${cat.handle}`}
                                  className="text-sm text-gray-600 hover:text-bibelo-pink transition-colors"
                                  onClick={close}
                                >
                                  {cat.name}
                                </LocalizedClientLink>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Collections sidebar */}
                    {collections.length > 0 && (
                      <div className="w-48 border-l border-bibelo-rosa pl-8">
                        <h3 className="text-sm font-semibold text-bibelo-dark mb-3 uppercase tracking-wider">
                          Destaques
                        </h3>
                        <ul className="space-y-3">
                          {collections.map((col) => (
                            <li key={col.id}>
                              <LocalizedClientLink
                                href={`/collections/${col.handle}`}
                                className="text-sm font-medium text-bibelo-pink hover:underline"
                                onClick={close}
                              >
                                {col.title}
                              </LocalizedClientLink>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-6">
                          <LocalizedClientLink
                            href="/store"
                            className="text-sm font-semibold text-bibelo-dark hover:text-bibelo-pink transition-colors"
                            onClick={close}
                          >
                            Ver todos os produtos &rarr;
                          </LocalizedClientLink>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </PopoverPanel>
            </Transition>
          </>
        )}
      </Popover>
    </div>
  )
}

export default MegaMenu
