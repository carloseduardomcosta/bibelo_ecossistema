import { useEffect, useState } from 'react';
import api from '../lib/api';
import { formatCurrency } from '../lib/format';
import {
  Eye,
  ShoppingCart,
  CreditCard,
  Users,
  TrendingUp,
  Mail,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowRight,
  MapPin,
  Package,
  Clock,
  Sparkles,
  Send,
  type LucideIcon,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────

interface BriefingData {
  periodo: { horas: number; de: string; ate: string };
  site: {
    visitantes_unicos: number;
    total_eventos: number;
    page_views: number;
    produto_views: number;
    add_to_cart: number;
    checkouts: number;
    compras: number;
    top_produtos: Array<{ produto: string; views: number }>;
    top_estados: Array<{ estado: string; visitantes: number }>;
  };
  leads: {
    novos: number;
    verificados: number;
    convertidos: number;
    recentes: Array<{
      nome: string | null;
      email: string;
      fonte: string;
      email_verificado: boolean;
      criado_em: string;
    }>;
  };
  vendas: {
    nuvemshop: { pedidos: number; receita: number; ticket_medio: number };
    bling: { pedidos: number; receita: number };
    carrinhos: { detectados: number; convertidos: number; notificados: number };
  };
  automacoes: {
    execucoes: Array<{ fluxo: string; status: string; total: number }>;
    steps: Array<{ fluxo: string; tipo: string; status: string; total: number }>;
  };
  proximas: Array<{ fluxo: string; proximo_step_em: string; cliente: string | null }>;
  syncs: Array<{
    fonte: string;
    tipo: string;
    status: string;
    registros: number;
    erro: string | null;
    criado_em: string;
  }>;
  fontes_trafego: Array<{ fonte: string; visitantes: number; eventos: number; media_minutos: number }>;
  produtos_carrinho: Array<{ produto: string; preco: number; vezes: number }>;
  dicas: string[];
  alertas: {
    descadastros: number;
    erros_sync: number;
    funil_travado: boolean;
    leads_sem_verificar: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'text-bibelo-primary',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  color?: string;
}) {
  return (
    <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-bibelo-muted">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${color.replace('text-', 'bg-')}/10 flex items-center justify-center`}>
          <Icon size={16} className={color} />
        </div>
      </div>
      <p className="text-2xl font-bold text-bibelo-text">{value}</p>
      {sub && <p className="text-xs text-bibelo-muted mt-1">{sub}</p>}
    </div>
  );
}

function FunnelStep({ label, value, icon: Icon, isLast }: { label: string; value: number; icon: LucideIcon; isLast?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-lg bg-bibelo-primary/10 flex items-center justify-center">
          <Icon size={18} className="text-bibelo-primary" />
        </div>
        <span className="text-lg font-bold text-bibelo-text">{value}</span>
        <span className="text-[11px] text-bibelo-muted">{label}</span>
      </div>
      {!isLast && <ArrowRight size={16} className="text-bibelo-muted/40 mx-1" />}
    </div>
  );
}

function AlertBadge({ label, tipo }: { label: string; tipo: 'danger' | 'warn' | 'ok' }) {
  const cls = tipo === 'danger'
    ? 'bg-red-400/10 text-red-400 border-red-400/20'
    : tipo === 'warn'
    ? 'bg-amber-400/10 text-amber-400 border-amber-400/20'
    : 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20';
  const Icon = tipo === 'danger' ? XCircle : tipo === 'warn' ? AlertTriangle : CheckCircle2;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cls}`}>
      <Icon size={14} />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

const PERIODOS = [
  { value: 24, label: '24h' },
  { value: 48, label: '48h' },
  { value: 72, label: '3 dias' },
  { value: 168, label: '7 dias' },
];

// ── Page ───────────────────────────────────────────────────────

export default function Briefing() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [horas, setHoras] = useState(24);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/briefing?horas=${horas}`)
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [horas]);

  const enviarEmail = async () => {
    setEnviando(true);
    try {
      await api.post('/briefing/enviar');
      alert('Briefing enviado por email!');
    } catch {
      alert('Erro ao enviar briefing');
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-6 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-8 text-center">
        <AlertTriangle size={32} className="mx-auto mb-3 text-amber-400" />
        <p className="text-bibelo-text font-medium">Erro ao carregar briefing</p>
      </div>
    );
  }

  const { site, leads, vendas, automacoes, proximas, syncs, alertas, fontes_trafego, produtos_carrinho, dicas } = data;
  const totalAlertas = alertas.descadastros + alertas.erros_sync + (alertas.funil_travado ? 1 : 0) + alertas.leads_sem_verificar;
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Briefing Diario</h1>
          <p className="text-sm text-bibelo-muted capitalize">{hoje}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-bibelo-card border border-bibelo-border rounded-lg p-1">
            {PERIODOS.map((p) => (
              <button
                key={p.value}
                onClick={() => setHoras(p.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  horas === p.value
                    ? 'bg-bibelo-primary text-white'
                    : 'text-bibelo-muted hover:text-bibelo-text'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={enviarEmail}
            disabled={enviando}
            className="flex items-center gap-2 px-4 py-2 bg-bibelo-primary text-white rounded-lg text-xs font-medium hover:bg-bibelo-primary/90 transition-colors disabled:opacity-50"
          >
            <Send size={14} />
            {enviando ? 'Enviando...' : 'Enviar por email'}
          </button>
        </div>
      </div>

      {/* Alertas */}
      {totalAlertas > 0 && (
        <div className="flex flex-wrap gap-2">
          {alertas.funil_travado && (
            <AlertBadge label="Funil travado no checkout" tipo="danger" />
          )}
          {alertas.erros_sync > 0 && (
            <AlertBadge label={`${alertas.erros_sync} erro(s) de sync`} tipo="danger" />
          )}
          {alertas.descadastros > 0 && (
            <AlertBadge label={`${alertas.descadastros} descadastro(s)`} tipo="warn" />
          )}
          {alertas.leads_sem_verificar > 0 && (
            <AlertBadge label={`${alertas.leads_sem_verificar} lead(s) sem verificar email`} tipo="warn" />
          )}
        </div>
      )}
      {totalAlertas === 0 && (
        <AlertBadge label="Tudo em dia — nenhum alerta" tipo="ok" />
      )}

      {/* Dicas acionáveis */}
      {dicas?.length > 0 && (
        <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-violet-400" />
            <h2 className="text-sm font-medium text-violet-300">Dicas do dia</h2>
          </div>
          <div className="space-y-1.5">
            {dicas.map((d: string, i: number) => (
              <p key={i} className="text-xs text-bibelo-muted leading-relaxed">• {d}</p>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Visitantes"
          value={site.visitantes_unicos}
          sub={`${site.total_eventos} eventos`}
          icon={Eye}
          color="text-blue-400"
        />
        <StatCard
          label="Leads"
          value={leads.novos}
          sub={`${leads.verificados} verificados`}
          icon={Users}
          color="text-pink-400"
        />
        <StatCard
          label="Receita"
          value={formatCurrency(vendas.nuvemshop.receita + vendas.bling.receita)}
          sub={`${vendas.nuvemshop.pedidos + vendas.bling.pedidos} pedidos`}
          icon={TrendingUp}
          color="text-emerald-400"
        />
        <StatCard
          label="Emails enviados"
          value={automacoes.steps.filter((s) => s.tipo === 'email' && s.status === 'concluido').reduce((a, s) => a + s.total, 0)}
          sub={`${automacoes.execucoes.length} fluxos ativos`}
          icon={Mail}
          color="text-violet-400"
        />
      </div>

      {/* Funil */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6">
        <h2 className="text-sm font-bold text-bibelo-text mb-4">Funil de Conversao</h2>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <FunnelStep label="Visitantes" value={site.visitantes_unicos} icon={Eye} />
          <FunnelStep label="Produtos" value={site.produto_views} icon={Package} />
          <FunnelStep label="Carrinho" value={site.add_to_cart} icon={ShoppingCart} />
          <FunnelStep label="Checkout" value={site.checkouts} icon={CreditCard} />
          <FunnelStep label="Compras" value={site.compras} icon={CheckCircle2} isLast />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top produtos */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-bibelo-text mb-3 flex items-center gap-2">
            <Package size={16} className="text-bibelo-primary" />
            Produtos mais vistos
          </h2>
          {site.top_produtos.length === 0 ? (
            <p className="text-xs text-bibelo-muted">Nenhum produto visualizado</p>
          ) : (
            <div className="space-y-2">
              {site.top_produtos.map((p, i) => {
                const maxViews = site.top_produtos[0]?.views || 1;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-bibelo-muted w-5 text-right">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-bibelo-text truncate">{p.produto}</p>
                      <div className="mt-1 h-1.5 rounded-full bg-bibelo-border overflow-hidden">
                        <div
                          className="h-full rounded-full bg-bibelo-primary/60"
                          style={{ width: `${(p.views / maxViews) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-medium text-bibelo-muted">{p.views}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top estados */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-bibelo-text mb-3 flex items-center gap-2">
            <MapPin size={16} className="text-bibelo-primary" />
            Top estados
          </h2>
          {site.top_estados.length === 0 ? (
            <p className="text-xs text-bibelo-muted">Sem dados de localização</p>
          ) : (
            <div className="space-y-2">
              {site.top_estados.map((e, i) => {
                const maxVis = site.top_estados[0]?.visitantes || 1;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-bibelo-primary w-6">{e.estado}</span>
                    <div className="flex-1">
                      <div className="h-1.5 rounded-full bg-bibelo-border overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-400/60"
                          style={{ width: `${(e.visitantes / maxVis) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-medium text-bibelo-muted">{e.visitantes} visitantes</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Fontes de tráfego + Produtos no carrinho */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fontes */}
        {fontes_trafego?.length > 0 && (
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <h2 className="text-sm font-bold text-bibelo-text mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-400" />
              Fontes de trafego
            </h2>
            <div className="space-y-2">
              {fontes_trafego.map((f: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-bibelo-border last:border-0">
                  <div>
                    <span className="text-xs font-medium text-bibelo-text uppercase">{f.fonte}</span>
                    <p className="text-[10px] text-bibelo-muted">{f.media_minutos > 0 ? `${f.media_minutos}min media` : '<30s media'}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-bibelo-text">{f.visitantes}</span>
                    <p className="text-[10px] text-bibelo-muted">{f.eventos} eventos</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Produtos no carrinho */}
        {produtos_carrinho?.length > 0 && (
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <h2 className="text-sm font-bold text-bibelo-text mb-3 flex items-center gap-2">
              <ShoppingCart size={16} className="text-amber-400" />
              Produtos no carrinho (nao convertidos)
            </h2>
            <div className="space-y-2">
              {produtos_carrinho.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-bibelo-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-bibelo-text truncate">{p.produto}</p>
                    <p className="text-[10px] text-bibelo-muted">{formatCurrency(p.preco)}</p>
                  </div>
                  <span className="text-xs font-bold text-amber-400 ml-2">{p.vezes}x</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Leads recentes */}
      {leads.recentes.length > 0 && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-bibelo-text mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-pink-400" />
            Leads recentes
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-bibelo-muted border-b border-bibelo-border">
                  <th className="pb-2 pr-4">Nome</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Fonte</th>
                  <th className="pb-2 pr-4">Verificado</th>
                  <th className="pb-2">Quando</th>
                </tr>
              </thead>
              <tbody>
                {leads.recentes.map((l, i) => (
                  <tr key={i} className="border-b border-bibelo-border/50 last:border-0">
                    <td className="py-2 pr-4 text-bibelo-text">{l.nome || '—'}</td>
                    <td className="py-2 pr-4 text-bibelo-muted">{l.email}</td>
                    <td className="py-2 pr-4">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-bibelo-primary/10 text-bibelo-primary font-medium">
                        {l.fonte}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {l.email_verificado ? (
                        <CheckCircle2 size={14} className="text-emerald-400" />
                      ) : (
                        <Clock size={14} className="text-amber-400" />
                      )}
                    </td>
                    <td className="py-2 text-bibelo-muted text-xs">
                      {new Date(l.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Vendas */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-bibelo-text mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            Vendas
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-bibelo-border/50">
              <span className="text-sm text-bibelo-muted">NuvemShop</span>
              <div className="text-right">
                <p className="text-sm font-bold text-bibelo-text">{formatCurrency(vendas.nuvemshop.receita)}</p>
                <p className="text-xs text-bibelo-muted">{vendas.nuvemshop.pedidos} pedidos · ticket {formatCurrency(vendas.nuvemshop.ticket_medio)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-bibelo-border/50">
              <span className="text-sm text-bibelo-muted">Bling</span>
              <div className="text-right">
                <p className="text-sm font-bold text-bibelo-text">{formatCurrency(vendas.bling.receita)}</p>
                <p className="text-xs text-bibelo-muted">{vendas.bling.pedidos} pedidos</p>
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-bibelo-muted">Carrinhos abandonados</span>
              <div className="text-right">
                <p className="text-xs text-bibelo-muted">
                  {vendas.carrinhos.detectados} detectados · {vendas.carrinhos.convertidos} convertidos · {vendas.carrinhos.notificados} notificados
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Automações */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-bibelo-text mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-violet-400" />
            Automações executadas
          </h2>
          {automacoes.execucoes.length === 0 ? (
            <p className="text-xs text-bibelo-muted">Nenhuma automação executada</p>
          ) : (
            <div className="space-y-2">
              {automacoes.execucoes.map((e, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-bibelo-border/50 last:border-0">
                  <span className="text-sm text-bibelo-text">{e.fluxo}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      e.status === 'concluido'
                        ? 'bg-emerald-400/10 text-emerald-400'
                        : e.status === 'ativo'
                        ? 'bg-blue-400/10 text-blue-400'
                        : 'bg-bibelo-border text-bibelo-muted'
                    }`}>
                      {e.status}
                    </span>
                    <span className="text-xs font-bold text-bibelo-muted">{e.total}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Próximas automações */}
      {proximas.length > 0 && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-bibelo-text mb-3 flex items-center gap-2">
            <Clock size={16} className="text-amber-400" />
            Proximas automações (12h)
          </h2>
          <div className="space-y-2">
            {proximas.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-bibelo-border/50 last:border-0">
                <div>
                  <span className="text-sm text-bibelo-text">{p.fluxo}</span>
                  {p.cliente && <span className="text-xs text-bibelo-muted ml-2">· {p.cliente}</span>}
                </div>
                <span className="text-xs text-bibelo-muted">
                  {new Date(p.proximo_step_em).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Syncs */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <h2 className="text-sm font-bold text-bibelo-text mb-3 flex items-center gap-2">
          <RefreshCw size={16} className="text-blue-400" />
          Sincronizações recentes
        </h2>
        {syncs.length === 0 ? (
          <p className="text-xs text-bibelo-muted">Nenhuma sync no período</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-bibelo-muted border-b border-bibelo-border">
                  <th className="pb-2 pr-4">Fonte</th>
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Registros</th>
                  <th className="pb-2">Quando</th>
                </tr>
              </thead>
              <tbody>
                {syncs.map((s, i) => (
                  <tr key={i} className="border-b border-bibelo-border/50 last:border-0">
                    <td className="py-2 pr-4 text-bibelo-text">{s.fonte}</td>
                    <td className="py-2 pr-4 text-bibelo-muted">{s.tipo}</td>
                    <td className="py-2 pr-4">
                      {s.status === 'ok' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 font-medium">ok</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-400/10 text-red-400 font-medium">erro</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-bibelo-muted">{s.registros}</td>
                    <td className="py-2 text-bibelo-muted text-xs">
                      {new Date(s.criado_em).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
