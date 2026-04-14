import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Mail, Phone, MapPin, Medal, Star, Crown, Package,
  ShoppingCart, Trophy, TrendingUp, AlertTriangle, Edit2, Check,
  X, ChevronDown, Clock, Truck, CheckCircle2, XCircle,
  Lock, Flame, Link2, Copy, ExternalLink, Sparkles, Gem,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../lib/format';

// ── Tipos ──────────────────────────────────────────────────────

interface RevendedoraFull {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  documento: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  observacao: string | null;
  nivel: 'iniciante' | 'bronze' | 'prata' | 'ouro' | 'diamante';
  pontos: number;
  volume_mes_atual: string;
  volume_mes_anterior: string;
  total_vendido: string;
  meses_consecutivos: number;
  percentual_desconto: string;
  pedido_minimo: string;
  status: 'pendente' | 'ativa' | 'inativa' | 'suspensa';
  aprovada_em: string | null;
  criado_em: string;
  total_pedidos: number;
  total_conquistas: number;
  total_produtos: number;
  alertas_estoque: number;
  total_comprado: string;
  progresso_nivel: {
    proximo: string | null;
    meta: number;
    faltam: number;
    percentual: number;
  };
}

interface EstoqueItem {
  id: string;
  produto_nome: string;
  produto_sku: string | null;
  produto_imagem: string | null;
  produto_preco: string | null;
  quantidade: number;
  quantidade_minima: number;
  custo_unitario: string | null;
  preco_sugerido: string | null;
  atualizado_em: string;
}

interface Pedido {
  id: string;
  numero_pedido: string;
  status: 'pendente' | 'aprovado' | 'enviado' | 'entregue' | 'cancelado';
  subtotal: string;
  desconto_percentual: string;
  total: string;
  itens: Array<{ produto_nome: string; quantidade: number; preco_unitario: number; preco_com_desconto: number }>;
  observacao: string | null;
  criado_em: string;
  aprovado_em: string | null;
  enviado_em: string | null;
  entregue_em: string | null;
  codigo_rastreio: string | null;
  url_rastreio: string | null;
  bling_pedido_id: number | null;
}

interface Conquista {
  id: string;
  tipo: string;
  descricao: string;
  pontos: number;
  criado_em: string;
}

// ── Configs visuais ────────────────────────────────────────────

const NIVEL_CONFIG = {
  iniciante: { label: 'Iniciante', icon: Sparkles, color: 'text-pink-400',   bg: 'bg-pink-400/10',   bar: 'bg-pink-400',   border: 'border-pink-400/30'   },
  bronze:    { label: 'Bronze',    icon: Medal,    color: 'text-amber-400',  bg: 'bg-amber-400/10',  bar: 'bg-amber-400',  border: 'border-amber-400/30'  },
  prata:     { label: 'Prata',     icon: Star,     color: 'text-slate-300',  bg: 'bg-slate-300/10',  bar: 'bg-slate-300',  border: 'border-slate-300/30'  },
  ouro:      { label: 'Ouro',      icon: Crown,    color: 'text-yellow-400', bg: 'bg-yellow-400/10', bar: 'bg-yellow-400', border: 'border-yellow-400/30' },
  diamante:  { label: 'Diamante',  icon: Gem,      color: 'text-cyan-400',   bg: 'bg-cyan-400/10',   bar: 'bg-cyan-400',   border: 'border-cyan-400/30'   },
} as const;

const PEDIDO_STATUS = {
  pendente:  { label: 'Pendente',  icon: Clock,        color: 'text-amber-400',  bg: 'bg-amber-400/10'  },
  aprovado:  { label: 'Aprovado',  icon: Check,        color: 'text-blue-400',   bg: 'bg-blue-400/10'   },
  enviado:   { label: 'Enviado',   icon: Truck,        color: 'text-violet-400', bg: 'bg-violet-400/10' },
  entregue:  { label: 'Entregue', icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  cancelado: { label: 'Cancelado', icon: XCircle,      color: 'text-red-400',    bg: 'bg-red-400/10'    },
} as const;

const BADGES_CATALOGO = [
  { tipo: 'primeiro_pedido', label: 'Primeira Compra',    emoji: '🎉', pontos: 10,  descricao: 'Realize seu primeiro pedido'   },
  { tipo: 'nivel_bronze',    label: 'Chegou no Bronze',   emoji: '🥉', pontos: 25,  descricao: 'Volume de R$150/mês alcançado'  },
  { tipo: 'nivel_prata',     label: 'Chegou na Prata',    emoji: '🥈', pontos: 50,  descricao: 'Volume de R$600/mês alcançado'  },
  { tipo: 'nivel_ouro',      label: 'Chegou no Ouro',     emoji: '🥇', pontos: 100, descricao: 'Volume de R$1.200/mês alcançado' },
  { tipo: 'nivel_diamante',  label: 'Diamante!',          emoji: '💎', pontos: 200, descricao: 'Volume de R$3.000/mês alcançado' },
  { tipo: 'tres_meses',      label: '3 Meses Seguidos',   emoji: '🔥', pontos: 30,  descricao: 'Pedidos por 3 meses consecutivos'},
  { tipo: 'melhor_do_mes',   label: 'Melhor do Mês',      emoji: '🏆', pontos: 20,  descricao: 'Maior volume em um único mês'  },
  { tipo: 'embaixadora',     label: 'Embaixadora Bibelô', emoji: '🌟', pontos: 80,  descricao: 'Indicou outra revendedora aprovada'},
] as const;

// ── Helpers ────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function NivelBadge({ nivel }: { nivel: 'iniciante' | 'bronze' | 'prata' | 'ouro' | 'diamante' }) {
  const cfg = NIVEL_CONFIG[nivel];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <Icon size={14} />
      {cfg.label}
    </span>
  );
}

// ── Barra de progresso de nível ────────────────────────────────

function ProgressoNivel({ rev }: { rev: RevendedoraFull }) {
  const cfg = NIVEL_CONFIG[rev.nivel];
  const { progresso_nivel: pg } = rev;
  const vol = parseFloat(rev.volume_mes_atual);

  if (!pg.proximo) {
    return (
      <div className={`rounded-xl p-4 border ${cfg.bg} ${cfg.border}`}>
        <div className={`flex items-center gap-2 mb-1 ${cfg.color}`}>
          <Crown size={16} />
          <span className="text-sm font-semibold">Nível Máximo — Ouro</span>
        </div>
        <p className="text-xs text-bibelo-muted">Você atingiu o topo do Clube Bibelô! 🎊</p>
      </div>
    );
  }

  const nextCfg = NIVEL_CONFIG[pg.proximo as 'iniciante' | 'bronze' | 'prata' | 'ouro' | 'diamante'];
  const NextIcon = nextCfg.icon;

  return (
    <div className="rounded-xl p-4 bg-bibelo-bg border border-bibelo-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${cfg.color}`}>
            {formatCurrency(vol)}
          </span>
          <span className="text-xs text-bibelo-muted">/ {formatCurrency(pg.meta)} para</span>
          <span className={`flex items-center gap-1 text-sm font-semibold ${nextCfg.color}`}>
            <NextIcon size={12} /> {nextCfg.label}
          </span>
        </div>
        <span className="text-xs font-bold text-bibelo-muted">{Math.round(pg.percentual)}%</span>
      </div>
      <div className="h-2 bg-bibelo-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${nextCfg.bar}`}
          style={{ width: `${pg.percentual}%` }}
        />
      </div>
      <p className="text-xs text-bibelo-muted mt-1.5">
        Faltam {formatCurrency(pg.faltam)} este mês para subir para {nextCfg.label}
      </p>
    </div>
  );
}

// ── Aba Estoque ────────────────────────────────────────────────

function AbaEstoque({ revendedoraId, desconto }: { revendedoraId: string; desconto: number }) {
  const toast = useToast();
  const [items, setItems] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editQtd, setEditQtd] = useState(0);

  const fetchEstoque = useCallback(async () => {
    try {
      const res = await api.get(`/revendedoras/${revendedoraId}/estoque`);
      setItems(res.data.data);
    } catch {
      toast.error('Erro ao carregar estoque');
    } finally {
      setLoading(false);
    }
  }, [revendedoraId, toast]);

  useEffect(() => { fetchEstoque(); }, [fetchEstoque]);

  async function salvarQtd(itemId: string) {
    try {
      await api.put(`/revendedoras/${revendedoraId}/estoque/${itemId}`, { quantidade: editQtd });
      setEditId(null);
      fetchEstoque();
    } catch {
      toast.error('Erro ao salvar quantidade');
    }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-bibelo-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <Package size={36} className="text-bibelo-muted/40 mb-3" />
        <p className="text-bibelo-muted">Nenhum produto no estoque</p>
        <p className="text-bibelo-muted/60 text-sm mt-1">Quando ela fizer pedidos, os produtos aparecerão aqui</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-bibelo-muted">{items.length} produto{items.length !== 1 ? 's' : ''} em estoque</p>
        <p className="text-xs text-bibelo-muted">Desconto ativo: <span className="text-bibelo-primary font-semibold">{desconto}%</span></p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(item => {
          const baixo = item.quantidade <= item.quantidade_minima;
          return (
            <div key={item.id} className={`rounded-xl border p-4 ${baixo ? 'border-amber-400/40 bg-amber-400/5' : 'border-bibelo-border bg-bibelo-bg'}`}>
              <div className="flex items-start gap-3">
                {item.produto_imagem ? (
                  <img src={item.produto_imagem} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 bg-bibelo-border" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-bibelo-border/50 flex items-center justify-center shrink-0">
                    <Package size={20} className="text-bibelo-muted/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-bibelo-text text-sm truncate">{item.produto_nome}</p>
                  {item.produto_sku && <p className="text-xs text-bibelo-muted">SKU: {item.produto_sku}</p>}
                  {item.preco_sugerido && (
                    <p className="text-xs text-bibelo-muted mt-0.5">
                      Revenda sugerida: <span className="text-emerald-400 font-medium">{formatCurrency(parseFloat(item.preco_sugerido))}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  {baixo && <AlertTriangle size={14} className="text-amber-400" />}
                  <span className={`text-sm font-medium ${baixo ? 'text-amber-400' : 'text-bibelo-text'}`}>
                    {editId === item.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number" min={0}
                          value={editQtd}
                          onChange={e => setEditQtd(parseInt(e.target.value) || 0)}
                          className="w-16 bg-bibelo-card border border-bibelo-primary rounded px-2 py-0.5 text-sm text-bibelo-text focus:outline-none"
                          autoFocus
                        />
                        <button onClick={() => salvarQtd(item.id)} className="text-emerald-400 hover:text-emerald-300">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setEditId(null)} className="text-bibelo-muted hover:text-bibelo-text">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span>{item.quantidade} un.</span>
                    )}
                  </span>
                  <span className="text-xs text-bibelo-muted">mín. {item.quantidade_minima}</span>
                </div>
                {editId !== item.id && (
                  <button
                    onClick={() => { setEditId(item.id); setEditQtd(item.quantidade); }}
                    className="text-bibelo-muted hover:text-bibelo-text transition-colors"
                  >
                    <Edit2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Aba Pedidos ────────────────────────────────────────────────

function AbaPedidos({ revendedoraId, desconto }: { revendedoraId: string; desconto: number }) {
  const toast = useToast();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rastreioInput, setRastreioInput] = useState<Record<string, string>>({});

  const fetchPedidos = useCallback(async () => {
    try {
      const res = await api.get(`/revendedoras/${revendedoraId}/pedidos`);
      setPedidos(res.data.data);
    } catch {
      toast.error('Erro ao carregar pedidos');
    } finally {
      setLoading(false);
    }
  }, [revendedoraId, toast]);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  async function atualizarStatus(pedidoId: string, status: string) {
    setUpdatingId(pedidoId);
    try {
      const body: Record<string, unknown> = { status };
      if (status === 'enviado' && rastreioInput[pedidoId]?.trim()) {
        body.codigo_rastreio = rastreioInput[pedidoId].trim();
      }
      await api.put(`/revendedoras/${revendedoraId}/pedidos/${pedidoId}/status`, body);
      toast.success(`Pedido marcado como ${PEDIDO_STATUS[status as keyof typeof PEDIDO_STATUS]?.label ?? status}`);
      fetchPedidos();
    } catch {
      toast.error('Erro ao atualizar status');
    } finally {
      setUpdatingId(null);
    }
  }

  const PROXIMOS_STATUS: Record<string, string | null> = {
    pendente: 'aprovado', aprovado: 'enviado', enviado: 'entregue', entregue: null, cancelado: null,
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-bibelo-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (pedidos.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <ShoppingCart size={36} className="text-bibelo-muted/40 mb-3" />
        <p className="text-bibelo-muted">Nenhum pedido ainda</p>
        <p className="text-bibelo-muted/60 text-sm mt-1">Os pedidos de reposição aparecerão aqui</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-bibelo-muted">{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} · desconto ativo {desconto}%</p>

      {pedidos.map(p => {
        const cfg = PEDIDO_STATUS[p.status];
        const Icon = cfg.icon;
        const proximo = PROXIMOS_STATUS[p.status];
        const expanded = expandedId === p.id;

        return (
          <div key={p.id} className="border border-bibelo-border rounded-xl overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bibelo-border/20 transition-colors"
              onClick={() => setExpandedId(expanded ? null : p.id)}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cfg.bg}`}>
                <Icon size={14} className={cfg.color} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-bibelo-text text-sm">{p.numero_pedido}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}>{cfg.label}</span>
                </div>
                <p className="text-xs text-bibelo-muted">{formatDate(p.criado_em)} · {p.itens.length} item{p.itens.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-bibelo-text">{formatCurrency(parseFloat(p.total))}</p>
                {parseFloat(p.desconto_percentual) > 0 && (
                  <p className="text-xs text-emerald-400">{p.desconto_percentual}% off</p>
                )}
              </div>
              <ChevronDown size={16} className={`text-bibelo-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </div>

            {expanded && (
              <div className="border-t border-bibelo-border bg-bibelo-bg px-4 py-3 space-y-3">
                {/* Itens */}
                <div className="space-y-1.5">
                  {p.itens.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-bibelo-text">{item.quantidade}× {item.produto_nome}</span>
                      <span className="text-bibelo-muted">{formatCurrency(item.preco_com_desconto * item.quantidade)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs text-bibelo-muted border-t border-bibelo-border/50 pt-1 mt-1">
                    <span>Subtotal: {formatCurrency(parseFloat(p.subtotal))}</span>
                    <span className="text-emerald-400">−{formatCurrency(parseFloat(p.subtotal) - parseFloat(p.total))}</span>
                  </div>
                </div>

                {p.observacao && (
                  <p className="text-xs text-bibelo-muted italic">"{p.observacao}"</p>
                )}

                {/* Timeline */}
                <div className="flex items-center gap-2 text-xs text-bibelo-muted">
                  {p.aprovado_em && <span className="text-blue-400">✓ Aprovado {formatDate(p.aprovado_em)}</span>}
                  {p.enviado_em  && <><span>·</span><span className="text-violet-400">✓ Enviado {formatDate(p.enviado_em)}</span></>}
                  {p.entregue_em && <><span>·</span><span className="text-emerald-400">✓ Entregue {formatDate(p.entregue_em)}</span></>}
                </div>

                {/* Rastreio existente */}
                {p.codigo_rastreio && (
                  <a
                    href={p.url_rastreio ?? `https://melhorrastreio.com.br/rastreio/${p.codigo_rastreio}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <Truck size={13} />
                    <span className="font-mono">{p.codigo_rastreio}</span>
                    <ExternalLink size={11} />
                  </a>
                )}

                {/* Link Bling */}
                {p.bling_pedido_id && (
                  <p className="text-xs text-bibelo-muted flex items-center gap-1.5">
                    <Link2 size={12} className="text-blue-400" />
                    <span>Bling #{p.bling_pedido_id}</span>
                  </p>
                )}

                {/* Campo rastreio ao avançar para Enviado */}
                {proximo === 'enviado' && (
                  <input
                    type="text"
                    placeholder="Código de rastreio (opcional)"
                    value={rastreioInput[p.id] ?? ''}
                    onChange={e => setRastreioInput(prev => ({ ...prev, [p.id]: e.target.value }))}
                    className="w-full bg-bibelo-card border border-bibelo-border rounded-lg px-3 py-1.5 text-xs text-bibelo-text placeholder-bibelo-muted focus:outline-none focus:border-violet-400/60"
                  />
                )}

                {/* Ação */}
                {proximo && (
                  <button
                    onClick={() => atualizarStatus(p.id, proximo)}
                    disabled={updatingId === p.id}
                    className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${PEDIDO_STATUS[proximo as keyof typeof PEDIDO_STATUS].bg} ${PEDIDO_STATUS[proximo as keyof typeof PEDIDO_STATUS].color} hover:opacity-80`}
                  >
                    {updatingId === p.id ? 'Atualizando...' : `Marcar como ${PEDIDO_STATUS[proximo as keyof typeof PEDIDO_STATUS].label}`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Aba Conquistas ─────────────────────────────────────────────

function AbaConquistas({ revendedoraId, mesesConsecutivos }: { revendedoraId: string; mesesConsecutivos: number }) {
  const toast = useToast();
  const [conquistas, setConquistas] = useState<Conquista[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/revendedoras/${revendedoraId}/conquistas`)
      .then(r => setConquistas(r.data.data))
      .catch(() => toast.error('Erro ao carregar conquistas'))
      .finally(() => setLoading(false));
  }, [revendedoraId, toast]);

  const conquistadosTipos = new Set(conquistas.map(c => c.tipo));

  if (loading) return <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-bibelo-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-bibelo-muted">
          {conquistas.length} de {BADGES_CATALOGO.length} badges conquistados
        </p>
        <p className="text-sm font-semibold text-bibelo-primary">
          {conquistas.reduce((s, c) => s + c.pontos, 0)} pts totais
        </p>
      </div>

      {/* Progresso meses consecutivos */}
      {mesesConsecutivos > 0 && (
        <div className="flex items-center gap-3 bg-orange-400/5 border border-orange-400/20 rounded-xl px-4 py-3">
          <Flame size={20} className="text-orange-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-bibelo-text">
              {mesesConsecutivos} {mesesConsecutivos === 1 ? 'mês consecutivo' : 'meses consecutivos'}!
            </p>
            <p className="text-xs text-bibelo-muted">
              {mesesConsecutivos < 3 ? `Faltam ${3 - mesesConsecutivos} mês(es) para o badge 🔥 3 Meses Seguidos` : 'Badge de 3 meses desbloqueado! 🔥'}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {BADGES_CATALOGO.map(badge => {
          const ganhou = conquistadosTipos.has(badge.tipo);
          const conquista = conquistas.find(c => c.tipo === badge.tipo);
          return (
            <div key={badge.tipo} className={`rounded-xl border p-4 transition-all ${ganhou
              ? 'border-bibelo-primary/30 bg-bibelo-primary/5'
              : 'border-bibelo-border bg-bibelo-bg opacity-60'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`text-2xl ${ganhou ? '' : 'grayscale opacity-40'}`}>
                  {badge.emoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`font-semibold text-sm ${ganhou ? 'text-bibelo-text' : 'text-bibelo-muted'}`}>
                      {badge.label}
                    </p>
                    {!ganhou && <Lock size={11} className="text-bibelo-muted/50" />}
                  </div>
                  <p className="text-xs text-bibelo-muted mt-0.5">{badge.descricao}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs font-semibold ${ganhou ? 'text-bibelo-primary' : 'text-bibelo-muted/50'}`}>
                      +{badge.pontos} pts
                    </span>
                    {ganhou && conquista && (
                      <span className="text-xs text-bibelo-muted">{formatDate(conquista.criado_em)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────

type Tab = 'visao' | 'estoque' | 'pedidos' | 'conquistas';

// ── Endereço editável ──────────────────────────────────────────

function AbaEndereco({ rev, onSave }: { rev: RevendedoraFull; onSave: () => void }) {
  const toast    = useToast();
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [cep,          setCep]         = useState(rev.cep ?? '');
  const [logradouro,   setLogradouro]  = useState(rev.logradouro ?? '');
  const [numero,       setNumero]      = useState(rev.numero ?? '');
  const [complemento,  setComplemento] = useState(rev.complemento ?? '');
  const [bairro,       setBairro]      = useState(rev.bairro ?? '');
  const [cidadeLocal,  setCidadeLocal] = useState(rev.cidade ?? '');
  const [estadoLocal,  setEstadoLocal] = useState(rev.estado ?? '');

  async function buscarCep(raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setLogradouro(d.logradouro || '');
        setBairro(d.bairro || '');
        setCidadeLocal(d.localidade || '');
        setEstadoLocal(d.uf || '');
      }
    } catch { /* ignora */ }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/revendedoras/${rev.id}`, {
        cep:         cep.replace(/\D/g, '') || undefined,
        logradouro:  logradouro || undefined,
        numero:      numero || undefined,
        complemento: complemento || undefined,
        bairro:      bairro || undefined,
        cidade:      cidadeLocal || undefined,
        estado:      estadoLocal || undefined,
      });
      toast.success('Endereço atualizado');
      setEditing(false);
      onSave();
    } catch {
      toast.error('Erro ao salvar endereço');
    } finally {
      setSaving(false);
    }
  }

  const temEndereco = rev.logradouro || rev.bairro || rev.cep;

  if (!editing) {
    return (
      <div className="mt-4 pt-4 border-t border-bibelo-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-bibelo-text">Endereço</h3>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-bibelo-primary hover:underline flex items-center gap-1"
          >
            <Edit2 size={11} /> {temEndereco ? 'Editar' : 'Adicionar'}
          </button>
        </div>
        {temEndereco ? (
          <div className="text-sm text-bibelo-muted space-y-0.5">
            {rev.logradouro && (
              <p>{rev.logradouro}{rev.numero ? `, ${rev.numero}` : ''}{rev.complemento ? ` — ${rev.complemento}` : ''}</p>
            )}
            {rev.bairro && <p>{rev.bairro}</p>}
            {(rev.cidade || rev.estado) && (
              <p>{[rev.cidade, rev.estado].filter(Boolean).join('/')}{rev.cep ? ` — ${rev.cep}` : ''}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-bibelo-muted/60 italic">Endereço não cadastrado</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-bibelo-border space-y-2">
      <h3 className="text-sm font-semibold text-bibelo-text">Endereço</h3>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-bibelo-muted mb-1 block">CEP</label>
          <input
            type="text"
            value={cep}
            maxLength={9}
            placeholder="00000-000"
            onChange={e => {
              const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
              const fmt = raw.length > 5 ? `${raw.slice(0,5)}-${raw.slice(5)}` : raw;
              setCep(fmt);
              if (raw.length === 8) buscarCep(raw);
            }}
            className="w-full px-2.5 py-1.5 text-sm bg-bibelo-bg border border-bibelo-border rounded-lg
                       text-bibelo-text focus:outline-none focus:border-bibelo-primary"
          />
        </div>
        <div>
          <label className="text-xs text-bibelo-muted mb-1 block">Estado</label>
          <input
            type="text"
            value={estadoLocal}
            maxLength={2}
            placeholder="SC"
            onChange={e => setEstadoLocal(e.target.value.toUpperCase())}
            className="w-full px-2.5 py-1.5 text-sm bg-bibelo-bg border border-bibelo-border rounded-lg
                       text-bibelo-text focus:outline-none focus:border-bibelo-primary"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-bibelo-muted mb-1 block">Logradouro</label>
        <input
          type="text"
          value={logradouro}
          maxLength={200}
          placeholder="Rua, Avenida..."
          onChange={e => setLogradouro(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm bg-bibelo-bg border border-bibelo-border rounded-lg
                     text-bibelo-text focus:outline-none focus:border-bibelo-primary"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-bibelo-muted mb-1 block">Número</label>
          <input
            type="text"
            value={numero}
            maxLength={20}
            placeholder="123"
            onChange={e => setNumero(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm bg-bibelo-bg border border-bibelo-border rounded-lg
                       text-bibelo-text focus:outline-none focus:border-bibelo-primary"
          />
        </div>
        <div>
          <label className="text-xs text-bibelo-muted mb-1 block">Complemento</label>
          <input
            type="text"
            value={complemento}
            maxLength={100}
            placeholder="Apto, sala..."
            onChange={e => setComplemento(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm bg-bibelo-bg border border-bibelo-border rounded-lg
                       text-bibelo-text focus:outline-none focus:border-bibelo-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-bibelo-muted mb-1 block">Bairro</label>
          <input
            type="text"
            value={bairro}
            maxLength={100}
            placeholder="Nome do bairro"
            onChange={e => setBairro(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm bg-bibelo-bg border border-bibelo-border rounded-lg
                       text-bibelo-text focus:outline-none focus:border-bibelo-primary"
          />
        </div>
        <div>
          <label className="text-xs text-bibelo-muted mb-1 block">Cidade</label>
          <input
            type="text"
            value={cidadeLocal}
            maxLength={100}
            placeholder="Timbó"
            onChange={e => setCidadeLocal(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm bg-bibelo-bg border border-bibelo-border rounded-lg
                       text-bibelo-text focus:outline-none focus:border-bibelo-primary"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bibelo-primary text-white
                     rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Check size={12} />}
          Salvar
        </button>
        <button
          onClick={() => setEditing(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bibelo-bg border border-bibelo-border
                     rounded-lg text-xs font-medium text-bibelo-muted hover:text-bibelo-text transition-colors"
        >
          <X size={12} /> Cancelar
        </button>
      </div>
    </div>
  );
}

export default function RevendedoraPerfil() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [rev, setRev] = useState<RevendedoraFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('visao');
  const [alterandoStatus, setAlterandoStatus] = useState(false);
  const [gerandoLink, setGerandoLink] = useState(false);
  const [portalLink, setPortalLink] = useState<string | null>(null);

  const fetchRev = useCallback(async () => {
    try {
      const res = await api.get(`/revendedoras/${id}`);
      setRev(res.data);
    } catch {
      toast.error('Erro ao carregar revendedora');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { fetchRev(); }, [fetchRev]);

  async function alterarStatus(status: string) {
    setAlterandoStatus(true);
    try {
      await api.put(`/revendedoras/${id}/status`, { status });
      toast.success(`Status alterado para ${status}`);
      fetchRev();
    } catch {
      toast.error('Erro ao alterar status');
    } finally {
      setAlterandoStatus(false);
    }
  }

  async function gerarLinkPortal() {
    setGerandoLink(true);
    try {
      const res = await api.post(`/revendedoras/${id}/gerar-token`);
      const url = `${window.location.origin}${res.data.link}`;
      setPortalLink(url);
      toast.success('Link do portal gerado!');
    } catch {
      toast.error('Erro ao gerar link do portal');
    } finally {
      setGerandoLink(false);
    }
  }

  function copiarLink() {
    if (!portalLink) return;
    navigator.clipboard.writeText(portalLink).then(() => toast.success('Link copiado!'));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-7 h-7 border-2 border-bibelo-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!rev) {
    return (
      <div className="text-center py-16">
        <p className="text-bibelo-muted">Revendedora não encontrada</p>
        <Link to="/revendedoras" className="text-bibelo-primary text-sm mt-2 inline-block hover:underline">
          ← Voltar
        </Link>
      </div>
    );
  }

  const nivelCfg = NIVEL_CONFIG[rev.nivel];

  const TABS: { id: Tab; label: string; icon: typeof Package; count?: number }[] = [
    { id: 'visao',      label: 'Visão Geral', icon: TrendingUp },
    { id: 'estoque',    label: 'Estoque',     icon: Package,    count: rev.alertas_estoque || undefined },
    { id: 'pedidos',    label: 'Pedidos',     icon: ShoppingCart, count: rev.total_pedidos || undefined },
    { id: 'conquistas', label: 'Conquistas',  icon: Trophy,     count: rev.total_conquistas || undefined },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back */}
      <Link to="/revendedoras" className="inline-flex items-center gap-2 text-bibelo-muted hover:text-bibelo-text transition-colors text-sm">
        <ArrowLeft size={16} />
        Clube de Revendedoras
      </Link>

      {/* Header */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-2xl p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-bibelo-primary shrink-0 ${nivelCfg.bg} border-2 ${nivelCfg.border}`}>
            {rev.nome.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-bibelo-text">{rev.nome}</h1>
              <NivelBadge nivel={rev.nivel} />
              {rev.meses_consecutivos >= 3 && (
                <span title={`${rev.meses_consecutivos} meses seguidos`}
                  className="px-2 py-0.5 rounded-full text-xs font-medium text-orange-400 bg-orange-400/10 border border-orange-400/30">
                  🔥 {rev.meses_consecutivos}m seguidos
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-4 mt-2">
              {rev.email && (
                <a href={`mailto:${rev.email}`} className="flex items-center gap-1.5 text-sm text-bibelo-muted hover:text-bibelo-text transition-colors">
                  <Mail size={14} />
                  {rev.email}
                </a>
              )}
              {rev.telefone && (
                <a href={`tel:${rev.telefone}`} className="flex items-center gap-1.5 text-sm text-bibelo-muted hover:text-bibelo-text transition-colors">
                  <Phone size={14} />
                  {rev.telefone}
                </a>
              )}
              {(rev.cidade || rev.estado) && (
                <span className="flex items-center gap-1.5 text-sm text-bibelo-muted">
                  <MapPin size={14} />
                  {[rev.cidade, rev.estado].filter(Boolean).join('/')}
                </span>
              )}
            </div>

            {rev.observacao && (
              <p className="text-sm text-bibelo-muted italic mt-2">"{rev.observacao}"</p>
            )}
          </div>

          {/* Status + ações */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <select
              value={rev.status}
              onChange={e => alterarStatus(e.target.value)}
              disabled={alterandoStatus}
              className="bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-1.5 text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
            >
              <option value="pendente">Pendente</option>
              <option value="ativa">Ativa</option>
              <option value="inativa">Inativa</option>
              <option value="suspensa">Suspensa</option>
            </select>
            {rev.aprovada_em && (
              <p className="text-xs text-bibelo-muted">Aprovada em {formatDate(rev.aprovada_em)}</p>
            )}
            {/* Portal B2B */}
            {!portalLink ? (
              <button
                onClick={gerarLinkPortal}
                disabled={gerandoLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#fe68c4]/10 text-[#fe68c4] border border-[#fe68c4]/30 hover:bg-[#fe68c4]/20 transition-colors disabled:opacity-50"
              >
                {gerandoLink
                  ? <div className="w-3 h-3 border border-[#fe68c4] border-t-transparent rounded-full animate-spin" />
                  : <Link2 size={12} />
                }
                {gerandoLink ? 'Gerando...' : 'Link do catálogo'}
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={copiarLink}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-400/10 text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/20 transition-colors"
                  title={portalLink}
                >
                  <Copy size={11} /> Copiar link
                </button>
                <a
                  href={portalLink}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-bibelo-bg border border-bibelo-border hover:border-bibelo-primary text-bibelo-muted hover:text-bibelo-text transition-colors"
                >
                  <ExternalLink size={11} />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Stats rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-bibelo-border">
          <div>
            <p className="text-xs text-bibelo-muted">Volume este mês</p>
            <p className="text-lg font-bold text-bibelo-text">{formatCurrency(parseFloat(rev.volume_mes_atual))}</p>
          </div>
          <div>
            <p className="text-xs text-bibelo-muted">Total comprado</p>
            <p className="text-lg font-bold text-bibelo-text">{formatCurrency(parseFloat(rev.total_comprado))}</p>
          </div>
          <div>
            <p className="text-xs text-bibelo-muted">Desconto atual</p>
            <p className="text-lg font-bold text-emerald-400">{rev.percentual_desconto}%</p>
          </div>
          <div>
            <p className="text-xs text-bibelo-muted">Pontos</p>
            <p className="text-lg font-bold text-bibelo-primary">{rev.pontos} pts</p>
          </div>
        </div>

        {/* Progresso de nível */}
        <div className="mt-4">
          <ProgressoNivel rev={rev} />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-2xl overflow-hidden">
        <div className="flex border-b border-bibelo-border overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  active
                    ? 'text-bibelo-primary border-bibelo-primary bg-bibelo-primary/5'
                    : 'text-bibelo-muted border-transparent hover:text-bibelo-text hover:border-bibelo-border'
                }`}
              >
                <Icon size={15} />
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    t.id === 'estoque' ? 'bg-amber-400/20 text-amber-400' : 'bg-bibelo-primary/20 text-bibelo-primary'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {tab === 'visao' && (
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-bibelo-text">Informações</h3>
                {[
                  { label: 'Documento', value: rev.documento },
                  { label: 'Pedido mínimo', value: formatCurrency(parseFloat(rev.pedido_minimo)) },
                  { label: 'Desde', value: formatDate(rev.criado_em) },
                  { label: 'Mês anterior', value: formatCurrency(parseFloat(rev.volume_mes_anterior)) },
                  { label: 'Total de produtos', value: `${rev.total_produtos} produtos` },
                ].filter(i => i.value).map(info => (
                  <div key={info.label} className="flex justify-between text-sm">
                    <span className="text-bibelo-muted">{info.label}</span>
                    <span className="text-bibelo-text font-medium">{info.value}</span>
                  </div>
                ))}

                {/* Endereço editável */}
                <AbaEndereco rev={rev} onSave={fetchRev} />
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-bibelo-text">Atividade</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 bg-bibelo-bg rounded-lg">
                    <ShoppingCart size={16} className="text-blue-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-bibelo-text">{rev.total_pedidos} pedidos</p>
                      <p className="text-xs text-bibelo-muted">desde o início</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-bibelo-bg rounded-lg">
                    <Trophy size={16} className="text-bibelo-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-bibelo-text">{rev.total_conquistas} badges</p>
                      <p className="text-xs text-bibelo-muted">{rev.pontos} pontos acumulados</p>
                    </div>
                  </div>
                  {rev.alertas_estoque > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-amber-400/5 border border-amber-400/20 rounded-lg">
                      <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-400">{rev.alertas_estoque} alertas de estoque</p>
                        <p className="text-xs text-bibelo-muted">produtos abaixo do mínimo</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'estoque' && (
            <AbaEstoque
              revendedoraId={id!}
              desconto={parseFloat(rev.percentual_desconto)}
            />
          )}

          {tab === 'pedidos' && (
            <AbaPedidos
              revendedoraId={id!}
              desconto={parseFloat(rev.percentual_desconto)}
            />
          )}

          {tab === 'conquistas' && (
            <AbaConquistas
              revendedoraId={id!}
              mesesConsecutivos={rev.meses_consecutivos}
            />
          )}
        </div>
      </div>
    </div>
  );
}
