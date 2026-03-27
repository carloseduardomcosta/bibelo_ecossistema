import { useEffect, useState } from 'react';
import { TrendingUp, DollarSign, Percent, ShoppingCart } from 'lucide-react';
import api from '../lib/api';

interface ProfitData {
  resumo: {
    receita_total: number;
    custo_total: number;
    lucro_bruto: number;
    margem_media: number;
  };
  top_produtos: Array<{
    bling_id: string;
    nome: string;
    sku: string;
    quantidade_vendida: number;
    receita: number;
    custo: number;
    lucro: number;
    margem_percentual: number;
  }>;
  por_categoria: Array<{
    categoria: string;
    receita: number;
    quantidade: number;
  }>;
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function margemColor(m: number) {
  if (m >= 50) return 'text-emerald-400';
  if (m >= 20) return 'text-amber-400';
  return 'text-red-400';
}

export default function Lucratividade() {
  const [data, setData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/products/analytics/profitability')
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const kpis = data ? [
    { label: 'Receita Total', value: formatCurrency(data.resumo.receita_total), icon: DollarSign, color: 'text-emerald-400' },
    { label: 'Custo Total', value: formatCurrency(data.resumo.custo_total), icon: ShoppingCart, color: 'text-amber-400' },
    { label: 'Lucro Bruto', value: formatCurrency(data.resumo.lucro_bruto), icon: TrendingUp, color: 'text-violet-400' },
    { label: 'Margem Media', value: `${data.resumo.margem_media}%`, icon: Percent, color: 'text-pink-400' },
  ] : [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-bibelo-text mb-6">Lucratividade</h1>

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Produtos */}
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Top Produtos por Receita</h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Carregando...</div>
          ) : !data?.top_produtos.length ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados de vendas</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                    <th className="px-3 py-2 font-medium">Produto</th>
                    <th className="px-3 py-2 font-medium text-right">Qtd</th>
                    <th className="px-3 py-2 font-medium text-right">Receita</th>
                    <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">Custo</th>
                    <th className="px-3 py-2 font-medium text-right">Lucro</th>
                    <th className="px-3 py-2 font-medium text-right">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_produtos.map((p) => (
                    <tr key={p.bling_id} className="border-b border-bibelo-border/50">
                      <td className="px-3 py-2">
                        <p className="text-bibelo-text font-medium truncate max-w-[180px]">{p.nome}</p>
                        <p className="text-xs text-bibelo-muted">{p.sku}</p>
                      </td>
                      <td className="px-3 py-2 text-bibelo-text text-right">{p.quantidade_vendida}</td>
                      <td className="px-3 py-2 text-bibelo-text text-right">{formatCurrency(p.receita)}</td>
                      <td className="px-3 py-2 text-bibelo-muted text-right hidden sm:table-cell">{formatCurrency(p.custo)}</td>
                      <td className="px-3 py-2 text-emerald-400 text-right font-medium">{formatCurrency(p.lucro)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${margemColor(p.margem_percentual)}`}>
                        {p.margem_percentual}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Por Categoria */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Receita por Categoria</h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Carregando...</div>
          ) : !data?.por_categoria.length ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados</div>
          ) : (
            <div className="space-y-3">
              {data.por_categoria.map((c) => {
                const maxReceita = data.por_categoria[0]?.receita || 1;
                const pct = (c.receita / maxReceita) * 100;
                return (
                  <div key={c.categoria}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-bibelo-text truncate">{c.categoria}</span>
                      <span className="text-bibelo-muted ml-2">{formatCurrency(c.receita)}</span>
                    </div>
                    <div className="h-2 bg-bibelo-border rounded-full overflow-hidden">
                      <div className="h-full bg-bibelo-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
