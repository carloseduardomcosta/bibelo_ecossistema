import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  DollarSign, ShoppingCart, TrendingUp, TrendingDown,
  AlertTriangle, PackageX, Users, ArrowUpRight, ArrowDownRight,
  ArrowDown, ArrowUp, Wallet, Minus, UserCheck, MapPin,
  Mail, Clock, Zap, Eye, MousePointerClick, Send, X as XIcon,
  GitBranch,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import { formatCurrency, formatMonth, timeAgo } from '../lib/format';

interface Overview {
  receita_periodo: number;
  receita_anterior: number;
  receita_variacao: number;
  receita_total: number;
  despesas_periodo: number;
  despesas_anterior: number;
  despesas_variacao: number;
  saldo_periodo: number;
  pedidos_periodo: number;
  pedidos_anterior: number;
  pedidos_variacao: number;
  ticket_medio: number;
  ticket_variacao: number;
  clientes_compraram: number;
  clientes_compraram_anterior: number;
  clientes_compraram_variacao: number;
  total_clientes: number;
  novos_clientes: number;
  novos_variacao: number;
  total_produtos: number;
  sem_estoque: number;
  estoque_baixo: number;
  segmentos: Array<{ segmento: string; total: number }>;
}

interface RevenuePoint { mes: string; receita: number; pedidos: number }

interface Insights {
  clientes_risco: Array<{ id: string; nome: string; score: number }>;
  top_clientes: Array<{ id: string; nome: string; total_pedidos: number; valor_total: number }>;
  oportunidades_perdidas: Array<{ nome: string; sku: string; preco_venda: number }>;
  categorias_margem: Array<{ categoria: string; qtd: number; margem_media: number }>;
}

interface GeoData {
  byRegion: Array<{ region: string; total: number; visitors: number }>;
  byCity: Array<{ city: string; region: string; total: number; visitors: number }>;
  byCountry: Array<{ country: string; visitors: number }>;
}

interface FunilEtapa { nome: string; valor: number; icone: string }
interface FunilConversao { de: string; para: string; taxa: number }
interface FunilData {
  periodo_dias: number;
  etapas: FunilEtapa[];
  conversoes: FunilConversao[];
}

interface ForecastData {
  mes_atual: { receita_ate_hoje: number; projetado_fim_mes: number };
  media_3_meses: number;
  tendencia: 'alta' | 'estavel' | 'queda';
  confianca: 'baixa' | 'media' | 'alta';
}

interface AlertasFlowsData {
  flows_sem_atividade: Array<{ id: string; nome: string; gatilho: string; execucoes_7d: number; total_execucoes: number }>;
  total: number;
}

interface FlowActivity {
  recentSends: Array<{
    customer_nome: string; customer_email: string;
    flow_nome: string; executado_em: string;
  }>;
  upcoming: Array<{
    customer_nome: string; customer_email: string;
    flow_nome: string; step_tipo: string; agendado_para: string;
  }>;
  activeFlows: Array<{
    id: string; nome: string; gatilho: string;
    execucoes_ativas: number; execucoes_concluidas: number;
    execucoes_erro: number; emails_enviados: number;
  }>;
  emailInteractions: {
    opened: number; clicked: number; bounced: number; complained: number;
    recentEvents: Array<{
      tipo: string; customer_nome: string | null;
      customer_email: string; link: string | null; criado_em: string;
    }>;
  };
}

const ESTADO_NOMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};

const SEGMENT_COLORS = ['#8B5CF6', '#F472B6', '#34D399', '#FBBF24', '#60A5FA', '#F87171'];

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

const PERIODOS = [
  { value: '1d', label: 'Hoje' },
  { value: '3d', label: '3 dias' },
  { value: '7d', label: '7 dias' },
  { value: '15d', label: '15 dias' },
  { value: '30d', label: '30 dias' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: '1a', label: '1 ano' },
];

// ── Componente: Próximos Emails com Preview ──────────────────

interface UpcomingEmail {
  execution_id: string;
  fluxo_nome: string;
  cliente_nome: string;
  cliente_email: string;
  proximo_step_em: string;
  step_atual: number;
  proximo_tipo: string;
  proximo_template: string | null;
  template_alternativo: string | null;
  condicao_descricao: string | null;
  preview_html: string | null;
}

function UpcomingEmailsCard() {
  const [upcoming, setUpcoming] = useState<UpcomingEmail[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewInfo, setPreviewInfo] = useState<{ cliente: string; template: string } | null>(null);

  const fetchUpcoming = useCallback(async () => {
    try {
      const res = await api.get('/flows/upcoming');
      setUpcoming(res.data.upcoming || []);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { fetchUpcoming(); }, [fetchUpcoming]);
  // Refresh a cada 2min
  useEffect(() => {
    const id = setInterval(fetchUpcoming, 120_000);
    return () => clearInterval(id);
  }, [fetchUpcoming]);

  function tempoRestante(dt: string): string {
    const diffMs = new Date(dt).getTime() - Date.now();
    if (diffMs <= 0) return 'agora';
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);
    if (diffH > 24) return `${Math.floor(diffH / 24)}d ${diffH % 24}h`;
    if (diffH > 0) return `${diffH}h ${diffM}min`;
    return `${diffM}min`;
  }

  return (
    <>
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <h3 className="text-sm font-medium text-bibelo-muted mb-3 flex items-center gap-2">
          <Clock size={14} className="text-amber-400" /> Próximos Emails Agendados
        </h3>
        {!upcoming.length ? (
          <p className="text-sm text-bibelo-muted py-6 text-center">Nenhum email agendado</p>
        ) : (
          <div className="space-y-1">
            {upcoming.map((u) => (
              <div key={u.execution_id} className="py-2.5 border-b border-bibelo-border/50 last:border-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      u.proximo_tipo === 'condicao' ? 'bg-violet-400/15' : 'bg-amber-400/15'
                    }`}>
                      {u.proximo_tipo === 'condicao' ? <GitBranch size={13} className="text-violet-400" /> : <Mail size={13} className="text-amber-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-bibelo-text truncate">{u.cliente_nome}</p>
                      <p className="text-xs text-bibelo-muted truncate">{u.cliente_email}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <span className="inline-block text-[10px] font-medium bg-amber-400/15 text-amber-400 px-2 py-0.5 rounded-full truncate max-w-[140px]">
                      {u.fluxo_nome}
                    </span>
                    <p className="text-[10px] text-bibelo-muted mt-0.5">em {tempoRestante(u.proximo_step_em)}</p>
                  </div>
                </div>

                {/* Template e condição */}
                <div className="mt-1.5 ml-9 flex items-center gap-2 flex-wrap">
                  {u.proximo_template && (
                    <span className="text-[10px] px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full font-medium">
                      {u.proximo_template}
                    </span>
                  )}
                  {u.template_alternativo && (
                    <>
                      <span className="text-[10px] text-bibelo-muted">ou</span>
                      <span className="text-[10px] px-2 py-0.5 bg-violet-400/10 text-violet-400 rounded-full font-medium">
                        {u.template_alternativo}
                      </span>
                    </>
                  )}
                  {u.preview_html && (
                    <button
                      onClick={() => { setPreviewHtml(u.preview_html); setPreviewInfo({ cliente: u.cliente_nome, template: u.proximo_template || '' }); }}
                      className="text-[10px] px-2 py-0.5 bg-bibelo-primary/10 text-bibelo-primary rounded-full font-medium hover:bg-bibelo-primary/20 transition-colors cursor-pointer"
                    >
                      Preview
                    </button>
                  )}
                </div>

                {u.condicao_descricao && (
                  <p className="text-[10px] text-bibelo-muted/70 ml-9 mt-1 italic">{u.condicao_descricao}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Preview */}
      {previewHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPreviewHtml(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b bg-bibelo-bg">
              <div>
                <p className="text-sm font-bold text-bibelo-text">Preview do Email</p>
                <p className="text-xs text-bibelo-muted">{previewInfo?.cliente} — {previewInfo?.template}</p>
              </div>
              <button onClick={() => setPreviewHtml(null)} className="p-1.5 rounded-lg hover:bg-bibelo-border/50 transition-colors">
                <XIcon size={18} className="text-bibelo-muted" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <iframe
                srcDoc={previewHtml}
                title="Email Preview"
                className="w-full h-full min-h-[600px] border-0"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Componente: Seção CEO View ──────────────────────────────────

const FUNIL_CORES: Record<string, string> = {
  "Visitantes únicos":     "bg-gray-400",
  "Visualizações produto": "bg-blue-400",
  "Add to cart":           "bg-[#fe68c4]",
  "Checkout iniciado":     "bg-orange-400",
  "Compras realizadas":    "bg-green-500",
  "Leads capturados":      "bg-purple-400",
};

function CeoViewSection() {
  const [funil, setFunil] = useState<FunilData | null>(null);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [alertas, setAlertas] = useState<AlertasFlowsData | null>(null);
  const [ceoLoading, setCeoLoading] = useState(true);

  useEffect(() => {
    setCeoLoading(true);
    Promise.all([
      api.get('/analytics/funil?dias=30'),
      api.get('/analytics/forecast'),
      api.get('/analytics/alertas-flows'),
    ])
      .then(([funilRes, forecastRes, alertasRes]) => {
        setFunil(funilRes.data);
        setForecast(forecastRes.data);
        setAlertas(alertasRes.data);
      })
      .catch(() => { /* falha silenciosa — seção apenas não renderiza */ })
      .finally(() => setCeoLoading(false));
  }, []);

  const maxFunil = funil ? Math.max(...funil.etapas.map((e) => e.valor), 1) : 1;
  const todosZero = funil ? funil.etapas.every((e) => e.valor === 0) : true;

  const tendenciaCfg = forecast ? {
    alta:   { label: 'Alta', cls: 'bg-green-500/20 text-green-400' },
    estavel:{ label: 'Estável', cls: 'bg-gray-500/20 text-gray-400' },
    queda:  { label: 'Queda', cls: 'bg-red-500/20 text-red-400' },
  }[forecast.tendencia] : null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-bibelo-text flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          <TrendingUp size={16} className="text-bibelo-primary" />
          Visão Executiva
        </h2>
        <span className="text-xs text-bibelo-muted">Últimos 30 dias</span>
      </div>

      {ceoLoading ? (
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-44" />
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-44" />
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-44" />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {/* Sub-seção A — Funil de Conversão (col-span-2) */}
          <div className="col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <h3 className="text-sm font-medium text-bibelo-muted mb-4 flex items-center gap-2">
              <Eye size={14} className="text-blue-400" /> Funil de Conversão
            </h3>
            {todosZero ? (
              <p className="text-sm text-bibelo-muted py-6 text-center leading-relaxed">
                Dados de rastreamento insuficientes — instale o script de tracking na loja
              </p>
            ) : funil ? (
              <div className="space-y-2.5">
                {funil.etapas.map((etapa, idx) => {
                  const conversao = funil.conversoes.find((c) => c.de === etapa.nome);
                  const barW = maxFunil > 0 ? Math.round((etapa.valor / maxFunil) * 100) : 0;
                  const bgCls = FUNIL_CORES[etapa.nome] || "bg-bibelo-primary";
                  return (
                    <div key={etapa.nome}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-1.5">
                          <span>{etapa.icone}</span>
                          <span className="text-bibelo-text">{etapa.nome}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-bibelo-text">{etapa.valor.toLocaleString('pt-BR')}</span>
                          {conversao && conversao.taxa > 0 && (
                            <span className="text-bibelo-muted text-[10px]">→ {conversao.taxa}%</span>
                          )}
                        </div>
                      </div>
                      <div className="h-2 bg-bibelo-border rounded-full overflow-hidden">
                        <div
                          className={`h-full ${bgCls} rounded-full transition-all`}
                          style={{ width: `${barW}%` }}
                        />
                      </div>
                      {idx < funil.etapas.length - 1 && (
                        <div className="border-b border-bibelo-border/30 mt-2.5" />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Sub-seção B — Forecast 30 dias (col-span-1) */}
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <h3 className="text-sm font-medium text-bibelo-muted mb-4 flex items-center gap-2">
              <DollarSign size={14} className="text-amber-400" /> Projeção do Mês
            </h3>
            {forecast ? (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-2xl font-bold text-bibelo-text leading-none">
                    {formatCurrency(forecast.mes_atual.projetado_fim_mes)}
                  </p>
                  {tendenciaCfg && (
                    <span className={`inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${tendenciaCfg.cls}`}>
                      {tendenciaCfg.label}
                    </span>
                  )}
                </div>
                <div className="text-xs text-bibelo-muted space-y-1">
                  <p>Realizado: <span className="text-bibelo-text font-medium">{formatCurrency(forecast.mes_atual.receita_ate_hoje)}</span></p>
                  <p>Média 3m: <span className="text-bibelo-text font-medium">{formatCurrency(forecast.media_3_meses)}</span></p>
                </div>
                <p className="text-[10px] text-bibelo-muted/70 border-t border-bibelo-border pt-2">
                  Confiança: {forecast.confianca === 'alta' ? '⬆ alta' : forecast.confianca === 'media' ? '~ média' : '⬇ baixa'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-bibelo-muted py-6 text-center">Sem dados de histórico</p>
            )}
          </div>

          {/* Sub-seção C — Alertas de Flows (col-span-1) */}
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <h3 className="text-sm font-medium text-bibelo-muted mb-4 flex items-center gap-2">
              <Zap size={14} className="text-amber-400" /> Alertas de Flows
            </h3>
            {alertas ? (
              alertas.total === 0 ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-500/15 text-green-400 px-3 py-1.5 rounded-full">
                    Todos os flows ativos
                  </span>
                  <p className="text-[10px] text-bibelo-muted text-center">Nenhum flow sem atividade nos últimos 7 dias</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-red-400 bg-red-400/15 px-2 py-0.5 rounded-full">
                      {alertas.total} sem atividade
                    </span>
                    <span className="text-[10px] text-bibelo-muted">em 7 dias</span>
                  </div>
                  {alertas.flows_sem_atividade.slice(0, 3).map((f) => (
                    <div key={f.id} className="py-1.5 border-b border-bibelo-border/50 last:border-0">
                      <p className="text-xs text-bibelo-text truncate">{f.nome}</p>
                      <p className="text-[10px] text-bibelo-muted truncate">{f.gatilho}</p>
                    </div>
                  ))}
                  {alertas.total > 3 && (
                    <a href="/marketing" className="text-[10px] text-bibelo-primary hover:underline block mt-1">
                      e mais {alertas.total - 3} flows → ver Marketing
                    </a>
                  )}
                </div>
              )
            ) : (
              <p className="text-sm text-bibelo-muted py-6 text-center">Carregando...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { error: showError } = useToast();
  const [periodo, setPeriodo] = useState('30d');
  const [ov, setOv] = useState<Overview | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [geoData, setGeoData] = useState<GeoData | null>(null);
  const [flowActivity, setFlowActivity] = useState<FlowActivity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = `periodo=${periodo}`;
    const geoDias = periodo === '1d' ? 1 : periodo === '3d' ? 3 : periodo === '7d' ? 7 : periodo === '15d' ? 15 : periodo === '30d' ? 30 : periodo === '3m' ? 90 : periodo === '6m' ? 180 : 365;
    Promise.all([
      api.get(`/analytics/overview?${p}`),
      api.get(`/analytics/revenue?${p}`),
      api.get(`/analytics/insights?${p}`),
      api.get(`/tracking/geo?dias=${geoDias}`),
      api.get(`/analytics/flow-activity?${p}`),
    ])
      .then(([ovRes, revRes, insRes, geoRes, flowRes]) => {
        setOv(ovRes.data);
        setRevenue(revRes.data.data);
        setInsights(insRes.data);
        setGeoData(geoRes.data);
        setFlowActivity(flowRes.data);
      })
      .catch(() => { showError('Erro ao carregar dados do dashboard'); })
      .finally(() => setLoading(false));
  }, [periodo]);

  const periodoLabel = PERIODOS.find(p => p.value === periodo)?.label || periodo;

  const chartData = useMemo(
    () => revenue.map(r => ({ ...r, mes_label: formatMonth(r.mes) })),
    [revenue],
  );

  return (
    <div>
      {/* Header + Período */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">
            Olá, {user?.nome?.split(' ')[0]}!
          </h1>
          <p className="text-sm text-bibelo-muted mt-0.5">Visão geral do seu negócio</p>
        </div>
        <div className="flex gap-1 bg-bibelo-card border border-bibelo-border rounded-lg p-1 flex-wrap">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                periodo === p.value
                  ? 'bg-bibelo-primary text-white'
                  : 'text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6 animate-pulse h-44" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-24" />
            ))}
          </div>
        </div>
      ) : ov && (
        <>
          {/* Card Fluxo: Entradas - Saídas = Saldo */}
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6 mb-6">
            <p className="text-xs text-bibelo-muted uppercase tracking-wider mb-4">Fluxo de caixa — {periodoLabel}</p>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4 md:gap-2">
              {/* Entradas */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-400/10 flex items-center justify-center shrink-0">
                  <ArrowDown size={24} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-bibelo-muted">Entradas</p>
                  <p className="text-2xl font-bold text-emerald-400">{formatCurrency(ov.receita_periodo)}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-bibelo-muted">{ov.pedidos_periodo} pedidos</span>
                    <VariacaoBadge valor={ov.receita_variacao} />
                  </div>
                </div>
              </div>

              <div className="hidden md:flex items-center justify-center"><Minus size={20} className="text-bibelo-border" /></div>

              {/* Saídas */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-400/10 flex items-center justify-center shrink-0">
                  <ArrowUp size={24} className="text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-bibelo-muted">Saídas</p>
                  <p className="text-2xl font-bold text-red-400">{formatCurrency(ov.despesas_periodo)}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-bibelo-muted">despesas</span>
                    <VariacaoBadge valor={ov.despesas_variacao} />
                  </div>
                </div>
              </div>

              <div className="hidden md:flex items-center justify-center text-bibelo-border font-bold text-lg">=</div>

              {/* Saldo */}
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${ov.saldo_periodo >= 0 ? 'bg-bibelo-primary/10' : 'bg-red-400/10'}`}>
                  <Wallet size={24} className={ov.saldo_periodo >= 0 ? 'text-bibelo-primary' : 'text-red-400'} />
                </div>
                <div>
                  <p className="text-xs text-bibelo-muted">Saldo</p>
                  <p className={`text-2xl font-bold ${ov.saldo_periodo >= 0 ? 'text-bibelo-primary' : 'text-red-400'}`}>{formatCurrency(ov.saldo_periodo)}</p>
                  <span className="text-xs text-bibelo-muted">
                    margem {ov.receita_periodo > 0 ? Math.round((ov.saldo_periodo / ov.receita_periodo) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>

            {/* Barra proporcional */}
            {ov.receita_periodo > 0 && (
              <div className="mt-5 pt-4 border-t border-bibelo-border">
                <div className="h-3 bg-bibelo-bg rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-400 rounded-l-full transition-all"
                    style={{ width: `${(ov.receita_periodo / (ov.receita_periodo + ov.despesas_periodo)) * 100}%` }} />
                  <div className="h-full bg-red-400 rounded-r-full transition-all"
                    style={{ width: `${(ov.despesas_periodo / (ov.receita_periodo + ov.despesas_periodo)) * 100}%` }} />
                </div>
                <div className="flex justify-between text-xs text-bibelo-muted mt-2">
                  <span>Entradas {Math.round((ov.receita_periodo / (ov.receita_periodo + ov.despesas_periodo)) * 100)}%</span>
                  <span>Saídas {Math.round((ov.despesas_periodo / (ov.receita_periodo + ov.despesas_periodo)) * 100)}%</span>
                </div>
              </div>
            )}
          </div>

          {/* KPIs secundários */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-bibelo-muted">Pedidos</p>
                <ShoppingCart size={16} className="text-blue-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-bibelo-text">{ov.pedidos_periodo}</p>
                <VariacaoBadge valor={ov.pedidos_variacao} />
              </div>
              <p className="text-xs text-bibelo-muted mt-0.5">ticket {formatCurrency(ov.ticket_medio)}</p>
            </div>

            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-bibelo-muted">Clientes que compraram</p>
                <UserCheck size={16} className="text-violet-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-bibelo-text">{ov.clientes_compraram}</p>
                <VariacaoBadge valor={ov.clientes_compraram_variacao} />
              </div>
              <p className="text-xs text-bibelo-muted mt-0.5">de {ov.total_clientes} cadastrados</p>
            </div>

            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-bibelo-muted">Novos Clientes</p>
                <Users size={16} className="text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-bibelo-text">{ov.novos_clientes}</p>
                <VariacaoBadge valor={ov.novos_variacao} />
              </div>
              <p className="text-xs text-bibelo-muted mt-0.5">nos últimos {periodoLabel}</p>
            </div>

            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-bibelo-muted">Ticket Médio</p>
                <DollarSign size={16} className="text-amber-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-bibelo-text">{formatCurrency(ov.ticket_medio)}</p>
                <VariacaoBadge valor={ov.ticket_variacao} />
              </div>
              <p className="text-xs text-bibelo-muted mt-0.5">total acumulado {formatCurrency(ov.receita_total)}</p>
            </div>
          </div>

          {/* Alertas */}
          {(ov.sem_estoque > 0 || ov.estoque_baixo > 0) && (
            <div className="flex flex-wrap gap-3 mb-6">
              {ov.sem_estoque > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                  <PackageX size={16} />
                  <span><strong>{ov.sem_estoque}</strong> produtos sem estoque</span>
                </div>
              )}
              {ov.estoque_baixo > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400">
                  <AlertTriangle size={16} />
                  <span><strong>{ov.estoque_baixo}</strong> produtos com estoque baixo</span>
                </div>
              )}
            </div>
          )}

          {/* Visão Executiva (CEO View) */}
          <CeoViewSection />

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-bibelo-muted mb-4">Receita por Mês</h2>
              {revenue.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                    <XAxis dataKey="mes_label" stroke="#64748B" fontSize={12} />
                    <YAxis tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} stroke="#64748B" fontSize={12} width={55} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === 'receita' ? formatCurrency(value) : value,
                        name === 'receita' ? 'Receita' : 'Pedidos',
                      ]}
                      contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }}
                    />
                    <Bar dataKey="receita" name="receita" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Segmentos */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-bibelo-muted mb-4">Segmentos de Clientes</h2>
              {!ov.segmentos.length ? (
                <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={ov.segmentos} dataKey="total" nameKey="segmento" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                        {ov.segmentos.map((_, i) => <Cell key={i} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {ov.segmentos.map((s, i) => (
                      <div key={s.segmento} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                          <span className="text-bibelo-text capitalize">{s.segmento}</span>
                        </div>
                        <span className="text-bibelo-muted">{s.total}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Clientes */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-bibelo-muted mb-3 flex items-center gap-2">
                <TrendingUp size={14} /> Top Clientes — {periodoLabel}
              </h2>
              {!insights?.top_clientes.length ? (
                <p className="text-sm text-bibelo-muted py-4 text-center">Sem dados no período</p>
              ) : (
                <div className="space-y-2">
                  {insights.top_clientes.slice(0, 5).map((c, i) => (
                    <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-bibelo-border/50 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-bibelo-primary/20 text-bibelo-primary text-xs font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="text-bibelo-text truncate max-w-[160px]">{c.nome}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-bibelo-text font-medium">{formatCurrency(c.valor_total)}</p>
                        <p className="text-xs text-bibelo-muted">{c.total_pedidos} pedidos</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Oportunidades Perdidas */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                <PackageX size={14} /> Produtos sem Estoque (maior valor)
              </h2>
              {!insights?.oportunidades_perdidas.length ? (
                <p className="text-sm text-bibelo-muted py-4 text-center">Todos os produtos com estoque</p>
              ) : (
                <div className="space-y-2">
                  {insights.oportunidades_perdidas.slice(0, 5).map((p) => (
                    <div key={p.sku} className="flex items-center justify-between text-sm py-1.5 border-b border-bibelo-border/50 last:border-0">
                      <span className="text-bibelo-text truncate max-w-[200px]">{p.nome}</span>
                      <span className="text-red-400 font-medium">{formatCurrency(p.preco_venda)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Clientes em Risco */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-amber-400 mb-3 flex items-center gap-2">
                <TrendingDown size={14} /> Clientes em Risco de Churn
              </h2>
              {!insights?.clientes_risco.length ? (
                <p className="text-sm text-bibelo-muted py-4 text-center">Nenhum cliente em risco</p>
              ) : (
                <div className="space-y-2">
                  {insights.clientes_risco.slice(0, 5).map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-bibelo-border/50 last:border-0">
                      <span className="text-bibelo-text truncate max-w-[200px]">{c.nome}</span>
                      <span className="text-amber-400 font-medium">Score {c.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Categorias por Margem */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-bibelo-muted mb-3 flex items-center gap-2">
                <DollarSign size={14} /> Categorias por Margem
              </h2>
              {!insights?.categorias_margem.length ? (
                <p className="text-sm text-bibelo-muted py-4 text-center">Sem dados de categorias</p>
              ) : (
                <div className="space-y-2.5">
                  {insights.categorias_margem.map((c) => (
                    <div key={c.categoria}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-bibelo-text">{c.categoria} ({c.qtd})</span>
                        <span className={c.margem_media >= 50 ? 'text-emerald-400' : c.margem_media >= 30 ? 'text-amber-400' : 'text-red-400'}>
                          {c.margem_media}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-bibelo-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${c.margem_media >= 50 ? 'bg-emerald-500' : c.margem_media >= 30 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(c.margem_media, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Visitantes por Estado */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-bibelo-muted mb-3 flex items-center gap-2">
                <MapPin size={14} className="text-blue-400" /> Visitantes por Estado — {periodoLabel}
              </h2>
              {!geoData?.byRegion?.length ? (
                <p className="text-sm text-bibelo-muted py-4 text-center">Sem dados geográficos ainda</p>
              ) : (
                <div className="space-y-2">
                  {geoData.byRegion.slice(0, 10).map((r, i) => {
                    const maxVisitors = geoData.byRegion[0]?.visitors || 1;
                    return (
                      <div key={r.region}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-400/20 text-blue-400 text-xs font-bold flex items-center justify-center">
                              {i + 1}
                            </span>
                            <span className="text-bibelo-text">{ESTADO_NOMES[r.region] || r.region}</span>
                            <span className="text-xs text-bibelo-muted">{r.region}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-bibelo-text font-medium">{r.visitors}</span>
                            <span className="text-xs text-bibelo-muted ml-1">visitantes</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-bibelo-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-400 rounded-full transition-all"
                            style={{ width: `${(r.visitors / maxVisitors) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top Cidades */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-bibelo-muted mb-3 flex items-center gap-2">
                <MapPin size={14} className="text-pink-400" /> Top Cidades — {periodoLabel}
              </h2>
              {!geoData?.byCity?.length ? (
                <p className="text-sm text-bibelo-muted py-4 text-center">Sem dados de cidades ainda</p>
              ) : (
                <div className="space-y-2">
                  {geoData.byCity.slice(0, 10).map((c, i) => (
                    <div key={`${c.city}-${c.region}`} className="flex items-center justify-between text-sm py-1.5 border-b border-bibelo-border/50 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-pink-400/20 text-pink-400 text-xs font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="text-bibelo-text">{c.city}</span>
                        <span className="text-xs text-bibelo-muted">{c.region}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-bibelo-text font-medium">{c.visitors}</span>
                        <span className="text-xs text-bibelo-muted ml-1">visitantes</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* ── Atividade de Fluxos ─────────────────────────────── */}
          {flowActivity && (
            <>
              <div className="mt-8 mb-4">
                <h2 className="text-lg font-semibold text-bibelo-text flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
                  <Mail size={18} className="text-pink-400" />
                  Automações & Emails
                </h2>
                <p className="text-xs text-bibelo-muted mt-0.5">Fluxos automáticos, agendamentos e interações — {periodoLabel}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Card 1: Emails Recentes */}
                <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
                  <h3 className="text-sm font-medium text-bibelo-muted mb-3 flex items-center gap-2">
                    <Send size={14} className="text-pink-400" /> Emails Enviados
                  </h3>
                  {!flowActivity.recentSends.length ? (
                    <p className="text-sm text-bibelo-muted py-6 text-center">Nenhum email de fluxo enviado no período</p>
                  ) : (
                    <div className="space-y-1">
                      {flowActivity.recentSends.slice(0, 10).map((s, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-bibelo-border/50 last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-pink-400/15 flex items-center justify-center shrink-0">
                              <Mail size={13} className="text-pink-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-bibelo-text truncate">{s.customer_nome}</p>
                              <p className="text-xs text-bibelo-muted truncate">{s.customer_email}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <span className="inline-block text-[10px] font-medium bg-pink-400/15 text-pink-400 px-2 py-0.5 rounded-full truncate max-w-[140px]">
                              {s.flow_nome}
                            </span>
                            <p className="text-[10px] text-bibelo-muted mt-0.5">{timeAgo(s.executado_em)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card 2: Próximos Envios com Preview */}
                <UpcomingEmailsCard />

                {/* Card 3: Fluxos Ativos */}
                <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
                  <h3 className="text-sm font-medium text-bibelo-muted mb-3 flex items-center gap-2">
                    <Zap size={14} className="text-emerald-400" /> Fluxos Ativos
                  </h3>
                  {!flowActivity.activeFlows.length ? (
                    <p className="text-sm text-bibelo-muted py-6 text-center">Nenhum fluxo ativo</p>
                  ) : (
                    <div className="space-y-1">
                      {flowActivity.activeFlows.map((f) => (
                        <div key={f.id} className="flex items-center justify-between py-2 border-b border-bibelo-border/50 last:border-0">
                          <div className="min-w-0">
                            <p className="text-sm text-bibelo-text truncate">{f.nome}</p>
                            <p className="text-[10px] text-bibelo-muted">{f.gatilho}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {f.execucoes_ativas > 0 && (
                              <span className="text-[10px] font-medium bg-emerald-400/15 text-emerald-400 px-2 py-0.5 rounded-full">
                                {f.execucoes_ativas} ativo{f.execucoes_ativas !== 1 ? 's' : ''}
                              </span>
                            )}
                            {f.execucoes_concluidas > 0 && (
                              <span className="text-[10px] font-medium bg-blue-400/15 text-blue-400 px-2 py-0.5 rounded-full">
                                {f.execucoes_concluidas} ok
                              </span>
                            )}
                            {f.emails_enviados > 0 && (
                              <span className="text-[10px] font-medium bg-pink-400/15 text-pink-400 px-2 py-0.5 rounded-full">
                                {f.emails_enviados} <Mail size={10} className="inline" />
                              </span>
                            )}
                            {f.execucoes_erro > 0 && (
                              <span className="text-[10px] font-medium bg-red-400/15 text-red-400 px-2 py-0.5 rounded-full">
                                {f.execucoes_erro} erro
                              </span>
                            )}
                            {f.execucoes_ativas === 0 && f.execucoes_concluidas === 0 && f.emails_enviados === 0 && (
                              <span className="text-[10px] text-bibelo-muted">aguardando</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card 4: Interações de Email */}
                <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
                  <h3 className="text-sm font-medium text-bibelo-muted mb-3 flex items-center gap-2">
                    <Eye size={14} className="text-violet-400" /> Interações de Email
                  </h3>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <div className="text-center rounded-lg py-2 bg-emerald-400/10">
                      <p className="text-lg font-bold text-emerald-400">{flowActivity.emailInteractions.opened}</p>
                      <p className="text-[10px] text-bibelo-muted">Abertos</p>
                    </div>
                    <div className="text-center rounded-lg py-2 bg-blue-400/10">
                      <p className="text-lg font-bold text-blue-400">{flowActivity.emailInteractions.clicked}</p>
                      <p className="text-[10px] text-bibelo-muted">Cliques</p>
                    </div>
                    <div className="text-center rounded-lg py-2 bg-red-400/10">
                      <p className="text-lg font-bold text-red-400">{flowActivity.emailInteractions.bounced}</p>
                      <p className="text-[10px] text-bibelo-muted">Bounce</p>
                    </div>
                    <div className="text-center rounded-lg py-2 bg-amber-400/10">
                      <p className="text-lg font-bold text-amber-400">{flowActivity.emailInteractions.complained}</p>
                      <p className="text-[10px] text-bibelo-muted">Spam</p>
                    </div>
                  </div>
                  {!flowActivity.emailInteractions.recentEvents.length ? (
                    <p className="text-sm text-bibelo-muted py-4 text-center">Nenhuma interação no período</p>
                  ) : (
                    <div className="space-y-1">
                      {flowActivity.emailInteractions.recentEvents.slice(0, 8).map((e, i) => {
                        const tipoMap: Record<string, { bg: string; text: string; label: string }> = {
                          opened: { bg: 'bg-emerald-400/15', text: 'text-emerald-400', label: 'Abriu' },
                          clicked: { bg: 'bg-blue-400/15', text: 'text-blue-400', label: 'Clicou' },
                          bounced: { bg: 'bg-red-400/15', text: 'text-red-400', label: 'Bounce' },
                          complained: { bg: 'bg-amber-400/15', text: 'text-amber-400', label: 'Spam' },
                          delivered: { bg: 'bg-gray-400/15', text: 'text-gray-400', label: 'Entregue' },
                        };
                        const cfg = tipoMap[e.tipo] || { bg: 'bg-gray-400/15', text: 'text-gray-400', label: e.tipo };
                        const Icon = e.tipo === 'opened' ? Eye : e.tipo === 'clicked' ? MousePointerClick : e.tipo === 'delivered' ? Send : AlertTriangle;
                        return (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b border-bibelo-border/50 last:border-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-6 h-6 rounded-full ${cfg.bg} flex items-center justify-center shrink-0`}>
                                <Icon size={12} className={cfg.text} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs text-bibelo-text truncate">{e.customer_nome || e.customer_email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className={`text-[10px] font-medium ${cfg.text}`}>{cfg.label}</span>
                              <span className="text-[10px] text-bibelo-muted">{timeAgo(e.criado_em)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
