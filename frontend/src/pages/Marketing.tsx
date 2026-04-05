import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  Zap, Users, MousePointerClick, ShoppingCart,
  Eye, UserPlus, CheckCircle2, AlertCircle,
  Play, ToggleLeft, ToggleRight, ChevronRight,
  Send, Target, TrendingUp, ArrowUpRight, Activity,
  Package, Search, Globe, Filter, Mail, Phone, RefreshCw,
  ChevronLeft, ExternalLink,
} from 'lucide-react';
import api from '../lib/api';
import { timeAgo } from '../lib/format';
import FlowVisualizer from '../components/FlowVisualizer';

// ── Interfaces ────────────────────────────────────────────────

interface FlowStats {
  fluxos_ativos: number;
  execucoes_ativas: number;
  concluidas_7d: number;
  erros_7d: number;
  carrinhos_pendentes: number;
  carrinhos_notificados: number;
  carrinhos_convertidos: number;
  emails_hoje: number;
}

interface StepExecution {
  id: string;
  step_index: number;
  tipo: string;
  status: string;
  resultado: Record<string, unknown>;
  agendado_para: string | null;
  executado_em: string | null;
  criado_em: string;
}

interface Flow {
  id: string;
  nome: string;
  gatilho: string;
  ativo: boolean;
  total_ativos: number;
  total_conversoes: number;
  execucoes_ativas: string;
  execucoes_concluidas: string;
  execucoes_erro: string;
  steps: Array<{ tipo: string; template?: string; delay_horas: number }>;
  criado_em: string;
}

interface LeadStats {
  total_leads: number;
  leads_7d: number;
  leads_30d: number;
  convertidos: number;
  taxa_conversao: number;
  popups: PopupConfig[];
}

interface PopupConfig {
  id: string;
  titulo: string;
  tipo: string;
  ativo: boolean;
  exibicoes: number;
  capturas: number;
  taxa: number;
}

interface Lead {
  id: string;
  email: string;
  nome: string | null;
  telefone: string | null;
  cupom: string | null;
  popup_id: string | null;
  fonte: string;
  convertido: boolean;
  criado_em: string;
  customer_id: string | null;
}

interface Execution {
  id: string;
  nome: string;
  customer_nome: string;
  customer_email: string;
  status: string;
  step_atual: number;
  iniciado_em: string;
}

interface TrackingEvent {
  id: string;
  visitor_id: string;
  evento: string;
  pagina: string | null;
  pagina_tipo: string | null;
  resource_id: string | null;
  resource_nome: string | null;
  resource_preco: number | null;
  resource_imagem: string | null;
  customer_nome: string | null;
  customer_email: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  geo_city: string | null;
  geo_region: string | null;
  geo_country: string | null;
  referrer: string | null;
  criado_em: string;
}

interface TrackingStats {
  eventos_24h: number;
  eventos_7d: number;
  visitantes_24h: number;
  visitantes_7d: number;
  produtos_vistos_24h: number;
  add_cart_24h: number;
  clientes_identificados_7d: number;
  topProdutos: Array<{ resource_nome: string; resource_preco: number; resource_imagem: string; views: number }>;
  porTipo: Array<{ evento: string; total: number }>;
}

// ── Helpers ───────────────────────────────────────────────────

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const GATILHO_LABELS: Record<string, string> = {
  'order.abandoned': '🛒 Carrinho abandonado',
  'order.paid': '💳 Pós-compra',
  'order.first': '🎉 Primeira compra',
  'order.delivered': '📦 Produto entregue',
  'customer.created': '👋 Novo cadastro',
  'customer.inactive': '💌 Reativação',
  'lead.captured': '🎯 Lead capturado',
  'product.interested': '👀 Visitou sem comprar',
};

const STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-emerald-400/10 text-emerald-400',
  concluido: 'bg-blue-400/10 text-blue-400',
  erro: 'bg-red-400/10 text-red-400',
};

const STEP_ICONS: Record<string, string> = {
  email: '📧',
  whatsapp: '💬',
  wait: '⏳',
  condicao: '🔀',
};

const PIE_COLORS = ['#34D399', '#60A5FA', '#F87171', '#FBBF24', '#A78BFA'];

function parseSteps(steps: unknown): Array<{ tipo: string; template?: string; delay_horas: number }> {
  try {
    const parsed = typeof steps === 'string' ? JSON.parse(steps) : steps;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

const STEP_STATUS_COLORS: Record<string, { dot: string; text: string }> = {
  concluido: { dot: 'bg-emerald-400', text: 'text-emerald-400' },
  executando: { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-400' },
  pendente: { dot: 'bg-bibelo-muted/40', text: 'text-bibelo-muted' },
  erro: { dot: 'bg-red-400', text: 'text-red-400' },
  pulado: { dot: 'bg-amber-400', text: 'text-amber-400' },
  ignorado: { dot: 'bg-amber-400', text: 'text-amber-400' },
};

// ── Component ─────────────────────────────────────────────────

export default function Marketing() {
  const [tab, setTab] = useState<'overview' | 'fluxos' | 'leads' | 'atividade' | 'cupons'>('overview');
  const [flowStats, setFlowStats] = useState<FlowStats | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const [trackingStats, setTrackingStats] = useState<TrackingStats | null>(null);
  const [funnel, setFunnel] = useState<{ steps: Array<{ etapa: string; total: number; taxa: number }>; taxa_conversao_geral: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, flowsRes, leadsStatsRes, leadsRes, timelineRes, trackStatsRes, funnelRes] = await Promise.all([
        api.get('/flows/stats/overview'),
        api.get('/flows'),
        api.get('/leads/stats'),
        api.get('/leads?page=1'),
        api.get('/tracking/timeline?limit=50'),
        api.get('/tracking/stats'),
        api.get('/tracking/funnel?dias=7'),
      ]);
      setFlowStats(statsRes.data);
      setFlows(flowsRes.data);
      setLeadStats(leadsStatsRes.data);
      setLeads(leadsRes.data.leads);
      setTrackingEvents(timelineRes.data);
      setTrackingStats(trackStatsRes.data);
      setFunnel(funnelRes.data);
      setLastUpdate(new Date());
      setError(null);
    } catch {
      setError('Erro ao carregar dados de automação');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh — 10s na aba Atividade, 30s nas outras
  useEffect(() => {
    const ms = tab === 'atividade' ? 10000 : 30000;
    const interval = setInterval(async () => {
      try {
        if (tab === 'overview') {
          const [statsRes, leadsStatsRes, funnelRes] = await Promise.all([
            api.get('/flows/stats/overview'),
            api.get('/leads/stats'),
            api.get('/tracking/funnel?dias=7'),
          ]);
          setFlowStats(statsRes.data);
          setLeadStats(leadsStatsRes.data);
          setFunnel(funnelRes.data);
        } else if (tab === 'atividade') {
          const [timelineRes, trackStatsRes] = await Promise.all([
            api.get('/tracking/timeline?limit=50'),
            api.get('/tracking/stats'),
          ]);
          setTrackingEvents(timelineRes.data);
          setTrackingStats(trackStatsRes.data);
        } else if (tab === 'fluxos') {
          const [statsRes, flowsRes] = await Promise.all([
            api.get('/flows/stats/overview'),
            api.get('/flows'),
          ]);
          setFlowStats(statsRes.data);
          setFlows(flowsRes.data);
        } else if (tab === 'leads') {
          const [leadsStatsRes, leadsRes] = await Promise.all([
            api.get('/leads/stats'),
            api.get('/leads?page=1'),
          ]);
          setLeadStats(leadsStatsRes.data);
          setLeads(leadsRes.data.leads);
        }
        setLastUpdate(new Date());
      } catch { /* silencioso no polling */ }
    }, ms);
    return () => clearInterval(interval);
  }, [tab]);

  const fetchFlowDetail = async (flowId: string) => {
    try {
      const { data } = await api.get(`/flows/${flowId}`);
      setExecutions(data.executions || []);
      setSelectedFlow(flowId);
    } catch (err) { console.error('Erro ao buscar detalhe do fluxo:', err); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bibelo-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Marketing</h1>
          <p className="text-sm text-bibelo-muted mt-1">Automações, leads e campanhas do ecossistema Bibelô</p>
        </div>
        <div className="flex items-center gap-3">
        <span className="text-[10px] text-bibelo-muted/60 hidden md:inline">
          Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <div className="flex items-center gap-1 bg-bibelo-card border border-bibelo-border rounded-lg p-1">
          {(['overview', 'atividade', 'fluxos', 'leads', 'cupons'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text'
              }`}
            >
              {t === 'overview' ? 'Visão Geral' : t === 'atividade' ? 'Atividade' : t === 'fluxos' ? 'Fluxos' : t === 'leads' ? 'Leads' : 'Cupons'}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Erro global */}
      {error && (
        <div className="bg-red-400/10 border border-red-400/20 rounded-xl p-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {tab === 'overview' && <OverviewTab flowStats={flowStats} flows={flows} leadStats={leadStats} leads={leads} onFlowClick={fetchFlowDetail} />}
      {tab === 'atividade' && <AtividadeTab events={trackingEvents} stats={trackingStats} funnel={funnel} onRefresh={fetchAll} lastUpdate={lastUpdate} />}
      {tab === 'fluxos' && <FluxosTab flows={flows} executions={executions} selectedFlow={selectedFlow} onFlowClick={fetchFlowDetail} onRefresh={fetchAll} />}
      {tab === 'leads' && <LeadsTab leadStats={leadStats} />}
      {tab === 'cupons' && <CuponsTab />}
    </div>
  );
}

// ── Aba Cupons ──────────────────────────────────────────────────

interface CupomFluxo {
  cupom: string;
  customer_nome: string;
  customer_email: string;
  flow_nome: string;
  gerado_em: string;
  usado: boolean;
  pedido_numero: string | null;
  pedido_valor: number | null;
  usado_em: string | null;
}

interface LeadClube {
  nome: string | null;
  email: string;
  cupom: string;
  criado_em: string;
  email_verificado: boolean;
  usado: boolean;
  pedido_valor: number | null;
  usado_em: string | null;
}

interface CupomResumo {
  cupons_unicos_gerados: number;
  cupons_unicos_usados: number;
  leads_com_cupom: number;
  leads_que_usaram: number;
  receita_cupons: number;
}

function CuponsTab() {
  const [cuponsFluxo, setCuponsFluxo] = useState<CupomFluxo[]>([]);
  const [leadsClube, setLeadsClube] = useState<LeadClube[]>([]);
  const [resumo, setResumo] = useState<CupomResumo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/campaigns/cupons').then((r) => {
      setCuponsFluxo(r.data.cupons_fluxo || []);
      setLeadsClube(r.data.leads_clube || []);
      setResumo(r.data.resumo || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-bibelo-muted">Carregando cupons...</div>;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Cupons únicos', value: resumo.cupons_unicos_gerados, sub: 'gerados via fluxos' },
            { label: 'Usados', value: resumo.cupons_unicos_usados, sub: `${resumo.cupons_unicos_gerados > 0 ? Math.round(resumo.cupons_unicos_usados / resumo.cupons_unicos_gerados * 100) : 0}% conversão` },
            { label: 'Leads Clube', value: resumo.leads_com_cupom, sub: 'com cupom CLUBEBIBELO' },
            { label: 'Leads convertidos', value: resumo.leads_que_usaram, sub: `${resumo.leads_com_cupom > 0 ? Math.round(resumo.leads_que_usaram / resumo.leads_com_cupom * 100) : 0}% conversão` },
            { label: 'Receita cupons', value: `R$ ${resumo.receita_cupons.toFixed(2).replace('.', ',')}`, sub: 'total atribuído' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
              <p className="text-xs text-bibelo-muted font-medium">{kpi.label}</p>
              <p className="text-xl font-bold text-bibelo-text mt-1">{kpi.value}</p>
              <p className="text-[10px] text-bibelo-muted/60 mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Cupons únicos (de fluxos) */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-bibelo-border flex items-center justify-between">
          <h3 className="text-sm font-bold text-bibelo-text">Cupons Únicos (Fluxos Automáticos)</h3>
          <span className="text-xs text-bibelo-muted">{cuponsFluxo.length} cupons</span>
        </div>
        {cuponsFluxo.length === 0 ? (
          <div className="px-5 py-8 text-center text-bibelo-muted text-sm">
            Nenhum cupom único gerado ainda. Eles são criados automaticamente quando os fluxos condicionais chegam no step de desconto.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bibelo-border text-left text-xs text-bibelo-muted">
                  <th className="px-4 py-2 font-medium">Cupom</th>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Fluxo</th>
                  <th className="px-4 py-2 font-medium">Gerado em</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Pedido</th>
                </tr>
              </thead>
              <tbody>
                {cuponsFluxo.map((c) => (
                  <tr key={c.cupom} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20">
                    <td className="px-4 py-2.5 font-mono font-bold text-bibelo-primary text-xs">{c.cupom}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-bibelo-text">{c.customer_nome}</p>
                      <p className="text-xs text-bibelo-muted">{c.customer_email}</p>
                    </td>
                    <td className="px-4 py-2.5 text-bibelo-muted">{c.flow_nome}</td>
                    <td className="px-4 py-2.5 text-bibelo-muted">{timeAgo(c.gerado_em)}</td>
                    <td className="px-4 py-2.5">
                      {c.usado
                        ? <span className="px-2 py-0.5 bg-emerald-400/10 text-emerald-400 rounded-full text-xs font-medium">Usado</span>
                        : <span className="px-2 py-0.5 bg-amber-400/10 text-amber-400 rounded-full text-xs font-medium">Pendente</span>}
                    </td>
                    <td className="px-4 py-2.5 text-bibelo-muted">
                      {c.usado ? `#${c.pedido_numero} · R$ ${(c.pedido_valor || 0).toFixed(2).replace('.', ',')}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leads Clube Bibelô */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-bibelo-border flex items-center justify-between">
          <h3 className="text-sm font-bold text-bibelo-text">Leads Clube Bibelô (CLUBEBIBELO)</h3>
          <span className="text-xs text-bibelo-muted">{leadsClube.length} leads</span>
        </div>
        {leadsClube.length === 0 ? (
          <div className="px-5 py-8 text-center text-bibelo-muted text-sm">Nenhum lead com cupom Clube ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bibelo-border text-left text-xs text-bibelo-muted">
                  <th className="px-4 py-2 font-medium">Lead</th>
                  <th className="px-4 py-2 font-medium">Cupom</th>
                  <th className="px-4 py-2 font-medium">Cadastro</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {leadsClube.map((l) => (
                  <tr key={l.email} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-bibelo-text">{l.nome || l.email.split('@')[0]}</p>
                      <p className="text-xs text-bibelo-muted">{l.email}</p>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold text-bibelo-primary text-xs">{l.cupom}</td>
                    <td className="px-4 py-2.5 text-bibelo-muted">{timeAgo(l.criado_em)}</td>
                    <td className="px-4 py-2.5">
                      {l.email_verificado
                        ? <span className="text-emerald-400 text-xs">✓ Verificado</span>
                        : <span className="text-amber-400 text-xs">Pendente</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {l.usado
                        ? <span className="px-2 py-0.5 bg-emerald-400/10 text-emerald-400 rounded-full text-xs font-medium">Comprou · R$ {(l.pedido_valor || 0).toFixed(2).replace('.', ',')}</span>
                        : <span className="text-bibelo-muted text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────

function OverviewTab({ flowStats, flows, leadStats, leads, onFlowClick }: {
  flowStats: FlowStats | null;
  flows: Flow[];
  leadStats: LeadStats | null;
  leads: Lead[];
  onFlowClick: (id: string) => void;
}) {
  const totalExecAtivas = flows.reduce((acc, f) => acc + parseInt(f.execucoes_ativas || '0', 10), 0);

  const kpis = [
    { label: 'Fluxos Ativos', value: flowStats?.fluxos_ativos || 0, icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Execuções Ativas', value: totalExecAtivas, icon: Play, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Emails Hoje', value: flowStats?.emails_hoje || 0, icon: Send, color: 'text-violet-400', bg: 'bg-violet-400/10' },
    { label: 'Leads Capturados', value: leadStats?.total_leads || 0, icon: UserPlus, color: 'text-pink-400', bg: 'bg-pink-400/10' },
    { label: 'Leads (7 dias)', value: leadStats?.leads_7d || 0, icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { label: 'Taxa Conversão', value: `${leadStats?.taxa_conversao || 0}%`, icon: Target, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  ];

  // Dados para gráfico de fluxos
  const flowChartData = flows.map((f) => ({
    nome: f.nome.length > 18 ? f.nome.substring(0, 18) + '...' : f.nome,
    concluidas: parseInt(f.execucoes_concluidas || '0', 10),
    ativas: parseInt(f.execucoes_ativas || '0', 10),
    erros: parseInt(f.execucoes_erro || '0', 10),
  }));

  // Dados para gráfico de carrinhos
  const carrinhoData = [
    { name: 'Pendentes', value: flowStats?.carrinhos_pendentes || 0 },
    { name: 'Notificados', value: flowStats?.carrinhos_notificados || 0 },
    { name: 'Convertidos', value: flowStats?.carrinhos_convertidos || 0 },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                <kpi.icon size={16} className={kpi.color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-bibelo-text">{kpi.value}</p>
            <p className="text-xs text-bibelo-muted mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Gráfico de fluxos */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-bibelo-text mb-4">Execuções por Fluxo</h3>
          {flowChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={flowChartData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" tick={{ fill: '#999', fontSize: 11 }} />
                <YAxis type="category" dataKey="nome" width={130} tick={{ fill: '#999', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="concluidas" name="Concluídas" fill="#34D399" radius={[0, 4, 4, 0]} />
                <Bar dataKey="ativas" name="Ativas" fill="#60A5FA" radius={[0, 4, 4, 0]} />
                <Bar dataKey="erros" name="Erros" fill="#F87171" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-bibelo-muted text-sm">Aguardando execuções</div>
          )}
        </div>

        {/* Carrinhos abandonados */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-bibelo-text mb-4">Carrinhos Abandonados</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-400">{flowStats?.carrinhos_pendentes || 0}</p>
              <p className="text-xs text-bibelo-muted">Pendentes</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-400">{flowStats?.carrinhos_notificados || 0}</p>
              <p className="text-xs text-bibelo-muted">Notificados</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-400">{flowStats?.carrinhos_convertidos || 0}</p>
              <p className="text-xs text-bibelo-muted">Recuperados</p>
            </div>
          </div>
          {carrinhoData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={carrinhoData} cx="50%" cy="50%" outerRadius={70} innerRadius={40} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {carrinhoData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-bibelo-muted text-sm">Nenhum carrinho detectado ainda</div>
          )}
        </div>
      </div>

      {/* Popup Performance + Leads Recentes */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Popup */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-bibelo-text mb-4">Popup de Captura</h3>
          {leadStats?.popups?.map((p) => (
            <div key={p.id} className="flex items-center gap-4 p-3 rounded-lg bg-bibelo-bg mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.ativo ? 'bg-emerald-400/10' : 'bg-bibelo-border'}`}>
                <MousePointerClick size={18} className={p.ativo ? 'text-emerald-400' : 'text-bibelo-muted'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-bibelo-text truncate">{p.titulo}</p>
                <p className="text-xs text-bibelo-muted">
                  {p.tipo === 'timer' ? 'Timer' : 'Exit intent'} · {p.ativo ? 'Ativo' : 'Inativo'}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-bibelo-muted"><Eye size={12} className="inline mr-1" />{p.exibicoes}</span>
                  <span className="text-bibelo-muted"><UserPlus size={12} className="inline mr-1" />{p.capturas}</span>
                  <span className={`font-semibold ${(p.taxa || 0) > 10 ? 'text-emerald-400' : 'text-bibelo-muted'}`}>
                    {p.taxa || 0}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Leads recentes */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-bibelo-text mb-4">Leads Recentes</h3>
          <div className="space-y-2">
            {leads.length === 0 ? (
              <p className="text-sm text-bibelo-muted text-center py-8">Nenhum lead capturado ainda</p>
            ) : (
              leads.slice(0, 8).map((l) => (
                <div key={l.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-bibelo-bg transition-colors">
                  <div className="w-8 h-8 rounded-full bg-pink-400/10 flex items-center justify-center text-sm font-bold text-pink-400">
                    {(l.nome || l.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-bibelo-text truncate">{l.nome || l.email}</p>
                    <p className="text-xs text-bibelo-muted truncate">
                      {l.email}{l.telefone ? ` · ${l.telefone}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    {l.cupom && (
                      <span className="text-[10px] px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full font-medium">
                        {l.cupom}
                      </span>
                    )}
                    <p className="text-[10px] text-bibelo-muted mt-1">{timeAgo(l.criado_em)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Fluxos ativos (resumo) */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-bibelo-text mb-4">Fluxos Automáticos</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {flows.map((f) => (
            <button
              key={f.id}
              onClick={() => onFlowClick(f.id)}
              className="text-left p-4 rounded-xl border border-bibelo-border hover:border-bibelo-primary/50 transition-all bg-bibelo-bg group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg">{GATILHO_LABELS[f.gatilho]?.split(' ')[0] || '⚡'}</span>
                <span className={`w-2 h-2 rounded-full ${f.ativo ? 'bg-emerald-400' : 'bg-bibelo-muted/30'}`} />
              </div>
              <p className="text-sm font-medium text-bibelo-text mb-1 group-hover:text-bibelo-primary transition-colors">{f.nome}</p>
              <p className="text-xs text-bibelo-muted mb-3">{GATILHO_LABELS[f.gatilho]?.split(' ').slice(1).join(' ') || f.gatilho}</p>
              <div className="flex items-center gap-1">
                {parseSteps(f.steps).map((s: { tipo: string }, i: number) => (
                  <span key={i} className="text-xs" title={s.tipo}>{STEP_ICONS[s.tipo] || '❓'}</span>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-bibelo-border">
                <span className="text-xs text-bibelo-muted"><CheckCircle2 size={11} className="inline mr-1 text-emerald-400" />{f.execucoes_concluidas || 0}</span>
                <span className="text-xs text-bibelo-muted"><Play size={11} className="inline mr-1 text-blue-400" />{f.execucoes_ativas || 0}</span>
                {parseInt(f.execucoes_erro || '0', 10) > 0 && (
                  <span className="text-xs text-red-400"><AlertCircle size={11} className="inline mr-1" />{f.execucoes_erro}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Fluxos Tab ────────────────────────────────────────────────

function FluxosTab({ flows, executions, selectedFlow, onFlowClick, onRefresh }: {
  flows: Flow[];
  executions: Execution[];
  selectedFlow: string | null;
  onFlowClick: (id: string) => void;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<'todos' | 'ativos' | 'inativos'>('todos');
  const [confirmToggle, setConfirmToggle] = useState<string | null>(null);
  const [expandedExec, setExpandedExec] = useState<string | null>(null);
  const [showReminders, setShowReminders] = useState(false);
  const [reminderStats, setReminderStats] = useState<{
    pendentes: number; lembrete_1_enviado: number; lembrete_2_enviado: number;
    verificados_total: number; leads_total: number;
    pendentes_lista: Array<{ id: string; nome: string; email: string; cupom: string | null; lembretes_enviados: number; ultimo_lembrete_em: string | null; criado_em: string }>;
  } | null>(null);
  const [showReminderPreview, setShowReminderPreview] = useState(false);

  useEffect(() => {
    api.get('/flows/stats/reminders').then(({ data }) => {
      setReminderStats({
        pendentes: Number(data.pendentes_count ?? data.pendentes?.length ?? 0),
        lembrete_1_enviado: Number(data.lembrete_1_enviado ?? 0),
        lembrete_2_enviado: Number(data.lembrete_2_enviado ?? 0),
        verificados_total: Number(data.verificados_total ?? 0),
        leads_total: Number(data.leads_total ?? 0),
        pendentes_lista: data.pendentes || [],
      });
    }).catch(() => {});
  }, []);
  const [stepExecs, setStepExecs] = useState<StepExecution[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);

  const selected = flows.find((f) => f.id === selectedFlow);
  const filtered = flows.filter(f =>
    filter === 'todos' ? true : filter === 'ativos' ? f.ativo : !f.ativo
  );

  const toggleFlow = async (flowId: string) => {
    const flow = flows.find(f => f.id === flowId);
    if (flow?.ativo && Number(flow.execucoes_ativas) > 0) {
      setConfirmToggle(flowId);
      return;
    }
    try {
      await api.post(`/flows/${flowId}/toggle`);
      onRefresh();
    } catch { /* silencioso */ }
  };

  const confirmAndToggle = async () => {
    if (!confirmToggle) return;
    try {
      await api.post(`/flows/${confirmToggle}/toggle`);
      onRefresh();
    } catch { /* silencioso */ }
    setConfirmToggle(null);
  };

  const fetchStepDetail = async (flowId: string, execId: string) => {
    if (expandedExec === execId) { setExpandedExec(null); return; }
    setLoadingSteps(true);
    setExpandedExec(execId);
    try {
      const { data } = await api.get(`/flows/${flowId}/executions/${execId}`);
      setStepExecs(data.steps || []);
    } catch { setStepExecs([]); }
    finally { setLoadingSteps(false); }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Lista de fluxos */}
      <div className="lg:col-span-1 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-bibelo-text">Fluxos ({filtered.length})</h3>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as typeof filter)}
            className="text-xs bg-bibelo-bg border border-bibelo-border rounded-lg px-2 py-1 text-bibelo-muted"
          >
            <option value="todos">Todos</option>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
          </select>
        </div>
        {filtered.map((f) => (
          <div
            key={f.id}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              selectedFlow === f.id
                ? 'border-bibelo-primary bg-bibelo-primary/5'
                : 'border-bibelo-border bg-bibelo-card hover:border-bibelo-primary/30'
            }`}
          >
            <div className="flex items-center gap-3" onClick={() => onFlowClick(f.id)}>
              <span className="text-xl">{GATILHO_LABELS[f.gatilho]?.split(' ')[0] || '⚡'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-bibelo-text truncate">{f.nome}</p>
                <p className="text-xs text-bibelo-muted">{GATILHO_LABELS[f.gatilho]?.split(' ').slice(1).join(' ') || f.gatilho}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); toggleFlow(f.id); }}
                className="shrink-0"
                title={f.ativo ? 'Desativar' : 'Ativar'}
              >
                {f.ativo ? (
                  <ToggleRight size={24} className="text-emerald-400" />
                ) : (
                  <ToggleLeft size={24} className="text-bibelo-muted" />
                )}
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {parseSteps(f.steps).map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={10} className="text-bibelo-muted/40" />}
                  <span className="text-xs px-2 py-0.5 bg-bibelo-bg rounded-md text-bibelo-muted" title={s.template || s.tipo}>
                    {STEP_ICONS[s.tipo]}{s.delay_horas > 0 ? ` ${s.delay_horas}h` : ''}
                  </span>
                </div>
              ))}
            </div>
            {/* Mini stats */}
            <div className="flex items-center gap-3 mt-2 text-[10px] text-bibelo-muted">
              <span className="text-emerald-400">{f.execucoes_concluidas || 0} ok</span>
              <span className="text-blue-400">{f.execucoes_ativas || 0} ativas</span>
              {Number(f.execucoes_erro) > 0 && <span className="text-red-400">{f.execucoes_erro} erros</span>}
            </div>
          </div>
        ))}

        {/* Card: Lembrete de Verificação (automação do sistema) */}
        <div
          className={`p-4 rounded-xl border transition-all cursor-pointer mt-3 ${
            showReminders
              ? 'border-amber-400/60 bg-amber-400/5'
              : 'border-bibelo-border bg-bibelo-card hover:border-amber-400/30'
          }`}
          onClick={() => { setShowReminders(!showReminders); onFlowClick(''); }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔔</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-bibelo-text">Lembrete de verificação</p>
              <p className="text-xs text-bibelo-muted">Automação do sistema</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 font-medium">Ativo</span>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="text-xs px-2 py-0.5 bg-bibelo-bg rounded-md text-bibelo-muted">📧 3h</span>
            <ChevronRight size={10} className="text-bibelo-muted/40" />
            <span className="text-xs px-2 py-0.5 bg-bibelo-bg rounded-md text-bibelo-muted">⏳ 24h</span>
            <ChevronRight size={10} className="text-bibelo-muted/40" />
            <span className="text-xs px-2 py-0.5 bg-bibelo-bg rounded-md text-bibelo-muted">📧 último</span>
          </div>
          {reminderStats && (
            <div className="flex items-center gap-3 mt-2 text-[10px] text-bibelo-muted">
              <span className="text-amber-400">{reminderStats.pendentes_lista.length} pendentes</span>
              <span className="text-blue-400">{reminderStats.lembrete_1_enviado} lembrete 1</span>
              <span className="text-emerald-400">{reminderStats.verificados_total} verificados</span>
            </div>
          )}
        </div>
      </div>

      {/* Detalhe do fluxo OU preview de lembretes */}
      <div className="lg:col-span-2">
        {selected ? (
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{GATILHO_LABELS[selected.gatilho]?.split(' ')[0] || '⚡'}</span>
              <div>
                <h3 className="text-lg font-semibold text-bibelo-text">{selected.nome}</h3>
                <p className="text-sm text-bibelo-muted">{GATILHO_LABELS[selected.gatilho] || selected.gatilho}</p>
              </div>
              <span className={`ml-auto text-xs px-3 py-1 rounded-full font-medium ${selected.ativo ? 'bg-emerald-400/10 text-emerald-400' : 'bg-bibelo-border text-bibelo-muted'}`}>
                {selected.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            {/* Visualização do fluxo */}
            <div className="mb-6 p-4 bg-bibelo-bg rounded-xl max-h-[500px] overflow-y-auto">
              <FlowVisualizer steps={parseSteps(selected.steps) as Array<{ tipo: 'email' | 'whatsapp' | 'wait' | 'condicao'; template?: string; delay_horas: number; condicao?: string; ref_step?: number; sim?: number; nao?: number; proximo?: number }>} gatilho={selected.gatilho} flowId={selected.id} />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-3 bg-bibelo-bg rounded-xl">
                <p className="text-xl font-bold text-emerald-400">{selected.execucoes_concluidas || 0}</p>
                <p className="text-xs text-bibelo-muted">Concluídas</p>
              </div>
              <div className="text-center p-3 bg-bibelo-bg rounded-xl">
                <p className="text-xl font-bold text-blue-400">{selected.execucoes_ativas || 0}</p>
                <p className="text-xs text-bibelo-muted">Em andamento</p>
              </div>
              <div className="text-center p-3 bg-bibelo-bg rounded-xl">
                <p className="text-xl font-bold text-red-400">{selected.execucoes_erro || 0}</p>
                <p className="text-xs text-bibelo-muted">Erros</p>
              </div>
            </div>

            {/* Execuções recentes */}
            <h4 className="text-sm font-semibold text-bibelo-text mb-3">Execuções Recentes</h4>
            {executions.length === 0 ? (
              <p className="text-sm text-bibelo-muted text-center py-6">Nenhuma execução ainda</p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {executions.map((e) => {
                  const steps = parseSteps(selected.steps);
                  const totalSteps = steps.length;
                  const progressPct = totalSteps > 0 ? Math.round((e.step_atual / totalSteps) * 100) : 0;
                  const isExpanded = expandedExec === e.id;

                  return (
                    <div key={e.id} className="rounded-lg bg-bibelo-bg overflow-hidden">
                      <div
                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-bibelo-bg/80 transition-colors"
                        onClick={() => fetchStepDetail(selected.id, e.id)}
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          e.status === 'ativo' ? 'bg-emerald-400 animate-pulse' :
                          e.status === 'concluido' ? 'bg-blue-400' : 'bg-red-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-bibelo-text truncate">{e.customer_nome || e.customer_email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {/* Barra de progresso */}
                            <div className="flex-1 h-1.5 bg-bibelo-border rounded-full overflow-hidden max-w-[120px]">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  e.status === 'concluido' ? 'bg-blue-400' :
                                  e.status === 'erro' ? 'bg-red-400' : 'bg-emerald-400'
                                }`}
                                style={{ width: e.status === 'concluido' ? '100%' : `${progressPct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-bibelo-muted">
                              {e.status === 'concluido' ? `${totalSteps}/${totalSteps}` : `${e.step_atual}/${totalSteps}`}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[e.status] || ''}`}>
                            {e.status}
                          </span>
                          <p className="text-[10px] text-bibelo-muted mt-1">{timeAgo(e.iniciado_em)}</p>
                        </div>
                        <ChevronRight size={14} className={`text-bibelo-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>

                      {/* Detalhe expandido: timeline de steps */}
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-bibelo-border/50">
                          {loadingSteps ? (
                            <div className="flex items-center gap-2 py-3 text-xs text-bibelo-muted">
                              <div className="animate-spin rounded-full h-3 w-3 border-b border-bibelo-primary" /> Carregando steps...
                            </div>
                          ) : stepExecs.length === 0 ? (
                            <p className="text-xs text-bibelo-muted py-3">Nenhum step executado ainda</p>
                          ) : (
                            <div className="pt-3 space-y-0">
                              {stepExecs.map((step, i) => {
                                const stepDef = steps[step.step_index];
                                const colors = STEP_STATUS_COLORS[step.status] || STEP_STATUS_COLORS.pendente;
                                const resultado = step.resultado || {};
                                return (
                                  <div key={step.id} className="flex gap-3">
                                    {/* Linha vertical + dot */}
                                    <div className="flex flex-col items-center">
                                      <div className={`w-3 h-3 rounded-full shrink-0 mt-0.5 ${colors.dot}`} />
                                      {i < stepExecs.length - 1 && <div className="w-px flex-1 bg-bibelo-border/50 my-1" />}
                                    </div>
                                    {/* Conteúdo do step */}
                                    <div className="pb-3 min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm">{STEP_ICONS[step.tipo]}</span>
                                        <span className="text-xs font-medium text-bibelo-text">
                                          {stepDef?.template || step.tipo}
                                        </span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors.text} bg-current/10`}>
                                          {step.status}
                                        </span>
                                      </div>
                                      {/* Detalhes do resultado */}
                                      <div className="text-[10px] text-bibelo-muted mt-0.5 space-y-0.5">
                                        {step.executado_em && (
                                          <p>Executado: {new Date(step.executado_em).toLocaleString('pt-BR')}</p>
                                        )}
                                        {step.agendado_para && step.status === 'pendente' && (
                                          <p>Agendado: {new Date(step.agendado_para).toLocaleString('pt-BR')}</p>
                                        )}
                                        {'message_id' in resultado && (
                                          <p className="text-emerald-400/70">Email enviado (ID: {String(resultado.message_id).substring(0, 16)}...)</p>
                                        )}
                                        {'error' in resultado && (
                                          <p className="text-red-400">{String(resultado.error)}</p>
                                        )}
                                        {'motivo' in resultado && (
                                          <p className="text-amber-400">{String(resultado.motivo)}</p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : showReminders && reminderStats ? (
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🔔</span>
              <div>
                <h3 className="text-lg font-semibold text-bibelo-text">Lembrete de verificação</h3>
                <p className="text-sm text-bibelo-muted">Reenvia email de confirmação para leads que esqueceram de verificar</p>
              </div>
              <span className="ml-auto text-xs px-3 py-1 rounded-full font-medium bg-emerald-400/10 text-emerald-400">Ativo</span>
            </div>

            {/* Timeline visual do fluxo */}
            <div className="mb-6 p-4 bg-bibelo-bg rounded-xl">
              <div className="flex flex-col items-center gap-0">
                {/* Trigger */}
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                  <span className="text-sm">🎯</span>
                  <span className="text-xs font-medium text-emerald-400">Lead capturado (sem verificação)</span>
                </div>
                <div className="w-px h-6 bg-bibelo-border"></div>

                {/* Step 1: Espera 3h */}
                <div className="w-full max-w-sm p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-center">
                  <span className="text-lg">⏳</span>
                  <p className="text-xs font-medium text-amber-400 mt-1">Aguarda 3 horas</p>
                  <p className="text-[10px] text-bibelo-muted">Tempo para o lead verificar sozinho</p>
                </div>
                <div className="w-px h-6 bg-bibelo-border"></div>

                {/* Step 2: Email lembrete 1 */}
                <div className="w-full max-w-sm p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-center">
                  <span className="text-lg">📧</span>
                  <p className="text-xs font-medium text-blue-400 mt-1">1º Lembrete</p>
                  <p className="text-[10px] text-bibelo-muted">"Você esqueceu de confirmar seu desconto de 7%!"</p>
                </div>
                <div className="w-px h-6 bg-bibelo-border"></div>

                {/* Step 3: Espera 24h */}
                <div className="w-full max-w-sm p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-center">
                  <span className="text-lg">⏳</span>
                  <p className="text-xs font-medium text-amber-400 mt-1">Aguarda 24 horas</p>
                  <p className="text-[10px] text-bibelo-muted">Última chance antes do 2º lembrete</p>
                </div>
                <div className="w-px h-6 bg-bibelo-border"></div>

                {/* Step 4: Email lembrete 2 */}
                <div className="w-full max-w-sm p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-center">
                  <span className="text-lg">📧</span>
                  <p className="text-xs font-medium text-red-400 mt-1">2º Lembrete (último)</p>
                  <p className="text-[10px] text-bibelo-muted">"Última chance! Seu desconto de 7% vai expirar!"</p>
                </div>
                <div className="w-px h-6 bg-bibelo-border"></div>

                {/* Fim */}
                <div className="flex items-center gap-2 px-4 py-2 bg-bibelo-border/50 rounded-full">
                  <span className="text-xs font-medium text-bibelo-muted">FIM — máx 2 lembretes</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="text-center p-3 bg-bibelo-bg rounded-xl">
                <p className="text-xl font-bold text-amber-400">{reminderStats.pendentes_lista.length}</p>
                <p className="text-xs text-bibelo-muted">Pendentes</p>
              </div>
              <div className="text-center p-3 bg-bibelo-bg rounded-xl">
                <p className="text-xl font-bold text-blue-400">{reminderStats.lembrete_1_enviado}</p>
                <p className="text-xs text-bibelo-muted">1º lembrete</p>
              </div>
              <div className="text-center p-3 bg-bibelo-bg rounded-xl">
                <p className="text-xl font-bold text-red-400">{reminderStats.lembrete_2_enviado}</p>
                <p className="text-xs text-bibelo-muted">2º lembrete</p>
              </div>
              <div className="text-center p-3 bg-bibelo-bg rounded-xl">
                <p className="text-xl font-bold text-emerald-400">{reminderStats.verificados_total}</p>
                <p className="text-xs text-bibelo-muted">Verificados</p>
              </div>
            </div>

            {/* Preview do email */}
            <div className="mb-6">
              <button
                onClick={() => setShowReminderPreview(!showReminderPreview)}
                className="flex items-center gap-2 text-sm text-bibelo-primary hover:underline mb-3"
              >
                <Mail size={14} />
                {showReminderPreview ? 'Ocultar preview do email' : 'Ver preview do email de lembrete'}
              </button>
              {showReminderPreview && (
                <div className="rounded-xl overflow-hidden border border-bibelo-border">
                  <iframe
                    srcDoc={`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{font-family:Jost,'Segoe UI',Arial,sans-serif;}</style>
</head>
<body style="margin:0;padding:0;background:#ffe5ec;">
<div style="max-width:600px;margin:0 auto;padding:20px 10px;">
  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(254,104,196,0.15);">
    <div style="background:linear-gradient(160deg,#ffe5ec 0%,#fff7c1 50%,#ffe5ec 100%);padding:32px 30px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-20px;right:-20px;width:80px;height:80px;background:rgba(254,104,196,0.06);border-radius:50%;"></div>
      <div style="background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;display:inline-block;padding:5px 16px;border-radius:50px;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">LEMBRETE</div>
      <h1 style="color:#2d2d2d;margin:0 0 6px;font-size:26px;font-weight:600;font-family:Cormorant Garamond,Georgia,serif;line-height:1.2;">Ainda d&aacute; tempo!</h1>
      <p style="color:#999;margin:0;font-size:13px;">Seu desconto de 7% est&aacute; esperando</p>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#fe68c4,#f472b6,#fe68c4);"></div>
    <div style="padding:32px 30px;text-align:center;">
      <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 8px;">
        Oi, <strong style="color:#fe68c4;">Maria</strong>! &#x1F44B;
      </p>
      <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 24px;">
        Notamos que voc&ecirc; ainda n&atilde;o confirmou seu e-mail. Falta s&oacute; um clique!
      </p>
      <div style="background:linear-gradient(135deg,#ffe5ec,#fff7c1);border-radius:12px;padding:16px 20px;margin:0 0 24px;text-align:left;">
        <p style="margin:0 0 6px;font-size:13px;color:#555;">&#x1F3F7;&#xFE0F; 7% de desconto na 1&ordf; compra</p>
        <p style="margin:0 0 6px;font-size:13px;color:#555;">&#x1F69A; Frete gr&aacute;tis Sul/Sudeste acima de R$79</p>
        <p style="margin:0 0 6px;font-size:13px;color:#555;">&#x1F381; Mimo surpresa em toda compra</p>
        <p style="margin:0;font-size:13px;color:#555;">&#x2728; Novidades antes de todo mundo</p>
      </div>
      <a href="javascript:void(0)" onclick="return false" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:16px 44px;border-radius:50px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 15px rgba(254,104,196,0.3);cursor:default;">
        Confirmar agora &#x2192;
      </a>
      <p style="color:#aaa;font-size:12px;margin:20px 0 0;">
        Se voc&ecirc; n&atilde;o se cadastrou na Papelaria Bibel&ocirc;, ignore este e-mail.
      </p>
    </div>
    <div style="padding:14px 30px;background:#fafafa;text-align:center;border-top:1px solid #ffe5ec;">
      <p style="color:#bbb;font-size:11px;margin:0;">Papelaria Bibel&ocirc; &middot; <span style="color:#fe68c4;">papelariabibelo.com.br</span></p>
    </div>
  </div>
</div>
</body>
</html>`}
                    className="w-full border-0"
                    style={{ height: '520px' }}
                    title="Preview email lembrete"
                  />
                  <p className="text-[10px] text-bibelo-muted mt-2 text-center italic">
                    Preview ilustrativo — o email real contém link HMAC personalizado para cada lead
                  </p>
                </div>
              )}
            </div>

            {/* Leads pendentes */}
            {reminderStats.pendentes_lista.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-bibelo-text mb-3">Leads aguardando verificação</h4>
                <div className="space-y-2">
                  {reminderStats.pendentes_lista.map(l => (
                    <div key={l.id} className="flex items-center gap-3 p-3 bg-bibelo-bg rounded-xl">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${l.lembretes_enviados >= 2 ? 'bg-red-400' : l.lembretes_enviados >= 1 ? 'bg-amber-400' : 'bg-bibelo-muted/40'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-bibelo-text truncate">{l.nome || l.email}</p>
                        <p className="text-xs text-bibelo-muted truncate">{l.email}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-bibelo-muted">
                          {l.lembretes_enviados === 0 ? 'Sem lembrete' : `${l.lembretes_enviados} lembrete${l.lembretes_enviados > 1 ? 's' : ''}`}
                        </p>
                        <p className="text-[10px] text-bibelo-muted">{timeAgo(l.criado_em)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-12 text-center">
            <Zap size={40} className="mx-auto mb-3 text-bibelo-muted/30" />
            <p className="text-sm text-bibelo-muted">Selecione um fluxo para ver detalhes e execuções</p>
          </div>
        )}
      </div>

      {/* Modal confirmação de desativação */}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setConfirmToggle(null)}>
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <AlertCircle size={32} className="text-amber-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-bibelo-text text-center mb-2">Desativar fluxo?</h3>
            <p className="text-sm text-bibelo-muted text-center mb-5">
              Este fluxo tem execuções em andamento. Desativá-lo não cancela as execuções ativas, mas impede que novas sejam criadas.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmToggle(null)}
                className="flex-1 px-4 py-2 border border-bibelo-border rounded-lg text-sm text-bibelo-muted hover:bg-bibelo-bg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmAndToggle}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
              >
                Desativar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Leads Tab ─────────────────────────────────────────────────

function LeadsTab({ leadStats }: {
  leadStats: LeadStats | null;
}) {
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'convertido' | 'pendente'>('');
  const [ordenar, setOrdenar] = useState<'recentes' | 'email_primeiro' | 'nome'>('email_primeiro');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingLeads, setLoadingLeads] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoadingLeads(true);
    try {
      const params = new URLSearchParams({ page: String(page), ordenar });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/leads?${params}`);
      setFilteredLeads(data.leads);
      setTotalPages(data.pages);
      setTotal(data.total);
    } catch { /* */ } finally {
      setLoadingLeads(false);
    }
  }, [page, search, statusFilter, ordenar]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Reset para página 1 ao mudar filtros
  useEffect(() => { setPage(1); }, [search, statusFilter, ordenar]);

  const kpis = [
    { label: 'Total de Leads', value: leadStats?.total_leads || 0, icon: Users, color: 'text-pink-400', bg: 'bg-pink-400/10' },
    { label: 'Últimos 7 dias', value: leadStats?.leads_7d || 0, icon: ArrowUpRight, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Últimos 30 dias', value: leadStats?.leads_30d || 0, icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Convertidos', value: leadStats?.convertidos || 0, icon: ShoppingCart, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { label: 'Taxa Conversão', value: `${leadStats?.taxa_conversao || 0}%`, icon: Target, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mb-2`}>
              <kpi.icon size={16} className={kpi.color} />
            </div>
            <p className="text-2xl font-bold text-bibelo-text">{kpi.value}</p>
            <p className="text-xs text-bibelo-muted mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Popups performance */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-bibelo-text mb-4">Performance dos Popups</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-bibelo-border">
                <th className="text-left text-xs font-semibold text-bibelo-muted py-2 px-3">Popup</th>
                <th className="text-center text-xs font-semibold text-bibelo-muted py-2 px-3">Tipo</th>
                <th className="text-center text-xs font-semibold text-bibelo-muted py-2 px-3">Status</th>
                <th className="text-center text-xs font-semibold text-bibelo-muted py-2 px-3">Exibições</th>
                <th className="text-center text-xs font-semibold text-bibelo-muted py-2 px-3">Capturas</th>
                <th className="text-center text-xs font-semibold text-bibelo-muted py-2 px-3">Taxa</th>
              </tr>
            </thead>
            <tbody>
              {leadStats?.popups?.map((p) => (
                <tr key={p.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-bg transition-colors">
                  <td className="py-3 px-3 text-sm font-medium text-bibelo-text">{p.titulo}</td>
                  <td className="py-3 px-3 text-center text-xs text-bibelo-muted">{p.tipo === 'timer' ? '⏱ Timer' : '🚪 Exit'}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${p.ativo ? 'bg-emerald-400/10 text-emerald-400' : 'bg-bibelo-border text-bibelo-muted'}`}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center text-sm text-bibelo-text">{p.exibicoes}</td>
                  <td className="py-3 px-3 text-center text-sm font-semibold text-pink-400">{p.capturas}</td>
                  <td className="py-3 px-3 text-center text-sm font-semibold text-emerald-400">{p.taxa || 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lista de leads com filtros */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-bibelo-text">Leads Capturados</h3>
            <span className="text-[10px] px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full font-bold">{total}</span>
          </div>
          <button onClick={fetchLeads} className="text-bibelo-muted hover:text-pink-400 transition-colors" title="Atualizar">
            <RefreshCw size={14} className={loadingLeads ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Barra de filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {/* Busca */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted" />
            <input
              type="text"
              placeholder="Buscar por nome, email ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-bibelo-bg border border-bibelo-border rounded-lg text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-pink-400/50 transition-colors"
            />
          </div>

          {/* Filtro status */}
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | 'convertido' | 'pendente')}
              className="pl-9 pr-8 py-2 text-sm bg-bibelo-bg border border-bibelo-border rounded-lg text-bibelo-text appearance-none cursor-pointer focus:outline-none focus:border-pink-400/50 transition-colors"
            >
              <option value="">Todos</option>
              <option value="pendente">Pendentes</option>
              <option value="convertido">Convertidos</option>
            </select>
          </div>

          {/* Ordenação */}
          <select
            value={ordenar}
            onChange={(e) => setOrdenar(e.target.value as 'recentes' | 'email_primeiro' | 'nome')}
            className="px-3 py-2 text-sm bg-bibelo-bg border border-bibelo-border rounded-lg text-bibelo-text appearance-none cursor-pointer focus:outline-none focus:border-pink-400/50 transition-colors"
          >
            <option value="email_primeiro">Com contato primeiro</option>
            <option value="recentes">Mais recentes</option>
            <option value="nome">Por nome A-Z</option>
          </select>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-bibelo-border">
                <th className="text-left text-xs font-semibold text-bibelo-muted py-2 px-3">Lead</th>
                <th className="text-left text-xs font-semibold text-bibelo-muted py-2 px-3">Contato</th>
                <th className="text-center text-xs font-semibold text-bibelo-muted py-2 px-3">Cupom</th>
                <th className="text-center text-xs font-semibold text-bibelo-muted py-2 px-3">Fonte</th>
                <th className="text-center text-xs font-semibold text-bibelo-muted py-2 px-3">Status</th>
                <th className="text-right text-xs font-semibold text-bibelo-muted py-2 px-3">Data</th>
                <th className="text-center text-xs font-semibold text-bibelo-muted py-2 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loadingLeads && filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-bibelo-muted">Carregando...</td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-bibelo-muted">
                    {search || statusFilter ? 'Nenhum lead encontrado com esses filtros' : 'Nenhum lead capturado ainda'}
                  </td>
                </tr>
              ) : (
                filteredLeads.map((l) => (
                  <tr key={l.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-bg transition-colors group">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-pink-400/10 flex items-center justify-center text-xs font-bold text-pink-400 shrink-0">
                          {(l.nome || l.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-bibelo-text truncate">{l.nome || '—'}</p>
                          <p className="text-[11px] text-bibelo-muted truncate">{l.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {l.email && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400" title={l.email}>
                            <Mail size={12} />
                          </span>
                        )}
                        {l.telefone ? (
                          <a
                            href={`https://wa.me/55${l.telefone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                            title={l.telefone}
                          >
                            <Phone size={12} />
                            <span className="hidden sm:inline">{l.telefone}</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-bibelo-muted/40">sem WhatsApp</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {l.cupom ? (
                        <span className="text-[10px] px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full font-bold">{l.cupom}</span>
                      ) : (
                        <span className="text-[10px] text-bibelo-muted/40">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center text-xs text-bibelo-muted capitalize">{l.fonte}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${l.convertido ? 'bg-emerald-400/10 text-emerald-400' : 'bg-amber-400/10 text-amber-400'}`}>
                        {l.convertido ? 'Convertido' : 'Pendente'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-xs text-bibelo-muted whitespace-nowrap">{fmtDateShort(l.criado_em)}</td>
                    <td className="py-3 px-3 text-center">
                      {l.customer_id && (
                        <Link
                          to={`/clientes/${l.customer_id}`}
                          className="inline-flex items-center gap-1 text-[11px] text-pink-400 hover:text-pink-300 transition-colors"
                          title="Ver perfil e atividade no site"
                        >
                          <ExternalLink size={12} />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-bibelo-border/50">
            <span className="text-xs text-bibelo-muted">
              Página {page} de {totalPages} ({total} leads)
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-bibelo-border text-bibelo-muted hover:text-pink-400 hover:border-pink-400/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
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

// ── Atividade Tab (Timeline real-time) ────────────────────────

const EVENTO_CONFIG: Record<string, { icon: typeof Eye; label: string; color: string; bg: string }> = {
  page_view: { icon: Globe, label: 'Página visitada', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  product_view: { icon: Package, label: 'Produto visualizado', color: 'text-pink-400', bg: 'bg-pink-400/10' },
  category_view: { icon: Eye, label: 'Categoria visitada', color: 'text-violet-400', bg: 'bg-violet-400/10' },
  add_to_cart: { icon: ShoppingCart, label: 'Adicionou ao carrinho', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  search: { icon: Search, label: 'Buscou', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  checkout_start: { icon: ShoppingCart, label: 'Iniciou checkout', color: 'text-orange-400', bg: 'bg-orange-400/10' },
  banner_click: { icon: MousePointerClick, label: 'Clicou no banner', color: 'text-rose-400', bg: 'bg-rose-400/10' },
  popup_view: { icon: Eye, label: 'Popup exibido', color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
  popup_submit: { icon: UserPlus, label: 'Preencheu popup', color: 'text-green-400', bg: 'bg-green-400/10' },
};

// ── Helpers para extrair contexto dos eventos ──────────────

/** Extrai path legível da URL completa */
function extractPagePath(url: string | null): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/\/$/, '') || '/';
    // Limpa query params longos (fbclid, etc)
    const params = new URLSearchParams(u.search);
    const meaningful: string[] = [];
    params.forEach((v, k) => {
      if (['q', 'search', 'mpage', 'Cor', 'page'].includes(k)) meaningful.push(`${k}=${v}`);
    });
    return meaningful.length > 0 ? `${path}?${meaningful.join('&')}` : path;
  } catch { return ''; }
}

/** Formata nome de categoria a partir do slug: "bloco-de-anotacoes" → "Bloco de Anotações" */
function slugToName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/** Extrai nome legível do path para page_view "other" */
function pageLabel(ev: TrackingEvent): string | null {
  // Se o bibelo.js já mandou resource_nome, usa
  if (ev.resource_nome) return ev.resource_nome;
  // Tenta extrair do path
  const path = extractPagePath(ev.pagina);
  if (!path || path === '/') return null;
  const segments = path.replace(/^\/|\?.*$/g, '').split('/');
  if (segments[0] === 'account') {
    const map: Record<string, string> = { login: 'Login', register: 'Cadastro', reset: 'Recuperar Senha', orders: 'Meus Pedidos' };
    return map[segments[1]] || 'Conta';
  }
  if (segments[0] === 'faq') return 'FAQ';
  if (segments[0] === 'pages' || segments[0] === 'paginas') return slugToName(segments[1] || 'Página');
  // Slug direto (provavelmente categoria)
  return slugToName(segments[0]);
}

/** Extrai fonte/origem do referrer */
function trafficSource(referrer: string | null, pagina: string | null): string | null {
  // Verifica UTM na URL (fbclid = Facebook)
  if (pagina) {
    try {
      const params = new URLSearchParams(new URL(pagina).search);
      if (params.get('fbclid')) return 'Facebook';
      if (params.get('gclid')) return 'Google Ads';
      const src = params.get('utm_source');
      if (src) return src.charAt(0).toUpperCase() + src.slice(1);
    } catch { /* ignore */ }
  }
  if (!referrer) return 'Direto';
  try {
    const host = new URL(referrer).hostname.replace('www.', '');
    if (host.includes('google')) return 'Google';
    if (host.includes('facebook') || host.includes('fb.com')) return 'Facebook';
    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('tiktok')) return 'TikTok';
    if (host.includes('pinterest')) return 'Pinterest';
    if (host.includes('bing')) return 'Bing';
    if (host.includes('papelariabibelo')) return null; // navegação interna
    return host;
  } catch { return null; }
}

/** Cor do badge de source */
function sourceColor(src: string): string {
  const map: Record<string, string> = {
    'Google': 'bg-blue-500/20 text-blue-300',
    'Google Ads': 'bg-blue-500/20 text-blue-300',
    'Facebook': 'bg-indigo-500/20 text-indigo-300',
    'Instagram': 'bg-pink-500/20 text-pink-300',
    'TikTok': 'bg-cyan-500/20 text-cyan-300',
    'Direto': 'bg-gray-500/20 text-gray-400',
  };
  return map[src] || 'bg-violet-500/20 text-violet-300';
}

function AtividadeTab({ events, stats, funnel, onRefresh, lastUpdate }: {
  events: TrackingEvent[];
  stats: TrackingStats | null;
  funnel: { steps: Array<{ etapa: string; total: number; taxa: number }>; taxa_conversao_geral: number } | null;
  onRefresh: () => void;
  lastUpdate: Date;
}) {
  const kpis = [
    { label: 'Eventos (24h)', value: stats?.eventos_24h || 0, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Visitantes (24h)', value: stats?.visitantes_24h || 0, icon: Users, color: 'text-pink-400', bg: 'bg-pink-400/10' },
    { label: 'Produtos Vistos (24h)', value: stats?.produtos_vistos_24h || 0, icon: Package, color: 'text-violet-400', bg: 'bg-violet-400/10' },
    { label: 'Add Carrinho (24h)', value: stats?.add_cart_24h || 0, icon: ShoppingCart, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Visitantes (7d)', value: stats?.visitantes_7d || 0, icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { label: 'Identificados (7d)', value: stats?.clientes_identificados_7d || 0, icon: UserPlus, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  ];

  // Gráfico eventos por tipo
  const porTipoData = (stats?.porTipo || []).map((p) => ({
    name: EVENTO_CONFIG[p.evento]?.label || p.evento,
    value: Number(p.total),
  }));

  const PIE_COLORS2 = ['#60A5FA', '#F472B6', '#A78BFA', '#34D399', '#FBBF24', '#FB923C'];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mb-2`}>
              <kpi.icon size={16} className={kpi.color} />
            </div>
            <p className="text-2xl font-bold text-bibelo-text">{kpi.value}</p>
            <p className="text-xs text-bibelo-muted mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Funil do site */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-bibelo-text">Funil do Site (7 dias)</h3>
          {funnel && (
            <span className="text-xs px-3 py-1 rounded-full bg-bibelo-primary/10 text-bibelo-primary font-semibold">
              Conversão geral: {funnel.taxa_conversao_geral}%
            </span>
          )}
        </div>
        {funnel && funnel.steps ? (
          <div className="flex items-end gap-2 justify-between">
            {funnel.steps.map((step, i) => {
              const maxTotal = Math.max(...funnel.steps.map((s) => s.total), 1);
              const height = Math.max(step.total / maxTotal * 160, 20);
              const colors = ['bg-blue-400', 'bg-pink-400', 'bg-emerald-400', 'bg-amber-400', 'bg-violet-400'];
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-lg font-bold text-bibelo-text">{step.total}</span>
                  <div
                    className={`w-full rounded-t-lg ${colors[i]} transition-all`}
                    style={{ height: `${height}px`, opacity: 0.7 + (i === 0 ? 0.3 : 0) }}
                  />
                  <div className="text-center">
                    <p className="text-xs font-medium text-bibelo-text">{step.etapa}</p>
                    <p className="text-[10px] text-bibelo-muted">{step.taxa}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-bibelo-muted text-center py-8">Coletando dados do funil...</p>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-bibelo-text">Atividade em Tempo Real</h3>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Atualizando a cada 10s" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-bibelo-muted">{lastUpdate.toLocaleTimeString('pt-BR')}</span>
              <button onClick={onRefresh} className="text-xs text-bibelo-primary hover:text-bibelo-primary/80 font-medium">Atualizar</button>
            </div>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-12">
              <Activity size={40} className="mx-auto mb-3 text-bibelo-muted/30" />
              <p className="text-sm text-bibelo-muted">Nenhuma atividade registrada ainda</p>
              <p className="text-xs text-bibelo-muted/60 mt-1">O script de tracking precisa ser adicionado ao GTM</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {events.map((ev) => {
                const config = EVENTO_CONFIG[ev.evento] || { icon: Globe, label: ev.evento, color: 'text-bibelo-muted', bg: 'bg-bibelo-border' };
                const Icon = config.icon;
                const isIdentified = !!ev.customer_nome;
                const label = pageLabel(ev);
                const source = trafficSource(ev.referrer, ev.pagina);
                const searchQuery = ev.evento === 'search' && ev.metadata ? String((ev.metadata as Record<string, unknown>).query || '') : '';
                const geo = ev.geo_city && ev.geo_region ? `${ev.geo_city}/${ev.geo_region}` : ev.geo_region || null;
                const path = extractPagePath(ev.pagina);

                return (
                  <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-bibelo-bg transition-colors">
                    <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon size={16} className={config.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Linha 1: tipo do evento + badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-bibelo-text">{config.label}</span>
                        {ev.pagina_tipo && ev.pagina_tipo !== 'other' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-bibelo-border rounded text-bibelo-muted">{ev.pagina_tipo}</span>
                        )}
                        {source && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sourceColor(source)}`}>{source}</span>
                        )}
                      </div>

                      {/* Produto visualizado / adicionado */}
                      {(ev.evento === 'product_view' || ev.evento === 'add_to_cart') && ev.resource_nome && (
                        <div className="flex items-center gap-2 mt-1.5">
                          {ev.resource_imagem && (
                            <img src={ev.resource_imagem} alt="" className="w-10 h-10 rounded-lg object-cover border border-bibelo-border" />
                          )}
                          <div>
                            <p className="text-xs font-medium text-bibelo-text">{ev.resource_nome}</p>
                            {ev.resource_preco && (
                              <p className="text-xs text-bibelo-primary font-semibold">
                                R$ {Number(ev.resource_preco).toFixed(2).replace('.', ',')}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Categoria visitada */}
                      {ev.evento === 'category_view' && ev.resource_nome && (
                        <p className="text-xs font-medium text-violet-300 mt-1">{ev.resource_nome}</p>
                      )}

                      {/* Busca — mostra o que pesquisou */}
                      {searchQuery && (
                        <p className="text-xs mt-1">
                          <span className="text-bibelo-muted">Pesquisou: </span>
                          <span className="text-amber-300 font-medium">&ldquo;{searchQuery}&rdquo;</span>
                        </p>
                      )}

                      {/* Banner clicado — mostra qual banner */}
                      {ev.evento === 'banner_click' && ev.metadata && (
                        <p className="text-xs mt-1">
                          <span className="text-bibelo-muted">Banner: </span>
                          <span className="text-rose-300 font-semibold">{String((ev.metadata as Record<string, unknown>).banner || '')}</span>
                        </p>
                      )}

                      {/* Popup exibido/preenchido — mostra qual oferta */}
                      {(ev.evento === 'popup_view' || ev.evento === 'popup_submit') && ev.metadata && (
                        <p className="text-xs mt-1">
                          <span className="text-bibelo-muted">{ev.evento === 'popup_submit' ? 'Cadastrou: ' : 'Oferta: '}</span>
                          <span className={`font-semibold ${ev.evento === 'popup_submit' ? 'text-green-300' : 'text-indigo-300'}`}>{String((ev.metadata as Record<string, unknown>).desconto || '')}</span>
                        </p>
                      )}

                      {/* Página "other" — mostra label legível ou path */}
                      {ev.evento === 'page_view' && ev.pagina_tipo !== 'home' && label && (
                        <p className="text-xs text-bibelo-text/70 mt-0.5">{label}</p>
                      )}

                      {/* URL path (discreto) */}
                      {path && path !== '/' && ev.evento !== 'search' && (
                        <p className="text-[10px] text-bibelo-muted/50 mt-0.5 truncate" title={ev.pagina || ''}>{path}</p>
                      )}

                      {/* Quem + IP + onde + quando */}
                      <p className="text-xs text-bibelo-muted mt-1 flex items-center gap-1 flex-wrap">
                        {isIdentified ? (
                          <span className="text-bibelo-text font-medium">{ev.customer_nome}</span>
                        ) : (
                          <span>Visitante anônimo</span>
                        )}
                        {ev.ip && (
                          <>
                            <span className="mx-0.5">·</span>
                            <span className="font-mono text-[10px] text-bibelo-muted/70">{ev.ip}</span>
                          </>
                        )}
                        {geo && (
                          <>
                            <span className="mx-0.5">·</span>
                            <span>{geo}</span>
                          </>
                        )}
                        <span className="mx-0.5">·</span>
                        <span>{timeAgo(ev.criado_em)}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar: top produtos + eventos por tipo */}
        <div className="space-y-6">
          {/* Eventos por tipo */}
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-bibelo-text mb-4">Eventos por Tipo (7d)</h3>
            {porTipoData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={porTipoData} cx="50%" cy="50%" outerRadius={70} innerRadius={35} dataKey="value" label={({ value }) => `${value}`}>
                    {porTipoData.map((_, i) => <Cell key={i} fill={PIE_COLORS2[i % PIE_COLORS2.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-bibelo-muted text-center py-8">Sem dados ainda</p>
            )}
            <div className="space-y-1 mt-2">
              {porTipoData.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS2[i % PIE_COLORS2.length] }} />
                  <span className="text-bibelo-muted flex-1">{p.name}</span>
                  <span className="text-bibelo-text font-medium">{p.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top produtos */}
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-bibelo-text mb-4">Produtos Mais Vistos (7d)</h3>
            {(stats?.topProdutos || []).length === 0 ? (
              <p className="text-sm text-bibelo-muted text-center py-8">Sem dados ainda</p>
            ) : (
              <div className="space-y-2">
                {(stats?.topProdutos || []).slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-bibelo-bg">
                    {p.resource_imagem ? (
                      <img src={p.resource_imagem} alt="" className="w-10 h-10 rounded-lg object-cover border border-bibelo-border" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-bibelo-border flex items-center justify-center">
                        <Package size={16} className="text-bibelo-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-bibelo-text truncate">{p.resource_nome}</p>
                      {p.resource_preco && (
                        <p className="text-xs text-bibelo-muted">R$ {Number(p.resource_preco).toFixed(2).replace('.', ',')}</p>
                      )}
                    </div>
                    <span className="text-sm font-bold text-bibelo-primary">{Number(p.views)}</span>
                    <span className="text-[10px] text-bibelo-muted">views</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
