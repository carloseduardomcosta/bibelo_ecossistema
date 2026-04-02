import { useState, useEffect } from 'react';
import api from '../lib/api';

// ── Types ──────────────────────────────────────────────────────

interface FlowStep {
  tipo: 'email' | 'whatsapp' | 'wait' | 'condicao';
  template?: string;
  delay_horas: number;
  condicao?: string;
  ref_step?: number;
  parametros?: Record<string, unknown>;
  sim?: number;
  nao?: number;
  proximo?: number;
}

interface FlowVisualizerProps {
  steps: FlowStep[];
  nome?: string;
  gatilho?: string;
  flowId?: string;
}

interface StepStat {
  step_index: number;
  tipo: string;
  total: string;
  concluidos: string;
  erros: string;
  ignorados: string;
  resultado_agg: { passed_true: number; passed_false: number; emails_enviados: number };
}

interface TemplateInfo {
  nome: string;
  assunto: string;
}

// ── Config ─────────────────────────────────────────────────────

const CONDICAO_LABELS: Record<string, string> = {
  email_aberto: 'Abriu o email?',
  email_clicado: 'Clicou no link?',
  comprou: 'Fez uma compra?',
  visitou_site: 'Visitou o site?',
  viu_produto: 'Viu um produto?',
  abandonou_cart: 'Carrinho abandonado?',
  score_minimo: 'Score mínimo?',
};

const CONDICAO_DESC: Record<string, string> = {
  email_aberto: 'Verifica se o cliente abriu o email enviado no step referenciado',
  email_clicado: 'Verifica se o cliente clicou em algum link do email',
  comprou: 'Verifica se o cliente fez alguma compra (Bling ou NuvemShop) desde o início do fluxo',
  visitou_site: 'Verifica se o cliente acessou qualquer página do site desde o início do fluxo',
  viu_produto: 'Verifica se o cliente visitou uma página de produto',
  abandonou_cart: 'Verifica se existe carrinho pendente não convertido',
  score_minimo: 'Verifica se o score de engajamento do cliente atingiu o mínimo definido',
};

const GATILHO_LABELS: Record<string, string> = {
  'order.abandoned': '🛒 Carrinho abandonado',
  'order.paid': '💳 Pedido pago',
  'order.first': '🎉 Primeira compra',
  'order.delivered': '📦 Pedido entregue',
  'customer.created': '👤 Novo cliente',
  'customer.inactive': '😴 Cliente inativo',
  'lead.captured': '✨ Lead capturado',
  'lead.cart_abandoned': '🔥 Lead quente',
  'product.interested': '👁️ Produto visitado',
};

// ── Helpers ────────────────────────────────────────────────────

function getNodeColor(tipo: string) {
  switch (tipo) {
    case 'email': return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', ring: 'ring-blue-500/20', icon: '📧' };
    case 'wait': return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', ring: 'ring-amber-500/20', icon: '⏳' };
    case 'condicao': return { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', ring: 'ring-purple-500/20', icon: '🔀' };
    case 'whatsapp': return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', ring: 'ring-emerald-500/20', icon: '💬' };
    default: return { bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-400', ring: 'ring-gray-500/20', icon: '⚡' };
  }
}

function formatDelay(h: number): string {
  if (h === 0) return 'imediato';
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const rest = h % 24;
  return rest > 0 ? `${d}d ${rest}h` : `${d} dia${d > 1 ? 's' : ''}`;
}

// ── Component ──────────────────────────────────────────────────

export default function FlowVisualizer({ steps, nome, gatilho, flowId }: FlowVisualizerProps) {
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [stepStats, setStepStats] = useState<StepStat[]>([]);
  const [templates, setTemplates] = useState<Record<number, TemplateInfo>>({});

  // Carregar stats quando tiver flowId
  useEffect(() => {
    if (!flowId) return;
    api.get(`/flows/${flowId}/step-stats`)
      .then((r) => {
        setStepStats(r.data.step_stats || []);
        setTemplates(r.data.templates || {});
      })
      .catch(() => {});
  }, [flowId]);

  if (steps.length === 0) {
    return <div className="text-center py-8 text-bibelo-muted text-sm">Fluxo sem steps</div>;
  }

  const getStats = (index: number): StepStat | undefined =>
    stepStats.find((s) => s.step_index === index);

  return (
    <div className="space-y-1">
      {/* Header */}
      {(nome || gatilho) && (
        <div className="text-center mb-4">
          {nome && <h3 className="text-sm font-bold text-bibelo-text">{nome}</h3>}
          {gatilho && <p className="text-xs text-bibelo-muted">{GATILHO_LABELS[gatilho] || gatilho}</p>}
        </div>
      )}

      {/* Trigger node */}
      <div className="flex justify-center">
        <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-xs font-medium text-emerald-400">
          {GATILHO_LABELS[gatilho || ''] || '⚡ Gatilho'}
        </div>
      </div>
      <Connector />

      {/* Steps */}
      {steps.map((step, i) => {
        const colors = getNodeColor(step.tipo);
        const isCondition = step.tipo === 'condicao';
        const isSelected = selectedNode === i;
        const stats = getStats(i);
        const tpl = templates[i];

        return (
          <div key={i}>
            {/* Nó */}
            <div className="flex justify-center">
              <div className={`${isCondition ? 'max-w-[340px]' : 'max-w-[300px]'} w-full`}>
                <div
                  onClick={() => setSelectedNode(isSelected ? null : i)}
                  className={`${colors.bg} border ${colors.border} ${isCondition ? 'rounded-xl' : 'rounded-lg'} p-3 relative cursor-pointer transition-all hover:ring-2 ${colors.ring} ${isSelected ? `ring-2 ${colors.ring}` : ''}`}
                >
                  {/* Index */}
                  <span className="absolute -top-2 -left-2 w-5 h-5 bg-bibelo-bg border border-bibelo-border rounded-full flex items-center justify-center text-[10px] text-bibelo-muted font-bold">
                    {i}
                  </span>

                  {/* Mini stats badge */}
                  {stats && parseInt(stats.total) > 0 && (
                    <span className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-bibelo-card border border-bibelo-border rounded-full text-[9px] text-bibelo-muted font-medium">
                      {stats.concluidos}x
                    </span>
                  )}

                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{colors.icon}</span>
                    <div className="flex-1 min-w-0">
                      {isCondition ? (
                        <>
                          <p className={`text-sm font-semibold ${colors.text}`}>
                            {CONDICAO_LABELS[step.condicao || ''] || step.condicao}
                          </p>
                          {step.ref_step !== undefined && (
                            <p className="text-[10px] text-bibelo-muted">ref: step {step.ref_step}</p>
                          )}
                        </>
                      ) : step.tipo === 'wait' ? (
                        <p className={`text-sm font-medium ${colors.text}`}>
                          Aguardar {formatDelay(step.delay_horas)}
                        </p>
                      ) : (
                        <>
                          <p className={`text-sm font-medium ${colors.text} truncate`}>
                            {step.template || 'Email'}
                          </p>
                          {step.delay_horas > 0 && (
                            <p className="text-[10px] text-bibelo-muted">delay: {formatDelay(step.delay_horas)}</p>
                          )}
                        </>
                      )}
                    </div>
                    {step.proximo !== undefined && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-bibelo-bg rounded text-bibelo-muted">
                        →{step.proximo === -1 ? 'FIM' : step.proximo}
                      </span>
                    )}
                  </div>
                </div>

                {/* Branches */}
                {isCondition && (
                  <div className="flex justify-between mt-1 px-2">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      <span className="text-[10px] text-emerald-400 font-medium">
                        SIM → {step.sim === -1 ? 'FIM ✅' : `step ${step.sim}`}
                      </span>
                      {stats && stats.resultado_agg.passed_true > 0 && (
                        <span className="text-[9px] text-emerald-400/60">({stats.resultado_agg.passed_true})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {stats && stats.resultado_agg.passed_false > 0 && (
                        <span className="text-[9px] text-red-400/60">({stats.resultado_agg.passed_false})</span>
                      )}
                      <span className="text-[10px] text-red-400 font-medium">
                        NÃO → {step.nao === -1 ? 'FIM ✅' : `step ${step.nao}`}
                      </span>
                      <div className="w-2 h-2 rounded-full bg-red-400"></div>
                    </div>
                  </div>
                )}

                {/* ── Painel de detalhes (expandido ao clicar) ── */}
                {isSelected && (
                  <div className="mt-2 p-3 bg-bibelo-card border border-bibelo-border rounded-lg text-xs space-y-2 animate-in fade-in">
                    {/* Info do step */}
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-bibelo-text">Step {i} · {step.tipo}</span>
                      <span className="text-bibelo-muted">{step.delay_horas > 0 ? `Delay: ${formatDelay(step.delay_horas)}` : 'Imediato'}</span>
                    </div>

                    {/* Email: template info */}
                    {step.tipo === 'email' && (
                      <div className="space-y-1.5">
                        <div className="p-2 bg-blue-500/5 rounded-md">
                          <p className="text-bibelo-muted">Template: <span className="text-bibelo-text font-medium">{step.template || 'built-in'}</span></p>
                          {tpl && <p className="text-bibelo-muted mt-1">Assunto: <span className="text-bibelo-text">{tpl.assunto}</span></p>}
                        </div>
                        {step.proximo !== undefined && (
                          <p className="text-bibelo-muted">Após envio → <span className="font-medium">{step.proximo === -1 ? 'finaliza fluxo' : `pula para step ${step.proximo}`}</span> (convergência)</p>
                        )}
                      </div>
                    )}

                    {/* Condição: explicação */}
                    {isCondition && (
                      <div className="space-y-1.5">
                        <p className="text-bibelo-muted">{CONDICAO_DESC[step.condicao || ''] || 'Condição customizada'}</p>
                        {step.ref_step !== undefined && (
                          <p className="text-bibelo-muted">Referência: email do <span className="font-medium text-bibelo-text">step {step.ref_step}</span> ({steps[step.ref_step]?.template || 'email'})</p>
                        )}
                        {step.parametros && Object.keys(step.parametros).length > 0 && (
                          <p className="text-bibelo-muted">Parâmetros: {JSON.stringify(step.parametros)}</p>
                        )}
                        {/* Barra de proporção SIM/NÃO */}
                        {stats && (parseInt(stats.total) > 0) && (
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-emerald-400">SIM: {stats.resultado_agg.passed_true}</span>
                              <span className="text-red-400">NÃO: {stats.resultado_agg.passed_false}</span>
                            </div>
                            <div className="h-2 bg-bibelo-bg rounded-full overflow-hidden flex">
                              {stats.resultado_agg.passed_true > 0 && (
                                <div
                                  className="h-full bg-emerald-400 rounded-l-full"
                                  style={{ width: `${(stats.resultado_agg.passed_true / (stats.resultado_agg.passed_true + stats.resultado_agg.passed_false)) * 100}%` }}
                                />
                              )}
                              {stats.resultado_agg.passed_false > 0 && (
                                <div
                                  className="h-full bg-red-400 rounded-r-full"
                                  style={{ width: `${(stats.resultado_agg.passed_false / (stats.resultado_agg.passed_true + stats.resultado_agg.passed_false)) * 100}%` }}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Wait: info */}
                    {step.tipo === 'wait' && (
                      <p className="text-bibelo-muted">O fluxo pausa por <span className="font-medium text-bibelo-text">{formatDelay(step.delay_horas)}</span> antes de avançar para o próximo step.</p>
                    )}

                    {/* Stats gerais */}
                    {stats && parseInt(stats.total) > 0 && (
                      <div className="pt-1.5 border-t border-bibelo-border/50 flex items-center gap-3">
                        <span className="text-emerald-400">{stats.concluidos} concluídos</span>
                        {parseInt(stats.erros) > 0 && <span className="text-red-400">{stats.erros} erros</span>}
                        {parseInt(stats.ignorados) > 0 && <span className="text-amber-400">{stats.ignorados} ignorados</span>}
                        {stats.resultado_agg.emails_enviados > 0 && <span className="text-blue-400">{stats.resultado_agg.emails_enviados} emails</span>}
                      </div>
                    )}

                    {!stats || parseInt(stats?.total || '0') === 0 ? (
                      <p className="text-bibelo-muted/60 italic">Sem execuções ainda</p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* Connector */}
            {i < steps.length - 1 && <Connector />}
          </div>
        );
      })}

      {/* End node */}
      <Connector />
      <div className="flex justify-center">
        <div className="px-4 py-2 bg-bibelo-border/50 border border-bibelo-border rounded-full text-xs font-medium text-bibelo-muted">
          ✅ Fim do fluxo
        </div>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center">
      <div className="w-px h-3 bg-bibelo-border"></div>
    </div>
  );
}
