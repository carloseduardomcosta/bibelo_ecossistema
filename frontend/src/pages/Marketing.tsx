import { useEffect, useState, useCallback } from 'react';
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
  ChevronLeft,
} from 'lucide-react';
import api from '../lib/api';
import { timeAgo } from '../lib/format';

// ── Interfaces ────────────────────────────────────────────────

interface FlowStats {
  fluxos_ativos: number;
  execucoes_ativas: number;
  concluidas_7d: number;
  erros_7d: number;
  carrinhos_pendentes: number;
  carrinhos_notificados: number;
  carrinhos_convertidos: number;
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

// ── Component ─────────────────────────────────────────────────

export default function Marketing() {
  const [tab, setTab] = useState<'overview' | 'fluxos' | 'leads' | 'atividade'>('overview');
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
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh a cada 30s — só busca endpoints da aba ativa
  useEffect(() => {
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
      } catch (err) { console.error('Erro ao atualizar dados de marketing:', err); }
    }, 30000);
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
        <div className="flex items-center gap-1 bg-bibelo-card border border-bibelo-border rounded-lg p-1">
          {(['overview', 'atividade', 'fluxos', 'leads'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text'
              }`}
            >
              {t === 'overview' ? 'Visão Geral' : t === 'atividade' ? 'Atividade' : t === 'fluxos' ? 'Fluxos' : 'Leads'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <OverviewTab flowStats={flowStats} flows={flows} leadStats={leadStats} leads={leads} onFlowClick={fetchFlowDetail} />}
      {tab === 'atividade' && <AtividadeTab events={trackingEvents} stats={trackingStats} funnel={funnel} onRefresh={fetchAll} />}
      {tab === 'fluxos' && <FluxosTab flows={flows} executions={executions} selectedFlow={selectedFlow} onFlowClick={fetchFlowDetail} onRefresh={fetchAll} />}
      {tab === 'leads' && <LeadsTab leadStats={leadStats} />}
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
  const totalConversoes = flows.reduce((acc, f) => acc + (f.total_conversoes || 0), 0);
  const totalExecAtivas = flows.reduce((acc, f) => acc + parseInt(f.execucoes_ativas || '0', 10), 0);

  const kpis = [
    { label: 'Fluxos Ativos', value: flowStats?.fluxos_ativos || 0, icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Execuções Ativas', value: totalExecAtivas, icon: Play, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Emails Enviados', value: totalConversoes, icon: Send, color: 'text-violet-400', bg: 'bg-violet-400/10' },
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
                {((() => { try { return typeof f.steps === 'string' ? JSON.parse(f.steps) : f.steps || []; } catch { return []; } })()).map((s: { tipo: string }, i: number) => (
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
  const selected = flows.find((f) => f.id === selectedFlow);

  const toggleFlow = async (flowId: string) => {
    try {
      await api.post(`/flows/${flowId}/toggle`);
      onRefresh();
    } catch (err) { console.error('Erro ao alternar status do fluxo:', err); }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Lista de fluxos */}
      <div className="lg:col-span-1 space-y-2">
        <h3 className="text-sm font-semibold text-bibelo-text mb-3">Todos os Fluxos</h3>
        {flows.map((f) => (
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
                <p className="text-xs text-bibelo-muted">{f.gatilho}</p>
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
            <div className="flex items-center gap-2 mt-3">
              {((() => { try { return typeof f.steps === 'string' ? JSON.parse(f.steps) : f.steps || []; } catch { return []; } })()).map((s: { tipo: string; template?: string; delay_horas: number }, i: number) => (
                <div key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={10} className="text-bibelo-muted/40" />}
                  <span className="text-xs px-2 py-0.5 bg-bibelo-bg rounded-md text-bibelo-muted" title={s.template || s.tipo}>
                    {STEP_ICONS[s.tipo]}{s.delay_horas > 0 ? ` ${s.delay_horas}h` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Detalhe do fluxo */}
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

            {/* Steps visuais */}
            <div className="flex items-center gap-2 mb-6 p-4 bg-bibelo-bg rounded-xl overflow-x-auto">
              {((() => { try { return typeof selected.steps === 'string' ? JSON.parse(selected.steps) : selected.steps || []; } catch { return []; } })()).map((s: { tipo: string; template?: string; delay_horas: number }, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  {i > 0 && <div className="w-8 h-px bg-bibelo-border" />}
                  <div className="flex flex-col items-center gap-1 min-w-[80px]">
                    <div className="w-10 h-10 rounded-xl bg-bibelo-card border border-bibelo-border flex items-center justify-center text-lg">
                      {STEP_ICONS[s.tipo]}
                    </div>
                    <span className="text-[10px] text-bibelo-muted text-center">{s.template || s.tipo}</span>
                    {s.delay_horas > 0 && <span className="text-[10px] text-bibelo-muted/60">{s.delay_horas}h delay</span>}
                  </div>
                </div>
              ))}
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
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {executions.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg bg-bibelo-bg">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      e.status === 'ativo' ? 'bg-emerald-400 animate-pulse' :
                      e.status === 'concluido' ? 'bg-blue-400' : 'bg-red-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bibelo-text truncate">{e.customer_nome || e.customer_email}</p>
                      <p className="text-xs text-bibelo-muted">{e.customer_email}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[e.status] || ''}`}>
                        {e.status}
                      </span>
                      <p className="text-[10px] text-bibelo-muted mt-1">{timeAgo(e.iniciado_em)}</p>
                    </div>
                  </div>
                ))}
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
              </tr>
            </thead>
            <tbody>
              {loadingLeads && filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-bibelo-muted">Carregando...</td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-bibelo-muted">
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
};

function AtividadeTab({ events, stats, funnel, onRefresh }: {
  events: TrackingEvent[];
  stats: TrackingStats | null;
  funnel: { steps: Array<{ etapa: string; total: number; taxa: number }>; taxa_conversao_geral: number } | null;
  onRefresh: () => void;
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
            <h3 className="text-sm font-semibold text-bibelo-text">Atividade em Tempo Real</h3>
            <button onClick={onRefresh} className="text-xs text-bibelo-primary hover:text-bibelo-primary/80 font-medium">Atualizar</button>
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

                return (
                  <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-bibelo-bg transition-colors">
                    <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon size={16} className={config.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-bibelo-text">{config.label}</span>
                        {ev.pagina_tipo && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-bibelo-border rounded text-bibelo-muted">{ev.pagina_tipo}</span>
                        )}
                      </div>

                      {/* Produto visualizado / adicionado */}
                      {ev.resource_nome && (
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

                      {/* Quem */}
                      <p className="text-xs text-bibelo-muted mt-1">
                        {isIdentified ? (
                          <span className="text-bibelo-text font-medium">{ev.customer_nome}</span>
                        ) : (
                          <span>Visitante anônimo</span>
                        )}
                        <span className="mx-1">·</span>
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
