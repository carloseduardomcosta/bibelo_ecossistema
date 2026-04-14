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

const AUTH_KEY = "bibelo-auth-token"

function loadStoredToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    const token = localStorage.getItem(AUTH_KEY)
    if (!token) return null
    // Verificar expiração do JWT antes de restaurar
    const payload = JSON.parse(atob(token.split(".")[1]))
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem(AUTH_KEY)
      return null
    }
    return token
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // localStorage: persiste entre abas e sessões. Expiração verificada no load.
  token: loadStoredToken(),
  customer: null,
  loading: false,

  setToken: (token: string) => {
    localStorage.setItem(AUTH_KEY, token)
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
        localStorage.removeItem(AUTH_KEY)
        set({ token: null, customer: null, loading: false })
      }
    } catch {
      set({ loading: false })
    }
  },

  logout: () => {
    localStorage.removeItem(AUTH_KEY)
    set({ token: null, customer: null })
  },
}))
