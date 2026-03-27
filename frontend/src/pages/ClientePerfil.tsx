import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, Instagram, Calendar, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../lib/api';

interface CustomerFull {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  cpf?: string;
  data_nasc?: string;
  canal_origem?: string;
  instagram?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  bling_id?: string;
  nuvemshop_id?: string;
  criado_em: string;
  score?: {
    score: number;
    ltv: number;
    segmento: string;
    risco_churn: number;
  };
  recentInteractions: Array<{
    id: string;
    tipo: string;
    descricao: string;
    criado_em: string;
  }>;
}

interface TimelineEntry {
  id: string;
  tipo: string;
  descricao: string;
  criado_em: string;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(date: string) {
  return format(new Date(date), "dd MMM yyyy", { locale: ptBR });
}

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  compra: { label: 'Compra', color: 'bg-emerald-500/20 text-emerald-400' },
  email: { label: 'E-mail', color: 'bg-blue-500/20 text-blue-400' },
  whatsapp: { label: 'WhatsApp', color: 'bg-green-500/20 text-green-400' },
  visita: { label: 'Visita', color: 'bg-violet-500/20 text-violet-400' },
  ligacao: { label: 'Ligacao', color: 'bg-amber-500/20 text-amber-400' },
};

export default function ClientePerfil() {
  const { id } = useParams<{ id: string }>();
  const [cliente, setCliente] = useState<CustomerFull | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.get(`/customers/${id}`),
      api.get(`/customers/${id}/timeline`),
    ])
      .then(([custRes, timeRes]) => {
        setCliente(custRes.data);
        setTimeline(timeRes.data.data);
      })
      .catch((err) => {
        if (err.response?.status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 bg-bibelo-border rounded animate-pulse" />
        <div className="h-48 bg-bibelo-card border border-bibelo-border rounded-xl animate-pulse" />
      </div>
    );
  }

  if (notFound || !cliente) {
    return (
      <div className="text-center py-16">
        <p className="text-bibelo-muted mb-4">Cliente nao encontrado</p>
        <Link to="/clientes" className="text-bibelo-primary hover:underline text-sm">Voltar para lista</Link>
      </div>
    );
  }

  const score = cliente.score;

  return (
    <div>
      {/* Back */}
      <Link to="/clientes" className="inline-flex items-center gap-1.5 text-sm text-bibelo-muted hover:text-bibelo-text mb-4 transition-colors">
        <ArrowLeft size={16} />
        Voltar
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">{cliente.nome}</h1>
          <p className="text-sm text-bibelo-muted mt-0.5">
            Cliente desde {formatDate(cliente.criado_em)}
            {cliente.canal_origem && ` · via ${cliente.canal_origem}`}
          </p>
        </div>
        {score && (
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-bibelo-primary">{score.score}</p>
              <p className="text-xs text-bibelo-muted">Score</p>
            </div>
            <div className="w-px h-10 bg-bibelo-border" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-400">{formatCurrency(score.ltv)}</p>
              <p className="text-xs text-bibelo-muted">LTV</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Info Card */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-medium text-bibelo-muted">Informacoes</h2>

          {cliente.email && (
            <div className="flex items-center gap-2.5 text-sm">
              <Mail size={15} className="text-bibelo-muted shrink-0" />
              <span className="text-bibelo-text truncate">{cliente.email}</span>
            </div>
          )}
          {cliente.telefone && (
            <div className="flex items-center gap-2.5 text-sm">
              <Phone size={15} className="text-bibelo-muted shrink-0" />
              <span className="text-bibelo-text">{cliente.telefone}</span>
            </div>
          )}
          {(cliente.cidade || cliente.estado) && (
            <div className="flex items-center gap-2.5 text-sm">
              <MapPin size={15} className="text-bibelo-muted shrink-0" />
              <span className="text-bibelo-text">
                {[cliente.cidade, cliente.estado].filter(Boolean).join('/')}
                {cliente.cep && ` — ${cliente.cep}`}
              </span>
            </div>
          )}
          {cliente.instagram && (
            <div className="flex items-center gap-2.5 text-sm">
              <Instagram size={15} className="text-bibelo-muted shrink-0" />
              <span className="text-bibelo-text">@{cliente.instagram.replace('@', '')}</span>
            </div>
          )}
          {cliente.data_nasc && (
            <div className="flex items-center gap-2.5 text-sm">
              <Calendar size={15} className="text-bibelo-muted shrink-0" />
              <span className="text-bibelo-text">{formatDate(cliente.data_nasc)}</span>
            </div>
          )}

          {/* Score details */}
          {score && (
            <div className="pt-3 border-t border-bibelo-border space-y-2">
              <h3 className="text-sm font-medium text-bibelo-muted flex items-center gap-1.5">
                <TrendingUp size={14} /> Metricas
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-bibelo-bg rounded-lg p-2.5 text-center">
                  <p className="text-bibelo-muted">Segmento</p>
                  <p className="text-bibelo-text font-medium mt-0.5 capitalize">{score.segmento}</p>
                </div>
                <div className="bg-bibelo-bg rounded-lg p-2.5 text-center">
                  <p className="text-bibelo-muted">Risco Churn</p>
                  <p className={`font-medium mt-0.5 ${score.risco_churn >= 0.7 ? 'text-red-400' : score.risco_churn >= 0.4 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {(score.risco_churn * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* IDs externos */}
          {(cliente.bling_id || cliente.nuvemshop_id) && (
            <div className="pt-3 border-t border-bibelo-border space-y-1 text-xs text-bibelo-muted">
              {cliente.bling_id && <p>Bling: {cliente.bling_id}</p>}
              {cliente.nuvemshop_id && <p>NuvemShop: {cliente.nuvemshop_id}</p>}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4">Timeline</h2>

          {timeline.length === 0 && cliente.recentInteractions.length === 0 ? (
            <p className="text-bibelo-muted text-sm py-8 text-center">Nenhuma interacao registrada</p>
          ) : (
            <div className="space-y-3">
              {(timeline.length > 0 ? timeline : cliente.recentInteractions).map((entry) => {
                const tipo = TIPO_LABELS[entry.tipo] || { label: entry.tipo, color: 'bg-bibelo-border text-bibelo-muted' };
                return (
                  <div key={entry.id} className="flex items-start gap-3 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 mt-0.5 ${tipo.color}`}>
                      {tipo.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-bibelo-text">{entry.descricao}</p>
                      <p className="text-xs text-bibelo-muted mt-0.5">{formatDate(entry.criado_em)}</p>
                    </div>
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
