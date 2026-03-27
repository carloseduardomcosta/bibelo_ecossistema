import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Package, AlertTriangle, PackageX, DollarSign, ArrowDownCircle } from 'lucide-react';
import api from '../lib/api';

interface StockOverview {
  total_produtos: number;
  total_ativos: number;
  sem_estoque: number;
  estoque_baixo: number;
  valor_estoque_custo: number;
  valor_estoque_venda: number;
  por_categoria: Array<{ categoria: string; qtd_produtos: number; estoque_total: number }>;
}

interface StockProduct {
  id: string;
  nome: string;
  sku: string;
  categoria: string;
  preco_venda: number;
  preco_custo: number;
  saldo: number;
}

interface StockAlerts {
  sem_estoque: StockProduct[];
  estoque_baixo: StockProduct[];
  valor_perdido: number;
  custo_reposicao: number;
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Estoque() {
  const [data, setData] = useState<StockOverview | null>(null);
  const [alerts, setAlerts] = useState<StockAlerts | null>(null);
  const [tab, setTab] = useState<'sem' | 'baixo'>('sem');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/products/stock-overview'),
      api.get('/products/stock-alerts'),
    ])
      .then(([ovRes, alRes]) => {
        setData(ovRes.data);
        setAlerts(alRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const kpis = data ? [
    { label: 'Produtos Ativos', value: data.total_ativos.toLocaleString('pt-BR'), icon: Package, color: 'text-violet-400' },
    { label: 'Sem Estoque', value: data.sem_estoque.toLocaleString('pt-BR'), icon: PackageX, color: 'text-red-400' },
    { label: 'Estoque Baixo', value: data.estoque_baixo.toLocaleString('pt-BR'), icon: AlertTriangle, color: 'text-amber-400' },
    { label: 'Valor em Estoque', value: formatCurrency(data.valor_estoque_custo), icon: DollarSign, color: 'text-emerald-400' },
  ] : [];

  const listaAtual = tab === 'sem' ? alerts?.sem_estoque : alerts?.estoque_baixo;

  return (
    <div>
      <h1 className="text-2xl font-bold text-bibelo-text mb-6">Estoque</h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-24" />
          ))
        ) : (
          kpis.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-bibelo-muted">{label}</p>
                <Icon size={18} className={color} />
              </div>
              <p className="text-2xl font-bold text-bibelo-text">{value}</p>
            </div>
          ))
        )}
      </div>

      {/* Alerta de reposição */}
      {alerts && alerts.sem_estoque.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ArrowDownCircle size={20} className="text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">Reposicao necessaria</p>
              <p className="text-xs text-red-400/70">
                {alerts.sem_estoque.length} produtos zerados. Custo de reposicao estimado: {formatCurrency(alerts.custo_reposicao)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-bibelo-muted">Valor de venda parado</p>
            <p className="text-lg font-bold text-red-400">{formatCurrency(alerts.valor_perdido)}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Gráfico */}
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Estoque por Categoria</h2>
          {loading ? (
            <div className="h-72 flex items-center justify-center text-bibelo-muted">Carregando...</div>
          ) : !data?.por_categoria.length ? (
            <div className="h-72 flex items-center justify-center text-bibelo-muted">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.por_categoria.slice(0, 10)} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                <XAxis type="number" stroke="#64748B" fontSize={12} />
                <YAxis dataKey="categoria" type="category" stroke="#64748B" fontSize={11} width={120} tick={{ fill: '#94A3B8' }} />
                <Tooltip formatter={(v: number) => [v, 'Unidades']} contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }} />
                <Bar dataKey="estoque_total" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Valor */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Valor do Estoque</h2>
          {data && (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-bibelo-muted">Valor a Custo</p>
                <p className="text-xl font-bold text-bibelo-text">{formatCurrency(data.valor_estoque_custo)}</p>
              </div>
              <div>
                <p className="text-xs text-bibelo-muted">Valor de Venda</p>
                <p className="text-xl font-bold text-emerald-400">{formatCurrency(data.valor_estoque_venda)}</p>
              </div>
              <div className="pt-3 border-t border-bibelo-border">
                <p className="text-xs text-bibelo-muted">Lucro Potencial</p>
                <p className="text-xl font-bold text-violet-400">
                  {formatCurrency(data.valor_estoque_venda - data.valor_estoque_custo)}
                </p>
                <p className="text-xs text-bibelo-muted mt-1">
                  Margem: {data.valor_estoque_venda > 0
                    ? ((data.valor_estoque_venda - data.valor_estoque_custo) / data.valor_estoque_venda * 100).toFixed(1)
                    : 0}%
                </p>
              </div>
              <div className="pt-3 border-t border-bibelo-border">
                <p className="text-xs text-bibelo-muted">Saude do Estoque</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-2 bg-bibelo-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 rounded-full"
                      style={{ width: `${data.total_ativos > 0 ? ((data.total_ativos - data.sem_estoque) / data.total_ativos * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-bibelo-muted">
                    {data.total_ativos > 0 ? Math.round((data.total_ativos - data.sem_estoque) / data.total_ativos * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabela de alertas */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
        <div className="flex border-b border-bibelo-border">
          <button
            onClick={() => setTab('sem')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'sem'
                ? 'text-red-400 border-b-2 border-red-400 bg-red-400/5'
                : 'text-bibelo-muted hover:text-bibelo-text'
            }`}
          >
            <PackageX size={14} className="inline mr-1.5" />
            Sem Estoque ({alerts?.sem_estoque.length || 0})
          </button>
          <button
            onClick={() => setTab('baixo')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'baixo'
                ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5'
                : 'text-bibelo-muted hover:text-bibelo-text'
            }`}
          >
            <AlertTriangle size={14} className="inline mr-1.5" />
            Estoque Baixo ({alerts?.estoque_baixo.length || 0})
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">SKU</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Categoria</th>
                <th className="px-4 py-3 font-medium text-right">Custo</th>
                <th className="px-4 py-3 font-medium text-right">Venda</th>
                <th className="px-4 py-3 font-medium text-right">Estoque</th>
              </tr>
            </thead>
            <tbody>
              {!listaAtual?.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-bibelo-muted">
                    {loading ? 'Carregando...' : 'Nenhum produto nesta categoria'}
                  </td>
                </tr>
              ) : (
                listaAtual.map((p) => (
                  <tr key={p.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="text-bibelo-text font-medium truncate block max-w-[220px]">{p.nome}</span>
                    </td>
                    <td className="px-4 py-2.5 text-bibelo-muted hidden sm:table-cell">{p.sku || '—'}</td>
                    <td className="px-4 py-2.5 text-bibelo-muted hidden md:table-cell">{p.categoria}</td>
                    <td className="px-4 py-2.5 text-bibelo-muted text-right">{formatCurrency(p.preco_custo)}</td>
                    <td className="px-4 py-2.5 text-bibelo-text text-right">{formatCurrency(p.preco_venda)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-medium ${p.saldo === 0 ? 'text-red-400' : 'text-amber-400'}`}>
                        {p.saldo}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
