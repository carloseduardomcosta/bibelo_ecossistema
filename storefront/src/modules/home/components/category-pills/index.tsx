import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"

const HIGHLIGHT_CATEGORIES = [
  "Caneta",
  "Caderno",
  "Lápis de Cor",
  "Estojo",
  "Agenda",
  "Post-it",
]

export default function CategoryPills({
  categories,
}: {
  categories: HttpTypes.StoreProductCategory[]
}) {
  const catMap = new Map(categories.map((c) => [c.name, c]))

  return (
    <section className="w-full py-10">
      <div className="content-container">
        <h2 className="font-heading text-2xl font-semibold text-bibelo-dark text-center mb-6">
          Categorias em destaque
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          {HIGHLIGHT_CATEGORIES.map((name) => {
            const cat = catMap.get(name)
            if (!cat) return null
            return (
              <LocalizedClientLink
                key={cat.id}
                href={`/categories/${cat.handle}`}
                className="px-5 py-2.5 rounded-full bg-bibelo-rosa text-bibelo-dark text-sm font-medium hover:bg-bibelo-pink hover:text-white transition-colors"
              >
                {name}
              </LocalizedClientLink>
            )
          })}
          <LocalizedClientLink
            href="/store"
            className="px-5 py-2.5 rounded-full border-2 border-bibelo-rosa text-bibelo-dark/60 text-sm font-medium hover:border-bibelo-pink hover:text-bibelo-pink transition-colors"
          >
            Ver todas &rarr;
          </LocalizedClientLink>
        </div>
      </div>
    </section>
  )
}
