import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useToast } from '../components/Toast'
import { Store, CreditCard, Truck, ShoppingCart, Megaphone, Settings, Save, Loader2 } from 'lucide-react'

// ── Toggle inline ──

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-bibelo-primary' : 'bg-gray-300'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

// ── Tipos ──

interface Setting {
  categoria: string
  chave: string
  valor: string
  tipo: 'text' | 'number' | 'boolean' | 'json' | 'currency'
  label: string
  descricao: string
  ordem: number
}

type TabKey = 'pagamento' | 'frete' | 'checkout' | 'marketing' | 'geral'

interface TabConfig {
  key: TabKey
  label: string
  icon: typeof CreditCard
  descricao: string
}

const TABS: TabConfig[] = [
  { key: 'pagamento', label: 'Pagamento', icon: CreditCard, descricao: 'Configure os meios de pagamento aceitos, descontos e parcelamento' },
  { key: 'frete', label: 'Frete', icon: Truck, descricao: 'Configure as opções de frete, retirada na loja e frete grátis' },
  { key: 'checkout', label: 'Checkout', icon: ShoppingCart, descricao: 'Personalize a experiência de compra dos seus clientes' },
  { key: 'marketing', label: 'Marketing', icon: Megaphone, descricao: 'Configure popup, cupons e banners da loja' },
  { key: 'geral', label: 'Geral', icon: Settings, descricao: 'Dados da loja, contato e redes sociais' },
]

export default function LojaOnline() {
  const { success: showSuccess, error: showError } = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>('pagamento')
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Valores editados localmente (categoria:chave → valor)
  const [edited, setEdited] = useState<Record<string, string>>({})

  // ── Fetch ──

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/store-settings/all')
      // A API retorna agrupado — flatten
      const flat: Setting[] = []
      if (Array.isArray(data)) {
        flat.push(...data)
      } else if (data && typeof data === 'object') {
        for (const cat of Object.values(data)) {
          if (Array.isArray(cat)) {
            flat.push(...cat)
          }
        }
      }
      flat.sort((a, b) => a.ordem - b.ordem)
      setSettings(flat)
    } catch {
      setError('Erro ao carregar configurações da loja')
      showError('Erro ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }

  // ── Helpers ──

  function settingsKey(s: Setting) {
    return `${s.categoria}:${s.chave}`
  }

  function currentValue(s: Setting): string {
    const key = settingsKey(s)
    return key in edited ? edited[key] : s.valor
  }

  function handleChange(s: Setting, valor: string) {
    setEdited(prev => ({ ...prev, [settingsKey(s)]: valor }))
  }

  function tabSettings(tab: TabKey): Setting[] {
    return settings.filter(s => s.categoria === tab)
  }

  function tabHasChanges(tab: TabKey): boolean {
    return tabSettings(tab).some(s => settingsKey(s) in edited && edited[settingsKey(s)] !== s.valor)
  }

  function changedSettingsForTab(tab: TabKey): { categoria: string; chave: string; valor: string }[] {
    return tabSettings(tab)
      .filter(s => {
        const key = settingsKey(s)
        return key in edited && edited[key] !== s.valor
      })
      .map(s => ({
        categoria: s.categoria,
        chave: s.chave,
        valor: edited[settingsKey(s)],
      }))
  }

  // ── Save ──

  async function handleSave() {
    const changed = changedSettingsForTab(activeTab)
    if (changed.length === 0) return

    setSaving(true)
    try {
      await api.put('/store-settings', { settings: changed })

      // Atualiza settings locais
      setSettings(prev =>
        prev.map(s => {
          const key = settingsKey(s)
          if (key in edited && s.categoria === activeTab) {
            return { ...s, valor: edited[key] }
          }
          return s
        })
      )

      // Limpa editados desta aba
      setEdited(prev => {
        const next = { ...prev }
        for (const s of tabSettings(activeTab)) {
          delete next[settingsKey(s)]
        }
        return next
      })

      showSuccess('Salvas com sucesso!')
    } catch {
      showError('Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  // ── Render field ──

  function renderField(s: Setting) {
    const val = currentValue(s)
    const inputClass = "w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:ring-2 focus:ring-bibelo-primary/40 focus:border-bibelo-primary transition-colors"

    return (
      <div key={settingsKey(s)} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
        <div className="flex-1 min-w-0">
          <label className="text-sm font-medium text-bibelo-text">{s.label}</label>
          {s.descricao && (
            <p className="text-xs text-bibelo-muted mt-0.5">{s.descricao}</p>
          )}
        </div>

        <div className="sm:w-64 shrink-0">
          {s.tipo === 'boolean' ? (
            <div className="flex items-center gap-2">
              <Toggle
                checked={val === 'true'}
                onChange={(v) => handleChange(s, v ? 'true' : 'false')}
              />
              <span className="text-xs text-bibelo-muted">
                {val === 'true' ? 'Ativado' : 'Desativado'}
              </span>
            </div>
          ) : s.tipo === 'currency' ? (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-bibelo-muted font-medium">R$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={val}
                onChange={(e) => handleChange(s, e.target.value)}
                className={`${inputClass} pl-10`}
              />
            </div>
          ) : s.tipo === 'number' ? (
            <input
              type="number"
              value={val}
              onChange={(e) => handleChange(s, e.target.value)}
              className={inputClass}
            />
          ) : s.tipo === 'json' ? (
            <input
              type="text"
              value={val}
              onChange={(e) => handleChange(s, e.target.value)}
              placeholder="JSON..."
              className={`${inputClass} font-mono`}
            />
          ) : (
            <input
              type="text"
              value={val}
              onChange={(e) => handleChange(s, e.target.value)}
              className={inputClass}
            />
          )}
        </div>
      </div>
    )
  }

  // ── Tab content ──

  function renderTabContent() {
    const tab = TABS.find(t => t.key === activeTab)!
    const Icon = tab.icon
    const items = tabSettings(activeTab)
    const hasChanges = tabHasChanges(activeTab)

    if (items.length === 0) {
      return (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-8 text-center">
          <Icon size={32} className="mx-auto text-bibelo-muted mb-3" />
          <p className="text-sm text-bibelo-muted">Nenhuma configuração encontrada para esta categoria</p>
        </div>
      )
    }

    return (
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl">
        {/* Header da seção */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-bibelo-border">
          <div className="p-2 rounded-lg bg-bibelo-primary/10">
            <Icon size={18} className="text-bibelo-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-bibelo-text">{tab.label}</h2>
            <p className="text-xs text-bibelo-muted">{tab.descricao}</p>
          </div>
        </div>

        {/* Campos */}
        <div className="px-6 divide-y divide-bibelo-border">
          {items.map(renderField)}
        </div>

        {/* Botão salvar */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-bibelo-border">
          {hasChanges && (
            <span className="text-xs text-amber-400">Alterações não salvas</span>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex items-center gap-2 px-4 py-2 bg-bibelo-primary hover:bg-bibelo-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save size={16} />
                Salvar {tab.label}
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  // ── Loading state ──

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Store size={24} className="text-bibelo-primary" />
          <div>
            <h1 className="text-2xl font-bold text-bibelo-text">Loja Online</h1>
            <p className="text-sm text-bibelo-muted">Configurações da sua loja virtual</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-bibelo-primary" />
          <span className="ml-3 text-sm text-bibelo-muted">Carregando configurações...</span>
        </div>
      </div>
    )
  }

  // ── Error state ──

  if (error && settings.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Store size={24} className="text-bibelo-primary" />
          <div>
            <h1 className="text-2xl font-bold text-bibelo-text">Loja Online</h1>
            <p className="text-sm text-bibelo-muted">Configurações da sua loja virtual</p>
          </div>
        </div>
        <div className="bg-red-400/10 border border-red-400/30 rounded-xl p-8 text-center">
          <p className="text-sm text-red-400 mb-3">{error}</p>
          <button
            onClick={fetchSettings}
            className="px-4 py-2 bg-bibelo-primary hover:bg-bibelo-primary-hover text-white text-sm font-medium rounded-lg transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  // ── Main render ──

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Store size={24} className="text-bibelo-primary" />
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Loja Online</h1>
          <p className="text-sm text-bibelo-muted">Configurações da sua loja virtual</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1 -mx-6 px-6 sm:mx-0 sm:px-0">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          const hasUnsaved = tabHasChanges(tab.key)
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                active
                  ? 'bg-bibelo-primary text-white'
                  : 'bg-bibelo-card border border-bibelo-border text-bibelo-muted hover:text-bibelo-text hover:border-bibelo-primary/30'
              }`}
            >
              <Icon size={16} />
              {tab.label}
              {hasUnsaved && (
                <span className={`w-2 h-2 rounded-full ${active ? 'bg-white' : 'bg-amber-400'}`} />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {renderTabContent()}
    </div>
  )
}
