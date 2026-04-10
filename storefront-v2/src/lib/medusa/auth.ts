import medusa from "./client"

// URL pública do Medusa (acessível pelo browser via Nginx)
const PUBLIC_MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLIC_URL || "https://homolog.papelariabibelo.com.br/api"

const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

// ── Login com email/senha ─────────────────────────────────────
export async function loginWithEmail(email: string, password: string) {
  const res = await fetch(`${PUBLIC_MEDUSA_URL}/auth/customer/emailpass`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || "Email ou senha incorretos")
  }

  return res.json()
}

// ── Registrar com email/senha ─────────────────────────────────
export async function registerWithEmail(email: string, password: string) {
  const res = await fetch(`${PUBLIC_MEDUSA_URL}/auth/customer/emailpass/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || "Erro ao criar conta")
  }

  return res.json()
}

// ── Google OAuth — busca URL de redirect e redireciona ────────
export async function startGoogleLogin() {
  const res = await fetch(`${PUBLIC_MEDUSA_URL}/auth/customer/google`, {
    credentials: "include",
    headers: {
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
  })
  const data = await res.json()
  if (data.location) {
    window.location.href = data.location
  } else {
    throw new Error("Erro ao conectar com Google")
  }
}

// ── Buscar dados do cliente logado ────────────────────────────
export async function getCustomer(token: string) {
  const res = await fetch(`${PUBLIC_MEDUSA_URL}/store/customers/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
  })

  if (!res.ok) return null
  const data = await res.json()
  return data.customer
}

// ── Criar perfil do cliente (após Google OAuth) ───────────────
// No Medusa v2, Google OAuth cria auth_identity mas não o customer.
// Precisamos criar o customer associado ao auth_identity.
export async function createCustomer(
  token: string,
  data: { first_name: string; last_name: string; email: string }
) {
  const res = await fetch(`${PUBLIC_MEDUSA_URL}/store/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || "Erro ao criar perfil")
  }

  return res.json()
}

// ── Garantir que o customer existe (cria se necessário) ───────
export async function ensureCustomer(token: string): Promise<Record<string, unknown> | null> {
  // Tenta buscar o customer existente
  let customer = await getCustomer(token)
  if (customer) return customer

  // Customer não existe — decodificar JWT para pegar metadata do Google
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    const meta = payload.user_metadata || {}

    // Criar customer com dados do Google
    const result = await createCustomer(token, {
      first_name: meta.given_name || meta.name?.split(" ")[0] || "Cliente",
      last_name: meta.family_name || meta.name?.split(" ").slice(1).join(" ") || "",
      email: meta.email || "",
    })

    return result.customer || null
  } catch (err) {
    console.warn("[Auth] Erro ao criar customer:", err instanceof Error ? err.message : err)
    return null
  }
}

// ── Buscar pedidos do cliente ──────────────────────────────────
export async function getOrders(token: string) {
  const res = await fetch(`${PUBLIC_MEDUSA_URL}/store/orders`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.orders || []
}

// ── Buscar endereços do cliente ───────────────────────────────
export async function getAddresses(token: string) {
  const res = await fetch(`${PUBLIC_MEDUSA_URL}/store/customers/me/addresses`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.addresses || []
}

// ── Adicionar endereço ────────────────────────────────────────
export async function addAddress(token: string, address: {
  first_name: string; last_name: string; address_1: string;
  city: string; province: string; postal_code: string; country_code: string;
  phone?: string; company?: string; address_2?: string;
}) {
  const res = await fetch(`${PUBLIC_MEDUSA_URL}/store/customers/me/addresses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
    body: JSON.stringify(address),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || "Erro ao salvar endereço")
  }
  return res.json()
}

// ── Deletar endereço ──────────────────────────────────────────
export async function deleteAddress(token: string, addressId: string) {
  const res = await fetch(`${PUBLIC_MEDUSA_URL}/store/customers/me/addresses/${addressId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
  })
  if (!res.ok) throw new Error("Erro ao remover endereço")
}

// ── Decodificar metadata do Google do token ───────────────────
export function getTokenMetadata(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    return payload.user_metadata || {}
  } catch { return {} }
}

// ── Logout ────────────────────────────────────────────────────
export function logout() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("bibelo-auth-token")
    window.location.href = "/"
  }
}

// ── Atualizar dados do cliente logado ────────────────────────
export async function updateCustomer(token: string, data: {
  first_name?: string
  last_name?: string
  phone?: string
}) {
  const res = await fetch(`${PUBLIC_MEDUSA_URL}/store/customers/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || "Erro ao atualizar perfil")
  }
  return res.json()
}

// ── Solicitar email de recuperação de senha ───────────────────
export async function requestPasswordReset(email: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://homolog.papelariabibelo.com.br"
  const res = await fetch(`${PUBLIC_MEDUSA_URL}/auth/customer/emailpass/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ email, redirect_url: `${siteUrl}/conta/nova-senha` }),
  })
  // Medusa retorna 200 mesmo para emails inexistentes (segurança)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || "Erro ao solicitar recuperação")
  }
  return true
}

// ── Atualizar senha (token de reset ou sessão ativa) ──────────
export async function updatePassword(token: string, password: string) {
  const res = await fetch(`${PUBLIC_MEDUSA_URL}/auth/customer/emailpass/update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || "Erro ao alterar senha")
  }
  return true
}
