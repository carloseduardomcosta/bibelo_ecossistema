import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, TrendingUp, Package, Clock, Search, Plus, ChevronRight,
  AlertTriangle, Medal, Star, Crown, X, Filter,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../lib/format';

// ── Tipos ──────────────────────────────────────────────────────

interface Stats {
  total: string; ativas: string; pendentes: string;
  volume_mes: string; pedidos_pendentes: string;
  nivel_bronze: string; nivel_prata: string; nivel_ouro: string;
}

interface Revendedora {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  documento: string | null;
  cidade: string | null;
  estado: string | null;
  nivel: 'bronze' | 'prata' | 'ouro';
  pontos: number;
  volume_mes_atual: string;
  total_vendido: string;
  percentual_desconto: string;
  status: 'pendente' | 'ativa' | 'inativa' | 'suspensa';
  criado_em: string;
  meses_consecutivos: number;
  total_pedidos: number;
  total_conquistas: number;
  alertas_estoque: number;
}

// ── Helpers visuais ────────────────────────────────────────────

const NIVEL_CONFIG = {
  bronze: { label: 'Bronze', icon: Medal,  color: 'text-amber-400',  bg: 'bg-amber-400/10',  border: 'border-amber-400/30' },
  prata:  { label: 'Prata',  icon: Star,   color: 'text-slate-300',  bg: 'bg-slate-300/10',  border: 'border-slate-300/30' },
  ouro:   { label: 'Ouro',   icon: Crown,  color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30' },
} as const;

const STATUS_CONFIG = {
  pendente:  { label: 'Pendente',  color: 'text-amber-400',  bg: 'bg-amber-400/10'  },
  ativa:     { label: 'Ativa',     color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  inativa:   { label: 'Inativa',   color: 'text-bibelo-muted', bg: 'bg-bibelo-border' },
  suspensa:  { label: 'Suspensa',  color: 'text-red-400',    bg: 'bg-red-400/10'    },
} as const;

function NivelBadge({ nivel }: { nivel: 'bronze' | 'prata' | 'ouro' }) {
  const cfg = NIVEL_CONFIG[nivel];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: Revendedora['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}


// ── Modal Nova Revendedora ─────────────────────────────────────

interface ModalProps { onClose: () => void; onSaved: () => void; }

function ModalNovaRevendedora({ onClose, onSaved }: ModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nome: '', email: '', telefone: '', documento: '',
    cidade: '', estado: '', observacao: '',
    percentual_desconto: 20, pedido_minimo: 300,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/revendedoras', form);
      toast.success('Revendedora cadastrada com sucesso!');
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Erro ao cadastrar revendedora');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-bibelo-card border border-bibelo-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-bibelo-border">
          <h2 className="text-lg font-bold text-bibelo-text">Nova Revendedora</h2>
          <button onClick={onClose} className="text-bibelo-muted hover:text-bibelo-text transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-bibelo-muted mb-1">Nome *</label>
              <input
                required
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
                placeholder="Angélica Bort Pierezan"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-bibelo-muted mb-1">E-mail *</label>
              <input
                required type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-bibelo-muted mb-1">Telefone</label>
              <input
                value={form.telefone}
                onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
                placeholder="(49) 9 8822-9390"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-bibelo-muted mb-1">CPF / CNPJ</label>
              <input
                value={form.documento}
                onChange={e => setForm(f => ({ ...f, documento: e.target.value }))}
                className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
                placeholder="000.000.000-00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-bibelo-muted mb-1">Cidade</label>
              <input
                value={form.cidade}
                onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))}
                className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
                placeholder="Chapecó"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-bibelo-muted mb-1">Estado</label>
              <input
                value={form.estado}
                onChange={e => setForm(f => ({ ...f, estado: e.target.value.toUpperCase().slice(0, 2) }))}
                className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
                placeholder="SC"
                maxLength={2}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-bibelo-muted mb-1">Desconto inicial (%)</label>
              <input
                type="number" min={0} max={50} step={0.5}
                value={form.percentual_desconto}
                onChange={e => setForm(f => ({ ...f, percentual_desconto: parseFloat(e.target.value) || 20 }))}
                className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-bibelo-muted mb-1">Pedido mínimo (R$)</label>
              <input
                type="number" min={0} step={10}
                value={form.pedido_minimo}
                onChange={e => setForm(f => ({ ...f, pedido_minimo: parseFloat(e.target.value) || 300 }))}
                className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-bibelo-muted mb-1">Observação</label>
            <textarea
              rows={2}
              value={form.observacao}
              onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
              className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary resize-none"
              placeholder="Como ela chegou até nós, perfil, etc."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-bibelo-border text-bibelo-muted text-sm font-medium hover:text-bibelo-text hover:border-bibelo-muted transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 rounded-lg bg-bibelo-primary text-white text-sm font-semibold hover:bg-bibelo-primary/90 disabled:opacity-50 transition-colors">
              {loading ? 'Salvando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────

export default function Revendedoras() {
  const navigate = useNavigate();
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [revendedoras, setRevendedoras] = useState<Revendedora[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterNivel, setFilterNivel] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [aprovandoId, setAprovandoId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search)       params.set('search', search);
      if (filterStatus) params.set('status', filterStatus);
      if (filterNivel)  params.set('nivel', filterNivel);

      const [statsRes, listRes] = await Promise.all([
        api.get('/revendedoras/stats'),
        api.get(`/revendedoras?${params}`),
      ]);
      setStats(statsRes.data);
      setRevendedoras(listRes.data.data);
    } catch {
      toast.error('Erro ao carregar revendedoras');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterNivel, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function aprovar(id: string) {
    setAprovandoId(id);
    try {
      await api.put(`/revendedoras/${id}/status`, { status: 'ativa' });
      toast.success('Revendedora aprovada!');
      fetchData();
    } catch {
      toast.error('Erro ao aprovar');
    } finally {
      setAprovandoId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Clube de Revendedoras</h1>
          <p className="text-sm text-bibelo-muted mt-0.5">Gerencie o programa de parcerias Bibelô</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-bibelo-primary text-white rounded-lg text-sm font-semibold hover:bg-bibelo-primary/90 transition-colors"
        >
          <Plus size={16} />
          Nova Revendedora
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-bibelo-muted font-medium uppercase tracking-wider">Total</span>
              <Users size={16} className="text-bibelo-muted" />
            </div>
            <p className="text-2xl font-bold text-bibelo-text">{stats.total}</p>
            <p className="text-xs text-bibelo-muted mt-1">{stats.ativas} ativa{parseInt(stats.ativas) !== 1 ? 's' : ''}</p>
          </div>

          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-bibelo-muted font-medium uppercase tracking-wider">Volume/Mês</span>
              <TrendingUp size={16} className="text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-bibelo-text">{formatCurrency(parseFloat(stats.volume_mes))}</p>
            <p className="text-xs text-bibelo-muted mt-1">revendedoras ativas</p>
          </div>

          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-bibelo-muted font-medium uppercase tracking-wider">Pedidos</span>
              <Package size={16} className="text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-bibelo-text">{stats.pedidos_pendentes}</p>
            <p className="text-xs text-bibelo-muted mt-1">aguardando aprovação</p>
          </div>

          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-bibelo-muted font-medium uppercase tracking-wider">Aguardando</span>
              <Clock size={16} className="text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-bibelo-text">{stats.pendentes}</p>
            <p className="text-xs text-bibelo-muted mt-1">pendentes aprovação</p>
          </div>
        </div>
      )}

      {/* Distribuição de níveis */}
      {stats && parseInt(stats.total) > 0 && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-bibelo-text mb-4">Distribuição de Níveis</h3>
          <div className="grid grid-cols-3 gap-4">
            {(['bronze', 'prata', 'ouro'] as const).map(nivel => {
              const cfg = NIVEL_CONFIG[nivel];
              const Icon = cfg.icon;
              const count = stats[`nivel_${nivel}` as keyof Stats];
              const pct = parseInt(stats.total) > 0
                ? Math.round(parseInt(count) / parseInt(stats.total) * 100)
                : 0;
              return (
                <div key={nivel} className={`rounded-xl p-4 border ${cfg.bg} ${cfg.border}`}>
                  <div className={`flex items-center gap-2 mb-2 ${cfg.color}`}>
                    <Icon size={18} />
                    <span className="font-semibold text-sm">{cfg.label}</span>
                  </div>
                  <p className={`text-3xl font-bold ${cfg.color}`}>{count}</p>
                  <div className="mt-2 h-1.5 bg-black/20 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${cfg.color.replace('text-', 'bg-')}`}
                      style={{ width: `${pct}%`, opacity: 0.8 }} />
                  </div>
                  <p className="text-xs text-bibelo-muted mt-1">{pct}% do clube</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, email ou telefone..."
            className="w-full pl-9 pr-4 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted focus:outline-none focus:border-bibelo-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-bibelo-muted" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-bibelo-card border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
          >
            <option value="">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="ativa">Ativa</option>
            <option value="inativa">Inativa</option>
            <option value="suspensa">Suspensa</option>
          </select>
          <select
            value={filterNivel}
            onChange={e => setFilterNivel(e.target.value)}
            className="bg-bibelo-card border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
          >
            <option value="">Todos os níveis</option>
            <option value="bronze">Bronze</option>
            <option value="prata">Prata</option>
            <option value="ouro">Ouro</option>
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-bibelo-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : revendedoras.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Users size={40} className="text-bibelo-muted/40 mb-3" />
            <p className="text-bibelo-muted font-medium">Nenhuma revendedora encontrada</p>
            <p className="text-bibelo-muted/60 text-sm mt-1">Cadastre a primeira revendedora do Clube Bibelô</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-bibelo-primary/10 text-bibelo-primary rounded-lg text-sm font-medium hover:bg-bibelo-primary/20 transition-colors"
            >
              <Plus size={14} />
              Cadastrar agora
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bibelo-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-bibelo-muted uppercase tracking-wider">Revendedora</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-bibelo-muted uppercase tracking-wider">Nível</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-bibelo-muted uppercase tracking-wider">Vol. Mês</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-bibelo-muted uppercase tracking-wider">Pedidos</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-bibelo-muted uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-bibelo-muted uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bibelo-border">
                {revendedoras.map(r => (
                  <tr
                    key={r.id}
                    className="hover:bg-bibelo-border/20 transition-colors cursor-pointer"
                    onClick={() => navigate(`/revendedoras/${r.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-bibelo-primary/20 flex items-center justify-center text-sm font-bold text-bibelo-primary shrink-0">
                          {r.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-bibelo-text">{r.nome}</p>
                          <p className="text-xs text-bibelo-muted">
                            {r.cidade && r.estado ? `${r.cidade}/${r.estado}` : r.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <NivelBadge nivel={r.nivel} />
                        {r.meses_consecutivos >= 3 && (
                          <span title="3+ meses seguidos" className="text-orange-400">🔥</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold text-bibelo-text">
                        {formatCurrency(parseFloat(r.volume_mes_atual))}
                      </p>
                      <p className="text-xs text-bibelo-muted">{r.percentual_desconto}% desconto</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-bibelo-text font-medium">{r.total_pedidos}</span>
                        {r.alertas_estoque > 0 && (
                          <span title={`${r.alertas_estoque} produto(s) em estoque baixo`}>
                            <AlertTriangle size={14} className="text-amber-400" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                        {r.status === 'pendente' && (
                          <button
                            onClick={() => aprovar(r.id)}
                            disabled={aprovandoId === r.id}
                            className="px-3 py-1 rounded-lg bg-emerald-400/10 text-emerald-400 text-xs font-medium hover:bg-emerald-400/20 transition-colors disabled:opacity-50"
                          >
                            {aprovandoId === r.id ? '...' : 'Aprovar'}
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/revendedoras/${r.id}`)}
                          className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 transition-colors"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <ModalNovaRevendedora
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchData(); }}
        />
      )}
    </div>
  );
}
