import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import GlobalSearch from './GlobalSearch';
import api from '../lib/api';
import {
  LayoutDashboard,
  Users,
  Target,
  Package,
  Warehouse,
  TrendingUp,
  ShoppingBag,
  Wallet,
  CalendarClock,
  Calculator,
  FileText,
  Banknote,
  BarChart3,
  Kanban,
  Megaphone,
  RefreshCw,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle2,
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
      { to: '/vendas', label: 'Vendas', icon: ShoppingBag },
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
    label: 'Marketing',
    items: [
      { to: '/campanhas', label: 'Campanhas', icon: Megaphone },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/sync', label: 'Sync', icon: RefreshCw },
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

function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [alertas, setAlertas] = useState<Notificacao[]>([]);
  const [resumo, setResumo] = useState({ atrasados: 0, vence_em_breve: 0, pagos: 0, pendentes: 0, total: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const fetchAlertas = useCallback(async () => {
    try {
      const { data } = await api.get('/financeiro/despesas-fixas/alertas');
      setAlertas(data.data.filter((d: Notificacao) => d.alerta !== 'pago'));
      setResumo(data.resumo);
    } catch {}
  }, []);

  useEffect(() => { fetchAlertas(); }, [fetchAlertas]);

  // Refresh a cada 5 min
  useEffect(() => {
    const interval = setInterval(fetchAlertas, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAlertas]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const urgentes = resumo.atrasados + resumo.vence_em_breve;

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {alertas.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-400" />
                <p className="text-sm text-bibelo-muted">Tudo em dia!</p>
                <p className="text-xs text-bibelo-muted/60 mt-1">Nenhuma despesa pendente ou atrasada</p>
              </div>
            ) : (
              alertas.map((n) => (
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
                      Dia {n.dia_vencimento} · {fmt(parseFloat(n.valor))}
                      {n.alerta === 'atrasado' && <span className="text-red-400 ml-1">· ATRASADO</span>}
                      {n.alerta === 'vence_em_breve' && <span className="text-amber-400 ml-1">· Vence em breve</span>}
                    </p>
                  </div>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: n.categoria_cor }} />
                </button>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-bibelo-border">
            <button
              onClick={() => { setOpen(false); navigate('/despesas-fixas'); }}
              className="w-full text-center text-xs text-bibelo-primary hover:text-bibelo-primary/80 font-medium transition-colors"
            >
              Ver todas as despesas fixas
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
