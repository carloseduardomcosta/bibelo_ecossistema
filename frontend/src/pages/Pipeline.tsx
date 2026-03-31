import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, DollarSign, Target, TrendingUp,
  User, Calendar, Trash2, Edit3,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../lib/format';

interface Deal {
  id: string;
  customer_id: string;
  titulo: string;
  valor: string;
  etapa: string;
  origem: string;
  probabilidade: number;
  fechamento_previsto: string | null;
  notas: string | null;
  cliente_nome: string;
  cliente_email: string | null;
  cliente_telefone: string | null;
  criado_em: string;
}

interface KanbanData {
  kanban: Record<string, Deal[]>;
  kpis: { total_deals: number; valor_total: number; valor_ponderado: number };
  etapas: string[];
}

interface Cliente {
  id: string;
  nome: string;
}

const ETAPA_CONFIG: Record<string, { label: string; cor: string; emoji: string }> = {
  prospeccao: { label: 'Prospecção', cor: 'border-t-violet-400', emoji: '🔍' },
  contato: { label: 'Contato', cor: 'border-t-blue-400', emoji: '📞' },
  proposta: { label: 'Proposta', cor: 'border-t-amber-400', emoji: '📋' },
  negociacao: { label: 'Negociação', cor: 'border-t-orange-400', emoji: '🤝' },
  fechado_ganho: { label: 'Ganho', cor: 'border-t-emerald-400', emoji: '🎉' },
  fechado_perdido: { label: 'Perdido', cor: 'border-t-red-400', emoji: '❌' },
};

export default function Pipeline() {
  const { success, error: showError } = useToast();
  const [data, setData] = useState<KanbanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_id: '',
    titulo: '',
    valor: '',
    etapa: 'prospeccao',
    probabilidade: '50',
    fechamento_previsto: '',
    notas: '',
    origem: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchKanban = useCallback(async () => {
    try {
      const { data } = await api.get('/deals/kanban');
      setData(data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchKanban(); }, [fetchKanban]);

  // Buscar clientes para o form
  useEffect(() => {
    if (clienteSearch.length >= 2) {
      api.get('/customers', { params: { search: clienteSearch, limit: 10 } })
        .then(({ data }) => setClientes(data.data))
        .catch(() => {});
    }
  }, [clienteSearch]);

  const handleSave = async () => {
    if (!form.customer_id || !form.titulo) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        valor: parseFloat(form.valor) || 0,
        probabilidade: parseInt(form.probabilidade) || 50,
        fechamento_previsto: form.fechamento_previsto || undefined,
        notas: form.notas || undefined,
        origem: form.origem || undefined,
      };
      if (editingId) {
        await api.put(`/deals/${editingId}`, payload);
        success('Deal atualizado');
      } else {
        await api.post('/deals', payload);
        success('Deal criado');
      }
      setShowModal(false);
      resetForm();
      fetchKanban();
    } catch { showError('Erro ao salvar deal'); }
    finally { setSaving(false); }
  };

  const resetForm = () => {
    setForm({ customer_id: '', titulo: '', valor: '', etapa: 'prospeccao', probabilidade: '50', fechamento_previsto: '', notas: '', origem: '' });
    setEditingId(null);
    setClienteSearch('');
  };

  const handleEdit = (deal: Deal) => {
    setEditingId(deal.id);
    setForm({
      customer_id: deal.customer_id,
      titulo: deal.titulo,
      valor: parseFloat(deal.valor).toString(),
      etapa: deal.etapa,
      probabilidade: deal.probabilidade.toString(),
      fechamento_previsto: deal.fechamento_previsto?.split('T')[0] || '',
      notas: deal.notas || '',
      origem: deal.origem || '',
    });
    setClienteSearch(deal.cliente_nome);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/deals/${id}`);
      success('Deal removido');
      fetchKanban();
    } catch { showError('Erro ao remover'); }
  };

  // Drag & Drop
  const handleDragStart = (dealId: string) => setDragging(dealId);

  const handleDrop = async (etapa: string) => {
    if (!dragging) return;
    setDragging(null);
    try {
      await api.patch(`/deals/${dragging}/etapa`, { etapa });
      fetchKanban();
    } catch { showError('Erro ao mover deal'); }
  };

  const openNew = () => { resetForm(); setShowModal(true); };

  const visibleEtapas = (data?.etapas || []).filter(e => e !== 'fechado_perdido');

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Pipeline</h1>
          <p className="text-sm text-bibelo-muted mt-1">Negociações em andamento</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 transition-colors">
          <Plus size={16} /> Novo Deal
        </button>
      </div>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-bibelo-muted">Deals Ativos</p>
              <Target size={14} className="text-violet-400" />
            </div>
            <p className="text-xl font-bold text-bibelo-text">{data.kpis.total_deals}</p>
          </div>
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-bibelo-muted">Valor Total</p>
              <DollarSign size={14} className="text-emerald-400" />
            </div>
            <p className="text-xl font-bold text-emerald-400">{formatCurrency(data.kpis.valor_total)}</p>
          </div>
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-bibelo-muted">Valor Ponderado</p>
              <TrendingUp size={14} className="text-amber-400" />
            </div>
            <p className="text-xl font-bold text-amber-400">{formatCurrency(data.kpis.valor_ponderado)}</p>
          </div>
        </div>
      )}

      {/* Kanban */}
      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 bg-bibelo-card border border-bibelo-border rounded-xl p-4 animate-pulse h-64" />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {visibleEtapas.map((etapa) => {
            const cfg = ETAPA_CONFIG[etapa] || { label: etapa, cor: 'border-t-bibelo-border', emoji: '📌' };
            const deals = data?.kanban[etapa] || [];
            const total = deals.reduce((s, d) => s + parseFloat(d.valor || '0'), 0);

            return (
              <div
                key={etapa}
                className={`w-72 shrink-0 bg-bibelo-bg border border-bibelo-border rounded-xl border-t-2 ${cfg.cor} flex flex-col max-h-[70vh]`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(etapa)}
              >
                {/* Column header */}
                <div className="px-3 py-2.5 border-b border-bibelo-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-bibelo-text">
                      {cfg.emoji} {cfg.label}
                    </span>
                    <span className="text-xs bg-bibelo-border/50 text-bibelo-muted px-1.5 py-0.5 rounded">
                      {deals.length}
                    </span>
                  </div>
                  {total > 0 && <p className="text-xs text-bibelo-muted mt-0.5">{formatCurrency(total)}</p>}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {deals.map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => handleDragStart(deal.id)}
                      className="bg-bibelo-card border border-bibelo-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-bibelo-primary/30 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-sm font-medium text-bibelo-text leading-tight">{deal.titulo}</p>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => handleEdit(deal)} className="p-1 text-bibelo-muted hover:text-bibelo-primary"><Edit3 size={12} /></button>
                          <button onClick={() => handleDelete(deal.id)} className="p-1 text-bibelo-muted hover:text-red-400"><Trash2 size={12} /></button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <User size={11} className="text-bibelo-muted" />
                        <span className="text-xs text-bibelo-muted truncate">{deal.cliente_nome}</span>
                      </div>
                      {parseFloat(deal.valor) > 0 && (
                        <p className="text-sm font-bold text-emerald-400 mt-1.5">{formatCurrency(deal.valor)}</p>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-bibelo-muted">{deal.probabilidade}% chance</span>
                        {deal.fechamento_previsto && (
                          <span className="text-[10px] text-bibelo-muted flex items-center gap-0.5">
                            <Calendar size={9} />
                            {new Date(deal.fechamento_previsto + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  {deals.length === 0 && (
                    <div className="text-center py-6 text-bibelo-muted/40">
                      <p className="text-xs">Arraste deals aqui</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Novo/Editar Deal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-bibelo-text">{editingId ? 'Editar Deal' : 'Novo Deal'}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-bibelo-muted hover:text-bibelo-text"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Cliente</label>
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={clienteSearch}
                  onChange={(e) => { setClienteSearch(e.target.value); setForm(f => ({ ...f, customer_id: '' })); }}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
                />
                {clientes.length > 0 && !form.customer_id && clienteSearch.length >= 2 && (
                  <div className="mt-1 bg-bibelo-bg border border-bibelo-border rounded-lg max-h-32 overflow-y-auto">
                    {clientes.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setForm(f => ({ ...f, customer_id: c.id })); setClienteSearch(c.nome); setClientes([]); }}
                        className="block w-full text-left px-3 py-1.5 text-sm text-bibelo-text hover:bg-bibelo-border/30"
                      >
                        {c.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Título</label>
                <input type="text" placeholder="Ex: Venda kit escolar" value={form.titulo} onChange={(e) => setForm(f => ({ ...f, titulo: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Valor (R$)</label>
                  <input type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={(e) => setForm(f => ({ ...f, valor: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Probabilidade (%)</label>
                  <input type="number" min="0" max="100" value={form.probabilidade} onChange={(e) => setForm(f => ({ ...f, probabilidade: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Etapa</label>
                  <select value={form.etapa} onChange={(e) => setForm(f => ({ ...f, etapa: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary">
                    {Object.entries(ETAPA_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Fechamento previsto</label>
                  <input type="date" value={form.fechamento_previsto} onChange={(e) => setForm(f => ({ ...f, fechamento_previsto: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Origem</label>
                <input type="text" placeholder="Ex: Instagram, Loja, Indicação" value={form.origem} onChange={(e) => setForm(f => ({ ...f, origem: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Observações</label>
                <textarea placeholder="Notas sobre a negociação..." value={form.notas} onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary resize-none" />
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !form.customer_id || !form.titulo}
                className="w-full py-2.5 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Deal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
