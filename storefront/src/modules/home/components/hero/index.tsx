import LocalizedClientLink from "@modules/common/components/localized-client-link"

// URL do banner real do site da Bibelô (NuvemShop CDN)
const HERO_BANNER_URL =
  "https://dcdn-us.mitiendanube.com/stores/007/290/881/themes/amazonas/2-slide-1771196177140-998030759-45a7b7f0772f00aa064e4d5ad32ba09f1771196179-480-0.webp"

const Hero = () => {
  return (
    <section className="w-full relative overflow-hidden">
      {/* ── Desktop: imagem editorial full-width ── */}
      <div className="hidden small:block relative w-full" style={{ minHeight: "520px" }}>
        {/* Imagem de fundo */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url('${HERO_BANNER_URL}')` }}
          aria-hidden="true"
        />
        {/* Overlay gradiente para legibilidade */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(255,229,236,0.95) 0%, rgba(255,229,236,0.80) 40%, rgba(255,229,236,0.10) 75%, rgba(255,229,236,0.0) 100%)",
          }}
          aria-hidden="true"
        />
        {/* Conteúdo */}
        <div className="content-container relative z-10 flex items-center" style={{ minHeight: "520px" }}>
          <div className="max-w-xl py-16">
            {/* Eyebrow */}
            <p className="text-xs uppercase tracking-[0.2em] text-bibelo-pink font-semibold mb-3">
              Curadoria especial · Timbó/SC
            </p>
            {/* Heading */}
            <h1 className="font-heading text-5xl xl:text-6xl font-semibold text-bibelo-dark leading-tight">
              Papelaria que{" "}
              <span className="text-bibelo-pink italic">inspira</span>
              <br />
              o seu dia a dia
            </h1>
            {/* Subtext */}
            <p className="text-base text-bibelo-dark/70 mt-5 leading-relaxed max-w-md">
              Agendas, cadernos e acessórios selecionados com carinho para quem
              ama escrever, organizar e criar.
            </p>
            {/* CTAs */}
            <div className="mt-8 flex flex-wrap gap-3">
              <LocalizedClientLink
                href="/store"
                className="inline-flex items-center gap-2 bg-bibelo-pink hover:bg-[#e050a8] text-white font-semibold px-8 py-3.5 rounded-full transition-all duration-200 shadow-md hover:shadow-lg text-sm"
              >
                Explorar loja
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </LocalizedClientLink>
              <a
                href="https://wa.me/5547933862514?text=Oi!%20Quero%20conhecer%20a%20Papelaria%20Bibelô"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm border-2 border-bibelo-dark/20 text-bibelo-dark hover:border-bibelo-pink hover:text-bibelo-pink font-semibold px-8 py-3.5 rounded-full transition-all duration-200 text-sm"
              >
                <svg className="w-4 h-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.917.918l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.347 0-4.518-.802-6.235-2.147a.75.75 0 00-.652-.13l-3.08 1.033 1.033-3.08a.75.75 0 00-.13-.652A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                </svg>
                Fale conosco
              </a>
            </div>
            {/* Social proof */}
            <div className="mt-8 flex items-center gap-4">
              <div className="flex -space-x-2">
                {["#fe68c4", "#fff7c1", "#ffe5ec", "#2d2d2d"].map((color, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: color, zIndex: 4 - i }}
                  >
                    {["A", "B", "C", "D"][i]}
                  </div>
                ))}
              </div>
              <p className="text-sm text-bibelo-dark/60">
                <span className="font-semibold text-bibelo-dark">+115 clientes</span> no Grupo VIP
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile: hero compacto com gradiente ── */}
      <div className="small:hidden relative bg-gradient-to-br from-bibelo-rosa via-white to-bibelo-amarelo/40 px-6 py-12 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-bibelo-pink font-semibold mb-3">
          Curadoria especial · Timbó/SC
        </p>
        <h1 className="font-heading text-4xl font-semibold text-bibelo-dark leading-tight">
          Papelaria que{" "}
          <span className="text-bibelo-pink italic">inspira</span>
        </h1>
        <p className="text-sm text-bibelo-dark/70 mt-4 leading-relaxed">
          Agendas, cadernos e acessórios selecionados com carinho.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <LocalizedClientLink
            href="/store"
            className="inline-flex items-center justify-center gap-2 bg-bibelo-pink hover:bg-[#e050a8] text-white font-semibold px-8 py-3.5 rounded-full transition-colors text-sm shadow-md"
          >
            Explorar loja
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </LocalizedClientLink>
          <a
            href="https://wa.me/5547933862514"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 border-2 border-bibelo-dark/20 text-bibelo-dark font-semibold px-8 py-3.5 rounded-full transition-colors text-sm"
          >
            <svg className="w-4 h-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.917.918l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.347 0-4.518-.802-6.235-2.147a.75.75 0 00-.652-.13l-3.08 1.033 1.033-3.08a.75.75 0 00-.13-.652A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
            </svg>
            Fale conosco
          </a>
        </div>
      </div>
    </section>
  )
}

export default Hero
