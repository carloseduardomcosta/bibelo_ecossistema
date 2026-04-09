import HeroCarousel from "@/components/home/HeroCarousel"
import BenefitsStrip from "@/components/home/BenefitsStrip"
import MobileProductScroller from "@/components/home/MobileProductScroller"
import NovidadesSection from "@/components/home/NovidadesSection"
import CategoriesSection from "@/components/home/CategoriesSection"
import ProductSection from "@/components/home/ProductSection"
import LeadCapture from "@/components/home/LeadCapture"
import { listProducts } from "@/lib/medusa/products"
import { getNovidadesBling } from "@/lib/api/novidades"

// SSR dinâmico — produtos sempre atualizados a cada request
export const dynamic = "force-dynamic"

async function getFeaturedProducts() {
  const { products } = await listProducts({ limit: 10 })
  return products
}

export default async function HomePage() {
  const [featuredProducts, promoProducts, novidadesResult] = await Promise.allSettled([
    getFeaturedProducts(),
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

  const featured = featuredProducts.status === "fulfilled" ? featuredProducts.value : []
  const promos = promoProducts.status === "fulfilled" ? promoProducts.value : []
  const novidadesBling = novidadesResult.status === "fulfilled" ? novidadesResult.value : []

  // Produtos para o scroller mobile: prioriza promos, complementa com destaques
  const scrollerProducts = [
    ...promos.slice(0, 4),
    ...featured.filter((p) => !promos.find((pr) => pr.id === p.id)),
  ].slice(0, 8)

  return (
    <>
      {/* 1. Carrossel hero */}
      <HeroCarousel />

      {/* 2. Cards deslizantes — APENAS mobile, visível na primeira tela sem scroll */}
      <MobileProductScroller
        products={scrollerProducts as Parameters<typeof MobileProductScroller>[0]["products"]}
      />

      {/* 3. Ticker de benefícios */}
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
