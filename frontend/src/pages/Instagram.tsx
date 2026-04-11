import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  Instagram, Users, Eye, Heart, Bookmark, Share2, MessageCircle,
  TrendingUp, TrendingDown, RefreshCw, CheckCircle2, AlertTriangle,
  Loader2, ExternalLink, Database, BarChart3, MapPin, UserCircle2,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';

// ── Tipos ─────────────────────────────────────────────────────

interface IgProfile {
  name: string;
  username: string;
  followers_count: number;
  media_count: number;
  biography: string;
  website: string;
}

interface IgStatus {
  connected: boolean;
  profile?: IgProfile;
  ig_user_id?: string;
  ultimo_sync?: string;
  error?: string;
}

interface IgKpis {
  total_impressoes: number;
  total_alcance: number;
  total_visitas: number;
  total_cliques: number;
  seguidores_inicio: number;
  seguidores_fim: number;
  crescimento: number;
  engagement_medio: number;
  total_posts: number;
}

interface IgDiario {
  data: string;
  impressoes: number;
  alcance: number;
  visitas_perfil: number;
  seguidores: number;
  cliques_site: number;
}

interface IgPost {
  ig_media_id: string;
  tipo: string;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  media_url: string | null;
  publicado_em: string;
  curtidas: number;
  comentarios: number;
  compartilhados: number;
  salvamentos: number;
  impressoes: number;
  alcance: number;
  plays: number;
  engagement_rate: number;
}

interface IgAudience {
  snapshot_em: string | null;
  gender_age: Array<{ chave: string; valor: number }>;
  cities: Array<{ chave: string; valor: number }>;
  countries: Array<{ chave: string; valor: number }>;
}

interface SyncStatus {
  ultimo_sync: { criado_em: string; status: string } | null;
  total_dias: number;
  total_posts: number;
  audience_snapshots: number;
}

// ── Helpers ───────────────────────────────────────────────────

type Periodo = '7d' | '15d' | '30d' | '3m' | '6m' | '1a';
type SortPost = 'engagement' | 'alcance' | 'impressoes' | 'salvamentos' | 'recente';

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: '7d',  label: '7 dias'   },
  { value: '15d', label: '15 dias'  },
  { value: '30d', label: '30 dias'  },
  { value: '3m',  label: '3 meses'  },
  { value: '6m',  label: '6 meses'  },
  { value: '1a',  label: '1 ano'    },
];

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('pt-BR');
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtFull(d: string): string {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1)  return 'há menos de 1h';
  if (h < 24) return `há ${h}h`;
  const days = Math.floor(h / 24);
  return `há ${days} dia${days > 1 ? 's' : ''}`;
}

const CHART_COLORS = ['#fe68c4', '#ffe5ec', '#fff7c1', '#2d2d2d', '#a78bfa', '#34d399'];

// ── Componentes auxiliares ────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  color = 'pink',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  trend?: number;
  color?: 'pink' | 'yellow' | 'dark' | 'purple';
}) {
  const colors = {
    pink:   { bg: 'bg-pink-50',   icon: 'text-[#fe68c4]', border: 'border-pink-100'   },
    yellow: { bg: 'bg-yellow-50', icon: 'text-yellow-500', border: 'border-yellow-100' },
    dark:   { bg: 'bg-gray-50',   icon: 'text-gray-700',   border: 'border-gray-100'   },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-500', border: 'border-purple-100' },
  };
  const c = colors[color];

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-4 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <Icon size={16} className={c.icon} />
      </div>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      {(sub || trend != null) && (
        <div className="flex items-center gap-1 text-xs text-gray-500">
          {trend != null && (
            trend >= 0
              ? <TrendingUp size={12} className="text-green-500" />
              : <TrendingDown size={12} className="text-red-400" />
          )}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────

export default function InstagramPage() {
  const [periodo, setPeriodo] = useState<Periodo>('30d');
  const [sortPost, setSortPost] = useState<SortPost>('engagement');
  const [status, setStatus] = useState<IgStatus | null>(null);
  const [kpis, setKpis] = useState<IgKpis | null>(null);
  const [diario, setDiario] = useState<IgDiario[]>([]);
  const [posts, setPosts] = useState<IgPost[]>([]);
  const [audience, setAudience] = useState<IgAudience | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState<'seguidores' | 'alcance' | 'impressoes'>('seguidores');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, ov, p, a, ss] = await Promise.all([
        api.get('/instagram/status'),
        api.get(`/instagram/overview?periodo=${periodo}`),
        api.get(`/instagram/posts?periodo=${periodo}&sort=${sortPost}&limit=20`),
        api.get('/instagram/audience'),
        api.get('/instagram/sync-status'),
      ]);
      setStatus(s.data);
      setKpis(ov.data.kpis);
      setDiario(ov.data.diario || []);
      setPosts(p.data || []);
      setAudience(a.data);
      setSyncStatus(ss.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [periodo, sortPost]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post('/instagram/sync');
      setTimeout(fetchAll, 3000);
    } finally {
      setSyncing(false);
    }
  };

  // ── Render: não conectado ─────────────────────────────────
  if (!loading && status && !status.connected) {
    return (
      <div className="p-6 max-w-md mx-auto mt-20 text-center">
        <AlertTriangle size={40} className="text-yellow-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Instagram não conectado</h2>
        <p className="text-gray-500 text-sm">{status.error}</p>
      </div>
    );
  }

  const profile = status?.profile;

  // ── Dados do gráfico ──────────────────────────────────────
  const chartData = diario.map(d => ({
    data:      fmtDate(d.data),
    seguidores: d.seguidores,
    alcance:    d.alcance,
    impressoes: d.impressoes,
  }));

  // Audiência: formatar gender_age para pie
  const genderMap: Record<string, number> = { F: 0, M: 0, U: 0 };
  (audience?.gender_age || []).forEach(({ chave, valor }) => {
    const gender = chave.split('.')[0];
    if (gender in genderMap) genderMap[gender] += valor;
  });
  const genderData = [
    { name: 'Feminino',  value: genderMap['F'] || 0 },
    { name: 'Masculino', value: genderMap['M'] || 0 },
    { name: 'Outro',     value: genderMap['U'] || 0 },
  ].filter(d => d.value > 0);

  // Faixas etárias
  const faixas: Record<string, number> = {};
  (audience?.gender_age || []).forEach(({ chave, valor }) => {
    const faixa = chave.split('.')[1] || 'n/d';
    faixas[faixa] = (faixas[faixa] || 0) + valor;
  });
  const faixaData = Object.entries(faixas)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => {
      const order = ['13-17','18-24','25-34','35-44','45-54','55-64','65+'];
      return order.indexOf(a.name) - order.indexOf(b.name);
    });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#fe68c4] to-purple-400 flex items-center justify-center">
            <Instagram size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Instagram</h1>
            <p className="text-xs text-gray-500">
              {profile ? `@${profile.username} · ${fmt(profile.followers_count)} seguidores` : 'Carregando...'}
            </p>
          </div>
          {status?.connected && (
            <span className="ml-2 flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-100 rounded-full px-2 py-0.5">
              <CheckCircle2 size={10} /> Conectado
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {syncStatus?.ultimo_sync && (
            <span className="text-xs text-gray-400 hidden md:block">
              Sync {timeAgo(syncStatus.ultimo_sync.criado_em)}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 text-gray-700 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sincronizar
          </button>
        </div>
      </div>

      {/* ── Seletor de período ─────────────────────────────── */}
      <div className="flex gap-1 flex-wrap">
        {PERIODOS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriodo(p.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              periodo === p.value
                ? 'bg-[#fe68c4] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-[#fe68c4]" />
        </div>
      ) : (
        <>
          {/* ── KPI Cards ────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard
              icon={Users}
              label="Seguidores"
              value={fmt(kpis?.seguidores_fim)}
              sub={kpis?.crescimento != null
                ? `${kpis.crescimento >= 0 ? '+' : ''}${fmt(kpis.crescimento)} no período`
                : undefined}
              trend={kpis?.crescimento}
              color="pink"
            />
            <KpiCard
              icon={Eye}
              label="Alcance"
              value={fmt(kpis?.total_alcance)}
              sub="no período"
              color="purple"
            />
            <KpiCard
              icon={BarChart3}
              label="Impressões"
              value={fmt(kpis?.total_impressoes)}
              sub="no período"
              color="yellow"
            />
            <KpiCard
              icon={UserCircle2}
              label="Visitas ao Perfil"
              value={fmt(kpis?.total_visitas)}
              sub="no período"
              color="dark"
            />
            <KpiCard
              icon={TrendingUp}
              label="Engajamento Médio"
              value={kpis?.engagement_medio != null ? `${kpis.engagement_medio}%` : '—'}
              sub={`${fmt(kpis?.total_posts)} posts`}
              color="pink"
            />
          </div>

          {/* ── Gráfico: evolução temporal ────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Evolução no período</h2>
              <div className="flex gap-1">
                {(['seguidores', 'alcance', 'impressoes'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setChartMetric(m)}
                    className={`text-xs px-2 py-1 rounded-md capitalize transition-colors ${
                      chartMetric === m
                        ? 'bg-[#fe68c4] text-white'
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} width={50} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line
                    type="monotone"
                    dataKey={chartMetric}
                    stroke="#fe68c4"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
                <Database size={24} />
                <p className="text-sm">Sem dados ainda — execute um sync para popular o histórico</p>
              </div>
            )}
          </div>

          {/* ── Posts ─────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Posts</h2>
              <select
                value={sortPost}
                onChange={e => setSortPost(e.target.value as SortPost)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600"
              >
                <option value="engagement">Maior engajamento</option>
                <option value="alcance">Maior alcance</option>
                <option value="impressoes">Mais impressões</option>
                <option value="salvamentos">Mais salvamentos</option>
                <option value="recente">Mais recentes</option>
              </select>
            </div>

            {posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
                <Instagram size={24} />
                <p className="text-sm">Nenhum post encontrado no período</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {posts.map(post => (
                  <div key={post.ig_media_id} className="border border-gray-100 rounded-xl overflow-hidden hover:border-pink-200 transition-colors">
                    {/* Thumbnail */}
                    <div className="aspect-square bg-gray-100 relative">
                      {(post.thumbnail_url || post.media_url) ? (
                        <img
                          src={post.thumbnail_url || post.media_url || ''}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Instagram size={24} className="text-gray-300" />
                        </div>
                      )}
                      {/* Badge tipo */}
                      <span className="absolute top-2 left-2 text-[10px] bg-black/60 text-white rounded px-1.5 py-0.5 uppercase font-medium">
                        {post.tipo === 'CAROUSEL_ALBUM' ? 'carrossel' : post.tipo.toLowerCase()}
                      </span>
                      {/* Engagement badge */}
                      <span className="absolute top-2 right-2 text-[10px] bg-[#fe68c4] text-white rounded px-1.5 py-0.5 font-bold">
                        {post.engagement_rate}%
                      </span>
                    </div>

                    {/* Métricas */}
                    <div className="p-3 space-y-2">
                      {post.caption && (
                        <p className="text-xs text-gray-600 line-clamp-2">{post.caption}</p>
                      )}
                      <p className="text-[10px] text-gray-400">{fmtFull(post.publicado_em)}</p>
                      <div className="grid grid-cols-4 gap-1 text-center">
                        <MetricMini icon={Heart}    value={post.curtidas}     label="curtidas" />
                        <MetricMini icon={MessageCircle} value={post.comentarios} label="coment." />
                        <MetricMini icon={Bookmark} value={post.salvamentos}  label="salvos" />
                        <MetricMini icon={Share2}   value={post.compartilhados} label="compart." />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-gray-50">
                        <span>Alcance: {fmt(post.alcance)}</span>
                        {post.permalink && (
                          <a href={post.permalink} target="_blank" rel="noreferrer"
                            className="text-[#fe68c4] flex items-center gap-0.5 hover:underline">
                            Ver <ExternalLink size={8} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Audiência ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Gênero */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                <Users size={14} /> Gênero
              </h3>
              {genderData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie
                        data={genderData}
                        cx="50%" cy="50%"
                        innerRadius={35} outerRadius={60}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {genderData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {genderData.map((d, i) => {
                      const total = genderData.reduce((s, x) => s + x.value, 0);
                      return (
                        <div key={d.name} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i] }} />
                            {d.name}
                          </span>
                          <span className="font-medium text-gray-700">
                            {total > 0 ? Math.round((d.value / total) * 100) : 0}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : <EmptyAudience />}
              {audience?.snapshot_em && (
                <p className="text-[10px] text-gray-400 mt-2">
                  Snapshot de {fmtFull(audience.snapshot_em)}
                </p>
              )}
            </div>

            {/* Faixa etária */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                <BarChart3 size={14} /> Faixa etária
              </h3>
              {faixaData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={faixaData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => fmt(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={42} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="value" fill="#fe68c4" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyAudience />}
            </div>

            {/* Cidades */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                <MapPin size={14} /> Top cidades
              </h3>
              {audience?.cities && audience.cities.length > 0 ? (
                <div className="space-y-2">
                  {audience.cities.slice(0, 8).map((c, i) => {
                    const max = audience.cities[0]?.valor || 1;
                    return (
                      <div key={c.chave} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-700 truncate max-w-[160px]">
                            <span className="text-gray-400 mr-1">#{i + 1}</span>
                            {c.chave}
                          </span>
                          <span className="font-medium text-gray-600 ml-2">{fmt(c.valor)}</span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#fe68c4] rounded-full"
                            style={{ width: `${Math.round((c.valor / max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyAudience />}
            </div>
          </div>

          {/* ── Rodapé sync ────────────────────────────────────── */}
          {syncStatus && (
            <div className="flex flex-wrap gap-4 text-xs text-gray-400 border-t border-gray-100 pt-4">
              <span className="flex items-center gap-1"><Database size={11} /> {syncStatus.total_dias} dias de histórico</span>
              <span className="flex items-center gap-1"><Instagram size={11} /> {syncStatus.total_posts} posts</span>
              <span className="flex items-center gap-1"><Users size={11} /> {syncStatus.audience_snapshots} snapshots de audiência</span>
              {syncStatus.ultimo_sync && (
                <span className="flex items-center gap-1">
                  {syncStatus.ultimo_sync.status === 'ok'
                    ? <CheckCircle2 size={11} className="text-green-500" />
                    : <AlertTriangle size={11} className="text-yellow-400" />}
                  Último sync: {timeAgo(syncStatus.ultimo_sync.criado_em)}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────

function MetricMini({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon size={10} className="text-gray-400" />
      <span className="text-[10px] font-medium text-gray-700">{fmt(value)}</span>
      <span className="text-[9px] text-gray-400 hidden">{label}</span>
    </div>
  );
}

function EmptyAudience() {
  return (
    <div className="flex flex-col items-center justify-center h-36 text-gray-300 gap-2">
      <Database size={20} />
      <p className="text-xs text-center">Sync de domingo popula os dados de audiência</p>
    </div>
  );
}
