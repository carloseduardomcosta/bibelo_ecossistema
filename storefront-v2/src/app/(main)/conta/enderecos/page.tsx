"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/store/auth"
import { getAddresses, addAddress, deleteAddress } from "@/lib/medusa/auth"

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
  company?: string
}

export default function EnderecosPage() {
  const router = useRouter()
  const { token, customer, loading: authLoading } = useAuthStore()
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Form fields
  const [form, setForm] = useState({
    first_name: "", last_name: "", address_1: "", address_2: "",
    city: "", province: "", postal_code: "", phone: "",
  })

  const loadAddresses = async () => {
    if (!token) return
    setLoading(true)
    const data = await getAddresses(token)
    setAddresses(data)
    setLoading(false)
  }

  useEffect(() => {
    if (!authLoading && !token) { router.replace("/conta"); return }
    if (token) loadAddresses()
  }, [token, authLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setError("")
    setSaving(true)

    try {
      await addAddress(token, {
        ...form,
        country_code: "br",
      })
      setShowForm(false)
      setForm({ first_name: "", last_name: "", address_1: "", address_2: "", city: "", province: "", postal_code: "", phone: "" })
      await loadAddresses()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!token || !confirm("Remover este endereço?")) return
    try {
      await deleteAddress(token, id)
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
          <button onClick={() => setShowForm(true)} className="btn-primary text-xs px-4 py-2">
            + Novo
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4">{error}</div>
      )}

      {/* Formulário novo endereço */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 space-y-3">
          <h2 className="font-semibold text-bibelo-dark mb-2">Novo endereço</h2>
          <div className="grid grid-cols-2 gap-3">
            <input className="input-base" placeholder="Nome" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <input className="input-base" placeholder="Sobrenome" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <input className="input-base" placeholder="CEP" required pattern="\d{5}-?\d{3}" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
          <input className="input-base" placeholder="Endereço (rua, número)" required value={form.address_1} onChange={(e) => setForm({ ...form, address_1: e.target.value })} />
          <input className="input-base" placeholder="Complemento (opcional)" value={form.address_2} onChange={(e) => setForm({ ...form, address_2: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input-base" placeholder="Cidade" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <input className="input-base" placeholder="Estado (ex: SC)" required maxLength={2} value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value.toUpperCase() })} />
          </div>
          <input className="input-base" placeholder="Telefone (opcional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="btn-primary text-sm flex-1 py-2.5 disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar endereço"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm px-4 py-2.5">
              Cancelar
            </button>
          </div>
        </form>
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
          ))}
        </div>
      )}
    </div>
  )
}
