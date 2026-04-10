import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import GlobalSearch from './GlobalSearch';
import api from '../lib/api';
import { timeAgo, formatCurrency } from '../lib/format';
import {
  LayoutDashboard,
  Users,
  Target,
  Package,
  Warehouse,
  TrendingUp,
  ShoppingBag,
  ShoppingCart,
  ImagePlus,
  Wallet,
  CalendarClock,
  Calculator,
  FileText,
  Banknote,
  BarChart3,
  Kanban,
  Megaphone,
  Sparkles,
  Newspaper,
  RefreshCw,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Mail,
  MailOpen,
  MousePointerClick,
  MailX,
  Radar,
  Globe,
  Layers,
  Store,
  GitMerge,
  Server,
  Handshake,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: '',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/briefing', label: 'Briefing', icon: Newspaper },
    ],
  },
  {
    label: 'CRM',
    items: [
      { to: '/clientes', label: 'Clientes', icon: Users },
      { to: '/segmentos', label: 'Segmentos', icon: Target },
      { to: '/pipeline', label: 'Pipeline', icon: Kanban },
    ],
  },
  {
    label: 'Produtos',
    items: [
      { to: '/produtos', label: 'Catálogo', icon: Package },
      { to: '/estoque', label: 'Estoque', icon: Warehouse },
      { to: '/lucratividade', label: 'Lucratividade', icon: TrendingUp },
      { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart },
      { to: '/vendas', label: 'Vendas', icon: ShoppingBag },
      { to: '/editor-imagens', label: 'Editor Imagens', icon: ImagePlus },
      { to: '/seo', label: 'SEO', icon: Globe },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/financeiro', label: 'Fluxo de Caixa', icon: Wallet },
      { to: '/despesas-fixas', label: 'Despesas Fixas', icon: CalendarClock },
      { to: '/simulador', label: 'Simulador', icon: Calculator },
      { to: '/nf-entrada', label: 'NF Entrada', icon: FileText },
      { to: '/contas-pagar', label: 'Contas a Pagar', icon: Banknote },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    label: 'Loja Online',
    items: [
      { to: '/loja-online',      label: 'Configurações',    icon: Store    },
      { to: '/categorias-sync',  label: 'Categorias Sync',  icon: GitMerge },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { to: '/marketing', label: 'Automações', icon: Sparkles },
      { to: '/campanhas', label: 'Campanhas', icon: Megaphone },
      { to: '/consumo-email', label: 'Consumo Email', icon: Mail },
      { to: '/inteligencia', label: 'Inteligência', icon: Target },
      { to: '/meta-ads', label: 'Meta Ads', icon: Radar },
      { to: '/landing-pages', label: 'Landing Pages', icon: Layers },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/sistema', label: 'Sistema', icon: Server },
      { to: '/sync', label: 'Sync', icon: RefreshCw },
      { to: '/filas', label: 'Filas', icon: Clock },
    ],
  },
];

function NavSection({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const location = useLocation();
  const isActive = group.items.some(
    (item) => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
  );

  // Grupos sem label (Dashboard) sempre abertos
  const [open, setOpen] = useState(group.label === '' || isActive);

  // Abrir automaticamente quando navegar para um item do grupo
  useEffect(() => {
    if (isActive) setOpen(true);
  }, [isActive]);

  if (group.label === '') {
    // Dashboard sem header de grupo
    return (
      <div className="space-y-0.5">
        {group.items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-bibelo-primary/20 text-bibelo-primary'
                  : 'text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50'
              }`
            }
            end={to === '/'}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-bibelo-muted/60 hover:text-bibelo-muted transition-colors"
      >
        {group.label}
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <div className="space-y-0.5 mt-0.5">
          {group.items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-bibelo-primary/20 text-bibelo-primary'
                    : 'text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

interface Notificacao {
  id: string;
  descricao: string;
  valor: string;
  dia_vencimento: number;
  alerta: 'atrasado' | 'vence_em_breve' | 'pendente' | 'pago';
  categoria_nome: string;
  categoria_cor: string;
}

interface LeadNotif {
  id: string;
  nome: string | null;
  email: string;
  telefone: string | null;
  cupom: string | null;
  criado_em: string;
}

interface EmailEvent {
  tipo: 'aberto' | 'clicado' | 'bounce' | 'spam';
  email: string;
  nome: string | null;
  campaign_nome: string | null;
  link: string | null;
  timestamp: string;
}

interface VendaNotif {
  ns_id: string;
  numero: string;
  valor: string;
  status: string;
  cupom: string | null;
  webhook_em: string;
  itens: { name?: string }[];
  nome: string | null;
  email: string | null;
}

interface BoasvindasDeal {
  id: string;
  titulo: string;
  etapa: string;
  origem: string;
  notas: string;
  criado_em: string;
  cliente_nome: string;
  cliente_email: string;
  cliente_telefone: string | null;
}

const ORIGEM_LABELS: Record<string, string> = {
  parcerias_b2b: 'Parceria B2B',
  grupo_vip: 'Grupo VIP',
  formulario: 'Formulário',
};

function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [alertas, setAlertas] = useState<Notificacao[]>([]);
  const [leads, setLeads] = useState<LeadNotif[]>([]);
  const [emailEvents, setEmailEvents] = useState<EmailEvent[]>([]);
  const [emailResumo, setEmailResumo] = useState({ abertos: 0, clicados: 0, bounces: 0, spam: 0 });
  const [vendas, setVendas] = useState<VendaNotif[]>([]);
  const [resumo, setResumo] = useState({ atrasados: 0, vence_em_breve: 0, pagos: 0, pendentes: 0, total: 0 });
  const [boasvindasDeals, setBoasvindasDeals] = useState<BoasvindasDeal[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const fetchAlertas = useCallback(async (signal?: AbortSignal) => {
    try {
      const [finResp, leadsResp, emailResp, vendasResp, boasvindasResp] = await Promise.all([
        api.get('/financeiro/despesas-fixas/alertas', { signal }),
        api.get('/leads?limit=5', { signal }),
        api.get('/campaigns/email-events?hours=48', { signal }),
        api.get('/tracking/vendas-recentes?horas=48', { signal }),
        api.get('/deals/boasvindas-recentes', { signal }),
      ]);
      setAlertas(finResp.data.data.filter((d: Notificacao) => d.alerta !== 'pago'));
      setResumo(finResp.data.resumo);
      // Leads das últimas 72h
      const recentes = (leadsResp.data.leads || []).filter((l: LeadNotif) => {
        const ms = Date.now() - new Date(l.criado_em).getTime();
        return ms < 72 * 3600 * 1000;
      });
      setLeads(recentes);
      setEmailEvents(emailResp.data.events || []);
      setEmailResumo(emailResp.data.resumo || { abertos: 0, clicados: 0, bounces: 0, spam: 0 });
      setVendas(vendasResp.data.vendas || []);
      setBoasvindasDeals(boasvindasResp.data.deals || []);
    } catch (err) {
      if ((err as Error).name !== 'AbortError' && (err as Error).name !== 'CanceledError') {
        console.error('Erro ao buscar notificações:', err);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAlertas(controller.signal);
    return () => controller.abort();
  }, [fetchAlertas]);

  // Refresh a cada 2 min
  useEffect(() => {
    const controller = new AbortController();
    const interval = setInterval(() => fetchAlertas(controller.signal), 2 * 60 * 1000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchAlertas]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const urgentes = vendas.length + resumo.atrasados + resumo.vence_em_breve + leads.length + emailEvents.length + boasvindasDeals.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 transition-colors"
      >
        <Bell size={20} />
        {urgentes > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
            {urgentes}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-bibelo-card border border-bibelo-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-bibelo-border flex items-center justify-between">
            <h3 className="text-sm font-bold text-bibelo-text">Notificações</h3>
            <div className="flex items-center gap-2">
              {vendas.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-emerald-400/10 text-emerald-400 rounded-full font-medium animate-pulse">
                  {vendas.length} venda{vendas.length > 1 ? 's' : ''}
                </span>
              )}
              {leads.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-pink-400/10 text-pink-400 rounded-full font-medium">
                  {leads.length} lead{leads.length > 1 ? 's' : ''} novo{leads.length > 1 ? 's' : ''}
                </span>
              )}
              {resumo.atrasados > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-red-400/10 text-red-400 rounded-full font-medium">
                  {resumo.atrasados} atrasada{resumo.atrasados > 1 ? 's' : ''}
                </span>
              )}
              {resumo.vence_em_breve > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-amber-400/10 text-amber-400 rounded-full font-medium">
                  {resumo.vence_em_breve} em breve
                </span>
              )}
              {emailEvents.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-blue-400/10 text-blue-400 rounded-full font-medium">
                  {emailEvents.length} email{emailEvents.length > 1 ? 's' : ''}
                </span>
              )}
              {boasvindasDeals.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-violet-400/10 text-violet-400 rounded-full font-medium animate-pulse">
                  {boasvindasDeals.length} contato{boasvindasDeals.length > 1 ? 's' : ''} boasvindas
                </span>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {/* ── Vendas recentes ── */}
            {vendas.length > 0 && (
              <>
                <div className="px-4 py-2 bg-emerald-400/5 border-b border-bibelo-border/50">
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                    Vendas Online
                    <span className="ml-2 text-emerald-300">
                      R$ {vendas.reduce((s, v) => s + parseFloat(v.valor), 0).toFixed(2).replace('.', ',')}
                    </span>
                  </p>
                </div>
                {vendas.map((v) => (
                  <button
                    key={v.ns_id}
                    onClick={() => { setOpen(false); navigate(`/pedidos`); }}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bibelo-border/30 transition-colors text-left border-b border-bibelo-border/50"
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-400/20 flex items-center justify-center shrink-0">
                      <ShoppingBag size={14} className="text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bibelo-text truncate">
                        {v.nome || 'Cliente'}
                        <span className="font-bold text-emerald-400 ml-1">R$ {parseFloat(v.valor).toFixed(2).replace('.', ',')}</span>
                      </p>
                      <p className="text-xs text-bibelo-muted truncate">
                        Pedido #{v.numero}
                        {v.cupom && <span className="ml-1 text-pink-400">· cupom {v.cupom}</span>}
                        {Array.isArray(v.itens) && v.itens.length > 0 && (
                          <span className="ml-1">· {v.itens.length} {v.itens.length === 1 ? 'item' : 'itens'}</span>
                        )}
                      </p>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-medium shrink-0">{timeAgo(v.webhook_em)}</span>
                  </button>
                ))}
              </>
            )}

            {/* ── Leads recentes ── */}
            {leads.length > 0 && (
              <>
                <div className="px-4 py-2 bg-pink-400/5 border-b border-bibelo-border/50">
                  <p className="text-[10px] font-bold text-pink-400 uppercase tracking-wider">Novos Leads</p>
                </div>
                {leads.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => { setOpen(false); navigate('/marketing'); }}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bibelo-border/30 transition-colors text-left border-b border-bibelo-border/50"
                  >
                    <div className="w-8 h-8 rounded-full bg-pink-400/20 flex items-center justify-center shrink-0">
                      <Sparkles size={14} className="text-pink-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bibelo-text truncate">{l.nome || l.email.split('@')[0]}</p>
                      <p className="text-xs text-bibelo-muted">
                        {l.email}
                        {l.telefone && <span className="ml-1">· {l.telefone}</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-pink-400 font-medium">{timeAgo(l.criado_em)}</span>
                      {l.cupom && <p className="text-[10px] text-bibelo-muted">{l.cupom}</p>}
                    </div>
                  </button>
                ))}
              </>
            )}

            {/* ── Eventos de email ── */}
            {emailEvents.length > 0 && (
              <>
                <div className="px-4 py-2 bg-blue-400/5 border-b border-bibelo-border/50">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                    Interações de Email
                    {emailResumo.abertos > 0 && <span className="ml-2 text-emerald-400">{emailResumo.abertos} aberto{emailResumo.abertos > 1 ? 's' : ''}</span>}
                    {emailResumo.clicados > 0 && <span className="ml-2 text-blue-300">{emailResumo.clicados} clique{emailResumo.clicados > 1 ? 's' : ''}</span>}
                    {emailResumo.bounces > 0 && <span className="ml-2 text-red-400">{emailResumo.bounces} bounce{emailResumo.bounces > 1 ? 's' : ''}</span>}
                  </p>
                </div>
                {emailEvents.map((ev, i) => (
                  <button
                    key={`email-${i}`}
                    onClick={() => { setOpen(false); navigate('/campanhas'); }}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bibelo-border/30 transition-colors text-left border-b border-bibelo-border/50"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      ev.tipo === 'aberto' ? 'bg-emerald-400/20' :
                      ev.tipo === 'clicado' ? 'bg-blue-400/20' :
                      ev.tipo === 'bounce' ? 'bg-red-400/20' :
                      'bg-red-400/20'
                    }`}>
                      {ev.tipo === 'aberto' && <MailOpen size={14} className="text-emerald-400" />}
                      {ev.tipo === 'clicado' && <MousePointerClick size={14} className="text-blue-400" />}
                      {ev.tipo === 'bounce' && <MailX size={14} className="text-red-400" />}
                      {ev.tipo === 'spam' && <AlertTriangle size={14} className="text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bibelo-text truncate">
                        {ev.nome || ev.email.split('@')[0]}
                        <span className="font-normal text-bibelo-muted ml-1">
                          {ev.tipo === 'aberto' && 'abriu'}
                          {ev.tipo === 'clicado' && 'clicou'}
                          {ev.tipo === 'bounce' && 'bounce'}
                          {ev.tipo === 'spam' && 'spam'}
                        </span>
                      </p>
                      <p className="text-xs text-bibelo-muted truncate">
                        {ev.tipo === 'clicado' && ev.link
                          ? ev.link.replace(/^https?:\/\//, '').split('?')[0]
                          : ev.campaign_nome || ev.email}
                      </p>
                    </div>
                    <span className="text-[10px] text-blue-400 font-medium shrink-0">{timeAgo(ev.timestamp)}</span>
                  </button>
                ))}
              </>
            )}

            {/* ── Contatos Boasvindas (B2B, VIP, Formulário) ── */}
            {boasvindasDeals.length > 0 && (
              <>
                <div className="px-4 py-2 bg-violet-400/5 border-b border-bibelo-border/50">
                  <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Contatos Boasvindas</p>
                </div>
                {boasvindasDeals.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setOpen(false); navigate('/pipeline'); }}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bibelo-border/30 transition-colors text-left border-b border-bibelo-border/50"
                  >
                    <div className="w-8 h-8 rounded-full bg-violet-400/20 flex items-center justify-center shrink-0">
                      <Handshake size={14} className="text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bibelo-text truncate">
                        {d.cliente_nome || d.cliente_email.split('@')[0]}
                      </p>
                      <p className="text-xs text-bibelo-muted truncate">
                        <span className="text-violet-400 font-medium">{ORIGEM_LABELS[d.origem] ?? d.origem}</span>
                        {d.cliente_email && <span className="ml-1">· {d.cliente_email}</span>}
                      </p>
                    </div>
                    <span className="text-[10px] text-violet-400 font-medium shrink-0">{timeAgo(d.criado_em)}</span>
                  </button>
                ))}
              </>
            )}

            {/* ── Alertas financeiros ── */}
            {alertas.length > 0 && (
              <>
                <div className="px-4 py-2 bg-amber-400/5 border-b border-bibelo-border/50">
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Despesas Fixas</p>
                </div>
                {alertas.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { setOpen(false); navigate('/despesas-fixas'); }}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bibelo-border/30 transition-colors text-left border-b border-bibelo-border/50 last:border-0"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      n.alerta === 'atrasado' ? 'bg-red-400/20' :
                      n.alerta === 'vence_em_breve' ? 'bg-amber-400/20' :
                      'bg-bibelo-border'
                    }`}>
                      {n.alerta === 'atrasado' ? <AlertTriangle size={14} className="text-red-400" /> :
                       n.alerta === 'vence_em_breve' ? <Clock size={14} className="text-amber-400" /> :
                       <Clock size={14} className="text-bibelo-muted" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bibelo-text truncate">{n.descricao}</p>
                      <p className="text-xs text-bibelo-muted">
                        Dia {n.dia_vencimento} · {formatCurrency(parseFloat(n.valor))}
                        {n.alerta === 'atrasado' && <span className="text-red-400 ml-1">· ATRASADO</span>}
                        {n.alerta === 'vence_em_breve' && <span className="text-amber-400 ml-1">· Vence em breve</span>}
                      </p>
                    </div>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: n.categoria_cor }} />
                  </button>
                ))}
              </>
            )}

            {alertas.length === 0 && leads.length === 0 && emailEvents.length === 0 && vendas.length === 0 && boasvindasDeals.length === 0 && (
              <div className="px-4 py-8 text-center">
                <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-400" />
                <p className="text-sm text-bibelo-muted">Tudo em dia!</p>
                <p className="text-xs text-bibelo-muted/60 mt-1">Nenhuma venda, lead, email ou despesa pendente</p>
              </div>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-bibelo-border flex gap-2">
            {vendas.length > 0 && (
              <button
                onClick={() => { setOpen(false); navigate('/pedidos'); }}
                className="flex-1 text-center text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              >
                Ver pedidos
              </button>
            )}
            {leads.length > 0 && (
              <button
                onClick={() => { setOpen(false); navigate('/marketing'); }}
                className="flex-1 text-center text-xs text-pink-400 hover:text-pink-300 font-medium transition-colors"
              >
                Ver leads
              </button>
            )}
            {emailEvents.length > 0 && (
              <button
                onClick={() => { setOpen(false); navigate('/campanhas'); }}
                className="flex-1 text-center text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                Ver campanhas
              </button>
            )}
            {boasvindasDeals.length > 0 && (
              <button
                onClick={() => { setOpen(false); navigate('/pipeline'); }}
                className="flex-1 text-center text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors"
              >
                Ver pipeline
              </button>
            )}
            <button
              onClick={() => { setOpen(false); navigate('/despesas-fixas'); }}
              className="flex-1 text-center text-xs text-bibelo-primary hover:text-bibelo-primary/80 font-medium transition-colors"
            >
              Ver despesas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-bibelo-bg">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30
          w-60 bg-bibelo-card border-r border-bibelo-border
          flex flex-col transition-transform lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-bibelo-border">
          <img src="/logo.png" alt="Bibelô" className="w-8 h-8 rounded-full object-cover" />
          <span className="text-base font-bold text-bibelo-text">Ecossistema Bibelô</span>
          <button
            className="ml-auto lg:hidden text-bibelo-muted hover:text-bibelo-text"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 space-y-3 overflow-y-auto">
          {navGroups.map((group) => (
            <NavSection
              key={group.label || 'root'}
              group={group}
              onNavigate={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        {/* User + Logout */}
        <div className="px-2.5 py-3 border-t border-bibelo-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-bibelo-primary/30 flex items-center justify-center text-sm font-bold text-bibelo-primary">
              {user?.nome?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-bibelo-text truncate">{user?.nome}</p>
              <p className="text-xs text-bibelo-muted truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2 mt-1 rounded-lg text-sm text-bibelo-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 bg-bibelo-card border-b border-bibelo-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-bibelo-muted hover:text-bibelo-text"
          >
            <Menu size={24} />
          </button>
          <span className="lg:hidden text-lg font-bold text-bibelo-text">Ecossistema Bibelô</span>
          <div className="flex-1 flex justify-center">
            <div className="w-full max-w-md">
              <GlobalSearch />
            </div>
          </div>
          <NotificationBell />
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
