import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  TrendingUp, DollarSign, Eye, MousePointerClick, Target, Users,
  MapPin, Monitor, BarChart3, AlertTriangle, CheckCircle2, Loader2,
  ExternalLink, Copy, RefreshCw, Megaphone, ShoppingCart, UserPlus,
  ArrowUpRight, Zap, Database, CloudDownload,
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

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.connected) {
      loadData();
      loadSyncStatus();
      loadAudiences();
    }
  }, [status?.connected, loadData, loadSyncStatus, loadAudiences]);

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
          </div>
          <button
            onClick={handleSyncAudiences}
            disabled={syncingAudiences}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-500/30 transition-colors disabled:opacity-50"
          >
            <Zap size={13} className={syncingAudiences ? 'animate-pulse' : ''} />
            {syncingAudiences ? 'Sincronizando...' : 'Sincronizar audiências'}
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
    </div>
  );
}
