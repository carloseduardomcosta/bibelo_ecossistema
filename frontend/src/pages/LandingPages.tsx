import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, Eye, Copy, Trash2, Edit3, ExternalLink,
  BarChart3, MousePointerClick, Users,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';

interface LandingPage {
  id: string;
  slug: string;
  titulo: string;
  subtitulo: string | null;
  imagem_url: string | null;
  cor_primaria: string;
  cor_fundo: string;
  cupom: string | null;
  desconto_texto: string;
  campos: string[];
  cta_texto: string;
  mensagem_sucesso: string;
  redirect_url: string;
  redirect_delay: number;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  ativo: boolean;
  visitas: number;
  capturas: number;
  taxa_conversao: string;
  criado_em: string;
}

const BASE_URL = 'https://webhook.papelariabibelo.com.br/lp';

const emptyForm = {
  slug: '',
  titulo: '',
  subtitulo: '',
  imagem_url: '',
  cor_primaria: '#fe68c4',
  cor_fundo: '#ffe5ec',
  cupom: 'BIBELO10',
  desconto_texto: '10% OFF',
  campos: ['email', 'nome'] as string[],
  cta_texto: 'Quero meu desconto',
  mensagem_sucesso: 'Verifique seu e-mail para ativar o cupom!',
  redirect_url: 'https://www.papelariabibelo.com.br',
  redirect_delay: 5,
  utm_source: '',
  utm_medium: '',
  utm_campaign: '',
  ativo: true,
};

export default function LandingPages() {
  const { success, error: showError } = useToast();
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchPages = useCallback(async () => {
    try {
      const { data } = await api.get('/landing-pages');
      setPages(data.data);
    } catch { showError('Erro ao carregar landing pages'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPages(); }, [fetchPages]);

  const handleSave = async () => {
    if (!form.slug || !form.titulo) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        subtitulo: form.subtitulo || undefined,
        imagem_url: form.imagem_url || undefined,
        cupom: form.cupom || undefined,
        utm_source: form.utm_source || undefined,
        utm_medium: form.utm_medium || undefined,
        utm_campaign: form.utm_campaign || undefined,
      };
      if (editingId) {
        await api.put(`/landing-pages/${editingId}`, payload);
        success('Landing page atualizada');
      } else {
        await api.post('/landing-pages', payload);
        success('Landing page criada');
      }
      setShowModal(false);
      resetForm();
      fetchPages();
    } catch (err: any) {
      showError(err?.response?.data?.error || 'Erro ao salvar');
    }
    finally { setSaving(false); }
  };

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const handleEdit = (p: LandingPage) => {
    setEditingId(p.id);
    setForm({
      slug: p.slug,
      titulo: p.titulo,
      subtitulo: p.subtitulo || '',
      imagem_url: p.imagem_url || '',
      cor_primaria: p.cor_primaria,
      cor_fundo: p.cor_fundo,
      cupom: p.cupom || '',
      desconto_texto: p.desconto_texto,
      campos: Array.isArray(p.campos) ? p.campos : JSON.parse(p.campos as unknown as string),
      cta_texto: p.cta_texto,
      mensagem_sucesso: p.mensagem_sucesso,
      redirect_url: p.redirect_url,
      redirect_delay: p.redirect_delay,
      utm_source: p.utm_source || '',
      utm_medium: p.utm_medium || '',
      utm_campaign: p.utm_campaign || '',
      ativo: p.ativo,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta landing page?')) return;
    try {
      await api.delete(`/landing-pages/${id}`);
      success('Landing page removida');
      fetchPages();
    } catch { showError('Erro ao remover'); }
  };

  const handleToggle = async (p: LandingPage) => {
    try {
      await api.put(`/landing-pages/${p.id}`, { ativo: !p.ativo });
      success(p.ativo ? 'Desativada' : 'Ativada');
      fetchPages();
    } catch { showError('Erro ao atualizar'); }
  };

  const copyUrl = (slug: string) => {
    navigator.clipboard.writeText(`${BASE_URL}/${slug}`);
    success('URL copiada!');
  };

  const toggleCampo = (campo: string) => {
    setForm(f => ({
      ...f,
      campos: f.campos.includes(campo)
        ? f.campos.filter(c => c !== campo)
        : [...f.campos, campo],
    }));
  };

  const totalVisitas = pages.reduce((s, p) => s + p.visitas, 0);
  const totalCapturas = pages.reduce((s, p) => s + p.capturas, 0);
  const taxaGeral = totalVisitas > 0 ? (totalCapturas / totalVisitas * 100).toFixed(1) : '0';

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Landing Pages</h1>
          <p className="text-sm text-bibelo-muted mt-1">Páginas de captura para campanhas de ads</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 transition-colors">
          <Plus size={16} /> Nova Landing Page
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Total Visitas</p>
            <Eye size={14} className="text-blue-400" />
          </div>
          <p className="text-xl font-bold text-bibelo-text">{totalVisitas}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Leads Captados</p>
            <Users size={14} className="text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-400">{totalCapturas}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Taxa Conversão</p>
            <MousePointerClick size={14} className="text-violet-400" />
          </div>
          <p className="text-xl font-bold text-violet-400">{taxaGeral}%</p>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : pages.length === 0 ? (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-12 text-center">
          <p className="text-bibelo-muted">Nenhuma landing page criada</p>
          <p className="text-sm text-bibelo-muted/60 mt-1">Crie uma para usar nos seus anúncios do Instagram/Facebook</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map((p) => (
            <div key={p.id} className={`bg-bibelo-card border rounded-xl p-4 transition-all ${p.ativo ? 'border-bibelo-border' : 'border-bibelo-border/50 opacity-60'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-bibelo-text truncate">{p.titulo}</h3>
                    {!p.ativo && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">Inativa</span>}
                    {p.cupom && <span className="text-[10px] bg-bibelo-primary/20 text-bibelo-primary px-1.5 py-0.5 rounded">{p.cupom}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-bibelo-muted">
                    <span className="font-mono">/lp/{p.slug}</span>
                    <span>·</span>
                    <span>{p.visitas} visitas</span>
                    <span>·</span>
                    <span>{p.capturas} leads</span>
                    <span>·</span>
                    <span className={parseFloat(p.taxa_conversao) >= 5 ? 'text-emerald-400' : parseFloat(p.taxa_conversao) >= 2 ? 'text-amber-400' : 'text-bibelo-muted'}>
                      {p.taxa_conversao}% conversão
                    </span>
                    {p.utm_campaign && <><span>·</span><span>{p.utm_campaign}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => copyUrl(p.slug)} title="Copiar URL" className="p-1.5 text-bibelo-muted hover:text-bibelo-primary rounded transition-colors"><Copy size={14} /></button>
                  <a href={`${BASE_URL}/${p.slug}`} target="_blank" rel="noopener" title="Abrir" className="p-1.5 text-bibelo-muted hover:text-bibelo-primary rounded transition-colors"><ExternalLink size={14} /></a>
                  <button onClick={() => handleEdit(p)} title="Editar" className="p-1.5 text-bibelo-muted hover:text-bibelo-primary rounded transition-colors"><Edit3 size={14} /></button>
                  <button onClick={() => handleToggle(p)} title={p.ativo ? 'Desativar' : 'Ativar'} className={`p-1.5 rounded transition-colors ${p.ativo ? 'text-emerald-400 hover:text-red-400' : 'text-red-400 hover:text-emerald-400'}`}>
                    <BarChart3 size={14} />
                  </button>
                  <button onClick={() => handleDelete(p.id)} title="Remover" className="p-1.5 text-bibelo-muted hover:text-red-400 rounded transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Novo/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-bibelo-text">{editingId ? 'Editar Landing Page' : 'Nova Landing Page'}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-bibelo-muted hover:text-bibelo-text"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              {/* Slug */}
              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Slug (URL)</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-bibelo-muted">/lp/</span>
                  <input type="text" placeholder="dia-das-maes" value={form.slug}
                    onChange={(e) => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    className="flex-1 px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary font-mono" />
                </div>
              </div>

              {/* Título + Subtítulo */}
              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Título</label>
                <input type="text" placeholder="Presente perfeito para a mãe!" value={form.titulo}
                  onChange={(e) => setForm(f => ({ ...f, titulo: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
              </div>
              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Subtítulo</label>
                <input type="text" placeholder="Cadastre-se e ganhe desconto..." value={form.subtitulo}
                  onChange={(e) => setForm(f => ({ ...f, subtitulo: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
              </div>

              {/* Imagem + Cores */}
              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Imagem banner (URL)</label>
                <input type="url" placeholder="https://..." value={form.imagem_url}
                  onChange={(e) => setForm(f => ({ ...f, imagem_url: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Cor primária</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.cor_primaria} onChange={(e) => setForm(f => ({ ...f, cor_primaria: e.target.value }))} className="w-8 h-8 rounded border-0 cursor-pointer" />
                    <input type="text" value={form.cor_primaria} onChange={(e) => setForm(f => ({ ...f, cor_primaria: e.target.value }))}
                      className="flex-1 px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary font-mono" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Cor fundo</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.cor_fundo} onChange={(e) => setForm(f => ({ ...f, cor_fundo: e.target.value }))} className="w-8 h-8 rounded border-0 cursor-pointer" />
                    <input type="text" value={form.cor_fundo} onChange={(e) => setForm(f => ({ ...f, cor_fundo: e.target.value }))}
                      className="flex-1 px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary font-mono" />
                  </div>
                </div>
              </div>

              {/* Cupom + Desconto */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Cupom</label>
                  <input type="text" placeholder="BIBELO10" value={form.cupom}
                    onChange={(e) => setForm(f => ({ ...f, cupom: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Texto desconto</label>
                  <input type="text" placeholder="10% OFF" value={form.desconto_texto}
                    onChange={(e) => setForm(f => ({ ...f, desconto_texto: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
              </div>

              {/* Campos */}
              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Campos do formulário</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 text-sm text-bibelo-text">
                    <input type="checkbox" checked disabled className="accent-bibelo-primary" /> Email
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-bibelo-text cursor-pointer">
                    <input type="checkbox" checked={form.campos.includes('nome')} onChange={() => toggleCampo('nome')} className="accent-bibelo-primary" /> Nome
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-bibelo-text cursor-pointer">
                    <input type="checkbox" checked={form.campos.includes('telefone')} onChange={() => toggleCampo('telefone')} className="accent-bibelo-primary" /> Telefone
                  </label>
                </div>
              </div>

              {/* CTA + Redirect */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Texto do botão</label>
                  <input type="text" value={form.cta_texto}
                    onChange={(e) => setForm(f => ({ ...f, cta_texto: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Redirect (s)</label>
                  <input type="number" min="0" max="30" value={form.redirect_delay}
                    onChange={(e) => setForm(f => ({ ...f, redirect_delay: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
              </div>

              {/* UTMs */}
              <div>
                <label className="block text-xs text-bibelo-muted mb-2">UTM Tracking (para medir nos ads)</label>
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" placeholder="source" value={form.utm_source}
                    onChange={(e) => setForm(f => ({ ...f, utm_source: e.target.value }))}
                    className="px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-xs text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                  <input type="text" placeholder="medium" value={form.utm_medium}
                    onChange={(e) => setForm(f => ({ ...f, utm_medium: e.target.value }))}
                    className="px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-xs text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                  <input type="text" placeholder="campaign" value={form.utm_campaign}
                    onChange={(e) => setForm(f => ({ ...f, utm_campaign: e.target.value }))}
                    className="px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-xs text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
              </div>

              {/* Ativo */}
              <label className="flex items-center gap-2 text-sm text-bibelo-text cursor-pointer">
                <input type="checkbox" checked={form.ativo} onChange={(e) => setForm(f => ({ ...f, ativo: e.target.checked }))} className="accent-bibelo-primary" />
                Landing page ativa
              </label>

              {/* Preview URL */}
              {form.slug && (
                <div className="bg-bibelo-bg border border-bibelo-border rounded-lg p-3">
                  <p className="text-xs text-bibelo-muted mb-1">URL pública:</p>
                  <p className="text-sm text-bibelo-primary font-mono break-all">{BASE_URL}/{form.slug}</p>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving || !form.slug || !form.titulo}
                className="w-full py-2.5 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Landing Page'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
