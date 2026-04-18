import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import {
  DollarSign, TrendingUp, ShoppingBag, Clock, Users,
  AlertTriangle, ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatCurrency } from '../lib/format';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Resumo {
  total_revendedoras: number;
  ativas: number;
  pendentes: number;
  receita_total: number;
  receita_mes: number;
  ticket_medio: number;
  pedidos_pendentes: number;
  pedidos_mes: number;
}

interface PorNivel {
  nivel: string;
  total: number;
  receita: number;
}

interface TopRevendedora {
  id: string;
  nome: string;
  nivel: string;
  total_pedidos: number;
  receita: number;
  ultimo_pedido: string | null;
}

interface EvolucaoMensal {
  mes: string;
  receita: number;
  pedidos: number;
}

interface RevendedoraInativa {
  id: string;
  nome: string;
  nivel: string;
  ultimo_pedido: string | null;
  dias_inativa: number | null;
}

interface DashboardData {
  resumo: Resumo;
  por_nivel: PorNivel[];
  top_revendedoras: TopRevendedora[];
  evolucao_mensal: EvolucaoMensal[];
  revendedoras_inativas: RevendedoraInativa[];
}

// ── Constantes de nível ───────────────────────────────────────────────────────

const NIVEL_CONFIG: Record<string, { label: string; cor: string; bg: string }> = {
  iniciante: { label: 'Iniciante', cor: '#6b7280', bg: '#f3f4f6' },
  bronze:    { label: 'Bronze',    cor: '#92400e', bg: '#fef3c7' },
  prata:     { label: 'Prata',     cor: '#6b7280', bg: '#e5e7eb' },
  ouro:      { label: 'Ouro',      cor: '#b45309', bg: '#fef9c3' },
  diamante:  { label: 'Diamante',  cor: '#1d4ed8', bg: '#dbeafe' },
};

function BadgeNivel({ nivel }: { nivel: string }) {
  const cfg = NIVEL_CONFIG[nivel] ?? { label: nivel, cor: '#6b7280', bg: '#f3f4f6' };
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: cfg.cor, backgroundColor: cfg.bg }}
    >
      {cfg.label}
    </span>
  );
}

// ── Tooltip formatado ─────────────────────────────────────────────────────────

function TooltipMensal({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bibelo-card border border-bibelo-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-bibelo-text mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-bibelo-muted">
          {p.name === 'receita'
            ? `Receita: ${formatCurrency(p.value)}`
            : `Pedidos: ${p.value}`}
        </p>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatarMesAbrev(mes: string): string {
  const meses: Record<string, string> = {
    '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
    '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
    '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
  };
  const [, mm] = mes.split('-');
  return meses[mm] ?? mes;
}

function diasInativaTexto(dias: number | null): string {
  if (dias === null) return 'nunca pediu';
  if (dias === 0) return 'hoje';
  if (dias === 1) return '1 dia';
  return `${dias} dias`;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function DashboardRevendedoras() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setCarregando(true);
    api
      .get<DashboardData>('/revendedoras/dashboard')
      .then((res) => {
        setData(res.data);
        setErro(null);
      })
      .catch(() => setErro('Não foi possível carregar os dados. Tente novamente.'))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-pink-400 border-t-transparent" />
      </div>
    );
  }

  if (erro || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-bibelo-muted">{erro ?? 'Nenhum dado encontrado.'}</p>
        </div>
      </div>
    );
  }

  const { resumo, por_nivel, top_revendedoras, evolucao_mensal, revendedoras_inativas } = data;

  // Receita total para calcular % por nível
  const receitaTotalNivel = por_nivel.reduce((acc, n) => acc + n.receita, 0) || 1;

  // Dados do gráfico com meses abreviados
  const dadosGrafico = evolucao_mensal.map((e) => ({
    ...e,
    mesLabel: formatarMesAbrev(e.mes),
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Canal Revendedoras</h1>
          <p className="text-sm text-bibelo-muted mt-0.5">Visão geral do programa B2B</p>
        </div>
        <button
          onClick={() => navigate('/revendedoras')}
          className="flex items-center gap-1.5 text-sm text-pink-500 hover:text-pink-600 font-medium"
        >
          Ver todas <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">

        {/* Receita total */}
        <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-bibelo-muted font-medium">Receita Total</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-bibelo-text">{formatCurrency(resumo.receita_total)}</p>
          <p className="text-xs text-bibelo-muted mt-0.5">todos os pedidos aprovados</p>
        </div>

        {/* Receita do mês */}
        <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-bibelo-muted font-medium">Receita Este Mês</span>
            <TrendingUp className="w-4 h-4" style={{ color: '#fe68c4' }} />
          </div>
          <p className="text-xl font-bold text-bibelo-text">{formatCurrency(resumo.receita_mes)}</p>
          <p className="text-xs text-bibelo-muted mt-0.5">{resumo.pedidos_mes} pedidos aprovados</p>
        </div>

        {/* Ticket médio */}
        <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-bibelo-muted font-medium">Ticket Médio</span>
            <ShoppingBag className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-xl font-bold text-bibelo-text">{formatCurrency(resumo.ticket_medio)}</p>
          <p className="text-xs text-bibelo-muted mt-0.5">por pedido aprovado</p>
        </div>

        {/* Pedidos pendentes */}
        <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-bibelo-muted font-medium">Pedidos Pendentes</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-bibelo-text">{resumo.pedidos_pendentes}</p>
            {resumo.pedidos_pendentes > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
                !
              </span>
            )}
          </div>
          <p className="text-xs text-bibelo-muted mt-0.5">aguardando aprovação</p>
        </div>

        {/* Revendedoras ativas */}
        <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-bibelo-muted font-medium">Revendedoras Ativas</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-xl font-bold text-bibelo-text">{resumo.ativas}</p>
          <p className="text-xs text-bibelo-muted mt-0.5">de {resumo.total_revendedoras} cadastradas</p>
        </div>

      </div>

      {/* Gráfico de evolução mensal */}
      <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-5">
        <h2 className="text-sm font-semibold text-bibelo-text mb-4">Evolução Mensal</h2>
        {dadosGrafico.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-bibelo-muted text-sm">
            Nenhuma venda registrada ainda
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dadosGrafico} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradientPink" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#fe68c4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#fe68c4" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
              <XAxis
                dataKey="mesLabel"
                tick={{ fontSize: 12, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                }
                width={52}
              />
              <Tooltip content={<TooltipMensal />} />
              <Area
                type="monotone"
                dataKey="receita"
                stroke="#fe68c4"
                strokeWidth={2}
                fill="url(#gradientPink)"
                dot={{ fill: '#fe68c4', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Linha: Top Revendedoras + Distribuição por Nível */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top revendedoras */}
        <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-5">
          <h2 className="text-sm font-semibold text-bibelo-text mb-3">Top Revendedoras</h2>
          {top_revendedoras.length === 0 ? (
            <p className="text-sm text-bibelo-muted py-4">Nenhum pedido aprovado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-bibelo-muted border-b border-bibelo-border">
                    <th className="text-left font-medium pb-2">Nome</th>
                    <th className="text-center font-medium pb-2">Nível</th>
                    <th className="text-right font-medium pb-2">Pedidos</th>
                    <th className="text-right font-medium pb-2">Receita</th>
                    <th className="text-right font-medium pb-2">Último pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {top_revendedoras.map((r, idx) => (
                    <tr
                      key={r.id}
                      className="border-b border-bibelo-border last:border-0 hover:bg-[#fe68c4]/5 cursor-pointer transition-colors"
                      onClick={() => navigate(`/revendedoras/${r.id}`)}
                    >
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-bibelo-muted w-4 shrink-0">{idx + 1}</span>
                          <span className="font-medium text-bibelo-text truncate max-w-[120px]">{r.nome}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-center">
                        <BadgeNivel nivel={r.nivel} />
                      </td>
                      <td className="py-2.5 text-right text-bibelo-muted">{r.total_pedidos}</td>
                      <td className="py-2.5 text-right font-semibold text-bibelo-text">
                        {formatCurrency(r.receita)}
                      </td>
                      <td className="py-2.5 text-right text-bibelo-muted text-xs">
                        {r.ultimo_pedido
                          ? new Date(r.ultimo_pedido).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Distribuição por nível */}
        <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-5">
          <h2 className="text-sm font-semibold text-bibelo-text mb-3">Distribuição por Nível</h2>
          {por_nivel.length === 0 ? (
            <p className="text-sm text-bibelo-muted py-4">Nenhuma revendedora cadastrada.</p>
          ) : (
            <>
              {/* Mini gráfico de barras */}
              <ResponsiveContainer width="100%" height={120}>
                <BarChart
                  data={por_nivel}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  barSize={28}
                >
                  <XAxis
                    dataKey="nivel"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) =>
                      (NIVEL_CONFIG[v]?.label ?? v)
                    }
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Receita']}
                    labelFormatter={(l: string) =>
                      (NIVEL_CONFIG[l]?.label ?? l)
                    }
                  />
                  <Bar dataKey="receita" radius={[4, 4, 0, 0]}>
                    {por_nivel.map((entry) => (
                      <Cell
                        key={entry.nivel}
                        fill={
                          entry.nivel === 'diamante' ? '#3b82f6'
                          : entry.nivel === 'ouro'   ? '#f59e0b'
                          : entry.nivel === 'prata'  ? '#9ca3af'
                          : entry.nivel === 'bronze' ? '#92400e'
                          : '#d1d5db'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Lista com barra de progresso */}
              <div className="mt-3 space-y-2.5">
                {por_nivel.map((n) => {
                  const pct = Math.round((n.receita / receitaTotalNivel) * 100);
                  const cfg = NIVEL_CONFIG[n.nivel] ?? { label: n.nivel, cor: '#6b7280', bg: '#f3f4f6' };
                  return (
                    <div key={n.nivel}>
                      <div className="flex justify-between text-xs text-bibelo-muted mb-1">
                        <span className="font-medium">{cfg.label}</span>
                        <span className="text-bibelo-muted">{n.total} rev · {formatCurrency(n.receita)} · {pct}%</span>
                      </div>
                      <div className="h-1.5 bg-bibelo-border rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: cfg.cor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

      </div>

      {/* Revendedoras que precisam de atenção */}
      {revendedoras_inativas.length > 0 && (
        <div className="bg-bibelo-card rounded-xl border border-amber-900/40 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-bibelo-text">
              Precisam de Atenção ({revendedoras_inativas.length})
            </h2>
            <span className="text-xs text-gray-400">— ativas sem pedido nos últimos 60 dias</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {revendedoras_inativas.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between bg-amber-900/10 rounded-lg px-3 py-2.5 border border-amber-900/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-bibelo-text text-sm truncate">{r.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <BadgeNivel nivel={r.nivel} />
                    <span className="text-xs text-amber-600">
                      sem pedidos há {diasInativaTexto(r.dias_inativa)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/revendedoras/${r.id}`)}
                  className="ml-3 shrink-0 text-xs font-medium text-pink-500 hover:text-pink-600 whitespace-nowrap"
                >
                  Enviar mensagem
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
