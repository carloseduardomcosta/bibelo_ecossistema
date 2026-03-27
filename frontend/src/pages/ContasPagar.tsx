import { useEffect, useState } from 'react';
import { Receipt, AlertTriangle, CheckCircle, Clock, DollarSign } from 'lucide-react';
import api from '../lib/api';

interface Resumo {
  total: number; pendentes: number; pagas: number;
  valor_pendente: number; valor_pago: number;
  vencidas: number; valor_vencido: number;
}

interface Conta {
  bling_id: string; situacao: number; vencimento: string; valor: number;
  numero_documento: string; historico: string; contato_nome: string;
  forma_pagamento: string; data_pagamento: string; valor_pago: number;
}

interface Fornecedor {
  fornecedor: string; total: number; valor: number;
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

const SITUACAO: Record<number, { label: string; color: string }> = {
  1: { label: 'Pendente', color: 'bg-amber-500/20 text-amber-400' },
  2: { label: 'Pago', color: 'bg-emerald-500/20 text-emerald-400' },
  3: { label: 'Parcial', color: 'bg-blue-500/20 text-blue-400' },
  5: { label: 'Cancelado', color: 'bg-red-500/20 text-red-400' },
};

export default function ContasPagar() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [filtro, setFiltro] = useState('todos');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = filtro !== 'todos' ? `?status=${filtro}` : '';
    api.get(`/analytics/contas-pagar${params}`)
      .then(({ data }) => {
        setResumo(data.resumo);
        setContas(data.contas);
        setFornecedores(data.por_fornecedor);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filtro]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-bibelo-text">Contas a Pagar</h1>
        <div className="flex gap-1 bg-bibelo-card border border-bibelo-border rounded-lg p-1">
          {[
            { value: 'todos', label: 'Todos' },
            { value: 'pendente', label: 'Pendentes' },
            { value: 'pago', label: 'Pagos' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filtro === f.value ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-24" />
          ))
        ) : resumo && [
          { label: 'A Pagar (pendente)', value: formatCurrency(resumo.valor_pendente), icon: Clock, color: 'text-amber-400', sub: `${resumo.pendentes} contas` },
          { label: 'Ja Pago', value: formatCurrency(resumo.valor_pago), icon: CheckCircle, color: 'text-emerald-400', sub: `${resumo.pagas} contas` },
          { label: 'Vencidas!', value: formatCurrency(resumo.valor_vencido), icon: AlertTriangle, color: 'text-red-400', sub: `${resumo.vencidas} contas atrasadas` },
          { label: 'Total Geral', value: formatCurrency(resumo.valor_pendente + resumo.valor_pago), icon: DollarSign, color: 'text-violet-400', sub: `${resumo.total} contas` },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-bibelo-muted">{label}</p>
              <Icon size={18} className={color} />
            </div>
            <p className="text-xl font-bold text-bibelo-text">{value}</p>
            <p className="text-xs text-bibelo-muted mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Alerta vencidas */}
      {resumo && resumo.vencidas > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Atencao: {resumo.vencidas} conta{resumo.vencidas > 1 ? 's' : ''} vencida{resumo.vencidas > 1 ? 's' : ''}</p>
            <p className="text-xs text-red-400/70">Valor total em atraso: {formatCurrency(resumo.valor_vencido)}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Tabela principal */}
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                  <th className="px-4 py-3 font-medium">Fornecedor / NF</th>
                  <th className="px-4 py-3 font-medium">Vencimento</th>
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Pagamento</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-bibelo-border/50">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-bibelo-border rounded animate-pulse w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : contas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-bibelo-muted">
                      <Receipt size={32} className="mx-auto mb-2 opacity-50" />
                      <p>Nenhuma conta encontrada</p>
                      <p className="text-xs mt-1">Execute um Sync para puxar do Bling</p>
                    </td>
                  </tr>
                ) : (
                  contas.map((c) => {
                    const sit = SITUACAO[c.situacao] || SITUACAO[1];
                    const vencida = c.situacao === 1 && c.vencimento && new Date(c.vencimento + 'T12:00:00') < new Date();
                    return (
                      <tr key={c.bling_id} className={`border-b border-bibelo-border/50 ${vencida ? 'bg-red-500/5' : 'hover:bg-bibelo-border/20'} transition-colors`}>
                        <td className="px-4 py-2.5">
                          <p className="text-bibelo-text font-medium truncate max-w-[200px]">{c.contato_nome || 'Nao informado'}</p>
                          <p className="text-xs text-bibelo-muted">{c.numero_documento || c.historico || '—'}</p>
                        </td>
                        <td className={`px-4 py-2.5 ${vencida ? 'text-red-400 font-medium' : 'text-bibelo-muted'}`}>
                          {formatDate(c.vencimento)}
                        </td>
                        <td className="px-4 py-2.5 text-bibelo-text text-right font-medium">
                          {formatCurrency(c.valor)}
                        </td>
                        <td className="px-4 py-2.5 text-bibelo-muted hidden md:table-cell">
                          {c.data_pagamento ? (
                            <div>
                              <p className="text-emerald-400 text-xs">{formatDate(c.data_pagamento)}</p>
                              {c.forma_pagamento && <p className="text-xs text-bibelo-muted">{c.forma_pagamento}</p>}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {vencida ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Vencida</span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sit.color}`}>{sit.label}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Por fornecedor */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Por Fornecedor</h2>
          {fornecedores.length === 0 ? (
            <p className="text-sm text-bibelo-muted text-center py-6">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {fornecedores.map((f) => {
                const maxValor = fornecedores[0]?.valor || 1;
                return (
                  <div key={f.fornecedor}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-bibelo-text truncate max-w-[150px]">{f.fornecedor}</span>
                      <span className="text-bibelo-muted ml-2">{formatCurrency(f.valor)}</span>
                    </div>
                    <div className="h-2 bg-bibelo-border rounded-full overflow-hidden">
                      <div className="h-full bg-bibelo-primary rounded-full" style={{ width: `${(f.valor / maxValor) * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-bibelo-muted mt-0.5">{f.total} conta{f.total > 1 ? 's' : ''}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
