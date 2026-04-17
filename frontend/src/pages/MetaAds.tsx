import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  TrendingUp, DollarSign, Eye, MousePointerClick, Target, Users,
  MapPin, Monitor, BarChart3, AlertTriangle, CheckCircle2, Loader2,
  ExternalLink, Copy, RefreshCw, Megaphone, ShoppingCart, UserPlus,
  ArrowUpRight, Zap, Database, CloudDownload, Clock, Plus, Play, Pause,
  Trash2, X, ImageIcon, Link2, Type, AlignLeft, Calendar, Wallet,
  Lightbulb, Sparkles, ThumbsUp, ThumbsDown, Minus, BookOpen, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line,
  Area,
} from 'recharts';

// ── Tipos ────────────────────────────────────────────────────

interface AudienceInfo {
  id: string;
  name: string;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
  time_updated?: number;
}

interface SegmentCount {
  nome: string;
  total_crm: number;
}

interface AudienceSyncResult {
  nome: string;
  audienceId: string;
  usuarios: number;
  criada: boolean;
  erro?: string;
}

type InsightCategoria = 'publico' | 'criativo' | 'orcamento' | 'plataforma' | 'objetivo' | 'regiao' | 'geral';
type InsightImpacto = 'positivo' | 'negativo' | 'neutro' | 'dica';

interface CampaignInsight {
  id: string;
  tipo: 'automatico' | 'manual';
  categoria: InsightCategoria;
  impacto: InsightImpacto;
  titulo: string;
  descricao: string | null;
  campanha_ref: string | null;
  dados_json: Record<string, unknown> | null;
  criado_em: string;
}

type CampanhaObjetivo = 'OUTCOME_SALES' | 'OUTCOME_TRAFFIC' | 'OUTCOME_AWARENESS';
type CampanhaCTA = 'SHOP_NOW' | 'LEARN_MORE' | 'SIGN_UP' | 'GET_OFFER';

interface CriarCampanhaForm {
  nome: string;
  objetivo: CampanhaObjetivo;
  orcamentoDiario: string;
  dataInicio: string;
  dataFim: string;
  publicoIds: string[];
  urlDestino: string;
  imagemUrl: string;
  titulo: string;
  texto: string;
  cta: CampanhaCTA;
  idadeMin: string;
  idadeMax: string;
}

interface CriarCampanhaResult {
  campanhaId: string;
  adsetId: string;
  creativeId: string;
  adId: string;
  nome: string;
  urlGerenciador: string;
}

interface ConnectionStatus {
  connected: boolean;
  account?: {
    name: string;
    account_status: number;
    currency: string;
    timezone_name: string;
    amount_spent: string;
    balance: string;
  };
  error?: string;
  message?: string;
}

interface MetaInsight {
  spend: string;
  impressions: string;
  reach?: string;
  clicks: string;
  ctr: string;
  cpc: string;
  cpm: string;
  actions?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  date_start: string;
  date_stop: string;
  // breakdowns
  campaign_id?: string;
  campaign_name?: string;
  age?: string;
  gender?: string;
  region?: string;
  publisher_platform?: string;
}

interface Conversoes {
  compras: number;
  add_to_cart: number;
  checkout: number;
  leads: number;
  link_clicks: number;
  page_views: number;
  roas: number;
}

interface Overview {
  kpis: MetaInsight | null;
  conversoes: Conversoes | null;
  daily: MetaInsight[];
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  insights: MetaInsight | null;
}

// ── Constantes ───────────────────────────────────────────────

const PERIODOS = [
  { value: '1d', label: 'Hoje' },
  { value: '3d', label: '3 dias' },
  { value: '7d', label: '7 dias' },
  { value: '15d', label: '15 dias' },
  { value: '30d', label: '30 dias' },
  { value: '3m', label: '3 meses' },
];

const CORES = {
  meta: '#8B5CF6',
  facebook: '#1877F2',
  instagram: '#E4405F',
  audience_network: '#F7931E',
  messenger: '#0084FF',
  feminino: '#F472B6',
  masculino: '#60A5FA',
  unknown: '#94A3B8',
};

const PLATAFORMA_NOMES: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  audience_network: 'Audience Network',
  messenger: 'Messenger',
};

const PLATAFORMA_CORES: Record<string, string> = {
  facebook: CORES.facebook,
  instagram: CORES.instagram,
  audience_network: CORES.audience_network,
  messenger: CORES.messenger,
};

const STATUS_CAMPANHA: Record<string, { label: string; cor: string }> = {
  ACTIVE: { label: 'Ativa', cor: 'text-emerald-400' },
  PAUSED: { label: 'Pausada', cor: 'text-amber-400' },
  DELETED: { label: 'Removida', cor: 'text-red-400' },
  ARCHIVED: { label: 'Arquivada', cor: 'text-gray-400' },
};

// ── Helpers ──────────────────────────────────────────────────

function fmtMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtNum(valor: number): string {
  if (valor >= 1000000) return `${(valor / 1000000).toFixed(1)}M`;
  if (valor >= 1000) return `${(valor / 1000).toFixed(1)}K`;
  return valor.toLocaleString('pt-BR');
}

function fmtPct(valor: number): string {
  return `${valor.toFixed(2)}%`;
}

function fmtDia(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function extractAction(actions: Array<{ action_type: string; value: string }> | undefined, type: string): number {
  if (!actions) return 0;
  const a = actions.find((x) => x.action_type === type);
  return a ? parseFloat(a.value) : 0;
}

function generoLabel(g: string): string {
  if (g === 'female') return 'Feminino';
  if (g === 'male') return 'Masculino';
  return 'Outro';
}

// ── Componente: Guia de Setup ────────────────────────────────

function SetupGuide({ error }: { error?: string }) {
  const [copied, setCopied] = useState('');

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Meta Ads</h1>
          <p className="text-bibelo-muted text-sm mt-1">Facebook + Instagram — Dashboard de Performance</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-red-300 font-medium">Erro de conexão</p>
            <p className="text-red-400/80 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-violet-500/20 rounded-lg flex items-center justify-center">
            <Zap size={20} className="text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-bibelo-text">Configurar Meta Ads</h2>
            <p className="text-bibelo-muted text-sm">Siga os passos abaixo para conectar suas campanhas</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Passo 1 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-violet-500 text-white flex items-center justify-center text-sm font-bold">1</div>
              <div className="w-px h-full bg-bibelo-border mt-2" />
            </div>
            <div className="pb-6">
              <h3 className="font-semibold text-bibelo-text">Criar App no Meta Developer Portal</h3>
              <p className="text-bibelo-muted text-sm mt-1">
                Acesse o portal de desenvolvedores, crie um app tipo "Outro" e adicione o produto "Marketing API".
              </p>
              <a
                href="https://developers.facebook.com/apps/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                Abrir Meta Developer Portal <ExternalLink size={14} />
              </a>
            </div>
          </div>

          {/* Passo 2 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-violet-500 text-white flex items-center justify-center text-sm font-bold">2</div>
              <div className="w-px h-full bg-bibelo-border mt-2" />
            </div>
            <div className="pb-6">
              <h3 className="font-semibold text-bibelo-text">Obter o Ad Account ID</h3>
              <p className="text-bibelo-muted text-sm mt-1">
                No Gerenciador de Anúncios, o ID aparece na URL após <code className="bg-bibelo-bg px-1 rounded">act=</code> ou em Configurações da conta.
              </p>
              <a
                href="https://www.facebook.com/adsmanager"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                Abrir Gerenciador de Anúncios <ExternalLink size={14} />
              </a>
            </div>
          </div>

          {/* Passo 3 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-violet-500 text-white flex items-center justify-center text-sm font-bold">3</div>
              <div className="w-px h-full bg-bibelo-border mt-2" />
            </div>
            <div className="pb-6">
              <h3 className="font-semibold text-bibelo-text">Gerar System User Token</h3>
              <p className="text-bibelo-muted text-sm mt-1">
                No Business Suite → Configurações → Usuários do sistema → Adicionar → Gerar token com permissões <code className="bg-bibelo-bg px-1 rounded">ads_read</code> e <code className="bg-bibelo-bg px-1 rounded">ads_management</code>.
              </p>
              <a
                href="https://business.facebook.com/settings/system-users"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                Abrir Business Suite <ExternalLink size={14} />
              </a>
            </div>
          </div>

          {/* Passo 4 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-violet-500 text-white flex items-center justify-center text-sm font-bold">4</div>
            </div>
            <div>
              <h3 className="font-semibold text-bibelo-text">Adicionar no .env e rebuild</h3>
              <p className="text-bibelo-muted text-sm mt-1">
                Adicione as variáveis no arquivo <code className="bg-bibelo-bg px-1 rounded">.env</code> do servidor:
              </p>
              <div className="mt-3 bg-bibelo-bg rounded-lg p-4 font-mono text-sm text-bibelo-muted relative">
                <div className="space-y-1">
                  <div>META_ACCESS_TOKEN=seu_token_aqui</div>
                  <div>META_AD_ACCOUNT_ID=seu_id_aqui</div>
                </div>
                <button
                  onClick={() => copyText('META_ACCESS_TOKEN=\nMETA_AD_ACCOUNT_ID=', 'env')}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-bibelo-card hover:bg-bibelo-border transition-colors"
                  title="Copiar"
                >
                  {copied === 'env' ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-bibelo-muted text-xs mt-2">
                Depois execute: <code className="bg-bibelo-bg px-1 rounded">docker compose up -d --build api</code>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Card informativo */}
      <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4 flex items-start gap-3">
        <Megaphone size={20} className="text-violet-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-violet-300 font-medium text-sm">A API da Meta é gratuita</p>
          <p className="text-violet-400/80 text-xs mt-1">
            Você só paga o investimento em anúncios (ad spend). A API não tem custo adicional.
            Não precisa de App Review para gerenciar suas próprias contas.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Componente: KPI Card ─────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, bg, color }: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub?: string;
  bg: string;
  color: string;
}) {
  return (
    <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
        <Icon size={16} className={color} />
      </div>
      <p className="text-xl font-bold text-bibelo-text">{value}</p>
      <p className="text-xs text-bibelo-muted mt-0.5">{label}</p>
      {sub && <p className="text-xs text-bibelo-muted/60 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Tooltip customizado para gráficos ────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bibelo-card border border-bibelo-border rounded-lg p-3 shadow-lg">
      <p className="text-xs text-bibelo-muted mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-bibelo-muted">{p.name}:</span>
          <span className="text-bibelo-text font-medium">
            {p.name === 'Investimento' ? fmtMoeda(p.value) : fmtNum(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Componente Principal ─────────────────────────────────────

export default function MetaAds() {
  const [periodo, setPeriodo] = useState('7d');
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [demographics, setDemographics] = useState<MetaInsight[]>([]);
  const [geographic, setGeographic] = useState<MetaInsight[]>([]);
  const [platforms, setPlatforms] = useState<MetaInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ ultimo_sync: any; total_registros: number; total_campanhas: number } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [audiences, setAudiences] = useState<AudienceInfo[]>([]);
  const [segmentCounts, setSegmentCounts] = useState<SegmentCount[]>([]);
  const [syncingAudiences, setSyncingAudiences] = useState(false);
  const [audienceSyncResult, setAudienceSyncResult] = useState<AudienceSyncResult[] | null>(null);

  // Insights acumulativos
  const [insights, setInsights] = useState<CampaignInsight[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [gerandoInsights, setGerandoInsights] = useState(false);
  const [modalInsight, setModalInsight] = useState(false);
  const [insightExpandido, setInsightExpandido] = useState<string | null>(null);
  const [formInsight, setFormInsight] = useState<{
    categoria: InsightCategoria; impacto: InsightImpacto;
    titulo: string; descricao: string; campanha_ref: string;
  }>({ categoria: 'geral', impacto: 'positivo', titulo: '', descricao: '', campanha_ref: '' });
  const [salvandoInsight, setSalvandoInsight] = useState(false);

  // Fase 3 — Criação de campanhas
  const [modalAberto, setModalAberto] = useState(false);
  const [criandoCampanha, setCriandoCampanha] = useState(false);
  const [campanhaCriada, setCampanhaCriada] = useState<CriarCampanhaResult | null>(null);
  const [eroCampanha, setErroCampanha] = useState<string | null>(null);
  const [togglingCampanha, setTogglingCampanha] = useState<string | null>(null);
  const hoje = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState<CriarCampanhaForm>({
    nome: '',
    objetivo: 'OUTCOME_SALES',
    orcamentoDiario: '30',
    dataInicio: hoje,
    dataFim: '',
    publicoIds: [],
    urlDestino: 'https://www.papelariabibelo.com.br',
    imagemUrl: '',
    titulo: '',
    texto: '',
    cta: 'SHOP_NOW',
    idadeMin: '18',
    idadeMax: '55',
  });

  // Carregar status de conexão
  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/meta-ads/status');
      setStatus(data);
    } catch {
      setStatus({ connected: false, error: 'Erro ao verificar conexão' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Carregar status do sync
  const loadSyncStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/meta-ads/sync-status');
      setSyncStatus(data);
    } catch { /* ignore */ }
  }, []);

  // Carregar audiências
  const loadAudiences = useCallback(async () => {
    try {
      const { data } = await api.get('/meta-ads/audiences');
      setAudiences(data.audiences || []);
      setSegmentCounts(data.segmentCounts || []);
    } catch { /* ignore */ }
  }, []);

  // Sincronizar audiências
  const handleSyncAudiences = useCallback(async () => {
    setSyncingAudiences(true);
    setAudienceSyncResult(null);
    try {
      const { data } = await api.post('/meta-ads/audiences/sync');
      setAudienceSyncResult(data.results || []);
      await loadAudiences();
    } catch (err) {
      console.error('Erro ao sincronizar audiências:', err);
    } finally {
      setSyncingAudiences(false);
    }
  }, [loadAudiences]);

  // Sync manual
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await api.post('/meta-ads/sync');
      await loadSyncStatus();
    } catch (err) {
      console.error('Erro ao sincronizar Meta Ads:', err);
    } finally {
      setSyncing(false);
    }
  }, [loadSyncStatus]);

  // Carregar insights
  const loadInsights = useCallback(async () => {
    setLoadingInsights(true);
    try {
      const { data } = await api.get('/meta-ads/insights');
      setInsights(data.insights || []);
    } catch { /* ignore */ } finally {
      setLoadingInsights(false);
    }
  }, []);

  // Gerar insights automáticos
  const handleGerarInsights = useCallback(async () => {
    setGerandoInsights(true);
    try {
      await api.post('/meta-ads/insights/gerar');
      await loadInsights();
    } catch (err) {
      console.error('Erro ao gerar insights:', err);
    } finally {
      setGerandoInsights(false);
    }
  }, [loadInsights]);

  // Salvar insight manual
  const handleSalvarInsight = useCallback(async () => {
    setSalvandoInsight(true);
    try {
      await api.post('/meta-ads/insights', formInsight);
      await loadInsights();
      setModalInsight(false);
      setFormInsight({ categoria: 'geral', impacto: 'positivo', titulo: '', descricao: '', campanha_ref: '' });
    } catch (err) {
      console.error('Erro ao salvar insight:', err);
    } finally {
      setSalvandoInsight(false);
    }
  }, [formInsight, loadInsights]);

  // Deletar insight
  const handleDeletarInsight = useCallback(async (id: string) => {
    if (!window.confirm('Remover este insight?')) return;
    try {
      await api.delete(`/meta-ads/insights/${id}`);
      setInsights(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error('Erro ao deletar insight:', err);
    }
  }, []);

  // Carregar dados do dashboard
  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [ovRes, campRes, demoRes, geoRes, platRes] = await Promise.all([
        api.get(`/meta-ads/overview?periodo=${periodo}`),
        api.get(`/meta-ads/campaigns?periodo=${periodo}`),
        api.get(`/meta-ads/demographics?periodo=${periodo}`),
        api.get(`/meta-ads/geographic?periodo=${periodo}`),
        api.get(`/meta-ads/platforms?periodo=${periodo}`),
      ]);

      setOverview(ovRes.data);
      setCampaigns(campRes.data);
      setDemographics(demoRes.data);
      setGeographic(geoRes.data);
      setPlatforms(platRes.data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Erro ao carregar dados Meta Ads:', err);
    } finally {
      setDataLoading(false);
    }
  }, [periodo]);

  // Criar campanha
  const handleCriarCampanha = useCallback(async () => {
    setCriandoCampanha(true);
    setErroCampanha(null);
    setCampanhaCriada(null);
    try {
      const body = {
        nome: form.nome,
        objetivo: form.objetivo,
        orcamentoDiario: parseFloat(form.orcamentoDiario),
        dataInicio: form.dataInicio,
        dataFim: form.dataFim || undefined,
        publicoIds: form.publicoIds.length > 0 ? form.publicoIds : undefined,
        urlDestino: form.urlDestino,
        imagemUrl: form.imagemUrl,
        titulo: form.titulo,
        texto: form.texto,
        cta: form.cta,
        idadeMin: parseInt(form.idadeMin) || 18,
        idadeMax: parseInt(form.idadeMax) || 55,
      };
      const { data } = await api.post('/meta-ads/campanhas/criar', body);
      setCampanhaCriada(data);
      setModalAberto(false);
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Erro ao criar campanha';
      setErroCampanha(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setCriandoCampanha(false);
    }
  }, [form, loadData]);

  // Pausar / ativar campanha
  const handleToggleCampanha = useCallback(async (id: string, statusAtual: string) => {
    setTogglingCampanha(id);
    try {
      const novoStatus = statusAtual === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      await api.put(`/meta-ads/campanhas/${id}/status`, { status: novoStatus });
      await loadData();
    } catch (err) {
      console.error('Erro ao alterar status da campanha:', err);
    } finally {
      setTogglingCampanha(null);
    }
  }, [loadData]);

  // Arquivar campanha
  const handleArquivarCampanha = useCallback(async (id: string) => {
    if (!window.confirm('Arquivar esta campanha? Esta ação não pode ser desfeita.')) return;
    try {
      await api.delete(`/meta-ads/campanhas/${id}`);
      await loadData();
    } catch (err) {
      console.error('Erro ao arquivar campanha:', err);
    }
  }, [loadData]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.connected) {
      loadData();
      loadSyncStatus();
      loadAudiences();
      loadInsights();
    }
  }, [status?.connected, loadData, loadSyncStatus, loadAudiences, loadInsights]);

  // Loading inicial
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-violet-400" />
      </div>
    );
  }

  // Não conectado — mostrar guia
  if (!status?.connected) {
    return <SetupGuide error={status?.error} />;
  }

  // ── Preparar dados para gráficos ──────────────────────────

  const kpi = overview?.kpis;
  const conv = overview?.conversoes;

  // Dados diários para gráfico de tendência
  const dailyChart = (overview?.daily || []).map((d) => ({
    dia: fmtDia(d.date_start),
    Investimento: parseFloat(d.spend || '0'),
    Cliques: parseInt(d.clicks || '0'),
    Alcance: parseInt(d.reach || '0'),
  }));

  // Dados de plataforma para pie chart
  const platformChart = platforms.map((p) => ({
    name: PLATAFORMA_NOMES[p.publisher_platform || ''] || p.publisher_platform || 'Outro',
    value: parseFloat(p.spend || '0'),
    impressions: parseInt(p.impressions || '0'),
    clicks: parseInt(p.clicks || '0'),
    color: PLATAFORMA_CORES[p.publisher_platform || ''] || '#94A3B8',
  }));

  // Dados demográficos — agrupar por gênero
  const demoByGender = demographics.reduce<Record<string, { impressions: number; clicks: number; spend: number }>>((acc, d) => {
    const key = d.gender || 'unknown';
    if (!acc[key]) acc[key] = { impressions: 0, clicks: 0, spend: 0 };
    acc[key].impressions += parseInt(d.impressions || '0');
    acc[key].clicks += parseInt(d.clicks || '0');
    acc[key].spend += parseFloat(d.spend || '0');
    return acc;
  }, {});

  const genderChart = Object.entries(demoByGender).map(([gender, data]) => ({
    name: generoLabel(gender),
    value: data.spend,
    impressions: data.impressions,
    clicks: data.clicks,
    color: gender === 'female' ? CORES.feminino : gender === 'male' ? CORES.masculino : CORES.unknown,
  }));

  // Dados demográficos — por faixa etária
  const demoByAge = demographics.reduce<Record<string, { female: number; male: number; total: number }>>((acc, d) => {
    const age = d.age || 'unknown';
    if (!acc[age]) acc[age] = { female: 0, male: 0, total: 0 };
    const spend = parseFloat(d.spend || '0');
    acc[age].total += spend;
    if (d.gender === 'female') acc[age].female += spend;
    else if (d.gender === 'male') acc[age].male += spend;
    return acc;
  }, {});

  const ageChart = Object.entries(demoByAge)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([age, data]) => ({
      faixa: age,
      Feminino: data.female,
      Masculino: data.male,
    }));

  // Dados geográficos — top 10 regiões
  const geoChart = geographic
    .map((g) => ({
      regiao: (g.region || 'Outro').replace(/, Brazil$/, '').replace(/State of /, ''),
      investimento: parseFloat(g.spend || '0'),
      cliques: parseInt(g.clicks || '0'),
      alcance: parseInt(g.reach || '0'),
    }))
    .sort((a, b) => b.investimento - a.investimento)
    .slice(0, 12);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Meta Ads</h1>
          <p className="text-bibelo-muted text-sm mt-1">
            {status.account?.name || 'Facebook + Instagram'} — Performance de Campanhas
          </p>
        </div>

        <div className="flex items-center gap-3">
          {syncStatus && syncStatus.total_registros > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400" title={`${syncStatus.total_registros} registros no banco, ${syncStatus.total_campanhas} campanhas`}>
              <Database size={12} />
              {syncStatus.total_registros} registros salvos
            </span>
          )}

          {lastUpdate && (
            <span className="text-xs text-bibelo-muted">
              Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-50"
            title="Sincronizar dados da Meta para o banco local"
          >
            <CloudDownload size={14} className={syncing ? 'animate-pulse' : ''} />
            {syncing ? 'Sincronizando...' : 'Sync'}
          </button>

          <button
            onClick={loadData}
            disabled={dataLoading}
            className="p-2 rounded-lg bg-bibelo-card border border-bibelo-border hover:bg-bibelo-bg transition-colors"
            title="Atualizar dados ao vivo"
          >
            <RefreshCw size={16} className={`text-bibelo-muted ${dataLoading ? 'animate-spin' : ''}`} />
          </button>

          <div className="flex bg-bibelo-card border border-bibelo-border rounded-lg">
            {PERIODOS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriodo(p.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  periodo === p.value
                    ? 'bg-violet-500 text-white'
                    : 'text-bibelo-muted hover:text-bibelo-text'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      {kpi && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <KpiCard icon={DollarSign} label="Investimento" value={fmtMoeda(parseFloat(kpi.spend || '0'))} bg="bg-violet-500/20" color="text-violet-400" />
          <KpiCard icon={Eye} label="Impressões" value={fmtNum(parseInt(kpi.impressions || '0'))} bg="bg-blue-500/20" color="text-blue-400" />
          <KpiCard icon={Users} label="Alcance" value={fmtNum(parseInt(kpi.reach || '0'))} bg="bg-cyan-500/20" color="text-cyan-400" />
          <KpiCard icon={MousePointerClick} label="Cliques" value={fmtNum(parseInt(kpi.clicks || '0'))} bg="bg-pink-500/20" color="text-pink-400" />
          <KpiCard icon={Target} label="CTR" value={fmtPct(parseFloat(kpi.ctr || '0'))} bg="bg-emerald-500/20" color="text-emerald-400" />
          <KpiCard icon={DollarSign} label="CPC" value={fmtMoeda(parseFloat(kpi.cpc || '0'))} bg="bg-amber-500/20" color="text-amber-400" />
          <KpiCard icon={ShoppingCart} label="Compras" value={fmtNum(conv?.compras || 0)} bg="bg-emerald-500/20" color="text-emerald-400" sub={conv?.roas ? `ROAS ${conv.roas.toFixed(1)}x` : undefined} />
          <KpiCard icon={UserPlus} label="Leads" value={fmtNum(conv?.leads || 0)} bg="bg-rose-500/20" color="text-rose-400" sub={conv?.add_to_cart ? `${conv.add_to_cart} carrinhos` : undefined} />
        </div>
      )}

      {/* Gráficos: Tendência diária + Plataformas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tendência diária */}
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-bibelo-text mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-violet-400" />
            Tendência Diária
          </h3>
          {dailyChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="dia" tick={{ fill: '#888', fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fill: '#888', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#888', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Area yAxisId="left" type="monotone" dataKey="Investimento" fill="#8B5CF6" fillOpacity={0.15} stroke="#8B5CF6" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="Cliques" stroke="#F472B6" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-bibelo-muted text-sm">
              Sem dados no período
            </div>
          )}
        </div>

        {/* Plataformas (pie) */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-bibelo-text mb-4 flex items-center gap-2">
            <Monitor size={16} className="text-blue-400" />
            Por Plataforma
          </h3>
          {platformChart.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={platformChart}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {platformChart.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => fmtMoeda(value)}
                    contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8 }}
                    itemStyle={{ color: '#ccc' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {platformChart.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-bibelo-muted">{p.name}</span>
                    </div>
                    <span className="text-bibelo-text font-medium">{fmtMoeda(p.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-bibelo-muted text-sm">
              Sem dados
            </div>
          )}
        </div>
      </div>

      {/* Campanhas */}
      {campaigns.length > 0 && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-bibelo-text mb-4 flex items-center gap-2">
            <Megaphone size={16} className="text-violet-400" />
            Campanhas ({campaigns.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bibelo-border text-left">
                  <th className="pb-2 text-bibelo-muted font-medium">Campanha</th>
                  <th className="pb-2 text-bibelo-muted font-medium text-center">Status</th>
                  <th className="pb-2 text-bibelo-muted font-medium text-right">Investimento</th>
                  <th className="pb-2 text-bibelo-muted font-medium text-right">Impressões</th>
                  <th className="pb-2 text-bibelo-muted font-medium text-right">Cliques</th>
                  <th className="pb-2 text-bibelo-muted font-medium text-right">CTR</th>
                  <th className="pb-2 text-bibelo-muted font-medium text-right">CPC</th>
                  <th className="pb-2 text-bibelo-muted font-medium text-right">Compras</th>
                  <th className="pb-2 text-bibelo-muted font-medium text-right">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const ins = c.insights;
                  const st = STATUS_CAMPANHA[c.status] || { label: c.status, cor: 'text-gray-400' };
                  const compras = extractAction(ins?.actions, 'purchase');
                  const roas = ins?.purchase_roas?.[0]?.value ? parseFloat(ins.purchase_roas[0].value) : 0;

                  return (
                    <tr key={c.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-bg transition-colors">
                      <td className="py-2.5">
                        <div className="font-medium text-bibelo-text truncate max-w-[200px]">{c.name}</div>
                        <div className="text-xs text-bibelo-muted">{c.objective?.replace('OUTCOME_', '').toLowerCase()}</div>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className={`text-xs font-medium ${st.cor}`}>{st.label}</span>
                      </td>
                      <td className="py-2.5 text-right text-bibelo-text">
                        {ins ? fmtMoeda(parseFloat(ins.spend || '0')) : '—'}
                      </td>
                      <td className="py-2.5 text-right text-bibelo-muted">
                        {ins ? fmtNum(parseInt(ins.impressions || '0')) : '—'}
                      </td>
                      <td className="py-2.5 text-right text-bibelo-muted">
                        {ins ? fmtNum(parseInt(ins.clicks || '0')) : '—'}
                      </td>
                      <td className="py-2.5 text-right text-bibelo-muted">
                        {ins ? fmtPct(parseFloat(ins.ctr || '0')) : '—'}
                      </td>
                      <td className="py-2.5 text-right text-bibelo-muted">
                        {ins ? fmtMoeda(parseFloat(ins.cpc || '0')) : '—'}
                      </td>
                      <td className="py-2.5 text-right">
                        {compras > 0 ? (
                          <span className="text-emerald-400 font-medium">{compras}</span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 text-right">
                        {roas > 0 ? (
                          <span className={`font-medium ${roas >= 2 ? 'text-emerald-400' : roas >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                            {roas.toFixed(1)}x
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Demográfico: Gênero + Faixa Etária */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gênero */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-bibelo-text mb-4 flex items-center gap-2">
            <Users size={16} className="text-pink-400" />
            Por Gênero
          </h3>
          {genderChart.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={genderChart}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {genderChart.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => fmtMoeda(value)}
                    contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8 }}
                    itemStyle={{ color: '#ccc' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {genderChart.map((g, i) => {
                  const total = genderChart.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? ((g.value / total) * 100).toFixed(1) : '0';
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                        <span className="text-bibelo-muted">{g.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-bibelo-muted">{pct}%</span>
                        <span className="text-bibelo-text font-medium">{fmtMoeda(g.value)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-bibelo-muted text-sm">
              Sem dados demográficos
            </div>
          )}
        </div>

        {/* Faixa Etária */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-bibelo-text mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-violet-400" />
            Investimento por Faixa Etária
          </h3>
          {ageChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={ageChart} barGap={0}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="faixa" tick={{ fill: '#888', fontSize: 11 }} />
                <YAxis tick={{ fill: '#888', fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number) => fmtMoeda(value)}
                  contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8 }}
                  itemStyle={{ color: '#ccc' }}
                />
                <Bar dataKey="Feminino" fill={CORES.feminino} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Masculino" fill={CORES.masculino} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-bibelo-muted text-sm">
              Sem dados de faixa etária
            </div>
          )}
        </div>
      </div>

      {/* Geográfico */}
      {geoChart.length > 0 && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-bibelo-text mb-4 flex items-center gap-2">
            <MapPin size={16} className="text-emerald-400" />
            Performance por Região
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={geoChart} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis type="number" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="regiao"
                tick={{ fill: '#888', fontSize: 11 }}
                width={120}
              />
              <Tooltip
                formatter={(value: number, name: string) =>
                  name === 'investimento' ? fmtMoeda(value) : fmtNum(value)
                }
                contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8 }}
                itemStyle={{ color: '#ccc' }}
              />
              <Bar dataKey="investimento" name="Investimento" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Audiências Personalizadas (Fase 2) ── */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold text-bibelo-text flex items-center gap-2">
              <Users size={16} className="text-violet-400" />
              Audiências Personalizadas
            </h3>
            <p className="text-bibelo-muted text-xs mt-0.5">
              Segmentos do CRM sincronizados com o Meta para retargeting e lookalike
            </p>
            <p className="text-bibelo-muted text-xs mt-0.5 flex items-center gap-1">
              <Clock size={10} className="text-bibelo-muted/60" />
              Sincronização automática diária às 03:00 BRT
            </p>
          </div>
          <button
            onClick={handleSyncAudiences}
            disabled={syncingAudiences}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-50"
          >
            <Zap size={13} className={syncingAudiences ? 'animate-pulse' : ''} />
            {syncingAudiences ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
        </div>

        {/* Grid de segmentos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              nome: 'Bibelô — Clientes',
              descricao: 'Todos que já compraram',
              icon: ShoppingCart,
              color: 'text-emerald-400',
              bg: 'bg-emerald-500/10 border-emerald-500/20',
              uso: 'Lookalike de alta qualidade',
            },
            {
              nome: 'Bibelô — Leads não convertidos',
              descricao: 'Leads verificados sem compra',
              icon: UserPlus,
              color: 'text-blue-400',
              bg: 'bg-blue-500/10 border-blue-500/20',
              uso: 'Anúncio de 1ª compra + cupom',
            },
            {
              nome: 'Bibelô — Inativos +90d',
              descricao: 'Clientes que sumiram',
              icon: AlertTriangle,
              color: 'text-amber-400',
              bg: 'bg-amber-500/10 border-amber-500/20',
              uso: 'Campanha de reativação',
            },
            {
              nome: 'Bibelô — Compradores Recentes',
              descricao: 'Compraram nos últimos 30d',
              icon: Zap,
              color: 'text-pink-400',
              bg: 'bg-pink-500/10 border-pink-500/20',
              uso: 'Lookalike de top clientes',
            },
          ].map((seg) => {
            const audienceMeta = audiences.find((a) => a.name === seg.nome);
            const crmCount = segmentCounts.find((s) => s.nome === seg.nome)?.total_crm ?? 0;
            const metaCount = audienceMeta?.approximate_count_lower_bound;
            const syncResult = audienceSyncResult?.find((r) => r.nome === seg.nome);
            const Icon = seg.icon;

            return (
              <div key={seg.nome} className={`rounded-lg border p-4 space-y-3 ${seg.bg}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Icon size={16} className={seg.color} />
                    <p className="text-bibelo-text text-xs font-semibold mt-1.5 leading-tight">{seg.descricao}</p>
                  </div>
                  {audienceMeta ? (
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-bibelo-muted/40 shrink-0 mt-0.5" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-bibelo-muted">No CRM</span>
                    <span className={`font-bold ${seg.color}`}>{crmCount.toLocaleString('pt-BR')}</span>
                  </div>
                  {metaCount !== undefined && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-bibelo-muted">No Meta</span>
                      <span className="text-bibelo-text font-medium">~{metaCount.toLocaleString('pt-BR')}+</span>
                    </div>
                  )}
                  {syncResult && !syncResult.erro && (
                    <p className="text-emerald-400 text-xs">✓ {syncResult.usuarios} enviados</p>
                  )}
                  {syncResult?.erro && (
                    <p className="text-red-400 text-xs truncate" title={syncResult.erro}>Erro: {syncResult.erro}</p>
                  )}
                </div>

                <p className="text-bibelo-muted text-xs border-t border-white/5 pt-2 italic">{seg.uso}</p>
              </div>
            );
          })}
        </div>

        {/* Guia rápido: como usar nas campanhas */}
        <div className="border-t border-bibelo-border pt-4">
          <p className="text-bibelo-muted text-xs font-semibold mb-3 flex items-center gap-1.5">
            <ArrowUpRight size={13} />
            Como usar essas audiências nas campanhas do Meta Ads Manager
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                passo: '1',
                titulo: 'Crie um Conjunto de Anúncios',
                detalhe: 'No Meta Ads Manager, ao configurar o público do conjunto de anúncios, clique em "Usar audiência salva" ou acesse a seção "Audiências personalizadas".',
                color: 'text-violet-300',
              },
              {
                passo: '2',
                titulo: 'Selecione o segmento',
                detalhe: 'As audiências "Bibelô —" aparecem na lista. Escolha conforme o objetivo: Clientes para lookalike, Leads para conversão, Inativos para reativação.',
                color: 'text-blue-300',
              },
              {
                passo: '3',
                titulo: 'Crie um Lookalike (opcional)',
                detalhe: 'Na seção Audiências do Meta, clique em "Criar audiência" > "Audiência semelhante", selecione "Bibelô — Clientes" como origem e defina 1–2% do Brasil.',
                color: 'text-emerald-300',
              },
            ].map((item) => (
              <div key={item.passo} className="bg-bibelo-bg rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${item.color} w-5 h-5 rounded-full border border-current flex items-center justify-center shrink-0`}>
                    {item.passo}
                  </span>
                  <span className="text-bibelo-text text-xs font-semibold">{item.titulo}</span>
                </div>
                <p className="text-bibelo-muted text-xs leading-relaxed pl-7">{item.detalhe}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Insights Acumulativos ── */}
      {(() => {
        const CATEGORIA_CONFIG: Record<InsightCategoria, { label: string; color: string; bg: string }> = {
          publico:    { label: 'Público',    color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
          criativo:   { label: 'Criativo',   color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-500/20' },
          orcamento:  { label: 'Orçamento',  color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
          plataforma: { label: 'Plataforma', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
          objetivo:   { label: 'Objetivo',   color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-500/20' },
          regiao:     { label: 'Região',     color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          geral:      { label: 'Geral',      color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20' },
        };
        const IMPACTO_ICON: Record<InsightImpacto, React.ReactNode> = {
          positivo: <ThumbsUp size={12} className="text-emerald-400" />,
          negativo: <ThumbsDown size={12} className="text-red-400" />,
          neutro:   <Minus size={12} className="text-slate-400" />,
          dica:     <Lightbulb size={12} className="text-amber-400" />,
        };
        const categorias = ['publico','criativo','orcamento','plataforma','objetivo','regiao','geral'] as InsightCategoria[];

        return (
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-semibold text-bibelo-text flex items-center gap-2">
                  <BookOpen size={16} className="text-amber-400" />
                  Inteligência de Campanhas
                </h3>
                <p className="text-bibelo-muted text-xs mt-0.5">
                  Aprendizados acumulados de cada campanha — base de conhecimento para otimizar os próximos anúncios
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleGerarInsights}
                  disabled={gerandoInsights}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                >
                  {gerandoInsights ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {gerandoInsights ? 'Analisando...' : 'Gerar insights'}
                </button>
                <button
                  onClick={() => setModalInsight(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bibelo-bg border border-bibelo-border text-bibelo-muted text-xs font-medium hover:text-bibelo-text hover:border-bibelo-muted transition-colors"
                >
                  <Plus size={12} />
                  Adicionar nota
                </button>
              </div>
            </div>

            {loadingInsights && (
              <div className="flex items-center gap-2 text-bibelo-muted text-xs py-4">
                <Loader2 size={14} className="animate-spin" />
                Carregando insights...
              </div>
            )}

            {!loadingInsights && insights.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <Lightbulb size={28} className="text-bibelo-muted/40 mx-auto" />
                <p className="text-bibelo-muted text-sm">Nenhum insight ainda</p>
                <p className="text-bibelo-muted/60 text-xs">Clique em "Gerar insights" para analisar suas campanhas automaticamente, ou adicione uma nota manual.</p>
              </div>
            )}

            {!loadingInsights && insights.length > 0 && (
              <div className="space-y-4">
                {/* Contadores por categoria */}
                <div className="flex flex-wrap gap-2">
                  {categorias.filter(cat => insights.some(i => i.categoria === cat)).map(cat => {
                    const cfg = CATEGORIA_CONFIG[cat];
                    const count = insights.filter(i => i.categoria === cat).length;
                    return (
                      <span key={cat} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color} ${cfg.bg}`}>
                        {cfg.label} · {count}
                      </span>
                    );
                  })}
                </div>

                {/* Cards de insights agrupados por categoria */}
                {categorias.filter(cat => insights.some(i => i.categoria === cat)).map(cat => {
                  const cfg = CATEGORIA_CONFIG[cat];
                  const grupo = insights.filter(i => i.categoria === cat);
                  return (
                    <div key={cat} className="space-y-2">
                      <p className={`text-xs font-semibold flex items-center gap-1.5 ${cfg.color}`}>
                        <span className={`w-2 h-2 rounded-full bg-current`} />
                        {cfg.label}
                      </p>
                      {grupo.map(ins => (
                        <div key={ins.id} className="bg-bibelo-bg rounded-lg border border-bibelo-border overflow-hidden">
                          <div
                            className="flex items-start justify-between gap-3 p-3 cursor-pointer"
                            onClick={() => setInsightExpandido(insightExpandido === ins.id ? null : ins.id)}
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="mt-0.5 shrink-0">{IMPACTO_ICON[ins.impacto as InsightImpacto]}</span>
                              <div className="min-w-0">
                                <p className="text-bibelo-text text-xs font-medium leading-snug">{ins.titulo}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`text-xs ${ins.tipo === 'automatico' ? 'text-violet-400/70' : 'text-bibelo-muted/60'}`}>
                                    {ins.tipo === 'automatico' ? '✦ automático' : '✎ manual'}
                                  </span>
                                  {ins.campanha_ref && (
                                    <span className="text-bibelo-muted/50 text-xs truncate max-w-[140px]" title={ins.campanha_ref}>
                                      · {ins.campanha_ref}
                                    </span>
                                  )}
                                  <span className="text-bibelo-muted/40 text-xs">
                                    · {new Date(ins.criado_em).toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeletarInsight(ins.id); }}
                                className="p-1 rounded hover:bg-red-500/20 text-bibelo-muted/40 hover:text-red-400 transition-colors"
                              >
                                <Trash2 size={11} />
                              </button>
                              {ins.descricao
                                ? (insightExpandido === ins.id ? <ChevronUp size={13} className="text-bibelo-muted" /> : <ChevronDown size={13} className="text-bibelo-muted" />)
                                : null
                              }
                            </div>
                          </div>
                          {insightExpandido === ins.id && ins.descricao && (
                            <div className="px-3 pb-3 border-t border-bibelo-border/50">
                              <p className="text-bibelo-muted text-xs leading-relaxed mt-2">{ins.descricao}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Modal: Adicionar Insight Manual ── */}
      {modalInsight && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-bibelo-card border border-bibelo-border rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-bibelo-border">
              <h2 className="text-sm font-semibold text-bibelo-text flex items-center gap-2">
                <Lightbulb size={15} className="text-amber-400" />
                Adicionar aprendizado
              </h2>
              <button onClick={() => setModalInsight(false)} className="text-bibelo-muted hover:text-bibelo-text">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Categoria + impacto */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-bibelo-muted text-xs font-medium mb-1.5 block">Categoria</label>
                  <select
                    value={formInsight.categoria}
                    onChange={e => setFormInsight(f => ({ ...f, categoria: e.target.value as InsightCategoria }))}
                    className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-amber-500"
                  >
                    <option value="publico">Público</option>
                    <option value="criativo">Criativo</option>
                    <option value="orcamento">Orçamento</option>
                    <option value="plataforma">Plataforma</option>
                    <option value="objetivo">Objetivo</option>
                    <option value="regiao">Região</option>
                    <option value="geral">Geral</option>
                  </select>
                </div>
                <div>
                  <label className="text-bibelo-muted text-xs font-medium mb-1.5 block">Tipo</label>
                  <select
                    value={formInsight.impacto}
                    onChange={e => setFormInsight(f => ({ ...f, impacto: e.target.value as InsightImpacto }))}
                    className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-amber-500"
                  >
                    <option value="positivo">👍 Positivo — o que funcionou</option>
                    <option value="negativo">👎 Negativo — o que não funcionou</option>
                    <option value="dica">💡 Dica — ideia para testar</option>
                    <option value="neutro">— Neutro — observação</option>
                  </select>
                </div>
              </div>
              {/* Título */}
              <div>
                <label className="text-bibelo-muted text-xs font-medium mb-1.5 block">Aprendizado (resumo)</label>
                <input
                  type="text"
                  placeholder="Ex: Imagem de produto fundo branco teve CTR 2x maior"
                  value={formInsight.titulo}
                  onChange={e => setFormInsight(f => ({ ...f, titulo: e.target.value }))}
                  className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-amber-500"
                />
              </div>
              {/* Descrição */}
              <div>
                <label className="text-bibelo-muted text-xs font-medium mb-1.5 block">Detalhes (opcional)</label>
                <textarea
                  rows={3}
                  placeholder="Contexto, números, próximos passos..."
                  value={formInsight.descricao}
                  onChange={e => setFormInsight(f => ({ ...f, descricao: e.target.value }))}
                  className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>
              {/* Campanha referência */}
              <div>
                <label className="text-bibelo-muted text-xs font-medium mb-1.5 block">Campanha relacionada (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Catálogo Bibelô — Abril"
                  value={formInsight.campanha_ref}
                  onChange={e => setFormInsight(f => ({ ...f, campanha_ref: e.target.value }))}
                  className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-bibelo-border">
              <button onClick={() => setModalInsight(false)} className="px-3 py-1.5 text-xs text-bibelo-muted hover:text-bibelo-text transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSalvarInsight}
                disabled={salvandoInsight || !formInsight.titulo}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-50"
              >
                {salvandoInsight ? <Loader2 size={12} className="animate-spin" /> : <Lightbulb size={12} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fase 3: Criar e Gerenciar Campanhas ── */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold text-bibelo-text flex items-center gap-2">
              <Megaphone size={16} className="text-pink-400" />
              Criar Campanha
            </h3>
            <p className="text-bibelo-muted text-xs mt-0.5">
              Configure e lance campanhas no Meta Ads diretamente pelo CRM — criadas pausadas para revisão
            </p>
          </div>
          <button
            onClick={() => { setModalAberto(true); setCampanhaCriada(null); setErroCampanha(null); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-500/20 border border-pink-500/30 text-pink-300 text-xs font-medium hover:bg-pink-500/30 transition-colors"
          >
            <Plus size={13} />
            Nova campanha
          </button>
        </div>

        {/* Resultado da criação */}
        {campanhaCriada && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 space-y-2">
            <p className="text-emerald-400 text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 size={15} />
              Campanha criada com sucesso!
            </p>
            <p className="text-bibelo-muted text-xs">
              <span className="text-bibelo-text font-medium">{campanhaCriada.nome}</span> — criada pausada. Ative-a no Gerenciador após revisar.
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-bibelo-muted font-mono">
              <span>Campaign: {campanhaCriada.campanhaId}</span>
              <span>·</span>
              <span>AdSet: {campanhaCriada.adsetId}</span>
              <span>·</span>
              <span>Ad: {campanhaCriada.adId}</span>
            </div>
            <a
              href={campanhaCriada.urlGerenciador}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
            >
              <ExternalLink size={11} />
              Abrir no Gerenciador de Anúncios
            </a>
          </div>
        )}

        {/* Lista de campanhas existentes */}
        {campaigns.length > 0 && (
          <div className="space-y-2">
            <p className="text-bibelo-muted text-xs font-semibold uppercase tracking-wider">Campanhas ativas / pausadas</p>
            <div className="space-y-2">
              {campaigns.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 bg-bibelo-bg rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-bibelo-text text-xs font-medium truncate">{c.name}</p>
                    <p className="text-bibelo-muted text-xs">
                      {c.objective?.replace('OUTCOME_', '')} ·{' '}
                      {c.daily_budget ? `R$ ${(parseInt(c.daily_budget) / 100).toFixed(0)}/dia` : 'orçamento vitalício'}
                      {c.insights && ` · R$ ${parseFloat(c.insights.spend || '0').toFixed(2)} gasto`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {c.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}
                    </span>
                    <button
                      onClick={() => handleToggleCampanha(c.id, c.status)}
                      disabled={togglingCampanha === c.id}
                      className="p-1.5 rounded hover:bg-white/10 text-bibelo-muted hover:text-bibelo-text transition-colors disabled:opacity-50"
                      title={c.status === 'ACTIVE' ? 'Pausar' : 'Ativar'}
                    >
                      {togglingCampanha === c.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : c.status === 'ACTIVE'
                          ? <Pause size={13} />
                          : <Play size={13} />
                      }
                    </button>
                    <button
                      onClick={() => handleArquivarCampanha(c.id)}
                      className="p-1.5 rounded hover:bg-red-500/20 text-bibelo-muted hover:text-red-400 transition-colors"
                      title="Arquivar campanha"
                    >
                      <Trash2 size={13} />
                    </button>
                    <a
                      href={`https://www.facebook.com/adsmanager/manage/campaigns?act=1753454592707878`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-white/10 text-bibelo-muted hover:text-violet-400 transition-colors"
                      title="Ver no Gerenciador"
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Criar Campanha ── */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-xl bg-bibelo-card border border-bibelo-border rounded-2xl shadow-2xl">
            {/* Header modal */}
            <div className="flex items-center justify-between p-5 border-b border-bibelo-border">
              <h2 className="text-sm font-semibold text-bibelo-text flex items-center gap-2">
                <Megaphone size={16} className="text-pink-400" />
                Nova Campanha Meta Ads
              </h2>
              <button onClick={() => setModalAberto(false)} className="text-bibelo-muted hover:text-bibelo-text">
                <X size={18} />
              </button>
            </div>

            {/* Corpo do modal */}
            <div className="p-5 space-y-4">

              {/* Nome */}
              <div>
                <label className="text-bibelo-muted text-xs font-medium flex items-center gap-1.5 mb-1.5">
                  <Type size={11} /> Nome da campanha
                </label>
                <input
                  type="text"
                  placeholder="Ex: Canetas Premium — Abril 2026"
                  value={form.nome}
                  onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Objetivo */}
              <div>
                <label className="text-bibelo-muted text-xs font-medium flex items-center gap-1.5 mb-1.5">
                  <Target size={11} /> Objetivo
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'OUTCOME_SALES', label: 'Vendas', desc: 'Otimiza para compras', color: 'emerald' },
                    { value: 'OUTCOME_TRAFFIC', label: 'Tráfego', desc: 'Mais cliques no site', color: 'blue' },
                    { value: 'OUTCOME_AWARENESS', label: 'Alcance', desc: 'Máx. de pessoas', color: 'violet' },
                  ] as const).map((obj) => (
                    <button
                      key={obj.value}
                      onClick={() => setForm(f => ({ ...f, objetivo: obj.value }))}
                      className={`p-3 rounded-lg border text-left transition-colors ${form.objetivo === obj.value ? 'bg-violet-500/20 border-violet-500/50' : 'bg-bibelo-bg border-bibelo-border hover:border-bibelo-muted'}`}
                    >
                      <p className={`text-xs font-semibold ${form.objetivo === obj.value ? 'text-violet-300' : 'text-bibelo-text'}`}>{obj.label}</p>
                      <p className="text-bibelo-muted text-xs mt-0.5">{obj.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Orçamento e datas */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-bibelo-muted text-xs font-medium flex items-center gap-1.5 mb-1.5">
                    <Wallet size={11} /> Orçamento/dia (R$)
                  </label>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={form.orcamentoDiario}
                    onChange={(e) => setForm(f => ({ ...f, orcamentoDiario: e.target.value }))}
                    className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-bibelo-muted text-xs font-medium flex items-center gap-1.5 mb-1.5">
                    <Calendar size={11} /> Início
                  </label>
                  <input
                    type="date"
                    value={form.dataInicio}
                    onChange={(e) => setForm(f => ({ ...f, dataInicio: e.target.value }))}
                    className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-bibelo-muted text-xs font-medium flex items-center gap-1.5 mb-1.5">
                    <Calendar size={11} /> Fim (opcional)
                  </label>
                  <input
                    type="date"
                    value={form.dataFim}
                    onChange={(e) => setForm(f => ({ ...f, dataFim: e.target.value }))}
                    className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {/* Público */}
              <div>
                <label className="text-bibelo-muted text-xs font-medium flex items-center gap-1.5 mb-1.5">
                  <Users size={11} /> Público personalizado (opcional)
                </label>
                <div className="space-y-1.5">
                  {(segmentCounts.length > 0 ? segmentCounts : [
                    { nome: 'Bibelô — Clientes' },
                    { nome: 'Bibelô — Leads não convertidos' },
                    { nome: 'Bibelô — Inativos +90d' },
                    { nome: 'Bibelô — Compradores Recentes' },
                  ]).map((seg) => {
                    const audienceMeta = audiences.find((a) => a.name === seg.nome);
                    const ativo = audienceMeta && form.publicoIds.includes(audienceMeta.id);
                    return (
                      <button
                        key={seg.nome}
                        onClick={() => {
                          if (!audienceMeta) return;
                          setForm(f => ({
                            ...f,
                            publicoIds: ativo
                              ? f.publicoIds.filter(id => id !== audienceMeta.id)
                              : [...f.publicoIds, audienceMeta.id],
                          }));
                        }}
                        disabled={!audienceMeta}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${ativo ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'bg-bibelo-bg border-bibelo-border text-bibelo-muted'} ${!audienceMeta ? 'opacity-40 cursor-not-allowed' : 'hover:border-bibelo-muted'}`}
                      >
                        {seg.nome}
                        {!audienceMeta && <span className="ml-2 text-amber-400">(sincronize os públicos primeiro)</span>}
                        {audienceMeta && <span className="ml-2 text-bibelo-muted/60">id:{audienceMeta.id}</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="text-bibelo-muted/60 text-xs mt-1.5">Sem seleção = alcance amplo no Brasil (feminino, 18–55 anos)</p>
              </div>

              {/* URL destino */}
              <div>
                <label className="text-bibelo-muted text-xs font-medium flex items-center gap-1.5 mb-1.5">
                  <Link2 size={11} /> URL de destino
                </label>
                <input
                  type="url"
                  value={form.urlDestino}
                  onChange={(e) => setForm(f => ({ ...f, urlDestino: e.target.value }))}
                  className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Imagem */}
              <div>
                <label className="text-bibelo-muted text-xs font-medium flex items-center gap-1.5 mb-1.5">
                  <ImageIcon size={11} /> URL da imagem do anúncio
                </label>
                <input
                  type="url"
                  placeholder="https://... (mín. 1080×1080, JPG/PNG)"
                  value={form.imagemUrl}
                  onChange={(e) => setForm(f => ({ ...f, imagemUrl: e.target.value }))}
                  className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-violet-500"
                />
                {form.imagemUrl && (
                  <img src={form.imagemUrl} alt="preview" className="mt-2 h-20 w-20 object-cover rounded border border-bibelo-border" onError={(e) => (e.currentTarget.style.display = 'none')} />
                )}
              </div>

              {/* Título e CTA */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-bibelo-muted text-xs font-medium flex items-center gap-1.5 mb-1.5">
                    <Type size={11} /> Título <span className="text-bibelo-muted/50">(máx. 40)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    placeholder="Ex: Canetas Premium Bibelô"
                    value={form.titulo}
                    onChange={(e) => setForm(f => ({ ...f, titulo: e.target.value }))}
                    className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-violet-500"
                  />
                  <p className="text-bibelo-muted/50 text-xs mt-0.5 text-right">{form.titulo.length}/40</p>
                </div>
                <div>
                  <label className="text-bibelo-muted text-xs font-medium flex items-center gap-1.5 mb-1.5">
                    CTA
                  </label>
                  <select
                    value={form.cta}
                    onChange={(e) => setForm(f => ({ ...f, cta: e.target.value as CampanhaCTA }))}
                    className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-violet-500"
                  >
                    <option value="SHOP_NOW">Comprar agora</option>
                    <option value="LEARN_MORE">Saiba mais</option>
                    <option value="GET_OFFER">Ver oferta</option>
                    <option value="SIGN_UP">Cadastrar</option>
                  </select>
                </div>
              </div>

              {/* Texto */}
              <div>
                <label className="text-bibelo-muted text-xs font-medium flex items-center gap-1.5 mb-1.5">
                  <AlignLeft size={11} /> Texto do anúncio
                </label>
                <textarea
                  rows={3}
                  maxLength={600}
                  placeholder="Texto que aparece no feed..."
                  value={form.texto}
                  onChange={(e) => setForm(f => ({ ...f, texto: e.target.value }))}
                  className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-violet-500 resize-none"
                />
                <p className="text-bibelo-muted/50 text-xs mt-0.5 text-right">{form.texto.length}/600</p>
              </div>

              {/* Faixa etária */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-bibelo-muted text-xs font-medium mb-1.5 block">Idade mínima</label>
                  <input
                    type="number" min="13" max="65"
                    value={form.idadeMin}
                    onChange={(e) => setForm(f => ({ ...f, idadeMin: e.target.value }))}
                    className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-bibelo-muted text-xs font-medium mb-1.5 block">Idade máxima</label>
                  <input
                    type="number" min="13" max="65"
                    value={form.idadeMax}
                    onChange={(e) => setForm(f => ({ ...f, idadeMax: e.target.value }))}
                    className="w-full bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-2 text-sm text-bibelo-text focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
              <p className="text-bibelo-muted/60 text-xs">Segmentação: Brasil · Feminino · {form.idadeMin}–{form.idadeMax} anos</p>

              {/* Erro */}
              {eroCampanha && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-red-400 text-xs">{eroCampanha}</p>
                </div>
              )}
            </div>

            {/* Footer modal */}
            <div className="flex items-center justify-between gap-3 p-5 border-t border-bibelo-border">
              <p className="text-bibelo-muted/60 text-xs">Campanha criada <strong className="text-amber-400">pausada</strong> — ative no Gerenciador após revisar.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setModalAberto(false)}
                  className="px-3 py-1.5 text-xs text-bibelo-muted hover:text-bibelo-text transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCriarCampanha}
                  disabled={criandoCampanha || !form.nome || !form.imagemUrl || !form.titulo || !form.texto}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-pink-500/20 border border-pink-500/30 text-pink-300 text-xs font-medium hover:bg-pink-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {criandoCampanha
                    ? <><Loader2 size={13} className="animate-spin" /> Criando...</>
                    : <><Megaphone size={13} /> Criar campanha</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
