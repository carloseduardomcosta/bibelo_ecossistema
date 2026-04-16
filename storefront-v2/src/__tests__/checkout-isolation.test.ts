import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

const CHECKOUT_LAYOUT = path.resolve(__dirname, "../app/(checkout)/layout.tsx")
const AUTH_LAYOUT = path.resolve(__dirname, "../app/(auth)/layout.tsx")
const MAIN_LAYOUT = path.resolve(__dirname, "../app/(main)/layout.tsx")

describe("Checkout layout — isolamento", () => {
  it("layout (checkout) existe", () => {
    expect(fs.existsSync(CHECKOUT_LAYOUT)).toBe(true)
  })

  it("layout (checkout) tem 'Compra segura'", () => {
    const content = fs.readFileSync(CHECKOUT_LAYOUT, "utf-8")
    expect(content).toContain("Compra segura")
  })

  it("layout (checkout) não inclui Header global", () => {
    const content = fs.readFileSync(CHECKOUT_LAYOUT, "utf-8")
    expect(content).not.toContain("import Header")
  })

  it("layout (checkout) não inclui Footer global", () => {
    const content = fs.readFileSync(CHECKOUT_LAYOUT, "utf-8")
    expect(content).not.toContain("import Footer")
  })

  it("layout (checkout) não inclui BottomNav/MobileNav", () => {
    const content = fs.readFileSync(CHECKOUT_LAYOUT, "utf-8")
    expect(content).not.toContain("MobileNav")
    expect(content).not.toContain("BottomNav")
  })

  it("layout (checkout) não inclui CartDrawer", () => {
    const content = fs.readFileSync(CHECKOUT_LAYOUT, "utf-8")
    expect(content).not.toContain("CartDrawer")
  })

  it("layout (checkout) não inclui DiscountPopup", () => {
    const content = fs.readFileSync(CHECKOUT_LAYOUT, "utf-8")
    expect(content).not.toContain("DiscountPopup")
  })

  it("layout (checkout) usa z-[500] para cobrir (main)", () => {
    const content = fs.readFileSync(CHECKOUT_LAYOUT, "utf-8")
    expect(content).toContain("z-[500]")
  })

  it("layout (checkout) tem logo Bibelô", () => {
    const content = fs.readFileSync(CHECKOUT_LAYOUT, "utf-8")
    expect(content).toContain("logo-bibelo.png")
  })

  it("layout (checkout) inclui CartInitializer", () => {
    const content = fs.readFileSync(CHECKOUT_LAYOUT, "utf-8")
    expect(content).toContain("CartInitializer")
  })
})

describe("Auth layout — isolamento", () => {
  it("layout (auth) existe", () => {
    expect(fs.existsSync(AUTH_LAYOUT)).toBe(true)
  })

  it("layout (auth) usa z-[500] para cobrir (main)", () => {
    const content = fs.readFileSync(AUTH_LAYOUT, "utf-8")
    expect(content).toContain("z-[500]")
  })

  it("layout (auth) não inclui Header global", () => {
    const content = fs.readFileSync(AUTH_LAYOUT, "utf-8")
    expect(content).not.toContain("import Header")
  })
})

describe("Main layout — componentes da loja", () => {
  it("layout (main) NÃO inclui checkout ou auth pages", () => {
    const content = fs.readFileSync(MAIN_LAYOUT, "utf-8")
    expect(content).not.toContain("CheckoutLayout")
  })
})

describe("Conta — rotas protegidas em (main)", () => {
  const protectedPages = [
    "conta/pedidos",
    "conta/enderecos",
    "conta/perfil",
  ]

  for (const page of protectedPages) {
    it(`${page} usa useRequireAuth`, () => {
      const pagePath = path.resolve(__dirname, `../app/(main)/${page}/page.tsx`)
      const content = fs.readFileSync(pagePath, "utf-8")
      expect(content).toContain("useRequireAuth")
    })
  }
})
