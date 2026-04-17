import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import GlobalSearch from './GlobalSearch';
import TrackingWidget from './TrackingWidget';
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
  ChevronRight,
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
  Server,
  Handshake,
  BookImage,
  KeyRound,
  BarChart2,
  Settings,
  PieChart,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface NavSubGroup {
  label: string;
  items: NavItem[];
}

interface NavMainGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  subGroups: NavSubGroup[];
}

const navMainGroups: NavMainGroup[] = [
  {
    key: 'estrategico',
    label: 'Estratégico',
    icon: BarChart2,
    subGroups: [
      {
        label: '',
        items: [
          { to: '/', label: 'Dashboard', icon: LayoutDashboard },
          { to: '/briefing', label: 'Briefing', icon: Newspaper },
          { to: '/pipeline', label: 'Pipeline', icon: Kanban },
          { to: '/inteligencia', label: 'Inteligência', icon: Target },
          { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
        ],
      },
    ],
  },
  {
    key: 'operacional',
    label: 'Operacional',
    icon: Layers,
    subGroups: [
      {
        label: 'CRM',
        items: [
          { to: '/clientes', label: 'Clientes', icon: Users },
          { to: '/segmentos', label: 'Segmentos', icon: Target },
          { to: '/revendedoras', label: 'Revendedoras', icon: Handshake },
          { to: '/dashboard-revendedoras', label: 'Dashboard B2B', icon: PieChart },
        ],
      },
      {
        label: 'Produtos',
        items: [
          { to: '/produtos', label: 'Catálogo', icon: Package },
          { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart },
          { to: '/estoque', label: 'Estoque', icon: Warehouse },
          { to: '/lucratividade', label: 'Lucratividade', icon: TrendingUp },
          { to: '/vendas', label: 'Vendas', icon: ShoppingBag },
        ],
      },
      {
        label: 'Financeiro',
        items: [
          { to: '/financeiro', label: 'Fluxo de Caixa', icon: Wallet },
          { to: '/contas-pagar', label: 'Contas a Pagar', icon: Banknote },
          { to: '/despesas-fixas', label: 'Despesas Fixas', icon: CalendarClock },
          { to: '/nf-entrada', label: 'NF Entrada', icon: FileText },
          { to: '/simulador', label: 'Simulador', icon: Calculator },
        ],
      },
      {
        label: 'Marketing',
        items: [
          { to: '/marketing', label: 'Automações', icon: Sparkles },
          { to: '/campanhas', label: 'Campanhas', icon: Megaphone },
          { to: '/landing-pages', label: 'Landing Pages', icon: Layers },
          { to: '/meta-ads', label: 'Meta Ads', icon: Radar },
        ],
      },
    ],
  },
  {
    key: 'ferramentas',
    label: 'Ferramentas',
    icon: Settings,
    subGroups: [
      {
        label: '',
        items: [
          { to: '/loja-online', label: 'Loja Online', icon: Store },
          { to: '/curadoria', label: 'Curadoria Produtos', icon: ClipboardList },
          { to: '/fornecedor-catalogo', label: 'Catálogo Fornecedor', icon: Package },
          { to: '/editor-imagens', label: 'Editor Imagens', icon: ImagePlus },
          { to: '/seo', label: 'SEO', icon: Globe },
          { to: '/catalogo-whatsapp', label: 'Catálogo WhatsApp', icon: BookImage },
          { to: '/sync', label: 'Sync', icon: RefreshCw },
          { to: '/sistema', label: 'Sistema', icon: Server },
          { to: '/filas', label: 'Filas', icon: Clock },
          { to: '/consumo-email', label: 'Consumo Email', icon: Mail },
        ],
      },
    ],
  },
];

function NavMainSection({
  group,
  isOpen,
  onToggle,
  onNavigate,
}: {
  group: NavMainGroup;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const location = useLocation();
  const GroupIcon = group.icon;

  // Auto-expand if any item in this group is active
  const allItems = group.subGroups.flatMap((sg) => sg.items);
  const hasActiveItem = allItems.some((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
  );

  useEffect(() => {
    if (hasActiveItem && !isOpen) {
      onToggle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveItem]);

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold tracking-wider text-gray-400 uppercase hover:text-gray-300 transition-colors"
      >
        <GroupIcon size={14} />
        <span>{group.label}</span>
        <ChevronRight
          size={12}
          className={`ml-auto transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {group.subGroups.map((subGroup) => (
          <div key={subGroup.label || `${group.key}-root`}>
            {subGroup.label !== '' && (
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] font-medium tracking-widest text-gray-500 uppercase">
                  {subGroup.label}
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              {subGroup.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onNavigate}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
          </div>
        ))}
      </div>
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

interface PedidoRevNotif {
  id: string;
  numero_pedido: string;
  status: string;
  total: string;
  criado_em: string;
  revendedora_nome: string;
  mensagens_nao_lidas: number;
}

interface AcessoPortal {
  id: string;
  titulo: string;
  corpo: string;
  criado_em: string;
}

const ORIGEM_LABELS: Record<string, string> = {
  parcerias_b2b: 'Parceria B2B',
  grupo_vip: 'Grupo VIP',
  formulario: 'Formulário',
};

function TrackingButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Rastrear envio"
        className="relative p-2 text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-hover
                   rounded-lg transition-colors"
      >
        <Package size={20} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[200]"
            onClick={() => setOpen(false)}
          />
          <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-bibelo-card z-[201]
                          flex flex-col shadow-2xl border-l border-bibelo-border">
            <div className="flex items-center justify-between px-5 py-4 border-b border-bibelo-border">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-pink-500" />
                <h2 className="font-semibold text-bibelo-text">Rastrear envio</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-full hover:bg-bibelo-hover transition-colors text-bibelo-muted"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <TrackingWidget showTitle={false} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

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
  const [pedidosRev, setPedidosRev] = useState<PedidoRevNotif[]>([]);
  const [pedidosRevResumo, setPedidosRevResumo] = useState({ pendentes: 0, mensagens_nao_lidas: 0 });
  const [acessosPortal, setAcessosPortal] = useState<AcessoPortal[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const fetchAlertas = useCallback(async (signal?: AbortSignal) => {
    try {
      const [finResp, leadsResp, emailResp, vendasResp, boasvindasResp, pedidosRevResp, acessosPortalResp] = await Promise.all([
        api.get('/financeiro/despesas-fixas/alertas', { signal }),
        api.get('/leads?limit=5', { signal }),
        api.get('/campaigns/email-events?hours=48', { signal }),
        api.get('/tracking/vendas-recentes?horas=48', { signal }),
        api.get('/deals/boasvindas-recentes', { signal }),
        api.get('/revendedoras/pedidos-recentes', { signal }),
        api.get('/revendedoras/acessos-portal-recentes', { signal }),
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
      setPedidosRev(pedidosRevResp.data.data || []);
      setPedidosRevResumo({
        pendentes: pedidosRevResp.data.pendentes || 0,
        mensagens_nao_lidas: pedidosRevResp.data.mensagens_nao_lidas || 0,
      });
      // Acessos das últimas 6h para o sininho
      const acessosRecentes = (acessosPortalResp.data.data || []).filter((a: AcessoPortal) => {
        return Date.now() - new Date(a.criado_em).getTime() < 6 * 3600 * 1000;
      });
      setAcessosPortal(acessosRecentes);
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

  const parceirasBtoB = boasvindasDeals.filter(d => d.origem === 'parcerias_b2b');
  const contatosVip   = boasvindasDeals.filter(d => d.origem !== 'parcerias_b2b');

  const urgentes = vendas.length + resumo.atrasados + resumo.vence_em_breve + leads.length + emailEvents.length + parceirasBtoB.length + contatosVip.length + pedidosRevResumo.pendentes + pedidosRevResumo.mensagens_nao_lidas + acessosPortal.length;

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
              {parceirasBtoB.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-cyan-400/10 text-cyan-400 rounded-full font-medium animate-pulse">
                  {parceirasBtoB.length} parceira{parceirasBtoB.length > 1 ? 's' : ''} B2B
                </span>
              )}
              {contatosVip.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-violet-400/10 text-violet-400 rounded-full font-medium animate-pulse">
                  {contatosVip.length} contato{contatosVip.length > 1 ? 's' : ''} boasvindas
                </span>
              )}
              {(pedidosRevResumo.pendentes > 0 || pedidosRevResumo.mensagens_nao_lidas > 0) && (
                <span className="text-[10px] px-2 py-0.5 bg-[#fe68c4]/10 text-[#fe68c4] rounded-full font-medium animate-pulse">
                  {pedidosRevResumo.pendentes > 0 ? `${pedidosRevResumo.pendentes} pedido${pedidosRevResumo.pendentes > 1 ? 's' : ''}` : ''}
                  {pedidosRevResumo.mensagens_nao_lidas > 0 ? ` ${pedidosRevResumo.mensagens_nao_lidas} msg` : ''}
                </span>
              )}
              {acessosPortal.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-indigo-400/10 text-indigo-400 rounded-full font-medium">
                  {acessosPortal.length} acesso{acessosPortal.length > 1 ? 's' : ''} portal
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

            {/* ── Pedidos Revendedoras ── */}
            {(pedidosRevResumo.pendentes > 0 || pedidosRevResumo.mensagens_nao_lidas > 0) && (
              <>
                <div className="px-4 py-2 bg-[#ffe5ec]/60 border-b border-bibelo-border/50">
                  <p className="text-[10px] font-bold text-[#fe68c4] uppercase tracking-wider">
                    Pedidos Revendedoras
                    {pedidosRevResumo.pendentes > 0 && (
                      <span className="ml-2 text-amber-500">{pedidosRevResumo.pendentes} pendente{pedidosRevResumo.pendentes > 1 ? 's' : ''}</span>
                    )}
                    {pedidosRevResumo.mensagens_nao_lidas > 0 && (
                      <span className="ml-2 text-blue-400">{pedidosRevResumo.mensagens_nao_lidas} msg não lida{pedidosRevResumo.mensagens_nao_lidas > 1 ? 's' : ''}</span>
                    )}
                  </p>
                </div>
                {pedidosRev.filter(p => p.status === 'pendente' || p.mensagens_nao_lidas > 0).slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setOpen(false); navigate('/revendedoras'); }}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bibelo-border/30 transition-colors text-left border-b border-bibelo-border/50"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#ffe5ec] flex items-center justify-center shrink-0">
                      <Handshake size={14} className="text-[#fe68c4]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bibelo-text truncate">
                        {p.revendedora_nome}
                        <span className="font-normal text-bibelo-muted ml-1">
                          · {p.numero_pedido}
                        </span>
                      </p>
                      <p className="text-xs text-bibelo-muted">
                        <span className={p.status === 'pendente' ? 'text-amber-500 font-medium' : 'text-bibelo-muted'}>
                          {p.status}
                        </span>
                        {p.mensagens_nao_lidas > 0 && (
                          <span className="ml-2 text-blue-400 font-medium">
                            {p.mensagens_nao_lidas} msg nova{p.mensagens_nao_lidas > 1 ? 's' : ''}
                          </span>
                        )}
                        <span className="ml-1">· {parseFloat(p.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      </p>
                    </div>
                    <span className="text-[10px] text-[#fe68c4] font-medium shrink-0">{timeAgo(p.criado_em)}</span>
                  </button>
                ))}
              </>
            )}

            {/* ── Acessos ao portal Sou Parceira ── */}
            {acessosPortal.length > 0 && (
              <>
                <div className="px-4 py-2 bg-indigo-400/5 border-b border-bibelo-border/50">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Acessos Portal Parceira</p>
                </div>
                {acessosPortal.slice(0, 5).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setOpen(false); navigate('/revendedoras'); }}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bibelo-border/30 transition-colors text-left border-b border-bibelo-border/50"
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-400/20 flex items-center justify-center shrink-0">
                      <KeyRound size={14} className="text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bibelo-text truncate">{a.titulo}</p>
                      <p className="text-xs text-bibelo-muted truncate">{a.corpo}</p>
                    </div>
                    <span className="text-[10px] text-indigo-400 font-medium shrink-0">{timeAgo(a.criado_em)}</span>
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

            {/* ── Novas Parceiras B2B ── */}
            {parceirasBtoB.length > 0 && (
              <>
                <div className="px-4 py-2 bg-cyan-400/5 border-b border-bibelo-border/50">
                  <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Novas Parceiras B2B</p>
                </div>
                {parceirasBtoB.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setOpen(false); navigate('/revendedoras'); }}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bibelo-border/30 transition-colors text-left border-b border-bibelo-border/50"
                  >
                    <div className="w-8 h-8 rounded-full bg-cyan-400/20 flex items-center justify-center shrink-0">
                      <Handshake size={14} className="text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bibelo-text truncate">
                        {d.cliente_nome || d.cliente_email.split('@')[0]}
                      </p>
                      <p className="text-xs text-bibelo-muted truncate">
                        <span className="text-cyan-400 font-medium">Parceira B2B</span>
                        {d.cliente_email && <span className="ml-1">· {d.cliente_email}</span>}
                      </p>
                    </div>
                    <span className="text-[10px] text-cyan-400 font-medium shrink-0">{timeAgo(d.criado_em)}</span>
                  </button>
                ))}
              </>
            )}

            {/* ── Contatos Boasvindas (Grupo VIP, Formulário) ── */}
            {contatosVip.length > 0 && (
              <>
                <div className="px-4 py-2 bg-violet-400/5 border-b border-bibelo-border/50">
                  <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Contatos Boasvindas</p>
                </div>
                {contatosVip.map((d) => (
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

            {alertas.length === 0 && leads.length === 0 && emailEvents.length === 0 && vendas.length === 0 && boasvindasDeals.length === 0 && pedidosRevResumo.pendentes === 0 && pedidosRevResumo.mensagens_nao_lidas === 0 && acessosPortal.length === 0 && (
              <div className="px-4 py-8 text-center">
                <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-400" />
                <p className="text-sm text-bibelo-muted">Tudo em dia!</p>
                <p className="text-xs text-bibelo-muted/60 mt-1">Nenhuma venda, lead, pedido ou despesa pendente</p>
              </div>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-bibelo-border flex gap-2 flex-wrap">
            {(pedidosRevResumo.pendentes > 0 || pedidosRevResumo.mensagens_nao_lidas > 0) && (
              <button
                onClick={() => { setOpen(false); navigate('/revendedoras'); }}
                className="flex-1 text-center text-xs text-[#fe68c4] hover:text-[#fd4fb8] font-medium transition-colors"
              >
                Ver revendedoras
              </button>
            )}
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

  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('crm-sidebar-grupos');
      return saved
        ? JSON.parse(saved)
        : { estrategico: true, operacional: true, ferramentas: false };
    } catch {
      return { estrategico: true, operacional: true, ferramentas: false };
    }
  });

  const toggleGrupo = (grupo: string) => {
    setGruposAbertos((prev) => {
      const novo = { ...prev, [grupo]: !prev[grupo] };
      localStorage.setItem('crm-sidebar-grupos', JSON.stringify(novo));
      return novo;
    });
  };

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
        <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
          {navMainGroups.map((group, index) => (
            <div key={group.key}>
              {index > 0 && <div className="border-t border-gray-700/50 my-1" />}
              <NavMainSection
                group={group}
                isOpen={!!gruposAbertos[group.key]}
                onToggle={() => toggleGrupo(group.key)}
                onNavigate={() => setSidebarOpen(false)}
              />
            </div>
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
          <TrackingButton />
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
