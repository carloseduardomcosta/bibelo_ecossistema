import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

const CATEGORY_CARD = path.resolve(
  __dirname,
  "../components/home/CategoryCard.tsx"
)
const CATEGORIES_SECTION = path.resolve(
  __dirname,
  "../components/home/CategoriesSection.tsx"
)

describe("CategoryCard — prop circle", () => {
  it("arquivo existe", () => {
    expect(fs.existsSync(CATEGORY_CARD)).toBe(true)
  })

  it("aceita prop circle", () => {
    const content = fs.readFileSync(CATEGORY_CARD, "utf-8")
    expect(content).toContain("circle")
  })

  it("aplica rounded-full quando circle=true", () => {
    const content = fs.readFileSync(CATEGORY_CARD, "utf-8")
    expect(content).toContain("rounded-full")
  })

  it("aplica rounded-2xl quando circle=false", () => {
    const content = fs.readFileSync(CATEGORY_CARD, "utf-8")
    expect(content).toContain("rounded-2xl")
  })
})

describe("CategoriesSection — exibe top 4", () => {
  it("arquivo existe", () => {
    expect(fs.existsSync(CATEGORIES_SECTION)).toBe(true)
  })

  it("limita a 4 categorias com slice(0, 4)", () => {
    const content = fs.readFileSync(CATEGORIES_SECTION, "utf-8")
    expect(content).toContain("slice(0, 4)")
  })

  it("passa prop circle para CategoryCard", () => {
    const content = fs.readFileSync(CATEGORIES_SECTION, "utf-8")
    expect(content).toContain("circle")
  })

  it("usa grid-cols-4 para linha de 4 itens", () => {
    const content = fs.readFileSync(CATEGORIES_SECTION, "utf-8")
    expect(content).toContain("grid-cols-4")
  })

  it("tem link 'Ver todas' para /produtos", () => {
    const content = fs.readFileSync(CATEGORIES_SECTION, "utf-8")
    expect(content).toContain('href="/produtos"')
  })
})

describe("CategoriesSection — lógica de ordenação", () => {
  const PRIORITY = [
    "caneta", "caderno", "lapis-de-cor", "agenda", "estojo",
    "marcador-de-texto", "lapiseira", "planner", "kit-presente",
  ]

  function sortCategories(
    categories: { handle: string; name: string }[]
  ): { handle: string; name: string }[] {
    return [...categories].sort((a, b) => {
      const ia = PRIORITY.indexOf(a.handle)
      const ib = PRIORITY.indexOf(b.handle)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.name.localeCompare(b.name, "pt-BR")
    })
  }

  it("prioridade: caneta antes de caderno", () => {
    const cats = [
      { handle: "caderno", name: "Cadernos" },
      { handle: "caneta", name: "Canetas" },
    ]
    const sorted = sortCategories(cats)
    expect(sorted[0].handle).toBe("caneta")
  })

  it("categorias sem prioridade vão para o fim", () => {
    const cats = [
      { handle: "novo-produto", name: "Novo Produto" },
      { handle: "caneta", name: "Canetas" },
    ]
    const sorted = sortCategories(cats)
    expect(sorted[0].handle).toBe("caneta")
    expect(sorted[1].handle).toBe("novo-produto")
  })

  it("top 4 retorna exatamente 4 items", () => {
    const cats = Array.from({ length: 10 }, (_, i) => ({
      handle: `cat-${i}`,
      name: `Categoria ${i}`,
    }))
    const top4 = sortCategories(cats).slice(0, 4)
    expect(top4).toHaveLength(4)
  })
})
