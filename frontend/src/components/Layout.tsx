import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Package,
  Warehouse,
  TrendingUp,
  Target,
  RefreshCw,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/produtos', label: 'Produtos', icon: Package },
  { to: '/estoque', label: 'Estoque', icon: Warehouse },
  { to: '/lucratividade', label: 'Lucratividade', icon: TrendingUp },
  { to: '/segmentos', label: 'Segmentos', icon: Target },
  { to: '/campanhas', label: 'Campanhas', icon: Megaphone },
  { to: '/sync', label: 'Sync', icon: RefreshCw },
];

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
          w-64 bg-bibelo-card border-r border-bibelo-border
          flex flex-col transition-transform lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-bibelo-border">
          <span className="text-2xl">🎀</span>
          <span className="text-lg font-bold text-bibelo-text">BibeloCRM</span>
          <button
            className="ml-auto lg:hidden text-bibelo-muted hover:text-bibelo-text"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
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
        </nav>

        {/* User + Logout */}
        <div className="px-3 py-4 border-t border-bibelo-border">
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
        {/* Top bar mobile */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-bibelo-card border-b border-bibelo-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-bibelo-muted hover:text-bibelo-text"
          >
            <Menu size={24} />
          </button>
          <span className="text-lg font-bold text-bibelo-text">BibeloCRM</span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
