import React, { useState, useEffect, useCallback } from 'react';
import {
  Package, RefreshCw, Play, StopCircle, CheckCircle, Clock,
  Tag, BarChart2, AlertCircle, ChevronDown, ChevronUp,
  Search, Percent, Edit2, Check, X, Camera,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../lib/format';

// ── Tipos ────────────────────────────────────────────────────
interface Stats {
  total: number;
  rascunho: number;
  aprovado: number;
  pausado: number;
  categorias: number;
  ultima_sync: string | null;
  ultimo_status: string | null;
}

interface MarkupCategoria {
  categoria: string;
  markup: number;
  atualizado_em: string;
}

interface ProdutoCatalogo {
  id: string;
  item_id: string;
  nome: string;
  categoria: string | null;
  slug_categoria: string | null;
  preco_custo: number;
  imagem_url: string | null;
  status: 'rascunho' | 'aprovado' | 'pausado';
  markup_override: number | null;
  criado_em: string;
  atualizado_em: string;
}

interface ProdutosPaginados {
  produtos: ProdutoCatalogo[];
  total: number;
  pagina: number;
  total_paginas: number;
}

interface PorCategoria {
  categoria: string;
  total: number;
  rascunho: number;
  aprovado: number;
}

interface ScraperStatus {
  running: boolean;
  categorias_feitas: number;
  total_categorias: number;
  produtos_salvos: number;
  produtos_atualizados: number;
  erros: number;
  categoria_atual: string | null;
  iniciado_em: string | null;
}

interface SyncLog {
  id: string;
  iniciado_em: string;
  concluido_em: string | null;
  status: string;
  produtos_salvos: number;
  produtos_atualizados: number;
  categorias_processadas: number;
  total_categorias: number;
  erros: number;
}

interface EnrichState {
  running: boolean;
  fase: 'idle' | 'imagens' | 'descricoes' | 'concluido' | 'erro';
  total: number;
  feitos: number;
  com_imagem: number;
  com_descricao: number;
  erros: number;
  iniciado_em: string | null;
  mensagem: string;
}

// ── Helpers ──────────────────────────────────────────────────
function calcPrecoVenda(custo: number, markup: number): number {
  return custo * markup;
}

function statusColor(status: string) {
  if (status === 'aprovado') return 'bg-green-100 text-green-800';
  if (status === 'pausado')  return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-600';
}

function statusLabel(status: string) {
  if (status === 'aprovado') return 'Aprovado';
  if (status === 'pausado')  return 'Pausado';
  return 'Rascunho';
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Componente principal ─────────────────────────────────────
export default function FornecedorCatalogo() {
  const toast = useToast();

  const [tab, setTab]                 = useState<'curadoria' | 'markups' | 'historico'>('curadoria');
  const [stats, setStats]             = useState<Stats | null>(null);
  const [scraper, setScraper]         = useState<ScraperStatus | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [enrich, setEnrich]           = useState<EnrichState | null>(null);

  // ── Polling do scraper enquanto running ──────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get<ScraperStatus>('/fornecedor-catalogo/scraper/status');
      setScraper(data);
    } catch {
      // silencia
    }
  }, []);

  const fetchEnrichStatus = useCallback(async () => {
    try {
      const { data } = await api.get<EnrichState>('/fornecedor-catalogo/scraper/enriquecer/status');
      setEnrich(data);
    } catch {
      // silencia
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get<Stats>('/fornecedor-catalogo/stats');
      setStats(data);
    } catch {
      toast.error('Erro ao carregar estatísticas');
    } finally {
      setLoadingStats(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStats();
    fetchStatus();
    fetchEnrichStatus();
  }, [fetchStats, fetchStatus, fetchEnrichStatus]);

  useEffect(() => {
    if (!scraper?.running) return;
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [scraper?.running, fetchStatus]);

  useEffect(() => {
    if (!enrich?.running) return;
    const id = setInterval(fetchEnrichStatus, 3000);
    return () => clearInterval(id);
  }, [enrich?.running, fetchEnrichStatus]);

  // ── Controle do scraper ──────────────────────────────────
  async function iniciarScraper(retomar = false) {
    try {
      await api.post('/fornecedor-catalogo/scraper/iniciar', { retomar });
      toast.success(retomar ? 'Retomando — categorias já importadas serão puladas' : 'Importando catálogo JC Atacado do zero');
      await fetchStatus();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao iniciar scraper');
    }
  }

  async function pararScraper() {
    try {
      await api.post('/fornecedor-catalogo/scraper/parar');
      toast.success('Scraper interrompido');
      await fetchStatus();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao parar scraper');
    }
  }

  // ── Controle do enriquecimento ───────────────────────────
  async function iniciarEnriquecimento() {
    try {
      await api.post('/fornecedor-catalogo/scraper/enriquecer');
      toast.success('Enriquecimento iniciado — buscando fotos e descrições');
      await fetchEnrichStatus();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao iniciar enriquecimento');
    }
  }

  async function pararEnriquecimento() {
    try {
      await api.post('/fornecedor-catalogo/scraper/enriquecer/parar');
      toast.success('Enriquecimento interrompido');
      await fetchEnrichStatus();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao parar enriquecimento');
    }
  }

  const enrichPct =
    enrich && enrich.total > 0
      ? Math.round((enrich.feitos / enrich.total) * 100)
      : 0;

  const enrichFaseLabel =
    enrich?.fase === 'imagens'   ? 'Fase 1: Imagens' :
    enrich?.fase === 'descricoes' ? 'Fase 2: Descrições' :
    enrich?.fase === 'concluido' ? 'Concluído' :
    enrich?.fase === 'erro'      ? 'Erro' : '';

  const progressoPct =
    scraper && scraper.total_categorias > 0
      ? Math.round((scraper.categorias_feitas / scraper.total_categorias) * 100)
      : 0;

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Catálogo Fornecedor</h1>
          <p className="text-sm text-gray-500 mt-0.5">JC Atacado — curadoria e markups</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Botões de enriquecimento */}
          {enrich?.running ? (
            <button
              onClick={pararEnriquecimento}
              className="flex items-center gap-2 px-4 py-2 bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 text-sm font-medium"
            >
              <StopCircle className="w-4 h-4" /> Parar enriquecimento
            </button>
          ) : (
            <button
              onClick={iniciarEnriquecimento}
              disabled={scraper?.running}
              className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ backgroundColor: scraper?.running ? '#d1d5db' : '#fe68c4' }}
              title={scraper?.running ? 'Aguarde o fim da importação' : 'Busca fotos e descrições dos produtos'}
            >
              <Camera className="w-4 h-4" /> Enriquecer fotos e descrições
            </button>
          )}

          {/* Botões de importação */}
          {scraper?.running ? (
            <button
              onClick={pararScraper}
              className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium"
            >
              <StopCircle className="w-4 h-4" /> Parar importação
            </button>
          ) : (
            <div className="flex gap-2">
              {stats && stats.total > 0 && (
                <button
                  onClick={() => iniciarScraper(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  title="Pula categorias que já foram importadas"
                >
                  <Play className="w-4 h-4" /> Retomar
                </button>
              )}
              <button
                onClick={() => iniciarScraper(false)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
                title="Reimporta tudo do zero"
              >
                <Play className="w-4 h-4" /> Importar tudo
              </button>
            </div>
          )}
          <button
            onClick={() => { fetchStats(); fetchStatus(); fetchEnrichStatus(); }}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barra de progresso do scraper */}
      {scraper?.running && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-blue-800 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Importando catálogo…
              {scraper.categoria_atual && (
                <span className="text-blue-600 font-normal">— {scraper.categoria_atual}</span>
              )}
            </span>
            <span className="text-blue-700 font-semibold">{progressoPct}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressoPct}%` }}
            />
          </div>
          <div className="flex gap-6 text-xs text-blue-700">
            <span>{scraper.categorias_feitas}/{scraper.total_categorias} categorias</span>
            <span>{scraper.produtos_salvos} novos</span>
            <span>{scraper.produtos_atualizados} atualizados</span>
            {scraper.erros > 0 && <span className="text-red-600">{scraper.erros} erros</span>}
          </div>
        </div>
      )}

      {/* Barra de progresso do enriquecimento */}
      {enrich?.running && (
        <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-pink-800 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" style={{ color: '#fe68c4' }} />
              {enrichFaseLabel && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700">{enrichFaseLabel}</span>}
              <span className="text-pink-700 font-normal">{enrich.mensagem}</span>
            </span>
            <span className="font-semibold" style={{ color: '#fe68c4' }}>{enrichPct}%</span>
          </div>
          <div className="w-full bg-pink-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${enrichPct}%`, backgroundColor: '#fe68c4' }}
            />
          </div>
          <div className="flex gap-6 text-xs text-pink-700">
            <span>{enrich.feitos}/{enrich.total} produtos</span>
            <span>{enrich.com_imagem} com foto</span>
            <span>{enrich.com_descricao} com descrição</span>
            {enrich.erros > 0 && <span className="text-red-600">{enrich.erros} erros</span>}
          </div>
        </div>
      )}

      {/* Status do enriquecimento (idle/concluído) */}
      {enrich && !enrich.running && enrich.fase !== 'idle' && (
        <div className={`rounded-xl p-3 border flex items-center gap-3 text-sm ${
          enrich.fase === 'concluido'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {enrich.fase === 'concluido'
            ? <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          }
          <span>
            {enrich.fase === 'concluido'
              ? `✓ ${enrich.com_imagem} fotos, ${enrich.com_descricao} descrições capturadas`
              : `Enriquecimento encerrado com erro: ${enrich.mensagem}`
            }
          </span>
        </div>
      )}

      {/* Stats inline de enriquecimento quando idle e há dados */}
      {enrich && !enrich.running && enrich.fase === 'idle' && (enrich.com_imagem > 0 || enrich.com_descricao > 0) && (
        <div className="flex items-center gap-4 text-xs text-gray-500 px-1">
          <Camera className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#fe68c4' }} />
          <span>
            <span className="font-semibold text-gray-700">{enrich.com_imagem}</span> produto{enrich.com_imagem !== 1 ? 's' : ''} com foto
          </span>
          <span>·</span>
          <span>
            <span className="font-semibold text-gray-700">{enrich.total - enrich.com_imagem}</span> sem foto
          </span>
        </div>
      )}

      {/* Stats cards */}
      {loadingStats ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon={<Package className="w-5 h-5 text-gray-500" />} label="Total" value={stats.total} />
          <StatCard icon={<Clock className="w-5 h-5 text-yellow-500" />} label="Rascunho" value={stats.rascunho} />
          <StatCard icon={<CheckCircle className="w-5 h-5 text-green-500" />} label="Aprovados" value={stats.aprovado} />
          <StatCard icon={<Tag className="w-5 h-5 text-pink-500" />} label="Categorias" value={stats.categorias} />
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Última sync</p>
            <p className="text-sm font-medium text-gray-800 leading-tight">{fmtDate(stats.ultima_sync)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {([['curadoria', 'Curadoria'], ['markups', 'Markups'], ['historico', 'Histórico']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-pink-600 text-pink-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Conteúdo das tabs */}
      {tab === 'curadoria' && <TabCuradoria onStatsChange={fetchStats} />}
      {tab === 'markups'   && <TabMarkups />}
      {tab === 'historico' && <TabHistorico />}
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────
function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString('pt-BR')}</p>
    </div>
  );
}

// ── Tab Curadoria ────────────────────────────────────────────
function TabCuradoria({ onStatsChange }: { onStatsChange: () => void }) {
  const toast = useToast();

  const [categorias, setCategorias]   = useState<PorCategoria[]>([]);
  const [markupMap, setMarkupMap]     = useState<Record<string, number>>({});
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [produtos, setProdutos]       = useState<ProdutoCatalogo[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingProds, setLoadingProds] = useState(false);
  const [aprovando, setAprovando]     = useState<string | null>(null);

  const [search, setSearch]       = useState('');
  const [filterStatus, setFilter] = useState<'todos' | 'rascunho' | 'aprovado'>('todos');

  const fetchCategorias = useCallback(async () => {
    try {
      const { data } = await api.get<PorCategoria[]>('/fornecedor-catalogo/produtos/por-categoria');
      setCategorias(data);
    } catch {
      toast.error('Erro ao carregar categorias');
    } finally {
      setLoadingCats(false);
    }
  }, [toast]);

  const fetchMarkups = useCallback(async () => {
    try {
      const { data } = await api.get<MarkupCategoria[]>('/fornecedor-catalogo/markup');
      const map: Record<string, number> = {};
      // PostgreSQL NUMERIC retorna como string — forçar número
      data.forEach(m => { map[m.categoria] = Number(m.markup); });
      setMarkupMap(map);
    } catch {
      // silencia
    }
  }, []);

  useEffect(() => {
    fetchCategorias();
    fetchMarkups();
  }, [fetchCategorias, fetchMarkups]);

  async function expandirCategoria(cat: string) {
    if (expanded === cat) { setExpanded(null); return; }
    setExpanded(cat);
    setLoadingProds(true);
    setProdutos([]);
    try {
      const { data } = await api.get<ProdutosPaginados>('/fornecedor-catalogo/produtos', {
        params: { categoria: cat, status: filterStatus === 'todos' ? undefined : filterStatus, q: search || undefined, limit: 200 },
      });
      setProdutos(data.produtos);
    } catch {
      toast.error('Erro ao carregar produtos');
    } finally {
      setLoadingProds(false);
    }
  }

  async function aprovarLote(categoria: string) {
    setAprovando(categoria);
    try {
      const ids = produtos.filter(p => p.status === 'rascunho').map(p => p.id);
      if (ids.length === 0) { toast.success('Nenhum rascunho nesta categoria'); return; }
      const { data } = await api.post<{ aprovados: number }>('/fornecedor-catalogo/aprovar-lote', { ids });
      toast.success(`${data.aprovados} produto${data.aprovados !== 1 ? 's' : ''} aprovado${data.aprovados !== 1 ? 's' : ''}`);
      setProdutos(prev => prev.map(p => ids.includes(p.id) ? { ...p, status: 'aprovado' } : p));
      fetchCategorias();
      onStatsChange();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao aprovar lote');
    } finally {
      setAprovando(null);
    }
  }

  async function mudarStatus(id: string, status: 'aprovado' | 'rascunho' | 'pausado') {
    try {
      await api.put(`/fornecedor-catalogo/produtos/${id}/status`, { status });
      setProdutos(prev => prev.map(p => p.id === id ? { ...p, status } : p));
      fetchCategorias();
      onStatsChange();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  }

  if (loadingCats) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-16" />
        ))}
      </div>
    );
  }

  if (categorias.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Nenhum produto importado ainda</p>
        <p className="text-gray-400 text-sm mt-1">Clique em "Importar catálogo" para buscar os produtos do JC Atacado</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filtros globais */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produto…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-300 focus:border-pink-400 outline-none"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilter(e.target.value as any)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-pink-300 outline-none"
        >
          <option value="todos">Todos</option>
          <option value="rascunho">Rascunho</option>
          <option value="aprovado">Aprovados</option>
        </select>
        <span className="text-sm text-gray-400">{categorias.length} categorias</span>
      </div>

      {/* Lista de categorias */}
      {categorias.map(cat => {
        const markup  = markupMap[cat.categoria] ?? 2.0;
        const isOpen  = expanded === cat.categoria;

        return (
          <div key={cat.categoria} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Cabeçalho da categoria */}
            <button
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 text-left"
              onClick={() => expandirCategoria(cat.categoria)}
            >
              <div className="flex-1 flex items-center gap-3">
                <Tag className="w-4 h-4 text-pink-500 flex-shrink-0" />
                <span className="font-medium text-gray-800">{cat.categoria}</span>
                <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                  {cat.total} produto{cat.total !== 1 ? 's' : ''}
                </span>
                {cat.rascunho > 0 && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 rounded-full px-2 py-0.5">
                    {cat.rascunho} aguardando
                  </span>
                )}
                {cat.aprovado > 0 && (
                  <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                    {cat.aprovado} aprovado{cat.aprovado !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mr-2">
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
                  ×{markup.toFixed(2)}
                </span>
                {isOpen && cat.rascunho > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); aprovarLote(cat.categoria); }}
                    disabled={aprovando === cat.categoria}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle className="w-3 h-3" />
                    {aprovando === cat.categoria ? 'Aprovando…' : `Aprovar ${cat.rascunho}`}
                  </button>
                )}
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {/* Lista de produtos */}
            {isOpen && (
              <div className="border-t border-gray-100">
                {loadingProds ? (
                  <div className="p-6 text-center text-sm text-gray-400">Carregando produtos…</div>
                ) : produtos.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400">Nenhum produto encontrado</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {produtos.map(prod => (
                      <ProdutoRow key={prod.id} produto={prod} markup={markup} onStatusChange={mudarStatus} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Linha de produto ─────────────────────────────────────────
function ProdutoRow({
  produto, markup, onStatusChange,
}: {
  produto: ProdutoCatalogo;
  markup: number;
  onStatusChange: (id: string, status: 'aprovado' | 'rascunho' | 'pausado') => void;
}) {
  const markupEfetivo = Number(produto.markup_override ?? markup);
  const precoVenda    = calcPrecoVenda(Number(produto.preco_custo), markupEfetivo);

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
      {/* Imagem */}
      <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
        {produto.imagem_url ? (
          <img src={produto.imagem_url} alt={produto.nome} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-4 h-4 text-gray-300" />
          </div>
        )}
      </div>

      {/* Nome */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{produto.nome}</p>
        <p className="text-xs text-gray-400">ID {produto.item_id}</p>
      </div>

      {/* Preços */}
      <div className="text-right flex-shrink-0 hidden sm:block">
        <p className="text-xs text-gray-400">Custo: {formatCurrency(produto.preco_custo)}</p>
        <p className="text-sm font-semibold text-gray-800">Venda: {formatCurrency(precoVenda)}</p>
      </div>

      {/* Markup */}
      <div className="flex-shrink-0 hidden md:block">
        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-lg">
          ×{markupEfetivo.toFixed(2)}
          {produto.markup_override && <span className="ml-1 text-purple-400">(↑)</span>}
        </span>
      </div>

      {/* Status */}
      <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${statusColor(produto.status)}`}>
        {statusLabel(produto.status)}
      </span>

      {/* Ações */}
      <div className="flex gap-1 flex-shrink-0">
        {produto.status !== 'aprovado' && (
          <button
            onClick={() => onStatusChange(produto.id, 'aprovado')}
            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
            title="Aprovar"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
        {produto.status !== 'pausado' && (
          <button
            onClick={() => onStatusChange(produto.id, 'pausado')}
            className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg"
            title="Pausar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {produto.status !== 'rascunho' && (
          <button
            onClick={() => onStatusChange(produto.id, 'rascunho')}
            className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"
            title="Voltar para rascunho"
          >
            <AlertCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Tab Markups ──────────────────────────────────────────────
function TabMarkups() {
  const toast = useToast();

  const [markups, setMarkups]     = useState<MarkupCategoria[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editando, setEditando]   = useState<Record<string, string>>({});
  const [salvando, setSalvando]   = useState<string | null>(null);
  const [search, setSearch]       = useState('');

  const fetchMarkups = useCallback(async () => {
    try {
      const { data } = await api.get<MarkupCategoria[]>('/fornecedor-catalogo/markup');
      // PostgreSQL NUMERIC retorna como string — normalizar para number
      setMarkups(data.map(m => ({ ...m, markup: Number(m.markup) })));
    } catch {
      toast.error('Erro ao carregar markups');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchMarkups(); }, [fetchMarkups]);

  function startEdit(cat: string, val: number) {
    setEditando(prev => ({ ...prev, [cat]: val.toFixed(2) }));
  }

  function cancelEdit(cat: string) {
    setEditando(prev => { const n = { ...prev }; delete n[cat]; return n; });
  }

  async function saveMarkup(cat: string) {
    const v = parseFloat(editando[cat]);
    if (isNaN(v) || v < 1.0 || v > 5.0) {
      toast.error('Markup deve ser entre 1.00 e 5.00');
      return;
    }
    setSalvando(cat);
    try {
      await api.put('/fornecedor-catalogo/markup', { markups: [{ categoria: cat, markup: v }] });
      setMarkups(prev => prev.map(m => m.categoria === cat ? { ...m, markup: v } : m));
      cancelEdit(cat);
      toast.success('Markup atualizado');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao salvar markup');
    } finally {
      setSalvando(null);
    }
  }

  const filtered = markups.filter(m =>
    m.categoria.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (markups.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Percent className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Nenhuma categoria importada ainda</p>
        <p className="text-gray-400 text-sm mt-1">As categorias aparecem após a primeira importação do catálogo</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Markup por categoria</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Preço de venda = custo × markup. Valor padrão: ×2.00 (100% de margem)
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar categoria…"
            className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-300 outline-none w-48"
          />
        </div>
      </div>

      {/* Tabela */}
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <th className="text-left px-5 py-3 font-medium">Categoria</th>
            <th className="text-center px-4 py-3 font-medium w-32">Markup</th>
            <th className="text-center px-4 py-3 font-medium w-40">Margem efetiva</th>
            <th className="text-right px-5 py-3 font-medium w-32">Atualizado</th>
            <th className="w-24 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {filtered.map(m => {
            const isEdit   = m.categoria in editando;
            const margem   = ((m.markup - 1) * 100).toFixed(0);

            return (
              <tr key={m.categoria} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-800">{m.categoria}</td>
                <td className="px-4 py-3 text-center">
                  {isEdit ? (
                    <input
                      value={editando[m.categoria]}
                      onChange={e => setEditando(prev => ({ ...prev, [m.categoria]: e.target.value }))}
                      className="w-20 text-center border border-pink-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-pink-300 outline-none text-sm"
                      onKeyDown={e => { if (e.key === 'Enter') saveMarkup(m.categoria); if (e.key === 'Escape') cancelEdit(m.categoria); }}
                      autoFocus
                    />
                  ) : (
                    <span className="font-semibold text-gray-800">×{m.markup.toFixed(2)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    m.markup >= 2.0 ? 'bg-green-100 text-green-800' :
                    m.markup >= 1.5 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {margem}% de margem
                  </span>
                </td>
                <td className="px-5 py-3 text-right text-gray-400 text-xs">{fmtDate(m.atualizado_em)}</td>
                <td className="py-3 pr-4 text-right">
                  {isEdit ? (
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => saveMarkup(m.categoria)}
                        disabled={salvando === m.categoria}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => cancelEdit(m.categoria)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(m.categoria, m.markup)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab Histórico ────────────────────────────────────────────
function TabHistorico() {
  const toast = useToast();
  const [logs, setLogs]     = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<SyncLog[]>('/fornecedor-catalogo/scraper/historico')
      .then(({ data }) => setLogs(data))
      .catch(() => toast.error('Erro ao carregar histórico'))
      .finally(() => setLoading(false));
  }, [toast]);

  function statusBadge(s: string) {
    if (s === 'concluido')    return 'bg-green-100 text-green-700';
    if (s === 'em_andamento') return 'bg-blue-100 text-blue-700';
    if (s === 'erro')         return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-500';
  }

  if (loading) {
    return <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">Carregando…</div>;
  }

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <BarChart2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Nenhuma importação realizada ainda</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <th className="text-left px-5 py-3 font-medium">Iniciado</th>
            <th className="text-left px-5 py-3 font-medium">Concluído</th>
            <th className="text-center px-4 py-3 font-medium">Status</th>
            <th className="text-center px-4 py-3 font-medium">Categorias</th>
            <th className="text-center px-4 py-3 font-medium">Novos</th>
            <th className="text-center px-4 py-3 font-medium">Atualizados</th>
            <th className="text-center px-4 py-3 font-medium">Erros</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {logs.map(log => (
            <tr key={log.id} className="hover:bg-gray-50">
              <td className="px-5 py-3 text-gray-700">{fmtDate(log.iniciado_em)}</td>
              <td className="px-5 py-3 text-gray-500">{fmtDate(log.concluido_em)}</td>
              <td className="px-4 py-3 text-center">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusBadge(log.status)}`}>
                  {log.status === 'em_andamento' ? 'Em andamento' :
                   log.status === 'concluido'    ? 'Concluído' :
                   log.status === 'erro'         ? 'Erro' : 'Interrompido'}
                </span>
              </td>
              <td className="px-4 py-3 text-center text-gray-700">
                {log.categorias_processadas}/{log.total_categorias}
              </td>
              <td className="px-4 py-3 text-center font-semibold text-green-700">{log.produtos_salvos}</td>
              <td className="px-4 py-3 text-center text-blue-700">{log.produtos_atualizados}</td>
              <td className="px-4 py-3 text-center text-red-600">{log.erros || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
