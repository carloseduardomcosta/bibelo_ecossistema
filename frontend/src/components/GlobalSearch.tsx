import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, Package, Receipt, FileText, X } from 'lucide-react';
import api from '../lib/api';
import { formatCurrency } from '../lib/format';

interface SearchResult {
  id: string;
  _type: string;
  _url: string;
  nome?: string;
  descricao?: string;
  fornecedor_nome?: string;
  numero?: string;
  email?: string;
  sku?: string;
  valor?: string;
  valor_total?: string;
  tipo?: string;
}

interface SearchResponse {
  clientes: SearchResult[];
  produtos: SearchResult[];
  lancamentos: SearchResult[];
  nfs: SearchResult[];
  total: number;
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Users; color: string }> = {
  cliente: { label: 'Cliente', icon: Users, color: 'text-violet-400' },
  produto: { label: 'Produto', icon: Package, color: 'text-blue-400' },
  lancamento: { label: 'Lançamento', icon: Receipt, color: 'text-emerald-400' },
  nf: { label: 'NF Entrada', icon: FileText, color: 'text-amber-400' },
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/search', { params: { q } });
      setResults(data);
    } catch { setResults(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Reset selection when results change
  useEffect(() => { setSelectedIdx(0); }, [results]);

  const handleKeyNav = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && allResults.length > 0) {
      e.preventDefault();
      handleSelect(allResults[selectedIdx]._url);
    }
  };

  const handleSelect = (url: string) => {
    setOpen(false);
    setQuery('');
    setResults(null);
    navigate(url);
  };

  const allResults: SearchResult[] = results
    ? [...results.clientes, ...results.produtos, ...results.lancamentos, ...results.nfs]
    : [];

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-muted hover:text-bibelo-text hover:border-bibelo-primary/50 transition-colors w-full lg:w-auto"
      >
        <Search size={14} />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-bibelo-border/50 rounded text-[10px] text-bibelo-muted ml-auto">
          Ctrl K
        </kbd>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl w-full max-w-lg mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-bibelo-border">
              <Search size={18} className="text-bibelo-muted shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar clientes, produtos, lançamentos, NFs..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyNav}
                className="flex-1 bg-transparent text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none"
              />
              {query && (
                <button onClick={() => { setQuery(''); setResults(null); }} className="text-bibelo-muted hover:text-bibelo-text">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto">
              {loading && (
                <div className="px-4 py-8 text-center text-bibelo-muted text-sm">Buscando...</div>
              )}

              {!loading && query.length >= 2 && allResults.length === 0 && (
                <div className="px-4 py-8 text-center text-bibelo-muted text-sm">
                  Nenhum resultado para "{query}"
                </div>
              )}

              {!loading && allResults.length > 0 && (
                <div className="py-2">
                  {allResults.map((r, i) => {
                    const cfg = TYPE_CONFIG[r._type] || TYPE_CONFIG.cliente;
                    const Icon = cfg.icon;
                    const title = r.nome || r.descricao || r.fornecedor_nome || `NF ${r.numero}`;
                    const sub = r.email || r.sku || (r.valor ? formatCurrency(r.valor) : null) || (r.valor_total ? formatCurrency(r.valor_total) : null);

                    return (
                      <button
                        key={`${r._type}-${r.id}-${i}`}
                        onClick={() => handleSelect(r._url)}
                        className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${i === selectedIdx ? 'bg-bibelo-border/40' : 'hover:bg-bibelo-border/30'}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-bibelo-border/30`}>
                          <Icon size={16} className={cfg.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-bibelo-text truncate">{title}</p>
                          {sub && <p className="text-xs text-bibelo-muted truncate">{sub}</p>}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.color} bg-bibelo-border/30`}>
                          {cfg.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {!loading && query.length < 2 && (
                <div className="px-4 py-6 text-center text-bibelo-muted text-xs">
                  Digite pelo menos 2 caracteres para buscar
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-bibelo-border text-[10px] text-bibelo-muted">
              <span>↑↓ navegar · Enter selecionar</span>
              <span>Esc para fechar</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
