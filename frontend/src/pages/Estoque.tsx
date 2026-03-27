import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Package, AlertTriangle, PackageX, DollarSign } from 'lucide-react';
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

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Estoque() {
  const [data, setData] = useState<StockOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/products/stock-overview')
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const kpis = data ? [
    { label: 'Total Produtos', value: data.total_ativos.toLocaleString('pt-BR'), icon: Package, color: 'text-violet-400' },
    { label: 'Sem Estoque', value: data.sem_estoque.toLocaleString('pt-BR'), icon: PackageX, color: 'text-red-400' },
    { label: 'Estoque Baixo', value: data.estoque_baixo.toLocaleString('pt-BR'), icon: AlertTriangle, color: 'text-amber-400' },
    { label: 'Valor em Estoque', value: formatCurrency(data.valor_estoque_custo), icon: DollarSign, color: 'text-emerald-400' },
  ] : [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-bibelo-text mb-6">Estoque</h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse">
              <div className="h-4 w-24 bg-bibelo-border rounded mb-3" />
              <div className="h-8 w-32 bg-bibelo-border rounded" />
            </div>
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

      {/* Estoque por categoria + Info valor venda */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Estoque por Categoria</h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Carregando...</div>
          ) : !data?.por_categoria.length ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados de estoque</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.por_categoria.slice(0, 10)} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                <XAxis type="number" stroke="#64748B" fontSize={12} />
                <YAxis dataKey="categoria" type="category" stroke="#64748B" fontSize={11} width={120} tick={{ fill: '#94A3B8' }} />
                <Tooltip
                  formatter={(v: number) => [v, 'Unidades']}
                  contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }}
                />
                <Bar dataKey="estoque_total" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Valor do Estoque</h2>
          {data && (
            <div className="space-y-4">
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
