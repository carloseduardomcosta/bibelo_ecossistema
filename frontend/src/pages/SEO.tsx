import { useEffect, useState, useCallback } from 'react';
import {
  Search, Globe, Wand2, Send, CheckCircle2, AlertTriangle,
  ChevronLeft, ChevronRight, Loader2, Check, X, Eye,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';

interface Product {
  ns_id: string;
  nome: string;
  sku: string | null;
  preco: number;
  imagem: string | null;
  publicado: boolean;
  seo_title: string;
  seo_description: string;
  handle: string;
  descricao: string;
  categorias: string[];
  tem_seo: boolean;
}

interface Resumo {
  total: number;
  com_seo: number;
  sem_seo: number;
}

interface EditState {
  seo_title: string;
  seo_description: string;
}

export default function SEO() {
  const { success: showSuccess, error: showError } = useToast();
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [resumo, setResumo] = useState<Resumo>({ total: 0, com_seo: 0, sem_seo: 0 });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'com_seo' | 'sem_seo'>('todos');
  const [loading, setLoading] = useState(true);

  // Edição inline
  const [editando, setEditando] = useState<Record<string, EditState>>({});
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Envio
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState({ enviados: 0, total: 0, falhas: 0 });
  const [gerando, setGerando] = useState(false);

  // Preview
  const [previewId, setPreviewId] = useState<string | null>(null);

  const fetchProdutos = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, limit: 50, status: statusFilter };
      if (search) params.search = search;
      const { data } = await api.get('/seo/products', { params });
      setProdutos(data.data);
      setResumo(data.resumo);
      setPage(data.pagination.page);
      setPages(data.pagination.pages);
      setTotal(data.pagination.total);
    } catch {
      showError('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { fetchProdutos(1); }, [fetchProdutos]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  // ── Edição inline ──

  const startEdit = (p: Product) => {
    setEditando(prev => ({
      ...prev,
      [p.ns_id]: {
        seo_title: prev[p.ns_id]?.seo_title ?? p.seo_title,
        seo_description: prev[p.ns_id]?.seo_description ?? p.seo_description,
      },
    }));
  };

  const cancelEdit = (nsId: string) => {
    setEditando(prev => {
      const copy = { ...prev };
      delete copy[nsId];
      return copy;
    });
  };

  const updateField = (nsId: string, field: 'seo_title' | 'seo_description', value: string) => {
    setEditando(prev => ({
      ...prev,
      [nsId]: { ...prev[nsId], [field]: value },
    }));
  };

  // ── Seleção ──

  const toggleSelect = (nsId: string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(nsId)) next.delete(nsId);
      else next.add(nsId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selecionados.size === produtos.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(produtos.map(p => p.ns_id)));
    }
  };

  // ── Gerar SEO automático ──

  const gerarSEO = async () => {
    const ids = selecionados.size > 0
      ? [...selecionados]
      : produtos.map(p => p.ns_id);

    if (ids.length === 0) return;

    setGerando(true);
    try {
      const { data } = await api.post('/seo/products/generate', { ns_ids: ids });
      const sugestoes = data.data as Array<{ ns_id: string; seo_title: string; seo_description: string }>;

      const novoEditando: Record<string, EditState> = { ...editando };
      for (const s of sugestoes) {
        novoEditando[s.ns_id] = {
          seo_title: s.seo_title,
          seo_description: s.seo_description,
        };
      }
      setEditando(novoEditando);
      showSuccess(`SEO gerado para ${sugestoes.length} produtos — revise e envie`);
    } catch {
      showError('Erro ao gerar SEO');
    } finally {
      setGerando(false);
    }
  };

  // ── Enviar para NuvemShop ──

  const enviarSEO = async () => {
    // Pega os que estão editados
    const paraEnviar = Object.entries(editando)
      .filter(([, v]) => v.seo_title.trim() || v.seo_description.trim())
      .map(([ns_id, v]) => ({ ns_id, seo_title: v.seo_title, seo_description: v.seo_description }));

    if (paraEnviar.length === 0) {
      showError('Nenhum produto com SEO editado para enviar');
      return;
    }

    setEnviando(true);
    setProgresso({ enviados: 0, total: paraEnviar.length, falhas: 0 });

    // Envia em lotes de 10 para dar feedback visual
    const loteSize = 10;
    let totalEnviados = 0;
    let totalFalhas = 0;

    for (let i = 0; i < paraEnviar.length; i += loteSize) {
      const lote = paraEnviar.slice(i, i + loteSize);
      try {
        const { data } = await api.post('/seo/products/bulk-update', { produtos: lote });
        totalEnviados += data.sucesso;
        totalFalhas += data.falhas;
      } catch {
        totalFalhas += lote.length;
      }
      setProgresso({ enviados: totalEnviados, total: paraEnviar.length, falhas: totalFalhas });
    }

    if (totalFalhas === 0) {
      showSuccess(`SEO atualizado em ${totalEnviados} produtos na NuvemShop!`);
      setEditando({});
      setSelecionados(new Set());
      fetchProdutos(page);
    } else {
      showError(`${totalEnviados} atualizados, ${totalFalhas} falhas`);
      fetchProdutos(page);
    }

    setEnviando(false);
  };

  // ── Helpers ──

  const getEditOrCurrent = (p: Product): EditState => {
    return editando[p.ns_id] || { seo_title: p.seo_title, seo_description: p.seo_description };
  };

  const isEdited = (p: Product): boolean => {
    const e = editando[p.ns_id];
    if (!e) return false;
    return e.seo_title !== p.seo_title || e.seo_description !== p.seo_description;
  };

  const editadosCount = Object.keys(editando).filter(nsId => {
    const prod = produtos.find(p => p.ns_id === nsId);
    return prod && isEdited(prod);
  }).length;

  const pctSeo = resumo.total > 0 ? Math.round((resumo.com_seo / resumo.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text flex items-center gap-2">
            <Globe size={24} className="text-bibelo-primary" />
            SEO dos Produtos
          </h1>
          <p className="text-sm text-bibelo-muted mt-1">
            Gerencie title e description de SEO dos produtos na NuvemShop
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <p className="text-xs text-bibelo-muted uppercase tracking-wider">Total Produtos</p>
          <p className="text-2xl font-bold text-bibelo-text mt-1">{resumo.total}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <p className="text-xs text-bibelo-muted uppercase tracking-wider">Com SEO</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{resumo.com_seo}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <p className="text-xs text-bibelo-muted uppercase tracking-wider">Sem SEO</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{resumo.sem_seo}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <p className="text-xs text-bibelo-muted uppercase tracking-wider">Cobertura</p>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-2xl font-bold text-bibelo-text">{pctSeo}%</p>
            <div className="flex-1 h-2 bg-bibelo-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pctSeo}%`,
                  backgroundColor: pctSeo === 100 ? '#34d399' : pctSeo > 50 ? '#fbbf24' : '#f87171',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Busca */}
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Buscar produto..."
                className="w-full pl-9 pr-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-bibelo-primary"
              />
            </div>
          </form>

          {/* Filtro status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
          >
            <option value="todos">Todos</option>
            <option value="sem_seo">Sem SEO</option>
            <option value="com_seo">Com SEO</option>
          </select>

          {/* Gerar SEO */}
          <button
            onClick={gerarSEO}
            disabled={gerando || enviando}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-sm font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-50"
          >
            {gerando ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {gerando ? 'Gerando...' : `Gerar SEO${selecionados.size > 0 ? ` (${selecionados.size})` : ' (todos)'}`}
          </button>

          {/* Enviar para NuvemShop */}
          {editadosCount > 0 && (
            <button
              onClick={enviarSEO}
              disabled={enviando}
              className="flex items-center gap-2 px-4 py-2 bg-bibelo-primary/20 text-bibelo-primary border border-bibelo-primary/30 rounded-lg text-sm font-medium hover:bg-bibelo-primary/30 transition-colors disabled:opacity-50"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {enviando
                ? `Enviando ${progresso.enviados}/${progresso.total}...`
                : `Enviar ${editadosCount} para NuvemShop`
              }
            </button>
          )}
        </div>

        {/* Barra de progresso durante envio */}
        {enviando && progresso.total > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-bibelo-muted mb-1">
              <span>Enviando para NuvemShop...</span>
              <span>{progresso.enviados}/{progresso.total} {progresso.falhas > 0 && `(${progresso.falhas} falhas)`}</span>
            </div>
            <div className="h-2 bg-bibelo-border rounded-full overflow-hidden">
              <div
                className="h-full bg-bibelo-primary rounded-full transition-all"
                style={{ width: `${Math.round(((progresso.enviados + progresso.falhas) / progresso.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-bibelo-primary" />
          </div>
        ) : produtos.length === 0 ? (
          <div className="text-center py-16 text-bibelo-muted">Nenhum produto encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-bibelo-border">
                  <th className="px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selecionados.size === produtos.length && produtos.length > 0}
                      onChange={toggleSelectAll}
                      className="accent-bibelo-primary"
                    />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-bibelo-muted uppercase tracking-wider">Produto</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-bibelo-muted uppercase tracking-wider">SEO Title</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-bibelo-muted uppercase tracking-wider">SEO Description</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-bibelo-muted uppercase tracking-wider w-20">Status</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-bibelo-muted uppercase tracking-wider w-24">Ações</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map(p => {
                  const edit = getEditOrCurrent(p);
                  const isEd = isEdited(p);
                  const isEditMode = !!editando[p.ns_id];
                  const isPreviewing = previewId === p.ns_id;

                  return (
                    <tr
                      key={p.ns_id}
                      className={`border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors ${isEd ? 'bg-amber-500/5' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selecionados.has(p.ns_id)}
                          onChange={() => toggleSelect(p.ns_id)}
                          className="accent-bibelo-primary"
                        />
                      </td>

                      {/* Produto */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3 min-w-[200px]">
                          {p.imagem ? (
                            <img src={p.imagem} alt={p.nome} className="w-10 h-10 rounded-lg object-cover bg-bibelo-border shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-bibelo-border flex items-center justify-center shrink-0">
                              <Globe size={16} className="text-bibelo-muted" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-bibelo-text truncate max-w-[220px]">{p.nome}</p>
                            {p.sku && <p className="text-xs text-bibelo-muted">{p.sku}</p>}
                          </div>
                        </div>
                      </td>

                      {/* SEO Title */}
                      <td className="px-3 py-3">
                        {isEditMode ? (
                          <div>
                            <input
                              type="text"
                              value={edit.seo_title}
                              onChange={e => updateField(p.ns_id, 'seo_title', e.target.value)}
                              maxLength={70}
                              placeholder="Title para Google..."
                              className="w-full px-2 py-1.5 bg-bibelo-bg border border-bibelo-border rounded text-sm text-bibelo-text placeholder:text-bibelo-muted/40 focus:outline-none focus:border-bibelo-primary"
                            />
                            <span className={`text-[10px] ${edit.seo_title.length > 60 ? 'text-amber-400' : 'text-bibelo-muted/50'}`}>
                              {edit.seo_title.length}/60
                            </span>
                          </div>
                        ) : (
                          <p className={`text-sm truncate max-w-[250px] ${p.seo_title ? 'text-bibelo-text' : 'text-bibelo-muted/40 italic'}`}>
                            {p.seo_title || 'Sem title'}
                          </p>
                        )}
                      </td>

                      {/* SEO Description */}
                      <td className="px-3 py-3">
                        {isEditMode ? (
                          <div>
                            <textarea
                              value={edit.seo_description}
                              onChange={e => updateField(p.ns_id, 'seo_description', e.target.value)}
                              maxLength={320}
                              rows={2}
                              placeholder="Meta description para Google..."
                              className="w-full px-2 py-1.5 bg-bibelo-bg border border-bibelo-border rounded text-sm text-bibelo-text placeholder:text-bibelo-muted/40 focus:outline-none focus:border-bibelo-primary resize-none"
                            />
                            <span className={`text-[10px] ${edit.seo_description.length > 160 ? 'text-amber-400' : 'text-bibelo-muted/50'}`}>
                              {edit.seo_description.length}/160
                            </span>
                          </div>
                        ) : (
                          <p className={`text-sm truncate max-w-[300px] ${p.seo_description ? 'text-bibelo-text' : 'text-bibelo-muted/40 italic'}`}>
                            {p.seo_description || 'Sem description'}
                          </p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 text-center">
                        {isEd ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 font-medium">
                            Editado
                          </span>
                        ) : p.tem_seo ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                            <CheckCircle2 size={12} />
                            OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-400 font-medium">
                            <AlertTriangle size={12} />
                            Falta
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {isEditMode ? (
                            <>
                              <button
                                onClick={() => setPreviewId(isPreviewing ? null : p.ns_id)}
                                className="p-1.5 rounded text-blue-400 hover:bg-blue-400/10 transition-colors"
                                title="Preview Google"
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                onClick={() => cancelEdit(p.ns_id)}
                                className="p-1.5 rounded text-bibelo-muted hover:bg-bibelo-border/50 transition-colors"
                                title="Cancelar"
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => startEdit(p)}
                              className="px-2 py-1 text-xs text-bibelo-primary hover:bg-bibelo-primary/10 rounded transition-colors"
                            >
                              Editar
                            </button>
                          )}
                        </div>

                        {/* Preview Google */}
                        {isPreviewing && isEditMode && (
                          <div className="mt-2 p-3 bg-white rounded-lg border border-gray-200 text-left max-w-[350px]">
                            <p className="text-xs text-gray-500 mb-0.5">papelariabibelo.com.br &rsaquo; {p.handle || 'produto'}</p>
                            <p className="text-[#1a0dab] text-sm font-medium leading-tight hover:underline cursor-default">
                              {edit.seo_title || p.nome}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                              {edit.seo_description || 'Sem description definida'}
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-bibelo-border">
            <span className="text-xs text-bibelo-muted">{total} produtos</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchProdutos(page - 1)}
                disabled={page <= 1}
                className="p-1 rounded text-bibelo-muted hover:text-bibelo-text disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-bibelo-text">{page}/{pages}</span>
              <button
                onClick={() => fetchProdutos(page + 1)}
                disabled={page >= pages}
                className="p-1 rounded text-bibelo-muted hover:text-bibelo-text disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dicas */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
        <h3 className="text-sm font-bold text-bibelo-text mb-2">Dicas de SEO</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-bibelo-muted">
          <div className="flex items-start gap-2">
            <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
            <span><strong>Title:</strong> max 60 caracteres. Formato ideal: "Nome do Produto | Papelaria Bibelo"</span>
          </div>
          <div className="flex items-start gap-2">
            <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
            <span><strong>Description:</strong> max 160 caracteres. Inclua beneficios e CTA</span>
          </div>
          <div className="flex items-start gap-2">
            <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
            <span><strong>Fluxo:</strong> Selecione produtos &rarr; "Gerar SEO" &rarr; revise &rarr; "Enviar para NuvemShop"</span>
          </div>
          <div className="flex items-start gap-2">
            <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
            <span><strong>Rate limit:</strong> NuvemShop permite ~2 req/s. 118 produtos levam ~1 min</span>
          </div>
        </div>
      </div>
    </div>
  );
}
