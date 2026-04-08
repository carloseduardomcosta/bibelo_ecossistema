import Link from "next/link"

// Categorias principais com ícones emoji para visual
const CATEGORIES = [
  { name: "Caderno", handle: "caderno", emoji: "📓" },
  { name: "Caneta", handle: "caneta", emoji: "🖊️" },
  { name: "Lápis de Cor", handle: "lapis-de-cor", emoji: "🖍️" },
  { name: "Estojo", handle: "estojo", emoji: "👝" },
  { name: "Agenda", handle: "agenda", emoji: "📅" },
  { name: "Marca Texto", handle: "marcador-de-texto", emoji: "🖌️" },
  { name: "Post-it", handle: "post-it", emoji: "📌" },
  { name: "Lapiseira", handle: "lapiseira", emoji: "✏️" },
  { name: "Borracha", handle: "borracha", emoji: "🧹" },
  { name: "Planner", handle: "planner", emoji: "📋" },
  { name: "Cola", handle: "cola", emoji: "🧴" },
  { name: "Régua", handle: "regua", emoji: "📏" },
]

export default function CategoriesSection() {
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
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.handle}
              href={`/produtos?categoria=${cat.handle}`}
              className="flex flex-col items-center gap-2 w-[80px] shrink-0"
            >
              <div className="w-16 h-16 rounded-2xl bg-bibelo-rosa flex items-center justify-center text-2xl
                             hover:bg-bibelo-pink/20 hover:scale-105 transition-all duration-200 shadow-sm">
                {cat.emoji}
              </div>
              <span className="text-xs font-medium text-gray-700 text-center leading-tight">{cat.name}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Desktop: grid */}
      <div className="hidden md:block content-container">
        <div className="grid grid-cols-4 lg:grid-cols-6 gap-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.handle}
              href={`/produtos?categoria=${cat.handle}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-bibelo-rosa/50 hover:bg-bibelo-pink/15
                         transition-colors group"
            >
              <span className="text-2xl">{cat.emoji}</span>
              <span className="text-sm font-semibold text-gray-700 group-hover:text-bibelo-pink transition-colors">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
