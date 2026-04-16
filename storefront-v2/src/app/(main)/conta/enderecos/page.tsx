"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/store/auth"
import { getAddresses, addAddress, deleteAddress, updateAddress } from "@/lib/medusa/auth"
import { useRequireAuth } from "@/hooks/useRequireAuth"

interface Address {
  id: string
  first_name: string
  last_name: string
  address_1: string
  address_2?: string
  city: string
  province: string
  postal_code: string
  phone?: string
}

const EMPTY_FORM = {
  first_name: "", last_name: "",
  postal_code: "",
  logradouro: "",   // → address_1 prefix (auto-preenchido pelo ViaCEP)
  numero: "",       // → address_1 suffix (manual)
  bairro: "",       // → sufixo de address_2 (auto-preenchido pelo ViaCEP)
  address_2: "",    // complemento (manual, nunca sobrescrito pelo ViaCEP)
  city: "", province: "", phone: "",
}

type FormState = typeof EMPTY_FORM

// Monta o payload final para o Medusa a partir do form
function buildPayload(f: FormState) {
  const address_1 = [f.logradouro.trim(), f.numero.trim()].filter(Boolean).join(", ")
  // Complemento + bairro combinados. openEdit() repopula address_2 com o valor salvo,
  // então na edição o cliente vê e ajusta manualmente se precisar.
  const parts = [f.address_2.trim(), f.bairro.trim()].filter(Boolean)
  const address_2 = parts.length > 0 ? parts.join(" — ") : undefined
  return {
    first_name:   f.first_name,
    last_name:    f.last_name,
    address_1,
    address_2,
    city:         f.city,
    province:     f.province,
    postal_code:  f.postal_code,
    country_code: "br",
    phone:        f.phone || undefined,
  }
}

export default function EnderecosPage() {
  const router = useRouter()
  const { token, loading: authLoading } = useAuthStore()
  const { isAuthorized } = useRequireAuth()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Formulário de novo endereço
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // Edição inline
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)

  // CEP auto-complete state
  const [cepLoading, setCepLoading] = useState<"add" | "edit" | null>(null)
  const [cepError, setCepError] = useState<"add" | "edit" | null>(null)

  const loadAddresses = async () => {
    if (!token) return
    setLoading(true)
    const data = await getAddresses(token)
    setAddresses(data)
    setLoading(false)
  }

  useEffect(() => {
    if (!isAuthorized) return
    if (token) loadAddresses()
  }, [token, authLoading, router])

  // Busca CEP na ViaCEP (só quando 8 dígitos limpos)
  async function handleCepChange(
    raw: string,
    setF: React.Dispatch<React.SetStateAction<FormState>>,
    ctx: "add" | "edit"
  ) {
    setF((prev) => ({ ...prev, postal_code: raw }))
    const clean = raw.replace(/\D/g, "")
    if (clean.length !== 8) { setCepError(null); return }

    setCepLoading(ctx)
    setCepError(null)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      const data = await res.json()
      if (data.erro) {
        setCepError(ctx)
      } else {
        setF((prev) => ({
          ...prev,
          logradouro: data.logradouro || prev.logradouro,
          bairro:     data.bairro     || prev.bairro,
          city:       data.localidade || prev.city,
          province:   data.uf         || prev.province,
          // numero e address_2 (complemento) NUNCA alterados
        }))
      }
    } catch {
      setCepError(ctx)
    } finally {
      setCepLoading(null)
    }
  }

  function openEdit(addr: Address) {
    setEditingId(addr.id)
    setEditForm({
      first_name:  addr.first_name  || "",
      last_name:   addr.last_name   || "",
      postal_code: addr.postal_code || "",
      logradouro:  addr.address_1   || "",   // address_1 completo — cliente ajusta se quiser
      numero:      "",
      bairro:      "",
      address_2:   addr.address_2   || "",   // valor completo "Complemento — Bairro"
      city:        addr.city        || "",
      province:    addr.province    || "",
      phone:       addr.phone       || "",
    })
    setCepError(null)
    setShowForm(false) // fecha o form de adicionar se estiver aberto
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setError("")
    setSaving(true)
    try {
      await addAddress(token, buildPayload(form))
      setShowForm(false)
      setForm(EMPTY_FORM)
      await loadAddresses()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !editingId) return
    setError("")
    setSaving(true)
    try {
      await updateAddress(token, editingId, buildPayload(editForm))
      setEditingId(null)
      await loadAddresses()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!token || !confirm("Remover este endereço?")) return
    try {
      await deleteAddress(token, id)
      if (editingId === id) setEditingId(null)
      await loadAddresses()
    } catch {
      setError("Erro ao remover endereço")
    }
  }

  if (authLoading || loading) {
    return (
      <div className="content-container py-16 text-center">
        <div className="w-8 h-8 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500 mt-4">Carregando endereços...</p>
      </div>
    )
  }

  return (
    <div className="content-container py-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/conta" className="p-2 rounded-full hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-bibelo-dark">Meus Endereços</h1>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null) }}
            className="btn-primary text-xs px-4 py-2"
          >
            + Novo
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4">{error}</div>
      )}

      {/* Formulário — novo endereço */}
      {showForm && (
        <AddressForm
          title="Novo endereço"
          form={form}
          setForm={setForm}
          onSubmit={handleAdd}
          onCancel={() => { setShowForm(false); setForm(EMPTY_FORM); setCepError(null) }}
          saving={saving}
          submitLabel="Salvar endereço"
          cepLoading={cepLoading === "add"}
          cepError={cepError === "add"}
          onCepChange={(v) => handleCepChange(v, setForm, "add")}
        />
      )}

      {/* Lista de endereços */}
      {addresses.length === 0 && !showForm ? (
        <div className="text-center py-12 bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="w-16 h-16 bg-bibelo-pink/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
          </div>
          <h2 className="font-semibold text-gray-700 mb-2">Nenhum endereço salvo</h2>
          <p className="text-sm text-gray-500 mb-4">Adicione um endereço para agilizar suas compras</p>
          <button onClick={() => setShowForm(true)} className="btn-primary inline-block text-sm">
            Adicionar endereço
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <div key={addr.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-sm text-bibelo-dark">
                    {addr.first_name} {addr.last_name}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {addr.address_1}{addr.address_2 ? `, ${addr.address_2}` : ""}
                  </p>
                  <p className="text-sm text-gray-500">
                    {addr.city}/{addr.province} — CEP {addr.postal_code}
                  </p>
                  {addr.phone && <p className="text-xs text-gray-400 mt-1">{addr.phone}</p>}
                </div>
                <div className="flex gap-1">
                  {/* Editar */}
                  <button
                    onClick={() => editingId === addr.id ? setEditingId(null) : openEdit(addr)}
                    className="p-1.5 text-gray-400 hover:text-bibelo-pink hover:bg-bibelo-pink/5 rounded-lg transition-colors"
                    aria-label="Editar endereço"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                  </button>
                  {/* Remover */}
                  <button
                    onClick={() => handleDelete(addr.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    aria-label="Remover endereço"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Formulário de edição inline */}
              {editingId === addr.id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <AddressForm
                    title="Editar endereço"
                    form={editForm}
                    setForm={setEditForm}
                    onSubmit={handleUpdate}
                    onCancel={() => { setEditingId(null); setCepError(null) }}
                    saving={saving}
                    submitLabel="Salvar alterações"
                    cepLoading={cepLoading === "edit"}
                    cepError={cepError === "edit"}
                    onCepChange={(v) => handleCepChange(v, setEditForm, "edit")}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Componente de formulário reutilizável (add + edit) ────────
interface AddressFormProps {
  title: string
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  saving: boolean
  submitLabel: string
  cepLoading: boolean
  cepError: boolean
  onCepChange: (value: string) => void
}

function AddressForm({
  title, form, setForm, onSubmit, onCancel, saving, submitLabel,
  cepLoading, cepError, onCepChange,
}: AddressFormProps) {
  const f = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h3 className="font-semibold text-sm text-bibelo-dark">{title}</h3>

      <div className="grid grid-cols-2 gap-3">
        <input className="input-base" placeholder="Nome" required value={form.first_name} onChange={f("first_name")} />
        <input className="input-base" placeholder="Sobrenome" required value={form.last_name} onChange={f("last_name")} />
      </div>

      {/* CEP com loading indicator */}
      <div className="relative">
        <input
          className="input-base pr-8"
          placeholder="CEP (somente números)"
          required
          value={form.postal_code}
          onChange={(e) => onCepChange(e.target.value)}
          maxLength={9}
        />
        {cepLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {cepError && (
          <p className="text-xs text-red-500 mt-1">CEP não encontrado. Verifique e tente novamente.</p>
        )}
      </div>

      {/* Logradouro + Número */}
      <div className="grid grid-cols-3 gap-3">
        <input
          className="input-base col-span-2"
          placeholder="Rua / Avenida"
          required
          value={form.logradouro}
          onChange={f("logradouro")}
        />
        <input
          className="input-base"
          placeholder="Nº"
          value={form.numero}
          onChange={f("numero")}
        />
      </div>

      {/* Bairro */}
      <input className="input-base" placeholder="Bairro" value={form.bairro} onChange={f("bairro")} />

      {/* Complemento — nunca auto-preenchido */}
      <input className="input-base" placeholder="Complemento (opcional — Apto, Bloco...)" value={form.address_2} onChange={f("address_2")} />

      <div className="grid grid-cols-2 gap-3">
        <input className="input-base" placeholder="Cidade" required value={form.city} onChange={f("city")} />
        <input
          className="input-base"
          placeholder="Estado (ex: SC)"
          required
          maxLength={2}
          value={form.province}
          onChange={(e) => setForm((prev) => ({ ...prev, province: e.target.value.toUpperCase() }))}
        />
      </div>

      <input className="input-base" placeholder="Telefone (opcional)" type="tel" value={form.phone} onChange={f("phone")} />

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className="btn-primary text-sm flex-1 py-2.5 disabled:opacity-50">
          {saving ? "Salvando..." : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm px-4 py-2.5">
          Cancelar
        </button>
      </div>
    </form>
  )
}
