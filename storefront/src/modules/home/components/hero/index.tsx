import { Heading, Text } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const HERO_PRODUCTS = [
  {
    name: "Lápis Faber-Castell Sparkle",
    price: "R$ 59,90",
    href: "/store",
    initial: "L",
  },
  {
    name: "Caneta BRW Stiletto Premium",
    price: "R$ 7,90",
    oldPrice: "R$ 9,90",
    href: "/store",
    initial: "C",
  },
  {
    name: "Caderno Tilibra West Village",
    price: "R$ 24,90",
    oldPrice: "R$ 32,90",
    href: "/store",
    initial: "C",
  },
  {
    name: "Caneta Gel Holic Essenza 0.7",
    price: "R$ 7,90",
    href: "/store",
    initial: "C",
  },
]

const Hero = () => {
  return (
    <div className="w-full border-b border-bibelo-rosa relative bg-bibelo-rosa">
      <div className="content-container py-12 small:py-20 flex flex-col small:flex-row items-center gap-8 small:gap-12">
        {/* Text content */}
        <div className="flex-1 text-center small:text-left">
          <Heading
            level="h1"
            className="text-3xl small:text-5xl leading-tight text-bibelo-dark font-heading font-semibold tracking-wide"
          >
            Papelaria com{" "}
            <span className="text-bibelo-pink">curadoria especial</span>
          </Heading>
          <Text className="text-base small:text-lg leading-7 text-bibelo-dark/70 mt-4 max-w-lg mx-auto small:mx-0">
            Agendas, cadernos e acessórios que fazem do seu dia a dia algo
            especial. Produtos selecionados com carinho em Timbó/SC.
          </Text>
          <div className="mt-8 flex flex-col xsmall:flex-row gap-3 justify-center small:justify-start">
            <LocalizedClientLink
              href="/store"
              className="inline-block bg-bibelo-pink hover:bg-[#e050a8] text-white font-semibold px-8 py-3 rounded-full transition-colors text-center"
            >
              Conheça nossa loja
            </LocalizedClientLink>
            <a
              href="https://wa.me/5547933862514?text=Oi!%20Quero%20conhecer%20a%20Papelaria%20Bibelô"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 border-2 border-bibelo-dark text-bibelo-dark hover:bg-bibelo-dark hover:text-white font-semibold px-8 py-3 rounded-full transition-colors text-center"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.917.918l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.347 0-4.518-.802-6.235-2.147a.75.75 0 00-.652-.13l-3.08 1.033 1.033-3.08a.75.75 0 00-.13-.652A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
              Fale conosco
            </a>
          </div>
        </div>

        {/* Product grid 2x2 */}
        <div className="flex-1 hidden small:grid grid-cols-2 gap-3 max-w-md">
          {HERO_PRODUCTS.map((product, i) => (
            <LocalizedClientLink
              key={i}
              href={product.href}
              className="group/card bg-white rounded-2xl p-4 flex flex-col items-center text-center hover:shadow-lg transition-shadow duration-200"
            >
              <div className="w-full aspect-square rounded-xl bg-bibelo-rosa/50 flex items-center justify-center mb-3">
                <span className="text-3xl font-heading font-semibold text-bibelo-pink/40">
                  {product.initial}
                </span>
              </div>
              <p className="text-xs text-bibelo-dark/60 leading-snug line-clamp-2 mb-2">
                {product.name}
              </p>
              <div className="flex items-center gap-1.5">
                {product.oldPrice && (
                  <span className="text-xs text-bibelo-dark/40 line-through">
                    {product.oldPrice}
                  </span>
                )}
                <span className="text-sm font-semibold text-bibelo-pink">
                  {product.price}
                </span>
              </div>
            </LocalizedClientLink>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Hero
