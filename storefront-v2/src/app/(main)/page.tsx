import HeroCarousel from "@/components/home/HeroCarousel"
import BenefitsStrip from "@/components/home/BenefitsStrip"
import NovidadesSection from "@/components/home/NovidadesSection"
import ProductSection from "@/components/home/ProductSection"
import CategoriesSection from "@/components/home/CategoriesSection"
import LeadCapture from "@/components/home/LeadCapture"
import { listProducts } from "@/lib/medusa/products"
import { getNovidadesBling } from "@/lib/api/novidades"

// SSR dinâmico — produtos sempre atualizados a cada request
export const dynamic = "force-dynamic"

export default async function HomePage() {
  const [promoProducts, novidadesResult] = await Promise.allSettled([
    listProducts({ limit: 10, order: "created_at" }).then(({ products }) =>
      products.filter((p) => {
        const variant = p.variants?.[0]
        const price = variant?.calculated_price as { calculated_amount?: number; original_amount?: number } | undefined
        return price && price.original_amount && price.calculated_amount &&
          price.original_amount > price.calculated_amount
      })
    ),
    getNovidadesBling(8),
  ])

  const promos = promoProducts.status === "fulfilled" ? promoProducts.value : []
  const novidadesData = novidadesResult.status === "fulfilled" ? novidadesResult.value : { novidades: [], nf_numero: null }

  return (
    <>
      {/* 1. Carrossel hero */}
      <HeroCarousel />

      {/* 2. Ticker de benefícios — Frete Grátis | Pagamento | Cupom 1ª compra | Clube VIP */}
      <BenefitsStrip />

      {/* Espaçamento entre benefícios e seções de conteúdo */}
      <div className="h-8" />

      {/* 3. Novidades — produtos da NF mais recente com produtos válidos */}
      {novidadesData.novidades.length > 0 && (
        <NovidadesSection
          products={novidadesData.novidades}
          nfNumero={novidadesData.nf_numero}
        />
      )}

      {/* 4. Promoções — produtos Medusa com preço promocional ativo (só aparece se houver) */}
      {promos.length > 0 && (
        <ProductSection
          eyebrow="Aproveite!"
          title="Promoções"
          products={promos as Parameters<typeof ProductSection>[0]["products"]}
          viewAllHref="/promocoes"
        />
      )}

      {/* 5. Categorias */}
      <CategoriesSection />

      {/* 6. Clube Bibelô — captura de leads */}
      <LeadCapture />
    </>
  )
}
