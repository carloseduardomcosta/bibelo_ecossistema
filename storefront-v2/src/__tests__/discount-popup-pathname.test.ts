import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

// Lógica de exclusão de pathname extraída do DiscountPopup
function shouldShowPopup(
  popupAtivo: boolean,
  pathname: string,
  hasCookie: boolean
): boolean {
  return (
    popupAtivo &&
    !pathname.startsWith("/conta") &&
    !pathname.startsWith("/checkout") &&
    !hasCookie
  )
}

describe("DiscountPopup — exclusão de pathname", () => {
  it("mostra popup na homepage", () => {
    expect(shouldShowPopup(true, "/", false)).toBe(true)
  })

  it("mostra popup em /produtos", () => {
    expect(shouldShowPopup(true, "/produtos", false)).toBe(true)
  })

  it("mostra popup em /produto/[handle]", () => {
    expect(shouldShowPopup(true, "/produto/caneta-bazze", false)).toBe(true)
  })

  it("NÃO mostra popup em /conta", () => {
    expect(shouldShowPopup(true, "/conta", false)).toBe(false)
  })

  it("NÃO mostra popup em /conta/pedidos", () => {
    expect(shouldShowPopup(true, "/conta/pedidos", false)).toBe(false)
  })

  it("NÃO mostra popup em /conta/enderecos", () => {
    expect(shouldShowPopup(true, "/conta/enderecos", false)).toBe(false)
  })

  it("NÃO mostra popup em /checkout", () => {
    expect(shouldShowPopup(true, "/checkout", false)).toBe(false)
  })

  it("NÃO mostra popup em /checkout/confirmacao", () => {
    expect(shouldShowPopup(true, "/checkout/confirmacao", false)).toBe(false)
  })

  it("não mostra quando popup_ativo = false", () => {
    expect(shouldShowPopup(false, "/", false)).toBe(false)
  })

  it("não mostra quando já existe cookie", () => {
    expect(shouldShowPopup(true, "/", true)).toBe(false)
  })
})

describe("DiscountPopup — código-fonte", () => {
  const POPUP_FILE = path.resolve(
    __dirname,
    "../components/home/DiscountPopup.tsx"
  )

  it("guarda pathname da rota atual", () => {
    const content = fs.readFileSync(POPUP_FILE, "utf-8")
    expect(content).toContain("usePathname")
  })

  it("exclui /conta do timer automático", () => {
    const content = fs.readFileSync(POPUP_FILE, "utf-8")
    expect(content).toContain('pathname.startsWith("/conta")')
  })

  it("exclui /checkout do timer automático", () => {
    const content = fs.readFileSync(POPUP_FILE, "utf-8")
    expect(content).toContain('pathname.startsWith("/checkout")')
  })
})
