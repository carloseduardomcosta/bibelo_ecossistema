import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Search, ShoppingBag, MessageCircle, ChevronLeft, ChevronRight, Medal, Star, Crown, Tag } from 'lucide-react';

// Instância axios isolada — sem interceptors de auth do CRM
const portalApi = axios.create({ baseURL: '/api' });

interface PortalInfo {
  nome: string;
  nivel: 'bronze' | 'prata' | 'ouro';
  percentual_desconto: number;
}

interface Categoria {
  categoria: string;
  total: number;
}

interface Produto {
  id: string;
  nome: string;
  categoria: string;
  preco_final: string;
}

interface CatalogoPaginado {
  produtos: Produto[];
  total: number;
  pagina: number;
  total_paginas: number;
}

// ── Helpers ──────────────────────────────────────────────────

const NIVEL_CONFIG = {
  bronze: { label: 'Bronze', cor: 'bg-amber-100 text-amber-700 border-amber-300', icon: Medal },
  prata:  { label: 'Prata',  cor: 'bg-slate-100 text-slate-600 border-slate-300', icon: Star },
  ouro:   { label: 'Ouro',   cor: 'bg-yellow-100 text-yellow-700 border-yellow-400', icon: Crown },
};

function formatCategoria(slug: string): string {
  return slug.replace(/---/g, ', ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatCurrency(v: string | number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── Componente principal ──────────────────────────────────────

export default function PortalRevendedora() {
  const { token } = useParams<{ token: string }>();

  const [info, setInfo]           = useState<PortalInfo | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [catalogo, setCatalogo]   = useState<CatalogoPaginado | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadingCat, setLoadingCat] = useState(false);
  const [erro, setErro]           = useState<string | null>(null);
  const [search, setSearch]       = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [pagina, setPagina]       = useState(1);

  // ── Carrega info inicial ──────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        const [infoRes, catRes] = await Promise.all([
          portalApi.get(`/portal/${token}`),
          portalApi.get(`/portal/${token}/categorias`),
        ]);
        setInfo(infoRes.data);
        setCategorias(catRes.data);
      } catch {
        setErro('Link inválido ou expirado. Entre em contato com a Bibelô.');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [token]);

  // ── Carrega catálogo ──────────────────────────────────────

  const fetchCatalogo = useCallback(async (pg: number, s: string, cat: string) => {
    if (!info) return;
    setLoadingCat(true);
    try {
      const params = new URLSearchParams({
        page:  String(pg),
        limit: '24',
        ...(s   && { search: s }),
        ...(cat && { categoria: cat }),
      });
      const res = await portalApi.get(`/portal/${token}/catalogo?${params}`);
      setCatalogo(res.data);
    } catch {
      // ignora — mantém estado anterior
    } finally {
      setLoadingCat(false);
    }
  }, [token, info]);

  useEffect(() => {
    if (info) fetchCatalogo(pagina, search, categoriaFiltro);
  }, [info, pagina, search, categoriaFiltro, fetchCatalogo]);

  // Debounce do campo de busca
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPagina(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Estados especiais ─────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#ffe5ec] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#fe68c4] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[#fe68c4] font-medium" style={{ fontFamily: 'Jost, sans-serif' }}>Carregando catálogo...</p>
        </div>
      </div>
    );
  }

  if (erro || !info) {
    return (
      <div className="min-h-screen bg-[#ffe5ec] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-[#ffe5ec] rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="w-8 h-8 text-[#fe68c4]" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2" style={{ fontFamily: 'Jost, sans-serif' }}>
            Link não encontrado
          </h1>
          <p className="text-gray-500 text-sm mb-6" style={{ fontFamily: 'Jost, sans-serif' }}>
            {erro || 'Este link expirou ou é inválido.'}
          </p>
          <a
            href="https://wa.me/5547933862514?text=Olá! Preciso de um novo link para o catálogo de revendedoras."
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 bg-green-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-green-600 transition-colors"
            style={{ fontFamily: 'Jost, sans-serif' }}
          >
            <MessageCircle className="w-4 h-4" /> Falar com a Bibelô
          </a>
        </div>
      </div>
    );
  }

  const nivelCfg = NIVEL_CONFIG[info.nivel] || NIVEL_CONFIG.bronze;
  const NivelIcon = nivelCfg.icon;
  const msgWA = encodeURIComponent(`Olá! Sou revendedora ${info.nome} e gostaria de fazer um pedido pelo catálogo Bibelô.`);

  return (
    <div className="min-h-screen bg-[#ffe5ec]" style={{ fontFamily: 'Jost, sans-serif' }}>

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#fe68c4] rounded-xl flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-500 leading-none">Catálogo</p>
              <p className="font-bold text-gray-800 leading-tight text-sm">Papelaria Bibelô</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${nivelCfg.cor}`}>
              <NivelIcon className="w-3 h-3" />
              {nivelCfg.label} · {info.percentual_desconto}% off
            </span>
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-500 leading-none">Olá,</p>
              <p className="text-sm font-semibold text-gray-700 leading-tight max-w-[140px] truncate">{info.nome}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5">

        {/* Busca + filtro */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar produto..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#fe68c4] focus:ring-1 focus:ring-[#fe68c4]"
            />
          </div>
          <select
            value={categoriaFiltro}
            onChange={e => { setCategoriaFiltro(e.target.value); setPagina(1); }}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#fe68c4] min-w-[180px]"
          >
            <option value="">Todas as categorias</option>
            {categorias.map(c => (
              <option key={c.categoria} value={c.categoria}>
                {formatCategoria(c.categoria)} ({c.total})
              </option>
            ))}
          </select>
        </div>

        {/* Totalizador */}
        {catalogo && (
          <p className="text-xs text-gray-500 mb-4">
            {catalogo.total} produto{catalogo.total !== 1 ? 's' : ''}
            {categoriaFiltro ? ` em ${formatCategoria(categoriaFiltro)}` : ''}
            {search ? ` para "${search}"` : ''}
          </p>
        )}

        {/* Grid de produtos */}
        {loadingCat ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                <div className="h-3 bg-gray-200 rounded mb-2 w-3/4" />
                <div className="h-3 bg-gray-200 rounded mb-3 w-1/2" />
                <div className="h-5 bg-gray-200 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : catalogo && catalogo.produtos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {catalogo.produtos.map(p => (
              <div key={p.id} className="bg-white rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-1 mb-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#fe68c4] bg-[#ffe5ec] px-1.5 py-0.5 rounded-full leading-none">
                    <Tag className="w-2.5 h-2.5" />
                    {formatCategoria(p.categoria)}
                  </span>
                </div>
                <p className="text-xs font-medium text-gray-700 leading-snug mb-3 line-clamp-3">{p.nome}</p>
                <p className="text-base font-bold text-[#fe68c4]">{formatCurrency(p.preco_final)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">preço de revenda</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Nenhum produto encontrado</p>
          </div>
        )}

        {/* Paginação */}
        {catalogo && catalogo.total_paginas > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => setPagina(p => Math.max(1, p - 1))}
              disabled={pagina === 1}
              className="p-2 bg-white rounded-xl border border-gray-200 disabled:opacity-40 hover:border-[#fe68c4] transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="text-sm text-gray-600">
              {pagina} / {catalogo.total_paginas}
            </span>
            <button
              onClick={() => setPagina(p => Math.min(catalogo.total_paginas, p + 1))}
              disabled={pagina === catalogo.total_paginas}
              className="p-2 bg-white rounded-xl border border-gray-200 disabled:opacity-40 hover:border-[#fe68c4] transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        )}
      </div>

      {/* Botão WhatsApp flutuante */}
      <a
        href={`https://wa.me/5547933862514?text=${msgWA}`}
        target="_blank" rel="noreferrer"
        className="fixed bottom-5 right-5 bg-green-500 text-white px-4 py-3 rounded-2xl shadow-lg hover:bg-green-600 transition-colors flex items-center gap-2 font-medium text-sm z-50"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="hidden sm:inline">Fazer pedido</span>
      </a>
    </div>
  );
}
