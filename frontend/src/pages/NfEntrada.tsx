import { useEffect, useState, useCallback } from 'react';
import {
  FileText, ChevronLeft, ChevronRight, Search,
  CheckCircle2, Clock, XCircle, X, Eye, BookCheck, Trash2,
  Package, RefreshCw,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../lib/format';

interface Nota {
  id: string;
  numero: string;
  serie: string;
  chave_acesso: string;
  fornecedor_cnpj: string;
  fornecedor_nome: string;
  fornecedor_uf: string;
  valor_produtos: string;
  valor_frete: string;
  valor_desconto: string;
  valor_total: string;
  icms_total: string;
  ipi_total: string;
  data_emissao: string;
  data_entrada: string;
  status: string;
  lancamento_id: string | null;
  xml_nome_arquivo: string;
  total_itens: number;
  observacoes: string;
}

interface NotaDetalhe extends Nota {
  itens: ItemNF[];
}

interface ItemNF {
  id: string;
  numero_item: number;
  codigo_produto: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: string;
  valor_unitario: string;
  valor_total: string;
  valor_desconto: string;
  icms_valor: string;
  ipi_valor: string;
  pis_valor: string;
  cofins_valor: string;
}

interface Resumo {
  total_notas: string;
  pendentes: string;
  contabilizadas: string;
  valor_total: string;
  valor_contabilizado: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

function fmtDate(d: string) {
  if (!d || d === 'null') return '-';
  const dateStr = d.includes('T') ? d : d + 'T12:00:00';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtCnpj(v: string) {
  if (!v || v.length !== 14) return v;
  return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; icon: any; label: string }> = {
    pendente: { bg: 'bg-amber-400/10', text: 'text-amber-400', icon: Clock, label: 'Pendente' },
    contabilizada: { bg: 'bg-emerald-400/10', text: 'text-emerald-400', icon: CheckCircle2, label: 'Contabilizada' },
    cancelada: { bg: 'bg-red-400/10', text: 'text-red-400', icon: XCircle, label: 'Cancelada' },
  };
  const c = cfg[status] || cfg.pendente;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      <Icon size={12} /> {c.label}
    </span>
  );
}

export default function NfEntrada() {
  const { success: showSuccess, error: showError } = useToast();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [loading, setLoading] = useState(true);

  // Detalhe
  const [detalhe, setDetalhe] = useState<NotaDetalhe | null>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);

  // Ações
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchResumo = useCallback(async () => {
    try {
      const { data } = await api.get('/financeiro/nf-entrada/resumo/geral');
      setResumo(data);
    } catch {}
  }, []);

  const fetchNotas = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFiltro) params.status = statusFiltro;
      const { data } = await api.get('/financeiro/nf-entrada', { params });
      setNotas(data.data);
      setPagination(data.pagination);
    } catch { setNotas([]); }
    finally { setLoading(false); }
  }, [search, statusFiltro]);

  useEffect(() => { fetchResumo(); }, [fetchResumo]);
  useEffect(() => { fetchNotas(1); }, [fetchNotas]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setSearch(searchInput); };

  // Detalhe
  const openDetalhe = async (id: string) => {
    setLoadingDetalhe(true);
    try {
      const { data } = await api.get(`/financeiro/nf-entrada/${id}`);
      setDetalhe(data);
    } catch {}
    finally { setLoadingDetalhe(false); }
  };

  // Contabilizar
  const handleContabilizar = async (id: string) => {
    setActionLoading(id);
    try {
      await api.post(`/financeiro/nf-entrada/${id}/contabilizar`);
      fetchNotas(pagination.page);
      fetchResumo();
      if (detalhe?.id === id) {
        setDetalhe(d => d ? { ...d, status: 'contabilizada' } : null);
      }
      showSuccess('NF contabilizada no financeiro');
    } catch { showError('Erro ao contabilizar'); }
    finally { setActionLoading(null); }
  };

  // Cancelar
  const handleCancelar = async (id: string) => {
    setActionLoading(id);
    try {
      await api.delete(`/financeiro/nf-entrada/${id}`);
      fetchNotas(pagination.page);
      fetchResumo();
      if (detalhe?.id === id) {
        setDetalhe(d => d ? { ...d, status: 'cancelada' } : null);
      }
      showSuccess('NF cancelada');
    } catch { showError('Erro ao cancelar'); }
    finally { setActionLoading(null); }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">NF de Entrada</h1>
          <p className="text-sm text-bibelo-muted mt-1">Sincronizado automaticamente do Bling</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-bibelo-muted">
          <RefreshCw size={14} />
          Atualiza a cada sync com o Bling
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <p className="text-xs text-bibelo-muted mb-1">Total NFs</p>
          <p className="text-xl font-bold text-bibelo-text">{resumo?.total_notas || 0}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <p className="text-xs text-bibelo-muted mb-1">Pendentes</p>
          <p className="text-xl font-bold text-amber-400">{resumo?.pendentes || 0}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <p className="text-xs text-bibelo-muted mb-1">Contabilizadas</p>
          <p className="text-xl font-bold text-emerald-400">{resumo?.contabilizadas || 0}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <p className="text-xs text-bibelo-muted mb-1">Valor Total</p>
          <p className="text-xl font-bold text-bibelo-text">{formatCurrency(resumo?.valor_total || '0')}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted" />
          <input
            type="text"
            placeholder="Buscar por fornecedor, número ou chave..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-bibelo-primary transition-colors"
          />
        </form>
        <select
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value)}
          className="bg-bibelo-card border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
        >
          <option value="">Todos os status</option>
          <option value="pendente">Pendentes</option>
          <option value="contabilizada">Contabilizadas</option>
          <option value="cancelada">Canceladas</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                <th className="px-4 py-3 font-medium">NF</th>
                <th className="px-4 py-3 font-medium">Fornecedor</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">CNPJ</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Emissão</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Itens</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-bibelo-border/50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-bibelo-border rounded animate-pulse w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : notas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-bibelo-muted">
                    <FileText size={32} className="mx-auto mb-2 opacity-50" />
                    <p>Nenhuma nota fiscal encontrada</p>
                    <p className="text-xs mt-1">As NFs aparecem automaticamente ao dar entrada no Bling</p>
                  </td>
                </tr>
              ) : (
                notas.map((n) => (
                  <tr key={n.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-bibelo-text font-medium">{n.numero || '-'}</span>
                      {n.serie && <span className="text-bibelo-muted text-xs ml-1">/{n.serie}</span>}
                    </td>
                    <td className="px-4 py-3 text-bibelo-text max-w-[200px] truncate">{n.fornecedor_nome || '-'}</td>
                    <td className="px-4 py-3 text-bibelo-muted text-xs hidden md:table-cell">{fmtCnpj(n.fornecedor_cnpj)}</td>
                    <td className="px-4 py-3 text-bibelo-muted text-xs hidden sm:table-cell">{fmtDate(n.data_emissao)}</td>
                    <td className="px-4 py-3 text-right font-medium text-bibelo-text">{formatCurrency(n.valor_total)}</td>
                    <td className="px-4 py-3 text-bibelo-muted text-center hidden sm:table-cell">{n.total_itens}</td>
                    <td className="px-4 py-3"><StatusBadge status={n.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openDetalhe(n.id)}
                          className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-primary hover:bg-bibelo-primary/10 transition-colors"
                          title="Ver detalhes"
                        >
                          <Eye size={16} />
                        </button>
                        {n.status === 'pendente' && (
                          <>
                            <button
                              onClick={() => handleContabilizar(n.id)}
                              disabled={actionLoading === n.id}
                              className="p-1.5 rounded-lg text-bibelo-muted hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors disabled:opacity-50"
                              title="Contabilizar"
                            >
                              <BookCheck size={16} />
                            </button>
                            <button
                              onClick={() => handleCancelar(n.id)}
                              disabled={actionLoading === n.id}
                              className="p-1.5 rounded-lg text-bibelo-muted hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                              title="Cancelar"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
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
              {pagination.total} NF{pagination.total !== 1 ? 's' : ''} — Página {pagination.page} de {pagination.pages}
            </p>
            <div className="flex gap-1">
              <button onClick={() => fetchNotas(pagination.page - 1)} disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 disabled:opacity-30 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => fetchNotas(pagination.page + 1)} disabled={pagination.page >= pagination.pages}
                className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 disabled:opacity-30 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Detalhe NF */}
      {detalhe && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDetalhe(null)}>
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-bibelo-border sticky top-0 bg-bibelo-card z-10">
              <div>
                <h2 className="text-lg font-bold text-bibelo-text">
                  NF {detalhe.numero || 's/n'}{detalhe.serie ? `/${detalhe.serie}` : ''}
                </h2>
                <p className="text-sm text-bibelo-muted">{detalhe.fornecedor_nome}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={detalhe.status} />
                <button onClick={() => setDetalhe(null)} className="text-bibelo-muted hover:text-bibelo-text"><X size={20} /></button>
              </div>
            </div>

            {/* Info */}
            <div className="p-5 border-b border-bibelo-border">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-bibelo-muted">CNPJ Fornecedor</p>
                  <p className="text-sm text-bibelo-text font-medium">{fmtCnpj(detalhe.fornecedor_cnpj)}</p>
                </div>
                <div>
                  <p className="text-xs text-bibelo-muted">UF</p>
                  <p className="text-sm text-bibelo-text font-medium">{detalhe.fornecedor_uf || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-bibelo-muted">Data Emissão</p>
                  <p className="text-sm text-bibelo-text font-medium">{fmtDate(detalhe.data_emissao)}</p>
                </div>
                <div>
                  <p className="text-xs text-bibelo-muted">Chave de Acesso</p>
                  <p className="text-xs text-bibelo-muted font-mono break-all">{detalhe.chave_acesso || '-'}</p>
                </div>
              </div>

              {/* Valores */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
                <div>
                  <p className="text-xs text-bibelo-muted">Produtos</p>
                  <p className="text-sm text-bibelo-text font-medium">{formatCurrency(detalhe.valor_produtos)}</p>
                </div>
                <div>
                  <p className="text-xs text-bibelo-muted">Frete</p>
                  <p className="text-sm text-bibelo-text">{formatCurrency(detalhe.valor_frete)}</p>
                </div>
                <div>
                  <p className="text-xs text-bibelo-muted">Desconto</p>
                  <p className="text-sm text-red-400">{formatCurrency(detalhe.valor_desconto)}</p>
                </div>
                <div>
                  <p className="text-xs text-bibelo-muted">ICMS</p>
                  <p className="text-sm text-bibelo-muted">{formatCurrency(detalhe.icms_total)}</p>
                </div>
                <div>
                  <p className="text-xs text-bibelo-muted">Total NF</p>
                  <p className="text-lg text-bibelo-primary font-bold">{formatCurrency(detalhe.valor_total)}</p>
                </div>
              </div>
            </div>

            {/* Itens */}
            <div className="p-5">
              <h3 className="text-sm font-medium text-bibelo-muted mb-3">
                Itens ({detalhe.itens?.length || 0})
              </h3>
              {loadingDetalhe ? (
                <div className="py-8 text-center text-bibelo-muted">Carregando...</div>
              ) : !detalhe.itens?.length ? (
                <div className="py-8 text-center text-bibelo-muted">
                  <Package size={24} className="mx-auto mb-2 opacity-50" />
                  <p>Nenhum item encontrado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                        <th className="px-3 py-2 font-medium text-xs">#</th>
                        <th className="px-3 py-2 font-medium text-xs">Produto</th>
                        <th className="px-3 py-2 font-medium text-xs hidden md:table-cell">Código</th>
                        <th className="px-3 py-2 font-medium text-xs hidden lg:table-cell">NCM</th>
                        <th className="px-3 py-2 font-medium text-xs text-right">Qtd</th>
                        <th className="px-3 py-2 font-medium text-xs text-right">Unitário</th>
                        <th className="px-3 py-2 font-medium text-xs text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhe.itens.map((item) => (
                        <tr key={item.id} className="border-b border-bibelo-border/30">
                          <td className="px-3 py-2 text-bibelo-muted text-xs">{item.numero_item}</td>
                          <td className="px-3 py-2 text-bibelo-text text-xs max-w-[250px]">
                            <div className="truncate">{item.descricao}</div>
                          </td>
                          <td className="px-3 py-2 text-bibelo-muted text-xs hidden md:table-cell">{item.codigo_produto}</td>
                          <td className="px-3 py-2 text-bibelo-muted text-xs hidden lg:table-cell">{item.ncm}</td>
                          <td className="px-3 py-2 text-right text-bibelo-text text-xs">
                            {parseFloat(item.quantidade).toLocaleString('pt-BR')} {item.unidade}
                          </td>
                          <td className="px-3 py-2 text-right text-bibelo-muted text-xs">{formatCurrency(item.valor_unitario)}</td>
                          <td className="px-3 py-2 text-right text-bibelo-text text-xs font-medium">{formatCurrency(item.valor_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-bibelo-border">
                        <td colSpan={6} className="px-3 py-2 text-right text-xs text-bibelo-muted font-medium">Total</td>
                        <td className="px-3 py-2 text-right text-sm text-bibelo-primary font-bold">{formatCurrency(detalhe.valor_total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Ações */}
            {detalhe.status === 'pendente' && (
              <div className="p-5 border-t border-bibelo-border flex gap-3">
                <button
                  onClick={() => handleContabilizar(detalhe.id)}
                  disabled={actionLoading === detalhe.id}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 rounded-lg text-sm font-medium hover:bg-emerald-400/20 transition-colors disabled:opacity-50"
                >
                  <BookCheck size={16} />
                  {actionLoading === detalhe.id ? 'Contabilizando...' : 'Contabilizar no Financeiro'}
                </button>
                <button
                  onClick={() => handleCancelar(detalhe.id)}
                  disabled={actionLoading === detalhe.id}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-red-400 border border-red-400/20 rounded-lg text-sm hover:bg-red-400/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
