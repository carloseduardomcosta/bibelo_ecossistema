import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Crown, Repeat, UserPlus, UserMinus, TrendingUp } from 'lucide-react';
import api from '../lib/api';

interface Segment {
  segmento: string;
  total: number;
  ltv_medio: number;
  ticket_medio: number;
  score_medio: number;
}

interface SegmentCustomer {
  id: string;
  nome: string;
  email: string;
  score: number;
  ltv: number;
  total_pedidos: number;
  risco_churn: string;
}

const SEGMENT_META: Record<string, { icon: typeof Users; color: string; bgColor: string; desc: string }> = {
  vip: { icon: Crown, color: 'text-violet-400', bgColor: 'bg-violet-500/20', desc: 'Clientes de maior valor e engajamento' },
  alto_valor: { icon: TrendingUp, color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', desc: 'Ticket alto e compras frequentes' },
  recorrente: { icon: Repeat, color: 'text-blue-400', bgColor: 'bg-blue-500/20', desc: 'Compram regularmente' },
  novo: { icon: UserPlus, color: 'text-amber-400', bgColor: 'bg-amber-500/20', desc: 'Primeiras compras recentes' },
  inativo: { icon: UserMinus, color: 'text-red-400', bgColor: 'bg-red-500/20', desc: 'Sem compras ha mais de 60 dias' },
};

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Segmentos() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [customers, setCustomers] = useState<SegmentCustomer[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    api.get('/analytics/segments-detail')
      .then(({ data }) => setSegments(data.data))
      .catch(() => {
        // Fallback to basic segments
        api.get('/analytics/segments').then(({ data }) => {
          setSegments(data.data.map((s: { segmento: string; total: number }) => ({
            ...s, ltv_medio: 0, ticket_medio: 0, score_medio: 0,
          })));
        }).catch(() => {});
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (segmento: string) => {
    if (selected === segmento) {
      setSelected(null);
      setCustomers([]);
      return;
    }
    setSelected(segmento);
    setLoadingCustomers(true);
    try {
      const { data } = await api.get('/customers', { params: { segmento, limit: 50 } });
      setCustomers(data.data.map((c: Record<string, unknown>) => ({
        id: c.id,
        nome: c.nome,
        email: c.email,
        score: c.score ?? 0,
        ltv: c.ltv ?? 0,
        total_pedidos: (c as { total_pedidos?: number }).total_pedidos ?? 0,
        risco_churn: (c as { risco_churn?: string }).risco_churn ?? 'baixo',
      })));
    } catch { setCustomers([]); }
    finally { setLoadingCustomers(false); }
  };

  const totalClientes = segments.reduce((s, seg) => s + seg.total, 0);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Segmentos</h1>
          <p className="text-sm text-bibelo-muted mt-0.5">{totalClientes} clientes segmentados</p>
        </div>
      </div>

      {/* Segment Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-36" />
          ))
        ) : (
          segments.map((seg) => {
            const meta = SEGMENT_META[seg.segmento] || SEGMENT_META.novo;
            const Icon = meta.icon;
            const isSelected = selected === seg.segmento;
            const pct = totalClientes > 0 ? Math.round(seg.total / totalClientes * 100) : 0;

            return (
              <button
                key={seg.segmento}
                onClick={() => handleSelect(seg.segmento)}
                className={`bg-bibelo-card border rounded-xl p-5 text-left transition-all ${
                  isSelected
                    ? 'border-bibelo-primary ring-1 ring-bibelo-primary'
                    : 'border-bibelo-border hover:border-bibelo-primary/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg ${meta.bgColor} flex items-center justify-center`}>
                    <Icon size={16} className={meta.color} />
                  </div>
                  <span className="text-sm font-medium text-bibelo-text capitalize">{seg.segmento}</span>
                </div>
                <p className="text-2xl font-bold text-bibelo-text">{seg.total}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-bibelo-muted">{pct}% do total</p>
                  {seg.score_medio > 0 && (
                    <p className="text-xs text-bibelo-muted">Score {seg.score_medio}</p>
                  )}
                </div>
                {seg.ltv_medio > 0 && (
                  <p className="text-xs text-bibelo-muted mt-1">LTV medio: {formatCurrency(seg.ltv_medio)}</p>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Customer List */}
      {selected && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-bibelo-border flex items-center gap-2">
            <span className="text-sm font-medium text-bibelo-text capitalize">{selected}</span>
            <span className="text-xs text-bibelo-muted">
              — {SEGMENT_META[selected]?.desc || ''}
            </span>
          </div>

          {loadingCustomers ? (
            <div className="p-8 text-center text-bibelo-muted">Carregando...</div>
          ) : customers.length === 0 ? (
            <div className="p-8 text-center text-bibelo-muted">Nenhum cliente neste segmento</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">Email</th>
                    <th className="px-4 py-3 font-medium text-right">Score</th>
                    <th className="px-4 py-3 font-medium text-right hidden md:table-cell">LTV</th>
                    <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Risco</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link to={`/clientes/${c.id}`} className="text-bibelo-text hover:text-bibelo-primary font-medium transition-colors">
                          {c.nome}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-bibelo-muted hidden sm:table-cell">{c.email || '—'}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${
                        c.score >= 60 ? 'text-emerald-400' : c.score >= 30 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {c.score}
                      </td>
                      <td className="px-4 py-2.5 text-bibelo-text text-right hidden md:table-cell">
                        {formatCurrency(c.ltv)}
                      </td>
                      <td className="px-4 py-2.5 text-right hidden lg:table-cell">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.risco_churn === 'alto' ? 'bg-red-500/20 text-red-400' :
                          c.risco_churn === 'medio' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {c.risco_churn}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
