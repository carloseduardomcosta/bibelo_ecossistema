import { describe, it, expect } from "vitest"

/**
 * Testes de estrutura das páginas institucionais
 * Verifica que os metadados e conteúdo essencial existem
 */

import fs from "fs"
import path from "path"

const PAGES_DIR = path.resolve(__dirname, "../app/(main)")

describe("Páginas institucionais — existência", () => {
  const requiredPages = [
    "sobre",
    "faq",
    "politica-de-privacidade",
    "termos-de-uso",
    "trocas-e-devolucoes",
    "politica-de-frete",
  ]

  for (const page of requiredPages) {
    it(`/${page} existe`, () => {
      const pagePath = path.join(PAGES_DIR, page, "page.tsx")
      expect(fs.existsSync(pagePath)).toBe(true)
    })
  }
})

describe("Páginas de e-commerce — existência", () => {
  const requiredPages = [
    "produtos",
    "carrinho",
    "checkout",
    "checkout/confirmacao",
    "busca",
    "conta",
    "conta/pedidos",
    "conta/enderecos",
  ]

  for (const page of requiredPages) {
    it(`/${page} existe`, () => {
      const pagePath = path.join(PAGES_DIR, page, "page.tsx")
      expect(fs.existsSync(pagePath)).toBe(true)
    })
  }
})

describe("Páginas institucionais — conteúdo obrigatório", () => {
  it("sobre: contém CNPJ", () => {
    const content = fs.readFileSync(
      path.join(PAGES_DIR, "sobre/page.tsx"),
      "utf-8"
    )
    expect(content).toContain("63.961.764/0001-63")
  })

  it("sobre: contém endereço da loja", () => {
    const content = fs.readFileSync(
      path.join(PAGES_DIR, "sobre/page.tsx"),
      "utf-8"
    )
    expect(content).toContain("Timbó")
  })

  it("privacidade: contém LGPD", () => {
    const content = fs.readFileSync(
      path.join(PAGES_DIR, "politica-de-privacidade/page.tsx"),
      "utf-8"
    )
    expect(content).toContain("LGPD")
  })

  it("privacidade: contém direitos do usuário", () => {
    const content = fs.readFileSync(
      path.join(PAGES_DIR, "politica-de-privacidade/page.tsx"),
      "utf-8"
    )
    expect(content).toContain("Acesso aos seus dados pessoais")
  })

  it("termos: contém foro de Timbó", () => {
    const content = fs.readFileSync(
      path.join(PAGES_DIR, "termos-de-uso/page.tsx"),
      "utf-8"
    )
    expect(content).toContain("comarca de Timbó")
  })

  it("trocas: contém prazo de 7 dias", () => {
    const content = fs.readFileSync(
      path.join(PAGES_DIR, "trocas-e-devolucoes/page.tsx"),
      "utf-8"
    )
    expect(content).toContain("7 (sete) dias corridos")
  })

  it("faq: contém seção de pagamento", () => {
    const content = fs.readFileSync(
      path.join(PAGES_DIR, "faq/page.tsx"),
      "utf-8"
    )
    expect(content).toContain("Pagamento")
  })

  it("faq: contém seção de entrega", () => {
    const content = fs.readFileSync(
      path.join(PAGES_DIR, "faq/page.tsx"),
      "utf-8"
    )
    expect(content).toContain("Entrega")
  })

  it("faq: menciona frete grátis", () => {
    const content = fs.readFileSync(
      path.join(PAGES_DIR, "faq/page.tsx"),
      "utf-8"
    )
    expect(content).toContain("frete grátis")
  })
})

describe("Footer — links institucionais", () => {
  const footerPath = path.resolve(
    __dirname,
    "../components/layout/Footer.tsx"
  )

  it("footer existe", () => {
    expect(fs.existsSync(footerPath)).toBe(true)
  })

  it("contém link para Sobre", () => {
    const content = fs.readFileSync(footerPath, "utf-8")
    expect(content).toContain("/sobre")
  })

  it("contém link para Política de Privacidade", () => {
    const content = fs.readFileSync(footerPath, "utf-8")
    expect(content).toContain("/politica-de-privacidade")
  })

  it("contém link para Termos de Uso", () => {
    const content = fs.readFileSync(footerPath, "utf-8")
    expect(content).toContain("/termos-de-uso")
  })

  it("contém link para Trocas e Devoluções", () => {
    const content = fs.readFileSync(footerPath, "utf-8")
    expect(content).toContain("/trocas-e-devolucoes")
  })

  it("contém link para FAQ", () => {
    const content = fs.readFileSync(footerPath, "utf-8")
    expect(content).toContain("/faq")
  })

  it("contém nome da empresa", () => {
    const content = fs.readFileSync(footerPath, "utf-8")
    expect(content).toContain("Papelaria Bibelô")
  })

  it("contém email de contato", () => {
    const content = fs.readFileSync(footerPath, "utf-8")
    expect(content).toContain("contato@papelariabibelo.com.br")
  })

  it("contém WhatsApp", () => {
    const content = fs.readFileSync(footerPath, "utf-8")
    expect(content).toContain("5547933862514")
  })

  it("contém link Instagram", () => {
    const content = fs.readFileSync(footerPath, "utf-8")
    expect(content).toContain("instagram.com/papelariabibelo")
  })
})

describe("Layout — componentes obrigatórios", () => {
  const layoutPath = path.resolve(
    __dirname,
    "../app/(main)/layout.tsx"
  )

  it("layout existe", () => {
    expect(fs.existsSync(layoutPath)).toBe(true)
  })

  it("layout inclui Header", () => {
    const content = fs.readFileSync(layoutPath, "utf-8")
    expect(content).toContain("Header")
  })

  it("layout inclui Footer", () => {
    const content = fs.readFileSync(layoutPath, "utf-8")
    expect(content).toContain("Footer")
  })

  it("layout inclui CartDrawer", () => {
    const content = fs.readFileSync(layoutPath, "utf-8")
    expect(content).toContain("CartDrawer")
  })

  it("layout inclui MobileNav", () => {
    const content = fs.readFileSync(layoutPath, "utf-8")
    expect(content).toContain("MobileNav")
  })
})
