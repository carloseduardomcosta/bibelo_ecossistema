/**
 * Curadoria Bling → Medusa
 * Porta de publicação: produtos vindos do Bling entram como 'pending' (draft no Medusa).
 * Carlos aprova ou rejeita antes de publicar na loja.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  ImageOff,
  DollarSign,
  Tag,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Package,
  BadgeCheck,
  Clock,
} from 'lucide-react';

// ── Tipos ──────────────────────────────────────────────────────

interface CuradoriaStats {
  pending: number;
  approved: number;
  rejected: number;
  auto: number;
  missing_image: number;
  missing_price: number;
  unmapped_category: number;
}

interface ProdutoControle {
  sku: string;
  bling_id: string | null;
  medusa_id: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'auto';
  missing_image: boolean;
  missing_price: boolean;
  unmapped_category: boolean;
  nome_original: string | null;
  categoria_bling: string | null;
  motivo: string | null;
  updated_at: string;
  preco_venda: string | null;
  tem_foto: boolean;
}

type StatusFiltro = 'todos' | 'pending' | 'approved' | 'rejected' | 'auto';

// ── Componente ─────────────────────────────────────────────────

export default function Curadoria() {
  const [stats, setStats] = useState<CuradoriaStats | null>(null);
  const [items, setItems] = useState<ProdutoControle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<StatusFiltro>('pending');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [showRejeitarModal, setShowRejeitarModal] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [toast, setToast] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);

  const LIMIT = 20;
  const totalPaginas = Math.ceil(total / LIMIT);

  // ── Fetch ──────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const r = await api.get('/api/curadoria/stats');
      setStats(r.data);
    } catch {
      /* silencioso */
    }
  }, []);

  const fetchItems = useCallback(async (p: number, status: StatusFiltro) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, limit: LIMIT };
      if (status !== 'todos') params.status = status;
      const r = await api.get('/api/curadoria/pendentes', { params });
      setItems(r.data.items);
      setTotal(r.data.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    setSelecionados(new Set());
    fetchItems(page, filtroStatus);
  }, [page, filtroStatus, fetchItems]);

  // ── Helpers ────────────────────────────────────────────────

  function showToast(tipo: 'ok' | 'erro', msg: string) {
    setToast({ tipo, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function toggleSelecionado(sku: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  function toggleTodos() {
    if (selecionados.size === items.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(items.map(i => i.sku)));
    }
  }

  async function aprovar() {
    if (selecionados.size === 0) return;
    setLoadingAction(true);
    try {
      const r = await api.post('/api/curadoria/aprovar', { skus: [...selecionados] });
      showToast('ok', `${r.data.aprovados} produto(s) aprovado(s)${r.data.erros?.length ? ` — ${r.data.erros.length} erro(s)` : ''}`);
      setSelecionados(new Set());
      fetchItems(page, filtroStatus);
      fetchStats();
    } catch {
      showToast('erro', 'Erro ao aprovar produtos');
    } finally {
      setLoadingAction(false);
    }
  }

  async function rejeitar() {
    if (selecionados.size === 0) return;
    setLoadingAction(true);
    setShowRejeitarModal(false);
    try {
      const r = await api.post('/api/curadoria/rejeitar', {
        skus: [...selecionados],
        motivo: motivoRejeicao.trim() || undefined,
      });
      showToast('ok', `${r.data.rejeitados} produto(s) rejeitado(s)`);
      setSelecionados(new Set());
      setMotivoRejeicao('');
      fetchItems(page, filtroStatus);
      fetchStats();
    } catch {
      showToast('erro', 'Erro ao rejeitar produtos');
    } finally {
      setLoadingAction(false);
    }
  }

  async function resetar() {
    if (selecionados.size === 0) return;
    setLoadingAction(true);
    try {
      const r = await api.post('/api/curadoria/reset', { skus: [...selecionados] });
      showToast('ok', `${r.data.resetados} produto(s) voltaram para pendente`);
      setSelecionados(new Set());
      fetchItems(page, filtroStatus);
      fetchStats();
    } catch {
      showToast('erro', 'Erro ao resetar produtos');
    } finally {
      setLoadingAction(false);
    }
  }

  // ── Badge de status ────────────────────────────────────────

  function StatusBadge({ status }: { status: ProdutoControle['status'] }) {
    const map = {
      pending:  { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800' },
      approved: { label: 'Aprovado', cls: 'bg-green-100 text-green-800' },
      rejected: { label: 'Rejeitado', cls: 'bg-red-100 text-red-800' },
      auto:     { label: 'Auto', cls: 'bg-blue-100 text-blue-800' },
    };
    const { label, cls } = map[status];
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
        {label}
      </span>
    );
  }

  // ── Render ─────────────────────────────────────────────────

  const abas: { key: StatusFiltro; label: string; count?: number }[] = [
    { key: 'todos',    label: 'Todos',     count: stats ? (stats.pending + stats.approved + stats.rejected + stats.auto) : undefined },
    { key: 'pending',  label: 'Pendentes', count: stats?.pending },
    { key: 'approved', label: 'Aprovados', count: stats?.approved },
    { key: 'rejected', label: 'Rejeitados', count: stats?.rejected },
    { key: 'auto',     label: 'Auto-aprovados', count: stats?.auto },
  ];

  return (
    <div className="p-6 space-y-6">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Curadoria de Produtos</h1>
          <p className="text-sm text-bibelo-muted mt-1">
            Porta de publicação Bling → Medusa. Aprove os produtos antes de exibir na loja.
          </p>
        </div>
        <button
          onClick={() => { fetchItems(page, filtroStatus); fetchStats(); }}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-bibelo-border hover:bg-bibelo-bg transition-colors"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-bibelo-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={14} className="text-yellow-500" />
              <span className="text-xs text-bibelo-muted">Pendentes</span>
            </div>
            <p className="text-2xl font-bold text-bibelo-text">{stats.pending}</p>
          </div>
          <div className="bg-white rounded-xl border border-bibelo-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <BadgeCheck size={14} className="text-green-500" />
              <span className="text-xs text-bibelo-muted">Aprovados</span>
            </div>
            <p className="text-2xl font-bold text-bibelo-text">{stats.approved + stats.auto}</p>
          </div>
          <div className="bg-white rounded-xl border border-bibelo-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle size={14} className="text-red-500" />
              <span className="text-xs text-bibelo-muted">Rejeitados</span>
            </div>
            <p className="text-2xl font-bold text-bibelo-text">{stats.rejected}</p>
          </div>
          <div className="bg-white rounded-xl border border-bibelo-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={14} className="text-orange-500" />
              <span className="text-xs text-bibelo-muted">Flags</span>
            </div>
            <div className="flex gap-3 mt-1">
              <span className="flex items-center gap-1 text-xs text-bibelo-muted">
                <ImageOff size={11} /> {stats.missing_image}
              </span>
              <span className="flex items-center gap-1 text-xs text-bibelo-muted">
                <DollarSign size={11} /> {stats.missing_price}
              </span>
              <span className="flex items-center gap-1 text-xs text-bibelo-muted">
                <Tag size={11} /> {stats.unmapped_category}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Filtros / abas ── */}
      <div className="flex items-center gap-1 border-b border-bibelo-border">
        {abas.map(a => (
          <button
            key={a.key}
            onClick={() => { setFiltroStatus(a.key); setPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filtroStatus === a.key
                ? 'border-bibelo-primary text-bibelo-primary'
                : 'border-transparent text-bibelo-muted hover:text-bibelo-text'
            }`}
          >
            {a.label}
            {a.count !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-normal ${
                filtroStatus === a.key ? 'bg-bibelo-primary/10' : 'bg-bibelo-bg'
              }`}>
                {a.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Barra de ações em lote ── */}
      {selecionados.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-bibelo-primary/5 border border-bibelo-primary/20 rounded-xl">
          <span className="text-sm font-medium text-bibelo-text">
            {selecionados.size} selecionado(s)
          </span>
          <div className="flex-1" />
          <button
            onClick={aprovar}
            disabled={loadingAction}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={14} /> Aprovar
          </button>
          <button
            onClick={() => setShowRejeitarModal(true)}
            disabled={loadingAction}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <XCircle size={14} /> Rejeitar
          </button>
          <button
            onClick={resetar}
            disabled={loadingAction}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-bibelo-border hover:bg-bibelo-bg text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <RotateCcw size={14} /> Resetar
          </button>
          {loadingAction && <Loader2 size={14} className="animate-spin text-bibelo-muted" />}
        </div>
      )}

      {/* ── Tabela ── */}
      <div className="bg-white rounded-xl border border-bibelo-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={24} className="animate-spin text-bibelo-muted" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-bibelo-muted gap-2">
            <Package size={32} className="opacity-40" />
            <p className="text-sm">Nenhum produto neste filtro</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bibelo-border bg-bibelo-bg">
                  <th className="px-4 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={selecionados.size === items.length && items.length > 0}
                      onChange={toggleTodos}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-bibelo-muted">Produto</th>
                  <th className="px-4 py-3 text-left font-medium text-bibelo-muted">SKU</th>
                  <th className="px-4 py-3 text-left font-medium text-bibelo-muted">Categoria</th>
                  <th className="px-4 py-3 text-right font-medium text-bibelo-muted">Preço</th>
                  <th className="px-4 py-3 text-center font-medium text-bibelo-muted">Flags</th>
                  <th className="px-4 py-3 text-center font-medium text-bibelo-muted">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-bibelo-muted">Motivo</th>
                  <th className="px-4 py-3 text-center font-medium text-bibelo-muted">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bibelo-border">
                {items.map(item => (
                  <tr
                    key={item.sku}
                    className={`hover:bg-bibelo-bg/50 transition-colors ${selecionados.has(item.sku) ? 'bg-bibelo-primary/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selecionados.has(item.sku)}
                        onChange={() => toggleSelecionado(item.sku)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-bibelo-text max-w-[220px] truncate" title={item.nome_original ?? ''}>
                        {item.nome_original ?? '—'}
                      </div>
                      {item.medusa_id && (
                        <div className="text-xs text-bibelo-muted truncate">
                          Medusa: {item.medusa_id.slice(0, 12)}…
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-bibelo-bg px-2 py-1 rounded">{item.sku}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-bibelo-muted text-xs">{item.categoria_bling ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.preco_venda
                        ? <span className="font-medium">R$ {Number(item.preco_venda).toFixed(2).replace('.', ',')}</span>
                        : <span className="text-red-400 text-xs">Sem preço</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {item.missing_image && (
                          <span title="Sem foto" className="text-orange-400"><ImageOff size={13} /></span>
                        )}
                        {item.missing_price && (
                          <span title="Sem preço" className="text-red-400"><DollarSign size={13} /></span>
                        )}
                        {item.unmapped_category && (
                          <span title="Categoria não mapeada" className="text-yellow-500"><Tag size={13} /></span>
                        )}
                        {!item.missing_image && !item.missing_price && !item.unmapped_category && (
                          <span className="text-green-400"><CheckCircle2 size={13} /></span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-bibelo-muted max-w-[160px] truncate block" title={item.motivo ?? ''}>
                        {item.motivo ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {item.status !== 'approved' && item.status !== 'auto' && (
                          <button
                            onClick={() => { setSelecionados(new Set([item.sku])); aprovar(); }}
                            title="Aprovar"
                            className="p-1 hover:text-green-600 text-bibelo-muted transition-colors"
                          >
                            <CheckCircle2 size={15} />
                          </button>
                        )}
                        {item.status !== 'rejected' && (
                          <button
                            onClick={() => { setSelecionados(new Set([item.sku])); setShowRejeitarModal(true); }}
                            title="Rejeitar"
                            className="p-1 hover:text-red-600 text-bibelo-muted transition-colors"
                          >
                            <XCircle size={15} />
                          </button>
                        )}
                        {item.status !== 'pending' && (
                          <button
                            onClick={() => { setSelecionados(new Set([item.sku])); resetar(); }}
                            title="Voltar para pendente"
                            className="p-1 hover:text-bibelo-primary text-bibelo-muted transition-colors"
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Paginação ── */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm text-bibelo-muted">
          <span>{total} produto(s) — página {page} de {totalPaginas}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 border border-bibelo-border rounded-lg disabled:opacity-40 hover:bg-bibelo-bg transition-colors"
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPaginas, p + 1))}
              disabled={page === totalPaginas}
              className="flex items-center gap-1 px-3 py-1.5 border border-bibelo-border rounded-lg disabled:opacity-40 hover:bg-bibelo-bg transition-colors"
            >
              Próxima <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Modal rejeição ── */}
      {showRejeitarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-bibelo-text mb-1">Rejeitar produto(s)</h3>
            <p className="text-sm text-bibelo-muted mb-4">
              {selecionados.size} produto(s) serão rejeitados e ficarão como draft no Medusa.
            </p>
            <label className="block text-sm font-medium text-bibelo-text mb-1">
              Motivo (opcional)
            </label>
            <textarea
              value={motivoRejeicao}
              onChange={e => setMotivoRejeicao(e.target.value)}
              placeholder="Ex: Sem foto, preço desatualizado, fora de linha..."
              className="w-full border border-bibelo-border rounded-xl p-3 text-sm h-24 resize-none focus:outline-none focus:border-bibelo-primary"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowRejeitarModal(false); setMotivoRejeicao(''); setSelecionados(new Set()); }}
                className="flex-1 px-4 py-2 border border-bibelo-border rounded-xl text-sm hover:bg-bibelo-bg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={rejeitar}
                disabled={loadingAction}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loadingAction ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Rejeitar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white z-50 ${
          toast.tipo === 'ok' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.tipo === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
