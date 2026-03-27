import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import GlobalSearch from './GlobalSearch';
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
  Kanban,
  Megaphone,
  RefreshCw,
  LogOut,
  Menu,
  X,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect } from 'react';

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
          <span className="text-xl">🎀</span>
          <span className="text-base font-bold text-bibelo-text">BibeloCRM</span>
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
          <span className="lg:hidden text-lg font-bold text-bibelo-text">BibeloCRM</span>
          <div className="flex-1 flex justify-center">
            <div className="w-full max-w-md">
              <GlobalSearch />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
