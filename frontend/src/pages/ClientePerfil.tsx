import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, Instagram, Calendar, TrendingUp, MailX, MailCheck, Eye, ShoppingCart, Search, MousePointerClick, Globe, Package } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../lib/format';

interface CustomerFull {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  cpf?: string;
  data_nasc?: string;
  canal_origem?: string;
  instagram?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  bling_id?: string;
  nuvemshop_id?: string;
  email_optout?: boolean;
  email_optout_em?: string;
  criado_em: string;
  score?: {
    score: number;
    ltv: number;
    segmento: string;
    risco_churn: number;
  };
  recentInteractions: Array<{
    id: string;
    tipo: string;
    descricao: string;
    criado_em: string;
  }>;
}

interface TimelineEntry {
  id: string;
  tipo: string;
  descricao: string;
  criado_em: string;
  origem?: string;
  valor?: number;
  metadata?: Record<string, unknown>;
}

interface TrackingStats {
  total_eventos: number;
  dias_ativos: number;
  produtos_vistos: number;
  add_carrinho: number;
  checkouts: number;
  primeiro_evento: string | null;
  ultimo_evento: string | null;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TIPO_LABELS: Record<string, { label: string; color: string; icon?: any }> = {
  compra: { label: 'Compra', color: 'bg-emerald-500/20 text-emerald-400', icon: ShoppingCart },
  email: { label: 'E-mail', color: 'bg-blue-500/20 text-blue-400', icon: Mail },
  email_enviado: { label: 'Email enviado', color: 'bg-blue-500/20 text-blue-400', icon: Mail },
  whatsapp: { label: 'WhatsApp', color: 'bg-green-500/20 text-green-400' },
  visita: { label: 'Visita', color: 'bg-violet-500/20 text-violet-400' },
  ligacao: { label: 'Ligacao', color: 'bg-amber-500/20 text-amber-400' },
  pedido_bling: { label: 'Pedido Bling', color: 'bg-emerald-500/20 text-emerald-400', icon: Package },
  pedido_nuvemshop: { label: 'Pedido Online', color: 'bg-emerald-500/20 text-emerald-400', icon: ShoppingCart },
  page_view: { label: 'Visitou página', color: 'bg-violet-500/20 text-violet-400', icon: Eye },
  product_view: { label: 'Viu produto', color: 'bg-pink-500/20 text-pink-400', icon: Eye },
  category_view: { label: 'Viu categoria', color: 'bg-indigo-500/20 text-indigo-400', icon: Globe },
  add_to_cart: { label: 'Add carrinho', color: 'bg-amber-500/20 text-amber-400', icon: ShoppingCart },
  checkout_start: { label: 'Iniciou checkout', color: 'bg-orange-500/20 text-orange-400', icon: ShoppingCart },
  search: { label: 'Buscou', color: 'bg-cyan-500/20 text-cyan-400', icon: Search },
  banner_click: { label: 'Clicou banner', color: 'bg-fuchsia-500/20 text-fuchsia-400', icon: MousePointerClick },
  popup_view: { label: 'Viu popup', color: 'bg-rose-500/20 text-rose-400', icon: Eye },
  popup_submit: { label: 'Enviou popup', color: 'bg-rose-500/20 text-rose-400', icon: MousePointerClick },
  sistema: { label: 'Sistema', color: 'bg-gray-500/20 text-gray-400' },
};

export default function ClientePerfil() {
  const { id } = useParams<{ id: string }>();
  const { success, error: showError } = useToast();
  const [cliente, setCliente] = useState<CustomerFull | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [trackingStats, setTrackingStats] = useState<TrackingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reativando, setReativando] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<'todos' | 'tracking' | 'interacoes'>('todos');

  const reativarEmail = async () => {
    if (!cliente || !id) return;
    setReativando(true);
    try {
      await api.post(`/customers/${id}/reativar-email`);
      setCliente({ ...cliente, email_optout: false, email_optout_em: undefined });
      success('Email reativado com sucesso');
    } catch {
      showError('Erro ao reativar email');
    } finally {
      setReativando(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.allSettled([
      api.get(`/customers/${id}`),
      api.get(`/customers/${id}/timeline?limit=100`),
      api.get(`/customers/${id}/tracking`),
    ])
      .then(([custRes, timeRes, trackRes]) => {
        if (custRes.status === 'fulfilled') {
          setCliente(custRes.value.data);
        } else {
          if (custRes.reason?.response?.status === 404) setNotFound(true);
        }
        if (timeRes.status === 'fulfilled') {
          setTimeline(timeRes.value.data.data);
        }
        if (trackRes.status === 'fulfilled') {
          setTrackingStats(trackRes.value.data.stats);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 bg-bibelo-border rounded animate-pulse" />
        <div className="h-48 bg-bibelo-card border border-bibelo-border rounded-xl animate-pulse" />
      </div>
    );
  }

  if (notFound || !cliente) {
    return (
      <div className="text-center py-16">
        <p className="text-bibelo-muted mb-4">Cliente não encontrado</p>
        <Link to="/clientes" className="text-bibelo-primary hover:underline text-sm">Voltar para lista</Link>
      </div>
    );
  }

  const score = cliente.score;

  return (
    <div>
      {/* Back */}
      <Link to="/clientes" className="inline-flex items-center gap-1.5 text-sm text-bibelo-muted hover:text-bibelo-text mb-4 transition-colors">
        <ArrowLeft size={16} />
        Voltar
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">{cliente.nome}</h1>
          <p className="text-sm text-bibelo-muted mt-0.5">
            Cliente desde {formatDate(cliente.criado_em)}
            {cliente.canal_origem && ` · via ${cliente.canal_origem}`}
          </p>
        </div>
        {score && (
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-bibelo-primary">{score.score}</p>
              <p className="text-xs text-bibelo-muted">Score</p>
            </div>
            <div className="w-px h-10 bg-bibelo-border" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-400">{formatCurrency(score.ltv)}</p>
              <p className="text-xs text-bibelo-muted">LTV</p>
            </div>
          </div>
        )}
      </div>

      {/* Banner opt-out */}
      {cliente.email_optout && (
        <div className="flex items-center justify-between gap-4 p-4 bg-red-400/10 border border-red-400/20 rounded-xl mb-4">
          <div className="flex items-center gap-3">
            <MailX size={20} className="text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">Email descadastrado (opt-out)</p>
              <p className="text-xs text-bibelo-muted mt-0.5">
                Solicitou descadastro em {cliente.email_optout_em ? formatDate(cliente.email_optout_em) : 'data desconhecida'}.
                Nenhum email de marketing sera enviado.
              </p>
            </div>
          </div>
          <button
            onClick={reativarEmail}
            disabled={reativando}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-400 transition-colors shrink-0 disabled:opacity-50"
          >
            <MailCheck size={14} />
            {reativando ? 'Reativando...' : 'Reativar email'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Info Card */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-medium text-bibelo-muted">Informações</h2>

          {cliente.email && (
            <div className="flex items-center gap-2.5 text-sm">
              <Mail size={15} className="text-bibelo-muted shrink-0" />
              <span className="text-bibelo-text truncate">{cliente.email}</span>
            </div>
          )}
          {cliente.telefone && (
            <div className="flex items-center gap-2.5 text-sm">
              <Phone size={15} className="text-bibelo-muted shrink-0" />
              <span className="text-bibelo-text">{cliente.telefone}</span>
            </div>
          )}
          {(cliente.cidade || cliente.estado) && (
            <div className="flex items-center gap-2.5 text-sm">
              <MapPin size={15} className="text-bibelo-muted shrink-0" />
              <span className="text-bibelo-text">
                {[cliente.cidade, cliente.estado].filter(Boolean).join('/')}
                {cliente.cep && ` — ${cliente.cep}`}
              </span>
            </div>
          )}
          {cliente.instagram && (
            <div className="flex items-center gap-2.5 text-sm">
              <Instagram size={15} className="text-bibelo-muted shrink-0" />
              <span className="text-bibelo-text">@{cliente.instagram.replace('@', '')}</span>
            </div>
          )}
          {cliente.data_nasc && (
            <div className="flex items-center gap-2.5 text-sm">
              <Calendar size={15} className="text-bibelo-muted shrink-0" />
              <span className="text-bibelo-text">{formatDate(cliente.data_nasc)}</span>
            </div>
          )}

          {/* Score details */}
          {score && (
            <div className="pt-3 border-t border-bibelo-border space-y-2">
              <h3 className="text-sm font-medium text-bibelo-muted flex items-center gap-1.5">
                <TrendingUp size={14} /> Métricas
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-bibelo-bg rounded-lg p-2.5 text-center">
                  <p className="text-bibelo-muted">Segmento</p>
                  <p className="text-bibelo-text font-medium mt-0.5 capitalize">{score.segmento}</p>
                </div>
                <div className="bg-bibelo-bg rounded-lg p-2.5 text-center">
                  <p className="text-bibelo-muted">Risco Churn</p>
                  <p className={`font-medium mt-0.5 ${score.risco_churn >= 0.7 ? 'text-red-400' : score.risco_churn >= 0.4 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {(score.risco_churn * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* IDs externos */}
          {(cliente.bling_id || cliente.nuvemshop_id) && (
            <div className="pt-3 border-t border-bibelo-border space-y-1 text-xs text-bibelo-muted">
              {cliente.bling_id && <p>Bling: {cliente.bling_id}</p>}
              {cliente.nuvemshop_id && <p>NuvemShop: {cliente.nuvemshop_id}</p>}
            </div>
          )}
        </div>

        {/* Comportamento no site */}
        {trackingStats && trackingStats.total_eventos > 0 && (
          <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <h2 className="text-sm font-medium text-bibelo-muted mb-3">Comportamento no Site</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Eventos', value: trackingStats.total_eventos, color: 'text-violet-400', bg: 'bg-violet-400/10' },
                { label: 'Produtos vistos', value: trackingStats.produtos_vistos, color: 'text-pink-400', bg: 'bg-pink-400/10' },
                { label: 'Add carrinho', value: trackingStats.add_carrinho, color: 'text-amber-400', bg: 'bg-amber-400/10' },
                { label: 'Dias ativos', value: trackingStats.dias_ativos, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
              ].map((m) => (
                <div key={m.label} className={`${m.bg} rounded-lg p-3 text-center`}>
                  <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-[11px] text-bibelo-muted">{m.label}</p>
                </div>
              ))}
            </div>
            {trackingStats.ultimo_evento && (
              <p className="text-[11px] text-bibelo-muted mt-2">
                Último acesso: {new Date(trackingStats.ultimo_evento).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-bibelo-muted">Timeline</h2>
            <div className="flex gap-1">
              {(['todos', 'tracking', 'interacoes'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTimelineFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                    timelineFilter === f
                      ? 'bg-pink-400/20 text-pink-400'
                      : 'text-bibelo-muted hover:text-bibelo-text'
                  }`}
                >
                  {f === 'todos' ? 'Todos' : f === 'tracking' ? 'Site' : 'Pedidos/Emails'}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const TRACKING_TIPOS = new Set(['page_view', 'product_view', 'category_view', 'add_to_cart', 'checkout_start', 'search', 'banner_click', 'popup_view', 'popup_submit']);
            const entries = ((timeline.length > 0 ? timeline : cliente.recentInteractions) as TimelineEntry[])
              .filter((e) => {
                if (timelineFilter === 'tracking') return TRACKING_TIPOS.has(e.tipo);
                if (timelineFilter === 'interacoes') return !TRACKING_TIPOS.has(e.tipo);
                return true;
              });

            if (entries.length === 0) {
              return <p className="text-bibelo-muted text-sm py-8 text-center">Nenhuma interação registrada</p>;
            }

            return (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {entries.map((entry) => {
                  const tipo = TIPO_LABELS[entry.tipo] || { label: entry.tipo, color: 'bg-bibelo-border text-bibelo-muted' };
                  const meta = entry.metadata as Record<string, unknown> | undefined;
                  const imagem = meta?.resource_imagem as string | undefined;
                  const isTracking = TRACKING_TIPOS.has(entry.tipo);

                  return (
                    <div key={entry.id} className={`flex items-start gap-3 text-sm p-2 rounded-lg ${isTracking ? 'bg-bibelo-bg/50' : ''}`}>
                      {imagem && (
                        <img
                          src={imagem}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover shrink-0 mt-0.5"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${tipo.color}`}>
                            {tipo.label}
                          </span>
                          {entry.valor && entry.valor > 0 && (
                            <span className="text-[10px] text-emerald-400 font-medium">{formatCurrency(entry.valor)}</span>
                          )}
                        </div>
                        <p className="text-bibelo-text mt-0.5 truncate">{entry.descricao}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[11px] text-bibelo-muted">
                            {new Date(entry.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {meta?.geo_city ? (
                            <span className="text-[10px] text-bibelo-muted/60">{String(meta.geo_city)}{meta.geo_region ? `/${String(meta.geo_region)}` : ''}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
