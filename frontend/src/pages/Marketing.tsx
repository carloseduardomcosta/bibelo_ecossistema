import { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle, Zap,
} from 'lucide-react';
import api from '../lib/api';
import FlowsManager, { type Flow, type Execution } from '../components/marketing/FlowsManager';
import CampaignStats, {
  type FlowStats,
  type LeadStats,
  type Lead,
  type TrackingEvent,
  type TrackingStats,
} from '../components/marketing/CampaignStats';

// ── Interfaces locais ──────────────────────────────────────────

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

// ── Aba de Cupons ─────────────────────────────────────────────

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
                    <td className="px-4 py-2.5 text-bibelo-muted">{new Date(c.gerado_em).toLocaleDateString('pt-BR')}</td>
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
                    <td className="px-4 py-2.5 text-bibelo-muted">{new Date(l.criado_em).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-2.5">
                      {l.email_verificado
                        ? <span className="text-emerald-400 text-xs">&#10003; Verificado</span>
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

// ── Tipos de aba principal ────────────────────────────────────

type MarketingTab = 'automacoes' | 'campanhas' | 'relatorio';

// ── Componente principal Marketing ───────────────────────────

export default function Marketing() {
  const [tab, setTab] = useState<MarketingTab>('automacoes');
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

  // Auto-refresh — 10s na aba Campanhas (atividade), 30s nas outras
  useEffect(() => {
    const ms = tab === 'campanhas' ? 10000 : 30000;
    const interval = setInterval(async () => {
      try {
        if (tab === 'automacoes') {
          const [statsRes, flowsRes] = await Promise.all([
            api.get('/flows/stats/overview'),
            api.get('/flows'),
          ]);
          setFlowStats(statsRes.data);
          setFlows(flowsRes.data);
        } else if (tab === 'campanhas') {
          const [statsRes, leadsStatsRes, timelineRes, trackStatsRes, funnelRes] = await Promise.all([
            api.get('/flows/stats/overview'),
            api.get('/leads/stats'),
            api.get('/tracking/timeline?limit=50'),
            api.get('/tracking/stats'),
            api.get('/tracking/funnel?dias=7'),
          ]);
          setFlowStats(statsRes.data);
          setLeadStats(leadsStatsRes.data);
          setTrackingEvents(timelineRes.data);
          setTrackingStats(trackStatsRes.data);
          setFunnel(funnelRes.data);
        }
        setLastUpdate(new Date());
      } catch { /* silencioso no polling */ }
    }, ms);
    return () => clearInterval(interval);
  }, [tab]);

  const fetchFlowDetail = async (flowId: string) => {
    if (!flowId) {
      setSelectedFlow(null);
      return;
    }
    try {
      const { data } = await api.get(`/flows/${flowId}`);
      setExecutions(data.executions || []);
      setSelectedFlow(flowId);
    } catch { /* silencioso */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bibelo-primary" />
      </div>
    );
  }

  const abas: { key: MarketingTab; label: string }[] = [
    { key: 'automacoes', label: 'Automações' },
    { key: 'campanhas', label: 'Campanhas' },
    { key: 'relatorio', label: 'Relatório' },
  ];

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
            {abas.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === key ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text'
                }`}
              >
                {label}
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

      {/* Aba: Automações — fluxos e execuções */}
      {tab === 'automacoes' && (
        <FlowsManager
          flows={flows}
          executions={executions}
          selectedFlow={selectedFlow}
          onFlowClick={fetchFlowDetail}
          onRefresh={fetchAll}
        />
      )}

      {/* Aba: Campanhas — visão geral, atividade, leads */}
      {tab === 'campanhas' && (
        <CampaignStats
          flowStats={flowStats}
          flows={flows}
          leadStats={leadStats}
          leads={leads}
          trackingEvents={trackingEvents}
          trackingStats={trackingStats}
          funnel={funnel}
          onFlowClick={fetchFlowDetail}
          onRefresh={fetchAll}
          lastUpdate={lastUpdate}
        />
      )}

      {/* Aba: Relatório — cupons e resumo */}
      {tab === 'relatorio' && (
        <div className="space-y-6">
          {/* Resumo quick links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <div className="w-10 h-10 rounded-xl bg-violet-400/10 flex items-center justify-center mb-3">
                <Zap size={20} className="text-violet-400" />
              </div>
              <h3 className="text-sm font-semibold text-bibelo-text mb-1">Fluxos Ativos</h3>
              <p className="text-3xl font-bold text-bibelo-text mb-1">{flowStats?.fluxos_ativos || 0}</p>
              <p className="text-xs text-bibelo-muted">{flowStats?.execucoes_ativas || 0} execuções em andamento</p>
            </div>
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <div className="w-10 h-10 rounded-xl bg-pink-400/10 flex items-center justify-center mb-3">
                <Zap size={20} className="text-pink-400" />
              </div>
              <h3 className="text-sm font-semibold text-bibelo-text mb-1">Total de Leads</h3>
              <p className="text-3xl font-bold text-bibelo-text mb-1">{leadStats?.total_leads || 0}</p>
              <p className="text-xs text-bibelo-muted">{leadStats?.leads_7d || 0} nos últimos 7 dias</p>
            </div>
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center mb-3">
                <Zap size={20} className="text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-bibelo-text mb-1">Taxa de Conversão</h3>
              <p className="text-3xl font-bold text-bibelo-text mb-1">{leadStats?.taxa_conversao || 0}%</p>
              <p className="text-xs text-bibelo-muted">{leadStats?.convertidos || 0} leads convertidos</p>
            </div>
          </div>

          {/* Cupons */}
          <CuponsTab />
        </div>
      )}
    </div>
  );
}
