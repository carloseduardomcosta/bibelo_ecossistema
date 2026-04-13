import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  ShoppingBag, MessageCircle, ChevronLeft, ChevronRight,
  Tag, Search, Medal, Star, Crown, LogOut, Loader2,
  ArrowRight, CheckCircle2, Sparkles, TrendingUp, Package,
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

type Tela = 'verificando' | 'login_cpf' | 'login_otp' | 'catalogo';

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

// ── Painel direito — hero imagem ─────────────────────────────────

function HeroPanel() {
  return (
    <div className="hidden lg:flex relative overflow-hidden flex-col justify-end">
      {/* Imagem de fundo */}
      <img
        src="/revendedoras.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center"
        draggable={false}
      />

      {/* Gradiente overlay — sutil no topo, denso na base */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/85 via-[#1a1a1a]/20 to-transparent" />
      {/* Toque de cor rosa no topo */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#fe68c4]/25 to-transparent" />

      {/* Badge flutuante — canto superior direito */}
      <div
        className="absolute top-8 right-8 bg-white/15 backdrop-blur-md border border-white/30
                   rounded-2xl px-4 py-3 text-white shadow-lg"
        style={{ animation: 'floatBadge 4s ease-in-out infinite' }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#fe68c4]" />
          <span className="text-sm font-semibold">Catálogo exclusivo</span>
        </div>
        <p className="text-xs text-white/70 mt-0.5">Preços de revendedora</p>
      </div>

      {/* Badge flutuante — centro esquerda */}
      <div
        className="absolute top-1/2 left-8 -translate-y-1/2 bg-white/15 backdrop-blur-md
                   border border-white/30 rounded-2xl px-4 py-3 text-white shadow-lg"
        style={{ animation: 'floatBadge 4s ease-in-out infinite 1.5s' }}
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#fff7c1]" />
          <span className="text-sm font-semibold">Até 30% OFF</span>
        </div>
        <p className="text-xs text-white/70 mt-0.5">no preço de custo</p>
      </div>

      {/* Conteúdo inferior */}
      <div className="relative z-10 p-10">
        <p className="text-[#fe68c4] text-sm font-semibold tracking-widest uppercase mb-3">
          Programa Parceiras
        </p>
        <h2
          className="text-5xl font-bold text-white leading-tight mb-4"
          style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}
        >
          Venda o que você<br />ama. Ganhe mais.
        </h2>
        <p className="text-white/70 text-base leading-relaxed mb-8 max-w-sm">
          Acesse preços exclusivos de revendedora, explore o catálogo completo
          e feche pedidos diretamente pelo WhatsApp.
        </p>

        {/* Chips de benefícios */}
        <div className="flex flex-wrap gap-2">
          {[
            { icon: Package,    label: '+1.000 produtos' },
            { icon: TrendingUp, label: 'Desconto por tier' },
            { icon: MessageCircle, label: 'Suporte WhatsApp' },
          ].map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm
                         border border-white/25 text-white text-xs font-medium
                         px-3 py-1.5 rounded-full"
            >
              <Icon className="w-3 h-3" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Keyframes inline */}
      <style>{`
        @keyframes floatBadge {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}

// ── Layout split (login) ─────────────────────────────────────────

function AuthShell({ children, step }: { children: React.ReactNode; step: 1 | 2 }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ fontFamily: 'Jost, sans-serif' }}>
      {/* Esquerda — formulário */}
      <div className="flex flex-col items-center justify-center bg-white px-8 py-12 min-h-screen">
        {/* Cabeçalho */}
        <div className="w-full max-w-sm mb-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 bg-[#fe68c4] rounded-xl flex items-center justify-center shadow-md">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-400 leading-none tracking-wide uppercase">Papelaria Bibelô</p>
              <p className="text-base font-bold text-gray-900 leading-tight">Sou Parceira</p>
            </div>
          </div>

          {/* Indicador de etapa */}
          <div className="flex items-center gap-2 mb-8">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                    ${s === step
                      ? 'bg-[#fe68c4] text-white shadow-md shadow-[#fe68c4]/40'
                      : s < step
                        ? 'bg-[#fe68c4]/20 text-[#fe68c4]'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                >
                  {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
                </div>
                {s < 2 && (
                  <div className={`h-px w-10 ${step > s ? 'bg-[#fe68c4]/40' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
            <span className="ml-2 text-xs text-gray-400">
              {step === 1 ? 'Identificação' : 'Verificação'}
            </span>
          </div>
        </div>

        {/* Conteúdo do step */}
        <div className="w-full max-w-sm">
          {children}
        </div>

        {/* Rodapé */}
        <p className="mt-10 text-xs text-gray-400 text-center">
          Ainda não é parceira?{' '}
          <a
            href="https://wa.me/5547933862514?text=Quero+ser+revendedora+Bibelô"
            target="_blank" rel="noreferrer"
            className="text-[#fe68c4] font-medium hover:underline"
          >
            Fale conosco
          </a>
        </p>
      </div>

      {/* Direita — hero */}
      <HeroPanel />
    </div>
  );
}

// ── Tela: verificando sessão ─────────────────────────────────────

function VerificandoSessao() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-[3px] border-[#fe68c4] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500" style={{ fontFamily: 'Jost, sans-serif' }}>
          Verificando acesso…
        </p>
      </div>
    </div>
  );
}

// ── Tela: inserir CPF ─────────────────────────────────────────────

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
    <AuthShell step={1}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Bem-vinda de volta
        </h1>
        <p className="text-sm text-gray-500 mb-8 leading-relaxed">
          Digite seu CPF para receber o código de acesso no email cadastrado.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="cpf"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              CPF
            </label>
            <input
              id="cpf"
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={e => setCpf(maskCPF(e.target.value))}
              required
              autoFocus
              className="w-full px-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-xl
                         text-gray-900 text-lg font-semibold tracking-wider
                         placeholder:text-gray-300 placeholder:font-normal placeholder:tracking-normal
                         focus:outline-none focus:border-[#fe68c4] focus:bg-white
                         transition-all duration-200"
            />
            <p className="text-xs text-gray-400 mt-1.5">Somente para revendedoras cadastradas</p>
          </div>

          {erro && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <div className="w-1.5 h-1.5 bg-red-400 rounded-full mt-1.5 flex-shrink-0" />
              <p className="text-sm text-red-600">{erro}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || cpf.replace(/\D/g, '').length < 11}
            className="w-full bg-[#fe68c4] text-white py-3.5 rounded-xl font-semibold text-base
                       hover:bg-[#fd4fb8] active:scale-[0.98] transition-all duration-150
                       disabled:opacity-40 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2 shadow-md shadow-[#fe68c4]/30"
          >
            {loading
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando…</>
              : <><ArrowRight className="w-5 h-5" /> Continuar</>
            }
          </button>
        </form>
      </div>
    </AuthShell>
  );
}

// ── Tela: inserir OTP ─────────────────────────────────────────────

interface OTPFormProps {
  cpf: string;
  emailMasked: string | null;
  onLogado: (rev: Revendedora) => void;
  onVoltar: () => void;
}

// 6 inputs individuais para o OTP
function OTPBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const len  = 6;

  function focus(i: number) {
    refs.current[i]?.focus();
  }

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (value[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        onChange(value.slice(0, i - 1) + value.slice(i));
        focus(i - 1);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      focus(i - 1);
    } else if (e.key === 'ArrowRight' && i < len - 1) {
      focus(i + 1);
    }
  }

  function handleInput(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!raw) return;
    // Colar múltiplos caracteres
    const chars = raw.slice(0, len - i);
    const next  = (value + '').slice(0, i) + chars + (value + '').slice(i + chars.length);
    const clipped = next.slice(0, len);
    onChange(clipped);
    const nextFocus = Math.min(i + chars.length, len - 1);
    focus(nextFocus);
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, len);
    onChange(pasted);
    focus(Math.min(pasted.length, len - 1));
  }

  return (
    <div className="flex gap-2 justify-between">
      {Array.from({ length: len }).map((_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="text"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={e => handleInput(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onFocus={e => e.target.select()}
          onPaste={i === 0 ? handlePaste : undefined}
          autoFocus={i === 0}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          className={`w-12 h-14 text-center text-2xl font-bold rounded-xl border-2
                      text-gray-900 bg-gray-50 uppercase
                      transition-all duration-200 focus:outline-none
                      ${value[i]
                        ? 'border-[#fe68c4] bg-[#ffe5ec]/50 text-[#fe68c4]'
                        : 'border-gray-200 focus:border-[#fe68c4] focus:bg-white'
                      }`}
          style={{ fontFamily: 'monospace' }}
        />
      ))}
    </div>
  );
}

function OTPForm({ cpf, emailMasked, onLogado, onVoltar }: OTPFormProps) {
  const [codigo, setCodigo]   = useState('');
  const [loading, setLoading] = useState(false);
  const [reenvio, setReenvio] = useState(false);
  const [erro, setErro]       = useState<string | null>(null);

  // Auto-submit quando todos os 6 caracteres preenchidos
  useEffect(() => {
    if (codigo.length === 6) {
      submitCodigo(codigo);
    }
  }, [codigo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitCodigo(cod: string) {
    setErro(null);
    setLoading(true);
    try {
      const res = await api.post('/souparceira/entrar', { cpf, codigo: cod });
      localStorage.setItem('souparceira_token', res.data.token);
      onLogado(res.data.revendedora);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error;
      setErro(msg || 'Código inválido ou expirado.');
      setCodigo('');
    } finally {
      setLoading(false);
    }
  }

  async function handleReenviar() {
    setReenvio(true);
    setErro(null);
    setCodigo('');
    try {
      await api.post('/souparceira/solicitar', { cpf });
    } catch {
      setErro('Não foi possível reenviar. Tente novamente.');
    } finally {
      setTimeout(() => setReenvio(false), 5000);
    }
  }

  return (
    <AuthShell step={2}>
      <div>
        <button
          onClick={onVoltar}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700
                     transition-colors mb-6 -ml-1"
        >
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Código de acesso
        </h1>
        <p className="text-sm text-gray-500 mb-8 leading-relaxed">
          {emailMasked
            ? <>Código enviado para <strong className="text-gray-700">{emailMasked}</strong></>
            : 'Verifique o email cadastrado na sua conta.'}
          {' '}Válido por 15 minutos.
        </p>

        <div className="space-y-6">
          <OTPBoxes value={codigo} onChange={setCodigo} />

          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-[#fe68c4]">
              <Loader2 className="w-4 h-4 animate-spin" /> Verificando…
            </div>
          )}

          {erro && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <div className="w-1.5 h-1.5 bg-red-400 rounded-full mt-1.5 flex-shrink-0" />
              <p className="text-sm text-red-600">{erro}</p>
            </div>
          )}

          {/* Reenvio */}
          <div className="text-center pt-2">
            {reenvio ? (
              <p className="text-sm text-green-600 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Novo código enviado!
              </p>
            ) : (
              <p className="text-sm text-gray-400">
                Não recebeu?{' '}
                <button
                  onClick={handleReenviar}
                  className="text-[#fe68c4] font-semibold hover:underline"
                >
                  Reenviar código
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </AuthShell>
  );
}

// ── Tela: catálogo ────────────────────────────────────────────────

interface CatalogoProps {
  rev: Revendedora;
  onLogout: () => void;
}

function Catalogo({ rev, onLogout }: CatalogoProps) {
  const [categorias, setCategorias]           = useState<Categoria[]>([]);
  const [catalogo, setCatalogo]               = useState<CatalogoPaginado | null>(null);
  const [loadingCat, setLoadingCat]           = useState(false);
  const [searchInput, setSearchInput]         = useState('');
  const [search, setSearch]                   = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [pagina, setPagina]                   = useState(1);

  useEffect(() => {
    api.get('/souparceira/categorias').then(r => setCategorias(r.data)).catch(() => {});
  }, []);

  const fetchCatalogo = useCallback(async (pg: number, s: string, cat: string) => {
    setLoadingCat(true);
    try {
      const params = new URLSearchParams({
        page: String(pg), limit: '24',
        ...(s && { search: s }), ...(cat && { categoria: cat }),
      });
      const res = await api.get(`/souparceira/catalogo?${params}`);
      setCatalogo(res.data);
    } catch { /* mantém estado */ } finally {
      setLoadingCat(false);
    }
  }, []);

  useEffect(() => { fetchCatalogo(pagina, search, categoriaFiltro); },
    [pagina, search, categoriaFiltro, fetchCatalogo]);

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
    <div className="min-h-screen bg-[#fdf6f9]" style={{ fontFamily: 'Jost, sans-serif' }}>

      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#fe68c4] rounded-xl flex items-center justify-center shadow-sm">
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none">Sou Parceira</p>
              <p className="font-bold text-gray-900 text-sm leading-tight">Papelaria Bibelô</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            text-xs font-semibold border ${nivelCfg.cor}`}>
              <NivelIcon className="w-3 h-3" />
              {nivelCfg.label} · {rev.percentual_desconto}% off
            </span>
            <p className="text-sm font-semibold text-gray-800 hidden md:block max-w-[140px] truncate">
              {rev.nome}
            </p>
            <button
              onClick={onLogout}
              title="Sair"
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100
                         rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero mini — desconto do tier */}
      <div className="bg-gradient-to-r from-[#fe68c4] to-[#fd4fb8] text-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-white/70 uppercase tracking-wider mb-0.5">
              Seu desconto exclusivo
            </p>
            <p className="text-2xl font-bold leading-none">
              {rev.percentual_desconto}% OFF{' '}
              <span className="text-base font-normal text-white/80">em todo o catálogo</span>
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                          bg-white/20 border border-white/30 text-white text-sm font-semibold`}>
            <NivelIcon className="w-4 h-4" />
            Tier {nivelCfg.label}
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">

        {/* Busca + filtro */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar produto..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl
                         text-gray-900 text-sm font-medium
                         focus:outline-none focus:border-[#fe68c4] focus:ring-1 focus:ring-[#fe68c4]/30
                         transition-all shadow-sm"
            />
          </div>
          <select
            value={categoriaFiltro}
            onChange={e => { setCategoriaFiltro(e.target.value); setPagina(1); }}
            className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-700
                       font-medium focus:outline-none focus:border-[#fe68c4] min-w-[200px]
                       shadow-sm cursor-pointer"
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
          <p className="text-xs text-gray-500 mb-4 font-medium">
            <span className="text-[#fe68c4] font-bold">{catalogo.total}</span>{' '}
            produto{catalogo.total !== 1 ? 's' : ''}
            {categoriaFiltro ? ` em ${formatCategoria(categoriaFiltro)}` : ''}
            {search ? ` para "${search}"` : ''}
          </p>
        )}

        {/* Grid de produtos */}
        {loadingCat ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-4 animate-pulse border border-gray-100">
                <div className="h-2.5 bg-gray-200 rounded-full mb-3 w-2/3" />
                <div className="h-3 bg-gray-200 rounded mb-1.5 w-full" />
                <div className="h-3 bg-gray-200 rounded mb-4 w-3/4" />
                <div className="h-5 bg-[#ffe5ec] rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : catalogo && catalogo.produtos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {catalogo.produtos.map(p => (
              <div
                key={p.id}
                className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm
                           hover:shadow-md hover:border-[#fe68c4]/30
                           transition-all duration-200 group cursor-default"
              >
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold
                                 text-[#fe68c4] bg-[#ffe5ec] px-2 py-0.5 rounded-full
                                 leading-none mb-3 max-w-full truncate">
                  <Tag className="w-2.5 h-2.5 flex-shrink-0" />
                  <span className="truncate">{formatCategoria(p.categoria)}</span>
                </span>
                <p className="text-sm font-semibold text-gray-800 leading-snug mb-3 line-clamp-3
                              group-hover:text-gray-900 transition-colors">
                  {p.nome}
                </p>
                <p className="text-lg font-bold text-[#fe68c4] leading-none">
                  {formatCurrency(p.preco_final)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5 font-medium">preço de revenda</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-gray-600 font-semibold">Nenhum produto encontrado</p>
            <p className="text-gray-400 text-sm mt-1">Tente ajustar os filtros de busca</p>
          </div>
        )}

        {/* Paginação */}
        {catalogo && catalogo.total_paginas > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8 pb-4">
            <button
              onClick={() => setPagina(p => Math.max(1, p - 1))}
              disabled={pagina === 1}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200
                         rounded-xl text-sm font-medium text-gray-600
                         disabled:opacity-40 hover:border-[#fe68c4] hover:text-[#fe68c4]
                         transition-colors shadow-sm"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <span className="text-sm text-gray-500 font-medium px-2">
              {pagina} de {catalogo.total_paginas}
            </span>
            <button
              onClick={() => setPagina(p => Math.min(catalogo!.total_paginas, p + 1))}
              disabled={pagina === catalogo.total_paginas}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200
                         rounded-xl text-sm font-medium text-gray-600
                         disabled:opacity-40 hover:border-[#fe68c4] hover:text-[#fe68c4]
                         transition-colors shadow-sm"
            >
              Próxima <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* WhatsApp flutuante */}
      <a
        href={`https://wa.me/5547933862514?text=${msgWA}`}
        target="_blank" rel="noreferrer"
        className="fixed bottom-6 right-6 bg-[#25d366] text-white px-5 py-3.5 rounded-2xl
                   shadow-xl hover:bg-[#1fba57] active:scale-95 transition-all
                   flex items-center gap-2 font-semibold text-sm z-50
                   shadow-[#25d366]/40"
      >
        <MessageCircle className="w-5 h-5" />
        <span>Fazer pedido</span>
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

  useEffect(() => {
    const token = localStorage.getItem('souparceira_token');
    if (!token) { setTela('login_cpf'); return; }
    api.get('/souparceira/me')
      .then(r => { setRev(r.data); setTela('catalogo'); })
      .catch(() => {
        localStorage.removeItem('souparceira_token');
        setTela('login_cpf');
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
    setTela('login_cpf');
  }

  if (tela === 'verificando')  return <VerificandoSessao />;
  if (tela === 'login_cpf')    return <LoginForm onCodigoEnviado={handleCodigoEnviado} />;
  if (tela === 'login_otp')
    return (
      <OTPForm
        cpf={cpf}
        emailMasked={emailMasked}
        onLogado={handleLogado}
        onVoltar={() => setTela('login_cpf')}
      />
    );
  if (tela === 'catalogo' && rev)
    return <Catalogo rev={rev} onLogout={handleLogout} />;

  return null;
}
