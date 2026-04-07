import { useState, useEffect } from 'react';
import api from '../lib/api';
import {
  Mail, Send, MailOpen, MousePointerClick, MailX, AlertTriangle,
  TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight, Server,
  Zap, Megaphone,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line,
} from 'recharts';

const PERIODOS = [
  { value: '1d', label: 'Hoje' },
  { value: '3d', label: '3 dias' },
  { value: '7d', label: '7 dias' },
  { value: '15d', label: '15 dias' },
  { value: '30d', label: '30 dias' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: '1a', label: '1 ano' },
];

const CORES_PIE = ['#8B5CF6', '#F472B6'];
const CORES_BAR = { campanhas: '#8B5CF6', fluxos: '#F472B6', total: '#60A5FA' };

interface Overview {
  provider: string;
  ses: {
    maxSendRate: number;
    max24HourSend: number;
    sentLast24Hours: number;
    sendingEnabled: boolean;
    productionAccess: boolean;
  } | null;
  kpis: {
    total_enviados: number;
    total_campanhas: number;
    total_fluxos: number;
    total_entregues: number;
    total_abertos: number;
    total_cliques: number;
    total_bounces: number;
    total_spam: number;
    taxa_abertura: number;
    taxa_clique: number;
    taxa_bounce: number;
    variacao: number;
    custo_estimado: number;
  };
}

interface DailyData {
  dia: string;
  campanhas: number;
  fluxos: number;
  total: number;
  entregues: number;
  abertos: number;
  bounces: number;
}

interface MonthlyData {
  mes: string;
  campanhas: number;
  fluxos: number;
  total: number;
  custo_ses: number;
  custo_resend: number;
}

interface ByTypeData {
  distribuicao: Array<{ tipo: string; total: number }>;
  topCampanhas: Array<{
    id: string; nome: string; total_envios: number;
    total_abertos: number; total_cliques: number; enviado_em: string;
  }>;
  topFluxos: Array<{ nome: string; total: number }>;
}

function VariacaoBadge({ valor }: { valor: number }) {
  if (valor === 0) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${valor > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
      {valor > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(valor)}%
    </span>
  );
}

function formatDia(dia: string) {
  const d = new Date(dia + 'T12:00:00');
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function formatMes(mes: string) {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const [ano, m] = mes.split('-');
  return `${meses[parseInt(m) - 1]}/${ano.slice(2)}`;
}

export default function ConsumoEmail() {
  const [periodo, setPeriodo] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [monthly, setMonthly] = useState<MonthlyData[]>([]);
  const [byType, setByType] = useState<ByTypeData | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/email-consumption/overview?periodo=${periodo}`),
      api.get(`/email-consumption/daily?periodo=${periodo}`),
      api.get(`/email-consumption/monthly`),
      api.get(`/email-consumption/by-type?periodo=${periodo}`),
    ])
      .then(([ov, dl, mn, bt]) => {
        setOverview(ov.data);
        setDaily(dl.data.daily);
        setMonthly(mn.data.monthly);
        setByType(bt.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [periodo]);

  const kpis = overview?.kpis;
  const ses = overview?.ses;
  const provider = overview?.provider || 'resend';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-bibelo-text">Consumo de Email</h1>
          <p className="text-sm text-bibelo-muted mt-0.5">
            Provider: <span className="font-medium text-bibelo-text uppercase">{provider}</span>
            {ses && (
              <span className="ml-2">
                {ses.productionAccess ? (
                  <span className="text-emerald-400">Produção</span>
                ) : (
                  <span className="text-amber-400">Sandbox</span>
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                periodo === p.value
                  ? 'bg-bibelo-primary text-white'
                  : 'text-bibelo-muted hover:bg-bibelo-card'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* SES Account Status */}
      {ses && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Server size={16} className="text-violet-400" />
            <h2 className="text-sm font-medium text-bibelo-muted">Amazon SES — Conta</h2>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-bibelo-muted">Enviados (24h)</p>
              <p className="text-lg font-bold text-bibelo-text">{Math.round(ses.sentLast24Hours)}</p>
            </div>
            <div>
              <p className="text-xs text-bibelo-muted">Cota 24h</p>
              <p className="text-lg font-bold text-bibelo-text">{ses.max24HourSend >= 50000 ? 'Ilimitada' : Math.round(ses.max24HourSend).toLocaleString('pt-BR')}</p>
            </div>
            <div>
              <p className="text-xs text-bibelo-muted">Taxa de envio</p>
              <p className="text-lg font-bold text-bibelo-text">{ses.maxSendRate}/s</p>
            </div>
            <div>
              <p className="text-xs text-bibelo-muted">Uso da cota</p>
              <div className="mt-1">
                <div className="w-full h-2 bg-bibelo-bg rounded-full">
                  <div
                    className="h-2 rounded-full bg-violet-500 transition-all"
                    style={{ width: `${Math.min(100, ses.max24HourSend > 0 ? (ses.sentLast24Hours / ses.max24HourSend) * 100 : 0)}%` }}
                  />
                </div>
                <p className="text-xs text-bibelo-muted mt-0.5">
                  {ses.max24HourSend > 0 ? Math.round((ses.sentLast24Hours / ses.max24HourSend) * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-4 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-bibelo-muted">Total Enviados</p>
              <Send size={16} className="text-violet-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-bold text-bibelo-text">{(kpis?.total_enviados || 0).toLocaleString('pt-BR')}</p>
              <VariacaoBadge valor={kpis?.variacao || 0} />
            </div>
            <p className="text-xs text-bibelo-muted mt-0.5">
              {kpis?.total_campanhas || 0} campanhas + {kpis?.total_fluxos || 0} fluxos
            </p>
          </div>

          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-bibelo-muted">Taxa de Abertura</p>
              <MailOpen size={16} className="text-emerald-400" />
            </div>
            <p className="text-xl font-bold text-bibelo-text">{kpis?.taxa_abertura || 0}%</p>
            <p className="text-xs text-bibelo-muted mt-0.5">
              {(kpis?.total_abertos || 0).toLocaleString('pt-BR')} aberturas
            </p>
          </div>

          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-bibelo-muted">Taxa de Clique</p>
              <MousePointerClick size={16} className="text-blue-400" />
            </div>
            <p className="text-xl font-bold text-bibelo-text">{kpis?.taxa_clique || 0}%</p>
            <p className="text-xs text-bibelo-muted mt-0.5">
              {(kpis?.total_cliques || 0).toLocaleString('pt-BR')} cliques
            </p>
          </div>

          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-bibelo-muted">Custo Estimado</p>
              <DollarSign size={16} className="text-amber-400" />
            </div>
            <p className="text-xl font-bold text-bibelo-text">
              {provider === 'ses' ? `$${(kpis?.custo_estimado || 0).toFixed(2)}` : 'Grátis'}
            </p>
            <p className="text-xs text-bibelo-muted mt-0.5">
              {provider === 'ses' ? '$0,10 por 1.000 emails' : 'Resend Free (3.000/mês)'}
            </p>
          </div>
        </div>
      )}

      {/* Alertas */}
      {kpis && (kpis.taxa_bounce > 5 || kpis.total_spam > 0) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            {kpis.taxa_bounce > 5 && (
              <p className="text-sm text-red-300">
                Taxa de bounce em <strong>{kpis.taxa_bounce}%</strong> — acima de 5% pode prejudicar a reputação do domínio.
              </p>
            )}
            {kpis.total_spam > 0 && (
              <p className="text-sm text-red-300 mt-1">
                <strong>{kpis.total_spam}</strong> reclamações de spam — esses clientes foram automaticamente removidos (opt-out LGPD).
              </p>
            )}
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Envios por dia */}
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Envios por Dia</h2>
          {daily.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted text-sm">
              Sem dados no período
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="dia" tickFormatter={formatDia} tick={{ fill: '#888', fontSize: 11 }} />
                <YAxis tick={{ fill: '#888', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={formatDia}
                />
                <Bar dataKey="campanhas" stackId="a" fill={CORES_BAR.campanhas} name="Campanhas" radius={[0, 0, 0, 0]} />
                <Bar dataKey="fluxos" stackId="a" fill={CORES_BAR.fluxos} name="Fluxos" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Distribuição pie */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Distribuição</h2>
          {!byType || byType.distribuicao.every((d) => d.total === 0) ? (
            <div className="h-64 flex items-center justify-center text-bibelo-muted text-sm">
              Sem dados
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={byType.distribuicao}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    dataKey="total" nameKey="tipo"
                    stroke="none"
                  >
                    {byType.distribuicao.map((_, i) => (
                      <Cell key={i} fill={CORES_PIE[i % CORES_PIE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                {byType.distribuicao.map((d, i) => (
                  <div key={d.tipo} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CORES_PIE[i] }} />
                    <span className="text-xs text-bibelo-muted">{d.tipo}: {d.total}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Evolução Mensal + Custo */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-bibelo-muted">Evolução Mensal + Custo Comparativo</h2>
          <div className="flex items-center gap-4 text-xs text-bibelo-muted">
            <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-violet-500" /> Emails</span>
            <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Custo SES</span>
            <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-red-400" /> Custo Resend</span>
          </div>
        </div>
        {monthly.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-bibelo-muted text-sm">Sem dados</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="mes" tickFormatter={formatMes} tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis yAxisId="emails" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis yAxisId="custo" orientation="right" tick={{ fill: '#888', fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                labelFormatter={formatMes}
                formatter={(value: number, name: string) => {
                  if (name.includes('Custo')) return [`$${value.toFixed(2)}`, name];
                  return [value.toLocaleString('pt-BR'), name];
                }}
              />
              <Bar yAxisId="emails" dataKey="total" fill="#8B5CF6" name="Total Emails" radius={[4, 4, 0, 0]} opacity={0.7} />
              <Line yAxisId="custo" type="monotone" dataKey="custo_ses" stroke="#34D399" name="Custo SES" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="custo" type="monotone" dataKey="custo_resend" stroke="#F87171" name="Custo Resend" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top Campanhas e Fluxos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Campanhas */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Megaphone size={16} className="text-violet-400" />
            <h2 className="text-sm font-medium text-bibelo-muted">Top Campanhas por Volume</h2>
          </div>
          {!byType?.topCampanhas?.length ? (
            <p className="text-sm text-bibelo-muted">Nenhuma campanha no período</p>
          ) : (
            <div className="space-y-2">
              {byType.topCampanhas.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-bibelo-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-bibelo-text truncate">{c.nome}</p>
                    <p className="text-xs text-bibelo-muted">
                      {c.total_abertos}/{c.total_envios} aberturas
                      {c.total_cliques > 0 && ` · ${c.total_cliques} cliques`}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-bibelo-text ml-2">{c.total_envios}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Fluxos */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={16} className="text-pink-400" />
            <h2 className="text-sm font-medium text-bibelo-muted">Top Fluxos Automáticos</h2>
          </div>
          {!byType?.topFluxos?.length ? (
            <p className="text-sm text-bibelo-muted">Nenhum fluxo no período</p>
          ) : (
            <div className="space-y-2">
              {byType.topFluxos.map((f) => (
                <div key={f.nome} className="flex items-center justify-between py-1.5 border-b border-bibelo-border last:border-0">
                  <p className="text-sm text-bibelo-text">{f.nome}</p>
                  <span className="text-sm font-medium text-bibelo-text">{Number(f.total).toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Health/Bounce Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Entregues</p>
            <Mail size={16} className="text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-400">{(kpis?.total_entregues || 0).toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Bounces</p>
            <MailX size={16} className="text-red-400" />
          </div>
          <p className="text-xl font-bold text-red-400">{kpis?.total_bounces || 0}</p>
          <p className="text-xs text-bibelo-muted mt-0.5">{kpis?.taxa_bounce || 0}% do total</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Spam/Complaints</p>
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <p className="text-xl font-bold text-amber-400">{kpis?.total_spam || 0}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Economia vs Resend</p>
            <TrendingUp size={16} className="text-emerald-400" />
          </div>
          {provider === 'ses' ? (
            <>
              <p className="text-xl font-bold text-emerald-400">
                {kpis && kpis.total_enviados > 3000 ? `$${(20 - kpis.custo_estimado).toFixed(2)}` : '$0'}
              </p>
              <p className="text-xs text-bibelo-muted mt-0.5">por mês vs Resend Pro</p>
            </>
          ) : (
            <p className="text-sm text-bibelo-muted">Migre para SES</p>
          )}
        </div>
      </div>
    </div>
  );
}
