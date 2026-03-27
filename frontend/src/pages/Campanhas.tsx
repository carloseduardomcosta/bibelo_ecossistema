import { useEffect, useState, useCallback } from 'react';
import { Megaphone, Plus, Send, Mail, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../lib/api';

interface Campaign {
  id: string;
  nome: string;
  canal: 'email' | 'whatsapp';
  status: string;
  template_nome?: string;
  segment_nome?: string;
  total_envios: number;
  total_abertos: number;
  total_cliques: number;
  criado_em: string;
  enviado_em?: string;
}

interface Pagination { page: number; limit: number; total: number; pages: number }

const STATUS_COLORS: Record<string, string> = {
  rascunho: 'bg-bibelo-border text-bibelo-muted',
  agendada: 'bg-blue-500/20 text-blue-400',
  enviando: 'bg-amber-500/20 text-amber-400',
  ativa: 'bg-emerald-500/20 text-emerald-400',
  pausada: 'bg-red-500/20 text-red-400',
  concluida: 'bg-violet-500/20 text-violet-400',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function Campanhas() {
  const [campanhas, setCampanhas] = useState<Campaign[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ nome: '', canal: 'email' as 'email' | 'whatsapp' });
  const [creating, setCreating] = useState(false);

  const fetchCampanhas = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const { data } = await api.get('/campaigns', { params: { page, limit: 20 } });
      setCampanhas(data.data);
      setPagination(data.pagination);
    } catch { setCampanhas([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCampanhas(1); }, [fetchCampanhas]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim()) return;
    setCreating(true);
    try {
      await api.post('/campaigns', formData);
      setShowForm(false);
      setFormData({ nome: '', canal: 'email' });
      fetchCampanhas(1);
    } catch { /* */ }
    finally { setCreating(false); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Campanhas</h1>
          <p className="text-sm text-bibelo-muted mt-0.5">{pagination.total} campanha{pagination.total !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-bibelo-primary hover:bg-bibelo-primary-hover text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Nova Campanha
        </button>
      </div>

      {/* Form nova campanha */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 mb-6">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Criar campanha</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Nome da campanha"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              required
              className="flex-1 px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-bibelo-primary"
            />
            <select
              value={formData.canal}
              onChange={(e) => setFormData({ ...formData, canal: e.target.value as 'email' | 'whatsapp' })}
              className="px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
            >
              <option value="email">E-mail</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-bibelo-primary hover:bg-bibelo-primary-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {creating ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      )}

      {/* Tabela */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                <th className="px-4 py-3 font-medium">Campanha</th>
                <th className="px-4 py-3 font-medium">Canal</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Envios</th>
                <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Aberturas</th>
                <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Cliques</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Data</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-bibelo-border/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-bibelo-border rounded animate-pulse w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : campanhas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-bibelo-muted">
                    <Megaphone size={32} className="mx-auto mb-2 opacity-50" />
                    <p>Nenhuma campanha criada ainda</p>
                    <p className="text-xs mt-1">Clique em "Nova Campanha" para comecar</p>
                  </td>
                </tr>
              ) : (
                campanhas.map((c) => (
                  <tr key={c.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-bibelo-text font-medium">{c.nome}</p>
                      {c.template_nome && <p className="text-xs text-bibelo-muted">Template: {c.template_nome}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {c.canal === 'email'
                        ? <span className="inline-flex items-center gap-1 text-blue-400 text-xs"><Mail size={13} /> Email</span>
                        : <span className="inline-flex items-center gap-1 text-green-400 text-xs"><MessageCircle size={13} /> WhatsApp</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[c.status] || STATUS_COLORS.rascunho}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-bibelo-text text-right hidden sm:table-cell">
                      {c.total_envios > 0 ? (
                        <span className="flex items-center justify-end gap-1"><Send size={12} className="text-bibelo-muted" /> {c.total_envios}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-bibelo-text text-right hidden md:table-cell">
                      {c.total_envios > 0 ? `${c.total_abertos} (${Math.round(c.total_abertos / c.total_envios * 100)}%)` : '—'}
                    </td>
                    <td className="px-4 py-3 text-bibelo-text text-right hidden lg:table-cell">
                      {c.total_envios > 0 ? `${c.total_cliques} (${Math.round(c.total_cliques / c.total_envios * 100)}%)` : '—'}
                    </td>
                    <td className="px-4 py-3 text-bibelo-muted text-xs hidden sm:table-cell">
                      {formatDate(c.enviado_em || c.criado_em)}
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
              <button onClick={() => fetchCampanhas(pagination.page - 1)} disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 disabled:opacity-30 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => fetchCampanhas(pagination.page + 1)} disabled={pagination.page >= pagination.pages}
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
