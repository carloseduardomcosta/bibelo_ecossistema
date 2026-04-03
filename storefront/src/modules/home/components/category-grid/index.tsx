import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"

// Ícones SVG inline por categoria
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "Caneta": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  ),
  "Caderno": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  "Agenda": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  ),
  "Lápis de Cor": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
    </svg>
  ),
  "Post-it": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  "Estojo": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  "Marcador de Texto": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  "Kit Presente": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
}

// Paleta de cores por categoria
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "Caneta":           { bg: "bg-bibelo-rosa",    text: "text-bibelo-pink",  border: "border-bibelo-rosa" },
  "Caderno":          { bg: "bg-bibelo-amarelo", text: "text-bibelo-dark",  border: "border-bibelo-amarelo" },
  "Agenda":           { bg: "bg-bibelo-rosa",    text: "text-bibelo-pink",  border: "border-bibelo-rosa" },
  "Lápis de Cor":     { bg: "bg-bibelo-amarelo", text: "text-bibelo-dark",  border: "border-bibelo-amarelo" },
  "Post-it":          { bg: "bg-bibelo-rosa",    text: "text-bibelo-pink",  border: "border-bibelo-rosa" },
  "Estojo":           { bg: "bg-bibelo-amarelo", text: "text-bibelo-dark",  border: "border-bibelo-amarelo" },
  "Marcador de Texto": { bg: "bg-bibelo-rosa",   text: "text-bibelo-pink",  border: "border-bibelo-rosa" },
  "Kit Presente":     { bg: "bg-bibelo-amarelo", text: "text-bibelo-dark",  border: "border-bibelo-amarelo" },
}

const HIGHLIGHT_CATEGORIES = [
  "Caneta", "Caderno", "Agenda", "Lápis de Cor",
  "Post-it", "Estojo", "Marcador de Texto", "Kit Presente",
]

export default function CategoryGrid({
  categories,
}: {
  categories: HttpTypes.StoreProductCategory[]
}) {
  const catMap = new Map(categories.map((c) => [c.name, c]))

  return (
    <section className="w-full py-12 bg-white">
      <div className="content-container">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-bibelo-pink font-semibold mb-1">
              Navegue por
            </p>
            <h2 className="font-heading text-3xl font-semibold text-bibelo-dark">
              Categorias
            </h2>
          </div>
          <LocalizedClientLink
            href="/store"
            className="text-sm font-medium text-bibelo-pink hover:text-[#e050a8] flex items-center gap-1 transition-colors"
          >
            Ver todas
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </LocalizedClientLink>
        </div>

        {/* Grid de categorias */}
        <div className="grid grid-cols-2 small:grid-cols-4 gap-3 small:gap-4">
          {HIGHLIGHT_CATEGORIES.map((name) => {
            const cat = catMap.get(name)
            const colors = CATEGORY_COLORS[name] || { bg: "bg-bibelo-rosa", text: "text-bibelo-pink", border: "border-bibelo-rosa" }
            const icon = CATEGORY_ICONS[name]

            const content = (
              <div
                className={`group flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 ${colors.bg} ${colors.border} hover:shadow-md hover:scale-[1.02] transition-all duration-200 cursor-pointer`}
              >
                <div className={`${colors.text} opacity-70 group-hover:opacity-100 transition-opacity`}>
                  {icon || (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm font-semibold ${colors.text} text-center leading-tight`}>
                  {name}
                </span>
              </div>
            )

            if (cat) {
              return (
                <LocalizedClientLink
                  key={name}
                  href={`/categories/${cat.handle}`}
                >
                  {content}
                </LocalizedClientLink>
              )
            }

            return (
              <LocalizedClientLink key={name} href="/store">
                {content}
              </LocalizedClientLink>
            )
          })}
        </div>
      </div>
    </section>
  )
}
