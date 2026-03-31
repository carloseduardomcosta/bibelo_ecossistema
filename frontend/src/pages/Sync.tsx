import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, CheckCircle, XCircle, ExternalLink, Clock, Database } from 'lucide-react';
import api from '../lib/api';

interface SyncState {
  fonte: string;
  ultima_sync: string | null;
  total_sincronizados: number;
}

interface SyncLog {
  id: string;
  fonte: string;
  tipo: string;
  status: string;
  registros: number;
  erro: string | null;
  criado_em: string;
}

interface SyncStatus {
  integracoes: SyncState[];
  bling_conectado: boolean;
  nuvemshop_conectado: boolean;
  nuvemshop_store_id: number | null;
  logs_recentes: SyncLog[];
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Sync() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/sync/status');
      setStatus(data);
    } catch {
      /* */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Detecta retorno do OAuth Bling / NuvemShop
  useEffect(() => {
    const bling = searchParams.get('bling');
    const nuvemshop = searchParams.get('nuvemshop');
    if (bling === 'connected') {
      setMessage({ text: 'Bling conectado com sucesso!', type: 'success' });
      searchParams.delete('bling');
      setSearchParams(searchParams, { replace: true });
      fetchStatus();
    } else if (bling === 'error') {
      setMessage({ text: 'Erro ao conectar com o Bling. Tente novamente.', type: 'error' });
      searchParams.delete('bling');
      setSearchParams(searchParams, { replace: true });
    }
    if (nuvemshop === 'connected') {
      setMessage({ text: 'NuvemShop conectada com sucesso! Webhooks registrados.', type: 'success' });
      searchParams.delete('nuvemshop');
      setSearchParams(searchParams, { replace: true });
      fetchStatus();
    } else if (nuvemshop === 'error') {
      setMessage({ text: 'Erro ao conectar com a NuvemShop. Tente novamente.', type: 'error' });
      searchParams.delete('nuvemshop');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, fetchStatus]);

  const handleConnectBling = async () => {
    try {
      const { data } = await api.get('/auth/bling');
      window.location.href = data.url;
    } catch {
      setMessage({ text: 'Erro ao gerar URL de autorizacao.', type: 'error' });
    }
  };

  const handleSync = async (tipo: 'incremental' | 'full') => {
    setSyncing(true);
    setMessage(null);
    try {
      await api.post(`/sync/bling?tipo=${tipo}`);
      setMessage({
        text: `Sync ${tipo} iniciado em background. Atualize a pagina em alguns minutos para ver os resultados.`,
        type: 'success',
      });
      // Atualiza status após 5s para mostrar progresso
      setTimeout(fetchStatus, 5000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detalhes?: string } } })?.response?.data?.detalhes || 'Erro na sincronizacao';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const [syncingNs, setSyncingNs] = useState(false);

  const handleConnectNuvemShop = async () => {
    try {
      const { data } = await api.get('/auth/nuvemshop');
      window.location.href = data.url;
    } catch {
      setMessage({ text: 'Erro ao gerar URL de autorizacao NuvemShop.', type: 'error' });
    }
  };

  const handleSyncNuvemShop = async () => {
    setSyncingNs(true);
    setMessage(null);
    try {
      await api.post('/sync/nuvemshop');
      setMessage({
        text: 'Sync NuvemShop iniciado em background. Atualize a pagina em alguns minutos.',
        type: 'success',
      });
      setTimeout(fetchStatus, 5000);
    } catch {
      setMessage({ text: 'Erro na sincronizacao NuvemShop.', type: 'error' });
    } finally {
      setSyncingNs(false);
    }
  };

  const blingState = status?.integracoes.find((i) => i.fonte === 'bling');
  const nuvemshopState = status?.integracoes.find((i) => i.fonte === 'nuvemshop');

  return (
    <div>
      <h1 className="text-2xl font-bold text-bibelo-text mb-6">Sync & Integracoes</h1>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}
        >
          {message.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Bling */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400 font-bold text-sm">
                B
              </div>
              <div>
                <h2 className="text-sm font-medium text-bibelo-text">Bling ERP</h2>
                <p className="text-xs text-bibelo-muted">Contatos + Pedidos</p>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                status?.bling_conectado
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {loading ? '...' : status?.bling_conectado ? 'Conectado' : 'Desconectado'}
            </span>
          </div>

          {blingState?.ultima_sync && (
            <div className="flex items-center gap-2 text-xs text-bibelo-muted mb-3">
              <Clock size={12} />
              Ultima sync: {formatDate(blingState.ultima_sync)}
            </div>
          )}

          {blingState && (
            <div className="flex items-center gap-2 text-xs text-bibelo-muted mb-4">
              <Database size={12} />
              {blingState.total_sincronizados} registros sincronizados
            </div>
          )}

          <div className="flex gap-2">
            {status?.bling_conectado ? (
              <>
                <button
                  onClick={() => handleSync('incremental')}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-bibelo-primary hover:bg-bibelo-primary-hover disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Sincronizando...' : 'Sync Incremental'}
                </button>
                <button
                  onClick={() => handleSync('full')}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-bibelo-border hover:bg-bibelo-border/80 disabled:opacity-50 text-bibelo-text text-xs font-medium rounded-lg transition-colors"
                >
                  Sync Completo
                </button>
              </>
            ) : (
              <button
                onClick={handleConnectBling}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-bibelo-primary hover:bg-bibelo-primary-hover text-white text-xs font-medium rounded-lg transition-colors"
              >
                <ExternalLink size={13} />
                Conectar Bling
              </button>
            )}
          </div>
        </div>

        {/* NuvemShop */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-500/20 rounded-lg flex items-center justify-center text-violet-400 font-bold text-sm">
                NS
              </div>
              <div>
                <h2 className="text-sm font-medium text-bibelo-text">NuvemShop</h2>
                <p className="text-xs text-bibelo-muted">Pedidos + Clientes + Produtos</p>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                status?.nuvemshop_conectado
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {loading ? '...' : status?.nuvemshop_conectado ? 'Conectada' : 'Desconectada'}
            </span>
          </div>

          {status?.nuvemshop_store_id && (
            <div className="flex items-center gap-2 text-xs text-bibelo-muted mb-2">
              <Database size={12} />
              Loja ID: {status.nuvemshop_store_id}
            </div>
          )}

          {nuvemshopState?.ultima_sync && (
            <div className="flex items-center gap-2 text-xs text-bibelo-muted mb-2">
              <Clock size={12} />
              Ultima sync: {formatDate(nuvemshopState.ultima_sync)}
            </div>
          )}

          {nuvemshopState && (
            <div className="flex items-center gap-2 text-xs text-bibelo-muted mb-4">
              <Database size={12} />
              {nuvemshopState.total_sincronizados} registros sincronizados
            </div>
          )}

          <div className="flex gap-2">
            {status?.nuvemshop_conectado ? (
              <button
                onClick={handleSyncNuvemShop}
                disabled={syncingNs}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <RefreshCw size={13} className={syncingNs ? 'animate-spin' : ''} />
                {syncingNs ? 'Sincronizando...' : 'Sync Completo'}
              </button>
            ) : (
              <button
                onClick={handleConnectNuvemShop}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <ExternalLink size={13} />
                Conectar NuvemShop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-bibelo-muted mb-4">Logs de Sincronizacao</h2>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-bibelo-border rounded animate-pulse" />
            ))}
          </div>
        ) : !status?.logs_recentes.length ? (
          <p className="text-sm text-bibelo-muted text-center py-6">Nenhum log de sincronizacao ainda</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Fonte</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Registros</th>
                  <th className="px-3 py-2 font-medium hidden md:table-cell">Erro</th>
                </tr>
              </thead>
              <tbody>
                {status.logs_recentes.map((log) => (
                  <tr key={log.id} className="border-b border-bibelo-border/50">
                    <td className="px-3 py-2 text-bibelo-muted text-xs">{formatDate(log.criado_em)}</td>
                    <td className="px-3 py-2 text-bibelo-text capitalize">{log.fonte}</td>
                    <td className="px-3 py-2 text-bibelo-muted">{log.tipo}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          log.status === 'ok'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-bibelo-text text-right">{log.registros}</td>
                    <td className="px-3 py-2 text-red-400 text-xs hidden md:table-cell truncate max-w-[200px]">
                      {log.erro || '—'}
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
