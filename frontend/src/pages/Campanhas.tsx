import { useEffect, useState, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
  Megaphone, Plus, Send, Mail, MessageCircle, ChevronLeft, ChevronRight,
  X, Eye, Trash2, FileText, Users, Pencil, Play, Sparkles,
  CheckCircle2, XCircle, Clock, MapPin, BarChart3,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';

interface Campaign {
  id: string;
  nome: string;
  canal: 'email' | 'whatsapp';
  status: string;
  template_id: string | null;
  segment_id: string | null;
  template_nome?: string;
  segment_nome?: string;
  total_envios: number;
  total_abertos: number;
  total_cliques: number;
  criado_em: string;
  enviado_em?: string;
}

interface Template {
  id: string;
  nome: string;
  canal: string;
  categoria: string;
  assunto: string;
  html: string;
  texto: string;
  ativo: boolean;
  criado_em: string;
}

interface Segment {
  segmento: string;
  total: number;
}

interface SegmentDB {
  id: string;
  nome: string;
}

interface CampanhaDetalhe extends Campaign {
  sends_por_status: Array<{ status: string; total: string }>;
  destinatarios: Array<{
    status: string;
    message_id: string | null;
    enviado_em: string | null;
    aberto_em: string | null;
    clicado_em: string | null;
    customer_id: string;
    nome: string;
    email: string;
    cidade: string | null;
    estado: string | null;
  }>;
}

interface Pagination { page: number; limit: number; total: number; pages: number }

const STATUS_COLORS: Record<string, string> = {
  rascunho: 'bg-bibelo-border text-bibelo-muted',
  agendada: 'bg-blue-500/20 text-blue-400',
  enviando: 'bg-amber-500/20 text-amber-400',
  ativa: 'bg-emerald-500/20 text-emerald-400',
  pausada: 'bg-red-500/20 text-red-400',
  concluida: 'bg-violet-500/20 text-violet-400',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function Campanhas() {
  const { success, error: showError } = useToast();
  const [tab, setTab] = useState<'campanhas' | 'templates'>('campanhas');

  // Campanhas state
  const [campanhas, setCampanhas] = useState<Campaign[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);

  // Templates state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(true);

  // Segments
  const [segments, setSegments] = useState<SegmentDB[]>([]);

  // Modals
  const [showCampModal, setShowCampModal] = useState(false);
  const [showTplModal, setShowTplModal] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<CampanhaDetalhe | null>(null);
  const abrirDetalhe = async (id: string) => {
    try {
      const { data } = await api.get(`/campaigns/${id}`);
      setDetalhe(data);
    } catch { showError('Erro ao carregar detalhe'); }
  };

  // Campaign form
  const [campForm, setCampForm] = useState({
    nome: '', canal: 'email' as 'email' | 'whatsapp', template_id: '', segment_id: '',
  });

  // Template form
  const [tplForm, setTplForm] = useState({
    nome: '', canal: 'email', categoria: '', assunto: '', html: '', texto: '',
  });
  const [editingTplId, setEditingTplId] = useState<string | null>(null);

  // Fetch data
  const fetchCampanhas = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const { data } = await api.get('/campaigns', { params: { page, limit: 20 } });
      setCampanhas(data.data);
      setPagination(data.pagination);
    } catch { setCampanhas([]); }
    finally { setLoading(false); }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoadingTpl(true);
    try {
      const { data } = await api.get('/templates');
      setTemplates(data.data);
    } catch (err) { console.error('Erro ao buscar templates:', err); }
    finally { setLoadingTpl(false); }
  }, []);

  useEffect(() => { fetchCampanhas(1); fetchTemplates(); }, [fetchCampanhas, fetchTemplates]);

  useEffect(() => {
    api.get('/analytics/segments').then(({ data }) => {
      setSegments(data.data.map((s: Segment) => ({ id: s.segmento, nome: s.segmento })));
    }).catch(() => {});
  }, []);

  // Campanha actions
  const handleCreateCampaign = async () => {
    if (!campForm.nome) return;
    setSaving(true);
    try {
      await api.post('/campaigns', {
        ...campForm,
        template_id: campForm.template_id || undefined,
        segment_id: campForm.segment_id || undefined,
      });
      setShowCampModal(false);
      setCampForm({ nome: '', canal: 'email', template_id: '', segment_id: '' });
      fetchCampanhas(1);
      success('Campanha criada');
    } catch { showError('Erro ao criar campanha'); }
    finally { setSaving(false); }
  };

  const handleSendCampaign = async (id: string) => {
    setSending(id);
    try {
      const { data } = await api.post(`/campaigns/${id}/send`);
      success(data.message);
      fetchCampanhas(pagination.page);
    } catch (err: any) {
      showError(err.response?.data?.error || 'Erro ao disparar');
    }
    finally { setSending(null); }
  };

  // Template actions
  const handleSaveTemplate = async () => {
    if (!tplForm.nome || !tplForm.assunto) return;
    setSaving(true);
    try {
      if (editingTplId) {
        await api.put(`/templates/${editingTplId}`, tplForm);
        success('Template atualizado');
      } else {
        await api.post('/templates', tplForm);
        success('Template criado');
      }
      setShowTplModal(false);
      resetTplForm();
      fetchTemplates();
    } catch { showError('Erro ao salvar template'); }
    finally { setSaving(false); }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await api.delete(`/templates/${id}`);
      success('Template removido');
      fetchTemplates();
    } catch { showError('Erro ao remover'); }
  };

  const handleEditTemplate = (t: Template) => {
    setEditingTplId(t.id);
    setTplForm({ nome: t.nome, canal: t.canal, categoria: t.categoria || '', assunto: t.assunto || '', html: t.html || '', texto: t.texto || '' });
    setShowTplModal(true);
  };

  const resetTplForm = () => {
    setTplForm({ nome: '', canal: 'email', categoria: '', assunto: '', html: '', texto: '' });
    setEditingTplId(null);
  };

  const emailTemplates = templates.filter(t => t.canal === 'email');

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Campanhas</h1>
          <p className="text-sm text-bibelo-muted mt-1">Email marketing e comunicação</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('campanhas')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'campanhas' ? 'bg-bibelo-primary text-white' : 'bg-bibelo-card border border-bibelo-border text-bibelo-muted hover:text-bibelo-text'}`}>
            Campanhas
          </button>
          <button onClick={() => setTab('templates')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'templates' ? 'bg-bibelo-primary text-white' : 'bg-bibelo-card border border-bibelo-border text-bibelo-muted hover:text-bibelo-text'}`}>
            Templates
          </button>
        </div>
      </div>

      {tab === 'campanhas' ? (
        <>
          <div className="flex justify-end gap-2 mb-4">
            <button onClick={() => window.location.href = '/campanhas/nova'} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-400 transition-colors">
              <Sparkles size={16} /> Campanha Personalizada
            </button>
            <button onClick={() => setShowCampModal(true)} className="flex items-center gap-2 px-4 py-2 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 transition-colors">
              <Plus size={16} /> Nova Campanha
            </button>
          </div>

          {/* Tabela campanhas */}
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                    <th className="px-4 py-3 font-medium">Campanha</th>
                    <th className="px-4 py-3 font-medium">Canal</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Envios</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">Data</th>
                    <th className="px-4 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b border-bibelo-border/50">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-bibelo-border rounded animate-pulse w-16" /></td>
                        ))}
                      </tr>
                    ))
                  ) : campanhas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-bibelo-muted">
                        <Megaphone size={32} className="mx-auto mb-2 opacity-50" />
                        <p>Nenhuma campanha criada</p>
                      </td>
                    </tr>
                  ) : (
                    campanhas.map((c) => (
                      <tr key={c.id} onClick={() => abrirDetalhe(c.id)} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors cursor-pointer">
                        <td className="px-4 py-3">
                          <p className="text-bibelo-text font-medium">{c.nome}</p>
                          <div className="flex items-center gap-2 text-xs text-bibelo-muted mt-0.5">
                            {c.template_nome && <span className="flex items-center gap-1"><FileText size={10} /> {c.template_nome}</span>}
                            {c.segment_nome && <span className="flex items-center gap-1"><Users size={10} /> {c.segment_nome}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {c.canal === 'email'
                            ? <span className="inline-flex items-center gap-1 text-blue-400 text-xs"><Mail size={13} /> Email</span>
                            : <span className="inline-flex items-center gap-1 text-green-400 text-xs"><MessageCircle size={13} /> WhatsApp</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[c.status] || STATUS_COLORS.rascunho}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-bibelo-text text-right hidden sm:table-cell">
                          {c.total_envios > 0 ? <span className="flex items-center justify-end gap-1"><Send size={12} className="text-bibelo-muted" /> {c.total_envios}</span> : '—'}
                        </td>
                        <td className="px-4 py-3 text-bibelo-muted text-xs hidden sm:table-cell">
                          {fmtDate(c.enviado_em || c.criado_em)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {(c.status === 'concluida' || c.status === 'enviando') && (
                              <button
                                onClick={(e) => { e.stopPropagation(); abrirDetalhe(c.id); }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-bibelo-primary/10 text-bibelo-primary border border-bibelo-primary/20 rounded-lg text-xs hover:bg-bibelo-primary/20 transition-colors"
                              >
                                <Eye size={12} /> Ver
                              </button>
                            )}
                            {(c.status === 'rascunho' || c.status === 'agendada') && c.template_id && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSendCampaign(c.id); }}
                                disabled={sending === c.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 rounded-lg text-xs hover:bg-emerald-400/20 transition-colors disabled:opacity-50"
                              >
                                <Play size={12} /> {sending === c.id ? 'Enviando...' : 'Disparar'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-bibelo-border">
                <p className="text-xs text-bibelo-muted">Página {pagination.page} de {pagination.pages}</p>
                <div className="flex gap-1">
                  <button onClick={() => fetchCampanhas(pagination.page - 1)} disabled={pagination.page <= 1}
                    className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 disabled:opacity-30 transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => fetchCampanhas(pagination.page + 1)} disabled={pagination.page >= pagination.pages}
                    className="p-1.5 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 disabled:opacity-30 transition-colors">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── TEMPLATES ── */
        <>
          <div className="flex justify-end gap-2 mb-4">
            <button
              onClick={async () => {
                try {
                  const { data } = await api.get('/campaigns/gerar-novidades?dias=30&limite=8');
                  if (data.produtos === 0) { showError('Nenhum produto novo nos últimos 30 dias'); return; }
                  resetTplForm();
                  setTplForm(f => ({ ...f, nome: 'Novidades — ' + new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), categoria: 'Novidades', assunto: data.assunto, html: data.html }));
                  setShowTplModal(true);
                  success(`Template gerado com ${data.produtos} produtos!`);
                } catch { showError('Erro ao gerar template'); }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 rounded-lg text-sm font-medium hover:bg-emerald-400/20 transition-colors"
            >
              <Sparkles size={16} /> Gerar com Novidades
            </button>
            <button onClick={() => { resetTplForm(); setShowTplModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 transition-colors">
              <Plus size={16} /> Novo Template
            </button>
          </div>

          {loadingTpl ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-40" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-12 text-center">
              <FileText size={32} className="mx-auto mb-2 text-bibelo-muted opacity-50" />
              <p className="text-bibelo-muted">Nenhum template criado</p>
              <p className="text-xs text-bibelo-muted mt-1">Crie um template de email para usar nas campanhas</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((t) => (
                <div key={t.id} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 group">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-bibelo-text">{t.nome}</p>
                      <p className="text-xs text-bibelo-muted mt-0.5">{t.assunto || 'Sem assunto'}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${t.canal === 'email' ? 'bg-blue-400/10 text-blue-400' : 'bg-green-400/10 text-green-400'}`}>
                      {t.canal}
                    </span>
                  </div>
                  {t.categoria && <p className="text-[10px] text-bibelo-muted mt-2 bg-bibelo-border/30 px-1.5 py-0.5 rounded inline-block">{t.categoria}</p>}

                  {/* Preview snippet */}
                  {t.html && (
                    <div className="mt-3 p-2 bg-bibelo-bg rounded text-[10px] text-bibelo-muted h-16 overflow-hidden" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(t.html.substring(0, 200)) }} />
                  )}

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-bibelo-border">
                    <button onClick={() => setPreviewHtml(t.html || '<p>Sem conteúdo HTML</p>')} className="flex items-center gap-1 text-xs text-bibelo-muted hover:text-bibelo-primary transition-colors">
                      <Eye size={12} /> Preview
                    </button>
                    <button onClick={() => handleEditTemplate(t)} className="flex items-center gap-1 text-xs text-bibelo-muted hover:text-bibelo-primary transition-colors">
                      <Pencil size={12} /> Editar
                    </button>
                    <button onClick={() => handleDeleteTemplate(t.id)} className="flex items-center gap-1 text-xs text-bibelo-muted hover:text-red-400 transition-colors ml-auto">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal Nova Campanha */}
      {showCampModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowCampModal(false)}>
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-bibelo-text">Nova Campanha</h2>
              <button onClick={() => setShowCampModal(false)} className="text-bibelo-muted hover:text-bibelo-text"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Nome da Campanha</label>
                <input type="text" placeholder="Ex: Volta às aulas 2026" value={campForm.nome} onChange={e => setCampForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Canal</label>
                <select value={campForm.canal} onChange={e => setCampForm(f => ({ ...f, canal: e.target.value as 'email' | 'whatsapp' }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary">
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp (em breve)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Template</label>
                <select value={campForm.template_id} onChange={e => setCampForm(f => ({ ...f, template_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary">
                  <option value="">Selecione um template...</option>
                  {emailTemplates.map(t => <option key={t.id} value={t.id}>{t.nome} — {t.assunto}</option>)}
                </select>
                {emailTemplates.length === 0 && <p className="text-xs text-amber-400 mt-1">Crie um template primeiro na aba Templates</p>}
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Segmento (audiência)</label>
                <select value={campForm.segment_id} onChange={e => setCampForm(f => ({ ...f, segment_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary">
                  <option value="">Todos os clientes</option>
                  {segments.map(s => <option key={s.id} value={s.id}>{s.nome} ({s.id})</option>)}
                </select>
              </div>

              <button onClick={handleCreateCampaign} disabled={saving || !campForm.nome}
                className="w-full py-2.5 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 disabled:opacity-50 transition-colors">
                {saving ? 'Criando...' : 'Criar Campanha'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Template */}
      {showTplModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setShowTplModal(false); resetTplForm(); }}>
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-bibelo-text">{editingTplId ? 'Editar Template' : 'Novo Template'}</h2>
              <button onClick={() => { setShowTplModal(false); resetTplForm(); }} className="text-bibelo-muted hover:text-bibelo-text"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Nome</label>
                  <input type="text" placeholder="Ex: Boas-vindas" value={tplForm.nome} onChange={e => setTplForm(f => ({ ...f, nome: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Categoria</label>
                  <input type="text" placeholder="Ex: Promoção, Boas-vindas" value={tplForm.categoria} onChange={e => setTplForm(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Assunto do Email</label>
                <input type="text" placeholder="Ex: Novidades da Papelaria Bibelô!" value={tplForm.assunto} onChange={e => setTplForm(f => ({ ...f, assunto: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">
                  HTML do Email <span className="text-bibelo-muted/50">— use {'{{nome}}'} para personalizar</span>
                </label>
                <textarea
                  value={tplForm.html}
                  onChange={e => setTplForm(f => ({ ...f, html: e.target.value }))}
                  rows={10}
                  placeholder='<h1>Olá {{nome}}!</h1><p>Confira nossas novidades...</p>'
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text font-mono focus:outline-none focus:border-bibelo-primary resize-y"
                />
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Texto alternativo (fallback)</label>
                <textarea value={tplForm.texto} onChange={e => setTplForm(f => ({ ...f, texto: e.target.value }))} rows={3}
                  placeholder="Versão texto puro para clientes sem HTML"
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary resize-y" />
              </div>

              <div className="flex gap-3">
                <button onClick={handleSaveTemplate} disabled={saving || !tplForm.nome || !tplForm.assunto}
                  className="flex-1 py-2.5 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 disabled:opacity-50 transition-colors">
                  {saving ? 'Salvando...' : editingTplId ? 'Salvar Alterações' : 'Criar Template'}
                </button>
                {tplForm.html && (
                  <button onClick={() => setPreviewHtml(tplForm.html)} className="px-4 py-2.5 bg-bibelo-card border border-bibelo-border rounded-lg text-sm text-bibelo-muted hover:text-bibelo-text transition-colors">
                    <Eye size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview HTML */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setPreviewHtml('')}>
          <div className="bg-white rounded-xl w-full max-w-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 bg-gray-100 border-b sticky top-0">
              <p className="text-sm font-medium text-gray-700">Preview do Email</p>
              <button onClick={() => setPreviewHtml('')} className="text-gray-500 hover:text-gray-800"><X size={18} /></button>
            </div>
            <div className="p-6" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }} />
          </div>
        </div>
      )}
      {/* Modal Detalhe Campanha */}
      {detalhe && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDetalhe(null)}>
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-bibelo-border sticky top-0 bg-bibelo-card z-10">
              <div>
                <h2 className="text-lg font-bold text-bibelo-text">{detalhe.nome}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[detalhe.status] || STATUS_COLORS.rascunho}`}>{detalhe.status}</span>
                  {detalhe.enviado_em && <span className="text-xs text-bibelo-muted">{fmtDate(detalhe.enviado_em)}</span>}
                </div>
              </div>
              <button onClick={() => setDetalhe(null)} className="text-bibelo-muted hover:text-bibelo-text"><X size={20} /></button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-4 gap-3 px-6 py-4">
              {[
                { label: 'Enviados', value: detalhe.destinatarios.filter((d) => d.status === 'enviado').length, icon: Send, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
                { label: 'Erros', value: detalhe.destinatarios.filter((d) => d.status === 'erro').length, icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
                { label: 'Abriram', value: detalhe.destinatarios.filter((d) => d.aberto_em).length, icon: Eye, color: 'text-blue-400', bg: 'bg-blue-400/10' },
                { label: 'Clicaram', value: detalhe.destinatarios.filter((d) => d.clicado_em).length, icon: BarChart3, color: 'text-violet-400', bg: 'bg-violet-400/10' },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-bibelo-bg rounded-lg p-3 text-center">
                  <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mx-auto mb-1`}>
                    <kpi.icon size={14} className={kpi.color} />
                  </div>
                  <p className="text-xl font-bold text-bibelo-text">{kpi.value}</p>
                  <p className="text-[10px] text-bibelo-muted">{kpi.label}</p>
                </div>
              ))}
            </div>

            {/* Lista de destinatários */}
            <div className="px-6 pb-6">
              <h3 className="text-sm font-bold text-bibelo-text mb-3 flex items-center gap-2">
                <Users size={14} className="text-bibelo-primary" />
                Destinatarios ({detalhe.destinatarios.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-bibelo-muted border-b border-bibelo-border">
                      <th className="pb-2 pr-3">Status</th>
                      <th className="pb-2 pr-3">Cliente</th>
                      <th className="pb-2 pr-3">Email</th>
                      <th className="pb-2 pr-3 hidden sm:table-cell">Local</th>
                      <th className="pb-2 pr-3">Enviado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.destinatarios.map((d, i) => (
                      <tr key={i} className="border-b border-bibelo-border/50 last:border-0">
                        <td className="py-2 pr-3">
                          {d.status === 'enviado' ? (
                            <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle2 size={12} /> Enviado</span>
                          ) : d.status === 'erro' ? (
                            <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle size={12} /> Erro</span>
                          ) : d.status === 'ignorado' ? (
                            <span className="flex items-center gap-1 text-amber-400 text-xs"><Clock size={12} /> Ignorado</span>
                          ) : (
                            <span className="flex items-center gap-1 text-bibelo-muted text-xs"><Clock size={12} /> {d.status}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-bibelo-text font-medium">{d.nome}</td>
                        <td className="py-2 pr-3 text-bibelo-muted text-xs">{d.email}</td>
                        <td className="py-2 pr-3 text-bibelo-muted text-xs hidden sm:table-cell">
                          {(d.cidade || d.estado) ? (
                            <span className="flex items-center gap-1"><MapPin size={10} /> {[d.cidade, d.estado].filter(Boolean).join('/')}</span>
                          ) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-bibelo-muted text-xs">
                          {d.enviado_em ? new Date(d.enviado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
