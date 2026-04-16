"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/store/auth"
import { updateCustomer, updatePassword, getTokenMetadata } from "@/lib/medusa/auth"
import { useRequireAuth } from "@/hooks/useRequireAuth"

export default function PerfilPage() {
  const router = useRouter()
  const { token, customer, loading: authLoading, loadCustomer } = useAuthStore()
  const { isAuthorized } = useRequireAuth()

  const [firstName, setFirstName] = useState(customer?.first_name || "")
  const [lastName, setLastName] = useState(customer?.last_name || "")
  const [phone, setPhone] = useState(customer?.phone || "")

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [profileError, setProfileError] = useState("")
  const [passwordError, setPasswordError] = useState("")

  if (authLoading || !isAuthorized || !customer) {
    return (
      <div className="content-container py-16 text-center">
        <div className="w-8 h-8 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500 mt-4">Carregando...</p>
      </div>
    )
  }

  // Detecta usuário Google: JWT user_metadata tem given_name para OAuth
  const isGoogleUser = !!getTokenMetadata(token!).given_name

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSavingProfile(true)
    setProfileError("")
    setProfileSuccess(false)
    try {
      await updateCustomer(token, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || undefined,
      })
      await loadCustomer()
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (newPassword !== confirmPassword) {
      setPasswordError("As senhas não coincidem")
      return
    }
    if (newPassword.length < 8) {
      setPasswordError("A senha deve ter pelo menos 8 caracteres")
      return
    }
    setSavingPassword(true)
    setPasswordError("")
    setPasswordSuccess(false)
    try {
      await updatePassword(token, newPassword)
      setNewPassword("")
      setConfirmPassword("")
      setPasswordSuccess(true)
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Erro ao alterar senha")
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="content-container py-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/conta" className="p-2 rounded-full hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-bibelo-dark">Meu Perfil</h1>
      </div>

      {/* Dados pessoais */}
      <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
        <h2 className="font-semibold text-bibelo-dark mb-4">Dados pessoais</h2>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nome</label>
              <input
                className="input-base"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Nome"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Sobrenome</label>
              <input
                className="input-base"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Sobrenome"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">E-mail</label>
            <input
              className="input-base bg-gray-50 cursor-not-allowed"
              value={customer.email}
              disabled
              readOnly
            />
            <p className="text-xs text-gray-400 mt-1">O e-mail não pode ser alterado</p>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Telefone</label>
            <input
              className="input-base"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(47) 9 9999-9999"
              type="tel"
            />
          </div>
        </div>

        {profileError && (
          <p className="text-sm text-red-500 mt-3">{profileError}</p>
        )}
        {profileSuccess && (
          <p className="text-sm text-green-600 mt-3">Perfil atualizado com sucesso!</p>
        )}

        <button
          type="submit"
          disabled={savingProfile}
          className="btn-primary w-full mt-4 py-2.5 text-sm disabled:opacity-50"
        >
          {savingProfile ? "Salvando..." : "Salvar dados"}
        </button>
      </form>

      {/* Alterar senha — apenas para usuários email/senha */}
      {!isGoogleUser && (
        <form onSubmit={handleSavePassword} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-bibelo-dark mb-4">Alterar senha</h2>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nova senha</label>
              <input
                type="password"
                className="input-base"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Confirmar nova senha</label>
              <input
                type="password"
                className="input-base"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                minLength={8}
                required
              />
            </div>
          </div>

          {passwordError && (
            <p className="text-sm text-red-500 mt-3">{passwordError}</p>
          )}
          {passwordSuccess && (
            <p className="text-sm text-green-600 mt-3">Senha alterada com sucesso!</p>
          )}

          <button
            type="submit"
            disabled={savingPassword}
            className="btn-primary w-full mt-4 py-2.5 text-sm disabled:opacity-50"
          >
            {savingPassword ? "Alterando..." : "Alterar senha"}
          </button>
        </form>
      )}

      {isGoogleUser && (
        <div className="bg-blue-50 rounded-2xl p-4 text-sm text-blue-700">
          <p className="font-medium mb-1">Conta Google</p>
          <p className="text-blue-600 text-xs">
            Sua senha é gerenciada pelo Google. Para alterá-la, acesse as configurações da sua conta Google.
          </p>
        </div>
      )}
    </div>
  )
}
