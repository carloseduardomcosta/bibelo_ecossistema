import { useState, useEffect } from 'react';
import api from '../lib/api';
import {
  Server, HardDrive, Cpu, MemoryStick, Container,
  Shield, Code2, Database, GitCommit, RefreshCw,
  AlertTriangle, CheckCircle2, XCircle, Clock, Info,
  ShieldAlert, Plus, Ban, Unlock, Wifi, WifiOff, Trash2,
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

interface FirewallData {
  ssh_connections: Array<{ ip: string; port: number; user: string; pid: number }>;
  ufw_rules: Array<{ num: number; ip: string; label: string }>;
  fail2ban: {
    currently_banned: number;
    total_banned: number;
    currently_failed: number;
    banned_ips: string[];
    config: { bantime: string; maxretry: string; ignoreip: string };
  };
  recent_attempts: Array<{ time: string; ip: string; type: string; user: string }>;
  generated_at: string;
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
  const [fw, setFw] = useState<FirewallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [codeLoading, setCodeLoading] = useState(true);
  const [newIp, setNewIp] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [fwMsg, setFwMsg] = useState('');

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

  const fetchFirewall = () => {
    api.get('/firewall/status')
      .then(r => setFw(r.data))
      .catch(() => {});
  };

  const addWhitelist = () => {
    if (!newIp || !newLabel) return;
    api.post('/firewall/whitelist', { ip: newIp, label: newLabel })
      .then(r => { setFwMsg(r.data.message); setNewIp(''); setNewLabel(''); setTimeout(fetchFirewall, 65000); })
      .catch(() => setFwMsg('Erro ao adicionar'));
  };

  const removeWhitelist = (ip: string) => {
    if (!confirm(`Remover ${ip} da whitelist SSH?`)) return;
    api.delete(`/firewall/whitelist/${ip.replace(/\//g, '_')}`)
      .then(r => { setFwMsg(r.data.message); setTimeout(fetchFirewall, 65000); })
      .catch(() => setFwMsg('Erro ao remover'));
  };

  const unbanIp = (ip: string) => {
    api.post(`/firewall/unban/${ip}`)
      .then(r => { setFwMsg(r.data.message); setTimeout(fetchFirewall, 65000); })
      .catch(() => setFwMsg('Erro ao desbanir'));
  };

  useEffect(() => {
    fetchStatus();
    fetchCode();
    fetchFirewall();
    const interval = setInterval(() => { fetchStatus(); fetchFirewall(); }, 30000);
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

      {/* Firewall / SSH */}
      {fw && (
        <>
          {/* Conexões ativas + Fail2ban KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wifi size={14} className="text-emerald-400" />
                <span className="text-xs text-bibelo-muted">Conexoes SSH ativas</span>
              </div>
              <p className="text-2xl font-bold text-bibelo-text">{fw.ssh_connections.length}</p>
            </div>
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Ban size={14} className="text-red-400" />
                <span className="text-xs text-bibelo-muted">IPs banidos (permanente)</span>
              </div>
              <p className="text-2xl font-bold text-red-400">{fw.fail2ban.currently_banned}</p>
              <p className="text-[10px] text-bibelo-muted">Total historico: {fw.fail2ban.total_banned}</p>
            </div>
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert size={14} className="text-amber-400" />
                <span className="text-xs text-bibelo-muted">Fail2ban config</span>
              </div>
              <p className="text-xs text-bibelo-text">1 tentativa = ban permanente</p>
              <p className="text-[10px] text-bibelo-muted mt-1">IPs autorizados: {fw.fail2ban.config.ignoreip || 'nenhum'}</p>
            </div>
          </div>

          {/* Conexões SSH ativas */}
          {fw.ssh_connections.length > 0 && (
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Wifi size={14} className="text-emerald-400" />
                <h2 className="text-sm font-medium text-bibelo-muted">Conexoes SSH ativas agora</h2>
              </div>
              <div className="space-y-1">
                {fw.ssh_connections.map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-bibelo-border last:border-0">
                    <span className="text-xs text-bibelo-text font-mono">{c.ip}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-bibelo-muted">user: {c.user}</span>
                      <span className="text-[10px] text-bibelo-muted">porta: {c.port}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Whitelist SSH (regras UFW) */}
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={14} className="text-blue-400" />
              <h2 className="text-sm font-medium text-bibelo-muted">Whitelist SSH (UFW)</h2>
              <span className="text-[10px] text-bibelo-muted ml-auto">{fw.ufw_rules.length} regras</span>
            </div>
            <div className="space-y-1 mb-4">
              {fw.ufw_rules.map(rule => (
                <div key={rule.num} className="flex items-center justify-between py-1.5 border-b border-bibelo-border last:border-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={10} className="text-emerald-400" />
                    <span className="text-xs text-bibelo-text font-mono">{rule.ip}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-bibelo-muted">{rule.label}</span>
                    {rule.label.includes('via CRM') && (
                      <button onClick={() => removeWhitelist(rule.ip)} className="text-red-400 hover:text-red-300 transition-colors" title="Remover">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Adicionar IP */}
            <div className="border-t border-bibelo-border pt-3">
              <p className="text-[10px] text-bibelo-muted mb-2">Adicionar IP a whitelist (aplica em ~1 min)</p>
              <div className="flex gap-2">
                <input
                  type="text" placeholder="192.168.1.1" value={newIp} onChange={e => setNewIp(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs bg-bibelo-bg border border-bibelo-border rounded-lg text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-bibelo-primary"
                />
                <input
                  type="text" placeholder="Descricao" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs bg-bibelo-bg border border-bibelo-border rounded-lg text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-bibelo-primary"
                />
                <button onClick={addWhitelist} disabled={!newIp || !newLabel} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-30">
                  <Plus size={12} /> Adicionar
                </button>
              </div>
              {fwMsg && <p className="text-[10px] text-amber-400 mt-2">{fwMsg}</p>}
            </div>
          </div>

          {/* IPs banidos */}
          {fw.fail2ban.banned_ips.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Ban size={14} className="text-red-400" />
                <h2 className="text-sm font-medium text-red-300">IPs banidos permanentemente</h2>
              </div>
              <div className="space-y-1">
                {fw.fail2ban.banned_ips.map(ip => (
                  <div key={ip} className="flex items-center justify-between py-1 border-b border-red-500/20 last:border-0">
                    <div className="flex items-center gap-2">
                      <WifiOff size={10} className="text-red-400" />
                      <span className="text-xs text-red-300 font-mono">{ip}</span>
                    </div>
                    <button onClick={() => unbanIp(ip)} className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors">
                      <Unlock size={10} /> Desbanir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline de tentativas SSH 24h */}
          {fw.recent_attempts.length > 0 && (
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={14} className="text-bibelo-muted" />
                <h2 className="text-sm font-medium text-bibelo-muted">Tentativas SSH (24h)</h2>
                <span className="text-[10px] text-bibelo-muted ml-auto">{fw.recent_attempts.length} eventos</span>
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {fw.recent_attempts.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 border-b border-bibelo-border last:border-0">
                    {a.type === 'Accepted' ? (
                      <CheckCircle2 size={10} className="text-emerald-400 flex-shrink-0" />
                    ) : a.type === 'Failed' || a.type === 'Invalid' ? (
                      <XCircle size={10} className="text-red-400 flex-shrink-0" />
                    ) : (
                      <WifiOff size={10} className="text-bibelo-muted flex-shrink-0" />
                    )}
                    <span className="text-xs text-bibelo-text font-mono w-28 flex-shrink-0">{a.ip}</span>
                    <span className={`text-[10px] flex-shrink-0 ${a.type === 'Accepted' ? 'text-emerald-400' : a.type === 'Failed' ? 'text-red-400' : 'text-bibelo-muted'}`}>{a.type}</span>
                    <span className="text-[10px] text-bibelo-muted">{a.user}</span>
                    <span className="text-[10px] text-bibelo-muted ml-auto">{a.time?.split('T')[1]?.split('-')[0]?.substring(0,5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

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
