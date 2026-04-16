import Link from "next/link"
import { listCategories } from "@/lib/medusa/products"
import CategoryCard from "./CategoryCard"

// Mantido para compatibilidade com imports existentes
export const EMOJI_MAP: Record<string, string> = {}

// Cor de fundo fallback por handle (quando ainda não há arte customizada)
const COLOR_MAP: Record<string, string> = {
  caderno:               "bg-amber-100",
  caderneta:             "bg-amber-50",
  cadernico:             "bg-yellow-100",
  caneta:                "bg-pink-100",
  "caneta-gel":          "bg-pink-100",
  "caneta-esferografica":"bg-rose-100",
  "caneta-hidrocor":     "bg-fuchsia-100",
  "lapis-de-cor":        "bg-purple-100",
  lapis:                 "bg-purple-50",
  lapiseira:             "bg-violet-100",
  estojo:                "bg-sky-100",
  penal:                 "bg-sky-50",
  agenda:                "bg-teal-100",
  planner:               "bg-emerald-100",
  "marcador-de-texto":   "bg-yellow-100",
  "marcador-de-pagina":  "bg-lime-100",
  "post-it":             "bg-yellow-50",
  "bloco-de-anotacoes":  "bg-orange-50",
  borracha:              "bg-slate-100",
  cola:                  "bg-indigo-100",
  "cola-em-fita":        "bg-indigo-50",
  regua:                 "bg-cyan-100",
  mochila:               "bg-blue-100",
  compasso:              "bg-gray-100",
  "kit-presente":        "bg-red-100",
  "kit-papelaria":       "bg-red-50",
  "kit-canetas":         "bg-pink-50",
  apontador:             "bg-orange-100",
  tesoura:               "bg-stone-100",
  estilete:              "bg-stone-50",
  "marcador-de-linha":   "bg-green-100",
  grafite:               "bg-neutral-100",
  "papel-de-carta":      "bg-pink-50",
  "papel-carta-pautada": "bg-rose-50",
  "perfume-para-papel":  "bg-rose-100",
  calculadora:           "bg-blue-50",
  mousepad:              "bg-slate-50",
  "porta-caneta":        "bg-pink-50",
  grampeador:            "bg-gray-50",
  corretivo:             "bg-white",
  "clips-prendedor":     "bg-zinc-100",
  liner:                 "bg-pink-100",
  prancheta:             "bg-amber-50",
  "bobbie-goods":        "bg-purple-50",
  "protetor-de-carregador-de-celular": "bg-slate-100",
}

// Excluídas (gerenciadas fora do Medusa)
const EXCLUDED = new Set(["novidade", "promocao"])

// Ordem prioritária de exibição
const PRIORITY: string[] = [
  "caneta", "caderno", "lapis-de-cor", "agenda", "estojo",
  "marcador-de-texto", "lapiseira", "planner", "kit-presente",
  "mochila", "caneta-gel", "caneta-hidrocor", "lapis", "borracha",
  "post-it", "bloco-de-anotacoes", "regua", "tesoura", "cola",
]

interface Category {
  id: string
  name: string
  handle: string
  parent_category_id?: string | null
}

export default async function CategoriesSection() {
  const categories = await listCategories() as Category[]

  const roots = categories
    .filter((c) => !c.parent_category_id && !EXCLUDED.has(c.handle))
    .sort((a, b) => {
      const ia = PRIORITY.indexOf(a.handle)
      const ib = PRIORITY.indexOf(b.handle)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.name.localeCompare(b.name, "pt-BR")
    })

  if (roots.length === 0) return null

  return (
    <section className="py-8 md:py-12 bg-white">
      <div className="content-container">
        {/* Cabeçalho */}
        <div className="flex items-end justify-between mb-6 md:mb-8">
          <div>
            <p className="text-bibelo-pink text-xs font-semibold uppercase tracking-widest mb-1">
              Encontre o que procura
            </p>
            <h2 className="section-title mb-0 text-left">Categorias</h2>
          </div>
          <Link
            href="/produtos"
            className="text-sm text-bibelo-pink font-semibold hover:underline flex items-center gap-1 shrink-0"
          >
            Ver tudo
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>

        {/* Grid responsivo — 3 cols mobile, 4 tablet, 5 desktop, 6 large */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-5">
          {roots.map((cat) => (
            <CategoryCard
              key={cat.id}
              id={cat.id}
              name={cat.name}
              handle={cat.handle}
              fallbackClass={COLOR_MAP[cat.handle] || "bg-bibelo-rosa/40"}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
