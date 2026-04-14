import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/checkout", "/carrinho", "/pedido/", "/conta/", "/api/"],
      },
    ],
    sitemap: "https://homolog.papelariabibelo.com.br/sitemap.xml",
    host: "https://homolog.papelariabibelo.com.br",
  }
}
