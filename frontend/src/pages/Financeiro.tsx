import { useEffect, useState, useCallback } from 'react';
import {
  DollarSign, TrendingDown, TrendingUp, Wallet, ShoppingCart, Target,
  ChevronLeft, ChevronRight, Search, Plus, ArrowUpRight, ArrowDownRight,
  Receipt, X,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import api from '../lib/api';

interface DashboardData {
  receitas: number;
  despesas: number;
  saldo: number;
  variacao_receita: number;
  variacao_despesa: number;
  total_vendas: number;
  ticket_medio: number;
  despesas_fixas_mensal: number;
  ponto_equilibrio: number;
  receitas_por_categoria: { categoria: string; cor: string; valor: string }[];
  despesas_por_categoria: { categoria: string; cor: string; valor: string }[];
  resumo_mensal: { mes: string; mes_label: string; receitas: string; despesas: string; saldo: string }[];
}

interface Lancamento {
  id: string;
  data: string;
  descricao: string;
  tipo: string;
  valor: string;
  status: string;
  observacoes: string;
  qtd_vendas: number | null;
  categoria_nome: string;
  categoria_cor: string;
  categoria_icone: string;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
  cor: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const PERIODOS = [
  { value: 'mes_atual', label: 'Mês Atual' },
  { value: 'mes_anterior', label: 'Mês Anterior' },
  { value: '3m', label: '3 Meses' },
  { value: '6m', label: '6 Meses' },
  { value: '1a', label: '1 Ano' },
  { value: 'total', label: 'Total' },
];

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function VariacaoBadge({ valor }: { valor: number }) {
  if (valor === 0) return null;
  const pos = valor > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(valor)}%
    </span>
  );
}

export default function Financeiro() {
  const [tab, setTab] = useState<'dashboard' | 'lancamentos'>('dashboard');
  const [periodo, setPeriodo] = useState('total');
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Lançamentos state
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 30, total: 0, pages: 0 });
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [mesFiltro, setMesFiltro] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loadingLanc, setLoadingLanc] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  // Modal novo lançamento
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    data: new Date().toISOString().split('T')[0],
    descricao: '',
    categoria_id: '',
    tipo: 'despesa' as 'receita' | 'despesa',
    valor: '',
    status: 'realizado',
    observacoes: '',
    qtd_vendas: '',
    forma_pagamento: '',
  });
  const [saving, setSaving] = useState(false);

  // Load dashboard
  useEffect(() => {
    setLoading(true);
    api.get(`/financeiro/dashboard?periodo=${periodo}`)
      .then(({ data }) => setDash(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [periodo]);

  // Load categorias
  useEffect(() => {
    api.get('/financeiro/categorias').then(({ data }) => setCategorias(data.data)).catch(() => {});
  }, []);

  // Load lançamentos
  const fetchLancamentos = useCallback(async (page: number) => {
    setLoadingLanc(true);
    try {
      const params: Record<string, string | number> = { page, limit: 30 };
      if (tipoFiltro) params.tipo = tipoFiltro;
      if (mesFiltro) params.mes = mesFiltro;
      if (search) params.search = search;
      const { data } = await api.get('/financeiro/lancamentos', { params });
      setLancamentos(data.data);
      setPagination(data.pagination);
    } catch { setLancamentos([]); }
    finally { setLoadingLanc(false); }
  }, [tipoFiltro, mesFiltro, search]);

  useEffect(() => {
    if (tab === 'lancamentos') fetchLancamentos(1);
  }, [tab, fetchLancamentos]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setSearch(searchInput); };

  const handleSave = async () => {
    if (!formData.descricao || !formData.categoria_id || !formData.valor) return;
    setSaving(true);
    try {
      await api.post('/financeiro/lancamentos', {
        ...formData,
        valor: parseFloat(formData.valor),
        qtd_vendas: formData.qtd_vendas ? parseInt(formData.qtd_vendas) : undefined,
      });
      setShowModal(false);
      setFormData({ data: new Date().toISOString().split('T')[0], descricao: '', categoria_id: '', tipo: 'despesa', valor: '', status: 'realizado', observacoes: '', qtd_vendas: '', forma_pagamento: '' });
      fetchLancamentos(1);
    } catch {}
    finally { setSaving(false); }
  };

  const filteredCategorias = categorias.filter(c => c.tipo === formData.tipo);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Financeiro</h1>
          <p className="text-sm text-bibelo-muted mt-1">Fluxo de caixa, receitas e despesas</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('dashboard')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'dashboard' ? 'bg-bibelo-primary text-white' : 'bg-bibelo-card border border-bibelo-border text-bibelo-muted hover:text-bibelo-text'}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setTab('lancamentos')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'lancamentos' ? 'bg-bibelo-primary text-white' : 'bg-bibelo-card border border-bibelo-border text-bibelo-muted hover:text-bibelo-text'}`}
          >
            Lançamentos
          </button>
        </div>
      </div>

      {tab === 'dashboard' ? (
        <>
          {/* Período */}
          <div className="flex gap-1 bg-bibelo-card border border-bibelo-border rounded-lg p-1 mb-6 w-fit flex-wrap">
            {PERIODOS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriodo(p.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  periodo === p.value ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-28" />
              ))
            ) : (
              <>
                <KpiCard label="Receitas" value={fmt(dash?.receitas || 0)} variacao={dash?.variacao_receita} icon={TrendingUp} color="text-emerald-400" />
                <KpiCard label="Despesas" value={fmt(dash?.despesas || 0)} variacao={dash?.variacao_despesa} icon={TrendingDown} color="text-red-400" />
                <KpiCard label="Saldo" value={fmt(dash?.saldo || 0)} icon={Wallet} color={(dash?.saldo || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                <KpiCard label="Vendas" value={String(dash?.total_vendas || 0)} icon={ShoppingCart} color="text-blue-400" />
                <KpiCard label="Ticket Médio" value={fmt(dash?.ticket_medio || 0)} icon={DollarSign} color="text-amber-400" />
                <KpiCard label="Ponto Equilíbrio" value={`${dash?.ponto_equilibrio || 0} vendas`} icon={Target} color="text-purple-400" />
              </>
            )}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* Receita vs Despesa mensal */}
            <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-bibelo-muted mb-4">Receitas vs Despesas por Mês</h2>
              {loading || !dash?.resumo_mensal?.length ? (
                <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dash.resumo_mensal.map(m => ({
                    mes: m.mes_label,
                    receitas: parseFloat(m.receitas),
                    despesas: parseFloat(m.despesas),
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                    <XAxis dataKey="mes" stroke="#64748B" fontSize={12} />
                    <YAxis tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} stroke="#64748B" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }}
                      formatter={(v: number) => fmt(v)}
                    />
                    <Bar dataKey="receitas" name="Receitas" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesas" name="Despesas" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Saldo mensal */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-bibelo-muted mb-4">Saldo Mensal</h2>
              {loading || !dash?.resumo_mensal?.length ? (
                <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={dash.resumo_mensal.map(m => ({
                    mes: m.mes_label,
                    saldo: parseFloat(m.saldo),
                  }))}>
                    <defs>
                      <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                    <XAxis dataKey="mes" stroke="#64748B" fontSize={12} />
                    <YAxis tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} stroke="#64748B" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }}
                      formatter={(v: number) => fmt(v)}
                    />
                    <Area type="monotone" dataKey="saldo" stroke="#8B5CF6" strokeWidth={2} fill="url(#colorSaldo)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Categorias */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CategoriaChart titulo="Receitas por Categoria" data={dash?.receitas_por_categoria || []} loading={loading} />
            <CategoriaChart titulo="Despesas por Categoria" data={dash?.despesas_por_categoria || []} loading={loading} />
          </div>
        </>
      ) : (
        <>
          {/* Lançamentos */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <form onSubmit={handleSearch} className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted" />
              <input
                type="text"
                placeholder="Buscar lançamentos..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-bibelo-primary transition-colors"
              />
            </form>
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
              className="bg-bibelo-card border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
            >
              <option value="">Todos os tipos</option>
              <option value="receita">Receitas</option>
              <option value="despesa">Despesas</option>
            </select>
            <input
              type="month"
              value={mesFiltro}
              onChange={(e) => setMesFiltro(e.target.value)}
              className="bg-bibelo-card border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
            />
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 transition-colors"
            >
              <Plus size={16} />
              Novo
            </button>
          </div>

          {/* Tabela */}
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Descrição</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">Categoria</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium text-right">Valor</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Status</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Vendas</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLanc ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-bibelo-border/50">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-bibelo-border rounded animate-pulse w-16" /></td>
                        ))}
                      </tr>
                    ))
                  ) : lancamentos.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-bibelo-muted">
                        <Receipt size={32} className="mx-auto mb-2 opacity-50" />
                        <p>Nenhum lançamento encontrado</p>
                      </td>
                    </tr>
                  ) : (
                    lancamentos.map((l) => (
                      <tr key={l.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors">
                        <td className="px-4 py-3 text-bibelo-muted text-xs whitespace-nowrap">{fmtDate(l.data)}</td>
                        <td className="px-4 py-3 text-bibelo-text">
                          <div>{l.descricao}</div>
                          {l.observacoes && <div className="text-xs text-bibelo-muted mt-0.5 truncate max-w-[200px]">{l.observacoes}</div>}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.categoria_cor }} />
                            {l.categoria_nome}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            l.tipo === 'receita' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'
                          }`}>
                            {l.tipo === 'receita' ? '+' : '-'} {l.tipo}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${l.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {l.tipo === 'receita' ? '+' : '-'}{fmt(parseFloat(l.valor))}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs ${
                            l.status === 'realizado' ? 'bg-emerald-400/10 text-emerald-400' :
                            l.status === 'programado' ? 'bg-amber-400/10 text-amber-400' :
                            'bg-red-400/10 text-red-400'
                          }`}>
                            {l.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-bibelo-muted">
                          {l.qtd_vendas ? `${l.qtd_vendas}x` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-bibelo-border">
                <p className="text-xs text-bibelo-muted">
                  {pagination.total} lançamento{pagination.total !== 1 ? 's' : ''} - Página {pagination.page} de {pagination.pages}
                </p>
                <div className="flex gap-1">
                  <button onClick={() => fetchLancamentos(pagination.page - 1)} disabled={pagination.page <= 1}
                    className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 disabled:opacity-30 transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => fetchLancamentos(pagination.page + 1)} disabled={pagination.page >= pagination.pages}
                    className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 disabled:opacity-30 transition-colors">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal Novo Lançamento */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-bibelo-text">Novo Lançamento</h2>
              <button onClick={() => setShowModal(false)} className="text-bibelo-muted hover:text-bibelo-text"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              {/* Tipo */}
              <div className="flex gap-2">
                <button
                  onClick={() => setFormData(f => ({ ...f, tipo: 'receita', categoria_id: '' }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${formData.tipo === 'receita' ? 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/30' : 'bg-bibelo-bg border border-bibelo-border text-bibelo-muted'}`}
                >
                  Receita
                </button>
                <button
                  onClick={() => setFormData(f => ({ ...f, tipo: 'despesa', categoria_id: '' }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${formData.tipo === 'despesa' ? 'bg-red-400/20 text-red-400 border border-red-400/30' : 'bg-bibelo-bg border border-bibelo-border text-bibelo-muted'}`}
                >
                  Despesa
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Data</label>
                  <input type="date" value={formData.data} onChange={(e) => setFormData(f => ({ ...f, data: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Valor (R$)</label>
                  <input type="number" step="0.01" placeholder="0,00" value={formData.valor} onChange={(e) => setFormData(f => ({ ...f, valor: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Descrição</label>
                <input type="text" placeholder="Descrição do lançamento" value={formData.descricao} onChange={(e) => setFormData(f => ({ ...f, descricao: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Categoria</label>
                <select value={formData.categoria_id} onChange={(e) => setFormData(f => ({ ...f, categoria_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary">
                  <option value="">Selecione...</option>
                  {filteredCategorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Status</label>
                  <select value={formData.status} onChange={(e) => setFormData(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary">
                    <option value="realizado">Realizado</option>
                    <option value="programado">Programado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Qtd Vendas</label>
                  <input type="number" placeholder="0" value={formData.qtd_vendas} onChange={(e) => setFormData(f => ({ ...f, qtd_vendas: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Observações</label>
                <input type="text" placeholder="Opcional" value={formData.observacoes} onChange={(e) => setFormData(f => ({ ...f, observacoes: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !formData.descricao || !formData.categoria_id || !formData.valor}
                className="w-full py-2.5 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : 'Salvar Lançamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, variacao, icon: Icon, color }: {
  label: string; value: string; variacao?: number; icon: any; color: string;
}) {
  return (
    <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm text-bibelo-muted">{label}</p>
        <Icon size={18} className={color} />
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-xl font-bold text-bibelo-text">{value}</p>
        {variacao !== undefined && <VariacaoBadge valor={variacao} />}
      </div>
    </div>
  );
}

function CategoriaChart({ titulo, data, loading }: {
  titulo: string; data: { categoria: string; cor: string; valor: string }[]; loading: boolean;
}) {
  const chartData = data.map(d => ({ name: d.categoria, value: parseFloat(d.valor), cor: d.cor }));
  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
      <h2 className="text-sm font-medium text-bibelo-muted mb-4">{titulo}</h2>
      {loading || chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados</div>
      ) : (
        <div className="flex flex-col lg:flex-row items-center gap-4">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((d, i) => <Cell key={i} fill={d.cor} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => fmt(v)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 w-full">
            {chartData.slice(0, 6).map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.cor }} />
                <span className="text-bibelo-muted truncate flex-1">{d.name}</span>
                <span className="text-bibelo-text font-medium">{fmt(d.value)}</span>
                <span className="text-bibelo-muted w-10 text-right">{total > 0 ? `${Math.round((d.value / total) * 100)}%` : ''}</span>
              </div>
            ))}
            {chartData.length > 6 && (
              <p className="text-xs text-bibelo-muted">+{chartData.length - 6} categorias</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
