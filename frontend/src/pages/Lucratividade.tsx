import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, DollarSign, Percent, ShoppingCart } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import { formatCurrency, margemColor } from '../lib/format';

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

const PERIODOS = [
  { value: '1d', label: 'Hoje' },
  { value: '3d', label: '3 dias' },
  { value: '7d', label: '7 dias' },
  { value: '15d', label: '15 dias' },
  { value: '30d', label: '30 dias' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: '1a', label: '1 ano' },
  { value: 'total', label: 'Total' },
];

export default function Lucratividade() {
  const [data, setData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('total');
  const { error: showError } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = periodo !== 'total' ? `?periodo=${periodo}` : '';
      const { data } = await api.get(`/products/analytics/profitability${params}`);
      setData(data);
    } catch { showError('Erro ao carregar dados'); }
    finally { setLoading(false); }
  }, [periodo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const periodoLabel = PERIODOS.find(p => p.value === periodo)?.label || periodo;

  const kpis = data ? [
    { label: 'Receita Total', value: formatCurrency(data.resumo.receita_total), icon: DollarSign, color: 'text-emerald-400' },
    { label: 'Custo Total', value: formatCurrency(data.resumo.custo_total), icon: ShoppingCart, color: 'text-amber-400' },
    { label: 'Lucro Bruto', value: formatCurrency(data.resumo.lucro_bruto), icon: TrendingUp, color: 'text-violet-400' },
    { label: 'Margem Média', value: `${data.resumo.margem_media}%`, icon: Percent, color: 'text-pink-400' },
  ] : [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-bibelo-text">Lucratividade</h1>
        <div className="flex gap-1 bg-bibelo-card border border-bibelo-border rounded-lg p-1 flex-wrap">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                periodo === p.value ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

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
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Top Produtos por Receita — {periodoLabel}</h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Carregando...</div>
          ) : !data?.top_produtos.length ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados de vendas no período</div>
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
