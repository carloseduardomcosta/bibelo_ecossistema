import { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3, ArrowUpRight, ArrowDownRight,
  Minus, FileText, Target, Wallet,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, Cell,
} from 'recharts';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../lib/format';

// ── Tipos ──

interface DreData {
  receita_bruta: number;
  outras_receitas: number;
  receita_total: number;
  cmv: number;
  lucro_bruto: number;
  margem_bruta: number;
  despesas_operacionais: number;
  despesas_por_categoria: { categoria: string; cor: string; valor: string }[];
  despesas_fixas_mensal: number;
  lucro_operacional: number;
  lucro_liquido: number;
  margem_liquida: number;
  total_pedidos: number;
  ticket_medio: number;
}

interface FluxoItem {
  mes: string;
  mes_label: string;
  receitas: number;
  despesas: number;
  saldo: number;
  saldo_acumulado: number;
  tipo: string;
}

interface FluxoData {
  fluxo: FluxoItem[];
  media_receitas_3m: number;
  media_despesas_3m: number;
  despesas_fixas_mensal: number;
  despesas_variaveis_media: number;
}

interface ComparativoMes {
  mes: string;
  mes_label: string;
  vendas_bling: string;
  outras_receitas: string;
  receita_total: string;
  despesas: string;
  saldo: string;
  pedidos: string;
  ticket: string;
  variacao_receita: number | null;
  variacao_despesa: number | null;
  margem: number;
}

interface ComparativoData {
  meses: ComparativoMes[];
  despesas_por_categoria: { mes: string; categoria: string; cor: string; valor: string }[];
}

// ── Helpers ──

const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v}%`;

const PERIODOS = [
  { value: 'mes_atual', label: 'Mês Atual' },
  { value: 'mes_anterior', label: 'Mês Anterior' },
  { value: '3m', label: '3 Meses' },
  { value: '6m', label: '6 Meses' },
  { value: '1a', label: '1 Ano' },
  { value: 'total', label: 'Total' },
];

const TABS = ['DRE', 'Fluxo Projetado', 'Comparativo'] as const;

export default function Relatorios() {
  const [tab, setTab] = useState<typeof TABS[number]>('DRE');
  const [periodo, setPeriodo] = useState('mes_atual');
  const [dre, setDre] = useState<DreData | null>(null);
  const [fluxo, setFluxo] = useState<FluxoData | null>(null);
  const [comp, setComp] = useState<ComparativoData | null>(null);
  const [mesesComp, setMesesComp] = useState(6);
  const [loading, setLoading] = useState(false);
  const { error: showError } = useToast();

  const loadDre = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/financeiro/dre?periodo=${periodo}`);
      setDre(data);
    } catch { showError('Erro ao carregar DRE'); }
    setLoading(false);
  }, [periodo, showError]);

  const loadFluxo = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/financeiro/fluxo-projetado');
      setFluxo(data);
    } catch { showError('Erro ao carregar fluxo projetado'); }
    setLoading(false);
  }, [showError]);

  const loadComp = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/financeiro/comparativo?meses=${mesesComp}`);
      setComp(data);
    } catch { showError('Erro ao carregar comparativo'); }
    setLoading(false);
  }, [mesesComp, showError]);

  useEffect(() => {
    if (tab === 'DRE') loadDre();
    else if (tab === 'Fluxo Projetado') loadFluxo();
    else if (tab === 'Comparativo') loadComp();
  }, [tab, loadDre, loadFluxo, loadComp]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Relatórios Financeiros</h1>
          <p className="text-sm text-bibelo-muted mt-1">DRE, Fluxo de Caixa Projetado e Comparativo Mensal</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bibelo-bg p-1 rounded-lg w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-bibelo-card text-bibelo-primary' : 'text-bibelo-muted hover:text-bibelo-text'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-violet-500 border-t-transparent rounded-full" />
        </div>
      )}

      {/* ═══ DRE ═══ */}
      {tab === 'DRE' && !loading && dre && (
        <div className="space-y-6">
          {/* Período */}
          <div className="flex gap-2 flex-wrap">
            {PERIODOS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriodo(p.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  periodo === p.value
                    ? 'bg-violet-600 text-white'
                    : 'bg-bibelo-bg text-bibelo-muted hover:bg-bibelo-border/50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* DRE Visual */}
          <div className="bg-bibelo-card rounded-xl border border-bibelo-border overflow-hidden">
            <div className="p-6 border-b border-bibelo-border">
              <h2 className="text-lg font-semibold text-bibelo-text flex items-center gap-2">
                <FileText className="w-5 h-5 text-violet-600" />
                Demonstração do Resultado
              </h2>
            </div>
            <div className="p-6">
              <table className="w-full">
                <tbody className="divide-y divide-bibelo-border">
                  <DreRow label="Receita Bruta (Vendas)" value={dre.receita_bruta} bold color="emerald" />
                  <DreRow label="Outras Receitas" value={dre.outras_receitas} indent />
                  <DreRow label="Receita Total" value={dre.receita_total} bold highlight />
                  <DreRow label="(-) Custo Mercadoria Vendida (NFs)" value={-dre.cmv} color="red" />
                  <DreRow label="= Lucro Bruto" value={dre.lucro_bruto} bold highlight />
                  <DreRow label={`Margem Bruta: ${dre.margem_bruta}%`} value={null} badge={dre.margem_bruta} />
                  <DreRow label="(-) Despesas Operacionais" value={-dre.despesas_operacionais} color="red" />
                  {dre.despesas_por_categoria
                    .filter((d) => d.categoria !== 'Fornecedores')
                    .map((d) => (
                      <DreRow key={d.categoria} label={d.categoria} value={-parseFloat(d.valor)} indent sub />
                    ))}
                  <DreRow label="= Lucro Líquido" value={dre.lucro_liquido} bold highlight final />
                  <DreRow label={`Margem Líquida: ${dre.margem_liquida}%`} value={null} badge={dre.margem_liquida} />
                </tbody>
              </table>
            </div>
          </div>

          {/* KPIs do DRE */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={<DollarSign />} label="Receita Total" value={formatCurrency(dre.receita_total)} color="emerald" />
            <KpiCard icon={<Target />} label="Lucro Bruto" value={formatCurrency(dre.lucro_bruto)} color="blue" sub={`Margem ${dre.margem_bruta}%`} />
            <KpiCard icon={<Wallet />} label="Lucro Líquido" value={formatCurrency(dre.lucro_liquido)} color={dre.lucro_liquido >= 0 ? 'emerald' : 'red'} sub={`Margem ${dre.margem_liquida}%`} />
            <KpiCard icon={<BarChart3 />} label="Ticket Médio" value={formatCurrency(dre.ticket_medio)} color="violet" sub={`${dre.total_pedidos} pedidos`} />
          </div>
        </div>
      )}

      {/* ═══ FLUXO PROJETADO ═══ */}
      {tab === 'Fluxo Projetado' && !loading && fluxo && (
        <div className="space-y-6">
          {/* KPIs de projeção */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={<TrendingUp />} label="Média Receitas (3m)" value={formatCurrency(fluxo.media_receitas_3m)} color="emerald" />
            <KpiCard icon={<TrendingDown />} label="Média Despesas (3m)" value={formatCurrency(fluxo.media_despesas_3m)} color="red" />
            <KpiCard icon={<Wallet />} label="Despesas Fixas/Mês" value={formatCurrency(fluxo.despesas_fixas_mensal)} color="amber" />
            <KpiCard icon={<BarChart3 />} label="Desp. Variáveis Média" value={formatCurrency(fluxo.despesas_variaveis_media)} color="violet" />
          </div>

          {/* Gráfico Fluxo */}
          <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-6">
            <h2 className="text-lg font-semibold text-bibelo-text mb-4">Fluxo de Caixa — Realizado + Projetado</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={fluxo.fluxo}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                  <XAxis dataKey="mes_label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name === 'receitas' ? 'Receitas' : name === 'despesas' ? 'Despesas' : name === 'saldo_acumulado' ? 'Saldo Acumulado' : 'Saldo']}
                    labelFormatter={(label: string) => label}
                  />
                  <Bar dataKey="receitas" name="Receitas" fill="#10B981" opacity={0.8} radius={[4, 4, 0, 0]}>
                    {fluxo.fluxo.map((entry, i) => (
                      <Cell key={i} fill={entry.tipo === 'projetado' ? '#6EE7B7' : '#10B981'} strokeDasharray={entry.tipo === 'projetado' ? '4 2' : undefined} />
                    ))}
                  </Bar>
                  <Bar dataKey="despesas" name="Despesas" fill="#EF4444" opacity={0.8} radius={[4, 4, 0, 0]}>
                    {fluxo.fluxo.map((entry, i) => (
                      <Cell key={i} fill={entry.tipo === 'projetado' ? '#FCA5A5' : '#EF4444'} />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="saldo_acumulado" name="Saldo Acumulado" stroke="#7C3AED" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-6 mt-4 text-xs text-bibelo-muted">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded" /> Realizado</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-200 rounded" /> Projetado</span>
              <span className="flex items-center gap-1"><span className="w-3 h-1 bg-violet-600 rounded" /> Saldo Acumulado</span>
            </div>
          </div>

          {/* Tabela detalhada */}
          <div className="bg-bibelo-card rounded-xl border border-bibelo-border overflow-hidden">
            <div className="p-4 border-b border-bibelo-border">
              <h3 className="font-semibold text-bibelo-text">Detalhamento Mensal</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bibelo-bg text-bibelo-muted">
                    <th className="px-4 py-3 text-left font-medium">Mês</th>
                    <th className="px-4 py-3 text-right font-medium">Receitas</th>
                    <th className="px-4 py-3 text-right font-medium">Despesas</th>
                    <th className="px-4 py-3 text-right font-medium">Saldo</th>
                    <th className="px-4 py-3 text-right font-medium">Acumulado</th>
                    <th className="px-4 py-3 text-center font-medium">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bibelo-border">
                  {fluxo.fluxo.map((f) => (
                    <tr key={f.mes} className={f.tipo === 'projetado' ? 'bg-violet-500/10' : ''}>
                      <td className="px-4 py-3 font-medium text-bibelo-text">{f.mes_label}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">{formatCurrency(f.receitas)}</td>
                      <td className="px-4 py-3 text-right text-red-400">{formatCurrency(f.despesas)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${f.saldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(f.saldo)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${f.saldo_acumulado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(f.saldo_acumulado)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          f.tipo === 'projetado' ? 'bg-violet-500/20 text-violet-400' : 'bg-bibelo-border/20 text-bibelo-muted'
                        }`}>
                          {f.tipo === 'projetado' ? 'Projetado' : 'Realizado'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ COMPARATIVO ═══ */}
      {tab === 'Comparativo' && !loading && comp && (
        <div className="space-y-6">
          {/* Seletor de meses */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-bibelo-muted">Período:</span>
            <div className="flex gap-1 bg-bibelo-bg p-1 rounded-lg">
              {[3, 6, 9, 12].map((n) => (
                <button
                  key={n}
                  onClick={() => setMesesComp(n)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    mesesComp === n ? 'bg-bibelo-card text-bibelo-primary' : 'text-bibelo-muted hover:text-bibelo-text'
                  }`}
                >
                  {n} meses
                </button>
              ))}
            </div>
          </div>

          {/* Gráfico */}
          <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-6">
            <h2 className="text-lg font-semibold text-bibelo-text mb-4">Receitas vs Despesas</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comp.meses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                  <XAxis dataKey="mes_label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: string, name: string) => [formatCurrency(parseFloat(value as string)), name === 'receita_total' ? 'Receitas' : 'Despesas']} />
                  <Bar dataKey="receita_total" name="receita_total" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" name="despesas" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabela comparativa */}
          <div className="bg-bibelo-card rounded-xl border border-bibelo-border overflow-hidden">
            <div className="p-4 border-b border-bibelo-border">
              <h3 className="font-semibold text-bibelo-text">Comparativo Mês a Mês</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bibelo-bg text-bibelo-muted">
                    <th className="px-4 py-3 text-left font-medium">Mês</th>
                    <th className="px-4 py-3 text-right font-medium">Receita</th>
                    <th className="px-4 py-3 text-center font-medium">Var.</th>
                    <th className="px-4 py-3 text-right font-medium">Despesas</th>
                    <th className="px-4 py-3 text-center font-medium">Var.</th>
                    <th className="px-4 py-3 text-right font-medium">Saldo</th>
                    <th className="px-4 py-3 text-center font-medium">Margem</th>
                    <th className="px-4 py-3 text-right font-medium">Pedidos</th>
                    <th className="px-4 py-3 text-right font-medium">Ticket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bibelo-border">
                  {comp.meses.map((m) => (
                    <tr key={m.mes} className="hover:bg-bibelo-border/20">
                      <td className="px-4 py-3 font-medium text-bibelo-text">{m.mes_label}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">{formatCurrency(parseFloat(m.receita_total))}</td>
                      <td className="px-4 py-3 text-center">
                        {m.variacao_receita !== null ? (
                          <VarBadge value={m.variacao_receita} />
                        ) : <Minus className="w-4 h-4 text-bibelo-muted mx-auto" />}
                      </td>
                      <td className="px-4 py-3 text-right text-red-400">{formatCurrency(parseFloat(m.despesas))}</td>
                      <td className="px-4 py-3 text-center">
                        {m.variacao_despesa !== null ? (
                          <VarBadge value={m.variacao_despesa} invert />
                        ) : <Minus className="w-4 h-4 text-bibelo-muted mx-auto" />}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${parseFloat(m.saldo) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(parseFloat(m.saldo))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.margem >= 30 ? 'bg-emerald-500/20 text-emerald-400' :
                          m.margem >= 10 ? 'bg-amber-500/20 text-amber-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {m.margem}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-bibelo-text">{m.pedidos}</td>
                      <td className="px-4 py-3 text-right text-bibelo-text">{formatCurrency(parseFloat(m.ticket))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componentes auxiliares ──

function KpiCard({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: string; color: string; sub?: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-500/20 text-emerald-400',
    red: 'bg-red-500/20 text-red-400',
    amber: 'bg-amber-500/20 text-amber-400',
    violet: 'bg-violet-500/20 text-violet-400',
    blue: 'bg-blue-500/20 text-blue-400',
  };
  return (
    <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color] || colors.violet}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-bibelo-muted">{label}</p>
          <p className="text-lg font-bold text-bibelo-text">{value}</p>
          {sub && <p className="text-xs text-bibelo-muted">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function DreRow({ label, value, bold, indent, sub, color, highlight, badge, final: isFinal }: {
  label: string; value: number | null; bold?: boolean; indent?: boolean; sub?: boolean;
  color?: string; highlight?: boolean; badge?: number; final?: boolean;
}) {
  const textColor = color === 'emerald' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : 'text-bibelo-text';
  return (
    <tr className={`${highlight ? 'bg-bibelo-bg' : ''} ${isFinal ? 'bg-violet-500/10' : ''}`}>
      <td className={`py-3 px-4 ${indent ? 'pl-10' : 'pl-4'} ${bold ? 'font-semibold' : ''} ${sub ? 'text-xs text-bibelo-muted' : 'text-sm text-bibelo-text'}`}>
        {label}
      </td>
      <td className={`py-3 px-4 text-right ${bold ? 'font-semibold' : ''} ${textColor} text-sm`}>
        {value !== null ? formatCurrency(value) : ''}
        {badge !== undefined && (
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
            badge >= 30 ? 'bg-emerald-500/20 text-emerald-400' :
            badge >= 10 ? 'bg-amber-500/20 text-amber-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {badge}%
          </span>
        )}
      </td>
    </tr>
  );
}

function VarBadge({ value, invert }: { value: number; invert?: boolean }) {
  const isPositive = invert ? value < 0 : value > 0;
  const isNegative = invert ? value > 0 : value < 0;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${
      isPositive ? 'bg-emerald-500/20 text-emerald-400' :
      isNegative ? 'bg-red-500/20 text-red-400' :
      'bg-bibelo-border/20 text-bibelo-muted'
    }`}>
      {value > 0 ? <ArrowUpRight className="w-3 h-3" /> : value < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
      {fmtPct(value)}
    </span>
  );
}
