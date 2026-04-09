import { Metadata } from "next"
import FeaturedProducts from "@modules/home/components/featured-products"
import Hero from "@modules/home/components/hero"
import BenefitsStrip from "@modules/home/components/benefits-strip"
import CategoryGrid from "@modules/home/components/category-grid"
import VipBanner from "@modules/home/components/vip-banner"
import NewsletterSection from "@modules/home/components/newsletter-section"
import PromoBanner from "@modules/home/components/promo-banner"
import MobileProductScroller from "@modules/home/components/mobile-product-scroller"
import { listCollections } from "@lib/data/collections"
import { listCategories } from "@lib/data/categories"
import { getRegion } from "@lib/data/regions"

export const metadata: Metadata = {
  title: "Papelaria Bibelô — Papelaria Artesanal com Curadoria Especial",
  description:
    "Descubra nossa seleção curada de papelaria artesanal, agendas, cadernos e acessórios de escrita. Produtos selecionados com carinho em Timbó/SC.",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params
  const { countryCode } = params
  const region = await getRegion(countryCode)
  const [{ collections }, categories] = await Promise.all([
    listCollections({ fields: "id, handle, title" }),
    listCategories(),
  ])

  if (!collections || !region) {
    return null
  }

  return (
    <>
      {/* 1. Hero editorial com imagem real */}
      <Hero />

      {/* 2. Carrossel de produtos — apenas mobile, logo após o hero */}
      <MobileProductScroller region={region} />

      {/* 3. Barra de benefícios */}
      <BenefitsStrip />

      {/* 3. Banner de promoção / cupom primeira compra */}
      <PromoBanner />

      {/* 4. Grid de categorias visual */}
      {categories && categories.length > 0 && (
        <CategoryGrid categories={categories} />
      )}

      {/* 5. Coleções / Mais vendidos */}
      <div className="py-8 bg-white">
        <ul className="flex flex-col gap-y-0">
          <FeaturedProducts collections={collections} region={region} />
        </ul>
      </div>

      {/* 6. Banner VIP WhatsApp */}
      <VipBanner />

      {/* 7. Newsletter */}
      <NewsletterSection />
    </>
  )
}
