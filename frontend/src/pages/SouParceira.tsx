import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  ShoppingBag, MessageCircle, ChevronLeft, ChevronRight,
  Tag, Search, Medal, Star, Crown, LogOut, Loader2,
  Mail, KeyRound, ArrowRight, CheckCircle2,
} from 'lucide-react';

// Instância axios sem interceptors de auth do CRM
const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('souparceira_token');
  if (token) cfg.headers!['Authorization'] = `Bearer ${token}`;
  return cfg;
});

// ── Tipos ────────────────────────────────────────────────────────

interface Revendedora {
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

type Tela =
  | 'verificando'
  | 'login_cpf_email'
  | 'login_otp'
  | 'catalogo';

// ── Config visual por nível ──────────────────────────────────────

const NIVEL = {
  bronze: { label: 'Bronze', cor: 'bg-amber-100 text-amber-700 border-amber-300', icon: Medal },
  prata:  { label: 'Prata',  cor: 'bg-slate-100 text-slate-600 border-slate-300', icon: Star  },
  ouro:   { label: 'Ouro',   cor: 'bg-yellow-100 text-yellow-700 border-yellow-400', icon: Crown },
};

// ── Helpers ──────────────────────────────────────────────────────

function formatCategoria(slug: string): string {
  return slug.replace(/---/g, ', ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatCurrency(v: string | number): string {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function maskCPF(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

// ── Tela: verificando sessão existente ───────────────────────────

function VerificandoSessao() {
  return (
    <div className="min-h-screen bg-[#ffe5ec] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#fe68c4] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[#fe68c4] font-medium" style={{ fontFamily: 'Jost, sans-serif' }}>
          Verificando acesso...
        </p>
      </div>
    </div>
  );
}

// ── Tela: login CPF + email ───────────────────────────────────────

interface LoginFormProps {
  onCodigoEnviado: (cpf: string, emailMasked: string | null) => void;
}

function LoginForm({ onCodigoEnviado }: LoginFormProps) {
  const [cpf, setCpf]         = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      const res = await api.post('/souparceira/solicitar', { cpf });
      // Mesmo que o CPF não exista, simulamos sucesso (segurança)
      onCodigoEnviado(cpf, res.data.email_masked ?? null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error;
      setErro(msg || 'Erro ao enviar o código. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#ffe5ec] flex items-center justify-center p-4"
         style={{ fontFamily: 'Jost, sans-serif' }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#fe68c4] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <ShoppingBag className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Sou Parceira</h1>
          <p className="text-gray-500 text-sm mt-1">Catálogo exclusivo da Papelaria Bibelô</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <p className="text-sm text-gray-600 mb-5 leading-relaxed">
            Digite seu <strong>CPF</strong> cadastrado e enviaremos um
            código de acesso para o seu email.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                CPF
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={e => setCpf(maskCPF(e.target.value))}
                required
                autoFocus
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm
                           focus:outline-none focus:border-[#fe68c4] focus:ring-1 focus:ring-[#fe68c4]"
              />
            </div>

            {erro && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#fe68c4] text-white py-2.5 rounded-xl font-semibold text-sm
                         hover:bg-[#fd4fb8] transition-colors disabled:opacity-50
                         flex items-center justify-center gap-2"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><Mail className="w-4 h-4" /> Enviar código de acesso</>
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          Ainda não é parceira?{' '}
          <a href="https://wa.me/5547933862514?text=Quero+ser+revendedora+Bibelô"
             target="_blank" rel="noreferrer"
             className="text-[#fe68c4] hover:underline">
            Fale conosco
          </a>
        </p>
      </div>
    </div>
  );
}

// ── Tela: inserir OTP ─────────────────────────────────────────────

interface OTPFormProps {
  cpf: string;
  emailMasked: string | null;
  onLogado: (rev: Revendedora, token: string) => void;
  onVoltar: () => void;
}

function OTPForm({ cpf, emailMasked, onLogado, onVoltar }: OTPFormProps) {
  const [codigo, setCodigo]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [reenvio, setReenvio]   = useState(false);
  const [erro, setErro]         = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      const res = await api.post('/souparceira/entrar', {
        cpf,
        codigo: codigo.toUpperCase(),
      });
      localStorage.setItem('souparceira_token', res.data.token);
      onLogado(res.data.revendedora, res.data.token);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error;
      setErro(msg || 'Código inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReenviar() {
    setReenvio(true);
    setErro(null);
    try {
      await api.post('/souparceira/solicitar', { cpf });
    } catch {
      setErro('Não foi possível reenviar. Tente novamente.');
    } finally {
      setTimeout(() => setReenvio(false), 5000);
    }
  }

  return (
    <div className="min-h-screen bg-[#ffe5ec] flex items-center justify-center p-4"
         style={{ fontFamily: 'Jost, sans-serif' }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#fe68c4] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Código de acesso</h1>
          <p className="text-gray-500 text-sm mt-1">
            {emailMasked
              ? <>Enviamos o código para <strong>{emailMasked}</strong></>
              : 'Verifique seu email cadastrado'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Código (6 caracteres)
              </label>
              <input
                type="text"
                placeholder="ABC123"
                value={codigo}
                onChange={e => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                required
                autoFocus
                autoComplete="one-time-code"
                className="w-full px-3 py-3 border border-gray-200 rounded-xl text-center
                           text-2xl font-bold tracking-[0.4em] font-mono
                           focus:outline-none focus:border-[#fe68c4] focus:ring-1 focus:ring-[#fe68c4]
                           uppercase"
              />
              <p className="text-xs text-gray-400 mt-1.5 text-center">Válido por 15 minutos</p>
            </div>

            {erro && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || codigo.length < 6}
              className="w-full bg-[#fe68c4] text-white py-2.5 rounded-xl font-semibold text-sm
                         hover:bg-[#fd4fb8] transition-colors disabled:opacity-50
                         flex items-center justify-center gap-2"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><ArrowRight className="w-4 h-4" /> Entrar no catálogo</>
              }
            </button>
          </form>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <button onClick={onVoltar}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              ← Voltar
            </button>
            <button
              onClick={handleReenviar}
              disabled={reenvio}
              className="text-xs text-[#fe68c4] hover:underline disabled:opacity-50 transition-colors"
            >
              {reenvio ? <><CheckCircle2 className="w-3 h-3 inline mr-1" />Código reenviado!</> : 'Reenviar código'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tela: catálogo ────────────────────────────────────────────────

interface CatalogoProps {
  rev: Revendedora;
  onLogout: () => void;
}

function Catalogo({ rev, onLogout }: CatalogoProps) {
  const [categorias, setCategorias]     = useState<Categoria[]>([]);
  const [catalogo, setCatalogo]         = useState<CatalogoPaginado | null>(null);
  const [loadingCat, setLoadingCat]     = useState(false);
  const [searchInput, setSearchInput]   = useState('');
  const [search, setSearch]             = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [pagina, setPagina]             = useState(1);

  // Carrega categorias uma vez
  useEffect(() => {
    api.get('/souparceira/categorias').then(r => setCategorias(r.data)).catch(() => {});
  }, []);

  // Carrega catálogo
  const fetchCatalogo = useCallback(async (pg: number, s: string, cat: string) => {
    setLoadingCat(true);
    try {
      const params = new URLSearchParams({
        page:  String(pg),
        limit: '24',
        ...(s   && { search: s }),
        ...(cat && { categoria: cat }),
      });
      const res = await api.get(`/souparceira/catalogo?${params}`);
      setCatalogo(res.data);
    } catch {
      // mantém estado anterior
    } finally {
      setLoadingCat(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogo(pagina, search, categoriaFiltro);
  }, [pagina, search, categoriaFiltro, fetchCatalogo]);

  // Debounce busca
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const nivelCfg = NIVEL[rev.nivel] ?? NIVEL.bronze;
  const NivelIcon = nivelCfg.icon;
  const msgWA = encodeURIComponent(
    `Olá! Sou revendedora ${rev.nome} e gostaria de fazer um pedido pelo catálogo Bibelô.`
  );

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
              <p className="text-xs text-gray-500 leading-none">Sou Parceira</p>
              <p className="font-bold text-gray-800 leading-tight text-sm">Papelaria Bibelô</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${nivelCfg.cor}`}>
              <NivelIcon className="w-3 h-3" />
              {nivelCfg.label} · {rev.percentual_desconto}% off
            </span>
            <p className="text-sm font-semibold text-gray-700 hidden sm:block max-w-[130px] truncate">
              {rev.nome}
            </p>
            <button
              onClick={onLogout}
              title="Sair"
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
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
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm
                         focus:outline-none focus:border-[#fe68c4] focus:ring-1 focus:ring-[#fe68c4]"
            />
          </div>
          <select
            value={categoriaFiltro}
            onChange={e => { setCategoriaFiltro(e.target.value); setPagina(1); }}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                       focus:outline-none focus:border-[#fe68c4] min-w-[180px]"
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
            <span className="text-sm text-gray-600">{pagina} / {catalogo.total_paginas}</span>
            <button
              onClick={() => setPagina(p => Math.min(catalogo!.total_paginas, p + 1))}
              disabled={pagina === catalogo.total_paginas}
              className="p-2 bg-white rounded-xl border border-gray-200 disabled:opacity-40 hover:border-[#fe68c4] transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        )}
      </div>

      {/* WhatsApp flutuante */}
      <a
        href={`https://wa.me/5547933862514?text=${msgWA}`}
        target="_blank" rel="noreferrer"
        className="fixed bottom-5 right-5 bg-green-500 text-white px-4 py-3 rounded-2xl
                   shadow-lg hover:bg-green-600 transition-colors flex items-center gap-2
                   font-medium text-sm z-50"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="hidden sm:inline">Fazer pedido</span>
      </a>
    </div>
  );
}

// ── Componente raiz ───────────────────────────────────────────────

export default function SouParceira() {
  const [tela, setTela]               = useState<Tela>('verificando');
  const [cpf, setCpf]                 = useState('');
  const [emailMasked, setEmailMasked] = useState<string | null>(null);
  const [rev, setRev]                 = useState<Revendedora | null>(null);

  // Verifica token existente no localStorage
  useEffect(() => {
    const token = localStorage.getItem('souparceira_token');
    if (!token) { setTela('login_cpf_email'); return; }

    api.get('/souparceira/me')
      .then(r => { setRev(r.data); setTela('catalogo'); })
      .catch(() => {
        localStorage.removeItem('souparceira_token');
        setTela('login_cpf_email');
      });
  }, []);

  function handleCodigoEnviado(c: string, masked: string | null) {
    setCpf(c); setEmailMasked(masked); setTela('login_otp');
  }

  function handleLogado(r: Revendedora) {
    setRev(r); setTela('catalogo');
  }

  function handleLogout() {
    localStorage.removeItem('souparceira_token');
    setRev(null); setCpf(''); setEmailMasked(null);
    setTela('login_cpf_email');
  }

  if (tela === 'verificando')     return <VerificandoSessao />;
  if (tela === 'login_cpf_email') return <LoginForm onCodigoEnviado={handleCodigoEnviado} />;
  if (tela === 'login_otp')
    return (
      <OTPForm
        cpf={cpf}
        emailMasked={emailMasked}
        onLogado={handleLogado}
        onVoltar={() => setTela('login_cpf_email')}
      />
    );
  if (tela === 'catalogo' && rev)
    return <Catalogo rev={rev} onLogout={handleLogout} />;

  return null;
}
