import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock auth API
vi.mock("@/lib/medusa/auth", () => ({
  ensureCustomer: vi.fn().mockResolvedValue({
    id: "cust_123",
    email: "teste@papelariabibelo.com.br",
    first_name: "Maria",
    last_name: "Silva",
    phone: "47999999999",
    has_account: true,
  }),
}))

import { useAuthStore } from "@/store/auth"

describe("AuthStore", () => {
  beforeEach(() => {
    sessionStorage.clear()
    useAuthStore.setState({
      token: null,
      customer: null,
      loading: false,
    })
  })

  it("estado inicial sem autenticação", () => {
    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.customer).toBeNull()
    expect(state.loading).toBe(false)
  })

  it("setToken salva no sessionStorage", () => {
    useAuthStore.getState().setToken("jwt_test_token")
    expect(useAuthStore.getState().token).toBe("jwt_test_token")
    expect(sessionStorage.getItem("bibelo-auth-token")).toBe("jwt_test_token")
  })

  it("loadCustomer carrega dados do cliente", async () => {
    useAuthStore.getState().setToken("jwt_test_token")
    await useAuthStore.getState().loadCustomer()
    const state = useAuthStore.getState()
    expect(state.customer).not.toBeNull()
    expect(state.customer?.email).toBe("teste@papelariabibelo.com.br")
    expect(state.customer?.first_name).toBe("Maria")
    expect(state.loading).toBe(false)
  })

  it("loadCustomer não carrega sem token", async () => {
    await useAuthStore.getState().loadCustomer()
    expect(useAuthStore.getState().customer).toBeNull()
  })

  it("logout limpa sessão completa", () => {
    useAuthStore.getState().setToken("jwt_test_token")
    useAuthStore.setState({
      customer: {
        id: "cust_123",
        email: "teste@papelariabibelo.com.br",
        first_name: "Maria",
        last_name: "Silva",
        phone: null,
        has_account: true,
      },
    })

    useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.customer).toBeNull()
    expect(sessionStorage.getItem("bibelo-auth-token")).toBeNull()
  })
})
