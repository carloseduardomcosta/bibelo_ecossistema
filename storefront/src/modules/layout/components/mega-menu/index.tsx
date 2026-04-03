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

// Links de categoria exibidos diretamente na barra de navegação
const NAV_CATEGORIES = [
  "Canetas", "Cadernos", "Lápis de Cor", "Estojos", "Agendas", "Post-it",
]

const MegaMenu = ({ categories, collections }: MegaMenuProps) => {
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
  const ungrouped = categories.filter((c) => !groupedHandles.has(c.handle ?? ""))

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

      {/* Dropdown "Todas as Categorias" */}
      <Popover className="relative h-full flex items-center">
        {({ close }) => (
          <>
            <PopoverButton className="px-4 h-full flex items-center gap-x-1 text-xs font-semibold uppercase tracking-widest text-bibelo-dark/80 hover:text-bibelo-pink border-b-2 border-transparent hover:border-bibelo-pink transition-all outline-none whitespace-nowrap">
              Todas as Categorias
              <svg className="w-3 h-3 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </PopoverButton>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-200"
              enterFrom="opacity-0 -translate-y-2"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 -translate-y-2"
            >
              {/*
                O painel usa `absolute` ancorado no Popover pai (relative).
                `top-full` = logo abaixo do botão (já está na segunda linha do header).
                `left-0` com largura grande para cobrir o conteúdo.
                `z-[100]` garante que fica acima de tudo sem quebrar o sticky header.
              */}
              <PopoverPanel className="absolute left-0 top-full mt-0 z-[100] w-[860px] max-w-[95vw] bg-white border border-bibelo-rosa/40 shadow-xl rounded-b-xl overflow-hidden">
                <div className="p-8">
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
                          <h3 className="text-xs font-bold text-bibelo-dark mb-3 uppercase tracking-wider border-b border-bibelo-rosa pb-1.5">
                            Outros
                          </h3>
                          <ul className="space-y-1.5">
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
                                onClick={close}
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
                            onClick={close}
                          >
                            Ver todos →
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
