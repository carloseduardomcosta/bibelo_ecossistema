import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area,
} from 'recharts';
import {
  Zap, Users, MousePointerClick,
  Eye, UserPlus, CheckCircle2, AlertCircle,
  Play, ChevronRight,
  Send, Target, TrendingUp, ArrowUpRight, Activity,
  Package, Search, Globe, Mail, Phone,
  ExternalLink, Lightbulb, Clock, ShoppingCart,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { timeAgo } from '../../lib/format';

// ── Interfaces ────────────────────────────────────────────────

export interface FlowStats {
  fluxos_ativos: number;
  execucoes_ativas: number;
  concluidas_7d: number;
  erros_7d: number;
  carrinhos_pendentes: number;
  carrinhos_notificados: number;
  carrinhos_convertidos: number;
  emails_hoje: number;
}

export interface Flow {
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

export interface LeadStats {
  total_leads: number;
  leads_7d: number;
  leads_30d: number;
  convertidos: number;
  taxa_conversao: number;
  popups: PopupConfig[];
}

export interface PopupConfig {
  id: string;
  titulo: string;
  tipo: string;
  ativo: boolean;
  exibicoes: number;
  capturas: number;
  taxa: number;
}

export interface Lead {
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

export interface TrackingEvent {
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

export interface TrackingStats {
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

interface TrackingAnalytics {
  heatmap: Array<{ dia_semana: number; hora: number; total: number }>;
  por_hora: Array<{ hora: number; eventos: number; visitors: number }>;
  por_dia: Array<{ dia: string; eventos: number; visitors: number; carrinhos: number; compras: number }>;
  fontes: Array<{ fonte: string; total: number }>;
  pico: { hora: number; visitors: number; dia_semana: string; dia_pico: string };
  insights: string[];
}

// ── Helpers ───────────────────────────────────────────────────

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

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// ── Helpers atividade ─────────────────────────────────────────

const EVENTO_CONFIG: Record<string, { icon: typeof Eye; label: string; color: string; bg: string }> = {
  page_view: { icon: Globe, label: 'Página visitada', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  product_view: { icon: Package, label: 'Produto visualizado', color: 'text-pink-400', bg: 'bg-pink-400/10' },
  category_view: { icon: Eye, label: 'Categoria visitada', color: 'text-violet-400', bg: 'bg-violet-400/10' },
  add_to_cart: { icon: ShoppingCart, label: 'Adicionou ao carrinho', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  search: { icon: Search, label: 'Buscou', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  checkout_start: { icon: ShoppingCart, label: 'Iniciou checkout', color: 'text-orange-400', bg: 'bg-orange-400/10' },
  purchase: { icon: ShoppingCart, label: 'Comprou', color: 'text-green-500', bg: 'bg-green-500/10' },
  banner_click: { icon: MousePointerClick, label: 'Clicou no banner', color: 'text-rose-400', bg: 'bg-rose-400/10' },
  popup_view: { icon: Eye, label: 'Popup exibido', color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
  popup_submit: { icon: UserPlus, label: 'Preencheu popup', color: 'text-green-400', bg: 'bg-green-400/10' },
};

function extractPagePath(url: string | null): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/\/$/, '') || '/';
    const params = new URLSearchParams(u.search);
    const meaningful: string[] = [];
    params.forEach((v, k) => {
      if (['q', 'search', 'mpage', 'Cor', 'page'].includes(k)) meaningful.push(`${k}=${v}`);
    });
    return meaningful.length > 0 ? `${path}?${meaningful.join('&')}` : path;
  } catch { return ''; }
}

function slugToName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function pageLabel(ev: TrackingEvent): string | null {
  if (ev.resource_nome) return ev.resource_nome;
  const path = extractPagePath(ev.pagina);
  if (!path || path === '/') return null;
  const segments = path.replace(/^\/|\?.*$/g, '').split('/');
  if (segments[0] === 'account') {
    const map: Record<string, string> = { login: 'Login', register: 'Cadastro', reset: 'Recuperar Senha', orders: 'Meus Pedidos' };
    return map[segments[1]] || 'Conta';
  }
  if (segments[0] === 'faq') return 'FAQ';
  if (segments[0] === 'pages' || segments[0] === 'paginas') return slugToName(segments[1] || 'Página');
  return slugToName(segments[0]);
}

function trafficSource(referrer: string | null, pagina: string | null): string | null {
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
    if (host.includes('papelariabibelo')) return null;
    return host;
  } catch { return null; }
}

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

// ── Sub-componente: OverviewPanel ─────────────────────────────

interface OverviewPanelProps {
  flowStats: FlowStats | null;
  flows: Flow[];
  leadStats: LeadStats | null;
  leads: Lead[];
  onFlowClick: (id: string) => void;
}

function OverviewPanel({ flowStats, flows, leadStats, leads, onFlowClick }: OverviewPanelProps) {
  const totalExecAtivas = flows.reduce((acc, f) => acc + parseInt(f.execucoes_ativas || '0', 10), 0);

  const kpis = [
    { label: 'Fluxos Ativos', value: flowStats?.fluxos_ativos || 0, icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Execuções Ativas', value: totalExecAtivas, icon: Play, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Emails Hoje', value: flowStats?.emails_hoje || 0, icon: Send, color: 'text-violet-400', bg: 'bg-violet-400/10' },
    { label: 'Leads Capturados', value: leadStats?.total_leads || 0, icon: UserPlus, color: 'text-pink-400', bg: 'bg-pink-400/10' },
    { label: 'Leads (7 dias)', value: leadStats?.leads_7d || 0, icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { label: 'Taxa Conversão', value: `${leadStats?.taxa_conversao || 0}%`, icon: Target, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  ];

  const flowChartData = flows.map((f) => ({
    nome: f.nome.length > 18 ? f.nome.substring(0, 18) + '...' : f.nome,
    concluidas: parseInt(f.execucoes_concluidas || '0', 10),
    ativas: parseInt(f.execucoes_ativas || '0', 10),
    erros: parseInt(f.execucoes_erro || '0', 10),
  }));

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

// ── Sub-componente: AtividadePanel ────────────────────────────

interface AtividadePanelProps {
  events: TrackingEvent[];
  stats: TrackingStats | null;
  funnel: { steps: Array<{ etapa: string; total: number; taxa: number }>; taxa_conversao_geral: number } | null;
  onRefresh: () => void;
  lastUpdate: Date;
}

function AtividadePanel({ events, stats, funnel, onRefresh, lastUpdate }: AtividadePanelProps) {
  const [analytics, setAnalytics] = useState<TrackingAnalytics | null>(null);

  useEffect(() => {
    api.get('/tracking/analytics?dias=14')
      .then(res => setAnalytics(res.data))
      .catch(() => setAnalytics(null));
  }, []);

  const kpis = [
    { label: 'Eventos (24h)', value: stats?.eventos_24h || 0, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Visitantes (24h)', value: stats?.visitantes_24h || 0, icon: Users, color: 'text-pink-400', bg: 'bg-pink-400/10' },
    { label: 'Produtos Vistos (24h)', value: stats?.produtos_vistos_24h || 0, icon: Package, color: 'text-violet-400', bg: 'bg-violet-400/10' },
    { label: 'Add Carrinho (24h)', value: stats?.add_cart_24h || 0, icon: ShoppingCart, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Visitantes (7d)', value: stats?.visitantes_7d || 0, icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { label: 'Identificados (7d)', value: stats?.clientes_identificados_7d || 0, icon: UserPlus, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  ];

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

      {/* Analytics Avançado */}
      {analytics && (
        <>
          {/* Gráfico de Tráfego por Dia */}
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-bibelo-text">Tráfego por Dia (14 dias)</h3>
              {(() => {
                const dias = analytics.por_dia || [];
                if (dias.length >= 14) {
                  const semanaAtual = dias.slice(-7).reduce((s, d) => s + d.visitors, 0);
                  const semanaAnterior = dias.slice(-14, -7).reduce((s, d) => s + d.visitors, 0);
                  const pct = semanaAnterior > 0 ? Math.round(((semanaAtual - semanaAnterior) / semanaAnterior) * 100) : 0;
                  const up = pct >= 0;
                  return (
                    <span className={`text-xs px-3 py-1 rounded-full font-semibold ${up ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'}`}>
                      {up ? '↑' : '↓'} {Math.abs(pct)}% vs semana anterior
                    </span>
                  );
                }
                return null;
              })()}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={(analytics.por_dia || []).map(d => ({
                ...d,
                label: new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
              }))}>
                <defs>
                  <linearGradient id="gradVisitors" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fe68c4" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#fe68c4" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gradEventos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#999' }} />
                <YAxis tick={{ fontSize: 11, fill: '#999' }} />
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#ccc' }}
                />
                <Area type="monotone" dataKey="visitors" name="Visitantes" stroke="#fe68c4" fill="url(#gradVisitors)" strokeWidth={2} />
                <Area type="monotone" dataKey="eventos" name="Eventos" stroke="#60a5fa" fill="url(#gradEventos)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-6 mt-2">
              <span className="flex items-center gap-1.5 text-xs text-bibelo-muted">
                <span className="w-3 h-1 rounded bg-[#fe68c4]" /> Visitantes
              </span>
              <span className="flex items-center gap-1.5 text-xs text-bibelo-muted">
                <span className="w-3 h-1 rounded bg-[#60a5fa]" /> Eventos
              </span>
            </div>
          </div>

          {/* Grid 2 colunas: Heatmap + Horário de Pico */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Heatmap de Horários */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-bibelo-text mb-4">Mapa de Calor — Atividade por Horário</h3>
              <div className="overflow-y-auto max-h-[420px]">
                {(() => {
                  const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                  const heatData = analytics.heatmap || [];
                  const maxVal = Math.max(...heatData.map(h => h.total), 1);

                  const getColor = (val: number) => {
                    if (val === 0) return 'rgba(254,104,196,0.04)';
                    const ratio = val / maxVal;
                    if (ratio < 0.2) return 'rgba(254,104,196,0.12)';
                    if (ratio < 0.4) return 'rgba(254,104,196,0.28)';
                    if (ratio < 0.6) return 'rgba(254,104,196,0.48)';
                    if (ratio < 0.8) return 'rgba(254,104,196,0.70)';
                    return 'rgba(254,104,196,0.95)';
                  };

                  const getVal = (dia: number, hora: number) => {
                    const found = heatData.find(h => h.dia_semana === dia && h.hora === hora);
                    return found ? found.total : 0;
                  };

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '32px repeat(7, 1fr)', gap: '2px' }}>
                      <div />
                      {DIAS_SEMANA.map(d => (
                        <div key={d} className="text-[10px] text-bibelo-muted text-center font-medium py-1">{d}</div>
                      ))}
                      {Array.from({ length: 24 }, (_, hora) => (
                        <React.Fragment key={hora}>
                          <div className="text-[10px] text-bibelo-muted text-right pr-1 flex items-center justify-end" style={{ height: 20 }}>
                            {String(hora).padStart(2, '0')}h
                          </div>
                          {Array.from({ length: 7 }, (_, dia) => {
                            const val = getVal(dia, hora);
                            return (
                              <div
                                key={`${dia}-${hora}`}
                                title={`${DIAS_SEMANA[dia]} ${String(hora).padStart(2, '0')}h: ${val} eventos`}
                                className="rounded-sm cursor-default transition-colors"
                                style={{ height: 20, backgroundColor: getColor(val) }}
                              />
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2 mt-3 justify-end">
                <span className="text-[10px] text-bibelo-muted">Menos</span>
                {[0.04, 0.12, 0.28, 0.48, 0.70, 0.95].map((op, i) => (
                  <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(254,104,196,${op})` }} />
                ))}
                <span className="text-[10px] text-bibelo-muted">Mais</span>
              </div>
            </div>

            {/* Barra de Horário de Pico */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-bibelo-text">Visitantes por Hora (hoje)</h3>
                {analytics.pico && (
                  <span className="text-xs px-3 py-1 rounded-full bg-bibelo-primary/10 text-bibelo-primary font-semibold flex items-center gap-1">
                    <Clock size={12} /> Pico: {String(analytics.pico.hora).padStart(2, '0')}h ({analytics.pico.visitors} visitantes)
                  </span>
                )}
              </div>
              <div className="space-y-1 max-h-[420px] overflow-y-auto">
                {(() => {
                  const porHora = analytics.por_hora || [];
                  const maxVisitors = Math.max(...porHora.map(h => h.visitors), 1);
                  const horaAtual = new Date().getHours();
                  return porHora.map(h => (
                    <div key={h.hora} className="flex items-center gap-2">
                      <span className="text-[10px] text-bibelo-muted w-7 text-right shrink-0">{String(h.hora).padStart(2, '0')}h</span>
                      <div className="flex-1 h-5 relative">
                        <div
                          className={`h-full rounded-r transition-all ${h.hora === horaAtual ? 'ring-1 ring-bibelo-primary ring-offset-1 ring-offset-transparent' : ''}`}
                          style={{
                            width: `${Math.max((h.visitors / maxVisitors) * 100, 2)}%`,
                            background: h.hora === horaAtual
                              ? 'linear-gradient(90deg, #fe68c4, #ff8dd6)'
                              : `rgba(254,104,196,${0.2 + (h.visitors / maxVisitors) * 0.6})`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-bibelo-muted w-6 text-right shrink-0">{h.visitors}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* Grid 2 colunas: Fontes de Tráfego + Insights */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Top Fontes de Tráfego */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-bibelo-text mb-4">Top Fontes de Tráfego (14 dias)</h3>
              {(() => {
                const fontes = (analytics.fontes || []).slice(0, 6);
                const totalFontes = fontes.reduce((s, f) => s + f.total, 0) || 1;
                const FONTE_CORES: Record<string, string> = {
                  instagram: '#E1306C',
                  facebook: '#1877F2',
                  google: '#60a5fa',
                  direto: '#6b7280',
                  email: '#f59e0b',
                  whatsapp: '#25D366',
                };

                return fontes.length > 0 ? (
                  <div className="space-y-3">
                    {fontes.map((f, i) => {
                      const pct = Math.round((f.total / totalFontes) * 100);
                      const corKey = f.fonte.toLowerCase();
                      const cor = FONTE_CORES[corKey] || '#a78bfa';
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-bibelo-text capitalize">{f.fonte || 'Desconhecido'}</span>
                            <span className="text-xs text-bibelo-muted">{pct}% ({f.total})</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-bibelo-bg overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: cor }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-bibelo-muted text-center py-8">Sem dados de fontes ainda</p>
                );
              })()}
            </div>

            {/* Card de Insights Automaticos */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-bibelo-primary/5 via-transparent to-blue-500/5 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-400/10 flex items-center justify-center">
                    <Lightbulb size={16} className="text-amber-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-bibelo-text">Insights Automaticos</h3>
                </div>
                {(analytics.insights || []).length > 0 ? (
                  <ul className="space-y-2.5">
                    {analytics.insights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-bibelo-primary mt-0.5 shrink-0">•</span>
                        <span className="text-sm text-bibelo-text/90">{insight}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-bibelo-muted text-center py-8">Coletando dados para gerar insights...</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-bibelo-text">{config.label}</span>
                        {ev.pagina_tipo && ev.pagina_tipo !== 'other' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-bibelo-border rounded text-bibelo-muted">{ev.pagina_tipo}</span>
                        )}
                        {source && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sourceColor(source)}`}>{source}</span>
                        )}
                      </div>

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

                      {ev.evento === 'purchase' && (() => {
                        const meta = (ev.metadata || {}) as Record<string, unknown>;
                        return (
                          <div className="mt-1.5 bg-emerald-400/10 rounded-lg px-3 py-2">
                            <p className="text-xs font-bold text-emerald-400">
                              Pedido #{String(meta.numero || '')}
                              {ev.resource_preco && <span className="ml-2 text-sm">R$ {Number(ev.resource_preco).toFixed(2).replace('.', ',')}</span>}
                            </p>
                            {ev.resource_nome && (
                              <p className="text-[10px] text-bibelo-muted mt-1 truncate">{ev.resource_nome}</p>
                            )}
                          </div>
                        );
                      })()}

                      {ev.evento === 'category_view' && ev.resource_nome && (
                        <p className="text-xs font-medium text-violet-300 mt-1">{ev.resource_nome}</p>
                      )}

                      {searchQuery && (
                        <p className="text-xs mt-1">
                          <span className="text-bibelo-muted">Pesquisou: </span>
                          <span className="text-amber-300 font-medium">&ldquo;{searchQuery}&rdquo;</span>
                        </p>
                      )}

                      {ev.evento === 'banner_click' && ev.metadata && (
                        <p className="text-xs mt-1">
                          <span className="text-bibelo-muted">Banner: </span>
                          <span className="text-rose-300 font-semibold">{String((ev.metadata as Record<string, unknown>).banner || '')}</span>
                        </p>
                      )}

                      {(ev.evento === 'popup_view' || ev.evento === 'popup_submit') && ev.metadata && (
                        <p className="text-xs mt-1">
                          <span className="text-bibelo-muted">{ev.evento === 'popup_submit' ? 'Cadastrou: ' : 'Oferta: '}</span>
                          <span className={`font-semibold ${ev.evento === 'popup_submit' ? 'text-green-300' : 'text-indigo-300'}`}>{String((ev.metadata as Record<string, unknown>).desconto || '')}</span>
                        </p>
                      )}

                      {ev.evento === 'page_view' && ev.pagina_tipo !== 'home' && label && (
                        <p className="text-xs text-bibelo-text/70 mt-0.5">{label}</p>
                      )}

                      {path && path !== '/' && ev.evento !== 'search' && (
                        <p className="text-[10px] text-bibelo-muted/50 mt-0.5 truncate" title={ev.pagina || ''}>{path}</p>
                      )}

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

// ── Sub-componente: LeadsPanel ────────────────────────────────

interface LeadsPanelProps {
  leadStats: LeadStats | null;
}

function LeadsPanel({ leadStats }: LeadsPanelProps) {
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'convertido' | 'pendente'>('');
  const [ordenar, setOrdenar] = useState<'recentes' | 'email_primeiro' | 'nome'>('email_primeiro');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingLeads, setLoadingLeads] = useState(false);

  const fetchLeads = React.useCallback(async () => {
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
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | 'convertido' | 'pendente')}
              className="pl-4 pr-8 py-2 text-sm bg-bibelo-bg border border-bibelo-border rounded-lg text-bibelo-text appearance-none cursor-pointer focus:outline-none focus:border-pink-400/50 transition-colors"
            >
              <option value="">Todos</option>
              <option value="pendente">Pendentes</option>
              <option value="convertido">Convertidos</option>
            </select>
          </div>
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
                <tr><td colSpan={7} className="py-8 text-center text-sm text-bibelo-muted">Carregando...</td></tr>
              ) : filteredLeads.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-bibelo-muted">
                  {search || statusFilter ? 'Nenhum lead encontrado com esses filtros' : 'Nenhum lead capturado ainda'}
                </td></tr>
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
                <ChevronRight size={14} className="rotate-180" />
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

// ── Componente principal CampaignStats ────────────────────────

type CampaignTab = 'overview' | 'atividade' | 'leads';

interface CampaignStatsProps {
  flowStats: FlowStats | null;
  flows: Flow[];
  leadStats: LeadStats | null;
  leads: Lead[];
  trackingEvents: TrackingEvent[];
  trackingStats: TrackingStats | null;
  funnel: { steps: Array<{ etapa: string; total: number; taxa: number }>; taxa_conversao_geral: number } | null;
  onFlowClick: (id: string) => void;
  onRefresh: () => void;
  lastUpdate: Date;
}

export default function CampaignStats({
  flowStats,
  flows,
  leadStats,
  leads,
  trackingEvents,
  trackingStats,
  funnel,
  onFlowClick,
  onRefresh,
  lastUpdate,
}: CampaignStatsProps) {
  const [subTab, setSubTab] = useState<CampaignTab>('overview');

  const subAbas: { key: CampaignTab; label: string }[] = [
    { key: 'overview', label: 'Visão Geral' },
    { key: 'atividade', label: 'Atividade do Site' },
    { key: 'leads', label: 'Leads' },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-navegação */}
      <div className="flex gap-1 bg-bibelo-card border border-bibelo-border rounded-lg p-1 w-fit">
        {subAbas.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              subTab === key ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && (
        <OverviewPanel
          flowStats={flowStats}
          flows={flows}
          leadStats={leadStats}
          leads={leads}
          onFlowClick={onFlowClick}
        />
      )}
      {subTab === 'atividade' && (
        <AtividadePanel
          events={trackingEvents}
          stats={trackingStats}
          funnel={funnel}
          onRefresh={onRefresh}
          lastUpdate={lastUpdate}
        />
      )}
      {subTab === 'leads' && (
        <LeadsPanel leadStats={leadStats} />
      )}
    </div>
  );
}
