import { useState, useEffect } from 'react';
import api from '../lib/api';
import {
  Activity, CheckCircle2, AlertTriangle, Zap,
  RefreshCw, XCircle,
} from 'lucide-react';

interface JobResumo {
  tipo: string;
  total: number;
  ok: number;
  erros: number;
  ultima: string;
  ultimo_resultado: number;
}

interface Execucao {
  fonte: string;
  tipo: string;
  status: string;
  registros: number;
  erro: string;
  criado_em: string;
}

interface FilaInfo {
  nome: string;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  waiting: number;
  jobs_repetitivos: Array<{ nome: string; pattern: string; proxima: string | null }>;
}

function timeAgo(dt: string) {
  const diff = Date.now() - new Date(dt).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function cronToText(pattern: string): string {
  if (pattern === '* * * * *') return '1 min';
  const m = pattern.match(/\*\/(\d+) \* \* \* \*/);
  if (m) return `${m[1]} min`;
  const h = pattern.match(/0 \*\/(\d+) \* \* \*/);
  if (h) return `${h[1]}h`;
  return pattern;
}

export default function Filas() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetch = () => {
    setLoading(true);
    api.get('/queues/status')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  if (loading && !data) {
    return <div className="flex items-center justify-center h-64 text-bibelo-muted">Carregando...</div>;
  }

  const { filas, resumo_24h, ultimas_execucoes, erros_recentes } = data || {};
  const flow: FilaInfo = filas?.flow;
  const sync: FilaInfo = filas?.sync;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={22} className="text-violet-400" />
          <div>
            <h1 className="text-xl font-bold text-bibelo-text">Monitoramento de Filas</h1>
            <p className="text-sm text-bibelo-muted">13 jobs automaticos rodando</p>
          </div>
        </div>
        <button onClick={fetch} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-bibelo-card border border-bibelo-border text-bibelo-muted hover:text-bibelo-text transition-colors">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {/* Filas BullMQ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[{ fila: flow, label: 'Flow Engine', icon: Zap, color: 'violet' }, { fila: sync, label: 'Sync Engine', icon: RefreshCw, color: 'blue' }].map(({ fila, label, icon: Icon, color }) => (
          <div key={label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Icon size={16} className={`text-${color}-400`} />
              <h2 className="text-sm font-medium text-bibelo-text">{label}</h2>
              <span className="text-[10px] text-bibelo-muted">({fila?.nome})</span>
            </div>

            {/* Contadores */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              {[
                { label: 'Ativo', value: fila?.active, color: 'text-emerald-400' },
                { label: 'Completo', value: fila?.completed, color: 'text-bibelo-muted' },
                { label: 'Falhou', value: fila?.failed, color: 'text-red-400' },
                { label: 'Atrasado', value: fila?.delayed, color: 'text-amber-400' },
                { label: 'Esperando', value: fila?.waiting, color: 'text-blue-400' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value || 0}</p>
                  <p className="text-[10px] text-bibelo-muted">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Jobs repetitivos */}
            <div className="space-y-1">
              {fila?.jobs_repetitivos?.map((j: any) => (
                <div key={j.nome} className="flex items-center justify-between py-1 border-b border-bibelo-border last:border-0">
                  <span className="text-xs text-bibelo-text">{j.nome}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-bibelo-muted">{cronToText(j.pattern)}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Erros recentes */}
      {erros_recentes?.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <XCircle size={16} className="text-red-400" />
            <h2 className="text-sm font-medium text-red-300">Erros (48h)</h2>
          </div>
          <div className="space-y-1.5">
            {erros_recentes.map((e: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-1 border-b border-red-500/20 last:border-0">
                <div className="min-w-0 flex-1">
                  <span className="text-xs text-red-300">{e.tipo}</span>
                  <p className="text-[10px] text-red-400/70 truncate">{e.erro}</p>
                </div>
                <span className="text-[10px] text-bibelo-muted ml-2">{timeAgo(e.criado_em)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resumo 24h por job */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-bibelo-muted mb-3">Resumo 24h por Job</h2>
        {!resumo_24h?.length ? (
          <p className="text-xs text-bibelo-muted">Nenhuma execucao nas ultimas 24h</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-bibelo-muted border-b border-bibelo-border">
                  <th className="text-left py-2 font-medium">Job</th>
                  <th className="text-right py-2 font-medium">Exec.</th>
                  <th className="text-right py-2 font-medium">OK</th>
                  <th className="text-right py-2 font-medium">Erros</th>
                  <th className="text-right py-2 font-medium">Resultado</th>
                  <th className="text-right py-2 font-medium">Ultima</th>
                </tr>
              </thead>
              <tbody>
                {resumo_24h.map((j: JobResumo) => (
                  <tr key={j.tipo} className="border-b border-bibelo-border last:border-0">
                    <td className="py-2 text-bibelo-text">{j.tipo}</td>
                    <td className="py-2 text-right text-bibelo-text">{j.total}</td>
                    <td className="py-2 text-right text-emerald-400">{j.ok}</td>
                    <td className="py-2 text-right text-red-400">{j.erros || '-'}</td>
                    <td className="py-2 text-right text-bibelo-text">{j.ultimo_resultado}</td>
                    <td className="py-2 text-right text-bibelo-muted">{timeAgo(j.ultima)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Timeline de execucoes */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-bibelo-muted mb-3">Timeline (24h)</h2>
        {!ultimas_execucoes?.length ? (
          <p className="text-xs text-bibelo-muted">Nenhuma execucao</p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {ultimas_execucoes.map((e: Execucao, i: number) => (
              <div key={i} className="flex items-center gap-2 py-1 border-b border-bibelo-border last:border-0">
                {e.status === 'ok' ? (
                  <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
                )}
                <span className="text-xs text-bibelo-text flex-1">{e.tipo}</span>
                {e.registros > 0 && <span className="text-[10px] text-emerald-400">{e.registros} reg</span>}
                <span className="text-[10px] text-bibelo-muted">{timeAgo(e.criado_em)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
