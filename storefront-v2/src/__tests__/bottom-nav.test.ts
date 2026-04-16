import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

const BOTTOM_NAV = path.resolve(
  __dirname,
  "../components/layout/BottomNav.tsx"
)

describe("BottomNav — link /produtos", () => {
  it("arquivo existe", () => {
    expect(fs.existsSync(BOTTOM_NAV)).toBe(true)
  })

  it("contém link para /produtos", () => {
    const content = fs.readFileSync(BOTTOM_NAV, "utf-8")
    expect(content).toContain('href="/produtos"')
  })

  it("exibe label 'Produtos'", () => {
    const content = fs.readFileSync(BOTTOM_NAV, "utf-8")
    expect(content).toContain("Produtos")
  })

  it("não tem link para /busca", () => {
    const content = fs.readFileSync(BOTTOM_NAV, "utf-8")
    expect(content).not.toContain('href="/busca"')
  })

  it("tem link para /", () => {
    const content = fs.readFileSync(BOTTOM_NAV, "utf-8")
    expect(content).toContain('href="/"')
  })

  it("tem botão de carrinho (abre drawer)", () => {
    const content = fs.readFileSync(BOTTOM_NAV, "utf-8")
    expect(content).toContain("openCart")
    expect(content).toContain("Carrinho")
  })

  it("tem link para /conta", () => {
    const content = fs.readFileSync(BOTTOM_NAV, "utf-8")
    expect(content).toContain('href="/conta"')
  })
})
