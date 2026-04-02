import { Metadata } from "next"

import FeaturedProducts from "@modules/home/components/featured-products"
import Hero from "@modules/home/components/hero"
import BenefitsStrip from "@modules/home/components/benefits-strip"
import CategoryPills from "@modules/home/components/category-pills"
import VipBanner from "@modules/home/components/vip-banner"
import { listCollections } from "@lib/data/collections"
import { listCategories } from "@lib/data/categories"
import { getRegion } from "@lib/data/regions"

export const metadata: Metadata = {
  title: "Papelaria Bibelô — Papelaria Artesanal com Curadoria Especial",
  description:
    "Descubra nossa seleção curada de papelaria artesanal, agendas, cadernos e acessórios de escrita.",
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
      <Hero />
      <BenefitsStrip />
      {categories && categories.length > 0 && (
        <CategoryPills categories={categories} />
      )}
      <div className="py-6">
        <div className="content-container mb-6">
          <h2 className="font-heading text-2xl font-semibold text-bibelo-dark">
            Mais vendidos
          </h2>
        </div>
        <ul className="flex flex-col">
          <FeaturedProducts collections={collections} region={region} />
        </ul>
      </div>
      <VipBanner />
    </>
  )
}
