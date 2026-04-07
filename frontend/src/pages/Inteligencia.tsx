import { useState, useEffect } from 'react';
import api from '../lib/api';
import { formatCurrency } from '../lib/format';
import {
  Brain, Users, ShoppingCart, TrendingUp, AlertTriangle,
  Zap, Target, ArrowUpRight, ArrowDownRight, Heart, UserX,
  DollarSign, Megaphone, Store, Globe, Sparkles, Package,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
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

const TABS = [
  { id: 'rfm', label: 'RFM', icon: Users },
  { id: 'fluxos', label: 'Conversao Fluxos', icon: Zap },
  { id: 'roi', label: 'ROI por Canal', icon: Target },
  { id: 'crosssell', label: 'Cross-sell', icon: Package },
];

// Cores por segmento RFM
const RFM_CORES: Record<string, string> = {
  "Campeoes": "#34D399",
  "Leais": "#60A5FA",
  "Novos Promissores": "#A78BFA",
  "Potenciais Leais": "#818CF8",
  "Precisam Atencao": "#FBBF24",
  "Em Risco": "#F97316",
  "Nao Pode Perder": "#EF4444",
  "Hibernando": "#9CA3AF",
  "Perdidos": "#6B7280",
};

const CANAL_CORES: Record<string, string> = {
  "fisico": "#F472B6",
  "nuvemshop": "#60A5FA",
  "shopee": "#F97316",
  "online": "#A78BFA",
  "desconhecido": "#9CA3AF",
};

const CANAL_LABELS: Record<string, string> = {
  "fisico": "Loja Fisica",
  "nuvemshop": "NuvemShop",
  "shopee": "Shopee",
  "online": "Online",
  "desconhecido": "Outros",
  "bling": "Bling (loja)",
  "popup": "Popup",
  "grupo_vip": "Grupo VIP",
};

function VariacaoBadge({ valor }: { valor: number }) {
  if (valor === 0) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${valor > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
      {valor > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(valor)}%
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 1: RFM
// ═══════════════════════════════════════════════════════════════

function TabRFM({ data }: { data: any }) {
  if (!data) return <Loading />;

  const { distribuicao, top_clientes, em_risco, total_clientes, com_pedidos, sem_pedidos } = data;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard icon={Users} label="Total Clientes" value={total_clientes} color="violet" />
        <KpiCard icon={ShoppingCart} label="Ja Compraram" value={com_pedidos} subtitle={`${Math.round(com_pedidos / total_clientes * 100)}% do total`} color="emerald" />
        <KpiCard icon={UserX} label="Nunca Compraram" value={sem_pedidos} subtitle={`${Math.round(sem_pedidos / total_clientes * 100)}% do total`} color="amber" />
      </div>

      {/* Distribuicao RFM */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Segmentos RFM</h2>
          {distribuicao.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={distribuicao} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" tick={{ fill: '#888', fontSize: 11 }} />
                <YAxis type="category" dataKey="segmento" width={130} tick={{ fill: '#888', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => name === 'ltv_medio' ? [formatCurrency(v), 'LTV Medio'] : [v, name]}
                />
                <Bar dataKey="total" fill="#8B5CF6" name="Clientes" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">LTV Medio por Segmento</h2>
          <div className="space-y-2">
            {distribuicao.map((s: any) => (
              <div key={s.segmento} className="flex items-center justify-between py-1.5 border-b border-bibelo-border last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RFM_CORES[s.segmento] || '#8B5CF6' }} />
                  <span className="text-xs text-bibelo-text">{s.segmento}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-bibelo-text">{formatCurrency(s.ltv_medio)}</p>
                  <p className="text-[10px] text-bibelo-muted">{s.total} clientes</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Em Risco + Perdidos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-orange-400" />
            <h2 className="text-sm font-medium text-bibelo-muted">Em Risco / Nao Pode Perder</h2>
          </div>
          {em_risco.length === 0 ? <p className="text-xs text-bibelo-muted">Nenhum cliente em risco</p> : (
            <div className="space-y-1.5">
              {em_risco.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between py-1 border-b border-bibelo-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-bibelo-text truncate">{c.nome}</p>
                    <p className="text-xs text-bibelo-muted">{c.dias_sem_compra}d sem compra · {c.total_pedidos} pedidos</p>
                  </div>
                  <span className="text-sm font-medium text-orange-400 ml-2">{formatCurrency(c.ltv)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Heart size={16} className="text-red-400" />
            <h2 className="text-sm font-medium text-bibelo-muted">Top Clientes (Campeoes)</h2>
          </div>
          {top_clientes.length === 0 ? <p className="text-xs text-bibelo-muted">Sem dados</p> : (
            <div className="space-y-1.5">
              {top_clientes.filter((c: any) => c.rfm_segmento === 'Campeoes' || c.rfm_score >= 12).slice(0, 10).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between py-1 border-b border-bibelo-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-bibelo-text truncate">{c.nome}</p>
                    <p className="text-xs text-bibelo-muted">R{c.r} F{c.f} M{c.m} · {c.total_pedidos} pedidos</p>
                  </div>
                  <span className="text-sm font-medium text-emerald-400 ml-2">{formatCurrency(c.ltv)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: Conversao de Fluxos
// ═══════════════════════════════════════════════════════════════

function TabFluxos({ data }: { data: any }) {
  if (!data) return <Loading />;

  const { detalhes, totais } = data;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard icon={Zap} label="Execucoes" value={totais.execucoes} color="violet" />
        <KpiCard icon={ShoppingCart} label="Conversoes" value={totais.conversoes} subtitle={totais.execucoes > 0 ? `${Math.round(totais.conversoes / totais.execucoes * 100)}% taxa` : ''} color="emerald" />
        <KpiCard icon={DollarSign} label="Receita Gerada" value={formatCurrency(totais.receita)} color="pink" />
        <KpiCard icon={Megaphone} label="Emails Enviados" value={totais.emails} color="blue" />
      </div>

      {/* Funil por fluxo */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-bibelo-muted mb-4">Funil de Conversao por Fluxo</h2>
        {detalhes.length === 0 ? <Empty /> : (
          <div className="space-y-4">
            {detalhes.filter((f: any) => f.total_execucoes > 0).map((f: any) => (
              <div key={f.id} className="border border-bibelo-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium text-bibelo-text">{f.nome}</h3>
                    <p className="text-xs text-bibelo-muted">{f.gatilho} · {f.ativo ? 'Ativo' : 'Inativo'}</p>
                  </div>
                  {f.receita_gerada > 0 && (
                    <span className="text-sm font-bold text-emerald-400">{formatCurrency(f.receita_gerada)}</span>
                  )}
                </div>

                {/* Barra de funil */}
                <div className="flex items-center gap-1 mb-2">
                  {[
                    { label: 'Execucoes', value: Number(f.total_execucoes), color: '#8B5CF6' },
                    { label: 'Emails', value: f.emails_enviados, color: '#60A5FA' },
                    { label: 'Abertos', value: f.emails_abertos, color: '#FBBF24' },
                    { label: 'Cliques', value: f.emails_clicados, color: '#F472B6' },
                    { label: 'Conversoes', value: f.conversoes, color: '#34D399' },
                  ].map((step, i) => {
                    const maxVal = Number(f.total_execucoes) || 1;
                    const pct = Math.max(4, (step.value / maxVal) * 100);
                    return (
                      <div key={i} className="flex-1">
                        <div className="h-8 rounded flex items-center justify-center relative" style={{ backgroundColor: step.color + '30' }}>
                          <div
                            className="absolute left-0 top-0 h-full rounded transition-all"
                            style={{ width: `${pct}%`, backgroundColor: step.color + '60' }}
                          />
                          <span className="relative text-[10px] font-medium text-bibelo-text z-10">{step.value}</span>
                        </div>
                        <p className="text-[10px] text-bibelo-muted text-center mt-0.5">{step.label}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Metricas */}
                <div className="flex gap-4 text-xs text-bibelo-muted">
                  <span>Abertura: <strong className="text-bibelo-text">{f.taxa_abertura}%</strong></span>
                  <span>Conversao: <strong className="text-bibelo-text">{f.taxa_conversao}%</strong></span>
                  {f.total_concluidas > 0 && <span>Concluidos: <strong className="text-bibelo-text">{Number(f.total_concluidas)}</strong></span>}
                  {f.total_erro > 0 && <span className="text-red-400">Erros: {Number(f.total_erro)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fluxos sem execucao */}
      {detalhes.some((f: any) => f.total_execucoes === 0) && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-2">Fluxos sem execucao no periodo</h2>
          <div className="flex flex-wrap gap-2">
            {detalhes.filter((f: any) => f.total_execucoes === 0).map((f: any) => (
              <span key={f.id} className="text-xs px-2 py-1 rounded-lg bg-bibelo-bg text-bibelo-muted border border-bibelo-border">
                {f.nome} ({f.gatilho})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 3: ROI por Canal
// ═══════════════════════════════════════════════════════════════

function TabROI({ data }: { data: any }) {
  if (!data) return <Loading />;

  const { receita_periodo, variacao, por_canal_venda, por_canal_origem, leads_por_fonte, evolucao_mensal } = data;

  // Preparar dados para grafico de evolucao mensal
  const mesesSet = new Set<string>();
  const evolMap = new Map<string, Record<string, number>>();
  for (const row of evolucao_mensal) {
    mesesSet.add(row.mes);
    if (!evolMap.has(row.mes)) evolMap.set(row.mes, {});
    evolMap.get(row.mes)![row.canal] = row.receita;
  }
  const canais = [...new Set(evolucao_mensal.map((r: any) => r.canal))] as string[];
  const evolData = [...mesesSet].sort().map(mes => {
    const d: any = { mes: formatMes(mes) };
    for (const c of canais) d[c] = evolMap.get(mes)?.[c as string] || 0;
    return d;
  });

  return (
    <div className="space-y-4">
      {/* KPI principal */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-bibelo-muted">Receita Total no Periodo</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-bibelo-text">{formatCurrency(receita_periodo)}</p>
              <VariacaoBadge valor={variacao} />
            </div>
          </div>
          <TrendingUp size={24} className="text-emerald-400" />
        </div>
      </div>

      {/* Por canal de venda + Por canal de origem */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Canal de VENDA */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Store size={16} className="text-pink-400" />
            <h2 className="text-sm font-medium text-bibelo-muted">Receita por Canal de Venda</h2>
          </div>
          {por_canal_venda.length === 0 ? <Empty /> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={por_canal_venda.map((c: any) => ({ ...c, name: CANAL_LABELS[c.canal] || c.canal }))}
                    cx="50%" cy="50%"
                    innerRadius={45} outerRadius={75}
                    dataKey="receita" nameKey="name"
                    stroke="none"
                  >
                    {por_canal_venda.map((c: any, i: number) => (
                      <Cell key={i} fill={CANAL_CORES[c.canal] || '#8B5CF6'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [formatCurrency(v), 'Receita']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {por_canal_venda.map((c: any) => (
                  <div key={c.canal} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CANAL_CORES[c.canal] || '#8B5CF6' }} />
                      <span className="text-xs text-bibelo-text">{CANAL_LABELS[c.canal] || c.canal}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-medium text-bibelo-text">{formatCurrency(c.receita)}</span>
                      <span className="text-[10px] text-bibelo-muted ml-1">({c.pedidos} pedidos)</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Canal de ORIGEM */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={16} className="text-blue-400" />
            <h2 className="text-sm font-medium text-bibelo-muted">Clientes por Canal de Origem</h2>
          </div>
          {por_canal_origem.length === 0 ? <Empty /> : (
            <div className="space-y-2.5">
              {por_canal_origem.map((c: any) => {
                const pct = Math.round((c.receita_total / (receita_periodo || 1)) * 100);
                return (
                  <div key={c.canal_origem} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-bibelo-text">{CANAL_LABELS[c.canal_origem] || c.canal_origem}</span>
                      <span className="text-xs font-medium text-bibelo-text">{formatCurrency(c.receita_total)}</span>
                    </div>
                    <div className="w-full h-2 bg-bibelo-bg rounded-full">
                      <div className="h-2 rounded-full bg-violet-500 transition-all" style={{ width: `${Math.min(100, pct || 1)}%` }} />
                    </div>
                    <div className="flex gap-3 text-[10px] text-bibelo-muted">
                      <span>{c.total_clientes} clientes</span>
                      <span>{c.compradores} compraram</span>
                      <span>Conv: {c.taxa_conversao}%</span>
                      <span>LTV: {formatCurrency(c.ltv_medio || 0)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Evolucao mensal */}
      {evolData.length > 0 && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Evolucao Mensal por Canal</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={evolData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="mes" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, name: string) => [formatCurrency(v), CANAL_LABELS[name] || name]}
              />
              {canais.map((c: string, i: number) => (
                <Bar key={c} dataKey={c} stackId="a" fill={CANAL_CORES[c] || Object.values(CANAL_CORES)[i % 5]} name={c}
                  radius={i === canais.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Leads por fonte */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-amber-400" />
          <h2 className="text-sm font-medium text-bibelo-muted">Funil de Leads por Fonte</h2>
        </div>
        {leads_por_fonte.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-bibelo-muted border-b border-bibelo-border">
                  <th className="text-left py-2 font-medium">Fonte</th>
                  <th className="text-right py-2 font-medium">Leads</th>
                  <th className="text-right py-2 font-medium">Verificados</th>
                  <th className="text-right py-2 font-medium">Convertidos</th>
                  <th className="text-right py-2 font-medium">Taxa Conv.</th>
                </tr>
              </thead>
              <tbody>
                {leads_por_fonte.map((l: any) => (
                  <tr key={l.fonte} className="border-b border-bibelo-border last:border-0">
                    <td className="py-2 text-bibelo-text capitalize">{l.fonte.replace('_', ' ')}</td>
                    <td className="py-2 text-right text-bibelo-text">{l.total}</td>
                    <td className="py-2 text-right text-bibelo-text">{l.verificados}</td>
                    <td className="py-2 text-right text-emerald-400 font-medium">{l.convertidos}</td>
                    <td className="py-2 text-right text-bibelo-text">
                      {l.total > 0 ? `${Math.round(l.convertidos / l.total * 100)}%` : '0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 4: Cross-sell
// ═══════════════════════════════════════════════════════════════

function TabCrossSell({ data }: { data: any }) {
  if (!data) return <Loading />;

  const { stats, pares, top_produtos } = data;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard icon={ShoppingCart} label="Pedidos Multi-item" value={stats.multi_item} subtitle={`${stats.pct_multi}% do total`} color="violet" />
        <KpiCard icon={Package} label="Total Pedidos" value={stats.total_pedidos} color="blue" />
        <KpiCard icon={TrendingUp} label="Media Itens/Pedido" value={stats.media_itens} color="emerald" />
      </div>

      {/* Info */}
      <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4 flex items-start gap-3">
        <Zap size={18} className="text-violet-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm text-violet-300 font-medium">Fluxo ativo: Cross-sell pos-compra</p>
          <p className="text-xs text-bibelo-muted mt-1">
            3 dias apos cada compra, o sistema envia automaticamente um email com produtos complementares
            baseados no que o cliente comprou. Se clicar, recebe um lembrete 7 dias depois.
          </p>
        </div>
      </div>

      {/* Pares frequentes */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Package size={16} className="text-pink-400" />
          <h2 className="text-sm font-medium text-bibelo-muted">Produtos Frequentemente Comprados Juntos</h2>
        </div>
        {pares.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {pares.slice(0, 15).map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-bibelo-border last:border-0">
                {/* Produto A */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {p.img_a ? (
                    <img src={p.img_a} alt="" className="w-10 h-10 rounded-lg object-contain bg-white flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-bibelo-bg flex items-center justify-center text-sm flex-shrink-0">🎀</div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-bibelo-text truncate">{p.nome_a}</p>
                    <p className="text-[10px] text-bibelo-muted">{formatCurrency(p.valor_a)}</p>
                  </div>
                </div>

                {/* Conector */}
                <div className="flex-shrink-0 text-center">
                  <span className="text-xs text-pink-400 font-bold">+</span>
                </div>

                {/* Produto B */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {p.img_b ? (
                    <img src={p.img_b} alt="" className="w-10 h-10 rounded-lg object-contain bg-white flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-bibelo-bg flex items-center justify-center text-sm flex-shrink-0">🎀</div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-bibelo-text truncate">{p.nome_b}</p>
                    <p className="text-[10px] text-bibelo-muted">{formatCurrency(p.valor_b)}</p>
                  </div>
                </div>

                {/* Badge */}
                <span className="flex-shrink-0 bg-pink-500/20 text-pink-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {p.vezes_juntos}x
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Produtos (mais vendidos recentes) */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-emerald-400" />
          <h2 className="text-sm font-medium text-bibelo-muted">Mais Vendidos (ultimos 3 meses)</h2>
        </div>
        {top_produtos.length === 0 ? <Empty /> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {top_produtos.slice(0, 8).map((p: any, i: number) => (
              <div key={i} className="bg-bibelo-bg rounded-lg p-3 text-center">
                {p.img ? (
                  <img src={p.img} alt="" className="w-full h-20 object-contain rounded-lg mb-2 bg-white" />
                ) : (
                  <div className="w-full h-20 bg-bibelo-card rounded-lg mb-2 flex items-center justify-center text-2xl">🎀</div>
                )}
                <p className="text-[11px] text-bibelo-text truncate">{p.nome}</p>
                <p className="text-xs text-pink-400 font-bold">{formatCurrency(p.valor)}</p>
                <p className="text-[10px] text-bibelo-muted">{p.vendas} vendas</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function KpiCard({ icon: Icon, label, value, subtitle, color }: {
  icon: any; label: string; value: any; subtitle?: string; color: string;
}) {
  const colors: Record<string, string> = {
    violet: 'text-violet-400', emerald: 'text-emerald-400', amber: 'text-amber-400',
    pink: 'text-pink-400', blue: 'text-blue-400', red: 'text-red-400',
  };
  return (
    <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-bibelo-muted">{label}</p>
        <Icon size={16} className={colors[color] || 'text-violet-400'} />
      </div>
      <p className="text-xl font-bold text-bibelo-text">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
      {subtitle && <p className="text-xs text-bibelo-muted mt-0.5">{subtitle}</p>}
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-4 h-24 animate-pulse" />)}
    </div>
  );
}

function Empty() {
  return <div className="h-48 flex items-center justify-center text-bibelo-muted text-sm">Sem dados no periodo</div>;
}

function formatMes(mes: string) {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const [ano, m] = mes.split('-');
  return `${meses[parseInt(m) - 1]}/${ano.slice(2)}`;
}

// ═══════════════════════════════════════════════════════════════
// PAGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════

export default function Inteligencia() {
  const [tab, setTab] = useState('rfm');
  const [periodo, setPeriodo] = useState('30d');
  const [rfmData, setRfmData] = useState<any>(null);
  const [fluxosData, setFluxosData] = useState<any>(null);
  const [roiData, setRoiData] = useState<any>(null);
  const [crossSellData, setCrossSellData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetches: Promise<any>[] = [];

    if (tab === 'rfm') {
      fetches.push(api.get('/analytics/rfm').then(r => setRfmData(r.data)));
    } else if (tab === 'fluxos') {
      fetches.push(api.get(`/analytics/flow-conversion?periodo=${periodo}`).then(r => setFluxosData(r.data)));
    } else if (tab === 'crosssell') {
      fetches.push(api.get('/analytics/cross-sell').then(r => setCrossSellData(r.data)));
    } else {
      fetches.push(api.get(`/analytics/roi-canal?periodo=${periodo}`).then(r => setRoiData(r.data)));
    }

    Promise.all(fetches).catch(() => {}).finally(() => setLoading(false));
  }, [tab, periodo]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain size={22} className="text-violet-400" />
          <div>
            <h1 className="text-xl font-bold text-bibelo-text">Inteligencia</h1>
            <p className="text-sm text-bibelo-muted">RFM, conversao de fluxos e ROI por canal</p>
          </div>
        </div>
        {tab !== 'rfm' && tab !== 'crosssell' && (
          <div className="flex gap-1">
            {PERIODOS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriodo(p.value)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  periodo === p.value ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:bg-bibelo-card'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bibelo-card border border-bibelo-border rounded-xl p-1">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text'
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? <Loading /> : (
        <>
          {tab === 'rfm' && <TabRFM data={rfmData} />}
          {tab === 'fluxos' && <TabFluxos data={fluxosData} />}
          {tab === 'roi' && <TabROI data={roiData} />}
          {tab === 'crosssell' && <TabCrossSell data={crossSellData} />}
        </>
      )}
    </div>
  );
}
