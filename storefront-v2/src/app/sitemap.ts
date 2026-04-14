import type { MetadataRoute } from "next"
import { listProducts, listCategories } from "@/lib/medusa/products"

const BASE_URL = "https://homolog.papelariabibelo.com.br"

export const revalidate = 3600 // regenera a cada 1 hora

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // Páginas estáticas
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/produtos`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/novidades`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/busca`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
  ]

  // Categorias
  let categoryRoutes: MetadataRoute.Sitemap = []
  try {
    const categories = await listCategories()
    categoryRoutes = categories
      .filter((cat) => cat.handle)
      .map((cat) => ({
        url: `${BASE_URL}/produtos?categoria=${cat.handle}`,
        lastModified: new Date(cat.updated_at ?? now),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }))
  } catch {
    // categorias indisponíveis — continua sem elas
  }

  // Produtos
  let productRoutes: MetadataRoute.Sitemap = []
  try {
    const { products } = await listProducts({ limit: 500 })
    productRoutes = products
      .filter((p) => p.handle)
      .map((p) => ({
        url: `${BASE_URL}/produto/${p.handle}`,
        lastModified: new Date((p.updated_at as string | undefined) ?? now),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }))
  } catch {
    // produtos indisponíveis — continua sem eles
  }

  return [...staticRoutes, ...categoryRoutes, ...productRoutes]
}
