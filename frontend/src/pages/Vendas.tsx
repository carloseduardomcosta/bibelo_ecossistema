import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { CreditCard, FileText, Receipt, CheckCircle, XCircle } from 'lucide-react';
import api from '../lib/api';

interface PagamentosData {
  por_forma: Array<{ forma: string; total_pedidos: number; valor_total: number; percentual: number }>;
  total_geral: number;
}

interface NfeData {
  resumo: { total: number; autorizadas: number; canceladas: number; valor_total: number; valor_autorizadas: number };
  por_mes: Array<{ mes: string; quantidade: number; valor: number }>;
  ultimas: Array<{ numero: string; data_emissao: string; valor_total: number; contato_nome: string; situacao: number }>;
}

const COLORS = ['#8B5CF6', '#F472B6', '#34D399', '#FBBF24', '#60A5FA', '#F87171', '#A78BFA', '#FB923C'];

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatMonth(mes: string) {
  const [year, month] = mes.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[parseInt(month, 10) - 1]}/${year.slice(2)}`;
}

const NFE_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Pendente', color: 'text-amber-400' },
  2: { label: 'Rejeitada', color: 'text-red-400' },
  3: { label: 'Cancelada', color: 'text-red-400' },
  4: { label: 'Autorizada', color: 'text-emerald-400' },
  6: { label: 'Autorizada', color: 'text-emerald-400' },
};

export default function Vendas() {
  const [pagamentos, setPagamentos] = useState<PagamentosData | null>(null);
  const [nfe, setNfe] = useState<NfeData | null>(null);
  const [tab, setTab] = useState<'pagamentos' | 'nfe'>('pagamentos');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/pagamentos'),
      api.get('/analytics/nfe'),
    ])
      .then(([pagRes, nfeRes]) => {
        setPagamentos(pagRes.data);
        setNfe(nfeRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-bibelo-text mb-6">Vendas</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-bibelo-card border border-bibelo-border rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setTab('pagamentos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'pagamentos' ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text'
          }`}
        >
          <CreditCard size={16} /> Formas de Pagamento
        </button>
        <button
          onClick={() => setTab('nfe')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'nfe' ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text'
          }`}
        >
          <FileText size={16} /> Notas Fiscais
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-32" />
          ))}
        </div>
      ) : tab === 'pagamentos' ? (
        /* ── FORMAS DE PAGAMENTO ── */
        <div>
          {/* KPI */}
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={18} className="text-bibelo-primary" />
              <h2 className="text-sm font-medium text-bibelo-muted">Resumo de Recebimentos</h2>
            </div>
            <p className="text-3xl font-bold text-bibelo-text">{formatCurrency(pagamentos?.total_geral || 0)}</p>
            <p className="text-xs text-bibelo-muted mt-1">Total recebido em todas as formas</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pie chart */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-bibelo-muted mb-4">Distribuicao por Forma</h2>
              {!pagamentos?.por_forma.length ? (
                <div className="h-64 flex items-center justify-center text-bibelo-muted">
                  Sem dados — execute um Sync Completo primeiro
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pagamentos.por_forma} dataKey="valor_total" nameKey="forma" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                        {pagamentos.por_forma.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => [formatCurrency(v), 'Valor']}
                        contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {pagamentos.por_forma.map((f, i) => (
                      <div key={f.forma} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-bibelo-text">{f.forma}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-bibelo-text font-medium">{formatCurrency(f.valor_total)}</span>
                          <span className="text-bibelo-muted text-xs ml-2">({f.percentual}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Tabela detalhada */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-bibelo-muted mb-4">Detalhamento</h2>
              {!pagamentos?.por_forma.length ? (
                <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                        <th className="px-3 py-2 font-medium">Forma</th>
                        <th className="px-3 py-2 font-medium text-right">Pedidos</th>
                        <th className="px-3 py-2 font-medium text-right">Valor</th>
                        <th className="px-3 py-2 font-medium text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagamentos.por_forma.map((f) => (
                        <tr key={f.forma} className="border-b border-bibelo-border/50">
                          <td className="px-3 py-2.5 text-bibelo-text font-medium">{f.forma}</td>
                          <td className="px-3 py-2.5 text-bibelo-muted text-right">{f.total_pedidos}</td>
                          <td className="px-3 py-2.5 text-bibelo-text text-right">{formatCurrency(f.valor_total)}</td>
                          <td className="px-3 py-2.5 text-bibelo-primary text-right font-medium">{f.percentual}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── NOTAS FISCAIS ── */
        <div>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {nfe && [
              { label: 'Total NF-e', value: nfe.resumo.total, icon: Receipt, color: 'text-violet-400' },
              { label: 'Autorizadas', value: nfe.resumo.autorizadas, icon: CheckCircle, color: 'text-emerald-400' },
              { label: 'Canceladas', value: nfe.resumo.canceladas, icon: XCircle, color: 'text-red-400' },
              { label: 'Faturamento Fiscal', value: formatCurrency(nfe.resumo.valor_autorizadas), icon: FileText, color: 'text-amber-400', isText: true },
            ].map(({ label, value, icon: Icon, color, isText }) => (
              <div key={label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-bibelo-muted">{label}</p>
                  <Icon size={18} className={color} />
                </div>
                <p className={`font-bold text-bibelo-text ${isText ? 'text-xl' : 'text-2xl'}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Faturamento por mes */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-bibelo-muted mb-4">Faturamento Mensal (NF-e)</h2>
              {!nfe?.por_mes.length ? (
                <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={nfe.por_mes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                    <XAxis dataKey="mes" tickFormatter={formatMonth} stroke="#64748B" fontSize={12} />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} stroke="#64748B" fontSize={12} width={55} />
                    <Tooltip
                      formatter={(v: number, name: string) => [
                        name === 'valor' ? formatCurrency(v) : v,
                        name === 'valor' ? 'Faturamento' : 'Quantidade',
                      ]}
                      labelFormatter={formatMonth}
                      contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8 }}
                    />
                    <Bar dataKey="valor" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Ultimas NF-e */}
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <h2 className="text-sm font-medium text-bibelo-muted mb-4">Ultimas NF-e Emitidas</h2>
              {!nfe?.ultimas.length ? (
                <div className="h-64 flex items-center justify-center text-bibelo-muted">Sem notas fiscais</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                        <th className="px-3 py-2 font-medium">Numero</th>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 font-medium text-right">Valor</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nfe.ultimas.map((n, i) => {
                        const status = NFE_STATUS[n.situacao] || { label: `#${n.situacao}`, color: 'text-bibelo-muted' };
                        return (
                          <tr key={i} className="border-b border-bibelo-border/50">
                            <td className="px-3 py-2 text-bibelo-text font-medium">{n.numero || '—'}</td>
                            <td className="px-3 py-2 text-bibelo-muted truncate max-w-[150px]">{n.contato_nome || '—'}</td>
                            <td className="px-3 py-2 text-bibelo-text text-right">{n.valor_total ? formatCurrency(n.valor_total) : '—'}</td>
                            <td className={`px-3 py-2 text-xs font-medium ${status.color}`}>{status.label}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
