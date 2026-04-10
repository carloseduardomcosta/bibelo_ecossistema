import Link from "next/link"
import { listCategories } from "@/lib/medusa/products"

// Mapeamento de handles para emojis visuais — exportado para reuso em /categoria/[handle]
export const EMOJI_MAP: Record<string, string> = {
  caderno: "📓",
  caderneta: "📕",
  cadernico: "📗",
  caneta: "🖊️",
  "caneta-gel": "🖊️",
  "caneta-esferografica": "🖊️",
  "caneta-hidrocor": "🖊️",
  "caneta-acrilica": "🎨",
  "lapis-de-cor": "🖍️",
  lapis: "✏️",
  lapiseira: "✏️",
  estojo: "👝",
  penal: "👝",
  agenda: "📅",
  planner: "📋",
  "marcador-de-texto": "🖌️",
  "marcador-de-linha": "📐",
  "marcador-de-pagina": "🔖",
  "post-it": "📌",
  "bloco-de-anotacoes": "🗒️",
  borracha: "🧹",
  cola: "🧴",
  "cola-em-fita": "🧴",
  regua: "📏",
  mochila: "🎒",
  "mochila-de-rodinhas": "🎒",
  compasso: "📐",
  "kit-presente": "🎁",
  "kit-papelaria": "🎁",
  "kit-canetas": "🖊️",
  apontador: "🔧",
  corretivo: "✨",
  tesoura: "✂️",
  estilete: "🔪",
  "clips-prendedor": "📎",
  liner: "🖊️",
  "porta-caneta": "🖊️",
  mousepad: "🖱️",
  "porta-clips": "📎",
  grampeador: "🔧",
  grafite: "✏️",
  novidade: "🆕",
  promocao: "🏷️",
  "papel-de-carta": "💌",
  "papel-carta-pautada": "📝",
  prancheta: "📋",
  "perfume-para-papel": "🌸",
  "protetor-de-carregador-de-celular": "🔌",
  calculadora: "🔢",
  "bobbie-goods": "🧸",
}

// Categorias prioritárias que aparecem primeiro
const PRIORITY_HANDLES = [
  "novidade", "promocao", "caderno", "caneta", "lapis-de-cor", "estojo",
  "agenda", "planner", "marcador-de-texto", "post-it", "lapiseira",
  "kit-presente", "mochila", "kit-papelaria",
]

interface Category {
  id: string
  name: string
  handle: string
  parent_category_id?: string | null
}

export default async function CategoriesSection() {
  const categories = await listCategories() as Category[]

  // Apenas categorias pai (sem parent), exceto sub-categorias
  const parentCategories = categories.filter((c) => !c.parent_category_id)

  // Ordenar: prioritárias primeiro, depois alfabético
  const sorted = parentCategories.sort((a, b) => {
    const idxA = PRIORITY_HANDLES.indexOf(a.handle)
    const idxB = PRIORITY_HANDLES.indexOf(b.handle)
    if (idxA !== -1 && idxB !== -1) return idxA - idxB
    if (idxA !== -1) return -1
    if (idxB !== -1) return 1
    return a.name.localeCompare(b.name, "pt-BR")
  })

  if (sorted.length === 0) return null

  return (
    <section className="py-8 md:py-10">
      <div className="content-container">
        <div className="mb-4 md:mb-6">
          <p className="text-bibelo-pink text-xs font-semibold uppercase tracking-widest mb-1">Explore</p>
          <h2 className="section-title mb-0 text-left">Categorias</h2>
        </div>
      </div>

      {/* Mobile: scroll horizontal */}
      <div className="md:hidden overflow-x-auto scrollbar-hide pl-4 pr-2">
        <div className="flex gap-3" style={{ width: "max-content" }}>
          {sorted.map((cat) => (
            <Link
              key={cat.id}
              href={`/categoria/${cat.handle}`}
              className="flex flex-col items-center gap-2 w-[80px] shrink-0"
            >
              <div className="w-16 h-16 rounded-2xl bg-bibelo-rosa flex items-center justify-center text-2xl
                             hover:bg-bibelo-pink/20 hover:scale-105 transition-all duration-200 shadow-sm">
                {EMOJI_MAP[cat.handle] || "📦"}
              </div>
              <span className="text-xs font-medium text-gray-700 text-center leading-tight">{cat.name}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Desktop: grid — top 8 prioritárias + Ver todas */}
      <div className="hidden md:block content-container">
        <div className="grid grid-cols-4 gap-3">
          {sorted.slice(0, 8).map((cat) => (
            <Link
              key={cat.id}
              href={`/categoria/${cat.handle}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-bibelo-rosa/50 hover:bg-bibelo-pink/15
                         transition-colors group"
            >
              <span className="text-2xl">{EMOJI_MAP[cat.handle] || "📦"}</span>
              <span className="text-sm font-semibold text-gray-700 group-hover:text-bibelo-pink transition-colors leading-tight">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-3 text-center">
          <Link
            href="/produtos"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-bibelo-pink hover:text-bibelo-pink/70 transition-colors"
          >
            Ver todas as categorias
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  )
}
