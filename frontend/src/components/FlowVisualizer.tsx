import { useMemo } from 'react';

// ── Types ──────────────────────────────────────────────────────

interface FlowStep {
  tipo: 'email' | 'whatsapp' | 'wait' | 'condicao';
  template?: string;
  delay_horas: number;
  condicao?: string;
  ref_step?: number;
  sim?: number;
  nao?: number;
  proximo?: number;
}

interface FlowVisualizerProps {
  steps: FlowStep[];
  nome?: string;
  gatilho?: string;
}

// ── Config ─────────────────────────────────────────────────────

const CONDICAO_LABELS: Record<string, string> = {
  email_aberto: 'Abriu email?',
  email_clicado: 'Clicou no link?',
  comprou: 'Comprou?',
  visitou_site: 'Visitou o site?',
  viu_produto: 'Viu produto?',
  abandonou_cart: 'Carrinho abandonado?',
  score_minimo: 'Score mínimo?',
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

function getNodeColor(tipo: string): { bg: string; border: string; text: string; icon: string } {
  switch (tipo) {
    case 'email': return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', icon: '📧' };
    case 'wait': return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: '⏳' };
    case 'condicao': return { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', icon: '🔀' };
    case 'whatsapp': return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: '💬' };
    default: return { bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-400', icon: '⚡' };
  }
}

function formatDelay(h: number): string {
  if (h === 0) return 'imediato';
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const rest = h % 24;
  return rest > 0 ? `${d}d ${rest}h` : `${d}d`;
}

// ── Construir grafo de nós ─────────────────────────────────────

interface GraphNode {
  index: number;
  step: FlowStep;
  next: number | null; // próximo nó linear
  simTarget: number | null; // para condições
  naoTarget: number | null; // para condições
  column: number; // posição horizontal
  row: number; // posição vertical
}

function buildGraph(steps: FlowStep[]): GraphNode[] {
  const nodes: GraphNode[] = steps.map((step, i) => {
    let next: number | null = null;
    if (step.tipo === 'condicao') {
      next = null; // condições usam sim/nao
    } else if (step.proximo !== undefined) {
      next = step.proximo === -1 ? null : step.proximo;
    } else {
      next = i + 1 < steps.length ? i + 1 : null;
    }

    return {
      index: i,
      step,
      next,
      simTarget: step.tipo === 'condicao' ? (step.sim === -1 ? null : step.sim ?? null) : null,
      naoTarget: step.tipo === 'condicao' ? (step.nao === -1 ? null : step.nao ?? null) : null,
      column: 0,
      row: i,
    };
  });

  return nodes;
}

// ── Component ──────────────────────────────────────────────────

export default function FlowVisualizer({ steps, nome, gatilho }: FlowVisualizerProps) {
  const nodes = useMemo(() => buildGraph(steps), [steps]);

  if (steps.length === 0) {
    return <div className="text-center py-8 text-bibelo-muted text-sm">Fluxo sem steps</div>;
  }

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
      <div className="flex justify-center">
        <div className="w-px h-4 bg-bibelo-border"></div>
      </div>

      {/* Steps */}
      {nodes.map((node, i) => {
        const colors = getNodeColor(node.step.tipo);
        const isCondition = node.step.tipo === 'condicao';

        return (
          <div key={i}>
            {/* Nó principal */}
            <div className="flex justify-center">
              <div className={`${isCondition ? 'max-w-[320px]' : 'max-w-[280px]'} w-full`}>
                <div className={`${colors.bg} border ${colors.border} ${isCondition ? 'rounded-xl' : 'rounded-lg'} p-3 relative`}>
                  {/* Index badge */}
                  <span className="absolute -top-2 -left-2 w-5 h-5 bg-bibelo-bg border border-bibelo-border rounded-full flex items-center justify-center text-[10px] text-bibelo-muted font-bold">
                    {i}
                  </span>

                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{colors.icon}</span>
                    <div className="flex-1 min-w-0">
                      {isCondition ? (
                        <>
                          <p className={`text-sm font-semibold ${colors.text}`}>
                            {CONDICAO_LABELS[node.step.condicao || ''] || node.step.condicao}
                          </p>
                          {node.step.ref_step !== undefined && (
                            <p className="text-[10px] text-bibelo-muted">ref: step {node.step.ref_step}</p>
                          )}
                        </>
                      ) : node.step.tipo === 'wait' ? (
                        <p className={`text-sm font-medium ${colors.text}`}>
                          Aguardar {formatDelay(node.step.delay_horas)}
                        </p>
                      ) : (
                        <>
                          <p className={`text-sm font-medium ${colors.text} truncate`}>
                            {node.step.template || 'Email'}
                          </p>
                          {node.step.delay_horas > 0 && (
                            <p className="text-[10px] text-bibelo-muted">delay: {formatDelay(node.step.delay_horas)}</p>
                          )}
                        </>
                      )}
                    </div>
                    {node.step.proximo !== undefined && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-bibelo-bg rounded text-bibelo-muted" title={`goto step ${node.step.proximo}`}>
                        →{node.step.proximo === -1 ? 'FIM' : node.step.proximo}
                      </span>
                    )}
                  </div>
                </div>

                {/* Branches para condições */}
                {isCondition && (
                  <div className="flex justify-between mt-1 px-2">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      <span className="text-[10px] text-emerald-400 font-medium">
                        SIM → {node.step.sim === -1 ? 'FIM ✅' : `step ${node.step.sim}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-red-400 font-medium">
                        NÃO → {node.step.nao === -1 ? 'FIM ✅' : `step ${node.step.nao}`}
                      </span>
                      <div className="w-2 h-2 rounded-full bg-red-400"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Connector */}
            {i < nodes.length - 1 && (
              <div className="flex justify-center">
                <div className="w-px h-3 bg-bibelo-border"></div>
              </div>
            )}
          </div>
        );
      })}

      {/* End node */}
      <div className="flex justify-center mt-1">
        <div className="w-px h-4 bg-bibelo-border"></div>
      </div>
      <div className="flex justify-center">
        <div className="px-4 py-2 bg-bibelo-border/50 border border-bibelo-border rounded-full text-xs font-medium text-bibelo-muted">
          ✅ Fim do fluxo
        </div>
      </div>
    </div>
  );
}
