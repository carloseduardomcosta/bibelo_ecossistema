import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Package, AlertTriangle, PackageX, ArrowDownCircle, Box, X, ArrowUpDown } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../lib/format';

interface StockOverview {
  total_produtos: number;
  total_ativos: number;
  com_estoque: number;
  sem_estoque: number;
  estoque_baixo: number;
  unidades_totais: number;
  valor_estoque_custo: number;
  valor_estoque_venda: number;
  lucro_potencial: number;
  margem_potencial: number;
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

interface Product {
  id: string;
  nome: string;
  sku: string;
  preco_venda: number;
  preco_custo: number;
  estoque_total: number;
  margem_percentual: number;
}

export default function Estoque() {
  const { error: showError } = useToast();
  const [data, setData] = useState<StockOverview | null>(null);
  const [alerts, setAlerts] = useState<StockAlerts | null>(null);
  const [tab, setTab] = useState<'sem' | 'baixo'>('sem');
  const [loading, setLoading] = useState(true);
  const [catSelecionada, setCatSelecionada] = useState<string | null>(null);
  const [catProdutos, setCatProdutos] = useState<Product[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catSort, setCatSort] = useState<'nome' | 'preco_venda' | 'estoque_total'>('preco_venda');
  const [catSortDir, setCatSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    Promise.all([
      api.get('/products/stock-overview'),
      api.get('/products/stock-alerts'),
    ])
      .then(([ovRes, alRes]) => {
        setData(ovRes.data);
        setAlerts(alRes.data);
      })
      .catch(() => { showError('Erro ao carregar dados de estoque'); })
      .finally(() => setLoading(false));
  }, []);

  const handleBarClick = async (catData: { categoria: string }) => {
    const cat = catData.categoria;
    if (catSelecionada === cat) {
      setCatSelecionada(null);
      setCatProdutos([]);
      return;
    }
    setCatSelecionada(cat);
    setCatLoading(true);
    try {
      const { data } = await api.get('/products', { params: { categoria: cat, limit: 100, ativo: 1 } });
      setCatProdutos(data.data);
    } catch { setCatProdutos([]); }
    finally { setCatLoading(false); }
  };

  const sortedCatProdutos = [...catProdutos].sort((a, b) => {
    const va = a[catSort];
    const vb = b[catSort];
    if (typeof va === 'string') return catSortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    return catSortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const toggleSort = (col: typeof catSort) => {
    if (catSort === col) setCatSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setCatSort(col); setCatSortDir(col === 'nome' ? 'asc' : 'desc'); }
  };

  const listaAtual = tab === 'sem' ? alerts?.sem_estoque : alerts?.estoque_baixo;

  return (
    <div>
      <h1 className="text-2xl font-bold text-bibelo-text mb-6">Estoque</h1>

      {/* Resumo financeiro */}
      {data && !loading && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6 mb-6">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Resumo do Estoque Atual</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-xs text-bibelo-muted">Unidades em Estoque</p>
              <p className="text-xl font-bold text-bibelo-text">{data.unidades_totais.toLocaleString('pt-BR')}</p>
            </div>
            <div>
              <p className="text-xs text-bibelo-muted">Produtos com Estoque</p>
              <p className="text-xl font-bold text-bibelo-text">{data.com_estoque} <span className="text-sm text-bibelo-muted font-normal">de {data.total_ativos}</span></p>
            </div>
            <div>
              <p className="text-xs text-bibelo-muted">Você Pagou (Custo)</p>
              <p className="text-xl font-bold text-amber-400">{formatCurrency(data.valor_estoque_custo)}</p>
            </div>
            <div>
              <p className="text-xs text-bibelo-muted">Pode Faturar (Venda)</p>
              <p className="text-xl font-bold text-emerald-400">{formatCurrency(data.valor_estoque_venda)}</p>
            </div>
            <div>
              <p className="text-xs text-bibelo-muted">Lucro Potencial</p>
              <p className="text-xl font-bold text-violet-400">{formatCurrency(data.lucro_potencial)}</p>
            </div>
            <div>
              <p className="text-xs text-bibelo-muted">Margem Potencial</p>
              <p className="text-xl font-bold text-bibelo-primary">{data.margem_potencial}%</p>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-24" />
          ))
        ) : data && [
          { label: 'Produtos Ativos', value: data.total_ativos, icon: Package, color: 'text-violet-400', sub: `${data.com_estoque} com estoque` },
          { label: 'Sem Estoque', value: data.sem_estoque, icon: PackageX, color: 'text-red-400', sub: `${Math.round(data.sem_estoque / data.total_ativos * 100)}% do catalogo` },
          { label: 'Estoque Baixo (1-5)', value: data.estoque_baixo, icon: AlertTriangle, color: 'text-amber-400', sub: 'Precisam reposicao em breve' },
          { label: 'Estoque Saudavel (>5)', value: data.com_estoque - data.estoque_baixo, icon: Box, color: 'text-emerald-400', sub: `${Math.round((data.com_estoque - data.estoque_baixo) / data.total_ativos * 100)}% do catalogo` },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-bibelo-muted">{label}</p>
              <Icon size={18} className={color} />
            </div>
            <p className="text-2xl font-bold text-bibelo-text">{value}</p>
            <p className="text-xs text-bibelo-muted mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Alerta reposicao */}
      {alerts && alerts.sem_estoque.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ArrowDownCircle size={20} className="text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">Reposicao necessaria</p>
              <p className="text-xs text-red-400/70">
                {alerts.sem_estoque.length} produtos zerados — investimento: ~{formatCurrency(alerts.custo_reposicao)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-bibelo-muted">Venda parada</p>
            <p className="text-lg font-bold text-red-400">{formatCurrency(alerts.valor_perdido)}</p>
          </div>
        </div>
      )}

      {/* Grafico + Saude */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-bibelo-muted">Estoque por Categoria</h2>
            <p className="text-xs text-bibelo-muted">Clique numa barra para ver os produtos</p>
          </div>
          {!data?.por_categoria.length ? (
            <div className="h-72 flex items-center justify-center text-bibelo-muted">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, data.por_categoria.length * 35)}>
              <BarChart
                data={[...data.por_categoria].sort((a, b) => b.estoque_total - a.estoque_total)}
                layout="vertical"
                margin={{ left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                <XAxis type="number" stroke="#64748B" fontSize={12} />
                <YAxis dataKey="categoria" type="category" stroke="#64748B" fontSize={11} width={140} tick={{ fill: '#94A3B8' }} />
                <Tooltip
                  formatter={(v: number) => [`${v} un.`, 'Estoque']}
                  contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }}
                />
                <Bar dataKey="estoque_total" radius={[0, 4, 4, 0]} cursor="pointer" onClick={handleBarClick}>
                  {[...data.por_categoria].sort((a, b) => b.estoque_total - a.estoque_total).map((entry) => (
                    <Cell
                      key={entry.categoria}
                      fill={catSelecionada === entry.categoria ? '#7C3AED' : '#8B5CF6'}
                      opacity={catSelecionada && catSelecionada !== entry.categoria ? 0.4 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Saude */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Saude do Estoque</h2>
          {data && (
            <div className="space-y-5">
              <div>
                <div className="flex justify-between text-xs text-bibelo-muted mb-2">
                  <span>Cobertura do catalogo</span>
                  <span>{Math.round(data.com_estoque / data.total_ativos * 100)}%</span>
                </div>
                <div className="h-3 bg-bibelo-border rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{ width: `${(data.com_estoque - data.estoque_baixo) / data.total_ativos * 100}%` }} />
                  <div className="h-full bg-amber-500" style={{ width: `${data.estoque_baixo / data.total_ativos * 100}%` }} />
                  <div className="h-full bg-red-500" style={{ width: `${data.sem_estoque / data.total_ativos * 100}%` }} />
                </div>
                <div className="flex gap-4 mt-2 text-xs">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Saudavel</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Baixo</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Zerado</span>
                </div>
              </div>
              <div className="space-y-3 pt-3 border-t border-bibelo-border">
                <div className="flex justify-between text-sm">
                  <span className="text-bibelo-muted">Investido (custo)</span>
                  <span className="text-amber-400 font-medium">{formatCurrency(data.valor_estoque_custo)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-bibelo-muted">Pode faturar (venda)</span>
                  <span className="text-emerald-400 font-medium">{formatCurrency(data.valor_estoque_venda)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-bibelo-muted">Lucro se vender tudo</span>
                  <span className="text-violet-400 font-medium">{formatCurrency(data.lucro_potencial)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-bibelo-muted">Margem media</span>
                  <span className="text-bibelo-primary font-medium">{data.margem_potencial}%</span>
                </div>
              </div>
              <div className="pt-3 border-t border-bibelo-border text-xs text-bibelo-muted">
                Atualizado a cada sync com o Bling (30 min)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drill-down da categoria selecionada */}
      {catSelecionada && (
        <div className="bg-bibelo-card border border-bibelo-primary/30 rounded-xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-bibelo-border bg-bibelo-primary/5">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-bibelo-primary" />
              <span className="text-sm font-medium text-bibelo-text">{catSelecionada}</span>
              <span className="text-xs text-bibelo-muted">— {catProdutos.length} produtos</span>
            </div>
            <button onClick={() => { setCatSelecionada(null); setCatProdutos([]); }} className="text-bibelo-muted hover:text-bibelo-text">
              <X size={16} />
            </button>
          </div>

          {catLoading ? (
            <div className="p-6 text-center text-bibelo-muted">Carregando...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                    <th className="px-4 py-3 font-medium cursor-pointer hover:text-bibelo-text" onClick={() => toggleSort('nome')}>
                      Produto <ArrowUpDown size={12} className="inline ml-1" />
                    </th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">SKU</th>
                    <th className="px-4 py-3 font-medium text-right">Custo</th>
                    <th className="px-4 py-3 font-medium text-right cursor-pointer hover:text-bibelo-text" onClick={() => toggleSort('preco_venda')}>
                      Venda <ArrowUpDown size={12} className="inline ml-1" />
                    </th>
                    <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Margem</th>
                    <th className="px-4 py-3 font-medium text-right cursor-pointer hover:text-bibelo-text" onClick={() => toggleSort('estoque_total')}>
                      Estoque <ArrowUpDown size={12} className="inline ml-1" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCatProdutos.map((p) => (
                    <tr key={p.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link to={`/produtos/${p.id}`} className="text-bibelo-text hover:text-bibelo-primary font-medium transition-colors truncate block max-w-[250px]">
                          {p.nome}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-bibelo-muted hidden sm:table-cell">{p.sku || '—'}</td>
                      <td className="px-4 py-2.5 text-bibelo-muted text-right">{formatCurrency(p.preco_custo)}</td>
                      <td className="px-4 py-2.5 text-bibelo-text text-right font-medium">{formatCurrency(p.preco_venda)}</td>
                      <td className={`px-4 py-2.5 text-right hidden md:table-cell font-medium ${
                        p.margem_percentual >= 50 ? 'text-emerald-400' : p.margem_percentual >= 20 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {p.margem_percentual}%
                      </td>
                      <td className={`px-4 py-2.5 text-right font-medium ${
                        p.estoque_total === 0 ? 'text-red-400' : p.estoque_total <= 5 ? 'text-amber-400' : 'text-bibelo-text'
                      }`}>
                        {p.estoque_total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tabela alertas */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
        <div className="flex border-b border-bibelo-border">
          <button
            onClick={() => setTab('sem')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'sem' ? 'text-red-400 border-b-2 border-red-400 bg-red-400/5' : 'text-bibelo-muted hover:text-bibelo-text'
            }`}
          >
            <PackageX size={14} className="inline mr-1.5" />
            Sem Estoque ({alerts?.sem_estoque.length || 0})
          </button>
          <button
            onClick={() => setTab('baixo')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'baixo' ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5' : 'text-bibelo-muted hover:text-bibelo-text'
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
                <tr><td colSpan={6} className="px-4 py-8 text-center text-bibelo-muted">{loading ? 'Carregando...' : 'Nenhum produto'}</td></tr>
              ) : (
                listaAtual.map((p) => (
                  <tr key={p.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors">
                    <td className="px-4 py-2.5"><span className="text-bibelo-text font-medium truncate block max-w-[220px]">{p.nome}</span></td>
                    <td className="px-4 py-2.5 text-bibelo-muted hidden sm:table-cell">{p.sku || '—'}</td>
                    <td className="px-4 py-2.5 text-bibelo-muted hidden md:table-cell">{p.categoria}</td>
                    <td className="px-4 py-2.5 text-bibelo-muted text-right">{formatCurrency(p.preco_custo)}</td>
                    <td className="px-4 py-2.5 text-bibelo-text text-right">{formatCurrency(p.preco_venda)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-medium ${p.saldo === 0 ? 'text-red-400' : 'text-amber-400'}`}>{p.saldo}</span>
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
