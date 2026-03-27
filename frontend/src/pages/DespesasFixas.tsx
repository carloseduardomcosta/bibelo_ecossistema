import { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, CalendarClock, DollarSign,
  ChevronLeft, ChevronRight, Bell, BellOff, Plus, X, Check,
} from 'lucide-react';
import api from '../lib/api';

interface DespesaFixa {
  id: string;
  descricao: string;
  valor: string;
  dia_vencimento: number;
  categoria_nome: string;
  categoria_cor: string;
  categoria_icone: string;
  pagamento_id: string | null;
  pagamento_status: string | null;
  data_pagamento: string | null;
  valor_pago: string | null;
  alerta: 'pago' | 'atrasado' | 'vence_em_breve' | 'pendente';
}

interface Resumo {
  atrasados: number;
  vence_em_breve: number;
  pagos: number;
  pendentes: number;
  total: number;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getMesLabel(mesRef: string) {
  const d = new Date(mesRef + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export default function DespesasFixas() {
  const [alertas, setAlertas] = useState<DespesaFixa[]>([]);
  const [resumo, setResumo] = useState<Resumo>({ atrasados: 0, vence_em_breve: 0, pagos: 0, pendentes: 0, total: 0 });
  const [_mesRef, setMesRef] = useState('');
  const [loading, setLoading] = useState(true);
  const [mesNavegacao, setMesNavegacao] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [pagando, setPagando] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    descricao: '',
    categoria_id: '',
    valor: '',
    dia_vencimento: '',
    observacoes: '',
  });

  const fetchAlertas = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/financeiro/despesas-fixas/alertas');
      setAlertas(data.data);
      setResumo(data.resumo);
      setMesRef(data.mes_referencia);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAlertas(); }, [fetchAlertas]);

  useEffect(() => {
    api.get('/financeiro/categorias').then(({ data }) => setCategorias(data.data.filter((c: Categoria) => c.tipo === 'despesa'))).catch(() => {});
  }, []);

  const fetchPagamentos = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/financeiro/despesas-fixas/pagamentos?mes=${mesNavegacao}`);
      const items: DespesaFixa[] = data.data.map((r: any) => ({
        ...r,
        id: r.despesa_fixa_id,
        valor: r.valor_esperado,
        alerta: r.status === 'pago' ? 'pago' : 'pendente',
      }));
      setAlertas(items);
      setMesRef(data.mes_referencia);
    } catch {}
    finally { setLoading(false); }
  }, [mesNavegacao]);

  const handlePagar = async (id: string) => {
    setPagando(id);
    try {
      await api.post(`/financeiro/despesas-fixas/${id}/pagar`, { mes_referencia: mesNavegacao });
      fetchAlertas();
    } catch {}
    finally { setPagando(null); }
  };

  const handleDesfazer = async (id: string) => {
    setPagando(id);
    try {
      await api.post(`/financeiro/despesas-fixas/${id}/desfazer-pagamento`, { mes_referencia: mesNavegacao });
      fetchAlertas();
    } catch {}
    finally { setPagando(null); }
  };

  const handleNavMes = (delta: number) => {
    const [y, m] = mesNavegacao.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const novoMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setMesNavegacao(novoMes);
  };

  useEffect(() => {
    fetchPagamentos();
  }, [fetchPagamentos]);

  const totalMensal = alertas.reduce((s, a) => s + parseFloat(a.valor), 0);
  const totalPago = alertas.filter(a => a.alerta === 'pago').reduce((s, a) => s + parseFloat(a.valor_pago || a.valor), 0);
  const totalPendente = totalMensal - totalPago;

  const handleSaveNew = async () => {
    if (!formData.descricao || !formData.categoria_id || !formData.valor || !formData.dia_vencimento) return;
    setSaving(true);
    try {
      await api.post('/financeiro/despesas-fixas', {
        ...formData,
        valor: parseFloat(formData.valor),
        dia_vencimento: parseInt(formData.dia_vencimento),
      });
      setShowModal(false);
      setFormData({ descricao: '', categoria_id: '', valor: '', dia_vencimento: '', observacoes: '' });
      fetchAlertas();
    } catch {}
    finally { setSaving(false); }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Despesas Fixas</h1>
          <p className="text-sm text-bibelo-muted mt-1">Controle de vencimentos e pagamentos mensais</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 transition-colors"
        >
          <Plus size={16} />
          Nova Despesa Fixa
        </button>
      </div>

      {/* Navegação mensal */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => handleNavMes(-1)} className="p-2 rounded-lg bg-bibelo-card border border-bibelo-border text-bibelo-muted hover:text-bibelo-text transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <p className="text-lg font-bold text-bibelo-text capitalize">{getMesLabel(mesNavegacao + '-01')}</p>
        </div>
        <button onClick={() => handleNavMes(1)} className="p-2 rounded-lg bg-bibelo-card border border-bibelo-border text-bibelo-muted hover:text-bibelo-text transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Total Mensal</p>
            <DollarSign size={16} className="text-bibelo-primary" />
          </div>
          <p className="text-lg font-bold text-bibelo-text">{fmt(totalMensal)}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Pago</p>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <p className="text-lg font-bold text-emerald-400">{fmt(totalPago)}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Pendente</p>
            <Clock size={16} className="text-amber-400" />
          </div>
          <p className="text-lg font-bold text-amber-400">{fmt(totalPendente)}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Itens</p>
            <CalendarClock size={16} className="text-blue-400" />
          </div>
          <p className="text-lg font-bold text-bibelo-text">
            {alertas.filter(a => a.alerta === 'pago').length}/{alertas.length}
            <span className="text-sm font-normal text-bibelo-muted ml-1">pagos</span>
          </p>
        </div>
      </div>

      {/* Alertas */}
      {(resumo.atrasados > 0 || resumo.vence_em_breve > 0) && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-6 ${
          resumo.atrasados > 0 ? 'bg-red-400/10 border border-red-400/20' : 'bg-amber-400/10 border border-amber-400/20'
        }`}>
          <AlertTriangle size={18} className={resumo.atrasados > 0 ? 'text-red-400' : 'text-amber-400'} />
          <p className="text-sm text-bibelo-text">
            {resumo.atrasados > 0 && <><strong className="text-red-400">{resumo.atrasados} atrasada{resumo.atrasados > 1 ? 's' : ''}</strong> </>}
            {resumo.atrasados > 0 && resumo.vence_em_breve > 0 && ' e '}
            {resumo.vence_em_breve > 0 && <><strong className="text-amber-400">{resumo.vence_em_breve} vence{resumo.vence_em_breve > 1 ? 'm' : ''} em breve</strong></>}
          </p>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-bibelo-card border border-bibelo-border rounded-xl p-4 animate-pulse h-20" />
          ))
        ) : alertas.length === 0 ? (
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-12 text-center">
            <BellOff size={32} className="mx-auto mb-2 text-bibelo-muted opacity-50" />
            <p className="text-bibelo-muted">Nenhuma despesa fixa cadastrada</p>
          </div>
        ) : (
          alertas.map((df) => {
            const isPago = df.alerta === 'pago';
            const isAtrasado = df.alerta === 'atrasado';
            const isVenceEmBreve = df.alerta === 'vence_em_breve';

            return (
              <div
                key={df.id}
                className={`bg-bibelo-card border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors ${
                  isPago ? 'border-emerald-400/20 opacity-70' :
                  isAtrasado ? 'border-red-400/30' :
                  isVenceEmBreve ? 'border-amber-400/30' :
                  'border-bibelo-border'
                }`}
              >
                {/* Status icon */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  isPago ? 'bg-emerald-400/20' :
                  isAtrasado ? 'bg-red-400/20' :
                  isVenceEmBreve ? 'bg-amber-400/20' :
                  'bg-bibelo-border'
                }`}>
                  {isPago ? <CheckCircle2 size={20} className="text-emerald-400" /> :
                   isAtrasado ? <AlertTriangle size={20} className="text-red-400" /> :
                   isVenceEmBreve ? <Bell size={20} className="text-amber-400" /> :
                   <Clock size={20} className="text-bibelo-muted" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`font-medium ${isPago ? 'text-bibelo-muted line-through' : 'text-bibelo-text'}`}>
                      {df.descricao}
                    </p>
                    <span className="inline-flex items-center gap-1 text-xs text-bibelo-muted">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: df.categoria_cor }} />
                      {df.categoria_nome}
                    </span>
                  </div>
                  <p className="text-xs text-bibelo-muted mt-0.5">
                    Vencimento: dia {df.dia_vencimento}
                    {isPago && df.data_pagamento && ` | Pago em ${new Date(df.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                    {isAtrasado && ' | ATRASADO'}
                    {isVenceEmBreve && ' | Vence em breve'}
                  </p>
                </div>

                {/* Valor */}
                <div className="text-right">
                  <p className={`text-lg font-bold ${
                    isPago ? 'text-emerald-400' :
                    isAtrasado ? 'text-red-400' :
                    'text-bibelo-text'
                  }`}>
                    {fmt(parseFloat(df.valor))}
                  </p>
                </div>

                {/* Ação */}
                <div className="shrink-0">
                  {isPago ? (
                    <button
                      onClick={() => handleDesfazer(df.id)}
                      disabled={pagando === df.id}
                      className="px-3 py-1.5 text-xs text-bibelo-muted hover:text-red-400 border border-bibelo-border rounded-lg hover:border-red-400/30 transition-colors disabled:opacity-50"
                    >
                      {pagando === df.id ? '...' : 'Desfazer'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePagar(df.id)}
                      disabled={pagando === df.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 rounded-lg hover:bg-emerald-400/20 transition-colors disabled:opacity-50"
                    >
                      <Check size={14} />
                      {pagando === df.id ? 'Pagando...' : 'Pagar'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Nova Despesa Fixa */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-bibelo-text">Nova Despesa Fixa</h2>
              <button onClick={() => setShowModal(false)} className="text-bibelo-muted hover:text-bibelo-text"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Descrição</label>
                <input type="text" placeholder="Ex: Aluguel, Internet..." value={formData.descricao} onChange={(e) => setFormData(f => ({ ...f, descricao: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Valor (R$)</label>
                  <input type="number" step="0.01" placeholder="0,00" value={formData.valor} onChange={(e) => setFormData(f => ({ ...f, valor: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
                <div>
                  <label className="block text-xs text-bibelo-muted mb-1">Dia Vencimento</label>
                  <input type="number" min="1" max="31" placeholder="10" value={formData.dia_vencimento} onChange={(e) => setFormData(f => ({ ...f, dia_vencimento: e.target.value }))}
                    className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Categoria</label>
                <select value={formData.categoria_id} onChange={(e) => setFormData(f => ({ ...f, categoria_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary">
                  <option value="">Selecione...</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Observações</label>
                <input type="text" placeholder="Opcional" value={formData.observacoes} onChange={(e) => setFormData(f => ({ ...f, observacoes: e.target.value }))}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary" />
              </div>

              <button
                onClick={handleSaveNew}
                disabled={saving || !formData.descricao || !formData.categoria_id || !formData.valor || !formData.dia_vencimento}
                className="w-full py-2.5 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
