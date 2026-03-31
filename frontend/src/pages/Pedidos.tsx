import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, ChevronLeft, ChevronRight, ShoppingCart, Download,
  ArrowUpDown, Filter, RefreshCw, Store, Globe, Package,
  DollarSign, TrendingUp, Eye, X, CreditCard, Calendar,
  User,
} from 'lucide-react';
import api from '../lib/api';
import { exportCsv } from '../lib/export';
import { formatCurrency } from '../lib/format';

interface Order {
  id: string;
  bling_id: string;
  numero: number;
  valor: number;
  status: string;
  canal: string;
  itens: Array<{ descricao?: string; produto?: string; quantidade?: number; valor?: number }> | null;
  criado_bling: string;
  customer_id: string | null;
  cliente_nome: string | null;
  cliente_email: string | null;
  formas_pagamento: string | null;
}

interface ItemDetalhado {
  descricao: string;
  sku: string | null;
  preco_venda: number;
  quantidade: number;
  desconto: number | null;
  categoria: string | null;
  imagem_url: string | null;
  custo_produto: number | null;
  custo_nf: number | null;
  preco_catalogo: number | null;
}

interface OrderDetail extends Order {
  cliente_telefone: string | null;
  cliente_canal: string | null;
  sincronizado_em: string;
  itens_detalhados: ItemDetalhado[];
  parcelas: Array<{ forma_descricao: string; valor: number; data_vencimento: string }>;
  custo_total: number;
  lucro_estimado: number;
  margem_percentual: number;
}

interface Pagination { page: number; limit: number; total: number; pages: number }

interface Stats {
  total_pedidos: number;
  receita: number;
  ticket_medio: number;
  fisico: number;
  online: number;
  variacao_pedidos: number;
  variacao_receita: number;
}

const CANAL_LABELS: Record<string, string> = {
  fisico: 'Loja Fisica',
  nuvemshop: 'NuvemShop',
  online: 'Online',
  shopee: 'Shopee',
};

const CANAL_COLORS: Record<string, string> = {
  fisico: 'bg-blue-500/15 text-blue-400',
  nuvemshop: 'bg-violet-500/15 text-violet-400',
  online: 'bg-violet-500/15 text-violet-400',
  shopee: 'bg-orange-500/15 text-orange-400',
};

const STATUS_LABELS: Record<string, string> = {
  '1': 'Ativo',
  '2': 'Cancelado',
  'order.deleted': 'Excluido',
  'desconhecido': 'Desconhecido',
};

const STATUS_COLORS: Record<string, string> = {
  '1': 'bg-emerald-500/15 text-emerald-400',
  '2': 'bg-red-500/15 text-red-400',
  'order.deleted': 'bg-red-500/15 text-red-400',
  'desconhecido': 'bg-amber-500/15 text-amber-400',
};

// Bling salva data sem hora (meia-noite UTC) — forçar leitura UTC para não mudar o dia
function fmtDate(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function fmtDateFull(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function canalBadge(canal: string) {
  const cls = CANAL_COLORS[canal] || 'bg-bibelo-border text-bibelo-muted';
  const label = CANAL_LABELS[canal] || canal;
  const Icon = canal === 'fisico' ? Store : Globe;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${cls}`}>
      <Icon size={10} /> {label}
    </span>
  );
}

function statusBadge(status: string) {
  const cls = STATUS_COLORS[status] || 'bg-bibelo-border text-bibelo-muted';
  const label = STATUS_LABELS[status] || status;
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function VariacaoBadge({ valor }: { valor: number }) {
  if (!valor) return null;
  const pos = valor > 0;
  return (
    <span className={`text-[10px] font-bold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? '+' : ''}{valor}%
    </span>
  );
}

function qtdItens(itens: Order['itens']): number {
  if (!itens || !Array.isArray(itens)) return 0;
  return itens.reduce((sum, i) => sum + (Number(i.quantidade) || 1), 0);
}

export default function Pedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 30, total: 0, pages: 0 });
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [canal, setCanal] = useState('');
  const [status, setStatus] = useState('');
  const [periodo, setPeriodo] = useState('30d');
  const [ordenar, setOrdenar] = useState('recentes');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchOrders = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, ordenar };
      if (search) params.search = search;
      if (canal) params.canal = canal;
      if (status) params.status = status;
      if (periodo) params.periodo = periodo;
      const { data } = await api.get('/orders', { params });
      setOrders(data.orders);
      setPagination(data.pagination);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [search, canal, status, periodo, ordenar]);

  const fetchStats = useCallback(async () => {
    const diasMap: Record<string, number> = { '7d': 7, '15d': 15, '30d': 30, '3m': 90, '6m': 180, '1a': 365 };
    const dias = diasMap[periodo] || 30;
    try {
      const { data } = await api.get('/orders/stats', { params: { dias } });
      setStats(data);
    } catch { /* */ }
  }, [periodo]);

  useEffect(() => { fetchOrders(1); }, [fetchOrders]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setSearch(searchInput); };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const { data } = await api.get(`/orders/${id}`);
      setDetail(data);
    } catch { /* */ }
    finally { setDetailLoading(false); }
  };

  const kpis = stats ? [
    { label: 'Pedidos', value: stats.total_pedidos, icon: ShoppingCart, color: 'text-pink-400', bg: 'bg-pink-400/10', extra: <VariacaoBadge valor={stats.variacao_pedidos} /> },
    { label: 'Receita', value: formatCurrency(stats.receita), icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-400/10', extra: <VariacaoBadge valor={stats.variacao_receita} /> },
    { label: 'Ticket Medio', value: formatCurrency(stats.ticket_medio), icon: TrendingUp, color: 'text-violet-400', bg: 'bg-violet-400/10', extra: null },
    { label: 'Loja Fisica', value: stats.fisico, icon: Store, color: 'text-blue-400', bg: 'bg-blue-400/10', extra: null },
    { label: 'Online', value: stats.online, icon: Globe, color: 'text-cyan-400', bg: 'bg-cyan-400/10', extra: null },
  ] : [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-bibelo-text">Pedidos</h1>
          <span className="text-[10px] px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full font-bold">{pagination.total}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="px-3 py-1.5 bg-bibelo-card border border-bibelo-border rounded-lg text-xs text-bibelo-text appearance-none cursor-pointer focus:outline-none focus:border-pink-400/50"
          >
            <option value="7d">7 dias</option>
            <option value="15d">15 dias</option>
            <option value="30d">30 dias</option>
            <option value="3m">3 meses</option>
            <option value="6m">6 meses</option>
            <option value="1a">1 ano</option>
            <option value="">Todos</option>
          </select>
          <button
            onClick={() => { fetchOrders(pagination.page); fetchStats(); }}
            className="p-2 text-bibelo-muted hover:text-pink-400 transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => exportCsv(orders.map((o) => ({
              numero: o.numero,
              data: fmtDate(o.criado_bling),
              cliente: o.cliente_nome || '',
              valor: o.valor,
              canal: CANAL_LABELS[o.canal] || o.canal,
              status: STATUS_LABELS[o.status] || o.status,
              itens: qtdItens(o.itens),
              pagamento: o.formas_pagamento || '',
            })), 'pedidos')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bibelo-card border border-bibelo-border rounded-lg text-xs text-bibelo-muted hover:text-bibelo-text transition-colors"
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-6 h-6 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                  <kpi.icon size={12} className={kpi.color} />
                </div>
                <span className="text-lg font-bold text-bibelo-text">{kpi.value}</span>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-bibelo-muted">{kpi.label}</p>
                {kpi.extra}
              </div>
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
            placeholder="Buscar por numero, cliente ou email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-pink-400/50 transition-colors"
          />
        </form>
        <div className="flex gap-2">
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted pointer-events-none" />
            <select
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              className="pl-9 pr-8 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text appearance-none cursor-pointer focus:outline-none focus:border-pink-400/50"
            >
              <option value="">Canal</option>
              <option value="fisico">Loja Fisica</option>
              <option value="online">Online</option>
              <option value="shopee">Shopee</option>
            </select>
          </div>
          <div className="relative">
            <Package size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted pointer-events-none" />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="pl-9 pr-8 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text appearance-none cursor-pointer focus:outline-none focus:border-pink-400/50"
            >
              <option value="">Status</option>
              <option value="ativo">Ativo</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div className="relative">
            <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted pointer-events-none" />
            <select
              value={ordenar}
              onChange={(e) => setOrdenar(e.target.value)}
              className="pl-9 pr-8 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text appearance-none cursor-pointer focus:outline-none focus:border-pink-400/50"
            >
              <option value="recentes">Mais recentes</option>
              <option value="numero">Numero</option>
              <option value="maior_valor">Maior valor</option>
              <option value="menor_valor">Menor valor</option>
            </select>
          </div>
        </div>
      </div>

      {/* Filtros ativos */}
      {(search || canal || status) && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[10px] text-bibelo-muted uppercase tracking-wider">Filtros:</span>
          {search && (
            <button onClick={() => { setSearch(''); setSearchInput(''); }} className="flex items-center gap-1 px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full text-[11px] font-medium hover:bg-pink-400/20">
              &quot;{search}&quot; &times;
            </button>
          )}
          {canal && (
            <button onClick={() => setCanal('')} className="flex items-center gap-1 px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full text-[11px] font-medium hover:bg-pink-400/20">
              {CANAL_LABELS[canal] || canal} &times;
            </button>
          )}
          {status && (
            <button onClick={() => setStatus('')} className="flex items-center gap-1 px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full text-[11px] font-medium hover:bg-pink-400/20">
              {status === 'ativo' ? 'Ativo' : 'Cancelado'} &times;
            </button>
          )}
          <button
            onClick={() => { setSearch(''); setSearchInput(''); setCanal(''); setStatus(''); }}
            className="text-[11px] text-bibelo-muted hover:text-pink-400 underline"
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
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Data</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Canal</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Itens</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Pagamento</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium w-8"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-bibelo-border/50">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-bibelo-border rounded animate-pulse w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-bibelo-muted">
                    <ShoppingCart size={32} className="mx-auto mb-2 opacity-50" />
                    <p>{search || canal || status ? 'Nenhum pedido com esses filtros' : 'Nenhum pedido encontrado'}</p>
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors group cursor-pointer" onClick={() => openDetail(o.id)}>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono font-bold text-bibelo-text">{o.numero}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        {o.customer_id ? (
                          <Link
                            to={`/clientes/${o.customer_id}`}
                            className="text-sm text-bibelo-text hover:text-pink-400 font-medium transition-colors truncate block"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {o.cliente_nome || 'Cliente'}
                          </Link>
                        ) : (
                          <span className="text-sm text-bibelo-muted">Sem cliente</span>
                        )}
                        <p className="text-[11px] text-bibelo-muted truncate sm:hidden">{fmtDate(o.criado_bling)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-bibelo-muted hidden sm:table-cell">{fmtDate(o.criado_bling)}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">{canalBadge(o.canal)}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-bibelo-muted">{qtdItens(o.itens)} {qtdItens(o.itens) === 1 ? 'item' : 'itens'}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-bibelo-muted truncate block max-w-[140px]">{o.formas_pagamento || '--'}</span>
                    </td>
                    <td className="px-4 py-3">{statusBadge(o.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-bibelo-text">{formatCurrency(o.valor)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Eye size={14} className="text-bibelo-muted group-hover:text-pink-400 transition-colors" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginacao */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-bibelo-border">
            <p className="text-xs text-bibelo-muted">
              Pagina {pagination.page} de {pagination.pages} ({pagination.total} pedidos)
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => fetchOrders(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg border border-bibelo-border text-bibelo-muted hover:text-pink-400 hover:border-pink-400/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => fetchOrders(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="p-1.5 rounded-lg border border-bibelo-border text-bibelo-muted hover:text-pink-400 hover:border-pink-400/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal detalhe */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-bibelo-card border border-bibelo-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <div className="p-8 text-center text-bibelo-muted">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                Carregando...
              </div>
            ) : detail && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-bibelo-border">
                  <div>
                    <h2 className="text-lg font-bold text-bibelo-text">Pedido #{detail.numero}</h2>
                    <p className="text-xs text-bibelo-muted">{fmtDateFull(detail.criado_bling)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(detail.status)}
                    {canalBadge(detail.canal)}
                    <button onClick={() => setDetail(null)} className="p-1 text-bibelo-muted hover:text-bibelo-text">
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Cliente */}
                {detail.customer_id && (
                  <div className="px-5 py-3 border-b border-bibelo-border/50 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-pink-400/10 flex items-center justify-center text-sm font-bold text-pink-400 shrink-0">
                      <User size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link to={`/clientes/${detail.customer_id}`} className="text-sm font-medium text-bibelo-text hover:text-pink-400" onClick={() => setDetail(null)}>
                        {detail.cliente_nome}
                      </Link>
                      <p className="text-[11px] text-bibelo-muted truncate">{detail.cliente_email || detail.cliente_telefone || ''}</p>
                    </div>
                  </div>
                )}

                {/* Itens detalhados */}
                <div className="px-5 py-4">
                  <h3 className="text-xs text-bibelo-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Package size={12} /> Itens ({detail.itens_detalhados?.length || 0})
                  </h3>
                  <div className="space-y-1">
                    {detail.itens_detalhados && detail.itens_detalhados.length > 0 ? (
                      <>
                        {/* Header */}
                        <div className="grid grid-cols-12 gap-2 text-[10px] text-bibelo-muted uppercase tracking-wider pb-2 border-b border-bibelo-border/50">
                          <span className="col-span-5">Produto</span>
                          <span className="col-span-1 text-center">Qtd</span>
                          <span className="col-span-2 text-right">Venda</span>
                          <span className="col-span-2 text-right">Custo</span>
                          <span className="col-span-2 text-right">Lucro</span>
                        </div>
                        {detail.itens_detalhados.map((item, i) => {
                          const qtd = Number(item.quantidade) || 1;
                          const venda = Number(item.preco_venda) || 0;
                          const custo = Number(item.custo_nf) || Number(item.custo_produto) || 0;
                          const lucroUnit = venda - custo;
                          const temCusto = custo > 0;
                          return (
                            <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-bibelo-border/20 last:border-0 items-center">
                              <div className="col-span-5 min-w-0">
                                <p className="text-sm text-bibelo-text truncate" title={item.descricao}>{item.descricao}</p>
                                <div className="flex items-center gap-2">
                                  {item.sku && <span className="text-[10px] text-bibelo-muted font-mono">{item.sku.length > 20 ? item.sku.slice(0, 20) + '...' : item.sku}</span>}
                                  {item.categoria && <span className="text-[10px] px-1.5 py-0.5 bg-violet-500/10 text-violet-400 rounded">{item.categoria}</span>}
                                </div>
                              </div>
                              <span className="col-span-1 text-center text-sm text-bibelo-text">{qtd}</span>
                              <span className="col-span-2 text-right text-sm font-medium text-bibelo-text">{formatCurrency(venda)}</span>
                              <span className="col-span-2 text-right text-sm text-bibelo-muted">
                                {temCusto ? formatCurrency(custo) : <span className="text-bibelo-muted/40">--</span>}
                              </span>
                              <span className={`col-span-2 text-right text-sm font-bold ${temCusto ? (lucroUnit >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-bibelo-muted/40'}`}>
                                {temCusto ? formatCurrency(lucroUnit) : '--'}
                              </span>
                            </div>
                          );
                        })}
                        {/* Resumo custo/lucro */}
                        <div className="pt-3 mt-1 border-t border-bibelo-border">
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-bibelo-border/30 rounded-lg p-2.5 text-center">
                              <p className="text-[10px] text-bibelo-muted uppercase">Receita</p>
                              <p className="text-sm font-bold text-bibelo-text">{formatCurrency(detail.valor)}</p>
                            </div>
                            <div className="bg-bibelo-border/30 rounded-lg p-2.5 text-center">
                              <p className="text-[10px] text-bibelo-muted uppercase">Custo</p>
                              <p className="text-sm font-bold text-amber-400">{detail.custo_total > 0 ? formatCurrency(detail.custo_total) : '--'}</p>
                            </div>
                            <div className="bg-bibelo-border/30 rounded-lg p-2.5 text-center">
                              <p className="text-[10px] text-bibelo-muted uppercase">Lucro</p>
                              <p className={`text-sm font-bold ${detail.lucro_estimado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {detail.custo_total > 0 ? (
                                  <>{formatCurrency(detail.lucro_estimado)} <span className="text-[10px] font-normal">({detail.margem_percentual}%)</span></>
                                ) : '--'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-bibelo-muted">Sem itens detalhados</p>
                    )}
                  </div>
                </div>

                {/* Pagamento */}
                {detail.parcelas && detail.parcelas.length > 0 && (
                  <div className="px-5 py-4 border-t border-bibelo-border/50">
                    <h3 className="text-xs text-bibelo-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <CreditCard size={12} /> Pagamento
                    </h3>
                    <div className="space-y-2">
                      {detail.parcelas.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-bibelo-text">{p.forma_descricao}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-bibelo-muted flex items-center gap-1">
                              <Calendar size={10} /> {new Date(p.data_vencimento).toLocaleDateString('pt-BR')}
                            </span>
                            <span className="font-bold text-bibelo-text">{formatCurrency(p.valor)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total */}
                <div className="px-5 py-4 border-t border-bibelo-border bg-bibelo-border/20 rounded-b-2xl flex items-center justify-between">
                  <span className="text-sm font-medium text-bibelo-muted">Total</span>
                  <span className="text-xl font-bold text-pink-400">{formatCurrency(detail.valor)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
