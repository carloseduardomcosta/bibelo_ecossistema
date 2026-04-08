import { Suspense } from "react"
import HeroCarousel from "@/components/home/HeroCarousel"
import BenefitsStrip from "@/components/home/BenefitsStrip"
import ProductSection from "@/components/home/ProductSection"
import { listProducts, listCollections } from "@/lib/medusa/products"

// Revalidar a cada 5 minutos
export const revalidate = 300

async function getFeaturedProducts() {
  const { products } = await listProducts({ limit: 10 })
  return products
}

async function getPromoProducts() {
  const { products } = await listProducts({ limit: 8, order: "-created_at" })
  // Filtrar apenas produtos com desconto
  return products.filter((p) => {
    const variant = p.variants?.[0]
    const price = variant?.calculated_price as { calculated_amount?: number; original_amount?: number } | undefined
    return price && price.original_amount && price.calculated_amount &&
      price.original_amount > price.calculated_amount
  })
}

async function getNewProducts() {
  const { products } = await listProducts({ limit: 8, order: "-created_at" })
  return products
}

export default async function HomePage() {
  const [featuredProducts, promoProducts, newProducts] = await Promise.allSettled([
    getFeaturedProducts(),
    getPromoProducts(),
    getNewProducts(),
  ])

  const featured = featuredProducts.status === "fulfilled" ? featuredProducts.value : []
  const promos = promoProducts.status === "fulfilled" ? promoProducts.value : []
  const news = newProducts.status === "fulfilled" ? newProducts.value : []

  return (
    <>
      {/* Hero carrossel */}
      <HeroCarousel />

      {/* Strip de benefícios */}
      <BenefitsStrip />

      {/* Seção Destaques */}
      <ProductSection
        eyebrow="Curadoria especial"
        title="Destaques"
        products={featured as Parameters<typeof ProductSection>[0]["products"]}
        viewAllHref="/produtos"
      />

      {/* Seção Promoções */}
      {promos.length > 0 && (
        <div className="bg-bibelo-gray-light py-2">
          <ProductSection
            eyebrow="Aproveite!"
            title="Promoções"
            products={promos as Parameters<typeof ProductSection>[0]["products"]}
            viewAllHref="/produtos?sort=price_asc"
          />
        </div>
      )}

      {/* Seção Lançamentos */}
      {news.length > 0 && (
        <ProductSection
          eyebrow="Acabou de chegar"
          title="Lançamentos"
          products={news as Parameters<typeof ProductSection>[0]["products"]}
          viewAllHref="/produtos?sort=created_at"
        />
      )}

      {/* Banner cupom */}
      <div className="bg-bibelo-yellow py-10">
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
