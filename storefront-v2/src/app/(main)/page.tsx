import HeroCarousel from "@/components/home/HeroCarousel"
import BenefitsStrip from "@/components/home/BenefitsStrip"
import ProductSection from "@/components/home/ProductSection"
import CategoriesSection from "@/components/home/CategoriesSection"
import MobileProductScroller from "@/components/home/MobileProductScroller"
import { listProducts } from "@/lib/medusa/products"

export const revalidate = 300

async function getFeaturedProducts() {
  const { products } = await listProducts({ limit: 10 })
  return products
}

async function getPromoProducts() {
  const { products } = await listProducts({ limit: 10, order: "created_at" })
  return products.filter((p) => {
    const variant = p.variants?.[0]
    const price = variant?.calculated_price as { calculated_amount?: number; original_amount?: number } | undefined
    return price && price.original_amount && price.calculated_amount &&
      price.original_amount > price.calculated_amount
  })
}

export default async function HomePage() {
  const [featuredProducts, promoProducts] = await Promise.allSettled([
    getFeaturedProducts(),
    getPromoProducts(),
  ])

  const featured = featuredProducts.status === "fulfilled" ? featuredProducts.value : []
  const promos = promoProducts.status === "fulfilled" ? promoProducts.value : []

  // Produtos para o scroller mobile: prioriza promos, complementa com destaques
  const scrollerProducts = [
    ...promos.slice(0, 4),
    ...featured.filter((p) => !promos.find((pr) => pr.id === p.id)),
  ].slice(0, 8)

  return (
    <>
      {/* 1. Carrossel hero — altura compacta no mobile para caber os cards na primeira tela */}
      <HeroCarousel />

      {/* 2. Cards deslizantes — APENAS mobile, visível na primeira tela sem scroll */}
      <MobileProductScroller
        products={scrollerProducts as Parameters<typeof MobileProductScroller>[0]["products"]}
      />

      {/* 3. Ticker de benefícios */}
      <BenefitsStrip />

      {/* 4. Destaques — grid completo (desktop e mobile) */}
      <ProductSection
        eyebrow="Curadoria especial"
        title="Destaques"
        products={featured as Parameters<typeof ProductSection>[0]["products"]}
        viewAllHref="/produtos"
      />

      {/* 5. Categorias */}
      <div className="bg-bibelo-gray-light py-2">
        <CategoriesSection />
      </div>

      {/* 6. Ofertas */}
      {promos.length > 0 && (
        <ProductSection
          eyebrow="Aproveite!"
          title="Ofertas"
          products={promos as Parameters<typeof ProductSection>[0]["products"]}
          viewAllHref="/produtos?sort=price_asc"
        />
      )}
    </>
  )
}
