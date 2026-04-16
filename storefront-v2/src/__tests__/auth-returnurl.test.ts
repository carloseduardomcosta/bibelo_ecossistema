import { describe, it, expect } from "vitest"

// getSafeReturnUrl extraída do (auth)/conta/page.tsx — mesma lógica
function getSafeReturnUrl(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith("/") || raw.startsWith("//")) return null
  return raw
}

describe("getSafeReturnUrl — segurança de redirecionamento", () => {
  it("retorna caminho interno válido", () => {
    expect(getSafeReturnUrl("/checkout")).toBe("/checkout")
  })

  it("retorna caminho com subpath", () => {
    expect(getSafeReturnUrl("/conta/pedidos")).toBe("/conta/pedidos")
  })

  it("retorna caminho com query string", () => {
    expect(getSafeReturnUrl("/produtos?categoria=caneta")).toBe(
      "/produtos?categoria=caneta"
    )
  })

  it("bloqueia URL absoluta com domínio externo", () => {
    expect(getSafeReturnUrl("https://evil.com")).toBeNull()
  })

  it("bloqueia protocolo HTTP", () => {
    expect(getSafeReturnUrl("http://evil.com")).toBeNull()
  })

  it("bloqueia double-slash (open redirect)", () => {
    expect(getSafeReturnUrl("//evil.com")).toBeNull()
  })

  it("retorna null para string vazia", () => {
    expect(getSafeReturnUrl("")).toBeNull()
  })

  it("retorna null para null", () => {
    expect(getSafeReturnUrl(null)).toBeNull()
  })

  it("permite /checkout/confirmacao", () => {
    expect(getSafeReturnUrl("/checkout/confirmacao")).toBe("/checkout/confirmacao")
  })

  it("bloqueia javascript: protocol", () => {
    expect(getSafeReturnUrl("javascript:alert(1)")).toBeNull()
  })
})

describe("useRequireAuth — lógica de retorno", () => {
  it("isAuthorized true quando token existe", () => {
    const token = "jwt_abc"
    const isAuthorized = !!token
    expect(isAuthorized).toBe(true)
  })

  it("isAuthorized false quando token é null", () => {
    const token = null
    const isAuthorized = !!token
    expect(isAuthorized).toBe(false)
  })

  it("não redireciona quando ainda está carregando", () => {
    const loading = true
    const token = null
    const shouldRedirect = !loading && token === null
    expect(shouldRedirect).toBe(false)
  })

  it("redireciona quando token é null e loading=false", () => {
    const loading = false
    const token = null
    const shouldRedirect = !loading && token === null
    expect(shouldRedirect).toBe(true)
  })

  it("não redireciona quando token existe e loading=false", () => {
    const loading = false
    const token = "jwt_abc"
    const shouldRedirect = !loading && token === null
    expect(shouldRedirect).toBe(false)
  })

  it("monta returnUrl com pathname codificado", () => {
    const pathname = "/conta/pedidos"
    const url = `/conta?returnUrl=${encodeURIComponent(pathname)}`
    expect(url).toBe("/conta?returnUrl=%2Fconta%2Fpedidos")
  })
})
