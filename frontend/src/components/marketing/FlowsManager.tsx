import { useEffect, useState } from 'react';
import {
  Zap, AlertCircle, ToggleLeft, ToggleRight, ChevronRight,
  Mail,
} from 'lucide-react';
import api from '../../lib/api';
import { timeAgo } from '../../lib/format';
import FlowVisualizer from '../FlowVisualizer';

// ── Interfaces ────────────────────────────────────────────────

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

export interface Execution {
  id: string;
  nome: string;
  customer_nome: string;
  customer_email: string;
  status: string;
  step_atual: number;
  iniciado_em: string;
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

const STEP_STATUS_COLORS: Record<string, { dot: string; text: string }> = {
  concluido: { dot: 'bg-emerald-400', text: 'text-emerald-400' },
  executando: { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-400' },
  pendente: { dot: 'bg-bibelo-muted/40', text: 'text-bibelo-muted' },
  erro: { dot: 'bg-red-400', text: 'text-red-400' },
  pulado: { dot: 'bg-amber-400', text: 'text-amber-400' },
  ignorado: { dot: 'bg-amber-400', text: 'text-amber-400' },
};

function parseSteps(steps: unknown): Array<{ tipo: string; template?: string; delay_horas: number }> {
  try {
    const parsed = typeof steps === 'string' ? JSON.parse(steps) : steps;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// ── Componente FlowsManager ───────────────────────────────────

interface FlowsManagerProps {
  flows: Flow[];
  executions: Execution[];
  selectedFlow: string | null;
  onFlowClick: (id: string) => void;
  onRefresh: () => void;
}

export default function FlowsManager({
  flows,
  executions,
  selectedFlow,
  onFlowClick,
  onRefresh,
}: FlowsManagerProps) {
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
  const [stepExecs, setStepExecs] = useState<StepExecution[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);

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
                  <p className="text-[10px] text-bibelo-muted">&ldquo;Você esqueceu de confirmar seu desconto de 7%!&rdquo;</p>
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
                  <p className="text-[10px] text-bibelo-muted">&ldquo;Última chance! Seu desconto de 7% vai expirar!&rdquo;</p>
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
