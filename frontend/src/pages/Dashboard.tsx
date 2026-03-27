import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  DollarSign, ShoppingCart, TrendingUp, TrendingDown,
  AlertTriangle, PackageX, Users, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import api from '../lib/api';

interface Overview {
  receita_mes: number;
  receita_mes_anterior: number;
  receita_variacao: number;
  receita_total: number;
  pedidos_mes: number;
  pedidos_variacao: number;
  ticket_medio: number;
  ticket_variacao: number;
  total_clientes: number;
  novos_clientes_mes: number;
  novos_variacao: number;
  total_produtos: number;
  sem_estoque: number;
  estoque_baixo: number;
  segmentos: Array<{ segmento: string; total: number }>;
}

interface RevenuePoint { mes: string; receita: number; pedidos: number }

interface Insights {
  clientes_risco: Array<{ id: string; nome: string; score: number }>;
  top_clientes: Array<{ id: string; nome: string; total_pedidos: number; valor_total: number }>;
  oportunidades_perdidas: Array<{ nome: string; sku: string; preco_venda: number }>;
  categorias_margem: Array<{ categoria: string; qtd: number; margem_media: number }>;
}

const SEGMENT_COLORS = ['#8B5CF6', '#F472B6', '#34D399', '#FBBF24', '#60A5FA', '#F87171'];

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatMonth(mes: string) {
  const [year, month] = mes.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[parseInt(month, 10) - 1]}/${year.slice(2)}`;
}

function VariacaoBadge({ valor }: { valor: number }) {
  if (valor === 0) return null;
  const isPositive = valor > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
      {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(valor)}%
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [ov, setOv] = useState<Overview | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/overview'),
      api.get('/analytics/revenue'),
      api.get('/analytics/insights'),
    ])
      .then(([ovRes, revRes, insRes]) => {
        setOv(ovRes.data);
        setRevenue(revRes.data.data);
        setInsights(insRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-bibelo-border rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-bibelo-text mb-1">
        Ola, {user?.nome?.split(' ')[0]}!
      </h1>
      <p className="text-sm text-bibelo-muted mb-6">Visao geral do seu negocio</p>

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {ov && [
          { label: 'Receita do Mes', value: formatCurrency(ov.receita_mes), variacao: ov.receita_variacao, icon: DollarSign, color: 'text-emerald-400', sub: `Total: ${formatCurrency(ov.receita_total)}` },
          { label: 'Pedidos do Mes', value: ov.pedidos_mes.toString(), variacao: ov.pedidos_variacao, icon: ShoppingCart, color: 'text-blue-400', sub: `Ticket: ${formatCurrency(ov.ticket_medio)}` },
          { label: 'Clientes Ativos', value: ov.total_clientes.toString(), variacao: ov.novos_variacao, icon: Users, color: 'text-violet-400', sub: `+${ov.novos_clientes_mes} novos este mes` },
          { label: 'Ticket Medio', value: formatCurrency(ov.ticket_medio), variacao: ov.ticket_variacao, icon: TrendingUp, color: 'text-amber-400', sub: `vs ${formatCurrency(ov.receita_mes / Math.max(ov.pedidos_mes, 1))} meta` },
        ].map(({ label, value, variacao, icon: Icon, color, sub }) => (
          <div key={label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-bibelo-muted">{label}</p>
              <Icon size={18} className={color} />
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-bibelo-text">{value}</p>
              <VariacaoBadge valor={variacao} />
            </div>
            <p className="text-xs text-bibelo-muted mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Alertas */}
      {ov && (ov.sem_estoque > 0 || ov.estoque_baixo > 0) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {ov.sem_estoque > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              <PackageX size={16} />
              <span><strong>{ov.sem_estoque}</strong> produtos sem estoque</span>
            </div>
          )}
          {ov.estoque_baixo > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400">
              <AlertTriangle size={16} />
              <span><strong>{ov.estoque_baixo}</strong> produtos com estoque baixo</span>
            </div>
          )}
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Receita */}
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Receita Mensal</h2>
          {revenue.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados</div>
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
                <XAxis dataKey="mes" tickFormatter={formatMonth} stroke="#64748B" fontSize={12} />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} stroke="#64748B" fontSize={12} width={55} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    name === 'receita' ? formatCurrency(value) : value,
                    name === 'receita' ? 'Receita' : 'Pedidos',
                  ]}
                  labelFormatter={formatMonth}
                  contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }}
                  labelStyle={{ color: '#E2E8F0' }}
                />
                <Area type="monotone" dataKey="receita" stroke="#8B5CF6" strokeWidth={2} fill="url(#colorReceita)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Segmentos */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Segmentos de Clientes</h2>
          {!ov?.segmentos.length ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={ov.segmentos} dataKey="total" nameKey="segmento" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {ov.segmentos.map((_, i) => <Cell key={i} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {ov.segmentos.map((s, i) => (
                  <div key={s.segmento} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                      <span className="text-bibelo-text capitalize">{s.segmento}</span>
                    </div>
                    <span className="text-bibelo-muted">{s.total}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Clientes */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-3 flex items-center gap-2">
            <TrendingUp size={14} /> Top Clientes por Valor
          </h2>
          {!insights?.top_clientes.length ? (
            <p className="text-sm text-bibelo-muted py-4 text-center">Sem dados de vendas por cliente</p>
          ) : (
            <div className="space-y-2">
              {insights.top_clientes.slice(0, 5).map((c, i) => (
                <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-bibelo-border/50 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-bibelo-primary/20 text-bibelo-primary text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-bibelo-text truncate max-w-[160px]">{c.nome}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-bibelo-text font-medium">{formatCurrency(c.valor_total)}</p>
                    <p className="text-xs text-bibelo-muted">{c.total_pedidos} pedidos</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Oportunidades Perdidas */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
            <PackageX size={14} /> Produtos sem Estoque (maior valor)
          </h2>
          {!insights?.oportunidades_perdidas.length ? (
            <p className="text-sm text-bibelo-muted py-4 text-center">Todos os produtos com estoque</p>
          ) : (
            <div className="space-y-2">
              {insights.oportunidades_perdidas.slice(0, 5).map((p) => (
                <div key={p.sku} className="flex items-center justify-between text-sm py-1.5 border-b border-bibelo-border/50 last:border-0">
                  <span className="text-bibelo-text truncate max-w-[200px]">{p.nome}</span>
                  <span className="text-red-400 font-medium">{formatCurrency(p.preco_venda)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clientes em Risco */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-amber-400 mb-3 flex items-center gap-2">
            <TrendingDown size={14} /> Clientes em Risco de Churn
          </h2>
          {!insights?.clientes_risco.length ? (
            <p className="text-sm text-bibelo-muted py-4 text-center">Nenhum cliente em risco</p>
          ) : (
            <div className="space-y-2">
              {insights.clientes_risco.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-bibelo-border/50 last:border-0">
                  <span className="text-bibelo-text truncate max-w-[200px]">{c.nome}</span>
                  <span className="text-amber-400 font-medium">Score {c.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Categorias por Margem */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-3 flex items-center gap-2">
            <DollarSign size={14} /> Categorias por Margem
          </h2>
          {!insights?.categorias_margem.length ? (
            <p className="text-sm text-bibelo-muted py-4 text-center">Sem dados de categorias</p>
          ) : (
            <div className="space-y-2.5">
              {insights.categorias_margem.map((c) => (
                <div key={c.categoria}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-bibelo-text">{c.categoria} ({c.qtd})</span>
                    <span className={c.margem_media >= 50 ? 'text-emerald-400' : c.margem_media >= 30 ? 'text-amber-400' : 'text-red-400'}>
                      {c.margem_media}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-bibelo-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${c.margem_media >= 50 ? 'bg-emerald-500' : c.margem_media >= 30 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(c.margem_media, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
