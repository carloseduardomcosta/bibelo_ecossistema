import { useState, useEffect } from 'react';
import api from '../lib/api';
import { formatCurrency } from '../lib/format';
import { MessageCircle, Copy, Check, ExternalLink, RefreshCw, Package, Tag } from 'lucide-react';

interface Produto {
  id: string;
  bling_id: string;
  nome: string;
  sku: string | null;
  preco_venda: number;
  imagem_url: string;
  descricao: string;
  categoria: string | null;
  estoque: number;
  nf_numero: string;
  nf_data: string;
}

interface NovidadesResponse {
  novidades: Produto[];
  total: number;
  nf_numero: string | null;
  atualizado_em: string;
}

const STOREFRONT_BASE = 'https://www.papelariabibelo.com.br';

function buildShareLink(nfNumero: string | null): string {
  const utm = `utm_source=whatsapp&utm_medium=grupo_vip&utm_campaign=novidades${nfNumero ? `_nf${nfNumero}` : ''}`;
  return `${STOREFRONT_BASE}/novidades?${utm}`;
}

function buildMessage(link: string): string {
  return `🆕 Novidades chegaram na Bibelô! Confira os lançamentos: ${link}`;
}

export default function CatalogoWhatsApp() {
  const [data, setData] = useState<NovidadesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const fetchCatalogo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<NovidadesResponse>('/public/novidades?limit=50');
      setData(res.data);
    } catch {
      setError('Erro ao carregar catálogo. Verifique se há NFs sincronizadas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCatalogo(); }, []);

  const shareLink = buildShareLink(data?.nf_numero ?? null);
  const message = buildMessage(shareLink);
  const whatsappUrl = `https://web.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  const copyToClipboard = async (text: string, type: 'link' | 'msg') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      } else {
        setCopiedMsg(true);
        setTimeout(() => setCopiedMsg(false), 2500);
      }
    } catch {
      // fallback para navegadores sem clipboard API
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      if (type === 'link') { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2500); }
      else { setCopiedMsg(true); setTimeout(() => setCopiedMsg(false), 2500); }
    }
  };

  const nfData = data?.novidades[0]?.nf_data
    ? new Date(data.novidades[0].nf_data).toLocaleDateString('pt-BR')
    : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Catálogo WhatsApp</h1>
          <p className="text-sm text-bibelo-muted mt-0.5">
            Produtos da última NF — pronto para compartilhar no grupo VIP
          </p>
        </div>
        <button
          onClick={fetchCatalogo}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Status da NF */}
      {!loading && data && data.total > 0 && (
        <div className="flex items-center gap-4 px-4 py-3 bg-emerald-400/10 border border-emerald-400/20 rounded-xl text-sm">
          <Package size={16} className="text-emerald-400 shrink-0" />
          <span className="text-emerald-400 font-medium">
            NF #{data.nf_numero}
            {nfData && <span className="text-emerald-400/70 font-normal ml-2">· {nfData}</span>}
          </span>
          <span className="text-emerald-400/70">·</span>
          <span className="text-emerald-400/70">{data.total} produto{data.total !== 1 ? 's' : ''} com estoque</span>
        </div>
      )}

      {/* Painel de compartilhamento */}
      {!loading && data && data.total > 0 && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-bibelo-muted uppercase tracking-wider">Mensagem pronta</p>

          {/* Preview da mensagem */}
          <div className="bg-[#075e54]/10 border border-[#075e54]/20 rounded-xl px-4 py-3">
            <p className="text-sm text-bibelo-text whitespace-pre-wrap break-all">{message}</p>
          </div>

          {/* Botões de ação */}
          <div className="flex flex-wrap gap-2">
            {/* Copiar mensagem completa */}
            <button
              onClick={() => copyToClipboard(message, 'msg')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                copiedMsg
                  ? 'bg-emerald-400/20 text-emerald-400'
                  : 'bg-bibelo-primary text-white hover:bg-bibelo-primary/90'
              }`}
            >
              {copiedMsg ? <Check size={15} /> : <Copy size={15} />}
              {copiedMsg ? 'Copiado!' : 'Copiar mensagem'}
            </button>

            {/* Abrir WhatsApp Web */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#25d366] text-white hover:bg-[#1ebe5d] transition-colors"
            >
              <MessageCircle size={15} />
              Abrir WhatsApp Web
            </a>

            {/* Copiar só o link */}
            <button
              onClick={() => copyToClipboard(shareLink, 'link')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                copiedLink
                  ? 'bg-emerald-400/20 text-emerald-400'
                  : 'bg-bibelo-border/80 text-bibelo-muted hover:text-bibelo-text'
              }`}
            >
              {copiedLink ? <Check size={15} /> : <Copy size={15} />}
              {copiedLink ? 'Link copiado!' : 'Só o link'}
            </button>

            {/* Ver página no storefront */}
            <a
              href={shareLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-bibelo-border/80 text-bibelo-muted hover:text-bibelo-text transition-colors"
            >
              <ExternalLink size={15} />
              Ver página
            </a>
          </div>
        </div>
      )}

      {/* Estados: loading / erro / vazio */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden animate-pulse">
              <div className="aspect-square bg-bibelo-border/50" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-bibelo-border/50 rounded w-3/4" />
                <div className="h-4 bg-bibelo-border/50 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-16">
          <Package size={40} className="mx-auto mb-3 text-bibelo-muted/40" />
          <p className="text-bibelo-muted">{error}</p>
          <button onClick={fetchCatalogo} className="mt-4 px-4 py-2 bg-bibelo-primary text-white rounded-lg text-sm">
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !error && data?.total === 0 && (
        <div className="text-center py-16">
          <Package size={40} className="mx-auto mb-3 text-bibelo-muted/40" />
          <p className="text-bibelo-muted">Nenhum produto válido na NF mais recente.</p>
          <p className="text-sm text-bibelo-muted/60 mt-1">Sincronize uma NF de entrada para gerar o catálogo.</p>
        </div>
      )}

      {/* Grade de produtos */}
      {!loading && !error && data && data.total > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-bibelo-muted uppercase tracking-wider">
              {data.total} produto{data.total !== 1 ? 's' : ''} no catálogo
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.novidades.map((p) => (
              <div
                key={p.id}
                className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden hover:border-bibelo-primary/30 transition-colors group"
              >
                {/* Foto */}
                <div className="aspect-square bg-bibelo-border/20 overflow-hidden">
                  <img
                    src={p.imagem_url}
                    alt={p.nome}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23333"/><text x="50%" y="50%" font-size="12" fill="%23666" text-anchor="middle" dy=".3em">sem foto</text></svg>';
                    }}
                  />
                </div>

                {/* Info */}
                <div className="p-3 space-y-1.5">
                  {p.categoria && (
                    <div className="flex items-center gap-1">
                      <Tag size={10} className="text-bibelo-primary/70" />
                      <span className="text-[10px] text-bibelo-primary/70 uppercase tracking-wider truncate">
                        {p.categoria}
                      </span>
                    </div>
                  )}
                  <p className="text-sm font-medium text-bibelo-text leading-tight line-clamp-2">{p.nome}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-bibelo-primary">
                      {formatCurrency(p.preco_venda)}
                    </span>
                    <span className="text-[10px] text-bibelo-muted">
                      {p.estoque > 0 ? `${p.estoque} un.` : 'Esgotado'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
