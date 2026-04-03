import { listCategories } from "@lib/data/categories"
import { listCollections } from "@lib/data/collections"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default async function Footer() {
  const { collections } = await listCollections({
    fields: "*products",
  })
  const productCategories = await listCategories()

  return (
    <footer className="w-full bg-bibelo-dark text-white">
      {/* Main footer content */}
      <div className="content-container py-16">
        <div className="grid grid-cols-1 small:grid-cols-2 large:grid-cols-4 gap-10">
          {/* Coluna 1: Marca */}
          <div className="large:col-span-1">
            <LocalizedClientLink
              href="/"
              className="font-heading text-2xl font-semibold text-white hover:text-bibelo-pink transition-colors"
            >
              Papelaria Bibelô
            </LocalizedClientLink>
            <p className="text-sm text-white/50 mt-3 leading-relaxed">
              Papelaria artesanal com curadoria especial. Produtos selecionados
              com carinho para o seu dia a dia, direto de Timbó/SC.
            </p>
            {/* Redes sociais */}
            <div className="flex items-center gap-3 mt-5">
              <a
                href="https://instagram.com/papelariabibelo"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-bibelo-pink hover:text-white transition-all duration-200"
                aria-label="Instagram"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
              <a
                href="https://wa.me/5547933862514"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-[#25D366] hover:text-white transition-all duration-200"
                aria-label="WhatsApp"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.917.918l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.347 0-4.518-.802-6.235-2.147a.75.75 0 00-.652-.13l-3.08 1.033 1.033-3.08a.75.75 0 00-.13-.652A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                </svg>
              </a>
              <a
                href="https://tiktok.com/@papelariabibelo"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-bibelo-pink hover:text-white transition-all duration-200"
                aria-label="TikTok"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.54V6.78a4.85 4.85 0 01-1.02-.09z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Coluna 2: Categorias */}
          <div>
            <h3 className="text-xs uppercase tracking-[0.15em] text-white/40 font-semibold mb-4">
              Categorias
            </h3>
            <ul className="flex flex-col gap-2.5">
              {(() => {
                const preferred = ["caneta", "caderno", "lapis-de-cor", "estojo", "agenda", "post-it"]
                const picked = productCategories
                  ? preferred.map(h => productCategories.find(c => c.handle === h)).filter(Boolean)
                  : []
                return (picked.length > 0 ? picked : productCategories?.slice(0, 6) || []).map((cat: any) => (
                  <li key={cat.id}>
                    <LocalizedClientLink
                      href={`/categories/${cat.handle}`}
                      className="text-sm text-white/60 hover:text-bibelo-pink transition-colors"
                    >
                      {cat.name}
                    </LocalizedClientLink>
                  </li>
                ))
              })()}
            </ul>
          </div>

          {/* Coluna 3: Coleções */}
          {collections && collections.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-[0.15em] text-white/40 font-semibold mb-4">
                Coleções
              </h3>
              <ul className="flex flex-col gap-2.5">
                {collections.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <LocalizedClientLink
                      href={`/collections/${c.handle}`}
                      className="text-sm text-white/60 hover:text-bibelo-pink transition-colors"
                    >
                      {c.title}
                    </LocalizedClientLink>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Coluna 4: Institucional + Contato */}
          <div>
            <h3 className="text-xs uppercase tracking-[0.15em] text-white/40 font-semibold mb-4">
              Institucional
            </h3>
            <ul className="flex flex-col gap-2.5">
              <li>
                <LocalizedClientLink href="/" className="text-sm text-white/60 hover:text-bibelo-pink transition-colors">
                  Sobre nós
                </LocalizedClientLink>
              </li>
              <li>
                <a
                  href="https://wa.me/5547933862514"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-white/60 hover:text-bibelo-pink transition-colors"
                >
                  Contato
                </a>
              </li>
              <li>
                <LocalizedClientLink href="/" className="text-sm text-white/60 hover:text-bibelo-pink transition-colors">
                  Política de Privacidade
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/" className="text-sm text-white/60 hover:text-bibelo-pink transition-colors">
                  Trocas e Devoluções
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/" className="text-sm text-white/60 hover:text-bibelo-pink transition-colors">
                  Rastrear Pedido
                </LocalizedClientLink>
              </li>
            </ul>

            {/* Localização */}
            <div className="mt-6 flex items-start gap-2 text-white/40">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <span className="text-xs leading-relaxed">Timbó, Santa Catarina — Brasil</span>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/10">
        <div className="content-container py-6">
          <div className="flex flex-col small:flex-row items-center justify-between gap-4">
            {/* Formas de pagamento */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-white/30 mr-1">Pagamento:</span>
              {["Pix", "Visa", "Mastercard", "Boleto", "Elo"].map((method) => (
                <span
                  key={method}
                  className="text-xs font-medium text-white/50 bg-white/10 px-3 py-1 rounded-full border border-white/10"
                >
                  {method}
                </span>
              ))}
            </div>
            {/* Copyright */}
            <p className="text-xs text-white/30 text-center small:text-right">
              &copy; {new Date().getFullYear()} Papelaria Bibelô. Feito com carinho em Timbó/SC.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
