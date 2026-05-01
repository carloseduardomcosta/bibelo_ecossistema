import { useEffect, useState } from 'react';
import { ExternalLink, MousePointerClick, Eye, TrendingUp, MapPin, Globe, Clock } from 'lucide-react';
import api from '../lib/api';

interface Resumo { views30d: number; cliques30d: number; ctr30d: number }
interface PorLink { slug: string; cliques: string; ultimo: string }
interface PorDia  { dia: string; page_views: string; cliques: string }
interface PorEstado { estado: string; cliques: string }
interface PorReferer { referer: string; visitas: string }
interface PorHora { hora: string; visitas: string }

interface Stats {
  resumo: Resumo;
  porLink: PorLink[];
  porDia: PorDia[];
  porEstado: PorEstado[];
  porReferer: PorReferer[];
  porHora: PorHora[];
  links: { slug: string; titulo: string }[];
}

const LINK_LABELS: Record<string, { label: string; emoji: string }> = {
  whatsapp:  { label: 'WhatsApp',     emoji: '💬' },
  'grupo-vip': { label: 'Clube VIP',  emoji: '💖' },
  formulario:{ label: 'Novidades',    emoji: '📋' },
};

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-800 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function MenuBoasvindas() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo] = useState(30);

  useEffect(() => {
    setLoading(true);
    api.get('/links/stats').then(r => {
      setStats(r.data);
    }).finally(() => setLoading(false));
  }, [periodo]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-pink-300 border-t-pink-600 rounded-full animate-spin" />
    </div>
  );

  if (!stats) return (
    <div className="text-center py-16 text-gray-400">Erro ao carregar dados.</div>
  );

  const { resumo, porLink, porDia, porEstado, porReferer, porHora } = stats;

  // max cliques para barra de progresso
  const maxCliques = Math.max(...porLink.map(l => parseInt(l.cliques) || 0), 1);

  // horas — preencher 0-23
  const horaMap = Object.fromEntries(porHora.map(h => [parseInt(h.hora), parseInt(h.visitas)]));
  const maxHora = Math.max(...Object.values(horaMap), 1);

  // dias — ordenar crescente para o gráfico
  const diasOrdenados = [...porDia].sort((a, b) => a.dia.localeCompare(b.dia));
  const maxDia = Math.max(...diasOrdenados.map(d => Math.max(parseInt(d.page_views), parseInt(d.cliques))), 1);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Menu Boas-Vindas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Analytics dos últimos 30 dias — boasvindas.papelariabibelo.com.br</p>
        </div>
        <a
          href="https://boasvindas.papelariabibelo.com.br"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1.5 text-sm text-pink-600 hover:text-pink-700 font-medium"
        >
          Ver página <ExternalLink size={14} />
        </a>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<Eye size={22} className="text-blue-600" />}
          label="Visualizações"
          value={resumo.views30d.toLocaleString('pt-BR')}
          sub="abriram a página"
          color="bg-blue-50"
        />
        <StatCard
          icon={<MousePointerClick size={22} className="text-pink-600" />}
          label="Cliques em links"
          value={resumo.cliques30d.toLocaleString('pt-BR')}
          sub="clicaram em algo"
          color="bg-pink-50"
        />
        <StatCard
          icon={<TrendingUp size={22} className="text-green-600" />}
          label="Taxa de clique (CTR)"
          value={`${resumo.ctr30d}%`}
          sub={resumo.views30d > 0 ? 'das visitas clicam' : 'aguardando page views'}
          color="bg-green-50"
        />
      </div>

      {/* Cliques por link */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Cliques por link</h2>
        <div className="space-y-3">
          {porLink.length === 0 && <p className="text-sm text-gray-400">Sem dados ainda.</p>}
          {porLink.map(l => {
            const info = LINK_LABELS[l.slug] || { label: l.slug, emoji: '🔗' };
            const pct = Math.round(parseInt(l.cliques) / maxCliques * 100);
            const ctr = resumo.views30d > 0 ? Math.round(parseInt(l.cliques) / resumo.views30d * 100) : 0;
            return (
              <div key={l.slug}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{info.emoji} {info.label}</span>
                  <span className="text-sm text-gray-500">
                    <span className="font-bold text-gray-800">{parseInt(l.cliques).toLocaleString('pt-BR')}</span>
                    {resumo.views30d > 0 && <span className="text-xs text-gray-400 ml-1">({ctr}% CTR)</span>}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-pink-400 to-pink-600 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gráfico por dia */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Visitas e cliques por dia</h2>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-200 inline-block" /> Views</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-pink-400 inline-block" /> Cliques</span>
          </div>
        </div>
        {diasOrdenados.length === 0
          ? <p className="text-sm text-gray-400">Sem dados ainda.</p>
          : (
          <div className="flex items-end gap-1 h-32 overflow-x-auto pb-2">
            {diasOrdenados.map(d => {
              const views   = parseInt(d.page_views) || 0;
              const cliques = parseInt(d.cliques) || 0;
              const hViews  = Math.round(views / maxDia * 100);
              const hClick  = Math.round(cliques / maxDia * 100);
              const label   = d.dia.slice(5); // MM-DD
              return (
                <div key={d.dia} className="flex flex-col items-center gap-0.5 flex-1 min-w-[20px]" title={`${d.dia}\nViews: ${views}\nCliques: ${cliques}`}>
                  <div className="flex items-end gap-0.5 w-full justify-center h-24">
                    <div className="w-2 bg-blue-200 rounded-t transition-all" style={{ height: `${hViews}%` }} />
                    <div className="w-2 bg-pink-400 rounded-t transition-all" style={{ height: `${hClick}%` }} />
                  </div>
                  <span className="text-[9px] text-gray-300 rotate-45 origin-left">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Linha: estados + origens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Top estados */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Top estados</h2>
          </div>
          {porEstado.length === 0
            ? <p className="text-sm text-gray-400">Sem dados ainda.</p>
            : (
            <div className="space-y-2">
              {porEstado.map(e => {
                const maxE = parseInt(porEstado[0].cliques) || 1;
                const pct  = Math.round(parseInt(e.cliques) / maxE * 100);
                return (
                  <div key={e.estado} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-6">{e.estado}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-6 text-right">{e.cliques}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Origens (referers) */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Origem do tráfego</h2>
          </div>
          {porReferer.length === 0
            ? <p className="text-sm text-gray-400">Aguardando page views.</p>
            : (
            <div className="space-y-2">
              {porReferer.map(r => {
                const maxR = parseInt(porReferer[0].visitas) || 1;
                const pct  = Math.round(parseInt(r.visitas) / maxR * 100);
                return (
                  <div key={r.referer} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 w-20 truncate">{r.referer}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 w-6 text-right">{r.visitas}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Horários de pico */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Horário de pico (BRT)</h2>
        </div>
        {porHora.length === 0
          ? <p className="text-sm text-gray-400">Aguardando page views.</p>
          : (
          <div className="flex items-end gap-1 h-16">
            {Array.from({ length: 24 }, (_, h) => {
              const v   = horaMap[h] || 0;
              const pct = Math.round(v / maxHora * 100);
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-0.5" title={`${String(h).padStart(2,'0')}h: ${v} visitas`}>
                  <div
                    className="w-full rounded-t bg-pink-300 transition-all"
                    style={{ height: `${Math.max(pct, 2)}%`, minHeight: v > 0 ? '4px' : '2px', opacity: v > 0 ? 1 : 0.2 }}
                  />
                  {h % 6 === 0 && <span className="text-[9px] text-gray-300">{String(h).padStart(2,'0')}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
