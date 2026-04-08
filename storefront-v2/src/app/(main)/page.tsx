import HeroCarousel from "@/components/home/HeroCarousel"
import BenefitsStrip from "@/components/home/BenefitsStrip"
import ProductSection from "@/components/home/ProductSection"
import CategoriesSection from "@/components/home/CategoriesSection"
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

  return (
    <>
      {/* 1. Carrossel hero */}
      <HeroCarousel />

      {/* 2. Ticker informativo */}
      <BenefitsStrip />

      {/* 3. Destaques */}
      <ProductSection
        eyebrow="Curadoria especial"
        title="Destaques"
        products={featured as Parameters<typeof ProductSection>[0]["products"]}
        viewAllHref="/produtos"
      />

      {/* 4. Categorias */}
      <div className="bg-bibelo-gray-light py-2">
        <CategoriesSection />
      </div>

      {/* 5. Ofertas */}
      {promos.length > 0 && (
        <ProductSection
          eyebrow="Aproveite!"
          title="Ofertas"
          products={promos as Parameters<typeof ProductSection>[0]["products"]}
          viewAllHref="/produtos?sort=price_asc"
        />
      )}

      {/* Banner cupom antes do footer */}
      <div className="bg-bibelo-amarelo py-8 md:py-10">
        <div className="content-container text-center">
          <p className="text-sm font-semibold text-gray-600 uppercase tracking-widest mb-2">Primeira compra</p>
          <h2 className="text-3xl md:text-4xl font-black text-bibelo-pink mb-3">7% OFF</h2>
          <p className="text-gray-700 mb-4">Use o cupom <strong className="text-bibelo-pink">BIBELO7</strong> e ganhe desconto na sua primeira compra</p>
          <a href="/produtos" className="btn-primary inline-block">
            Aproveitar agora
          </a>
        </div>
      </div>
    </>
  )
}
