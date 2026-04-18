import HeroCarousel from "@/components/home/HeroCarousel"
import BenefitsStrip from "@/components/home/BenefitsStrip"
import NovidadesSection from "@/components/home/NovidadesSection"
import ProductSection from "@/components/home/ProductSection"
import CategoriesSection from "@/components/home/CategoriesSection"
import ProductCarouselSection from "@/components/home/ProductCarouselSection"
import BrandsSection from "@/components/home/BrandsSection"
import InstagramPlaceholder from "@/components/home/InstagramPlaceholder"
import LeadCapture from "@/components/home/LeadCapture"
import { listProducts } from "@/lib/medusa/products"
import { getNovidadesBling } from "@/lib/api/novidades"

// ISR: revalida a cada 3 minutos (balanceia frescor com performance)
export const revalidate = 180

export default async function HomePage() {
  const [promoProducts, novidadesResult, maisVendidosResult, lancamentosResult] = await Promise.allSettled([
    listProducts({ limit: 10, order: "created_at" }).then(({ products }) =>
      products.filter((p) => {
        const variant = p.variants?.[0]
        const price = variant?.calculated_price as { calculated_amount?: number; original_amount?: number } | undefined
        return price && price.original_amount && price.calculated_amount &&
          price.original_amount > price.calculated_amount
      })
    ),
    getNovidadesBling(8),
    // Mais vendidos: ordem padrão Medusa (relevância/posição de destaque)
    listProducts({ limit: 8 }).then(({ products }) => products),
    // Lançamentos: produtos mais recentes pelo created_at
    listProducts({ limit: 8, order: "-created_at" }).then(({ products }) => products),
  ])

  const promos = promoProducts.status === "fulfilled" ? promoProducts.value : []
  const novidadesData = novidadesResult.status === "fulfilled" ? novidadesResult.value : { novidades: [], nf_numero: null }
  const maisVendidos = maisVendidosResult.status === "fulfilled" ? maisVendidosResult.value : []
  const lancamentos = lancamentosResult.status === "fulfilled" ? lancamentosResult.value : []

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

      {/* 6. Mais Vendidos — produtos em destaque da curadoria */}
      {maisVendidos.length > 0 && (
        <ProductCarouselSection
          eyebrow="Os favoritos"
          title="Mais Vendidos"
          products={maisVendidos as Parameters<typeof ProductCarouselSection>[0]["products"]}
          viewAllHref="/produtos"
        />
      )}

      {/* 7. Lançamentos — produtos mais recentes */}
      {lancamentos.length > 0 && (
        <ProductCarouselSection
          eyebrow="Acabou de chegar"
          title="Lançamentos"
          products={lancamentos as Parameters<typeof ProductCarouselSection>[0]["products"]}
          viewAllHref="/produtos?sort=created_at"
        />
      )}

      {/* 8. Compre por Marca */}
      <BrandsSection />

      {/* 9. Instagram */}
      <InstagramPlaceholder />

      {/* 10. Clube Bibelô — captura de leads */}
      <LeadCapture />
    </>
  )
}
