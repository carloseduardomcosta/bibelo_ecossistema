import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, ChevronLeft, ChevronRight, Users, Download, Mail,
  Phone, TrendingUp, UserCheck, AlertTriangle, ArrowUpDown,
  Filter, RefreshCw, Star, UserPlus, Pencil, X,
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
  tipo?: string;
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

// ── Formulário de cliente (criar / editar) ─────────────────────

interface CustomerForm {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  data_nasc: string;
  instagram: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
}

const FORM_EMPTY: CustomerForm = {
  nome: '', email: '', telefone: '', cpf: '', data_nasc: '',
  instagram: '', logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: '', estado: '', cep: '',
};

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

interface CustomerModalProps {
  editando: Customer | null;
  onClose: () => void;
  onSaved: (c: Customer) => void;
}

function CustomerModal({ editando, onClose, onSaved }: CustomerModalProps) {
  const [form, setForm] = useState<CustomerForm>(() =>
    editando
      ? {
          nome: editando.nome || '',
          email: editando.email || '',
          telefone: editando.telefone || '',
          cpf: (editando as any).cpf || '',
          data_nasc: (editando as any).data_nasc?.slice(0, 10) || '',
          instagram: (editando as any).instagram || '',
          logradouro: (editando as any).logradouro || '',
          numero: (editando as any).numero || '',
          complemento: (editando as any).complemento || '',
          bairro: (editando as any).bairro || '',
          cidade: editando.cidade || '',
          estado: editando.estado || '',
          cep: (editando as any).cep || '',
        }
      : FORM_EMPTY
  );
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);

  const set = (k: keyof CustomerForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function buscarCep(cep: string) {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const d = await r.json();
      if (!d.erro) {
        setForm(f => ({
          ...f,
          logradouro: d.logradouro || f.logradouro,
          bairro: d.bairro || f.bairro,
          cidade: d.localidade || f.cidade,
          estado: d.uf || f.estado,
        }));
      }
    } catch { /* ignora */ } finally {
      setBuscandoCep(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) { setErro('Nome é obrigatório'); return; }
    setSaving(true);
    setErro('');
    try {
      const payload: Record<string, string> = {};
      (Object.keys(form) as Array<keyof CustomerForm>).forEach(k => {
        if (form[k].trim()) payload[k] = form[k].trim();
      });
      let resp;
      if (editando) {
        resp = await api.put(`/customers/${editando.id}`, payload);
      } else {
        resp = await api.post('/customers', { ...payload, canal_origem: 'manual' });
      }
      onSaved(resp.data);
    } catch (err: any) {
      setErro(err?.response?.data?.error || 'Erro ao salvar cliente');
    } finally {
      setSaving(false);
    }
  }

  const input = 'w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted/40 focus:outline-none focus:border-pink-400/50 transition-colors';
  const label = 'block text-[11px] font-medium text-bibelo-muted mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-bibelo-card border border-bibelo-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-bibelo-border sticky top-0 bg-bibelo-card z-10">
          <h2 className="text-base font-semibold text-bibelo-text">
            {editando ? 'Editar cliente' : 'Novo cliente'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-bibelo-muted hover:text-pink-400 hover:bg-pink-400/10 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Dados principais */}
          <div>
            <p className="text-[10px] font-bold text-bibelo-muted/60 uppercase tracking-wider mb-3">Dados principais</p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className={label}>Nome <span className="text-pink-400">*</span></label>
                <input value={form.nome} onChange={set('nome')} placeholder="Nome completo" className={input} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>E-mail</label>
                  <input type="email" value={form.email} onChange={set('email')} placeholder="email@exemplo.com" className={input} />
                </div>
                <div>
                  <label className={label}>Telefone / WhatsApp</label>
                  <input value={form.telefone} onChange={set('telefone')} placeholder="(47) 9 9999-9999" className={input} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>CPF</label>
                  <input value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00" className={input} />
                </div>
                <div>
                  <label className={label}>Data de nascimento</label>
                  <input type="date" value={form.data_nasc} onChange={set('data_nasc')} className={input} />
                </div>
              </div>
              <div>
                <label className={label}>Instagram</label>
                <input value={form.instagram} onChange={set('instagram')} placeholder="@usuario" className={input} />
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div>
            <p className="text-[10px] font-bold text-bibelo-muted/60 uppercase tracking-wider mb-3">Endereço</p>
            <div className="grid grid-cols-1 gap-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={label}>CEP</label>
                  <input
                    value={form.cep}
                    onChange={e => { set('cep')(e); buscarCep(e.target.value); }}
                    placeholder="00000-000"
                    className={input + (buscandoCep ? ' opacity-60' : '')}
                    maxLength={9}
                  />
                </div>
                <div>
                  <label className={label}>Estado</label>
                  <select value={form.estado} onChange={set('estado')} className={input + ' cursor-pointer'}>
                    <option value="">UF</option>
                    {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={label}>Logradouro</label>
                  <input value={form.logradouro} onChange={set('logradouro')} placeholder="Rua, Avenida..." className={input} />
                </div>
                <div>
                  <label className={label}>Número</label>
                  <input value={form.numero} onChange={set('numero')} placeholder="123" className={input} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Complemento</label>
                  <input value={form.complemento} onChange={set('complemento')} placeholder="Apto, Sala..." className={input} />
                </div>
                <div>
                  <label className={label}>Bairro</label>
                  <input value={form.bairro} onChange={set('bairro')} placeholder="Bairro" className={input} />
                </div>
              </div>
              <div>
                <label className={label}>Cidade</label>
                <input value={form.cidade} onChange={set('cidade')} placeholder="Cidade" className={input} />
              </div>
            </div>
          </div>

          {/* Aviso fluxo — só na criação */}
          {!editando && (
            <div className="flex gap-2 p-3 bg-pink-400/8 border border-pink-400/20 rounded-xl text-[11px] text-bibelo-muted">
              <span className="text-pink-400 shrink-0">✦</span>
              <span>Se o e-mail for informado, este cliente entrará automaticamente no fluxo <strong className="text-bibelo-text">Clube Bibelô</strong> (boas-vindas + cupom BIBELO10), igual ao popup do site.</span>
            </div>
          )}

          {erro && <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-bibelo-border text-sm text-bibelo-muted hover:text-bibelo-text transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-xl bg-pink-400 hover:bg-pink-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {saving ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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
  const [tipo, setTipo] = useState<'cliente' | 'b2b' | 'todos'>('cliente');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoCliente, setEditandoCliente] = useState<Customer | null>(null);

  const fetchClientes = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20, ordenar, tipo };
      if (search) params.search = search;
      if (segmento && tipo === 'cliente') params.segmento = segmento;
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
  }, [search, segmento, canal, contato, cidade, ordenar, tipo]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/customers/stats');
      setStats(data);
    } catch { /* */ }
  }, []);

  useEffect(() => { fetchClientes(1); }, [fetchClientes]);
  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { api.get('/customers/cidades').then((r) => setCidades(r.data)).catch(() => {}); }, []);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Debounce: atualiza busca 300ms após parar de digitar
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchInput]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    clearTimeout(searchTimer.current);
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
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-bibelo-text">Clientes</h1>
          <span className="text-[10px] px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full font-bold">{pagination.total}</span>
          {/* Toggle B2C / B2B */}
          <div className="flex bg-bibelo-bg border border-bibelo-border rounded-lg p-0.5 gap-0.5">
            {([
              { value: 'cliente', label: 'B2C' },
              { value: 'b2b',     label: 'B2B' },
              { value: 'todos',   label: 'Todos' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => { setTipo(value); setSegmento(''); }}
                className={`px-3 py-1 text-[11px] font-semibold rounded transition-colors ${
                  tipo === value
                    ? 'bg-bibelo-primary text-white'
                    : 'text-bibelo-muted hover:text-bibelo-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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
          <button
            onClick={() => { setEditandoCliente(null); setModalAberto(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-400 hover:bg-pink-500 rounded-lg text-xs text-white font-semibold transition-colors"
          >
            <UserPlus size={14} /> Novo cliente
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
          {tipo === 'cliente' && (
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
          )}

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
                    <td className="px-4 py-3">
                      {c.tipo === 'b2b'
                        ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-400">B2B</span>
                        : segmentBadge(c.segmento)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {scoreBar(c.score)}
                        <button
                          onClick={() => { setEditandoCliente(c); setModalAberto(true); }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-bibelo-muted hover:text-pink-400 hover:bg-pink-400/10 transition-all"
                          title="Editar cliente"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    </td>
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

      {modalAberto && (
        <CustomerModal
          editando={editandoCliente}
          onClose={() => { setModalAberto(false); setEditandoCliente(null); }}
          onSaved={() => {
            setModalAberto(false);
            setEditandoCliente(null);
            fetchClientes(editandoCliente ? pagination.page : 1);
            fetchStats();
          }}
        />
      )}
    </div>
  );
}
