import { useEffect, useState } from 'react';
import { Calculator } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../lib/api';

interface Simulacao {
  canal_id: string;
  canal_nome: string;
  preco_venda: number;
  custo_produto: number;
  custo_embalagem: number;
  taxa_venda: number;
  taxa_pagamento: number;
  custo_total: number;
  valor_receber: number;
  lucro_liquido: number;
  margem_lucro: number;
}

interface Kit {
  id: string;
  nome: string;
  descricao: string;
  itens: { embalagem_nome: string; custo_unitario: number; quantidade: number; subtotal: number }[];
  custo_total: string;
}

interface ItemEmbalagem {
  id: string;
  nome: string;
  custo_unitario: string;
  unidade: string;
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function corMargem(m: number) {
  if (m >= 30) return 'text-emerald-400';
  if (m >= 15) return 'text-amber-400';
  return 'text-red-400';
}

function bgMargem(m: number) {
  if (m >= 30) return 'bg-emerald-400';
  if (m >= 15) return 'bg-amber-400';
  return 'bg-red-400';
}

export default function SimuladorCustos() {
  const [precoVenda, setPrecoVenda] = useState('69.67');
  const [custoProduto, setCustoProduto] = useState('32.00');
  const [custoEmbalagem, setCustoEmbalagem] = useState('5.25');
  const [kitSelecionado, setKitSelecionado] = useState('');
  const [simulacoes, setSimulacoes] = useState<Simulacao[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [itensEmbalagem, setItensEmbalagem] = useState<ItemEmbalagem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'simulador' | 'embalagens'>('simulador');

  // Load embalagens e kits
  useEffect(() => {
    api.get('/financeiro/embalagens').then(({ data }) => {
      setItensEmbalagem(data.itens);
      setKits(data.kits);
    }).catch(() => {});
  }, []);

  const handleSimular = async () => {
    const pv = parseFloat(precoVenda);
    const cp = parseFloat(custoProduto);
    const ce = parseFloat(custoEmbalagem);
    if (isNaN(pv) || isNaN(cp) || isNaN(ce)) return;

    setLoading(true);
    try {
      const { data } = await api.post('/financeiro/simular', {
        preco_venda: pv,
        custo_produto: cp,
        custo_embalagem: ce,
      });
      setSimulacoes(data.data);
    } catch {}
    finally { setLoading(false); }
  };

  // Simular ao carregar
  useEffect(() => { handleSimular(); }, []);

  const handleKitChange = (kitId: string) => {
    setKitSelecionado(kitId);
    const kit = kits.find(k => k.id === kitId);
    if (kit) {
      setCustoEmbalagem(kit.custo_total);
    }
  };

  const chartData = simulacoes.map(s => ({
    nome: s.canal_nome.replace('NuvemShop ', 'NS '),
    lucro: s.lucro_liquido,
    margem: s.margem_lucro,
  }));

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text">Simulador de Custos</h1>
          <p className="text-sm text-bibelo-muted mt-1">Calcule lucro e margem por canal de venda</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('simulador')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'simulador' ? 'bg-bibelo-primary text-white' : 'bg-bibelo-card border border-bibelo-border text-bibelo-muted hover:text-bibelo-text'}`}
          >
            Simulador
          </button>
          <button
            onClick={() => setTab('embalagens')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'embalagens' ? 'bg-bibelo-primary text-white' : 'bg-bibelo-card border border-bibelo-border text-bibelo-muted hover:text-bibelo-text'}`}
          >
            Embalagens
          </button>
        </div>
      </div>

      {tab === 'simulador' ? (
        <>
          {/* Input */}
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 mb-6">
            <h2 className="text-sm font-medium text-bibelo-muted mb-4">Dados do Produto</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Preço de Venda (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={precoVenda}
                  onChange={(e) => setPrecoVenda(e.target.value)}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Custo do Produto (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={custoProduto}
                  onChange={(e) => setCustoProduto(e.target.value)}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Kit de Embalagem</label>
                <select
                  value={kitSelecionado}
                  onChange={(e) => handleKitChange(e.target.value)}
                  className="w-full px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
                >
                  <option value="">Personalizado</option>
                  {kits.map(k => (
                    <option key={k.id} value={k.id}>{k.nome} ({fmt(parseFloat(k.custo_total))})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-bibelo-muted mb-1">Custo Embalagem (R$)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={custoEmbalagem}
                    onChange={(e) => { setCustoEmbalagem(e.target.value); setKitSelecionado(''); }}
                    className="flex-1 px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
                  />
                  <button
                    onClick={handleSimular}
                    disabled={loading}
                    className="px-4 py-2 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/80 disabled:opacity-50 transition-colors"
                  >
                    <Calculator size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Gráfico */}
          {simulacoes.length > 0 && (
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 mb-6">
              <h2 className="text-sm font-medium text-bibelo-muted mb-4">Lucro por Canal</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A" />
                  <XAxis dataKey="nome" stroke="#64748B" fontSize={11} angle={-20} textAnchor="end" height={60} />
                  <YAxis tickFormatter={(v) => `R$${v}`} stroke="#64748B" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: '#0F1419', border: '1px solid #1E2A3A', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [fmt(v), name === 'lucro' ? 'Lucro' : 'Margem']}
                  />
                  <Bar dataKey="lucro" name="Lucro" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.lucro >= 0 ? (d.margem >= 30 ? '#10B981' : d.margem >= 15 ? '#F59E0B' : '#EF4444') : '#EF4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabela resultado */}
          {simulacoes.length > 0 && (
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                      <th className="px-4 py-3 font-medium">Canal</th>
                      <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Taxa Venda</th>
                      <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Taxa Pgto</th>
                      <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Custo Total</th>
                      <th className="px-4 py-3 font-medium text-right hidden md:table-cell">A Receber</th>
                      <th className="px-4 py-3 font-medium text-right">Lucro</th>
                      <th className="px-4 py-3 font-medium text-right">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulacoes.map((s) => (
                      <tr key={s.canal_id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors">
                        <td className="px-4 py-3 text-bibelo-text font-medium">{s.canal_nome}</td>
                        <td className="px-4 py-3 text-right text-bibelo-muted hidden sm:table-cell">{fmt(s.taxa_venda)}</td>
                        <td className="px-4 py-3 text-right text-bibelo-muted hidden sm:table-cell">{fmt(s.taxa_pagamento)}</td>
                        <td className="px-4 py-3 text-right text-bibelo-muted hidden md:table-cell">{fmt(s.custo_total)}</td>
                        <td className="px-4 py-3 text-right text-bibelo-text hidden md:table-cell">{fmt(s.valor_receber)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${s.lucro_liquido >= 0 ? corMargem(s.margem_lucro) : 'text-red-400'}`}>
                          {fmt(s.lucro_liquido)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-bibelo-border rounded-full overflow-hidden hidden lg:block">
                              <div
                                className={`h-full rounded-full ${bgMargem(s.margem_lucro)}`}
                                style={{ width: `${Math.max(0, Math.min(100, s.margem_lucro * 2))}%` }}
                              />
                            </div>
                            <span className={`font-bold ${corMargem(s.margem_lucro)}`}>
                              {s.margem_lucro.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Kits de embalagem */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {kits.map((kit) => (
              <div key={kit.id} className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-bibelo-text">{kit.nome}</h3>
                  <span className="text-lg font-bold text-bibelo-primary">{fmt(parseFloat(kit.custo_total))}</span>
                </div>
                {kit.descricao && <p className="text-xs text-bibelo-muted mb-3">{kit.descricao}</p>}
                <div className="space-y-1.5">
                  {kit.itens.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-bibelo-muted">
                        {item.quantidade}x {item.embalagem_nome}
                      </span>
                      <span className="text-bibelo-text">{fmt(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Itens individuais */}
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-bibelo-border">
              <h2 className="text-sm font-medium text-bibelo-text">Itens de Embalagem</h2>
              <p className="text-xs text-bibelo-muted mt-0.5">Custo unitário de cada item</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bibelo-border text-bibelo-muted text-left">
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium text-right">Custo Unitário</th>
                    <th className="px-4 py-3 font-medium">Unidade</th>
                  </tr>
                </thead>
                <tbody>
                  {itensEmbalagem.map((item) => (
                    <tr key={item.id} className="border-b border-bibelo-border/50 hover:bg-bibelo-border/20 transition-colors">
                      <td className="px-4 py-3 text-bibelo-text">{item.nome}</td>
                      <td className="px-4 py-3 text-right font-medium text-bibelo-primary">{fmt(parseFloat(item.custo_unitario))}</td>
                      <td className="px-4 py-3 text-bibelo-muted">{item.unidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
