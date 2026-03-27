import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Users, Download } from 'lucide-react';
import api from '../lib/api';
import { exportCsv } from '../lib/export';

interface Customer {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  canal_origem?: string;
  cidade?: string;
  estado?: string;
  score?: number;
  segmento?: string;
  criado_em: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const SEGMENT_COLORS: Record<string, string> = {
  vip: 'bg-violet-500/20 text-violet-400',
  frequente: 'bg-emerald-500/20 text-emerald-400',
  regular: 'bg-blue-500/20 text-blue-400',
  ocasional: 'bg-amber-500/20 text-amber-400',
  inativo: 'bg-red-500/20 text-red-400',
};

function segmentBadge(seg?: string) {
  if (!seg) return null;
  const cls = SEGMENT_COLORS[seg.toLowerCase()] || 'bg-bibelo-border text-bibelo-muted';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{seg}</span>;
}

function scoreColor(score?: number) {
  if (score == null) return 'text-bibelo-muted';
  if (score >= 70) return 'text-emerald-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-400';
}

export default function Clientes() {
  const [clientes, setClientes] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [segmento, setSegmento] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchClientes = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (segmento) params.segmento = segmento;
      const { data } = await api.get('/customers', { params });
      setClientes(data.data);
      setPagination(data.pagination);
    } catch {
      setClientes([]);
    } finally {
      setLoading(false);
    }
  }, [search, segmento]);

  useEffect(() => {
    fetchClientes(1);
  }, [fetchClientes]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-bibelo-text">Clientes</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-bibelo-muted">{pagination.total} cliente{pagination.total !== 1 ? 's' : ''}</span>
          <button
            onClick={() => exportCsv(clientes.map((c: any) => ({ nome: c.nome, email: c.email, telefone: c.telefone, segmento: c.segmento, canal: c.canal_origem })), 'clientes')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bibelo-card border border-bibelo-border rounded-lg text-xs text-bibelo-muted hover:text-bibelo-text transition-colors"
            title="Exportar CSV"
          >
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted" />
          <input
            type="text"
            placeholder="Buscar por nome, email ou telefone..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-bibelo-primary transition-colors"
          />
        </form>
        <select
          value={segmento}
          onChange={(e) => setSegmento(e.target.value)}
          className="px-3 py-2 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary transition-colors"
        >
          <option value="">Todos os segmentos</option>
          <option value="vip">VIP</option>
          <option value="frequente">Frequente</option>
          <option value="regular">Regular</option>
          <option value="ocasional">Ocasional</option>
          <option value="inativo">Inativo</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Telefone</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Cidade</th>
                <th className="px-4 py-3 font-medium">Segmento</th>
                <th className="px-4 py-3 font-medium text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-bibelo-border/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-bibelo-border rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : clientes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-bibelo-muted">
                    <Users size={32} className="mx-auto mb-2 opacity-50" />
                    <p>Nenhum cliente encontrado</p>
                  </td>
                </tr>
              ) : (
                clientes.map((c) => (
                  <tr key={c.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/clientes/${c.id}`} className="text-bibelo-text hover:text-bibelo-primary font-medium transition-colors">
                        {c.nome}
                      </Link>
                      <p className="text-xs text-bibelo-muted sm:hidden">{c.email}</p>
                    </td>
                    <td className="px-4 py-3 text-bibelo-muted hidden sm:table-cell">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-bibelo-muted hidden md:table-cell">{c.telefone || '—'}</td>
                    <td className="px-4 py-3 text-bibelo-muted hidden lg:table-cell">
                      {c.cidade ? `${c.cidade}${c.estado ? `/${c.estado}` : ''}` : '—'}
                    </td>
                    <td className="px-4 py-3">{segmentBadge(c.segmento)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${scoreColor(c.score)}`}>
                      {c.score != null ? c.score : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-bibelo-border">
            <p className="text-xs text-bibelo-muted">
              Página {pagination.page} de {pagination.pages}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => fetchClientes(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => fetchClientes(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
