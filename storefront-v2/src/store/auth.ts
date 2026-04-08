import { create } from "zustand"
import { ensureCustomer } from "@/lib/medusa/auth"

interface Customer {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  has_account: boolean
  metadata?: Record<string, unknown>
}

interface AuthState {
  token: string | null
  customer: Customer | null
  loading: boolean
  setToken: (token: string) => void
  loadCustomer: () => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // sessionStorage: token não persiste entre abas (mitigação XSS)
  token: typeof window !== "undefined" ? sessionStorage.getItem("bibelo-auth-token") : null,
  customer: null,
  loading: false,

  setToken: (token: string) => {
    sessionStorage.setItem("bibelo-auth-token", token)
    set({ token })
  },

  loadCustomer: async () => {
    const token = get().token
    if (!token) return

    set({ loading: true })
    try {
      const customer = await ensureCustomer(token)
      if (customer) {
        set({ customer: customer as unknown as Customer, loading: false })
      } else {
        // Token inválido ou expirado
        sessionStorage.removeItem("bibelo-auth-token")
        set({ token: null, customer: null, loading: false })
      }
    } catch {
      set({ loading: false })
    }
  },

  logout: () => {
    sessionStorage.removeItem("bibelo-auth-token")
    set({ token: null, customer: null })
  },
}))
