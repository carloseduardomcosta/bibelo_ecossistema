import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Users, DollarSign, ShoppingCart, UserPlus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import api from '../lib/api';

interface Overview {
  total_clientes: number;
  receita_total: number;
  ticket_medio: number;
  novos_este_mes: number;
}

interface RevenuePoint {
  mes: string;
  receita: number;
}

interface SegmentPoint {
  segmento: string;
  total: number;
}

const SEGMENT_COLORS = ['#8B5CF6', '#F472B6', '#34D399', '#FBBF24', '#60A5FA', '#F87171'];

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatMonth(mes: string) {
  const [year, month] = mes.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[parseInt(month, 10) - 1]}/${year.slice(2)}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [segments, setSegments] = useState<SegmentPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/overview'),
      api.get('/analytics/revenue'),
      api.get('/analytics/segments'),
    ])
      .then(([ovRes, revRes, segRes]) => {
        setOverview(ovRes.data);
        setRevenue(revRes.data.data);
        setSegments(segRes.data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const kpis = overview
    ? [
        { label: 'Total Clientes', value: overview.total_clientes.toLocaleString('pt-BR'), icon: Users, color: 'text-violet-400' },
        { label: 'Receita Total', value: formatCurrency(overview.receita_total), icon: DollarSign, color: 'text-emerald-400' },
        { label: 'Ticket Medio', value: formatCurrency(overview.ticket_medio), icon: ShoppingCart, color: 'text-amber-400' },
        { label: 'Novos este Mes', value: overview.novos_este_mes.toLocaleString('pt-BR'), icon: UserPlus, color: 'text-pink-400' },
      ]
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-bibelo-text mb-6">
        Ola, {user?.nome?.split(' ')[0]}!
      </h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse">
                <div className="h-4 w-24 bg-bibelo-border rounded mb-3" />
                <div className="h-8 w-32 bg-bibelo-border rounded" />
              </div>
            ))
          : kpis.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-bibelo-muted">{label}</p>
                  <Icon size={18} className={color} />
                </div>
                <p className="text-2xl font-bold text-bibelo-text">{value}</p>
              </div>
            ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Receita Mensal</h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Carregando...</div>
          ) : revenue.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados de receita ainda</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenue}>
                <defs>
                  <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                <XAxis
                  dataKey="mes"
                  tickFormatter={formatMonth}
                  stroke="#64748B"
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  stroke="#64748B"
                  fontSize={12}
                  width={60}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'Receita']}
                  labelFormatter={formatMonth}
                  contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }}
                  labelStyle={{ color: '#E2E8F0' }}
                />
                <Area
                  type="monotone"
                  dataKey="receita"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  fill="url(#colorReceita)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Segments Chart */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Segmentos</h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Carregando...</div>
          ) : segments.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem segmentos ainda</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={segments}
                  dataKey="total"
                  nameKey="segmento"
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {segments.map((_, i) => (
                    <Cell key={i} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span className="text-xs text-bibelo-muted">{value}</span>}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [value, name]}
                  contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
