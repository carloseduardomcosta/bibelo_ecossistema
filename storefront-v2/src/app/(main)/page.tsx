import HeroCarousel from "@/components/home/HeroCarousel"
import BenefitsStrip from "@/components/home/BenefitsStrip"
import NovidadesSection from "@/components/home/NovidadesSection"
import CategoriesSection from "@/components/home/CategoriesSection"
import ProductSection from "@/components/home/ProductSection"
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
  const novidadesBling = novidadesResult.status === "fulfilled" ? novidadesResult.value : []

  return (
    <>
      {/* 1. Carrossel hero */}
      <HeroCarousel />

      {/* 2. Ticker de benefícios — Frete Grátis | Pagamento | Cupom 1ª compra | Clube VIP */}
      <BenefitsStrip />

      {/* Espaçamento entre benefícios e seções de conteúdo */}
      <div className="h-8" />

      {/* 4. Novidades — produtos das últimas NFs do Bling com foto + preço + descrição + estoque */}
      {novidadesBling.length > 0 && (
        <NovidadesSection products={novidadesBling} />
      )}

      {/* 5. Categorias */}
      <CategoriesSection />

      {/* 6. Ofertas */}
      {promos.length > 0 && (
        <ProductSection
          eyebrow="Aproveite!"
          title="Ofertas"
          products={promos as Parameters<typeof ProductSection>[0]["products"]}
          viewAllHref="/produtos?sort=price_asc"
        />
      )}

      {/* 7. Captura de Lead — Clube Bibelô */}
      <LeadCapture />
    </>
  )
}
