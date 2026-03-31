import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, ChevronLeft, ChevronRight, Users, Download, Mail,
  Phone, TrendingUp, UserCheck, AlertTriangle, ArrowUpDown,
  Filter, RefreshCw, Star,
} from 'lucide-react';
import api from '../lib/api';
import { exportCsv } from '../lib/export';

interface Customer {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  canal_origem?: string;
  cidade?: string;
  estado?: string;
  score?: number;
  segmento?: string;
  ltv?: number;
  criado_em: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface Stats {
  total: string;
  com_email: string;
  com_telefone: string;
  novos_30d: string;
  inativos: string;
  score_alto: string;
  score_medio: string;
}

const SEGMENT_COLORS: Record<string, string> = {
  vip: 'bg-violet-500/20 text-violet-400',
  frequente: 'bg-emerald-500/20 text-emerald-400',
  regular: 'bg-blue-500/20 text-blue-400',
  ocasional: 'bg-amber-500/20 text-amber-400',
  inativo: 'bg-red-500/20 text-red-400',
  lead: 'bg-pink-500/20 text-pink-400',
  lead_quente: 'bg-orange-500/20 text-orange-400',
  novo: 'bg-cyan-500/20 text-cyan-400',
  alto_valor: 'bg-emerald-500/20 text-emerald-400',
  recorrente: 'bg-blue-500/20 text-blue-400',
};

const SEGMENT_LABELS: Record<string, string> = {
  vip: 'VIP',
  frequente: 'Frequente',
  regular: 'Regular',
  ocasional: 'Ocasional',
  inativo: 'Inativo',
  lead: 'Lead',
  lead_quente: 'Lead Quente',
  novo: 'Novo',
  alto_valor: 'Alto Valor',
  recorrente: 'Recorrente',
};

const CANAL_LABELS: Record<string, string> = {
  bling: 'Bling',
  nuvemshop: 'NuvemShop',
  popup: 'Popup',
  instagram: 'Instagram',
  manual: 'Manual',
  teste: 'Teste',
};

const CANAL_COLORS: Record<string, string> = {
  bling: 'bg-blue-500/15 text-blue-400',
  nuvemshop: 'bg-violet-500/15 text-violet-400',
  popup: 'bg-pink-500/15 text-pink-400',
  instagram: 'bg-fuchsia-500/15 text-fuchsia-400',
  manual: 'bg-bibelo-border text-bibelo-muted',
  teste: 'bg-bibelo-border text-bibelo-muted',
};

function segmentBadge(seg?: string) {
  if (!seg) return <span className="text-xs text-bibelo-muted/40">--</span>;
  const key = seg.toLowerCase();
  const cls = SEGMENT_COLORS[key] || 'bg-bibelo-border text-bibelo-muted';
  const label = SEGMENT_LABELS[key] || seg;
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function canalBadge(canal?: string) {
  if (!canal) return null;
  const key = canal.toLowerCase();
  const cls = CANAL_COLORS[key] || 'bg-bibelo-border text-bibelo-muted';
  const label = CANAL_LABELS[key] || canal;
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{label}</span>;
}

function isRecent(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 7 * 24 * 3600 * 1000;
}

function scoreBar(score?: number) {
  if (score == null) return <span className="text-xs text-bibelo-muted/40">--</span>;
  const color = score >= 70 ? 'bg-emerald-400' : score >= 40 ? 'bg-amber-400' : 'bg-red-400';
  const textColor = score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-1.5 bg-bibelo-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-semibold ${textColor}`}>{score}</span>
    </div>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function Clientes() {
  const [clientes, setClientes] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [segmento, setSegmento] = useState('');
  const [canal, setCanal] = useState('');
  const [contato, setContato] = useState('');
  const [cidade, setCidade] = useState('');
  const [cidades, setCidades] = useState<Array<{ cidade: string; total: string }>>([]);
  const [ordenar, setOrdenar] = useState<'recentes' | 'nome' | 'score_desc'>('recentes');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  const fetchClientes = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20, ordenar };
      if (search) params.search = search;
      if (segmento) params.segmento = segmento;
      if (canal) params.canal_origem = canal;
      if (contato) params.contato = contato;
      if (cidade) params.cidade = cidade;
      const { data } = await api.get('/customers', { params });
      setClientes(data.data);
      setPagination(data.pagination);
    } catch {
      setClientes([]);
    } finally {
      setLoading(false);
    }
  }, [search, segmento, canal, contato, cidade, ordenar]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/customers/stats');
      setStats(data);
    } catch { /* */ }
  }, []);

  useEffect(() => { fetchClientes(1); }, [fetchClientes]);
  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { api.get('/customers/cidades').then((r) => setCidades(r.data)).catch(() => {}); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const kpis = stats ? [
    { label: 'Total', value: stats.total, icon: Users, color: 'text-pink-400', bg: 'bg-pink-400/10' },
    { label: 'Com e-mail', value: stats.com_email, icon: Mail, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Com WhatsApp', value: stats.com_telefone, icon: Phone, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Novos (30d)', value: stats.novos_30d, icon: TrendingUp, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
    { label: 'Score alto', value: stats.score_alto, icon: Star, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { label: 'Inativos', value: stats.inativos, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-400/10' },
  ] : [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-bibelo-text">Clientes</h1>
          <span className="text-[10px] px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full font-bold">{pagination.total}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchClientes(pagination.page); fetchStats(); }}
            className="p-2 text-bibelo-muted hover:text-pink-400 transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => exportCsv(clientes.map((c) => ({ nome: c.nome, email: c.email || '', telefone: c.telefone || '', segmento: c.segmento || '', canal: c.canal_origem || '', cidade: c.cidade || '', score: c.score ?? '' })), 'clientes')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bibelo-card border border-bibelo-border rounded-lg text-xs text-bibelo-muted hover:text-bibelo-text transition-colors"
            title="Exportar CSV"
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-6 h-6 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                  <kpi.icon size={12} className={kpi.color} />
                </div>
                <span className="text-lg font-bold text-bibelo-text">{kpi.value}</span>
              </div>
              <p className="text-[10px] text-bibelo-muted">{kpi.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted" />
          <input
            type="text"
            placeholder="Buscar por nome, email ou telefone..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-pink-400/50 transition-colors"
          />
        </form>

        <div className="flex gap-2">
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted pointer-events-none" />
            <select
              value={segmento}
              onChange={(e) => setSegmento(e.target.value)}
              className="pl-9 pr-8 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text appearance-none cursor-pointer focus:outline-none focus:border-pink-400/50 transition-colors"
            >
              <option value="">Segmento</option>
              <option value="lead_quente">Lead Quente</option>
              <option value="lead">Lead</option>
              <option value="vip">VIP</option>
              <option value="alto_valor">Alto Valor</option>
              <option value="recorrente">Recorrente</option>
              <option value="novo">Novo</option>
              <option value="ocasional">Ocasional</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>

          <div className="relative">
            <UserCheck size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted pointer-events-none" />
            <select
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              className="pl-9 pr-8 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text appearance-none cursor-pointer focus:outline-none focus:border-pink-400/50 transition-colors"
            >
              <option value="">Origem</option>
              <option value="bling">Bling</option>
              <option value="nuvemshop">NuvemShop</option>
              <option value="popup">Popup</option>
            </select>
          </div>

          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted pointer-events-none" />
            <select
              value={contato}
              onChange={(e) => setContato(e.target.value)}
              className="pl-9 pr-8 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text appearance-none cursor-pointer focus:outline-none focus:border-pink-400/50 transition-colors"
            >
              <option value="">Contato</option>
              <option value="com_email">Com email</option>
              <option value="sem_email">Sem email</option>
              <option value="com_telefone">Com telefone</option>
              <option value="sem_telefone">Sem telefone</option>
            </select>
          </div>

          {cidades.length > 0 && (
            <select
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className="px-3 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text appearance-none cursor-pointer focus:outline-none focus:border-pink-400/50 transition-colors"
            >
              <option value="">Cidade</option>
              {cidades.map((c) => (
                <option key={c.cidade} value={c.cidade}>{c.cidade} ({c.total})</option>
              ))}
            </select>
          )}

          <div className="relative">
            <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted pointer-events-none" />
            <select
              value={ordenar}
              onChange={(e) => setOrdenar(e.target.value as 'recentes' | 'nome' | 'score_desc')}
              className="pl-9 pr-8 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text appearance-none cursor-pointer focus:outline-none focus:border-pink-400/50 transition-colors"
            >
              <option value="recentes">Mais recentes</option>
              <option value="nome">Nome A-Z</option>
              <option value="score_desc">Maior score</option>
            </select>
          </div>
        </div>
      </div>

      {/* Filtros ativos */}
      {(search || segmento || canal || contato || cidade) && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[10px] text-bibelo-muted uppercase tracking-wider">Filtros:</span>
          {search && (
            <button onClick={() => { setSearch(''); setSearchInput(''); }} className="flex items-center gap-1 px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full text-[11px] font-medium hover:bg-pink-400/20 transition-colors">
              &quot;{search}&quot; &times;
            </button>
          )}
          {segmento && (
            <button onClick={() => setSegmento('')} className="flex items-center gap-1 px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full text-[11px] font-medium hover:bg-pink-400/20 transition-colors">
              {SEGMENT_LABELS[segmento] || segmento} &times;
            </button>
          )}
          {canal && (
            <button onClick={() => setCanal('')} className="flex items-center gap-1 px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full text-[11px] font-medium hover:bg-pink-400/20 transition-colors">
              {CANAL_LABELS[canal] || canal} &times;
            </button>
          )}
          {contato && (
            <button onClick={() => setContato('')} className="flex items-center gap-1 px-2 py-0.5 bg-emerald-400/10 text-emerald-400 rounded-full text-[11px] font-medium hover:bg-emerald-400/20 transition-colors">
              {{ com_email: 'Com email', sem_email: 'Sem email', com_telefone: 'Com telefone', sem_telefone: 'Sem telefone' }[contato]} &times;
            </button>
          )}
          {cidade && (
            <button onClick={() => setCidade('')} className="flex items-center gap-1 px-2 py-0.5 bg-blue-400/10 text-blue-400 rounded-full text-[11px] font-medium hover:bg-blue-400/20 transition-colors">
              {cidade} &times;
            </button>
          )}
          <button
            onClick={() => { setSearch(''); setSearchInput(''); setSegmento(''); setCanal(''); setContato(''); setCidade(''); }}
            className="text-[11px] text-bibelo-muted hover:text-pink-400 transition-colors underline"
          >
            Limpar tudo
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Contato</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Origem</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Cidade</th>
                <th className="px-4 py-3 font-medium">Segmento</th>
                <th className="px-4 py-3 font-medium text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-bibelo-border/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-bibelo-border rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : clientes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-bibelo-muted">
                    <Users size={32} className="mx-auto mb-2 opacity-50" />
                    <p>{search || segmento || canal ? 'Nenhum cliente com esses filtros' : 'Nenhum cliente encontrado'}</p>
                  </td>
                </tr>
              ) : (
                clientes.map((c) => (
                  <tr key={c.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-pink-400/10 flex items-center justify-center text-sm font-bold text-pink-400 shrink-0">
                          {(c.nome || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link to={`/clientes/${c.id}`} className="text-sm text-bibelo-text hover:text-pink-400 font-medium transition-colors truncate">
                              {c.nome}
                            </Link>
                            {isRecent(c.criado_em) && (
                              <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 text-[9px] font-bold rounded uppercase shrink-0">novo</span>
                            )}
                          </div>
                          <p className="text-[11px] text-bibelo-muted truncate sm:hidden">{c.email || c.telefone || '--'}</p>
                          <p className="text-[11px] text-bibelo-muted hidden sm:block">{fmtDate(c.criado_em)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex flex-col gap-0.5">
                        {c.email ? (
                          <span className="flex items-center gap-1.5 text-xs text-bibelo-muted" title={c.email}>
                            <Mail size={11} className="text-emerald-400 shrink-0" />
                            <span className="truncate max-w-[180px]">{c.email}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-bibelo-muted/30">sem email</span>
                        )}
                        {c.telefone ? (
                          <a
                            href={`https://wa.me/55${c.telefone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-bibelo-muted hover:text-emerald-400 transition-colors"
                            title={`WhatsApp: ${c.telefone}`}
                          >
                            <Phone size={11} className="text-emerald-400 shrink-0" />
                            <span>{c.telefone}</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-bibelo-muted/30">sem telefone</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {canalBadge(c.canal_origem)}
                    </td>
                    <td className="px-4 py-3 text-xs text-bibelo-muted hidden lg:table-cell">
                      {c.cidade ? `${c.cidade}${c.estado ? `/${c.estado}` : ''}` : '--'}
                    </td>
                    <td className="px-4 py-3">{segmentBadge(c.segmento)}</td>
                    <td className="px-4 py-3 text-right">{scoreBar(c.score)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-bibelo-border">
            <p className="text-xs text-bibelo-muted">
              Página {pagination.page} de {pagination.pages} ({pagination.total} clientes)
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => fetchClientes(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg border border-bibelo-border text-bibelo-muted hover:text-pink-400 hover:border-pink-400/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => fetchClientes(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="p-1.5 rounded-lg border border-bibelo-border text-bibelo-muted hover:text-pink-400 hover:border-pink-400/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
