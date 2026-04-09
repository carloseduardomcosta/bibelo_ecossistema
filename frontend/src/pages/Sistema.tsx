import { useState, useEffect } from 'react';
import api from '../lib/api';
import {
  Server, HardDrive, Cpu, MemoryStick, Container,
  Shield, Code2, Database, GitCommit, RefreshCw,
  AlertTriangle, CheckCircle2, XCircle, Clock, Info,
} from 'lucide-react';

interface SystemData {
  hostname: string;
  platform: string;
  uptime_seconds: number;
  cpus: number;
  load_avg: { '1m': number; '5m': number; '15m': number };
  disk: { total: string; used: string; avail: string; pct: number };
  memory: { total: number; used: number; available: number; pct: number };
  swap: { total: string; used: string; pct: number };
  containers: Array<{ name: string; status: string; healthy: boolean; memory: string; cpu: string }>;
  certs: Array<{ domain: string; expiry: string; days: number }>;
  alerts: Array<{ level: 'critical' | 'warning' | 'info'; message: string }>;
  git: { commits: number; last_commit: string; last_date: string };
  db: { customers: number; leads: number; orders: number; flows: number; campaigns: number; size: string };
}

interface CodeStats {
  total_lines: number;
  total_files: number;
  by_layer: Record<string, number>;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function GaugeBar({ pct, label, value, color }: { pct: number; label: string; value: string; color: string }) {
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : color;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-bibelo-muted">{label}</span>
        <span className="text-xs text-bibelo-text font-medium">{value}</span>
      </div>
      <div className="w-full h-2 bg-bibelo-border rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="text-[10px] text-bibelo-muted text-right mt-0.5">{pct}%</p>
    </div>
  );
}

function AlertBadge({ level }: { level: string }) {
  if (level === 'critical') return <XCircle size={14} className="text-red-400 flex-shrink-0" />;
  if (level === 'warning') return <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />;
  return <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />;
}

function LayerBar({ name, lines, max }: { name: string; lines: number; max: number }) {
  const pct = max > 0 ? (lines / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-bibelo-muted w-32 text-right flex-shrink-0">{name}</span>
      <div className="flex-1 h-4 bg-bibelo-border rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500/70 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-bibelo-text font-mono w-16 text-right">{formatNumber(lines)}</span>
    </div>
  );
}

export default function Sistema() {
  const [data, setData] = useState<SystemData | null>(null);
  const [code, setCode] = useState<CodeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [codeLoading, setCodeLoading] = useState(true);

  const fetchStatus = () => {
    setLoading(true);
    api.get('/system/status')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const fetchCode = () => {
    setCodeLoading(true);
    api.get('/system/code-stats')
      .then(r => setCode(r.data))
      .catch(() => {})
      .finally(() => setCodeLoading(false));
  };

  useEffect(() => {
    fetchStatus();
    fetchCode();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return <div className="flex items-center justify-center h-64 text-bibelo-muted">Carregando...</div>;
  }

  const hasCritical = data?.alerts?.some(a => a.level === 'critical');
  const hasWarning = data?.alerts?.some(a => a.level === 'warning');
  const maxLines = code ? Math.max(...Object.values(code.by_layer)) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server size={22} className="text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold text-bibelo-text">Sistema</h1>
            <p className="text-sm text-bibelo-muted">{data?.platform} — up {data ? formatUptime(data.uptime_seconds) : '...'}</p>
          </div>
        </div>
        <button onClick={() => { fetchStatus(); fetchCode(); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-bibelo-card border border-bibelo-border text-bibelo-muted hover:text-bibelo-text transition-colors">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {/* Alertas */}
      {data?.alerts && (hasCritical || hasWarning) && (
        <div className={`${hasCritical ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'} border rounded-xl p-4`}>
          <div className="space-y-2">
            {data.alerts.filter(a => a.level !== 'info').map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <AlertBadge level={a.level} />
                <span className={`text-sm ${a.level === 'critical' ? 'text-red-300' : 'text-amber-300'}`}>{a.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status OK */}
      {data?.alerts && !hasCritical && !hasWarning && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span className="text-sm text-emerald-300">Todos os sistemas operando normalmente</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: HardDrive, label: 'Disco', value: `${data?.disk.used} / ${data?.disk.total}`, sub: `${data?.disk.pct}% usado`, color: 'text-blue-400' },
          { icon: MemoryStick, label: 'RAM', value: `${data?.memory.used}MB / ${data?.memory.total}MB`, sub: `${data?.memory.pct}% usada`, color: 'text-violet-400' },
          { icon: Cpu, label: 'CPU', value: `${data?.cpus} cores`, sub: `Load: ${data?.load_avg['1m'].toFixed(2)}`, color: 'text-amber-400' },
          { icon: Database, label: 'Banco', value: data?.db.size || '?', sub: `${formatNumber(data?.db.customers || 0)} clientes`, color: 'text-emerald-400' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon size={14} className={kpi.color} />
              <span className="text-xs text-bibelo-muted">{kpi.label}</span>
            </div>
            <p className="text-lg font-bold text-bibelo-text">{kpi.value}</p>
            <p className="text-[10px] text-bibelo-muted">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Gauges */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-bibelo-muted mb-4">Recursos</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GaugeBar pct={data?.disk.pct || 0} label="Disco" value={`${data?.disk.used} de ${data?.disk.total}`} color="bg-blue-500" />
          <GaugeBar pct={data?.memory.pct || 0} label="RAM" value={`${data?.memory.used}MB de ${data?.memory.total}MB`} color="bg-violet-500" />
          <GaugeBar pct={data?.swap.pct || 0} label="Swap" value={`${data?.swap.used} de ${data?.swap.total}`} color="bg-cyan-500" />
        </div>
      </div>

      {/* Containers */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Container size={14} className="text-blue-400" />
          <h2 className="text-sm font-medium text-bibelo-muted">Containers Docker</h2>
          <span className="text-[10px] text-emerald-400 ml-auto">{data?.containers.filter(c => c.healthy).length}/{data?.containers.length} healthy</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-bibelo-muted border-b border-bibelo-border">
                <th className="text-left py-2 font-medium">Container</th>
                <th className="text-center py-2 font-medium">Status</th>
                <th className="text-right py-2 font-medium">RAM</th>
                <th className="text-right py-2 font-medium">CPU</th>
              </tr>
            </thead>
            <tbody>
              {data?.containers.map(c => (
                <tr key={c.name} className="border-b border-bibelo-border last:border-0">
                  <td className="py-2 text-bibelo-text font-mono">{c.name.replace('bibelo_', '')}</td>
                  <td className="py-2 text-center">
                    {c.healthy ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 size={10} /> healthy</span>
                    ) : c.status.includes('starting') ? (
                      <span className="inline-flex items-center gap-1 text-amber-400"><Clock size={10} /> starting</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-400"><XCircle size={10} /> unhealthy</span>
                    )}
                  </td>
                  <td className="py-2 text-right text-bibelo-text">{c.memory}</td>
                  <td className="py-2 text-right text-bibelo-text">{c.cpu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SSL Certificates */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={14} className="text-emerald-400" />
          <h2 className="text-sm font-medium text-bibelo-muted">Certificados SSL</h2>
        </div>
        <div className="space-y-2">
          {data?.certs.map(cert => (
            <div key={cert.domain} className="flex items-center justify-between py-1 border-b border-bibelo-border last:border-0">
              <span className="text-xs text-bibelo-text font-mono">{cert.domain}</span>
              <span className={`text-xs font-medium ${cert.days <= 7 ? 'text-red-400' : cert.days <= 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {cert.days} dias
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Código do projeto */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Code2 size={14} className="text-pink-400" />
          <h2 className="text-sm font-medium text-bibelo-muted">Código do Projeto</h2>
          {code && (
            <span className="text-[10px] text-bibelo-muted ml-auto">{formatNumber(code.total_files)} arquivos</span>
          )}
        </div>
        {codeLoading && !code ? (
          <p className="text-xs text-bibelo-muted">Contando linhas...</p>
        ) : code ? (
          <>
            <div className="text-center mb-5">
              <p className="text-3xl font-bold text-bibelo-text">{formatNumber(code.total_lines)}</p>
              <p className="text-xs text-bibelo-muted">linhas de codigo</p>
            </div>
            <div className="space-y-3">
              {Object.entries(code.by_layer)
                .sort(([, a], [, b]) => b - a)
                .map(([name, lines]) => (
                  <LayerBar key={name} name={name} lines={lines} max={maxLines} />
                ))
              }
            </div>
          </>
        ) : null}
      </div>

      {/* Git + DB stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Git */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitCommit size={14} className="text-orange-400" />
            <h2 className="text-sm font-medium text-bibelo-muted">Git</h2>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs text-bibelo-muted">Total commits</span>
              <span className="text-xs text-bibelo-text font-bold">{data?.git.commits}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-bibelo-muted">Ultimo commit</span>
              <span className="text-xs text-bibelo-text font-mono truncate ml-2 max-w-[200px]">{data?.git.last_commit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-bibelo-muted">Data</span>
              <span className="text-xs text-bibelo-text">{data?.git.last_date?.split(' ')[0]}</span>
            </div>
          </div>
        </div>

        {/* DB */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database size={14} className="text-emerald-400" />
            <h2 className="text-sm font-medium text-bibelo-muted">Banco de Dados</h2>
            <span className="text-[10px] text-bibelo-muted ml-auto">{data?.db.size}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Clientes', value: data?.db.customers },
              { label: 'Leads', value: data?.db.leads },
              { label: 'Pedidos', value: data?.db.orders },
              { label: 'Fluxos', value: data?.db.flows },
              { label: 'Campanhas', value: data?.db.campaigns },
            ].map(s => (
              <div key={s.label} className="flex justify-between">
                <span className="text-xs text-bibelo-muted">{s.label}</span>
                <span className="text-xs text-bibelo-text font-bold">{formatNumber(s.value || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="flex items-center gap-2 text-[10px] text-bibelo-muted justify-center">
        <Info size={10} />
        <span>Atualização automática a cada 30 segundos</span>
      </div>
    </div>
  );
}
