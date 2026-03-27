import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Package } from 'lucide-react';
import api from '../lib/api';

interface Product {
  id: string;
  nome: string;
  sku?: string;
  preco_custo: number;
  preco_venda: number;
  categoria?: string;
  imagens: Array<{ url: string }>;
  ativo: boolean;
  estoque_total: number;
  margem_percentual: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function margemColor(m: number) {
  if (m >= 50) return 'text-emerald-400';
  if (m >= 20) return 'text-amber-400';
  return 'text-red-400';
}

function estoqueColor(e: number) {
  if (e === 0) return 'text-red-400';
  if (e <= 5) return 'text-amber-400';
  return 'text-bibelo-text';
}

export default function Produtos() {
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [categoria, setCategoria] = useState('');
  const [categorias, setCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/products/categories').then(({ data }) => setCategorias(data.data)).catch(() => {});
  }, []);

  const fetchProdutos = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20, ativo: 1 };
      if (search) params.search = search;
      if (categoria) params.categoria = categoria;
      const { data } = await api.get('/products', { params });
      setProdutos(data.data);
      setPagination(data.pagination);
    } catch {
      setProdutos([]);
    } finally {
      setLoading(false);
    }
  }, [search, categoria]);

  useEffect(() => { fetchProdutos(1); }, [fetchProdutos]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-bibelo-text">Produtos</h1>
        <div className="text-sm text-bibelo-muted">{pagination.total} produto{pagination.total !== 1 ? 's' : ''}</div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted" />
          <input
            type="text"
            placeholder="Buscar por nome ou SKU..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-bibelo-primary transition-colors"
          />
        </form>
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="px-3 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary transition-colors"
        >
          <option value="">Todas categorias</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">SKU</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Categoria</th>
                <th className="px-4 py-3 font-medium text-right">Custo</th>
                <th className="px-4 py-3 font-medium text-right">Venda</th>
                <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Margem</th>
                <th className="px-4 py-3 font-medium text-right">Estoque</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-bibelo-border/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-bibelo-border rounded animate-pulse w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : produtos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-bibelo-muted">
                    <Package size={32} className="mx-auto mb-2 opacity-50" />
                    <p>Nenhum produto encontrado</p>
                  </td>
                </tr>
              ) : (
                produtos.map((p) => (
                  <tr key={p.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/produtos/${p.id}`} className="flex items-center gap-3">
                        {p.imagens?.[0]?.url ? (
                          <img src={p.imagens[0].url} alt="" className="w-9 h-9 rounded-lg object-cover bg-bibelo-border" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-bibelo-border flex items-center justify-center">
                            <Package size={14} className="text-bibelo-muted" />
                          </div>
                        )}
                        <span className="text-bibelo-text hover:text-bibelo-primary font-medium transition-colors truncate max-w-[200px]">
                          {p.nome}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-bibelo-muted hidden sm:table-cell">{p.sku || '—'}</td>
                    <td className="px-4 py-3 text-bibelo-muted hidden md:table-cell">{p.categoria || '—'}</td>
                    <td className="px-4 py-3 text-bibelo-muted text-right">{formatCurrency(p.preco_custo)}</td>
                    <td className="px-4 py-3 text-bibelo-text text-right font-medium">{formatCurrency(p.preco_venda)}</td>
                    <td className={`px-4 py-3 text-right font-medium hidden lg:table-cell ${margemColor(p.margem_percentual)}`}>
                      {p.margem_percentual}%
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${estoqueColor(p.estoque_total)}`}>
                      {p.estoque_total}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-bibelo-border">
            <p className="text-xs text-bibelo-muted">Pagina {pagination.page} de {pagination.pages}</p>
            <div className="flex gap-1">
              <button onClick={() => fetchProdutos(pagination.page - 1)} disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 disabled:opacity-30 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => fetchProdutos(pagination.page + 1)} disabled={pagination.page >= pagination.pages}
                className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 disabled:opacity-30 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
