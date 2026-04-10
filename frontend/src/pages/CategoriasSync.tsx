import { useEffect, useState, useCallback } from 'react';
import {
  GitMerge, RefreshCw, Play, Check, Clock, EyeOff, ChevronDown, AlertTriangle,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';

// ── Tipos ──────────────────────────────────────────────────────

interface Mapeamento {
  bling_category_id: string;
  bling_category_name: string | null;
  nome: string;
  medusa_category_id: string | null;
  handle: string | null;
  bling_parent_id: string | null;
  id_pai_nome: string | null;
  status: 'mapped' | 'pending' | 'ignored';
  origem: string | null;
  sincronizado_em: string;
  created_at: string;
}

interface MedusaCategoria {
  id: string;
  name: string;
  handle: string;
  parent_id: string | null;
}

interface Stats {
  total: number;
  mapped: number;
  pending: number;
  ignored: number;
}

interface UltimoLog {
  operacao: string;
  usuario: string | null;
  detalhes: Record<string, unknown> | null;
  criado_em: string;
}

// ── Badge de status ────────────────────────────────────────────

function StatusBadge({ status }: { status: Mapeamento['status'] }) {
  if (status === 'mapped') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <Check size={11} />
        Mapeada
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
        <Clock size={11} />
        Pendente
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      <EyeOff size={11} />
      Ignorada
    </span>
  );
}

// ── Linha da tabela ────────────────────────────────────────────

function MapeamentoRow({
  m,
  medusaCategorias,
  onUpdate,
}: {
  m: Mapeamento;
  medusaCategorias: MedusaCategoria[];
  onUpdate: (blingId: string, status: Mapeamento['status'], medusaId: string | null, medusaHandle: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [selectedMedusaId, setSelectedMedusaId] = useState<string>(m.medusa_category_id ?? '');

  const handleMap = async () => {
    if (!selectedMedusaId) return;
    const cat = medusaCategorias.find((c) => c.id === selectedMedusaId);
    setSaving(true);
    await onUpdate(m.bling_category_id, 'mapped', selectedMedusaId, cat?.handle ?? null);
    setSaving(false);
  };

  const handleIgnore = async () => {
    setSaving(true);
    await onUpdate(m.bling_category_id, 'ignored', null, null);
    setSaving(false);
  };

  const handleRestore = async () => {
    setSaving(true);
    await onUpdate(m.bling_category_id, 'pending', null, null);
    setSaving(false);
  };

  // Nome Bling — nome original do Bling sem formatação
  const nomeBling = m.bling_category_name || m.nome;
  // Nome Medusa — preserva o nome como está no Medusa (com emojis)
  const catMedusa = medusaCategorias.find((c) => c.id === m.medusa_category_id);

  return (
    <tr className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${m.status === 'ignored' ? 'opacity-50' : ''}`}>
      {/* Categoria Bling */}
      <td className="px-4 py-3">
        <div>
          <span className="text-sm font-medium text-gray-800">{nomeBling}</span>
          {m.id_pai_nome && (
            <span className="ml-2 text-xs text-gray-400">↳ {m.id_pai_nome}</span>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">ID {m.bling_category_id}</div>
      </td>

      {/* Categoria Medusa */}
      <td className="px-4 py-3">
        {m.status === 'mapped' ? (
          <div>
            {/* Exibe nome do Medusa preservando emojis — não sobrescreve */}
            <span className="text-sm text-gray-800">{catMedusa?.name ?? m.handle ?? '—'}</span>
            {catMedusa?.handle && (
              <div className="text-xs text-gray-400 mt-0.5">{catMedusa.handle}</div>
            )}
          </div>
        ) : m.status === 'ignored' ? (
          <span className="text-xs text-gray-400">—</span>
        ) : (
          // Pendente: mostra dropdown para selecionar categoria Medusa
          <div className="relative">
            <select
              value={selectedMedusaId}
              onChange={(e) => setSelectedMedusaId(e.target.value)}
              disabled={saving}
              className="w-full text-sm border border-pink-200 rounded-lg px-3 py-1.5 pr-8 bg-[#fff5f8] focus:outline-none focus:ring-2 focus:ring-bibelo-primary/30 focus:border-bibelo-primary appearance-none disabled:opacity-50"
            >
              <option value="">Selecionar categoria...</option>
              {medusaCategorias
                .filter((c) => !c.parent_id)
                .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              {medusaCategorias
                .filter((c) => c.parent_id)
                .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                .map((cat) => {
                  const parent = medusaCategorias.find((p) => p.id === cat.parent_id);
                  return (
                    <option key={cat.id} value={cat.id}>
                      &nbsp;&nbsp;↳ {cat.name}{parent ? ` (${parent.name})` : ''}
                    </option>
                  );
                })}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-bibelo-primary/60 pointer-events-none" />
          </div>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge status={m.status} />
      </td>

      {/* Ações */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {m.status === 'pending' && (
            <>
              <button
                onClick={handleMap}
                disabled={saving || !selectedMedusaId}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-bibelo-primary text-white rounded-lg hover:bg-bibelo-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                Mapear
              </button>
              <button
                onClick={handleIgnore}
                disabled={saving}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40"
              >
                <EyeOff size={11} />
                Ignorar
              </button>
            </>
          )}
          {m.status === 'mapped' && (
            <button
              onClick={() => { setSelectedMedusaId(''); onUpdate(m.bling_category_id, 'pending', null, null); }}
              disabled={saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40"
            >
              Alterar
            </button>
          )}
          {m.status === 'ignored' && (
            <button
              onClick={handleRestore}
              disabled={saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors disabled:opacity-40"
            >
              Reativar
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Página principal ───────────────────────────────────────────

type FiltroStatus = 'todos' | 'pending' | 'mapped' | 'ignored';

export default function CategoriasSync() {
  const { success, error: showError } = useToast();

  const [mapeamentos, setMapeamentos]       = useState<Mapeamento[]>([]);
  const [medusaCategorias, setMedusaCats]   = useState<MedusaCategoria[]>([]);
  const [stats, setStats]                   = useState<Stats>({ total: 0, mapped: 0, pending: 0, ignored: 0 });
  const [ultimoLog, setUltimoLog]           = useState<UltimoLog | null>(null);
  const [loading, setLoading]               = useState(true);
  const [importando, setImportando]         = useState(false);
  const [sincronizando, setSincronizando]   = useState(false);
  const [filtro, setFiltro]                 = useState<FiltroStatus>('todos');
  const [busca, setBusca]                   = useState('');

  const fetchData = useCallback(async () => {
    try {
      const { data } = await api.get('/categorias-sync');
      setMapeamentos(data.mapeamentos);
      setMedusaCats(data.medusaCategorias);
      setStats(data.stats);
      setUltimoLog(data.ultimoLog);
    } catch {
      showError('Erro ao carregar mapeamentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleImportar = async () => {
    setImportando(true);
    try {
      const { data } = await api.post('/categorias-sync/importar');
      success(`Importação concluída: ${data.novas} novas, ${data.existentes} existentes`);
      await fetchData();
    } catch {
      showError('Erro ao importar categorias do Bling');
    } finally {
      setImportando(false);
    }
  };

  const handleSincronizar = async () => {
    if (stats.mapped === 0) {
      showError('Nenhuma categoria mapeada para sincronizar');
      return;
    }
    setSincronizando(true);
    try {
      await api.post('/categorias-sync/sincronizar');
      success(`Sincronização iniciada para ${stats.mapped} categorias mapeadas`);
      setTimeout(fetchData, 2000);
    } catch {
      showError('Erro ao iniciar sincronização');
    } finally {
      setSincronizando(false);
    }
  };

  const handleUpdate = async (
    blingId: string,
    status: Mapeamento['status'],
    medusaId: string | null,
    medusaHandle: string | null
  ) => {
    try {
      await api.put(`/categorias-sync/${blingId}`, { status, medusa_category_id: medusaId, medusa_handle: medusaHandle });
      setMapeamentos((prev) =>
        prev.map((m) =>
          m.bling_category_id === blingId
            ? { ...m, status, medusa_category_id: medusaId, handle: medusaHandle ?? m.handle }
            : m
        )
      );
      setStats((prev) => {
        const oldStatus = mapeamentos.find((m) => m.bling_category_id === blingId)?.status;
        if (!oldStatus || oldStatus === status) return prev;
        const next = { ...prev };
        next[oldStatus]--;
        next[status]++;
        return next;
      });
      if (status === 'mapped')  success('Categoria mapeada');
      if (status === 'ignored') success('Categoria ignorada');
      if (status === 'pending') success('Categoria reativada');
    } catch {
      showError('Erro ao salvar mapeamento');
    }
  };

  // ── Filtros ──
  const mapeamentosFiltrados = mapeamentos.filter((m) => {
    if (filtro !== 'todos' && m.status !== filtro) return false;
    if (busca) {
      const q = busca.toLowerCase();
      return (
        (m.bling_category_name ?? m.nome).toLowerCase().includes(q) ||
        m.bling_category_id.includes(q) ||
        (m.id_pai_nome ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-bibelo-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <GitMerge className="text-bibelo-primary" size={22} />
            <h1 className="text-xl font-bold text-gray-900">Categorias Sync</h1>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Mapeamento Bling → Medusa — {stats.total} categorias
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImportar}
            disabled={importando}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {importando
              ? <RefreshCw size={15} className="animate-spin" />
              : <RefreshCw size={15} />}
            Importar do Bling
          </button>
          <button
            onClick={handleSincronizar}
            disabled={sincronizando || stats.mapped === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-bibelo-primary text-white rounded-xl hover:bg-bibelo-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sincronizando
              ? <RefreshCw size={15} className="animate-spin" />
              : <Play size={15} />}
            Sincronizar tudo
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',     value: stats.total,   color: 'text-gray-700', bg: 'bg-gray-50'    },
          { label: 'Mapeadas',  value: stats.mapped,  color: 'text-green-700', bg: 'bg-green-50'  },
          { label: 'Pendentes', value: stats.pending, color: 'text-yellow-700', bg: 'bg-yellow-50' },
          { label: 'Ignoradas', value: stats.ignored, color: 'text-gray-500',  bg: 'bg-gray-50'   },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4`}>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Aviso de pendentes */}
      {stats.pending > 0 && (
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <AlertTriangle size={17} className="text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-yellow-800">
            <span className="font-semibold">{stats.pending} {stats.pending === 1 ? 'categoria pendente' : 'categorias pendentes'}</span>
            {' '}— produtos dessas categorias não terão categoria no Medusa até serem mapeados.
          </div>
        </div>
      )}

      {/* Último log */}
      {ultimoLog && (
        <div className="text-xs text-gray-400 -mt-2">
          Última operação: <span className="font-medium text-gray-600">{ultimoLog.operacao}</span>
          {ultimoLog.usuario && <> por <span className="font-medium text-gray-600">{ultimoLog.usuario}</span></>}
          {' — '}{formatDate(ultimoLog.criado_em)}
          {ultimoLog.detalhes && (
            <span className="ml-2 text-gray-400">
              ({Object.entries(ultimoLog.detalhes).map(([k, v]) => `${k}: ${v}`).join(', ')})
            </span>
          )}
        </div>
      )}

      {/* Filtros e busca */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Buscar categoria..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-bibelo-primary/30 focus:border-bibelo-primary"
        />
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {(['todos', 'pending', 'mapped', 'ignored'] as FiltroStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-r last:border-r-0 border-gray-200 ${
                filtro === f
                  ? 'bg-bibelo-primary text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {{ todos: 'Todos', pending: 'Pendentes', mapped: 'Mapeadas', ignored: 'Ignoradas' }[f]}
              {' '}
              <span className="opacity-70">
                ({f === 'todos' ? stats.total : stats[f as keyof Stats]})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Categoria Bling
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Categoria Medusa
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {mapeamentosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-400">
                    {busca ? 'Nenhuma categoria encontrada para essa busca.' : 'Nenhuma categoria. Clique em "Importar do Bling".'}
                  </td>
                </tr>
              ) : (
                mapeamentosFiltrados.map((m) => (
                  <MapeamentoRow
                    key={m.bling_category_id}
                    m={m}
                    medusaCategorias={medusaCategorias}
                    onUpdate={handleUpdate}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {mapeamentosFiltrados.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            {mapeamentosFiltrados.length} de {stats.total} categorias
          </div>
        )}
      </div>

      {/* Info: emojis preservados */}
      <p className="text-xs text-gray-400">
        Os nomes das categorias Medusa são exibidos como estão — emojis e formatação são preservados.
      </p>
    </div>
  );
}
