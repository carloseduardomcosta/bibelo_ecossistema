import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Handshake, ShoppingBag, MessageCircle, ChevronLeft, ChevronRight,
  Tag, Search, Medal, Star, Crown, LogOut, Loader2,
  ArrowRight, CheckCircle2, Sparkles, TrendingUp, Package,
  LayoutDashboard, BookOpen, Lock, Clock, Truck, CheckCircle,
  XCircle, SortAsc, ShoppingCart, Plus, Minus, Trash2, Send, X,
  ClipboardList, Eye, ImageOff, Gem,
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
  nivel: 'iniciante' | 'bronze' | 'prata' | 'ouro' | 'diamante';
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
  preco_sem_desconto: string;
  imagem_url: string | null;
  imagens_urls: string[] | null;
  descricao: string | null;
}

interface CatalogoPaginado {
  produtos: Produto[];
  total: number;
  pagina: number;
  total_paginas: number;
}

interface CartItem {
  produto: Produto;
  quantidade: number;
}

interface Pedido {
  id: string;
  numero_pedido: string;
  status: string;
  total: string;
  subtotal: string;
  desconto_percentual: string;
  desconto_valor: string;
  observacao: string | null;
  itens: Array<{
    produto_nome: string;
    quantidade: number;
    preco_unitario: number;
    preco_com_desconto: number;
  }>;
  criado_em: string;
  aprovado_em: string | null;
  enviado_em: string | null;
  entregue_em: string | null;
  mensagens_nao_lidas: number;
}

interface Mensagem {
  id: string;
  autor_tipo: 'admin' | 'revendedora';
  autor_nome: string;
  conteudo: string;
  lida: boolean;
  criado_em: string;
}

interface DashboardData {
  volume_mes_atual: number;
  total_pedidos: number;
  pontos: number;
  nivel: 'iniciante' | 'bronze' | 'prata' | 'ouro' | 'diamante';
  percentual_desconto: number;
  progresso_nivel: {
    proximo: string | null;
    meta: number;
    faltam: number;
    percentual: number;
  };
  ultimos_pedidos: Array<{
    id: string;
    status: string;
    total: string;
    criado_em: string;
  }>;
}

interface Modulo {
  id: string;
  nome: string;
  descricao: string | null;
  preco_mensal: string | null;
  ativo: boolean;
  tem_acesso: boolean;
}

type Tela   = 'verificando' | 'login_cpf' | 'login_otp' | 'logado';
type Secao  = 'dashboard' | 'catalogo' | 'pedidos' | 'recursos';

// ── Config visual por nível ──────────────────────────────────────

const NIVEL = {
  iniciante: { label: 'Iniciante', cor: 'bg-gray-100 text-gray-600 border-gray-300',         icon: Sparkles, desconto: 15, freteGratis: false, meta: 150  },
  bronze:    { label: 'Bronze',    cor: 'bg-amber-100 text-amber-700 border-amber-300',       icon: Medal,    desconto: 25, freteGratis: false, meta: 600  },
  prata:     { label: 'Prata',     cor: 'bg-slate-100 text-slate-600 border-slate-300',       icon: Star,     desconto: 35, freteGratis: false, meta: 1200 },
  ouro:      { label: 'Ouro',      cor: 'bg-yellow-100 text-yellow-700 border-yellow-400',    icon: Crown,    desconto: 45, freteGratis: true,  meta: 3000 },
  diamante:  { label: 'Diamante',  cor: 'bg-cyan-100 text-cyan-700 border-cyan-400',          icon: Gem,      desconto: 45, freteGratis: true,  meta: null },
};

const STATUS_PEDIDO: Record<string, { label: string; cor: string; icon: typeof Clock }> = {
  pendente:  { label: 'Pendente',  cor: 'text-amber-600 bg-amber-50',   icon: Clock       },
  aprovado:  { label: 'Aprovado',  cor: 'text-blue-600 bg-blue-50',     icon: CheckCircle },
  enviado:   { label: 'Enviado',   cor: 'text-violet-600 bg-violet-50', icon: Truck       },
  entregue:  { label: 'Entregue',  cor: 'text-green-600 bg-green-50',   icon: CheckCircle2 },
  cancelado: { label: 'Cancelado', cor: 'text-red-600 bg-red-50',       icon: XCircle     },
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// ── Painel direito — hero imagem ─────────────────────────────────

function HeroPanel() {
  return (
    <div className="hidden lg:flex relative overflow-hidden flex-col justify-end">
      <img
        src="/revendedoras.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/85 via-[#1a1a1a]/20 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#fe68c4]/25 to-transparent" />

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
      <div className="flex flex-col items-center justify-center bg-white px-8 py-12 min-h-screen">
        <div className="w-full max-w-sm mb-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 bg-[#fe68c4] rounded-xl flex items-center justify-center shadow-md">
              <Handshake className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-400 leading-none tracking-wide uppercase">Papelaria Bibelô</p>
              <p className="text-base font-bold text-gray-900 leading-tight">Sou Parceira</p>
            </div>
          </div>

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

        <div className="w-full max-w-sm">
          {children}
        </div>

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
      if (!res.data.ok || res.data.cadastrada === false) {
        setErro('nao_cadastrada');
        return;
      }
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
            <label htmlFor="cpf" className="block text-sm font-semibold text-gray-700 mb-2">
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

          {erro === 'nao_cadastrada' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 space-y-2">
              <p className="text-sm font-semibold text-amber-800">
                CPF não encontrado como parceira
              </p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Este CPF não está cadastrado no programa de revendedoras da Bibelô.
                Quer se tornar parceira?
              </p>
              <a
                href="https://wa.me/5547933862514?text=Olá!+Gostaria+de+me+cadastrar+como+revendedora+Bibelô"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold
                           text-white bg-[#25d366] hover:bg-[#1fba57]
                           px-3 py-1.5 rounded-lg transition-colors mt-1"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Fale conosco no WhatsApp
              </a>
            </div>
          ) : erro ? (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <div className="w-1.5 h-1.5 bg-red-400 rounded-full mt-1.5 flex-shrink-0" />
              <p className="text-sm text-red-600">{erro}</p>
            </div>
          ) : null}

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

function OTPBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const len  = 6;

  function focus(i: number) { refs.current[i]?.focus(); }

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
    const chars  = raw.slice(0, len - i);
    const next   = (value + '').slice(0, i) + chars + (value + '').slice(i + chars.length);
    const clipped = next.slice(0, len);
    onChange(clipped);
    focus(Math.min(i + chars.length, len - 1));
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
                      text-gray-900 bg-gray-50 uppercase transition-all duration-200 focus:outline-none
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

  useEffect(() => {
    if (codigo.length === 6) submitCodigo(codigo);
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

// ── Cart helpers ─────────────────────────────────────────────────

const CART_KEY = 'souparceira_cart';

function loadCart(): Map<string, CartItem> {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw) as [string, CartItem][]);
  } catch { return new Map(); }
}

function saveCart(cart: Map<string, CartItem>): void {
  localStorage.setItem(CART_KEY, JSON.stringify([...cart.entries()]));
}

// ── Header + nav (seções logadas) ────────────────────────────────

interface HeaderLogadoProps {
  rev: Revendedora;
  secao: Secao;
  onSecao: (s: Secao) => void;
  onLogout: () => void;
  cartCount: number;
  onOpenCart: () => void;
}

function HeaderLogado({ rev, secao, onSecao, onLogout, cartCount, onOpenCart }: HeaderLogadoProps) {
  const nivelCfg = NIVEL[rev.nivel] ?? NIVEL.bronze;
  const NivelIcon = nivelCfg.icon;

  const NAV: { id: Secao; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Início',   icon: LayoutDashboard },
    { id: 'catalogo',  label: 'Catálogo', icon: BookOpen        },
    { id: 'pedidos',   label: 'Pedidos',  icon: ClipboardList   },
    { id: 'recursos',  label: 'Recursos', icon: Sparkles        },
  ];

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#fe68c4] rounded-xl flex items-center justify-center shadow-sm">
              <Handshake className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none">Sou Parceira</p>
              <p className="font-bold text-gray-900 text-sm leading-tight">Papelaria Bibelô</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            text-xs font-semibold border ${nivelCfg.cor}`}>
              <NivelIcon className="w-3 h-3" />
              {nivelCfg.label} · {rev.percentual_desconto}% off
            </span>
            <p className="text-sm font-semibold text-gray-800 hidden md:block max-w-[120px] truncate">
              {rev.nome}
            </p>
            {/* Botão carrinho */}
            <button
              onClick={onOpenCart}
              title="Carrinho"
              className="relative p-2 text-gray-500 hover:text-[#fe68c4] hover:bg-[#ffe5ec]
                         rounded-lg transition-colors"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#fe68c4] text-white
                                 text-[9px] font-bold rounded-full flex items-center justify-center">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </button>
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

        {/* Nav tabs */}
        <div className="flex gap-1 -mb-px">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onSecao(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${secao === id
                  ? 'border-[#fe68c4] text-[#fe68c4]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

// ── Seção: Dashboard ─────────────────────────────────────────────

function Dashboard({ rev, onIrCatalogo }: { rev: Revendedora; onIrCatalogo: () => void }) {
  const [data, setData]   = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/souparceira/dashboard')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 text-center">
        <div className="w-8 h-8 border-2 border-[#fe68c4] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  const nivel  = data?.nivel ?? rev.nivel;
  const nivelCfg = NIVEL[nivel] ?? NIVEL.bronze;
  const NivelIcon = nivelCfg.icon;
  const pg = data?.progresso_nivel;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Saudação */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">
          Olá, {rev.nome.split(' ')[0]}! 👋
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">Veja seu desempenho este mês</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Vendas este mês',
            value: formatCurrency(data?.volume_mes_atual ?? 0),
            sub: 'volume acumulado',
            color: 'text-[#fe68c4]',
          },
          {
            label: 'Pedidos',
            value: String(data?.total_pedidos ?? 0),
            sub: 'total realizados',
            color: 'text-blue-600',
          },
          {
            label: 'Pontos',
            value: String(data?.pontos ?? 0),
            sub: 'acumulados',
            color: 'text-amber-500',
          },
          {
            label: 'Desconto',
            value: `${rev.percentual_desconto}%`,
            sub: 'em todo catálogo',
            color: 'text-green-600',
          },
        ].map(card => (
          <div key={card.label}
            className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{card.label}</p>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Badge nível + barra progresso */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full
                          text-sm font-semibold border ${nivelCfg.cor}`}>
            <NivelIcon className="w-3.5 h-3.5" />
            Nível {nivelCfg.label} · {nivelCfg.desconto}% OFF
          </span>
          {pg?.proximo && (
            <p className="text-xs text-gray-400">
              Faltam <span className="font-semibold text-gray-700">{formatCurrency(pg.faltam)}</span> para {pg.proximo}
            </p>
          )}
        </div>
        {/* Frete info */}
        <p className={`text-xs font-medium mb-2 flex items-center gap-1.5 ${nivelCfg.freteGratis ? 'text-green-600' : 'text-gray-400'}`}>
          <Truck className="w-3 h-3" />
          {nivelCfg.freteGratis
            ? 'Frete grátis — a Bibelô arca pelo envio 🎉'
            : 'Frete por sua conta · chegue ao Ouro para frete grátis!'
          }
        </p>
        {pg && pg.proximo && (
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#fe68c4] rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, pg.percentual)}%` }}
            />
          </div>
        )}
        {!pg?.proximo && (
          <p className="text-xs text-gray-500">🏆 Você atingiu o nível máximo! Frete sempre grátis.</p>
        )}
      </div>

      {/* Últimos pedidos */}
      {data && data.ultimos_pedidos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Últimos pedidos</p>
          </div>
          <div className="divide-y divide-gray-50">
            {data.ultimos_pedidos.map(p => {
              const cfg = STATUS_PEDIDO[p.status] ?? STATUS_PEDIDO.pendente;
              const Icon = cfg.icon;
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                                  text-xs font-medium ${cfg.cor}`}>
                    <Icon className="w-3 h-3" />
                    {cfg.label}
                  </span>
                  <span className="text-sm text-gray-500 flex-1">{formatDate(p.criado_em)}</span>
                  <span className="text-sm font-semibold text-gray-800">{formatCurrency(p.total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CTA catálogo */}
      <button
        onClick={onIrCatalogo}
        className="w-full bg-[#fe68c4] text-white py-3.5 rounded-xl font-semibold text-base
                   hover:bg-[#fd4fb8] active:scale-[0.98] transition-all duration-150
                   flex items-center justify-center gap-2 shadow-md shadow-[#fe68c4]/30"
      >
        <BookOpen className="w-5 h-5" />
        Acessar catálogo →
      </button>
    </div>
  );
}

// ── Seção: Catálogo ───────────────────────────────────────────────

const LIMIT_OPTIONS = [8, 12, 24, 48] as const;
type SortOption = 'nome_asc' | 'nome_desc' | 'preco_asc' | 'preco_desc';

const SORT_LABELS: Record<SortOption, string> = {
  nome_asc:   'Nome A–Z',
  nome_desc:  'Nome Z–A',
  preco_asc:  'Menor preço',
  preco_desc: 'Maior preço',
};

// ── Modal: Detalhe do Produto ─────────────────────────────────────

interface ProdutoDetalheModalProps {
  produto: Produto;
  cart: Map<string, CartItem>;
  onAddToCart: (p: Produto, qty: number) => void;
  onClose: () => void;
}

function ProdutoDetalheModal({ produto: p, cart, onAddToCart, onClose }: ProdutoDetalheModalProps) {
  const imagens: string[] = [];
  if (p.imagens_urls && p.imagens_urls.length > 0) imagens.push(...p.imagens_urls);
  else if (p.imagem_url) imagens.push(p.imagem_url);

  const [imgIdx, setImgIdx]     = useState(0);
  const [imgError, setImgError] = useState(false);
  const currentQty = cart.get(p.id)?.quantidade ?? 0;
  const [qty, setQty] = useState(Math.max(1, currentQty));

  function handleAdd() {
    onAddToCart(p, qty);
    onClose();
  }

  // Trava scroll do body enquanto modal está aberto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Fechar no Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const desconto = p.preco_sem_desconto && Number(p.preco_sem_desconto) > Number(p.preco_final)
    ? Math.round((1 - Number(p.preco_final) / Number(p.preco_sem_desconto)) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center sm:p-4">
      {/* Backdrop — clique fecha */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet: bottom sheet no mobile, dialog centralizado no desktop */}
      <div className="relative bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl
                      shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh]">

        {/* Drag handle — visível só no mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-0 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Botão fechar — canto superior direito */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-full p-1.5
                     text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors shadow-sm"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Área rolável */}
        <div className="overflow-y-auto flex-1 overscroll-contain">

          {/* Galeria de imagens */}
          {imagens.length > 0 && !imgError ? (
            <div className="relative bg-gray-50 rounded-t-3xl sm:rounded-t-2xl overflow-hidden">
              {/* Altura menor no mobile para não dominar a tela */}
              <div className="aspect-[4/3] sm:aspect-square">
                <img
                  src={imagens[imgIdx]}
                  alt={p.nome}
                  className="w-full h-full object-contain"
                  onError={() => setImgError(true)}
                />
              </div>
              {imagens.length > 1 && (
                <>
                  <button
                    onClick={() => setImgIdx(i => (i - 1 + imagens.length) % imagens.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 rounded-full p-1.5
                               shadow-md hover:bg-white transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-700" />
                  </button>
                  <button
                    onClick={() => setImgIdx(i => (i + 1) % imagens.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 rounded-full p-1.5
                               shadow-md hover:bg-white transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 text-gray-700" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {imagens.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImgIdx(i)}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          i === imgIdx ? 'bg-[#fe68c4]' : 'bg-white/70'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="aspect-[4/3] sm:aspect-square bg-gray-100 rounded-t-3xl sm:rounded-t-2xl
                            flex items-center justify-center">
              <ImageOff className="w-12 h-12 text-gray-300" />
            </div>
          )}

          {/* Thumbnails */}
          {imagens.length > 1 && !imgError && (
            <div className="flex gap-2 px-4 pt-3 overflow-x-auto pb-1">
              {imagens.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setImgIdx(i)}
                  className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                    i === imgIdx ? 'border-[#fe68c4]' : 'border-gray-200 hover:border-[#fe68c4]/50'
                  }`}
                >
                  <img src={src} alt="" className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}

          {/* Conteúdo texto */}
          <div className="px-5 pt-4 pb-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold
                             text-[#fe68c4] bg-[#ffe5ec] px-2.5 py-1 rounded-full mb-3">
              <Tag className="w-3 h-3" />
              {formatCategoria(p.categoria)}
            </span>

            <h2 className="text-base font-bold text-gray-900 leading-snug mb-3">{p.nome}</h2>

            {p.descricao ? (
              <p className="text-sm text-gray-600 leading-relaxed mb-4 whitespace-pre-line">
                {p.descricao}
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic mb-4">Sem descrição cadastrada.</p>
            )}

            {/* Preço */}
            <div className="bg-[#ffe5ec]/50 rounded-xl px-4 py-3 mb-4">
              <p className="text-[11px] text-gray-500 font-medium mb-1">Seu preço de revendedora</p>
              {desconto > 0 && (
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm text-gray-400 line-through">
                    {formatCurrency(p.preco_sem_desconto)}
                  </p>
                  <span className="text-[11px] font-bold text-white bg-[#fe68c4] px-2 py-0.5 rounded-full leading-none">
                    -{desconto}%
                  </span>
                </div>
              )}
              <p className="text-2xl font-bold text-[#fe68c4] leading-none">
                {formatCurrency(p.preco_final)}
              </p>
            </div>
          </div>
        </div>

        {/* Barra de ação — sticky na base, sempre acessível com o polegar */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-white px-5 pt-3 pb-5 sm:pb-5
                        rounded-b-none sm:rounded-b-2xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-100 rounded-xl">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="px-3 py-3 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="px-3 text-base font-bold text-gray-900 min-w-[2.5rem] text-center">
                {qty}
              </span>
              <button
                onClick={() => setQty(q => q + 1)}
                className="px-3 py-3 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleAdd}
              className="flex-1 flex items-center justify-center gap-2
                         bg-[#fe68c4] hover:bg-[#fd4fb8] active:scale-95
                         text-white font-bold text-sm py-3 rounded-xl
                         transition-all shadow-sm shadow-[#fe68c4]/30"
            >
              <ShoppingCart className="w-4 h-4" />
              {currentQty > 0
                ? `Atualizar (${qty} ${qty === 1 ? 'unid.' : 'unids.'})`
                : 'Adicionar ao carrinho'
              }
            </button>
          </div>

          {currentQty > 0 && (
            <p className="text-center text-xs text-gray-400 mt-2">
              Você já tem {currentQty} no carrinho — vai ser substituído por {qty}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface CatalogoProps {
  rev: Revendedora;
  cart: Map<string, CartItem>;
  onCartChange: (cart: Map<string, CartItem>) => void;
  onOpenCart: () => void;
}

function Catalogo({ rev, cart, onCartChange, onOpenCart }: CatalogoProps) {
  const [categorias, setCategorias]           = useState<Categoria[]>([]);
  const [catalogo, setCatalogo]               = useState<CatalogoPaginado | null>(null);
  const [loadingCat, setLoadingCat]           = useState(false);
  const [searchInput, setSearchInput]         = useState('');
  const [search, setSearch]                   = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [pagina, setPagina]                   = useState(1);
  const [sort, setSort]                       = useState<SortOption>(
    () => (localStorage.getItem('souparceira_sort') as SortOption) ?? 'nome_asc'
  );
  const [limit, setLimit]                     = useState<number>(
    () => Number(localStorage.getItem('souparceira_limit')) || 12
  );
  const [produtoAberto, setProdutoAberto]     = useState<Produto | null>(null);

  function addToCartQty(p: Produto, qty: number) {
    const next = new Map(cart);
    if (qty <= 0) { next.delete(p.id); }
    else { next.set(p.id, { produto: p, quantidade: qty }); }
    onCartChange(next);
    saveCart(next);
  }

  function addToCart(p: Produto) {
    const next = new Map(cart);
    const existing = next.get(p.id);
    if (existing) {
      next.set(p.id, { ...existing, quantidade: existing.quantidade + 1 });
    } else {
      next.set(p.id, { produto: p, quantidade: 1 });
    }
    onCartChange(next);
    saveCart(next);
  }

  useEffect(() => {
    api.get('/souparceira/categorias').then(r => setCategorias(r.data)).catch(() => {});
  }, []);

  const fetchCatalogo = useCallback(async (
    pg: number, s: string, cat: string, srt: SortOption, lim: number
  ) => {
    setLoadingCat(true);
    try {
      const params = new URLSearchParams({
        page: String(pg), limit: String(lim), sort: srt,
        ...(s && { search: s }), ...(cat && { categoria: cat }),
      });
      const res = await api.get(`/souparceira/catalogo?${params}`);
      setCatalogo(res.data);
    } catch { /* mantém estado */ } finally {
      setLoadingCat(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogo(pagina, search, categoriaFiltro, sort, limit);
  }, [pagina, search, categoriaFiltro, sort, limit, fetchCatalogo]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  function handleSort(v: SortOption) {
    setSort(v);
    localStorage.setItem('souparceira_sort', v);
    setPagina(1);
  }

  function handleLimit(v: number) {
    setLimit(v);
    localStorage.setItem('souparceira_limit', String(v));
    setPagina(1);
  }

  // "Mostrando X–Y de Z"
  const inicio = catalogo ? (catalogo.pagina - 1) * limit + 1 : 0;
  const fim    = catalogo ? Math.min(catalogo.pagina * limit, catalogo.total) : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-5">

      {/* Barra de controles */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
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
                     font-medium focus:outline-none focus:border-[#fe68c4] min-w-[180px]
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

      {/* Toolbar: ordenação + itens/página + totalizador */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2">
          <SortAsc className="w-4 h-4 text-gray-400" />
          <select
            value={sort}
            onChange={e => handleSort(e.target.value as SortOption)}
            className="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700
                       font-medium focus:outline-none focus:border-[#fe68c4] shadow-sm cursor-pointer"
          >
            {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-sm p-0.5">
          {LIMIT_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => handleLimit(n)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors
                ${limit === n
                  ? 'bg-[#fe68c4] text-white'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              {n}
            </button>
          ))}
        </div>

        {catalogo && catalogo.total > 0 && (
          <p className="text-xs text-gray-500 ml-auto">
            Mostrando{' '}
            <span className="font-semibold text-gray-700">{inicio}–{fim}</span>
            {' '}de{' '}
            <span className="text-[#fe68c4] font-bold">{catalogo.total}</span>
            {' '}produto{catalogo.total !== 1 ? 's' : ''}
            {categoriaFiltro ? ` em ${formatCategoria(categoriaFiltro)}` : ''}
            {search ? ` para "${search}"` : ''}
          </p>
        )}
      </div>

      {/* Grid de produtos */}
      {loadingCat ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: limit }).map((_, i) => (
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
                         transition-all duration-200 group flex flex-col"
            >
              {/* Imagem do produto — clicável para abrir modal */}
              {(() => {
                const imgSrc = (p.imagens_urls && p.imagens_urls.length > 0)
                  ? p.imagens_urls[0]
                  : p.imagem_url;
                return imgSrc ? (
                  <div
                    className="aspect-square bg-gray-50 rounded-lg overflow-hidden mb-3 cursor-pointer"
                    onClick={() => setProdutoAberto(p)}
                  >
                    <img
                      src={imgSrc}
                      alt={p.nome}
                      loading="lazy"
                      className="object-contain w-full h-full hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (p.imagem_url && target.src !== p.imagem_url) {
                          target.src = p.imagem_url;
                          return;
                        }
                        target.style.display = 'none';
                        const placeholder = target.nextElementSibling as HTMLElement | null;
                        if (placeholder) placeholder.style.display = 'flex';
                      }}
                    />
                    <div className="hidden w-full h-full items-center justify-center bg-gray-100">
                      <Package className="w-8 h-8 text-gray-300" />
                    </div>
                  </div>
                ) : null;
              })()}

              <span className="inline-flex items-center gap-1 text-[10px] font-semibold
                               text-[#fe68c4] bg-[#ffe5ec] px-2 py-0.5 rounded-full
                               leading-none mb-2 max-w-full truncate">
                <Tag className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">{formatCategoria(p.categoria)}</span>
              </span>
              <p
                className="text-sm font-semibold text-gray-800 leading-snug mb-1 line-clamp-2
                           group-hover:text-[#fe68c4] transition-colors flex-1 cursor-pointer"
                onClick={() => setProdutoAberto(p)}
              >
                {p.nome}
              </p>
              <div className="flex items-end justify-between mt-1 gap-2">
                <div>
                  {p.preco_sem_desconto && Number(p.preco_sem_desconto) > Number(p.preco_final) && (
                    <p className="text-[11px] text-gray-400 line-through leading-none mb-0.5">
                      {formatCurrency(p.preco_sem_desconto)}
                    </p>
                  )}
                  <p className="text-base font-bold text-[#fe68c4] leading-none">
                    {formatCurrency(p.preco_final)}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">seu preço</p>
                </div>
                {cart.has(p.id) ? (
                  <div className="flex items-center gap-1 bg-[#ffe5ec] rounded-lg px-1.5 py-1">
                    <button
                      onClick={() => {
                        const next = new Map(cart);
                        const item = next.get(p.id)!;
                        if (item.quantidade <= 1) { next.delete(p.id); }
                        else { next.set(p.id, { ...item, quantidade: item.quantidade - 1 }); }
                        onCartChange(next); saveCart(next);
                      }}
                      className="text-[#fe68c4] hover:text-[#fd4fb8] transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setProdutoAberto(p)}
                      className="text-xs font-bold text-[#fe68c4] min-w-[20px] text-center hover:underline"
                    >
                      {cart.get(p.id)!.quantidade}
                    </button>
                    <button
                      onClick={() => addToCart(p)}
                      className="text-[#fe68c4] hover:text-[#fd4fb8] transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setProdutoAberto(p)}
                    className="flex items-center gap-1 bg-[#fe68c4] text-white
                               text-[11px] font-semibold px-2.5 py-1.5 rounded-lg
                               hover:bg-[#fd4fb8] active:scale-95 transition-all"
                  >
                    <Eye className="w-3 h-3" />
                    Ver produto
                  </button>
                )}
              </div>
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

      {/* Botão flutuante — carrinho ou WhatsApp */}
      {cart.size > 0 ? (
        <button
          onClick={onOpenCart}
          className="fixed bottom-6 right-6 bg-[#fe68c4] text-white px-5 py-3.5 rounded-2xl
                     shadow-xl hover:bg-[#fd4fb8] active:scale-95 transition-all
                     flex items-center gap-2 font-semibold text-sm z-50 shadow-[#fe68c4]/40"
        >
          <ShoppingCart className="w-5 h-5" />
          <span>Ver carrinho ({cart.size})</span>
        </button>
      ) : (
        <a
          href={`https://wa.me/5547933862514?text=${encodeURIComponent(`Olá! Sou revendedora ${rev.nome} e gostaria de fazer um pedido pelo catálogo Bibelô.`)}`}
          target="_blank" rel="noreferrer"
          className="fixed bottom-6 right-6 bg-[#25d366] text-white px-5 py-3.5 rounded-2xl
                     shadow-xl hover:bg-[#1fba57] active:scale-95 transition-all
                     flex items-center gap-2 font-semibold text-sm z-50 shadow-[#25d366]/40"
        >
          <MessageCircle className="w-5 h-5" />
          <span>Dúvidas</span>
        </a>
      )}

      {/* Modal de detalhe do produto */}
      {produtoAberto && (
        <ProdutoDetalheModal
          produto={produtoAberto}
          cart={cart}
          onAddToCart={addToCartQty}
          onClose={() => setProdutoAberto(null)}
        />
      )}
    </div>
  );
}

// ── Drawer: Carrinho ─────────────────────────────────────────────

interface CartDrawerProps {
  rev: Revendedora;
  cart: Map<string, CartItem>;
  onCartChange: (cart: Map<string, CartItem>) => void;
  onClose: () => void;
  onPedidoCriado: () => void;
}

function CartDrawer({ rev, cart, onCartChange, onClose, onPedidoCriado }: CartDrawerProps) {
  const [obs, setObs]           = useState('');
  const [loading, setLoading]   = useState(false);
  const [sucesso, setSucesso]   = useState(false);
  const [erro, setErro]         = useState<string | null>(null);

  const items = [...cart.values()];
  const total       = items.reduce((s, i) => s + Number(i.produto.preco_final)        * i.quantidade, 0);
  const totalCheio  = items.reduce((s, i) => s + Number(i.produto.preco_sem_desconto) * i.quantidade, 0);
  const economia    = totalCheio - total;

  async function handleFazerPedido() {
    setLoading(true);
    setErro(null);
    try {
      await api.post('/souparceira/pedidos', {
        itens: items.map(i => ({ produto_id: i.produto.id, quantidade: i.quantidade })),
        observacao: obs.trim() || undefined,
      });
      setSucesso(true);
      const empty = new Map<string, CartItem>();
      onCartChange(empty);
      saveCart(empty);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErro(msg || 'Erro ao criar pedido. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (sucesso) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end" style={{ fontFamily: 'Jost, sans-serif' }}>
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-white w-full max-w-sm h-full flex flex-col items-center
                        justify-center text-center p-8 shadow-2xl">
          <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Pedido enviado!</h3>
          <p className="text-gray-500 text-sm mb-6">
            Seu pedido foi recebido e será analisado pela Bibelô em breve.
          </p>
          <button
            onClick={() => { onClose(); onPedidoCriado(); }}
            className="bg-[#fe68c4] text-white px-6 py-3 rounded-xl font-semibold text-sm
                       hover:bg-[#fd4fb8] transition-colors"
          >
            Ver Meus Pedidos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ fontFamily: 'Jost, sans-serif' }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-[#fe68c4]" />
            <span className="font-bold text-gray-900">Carrinho</span>
            {items.length > 0 && (
              <span className="text-xs text-gray-400">({items.length} produto{items.length > 1 ? 's' : ''})</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Itens */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {items.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <ShoppingCart className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium">Carrinho vazio</p>
              <p className="text-xs mt-1">Adicione produtos do catálogo</p>
            </div>
          )}
          {items.map(({ produto: p, quantidade }) => (
            <div key={p.id} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
              {(() => {
                const img = (p.imagens_urls && p.imagens_urls.length > 0) ? p.imagens_urls[0] : p.imagem_url;
                return img
                  ? <img src={img} alt={p.nome} className="w-12 h-12 object-contain rounded-lg bg-white border border-gray-100 flex-shrink-0" />
                  : <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-gray-300" />
                    </div>;
              })()}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug">{p.nome}</p>
                <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
                  {Number(p.preco_sem_desconto) > Number(p.preco_final) && (
                    <p className="text-[10px] text-gray-400 line-through leading-none">
                      {formatCurrency(Number(p.preco_sem_desconto) * quantidade)}
                    </p>
                  )}
                  <p className="text-xs text-[#fe68c4] font-bold leading-none">
                    {formatCurrency(Number(p.preco_final) * quantidade)}
                  </p>
                  <span className="text-[10px] text-gray-400">({quantidade}×)</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => {
                    const next = new Map(cart);
                    if (quantidade <= 1) { next.delete(p.id); }
                    else { next.set(p.id, { produto: p, quantidade: quantidade - 1 }); }
                    onCartChange(next); saveCart(next);
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-white border
                             border-gray-200 text-gray-500 hover:border-[#fe68c4] hover:text-[#fe68c4]
                             transition-colors"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-sm font-bold text-gray-800 min-w-[20px] text-center">{quantidade}</span>
                <button
                  onClick={() => {
                    const next = new Map(cart);
                    next.set(p.id, { produto: p, quantidade: quantidade + 1 });
                    onCartChange(next); saveCart(next);
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-white border
                             border-gray-200 text-gray-500 hover:border-[#fe68c4] hover:text-[#fe68c4]
                             transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  onClick={() => {
                    const next = new Map(cart);
                    next.delete(p.id);
                    onCartChange(next); saveCart(next);
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300
                             hover:text-red-400 transition-colors ml-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-4 space-y-3">
            {/* Totais com resumo de economia */}
            <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5">
              {economia > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Preço cheio:</span>
                  <span className="text-xs text-gray-400 line-through">{formatCurrency(totalCheio)}</span>
                </div>
              )}
              {economia > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    Sua economia ({rev.percentual_desconto}% off):
                  </span>
                  <span className="text-xs font-bold text-green-600">
                    − {formatCurrency(economia)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                <span className="text-base font-bold text-gray-800">Total estimado:</span>
                <span className="text-xl font-bold text-[#fe68c4]">{formatCurrency(total)}</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 text-center">
              * Preços calculados com desconto {rev.nivel}. O total final é confirmado pela Bibelô.
            </p>
            <textarea
              placeholder="Observação (opcional)..."
              value={obs}
              onChange={e => setObs(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700
                         focus:outline-none focus:border-[#fe68c4] resize-none"
            />
            {erro && (
              <p className="text-xs text-red-500 text-center">{erro}</p>
            )}
            <button
              onClick={handleFazerPedido}
              disabled={loading}
              className="w-full bg-[#fe68c4] text-white py-3.5 rounded-xl font-bold text-base
                         hover:bg-[#fd4fb8] active:scale-[0.98] transition-all
                         disabled:opacity-40 flex items-center justify-center gap-2
                         shadow-md shadow-[#fe68c4]/30"
            >
              {loading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando…</>
                : <><Send className="w-5 h-5" /> Fazer Pedido</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Seção: Meus Pedidos ──────────────────────────────────────────

function MeusPedidos({ rev: _rev }: { rev: Revendedora }) {
  const [pedidos, setPedidos]       = useState<Pedido[]>([]);
  const [loading, setLoading]       = useState(true);
  const [pedidoAberto, setPedidoAberto] = useState<Pedido | null>(null);
  const [mensagens, setMensagens]   = useState<Mensagem[]>([]);
  const [loadMsg, setLoadMsg]       = useState(false);
  const [novaMsg, setNovaMsg]       = useState('');
  const [enviando, setEnviando]     = useState(false);
  const msgEndRef                   = useRef<HTMLDivElement>(null);

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/souparceira/pedidos?limit=20');
      setPedidos(res.data.data);
    } catch { /* manter estado */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  async function abrirPedido(p: Pedido) {
    setPedidoAberto(p);
    setLoadMsg(true);
    try {
      const res = await api.get(`/souparceira/pedidos/${p.id}/mensagens`);
      setMensagens(res.data.data);
      // atualizar badge local
      setPedidos(prev => prev.map(pp => pp.id === p.id ? { ...pp, mensagens_nao_lidas: 0 } : pp));
    } catch { /* manter estado */ } finally {
      setLoadMsg(false);
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }

  async function enviarMensagem() {
    if (!novaMsg.trim() || !pedidoAberto) return;
    setEnviando(true);
    try {
      const res = await api.post(`/souparceira/pedidos/${pedidoAberto.id}/mensagens`, {
        conteudo: novaMsg.trim(),
      });
      setMensagens(prev => [...prev, res.data]);
      setNovaMsg('');
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch { /* manter estado */ } finally {
      setEnviando(false);
    }
  }

  if (pedidoAberto) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-5">
        <button
          onClick={() => { setPedidoAberto(null); fetchPedidos(); }}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700
                     transition-colors mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Voltar aos pedidos
        </button>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Pedido</p>
              <p className="font-bold text-gray-900">{pedidoAberto.numero_pedido}</p>
            </div>
            {(() => {
              const cfg = STATUS_PEDIDO[pedidoAberto.status] ?? STATUS_PEDIDO.pendente;
              const Icon = cfg.icon;
              return (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                                  text-xs font-semibold ${cfg.cor}`}>
                  <Icon className="w-3 h-3" />{cfg.label}
                </span>
              );
            })()}
          </div>
          <div className="px-5 py-3 space-y-1">
            {(pedidoAberto.itens ?? []).map((it, i) => (
              <div key={i} className="flex justify-between text-sm text-gray-600">
                <span className="flex-1 truncate pr-2">{it.produto_nome} × {it.quantidade}</span>
                <span className="font-semibold text-gray-800 flex-shrink-0">
                  {formatCurrency(it.preco_com_desconto * it.quantidade)}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-100 mt-1">
              <span>Total</span>
              <span className="text-[#fe68c4]">{formatCurrency(pedidoAberto.total)}</span>
            </div>
          </div>
        </div>

        {/* Thread mensagens */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col"
             style={{ minHeight: '300px' }}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-[#fe68c4]" />
            <span className="text-sm font-semibold text-gray-800">Mensagens</span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ maxHeight: '320px' }}>
            {loadMsg && (
              <div className="text-center py-8 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
              </div>
            )}
            {!loadMsg && mensagens.length === 0 && (
              <div className="text-center py-10 text-gray-400">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                <p className="text-sm">Nenhuma mensagem ainda. Envie uma mensagem abaixo.</p>
              </div>
            )}
            {mensagens.map(m => (
              <div
                key={m.id}
                className={`flex ${m.autor_tipo === 'revendedora' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
                  ${m.autor_tipo === 'revendedora'
                    ? 'bg-[#fe68c4] text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}
                >
                  <p>{m.conteudo}</p>
                  <p className={`text-[10px] mt-1 ${
                    m.autor_tipo === 'revendedora' ? 'text-white/70' : 'text-gray-400'
                  }`}>
                    {m.autor_nome} · {new Date(m.criado_em).toLocaleString('pt-BR', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={msgEndRef} />
          </div>
          <div className="border-t border-gray-100 px-4 py-3 flex gap-2">
            <textarea
              placeholder="Escreva uma mensagem…"
              value={novaMsg}
              onChange={e => setNovaMsg(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem(); }
              }}
              rows={2}
              maxLength={2000}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm
                         focus:outline-none focus:border-[#fe68c4] resize-none"
            />
            <button
              onClick={enviarMensagem}
              disabled={!novaMsg.trim() || enviando}
              className="self-end bg-[#fe68c4] text-white px-4 py-2.5 rounded-xl font-semibold text-sm
                         hover:bg-[#fd4fb8] active:scale-95 transition-all
                         disabled:opacity-40 flex items-center gap-1.5"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Meus pedidos</h2>
        <p className="text-sm text-gray-500 mt-0.5">Histórico e status dos seus pedidos</p>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-[#fe68c4] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : pedidos.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <ClipboardList className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhum pedido ainda</p>
          <p className="text-gray-400 text-sm mt-1">Adicione produtos ao carrinho e faça seu primeiro pedido!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map(p => {
            const cfg = STATUS_PEDIDO[p.status] ?? STATUS_PEDIDO.pendente;
            const Icon = cfg.icon;
            return (
              <button
                key={p.id}
                onClick={() => abrirPedido(p)}
                className="w-full bg-white rounded-xl border border-gray-100 shadow-sm
                           hover:border-[#fe68c4]/30 hover:shadow-md
                           transition-all text-left px-5 py-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800">{p.numero_pedido}</span>
                    {p.mensagens_nao_lidas > 0 && (
                      <span className="w-4 h-4 bg-[#fe68c4] text-white text-[9px] font-bold
                                       rounded-full flex items-center justify-center">
                        {p.mensagens_nao_lidas}
                      </span>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                                    text-xs font-semibold ${cfg.cor}`}>
                    <Icon className="w-3 h-3" />
                    {cfg.label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{formatDate(p.criado_em)}</span>
                  <span className="font-bold text-gray-800">{formatCurrency(p.total)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <MessageCircle className="w-3.5 h-3.5 text-gray-300" />
                  <span className="text-xs text-gray-400">Toque para ver mensagens</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 ml-auto" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Seção: Recursos (scaffold) ───────────────────────────────────

function Recursos() {
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/souparceira/modulos')
      .then(r => setModulos(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 text-center">
        <div className="w-8 h-8 border-2 border-[#fe68c4] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  const ativos   = modulos.filter(m => m.tem_acesso);
  const disponiveis = modulos.filter(m => !m.tem_acesso);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Recursos disponíveis</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Módulos extras para potencializar sua revenda
        </p>
      </div>

      {ativos.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Seus módulos ativos
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {ativos.map(m => (
              <div key={m.id}
                className="bg-white rounded-xl p-4 border border-[#fe68c4]/30 shadow-sm
                           flex items-start gap-3">
                <div className="w-9 h-9 bg-[#ffe5ec] rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-[#fe68c4]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{m.nome}</p>
                  {m.descricao && <p className="text-xs text-gray-500 mt-0.5">{m.descricao}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        {ativos.length > 0 && (
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Em breve
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {disponiveis.map(m => (
            <div key={m.id}
              className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm
                         flex items-start gap-3 opacity-70">
              <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-700">{m.nome}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                    Em breve
                  </span>
                </div>
                {m.descricao && <p className="text-xs text-gray-400 mt-0.5">{m.descricao}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {modulos.length === 0 && (
        <div className="text-center py-16">
          <Sparkles className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhum módulo disponível ainda</p>
          <p className="text-gray-400 text-sm mt-1">Em breve novidades por aqui!</p>
        </div>
      )}
    </div>
  );
}

// ── Componente raiz ───────────────────────────────────────────────

export default function SouParceira() {
  const [tela, setTela]               = useState<Tela>('verificando');
  const [secao, setSecao]             = useState<Secao>('dashboard');
  const [cpf, setCpf]                 = useState('');
  const [emailMasked, setEmailMasked] = useState<string | null>(null);
  const [rev, setRev]                 = useState<Revendedora | null>(null);
  const [cart, setCart]               = useState<Map<string, CartItem>>(() => loadCart());
  const [cartOpen, setCartOpen]       = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('souparceira_token');
    if (!token) { setTela('login_cpf'); return; }
    api.get('/souparceira/me')
      .then(r => { setRev(r.data); setTela('logado'); setSecao('dashboard'); })
      .catch(() => {
        localStorage.removeItem('souparceira_token');
        setTela('login_cpf');
      });
  }, []);

  function handleCodigoEnviado(c: string, masked: string | null) {
    setCpf(c); setEmailMasked(masked); setTela('login_otp');
  }

  function handleLogado(r: Revendedora) {
    setRev(r); setTela('logado'); setSecao('dashboard');
  }

  function handleLogout() {
    localStorage.removeItem('souparceira_token');
    setRev(null); setCpf(''); setEmailMasked(null);
    setTela('login_cpf');
  }

  const cartCount = [...cart.values()].reduce((s, i) => s + i.quantidade, 0);

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

  if (tela === 'logado' && rev) {
    return (
      <div className="min-h-screen bg-[#fdf6f9]" style={{ fontFamily: 'Jost, sans-serif' }}>
        <HeaderLogado
          rev={rev}
          secao={secao}
          onSecao={setSecao}
          onLogout={handleLogout}
          cartCount={cartCount}
          onOpenCart={() => setCartOpen(true)}
        />

        {/* Hero strip tier — só no catálogo */}
        {secao === 'catalogo' && (() => {
          const cfg = NIVEL[rev.nivel] ?? NIVEL.iniciante;
          const Icon = cfg.icon;
          return (
            <div className="bg-gradient-to-r from-[#fe68c4] to-[#fd4fb8] text-white">
              <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-white/70 uppercase tracking-wider mb-0.5">
                    Seu desconto exclusivo
                  </p>
                  <p className="text-xl font-bold leading-none">
                    {rev.percentual_desconto}% OFF{' '}
                    <span className="text-base font-normal text-white/80">em todo o catálogo</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Frete info */}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                    ${cfg.freteGratis
                      ? 'bg-green-400/30 border border-green-300/50 text-white'
                      : 'bg-white/15 border border-white/25 text-white/80'
                    }`}>
                    <Truck className="w-3.5 h-3.5" />
                    {cfg.freteGratis ? 'Frete grátis' : 'Frete por sua conta'}
                  </span>
                  {/* Tier badge */}
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                                   bg-white/20 border border-white/30 text-white text-sm font-semibold">
                    <Icon className="w-4 h-4" /> {cfg.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {secao === 'dashboard' && <Dashboard rev={rev} onIrCatalogo={() => setSecao('catalogo')} />}
        {secao === 'catalogo'  && (
          <Catalogo
            rev={rev}
            cart={cart}
            onCartChange={setCart}
            onOpenCart={() => setCartOpen(true)}
          />
        )}
        {secao === 'pedidos'   && <MeusPedidos rev={rev} />}
        {secao === 'recursos'  && <Recursos />}

        {/* Cart Drawer */}
        {cartOpen && rev && (
          <CartDrawer
            rev={rev}
            cart={cart}
            onCartChange={setCart}
            onClose={() => setCartOpen(false)}
            onPedidoCriado={() => { setCartOpen(false); setSecao('pedidos'); }}
          />
        )}

        {/* Rodapé */}
        <footer className="mt-auto border-t border-gray-100 bg-white/60 py-4 px-4 text-center text-xs text-gray-400">
          <p>
            Papelaria Bibelô · Timbó/SC ·{' '}
            <a
              href="/api/public/politica-parceira"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#fe68c4] hover:underline font-medium"
            >
              Regulamento do Programa
            </a>
            {' '}·{' '}
            <a
              href="https://wa.me/5547933862514"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#fe68c4] hover:underline"
            >
              Suporte WhatsApp
            </a>
          </p>
        </footer>
      </div>
    );
  }

  return null;
}
