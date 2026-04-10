import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
  ChevronLeft, ChevronRight, Package, Users, Eye, Send, Check,
  Sparkles, Mail, AlertTriangle, Search, X, Star,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../lib/format';

interface Categoria {
  categoria: string;
  em_estoque: number;
  preco_medio: number;
}

interface Produto {
  id?: string;
  nome: string;
  preco: number;
  estoque: number;
  img: string | null;
  url: string | null;
  categoria: string | null;
}

interface Destinatario {
  id: string;
  nome: string;
  email: string;
}

type Publico = 'todos' | 'todos_com_email' | 'nunca_contatados' | 'manual';

const STEPS = ['Selecionar', 'Produtos', 'Público', 'Preview', 'Enviar'];
type SelecaoTab = 'categorias' | 'produtos' | 'novidades';

export default function NovaCampanha() {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 0: Seleção (categorias + produtos individuais)
  const [selecaoTab, setSelecaoTab] = useState<SelecaoTab>('categorias');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [catSelecionadas, setCatSelecionadas] = useState<string[]>([]);
  const [catSearch, setCatSearch] = useState('');
  const [maxPorCat, setMaxPorCat] = useState(2);

  // Novidades (última NF)
  const [novidadesNF, setNovidadesNF] = useState<Produto[]>([]);
  const [carregandoNF, setCarregandoNF] = useState(false);
  const [erroNF, setErroNF] = useState('');

  // Produtos individuais
  const [produtoBusca, setProdutoBusca] = useState('');
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<Produto[]>([]);
  const [produtosSelecionados, setProdutosSelecionados] = useState<Produto[]>([]);
  const [buscandoProdutos, setBuscandoProdutos] = useState(false);

  // Step 1: Produtos preview (resultado final)
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [limiteProdutos, setLimiteProdutos] = useState(6);

  // Step 3: Público
  const [publico, setPublico] = useState<Publico>('nunca_contatados');
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
  const [destSelecionados, setDestSelecionados] = useState<string[]>([]);
  const [destSearch, setDestSearch] = useState('');

  // Step 4: Preview
  const [assunto, setAssunto] = useState('');
  const [html, setHtml] = useState('');

  // Step 5: Enviar
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [testeEnviado, setTesteEnviado] = useState(false);

  // Carregar categorias
  useEffect(() => {
    api.get('/campaigns/categorias').then((r) => setCategorias(r.data)).catch(() => {});
  }, []);

  // Toggle categoria
  const toggleCat = (cat: string) => {
    setCatSelecionadas((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // Carregar produtos da última NF ao selecionar aba Novidades
  useEffect(() => {
    if (selecaoTab !== 'novidades' || novidadesNF.length > 0) return;
    setCarregandoNF(true);
    setErroNF('');
    api.get('/campaigns/novidades-nf')
      .then((r) => setNovidadesNF(r.data))
      .catch(() => setErroNF('Nenhum produto disponível na última NF. Verifique se a NF foi sincronizada.'))
      .finally(() => setCarregandoNF(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecaoTab]);

  // Buscar produtos individuais
  const buscarProdutos = async (search: string) => {
    if (search.length < 2) { setProdutosDisponiveis([]); return; }
    setBuscandoProdutos(true);
    try {
      const { data } = await api.get(`/campaigns/produtos?search=${encodeURIComponent(search)}&limit=20`);
      setProdutosDisponiveis(data);
    } catch { /* ignore */ }
    setBuscandoProdutos(false);
  };

  // Debounce busca — eslint-disable porque buscarProdutos é estável
  useEffect(() => {
    if (produtoBusca.length < 2) { setProdutosDisponiveis([]); return; }
    const t = setTimeout(() => buscarProdutos(produtoBusca), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoBusca]);

  const toggleProduto = (p: Produto) => {
    setProdutosSelecionados((prev) => {
      const exists = prev.find((x) => x.id === p.id);
      if (exists) return prev.filter((x) => x.id !== p.id);
      return [...prev, p];
    });
  };

  // Gerar preview (step 0→1)
  const gerarPreview = async () => {
    if (selecaoTab !== 'novidades' && catSelecionadas.length === 0 && produtosSelecionados.length === 0) {
      showError('Selecione pelo menos uma categoria ou um produto');
      return;
    }
    if (selecaoTab === 'novidades' && novidadesNF.length === 0) {
      showError('Nenhum produto disponível na última NF');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/campaigns/gerar-personalizada', {
        categorias: catSelecionadas,
        produto_ids: produtosSelecionados.map((p) => p.id).filter(Boolean),
        max_por_categoria: maxPorCat,
        limite_produtos: selecaoTab === 'novidades' ? novidadesNF.length : limiteProdutos,
        publico,
        customer_ids: publico === 'manual' ? destSelecionados : undefined,
        fonte: selecaoTab === 'novidades' ? 'novidades' : undefined,
      });
      setProdutos(data.produtos);
      setDestinatarios(data.destinatarios);
      setDestSelecionados(data.destinatarios.map((d: Destinatario) => d.id));
      setAssunto(data.assunto);
      setHtml(data.html);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao gerar preview';
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Avançar step
  const avancar = async () => {
    if (step === 0) {
      if (selecaoTab !== 'novidades' && catSelecionadas.length === 0 && produtosSelecionados.length === 0) {
        showError('Selecione pelo menos uma categoria ou um produto'); return;
      }
      await gerarPreview();
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      if (destSelecionados.length === 0) { showError('Selecione pelo menos um destinatário'); return; }
      // Regenerar com público final
      setLoading(true);
      try {
        const { data } = await api.post('/campaigns/gerar-personalizada', {
          categorias: catSelecionadas,
          produto_ids: produtosSelecionados.map((p) => p.id).filter(Boolean),
          max_por_categoria: maxPorCat,
          limite_produtos: selecaoTab === 'novidades' ? novidadesNF.length : limiteProdutos,
          publico: 'manual',
          customer_ids: destSelecionados,
          fonte: selecaoTab === 'novidades' ? 'novidades' : undefined,
        });
        setAssunto(data.assunto);
        setHtml(data.html);
        setDestinatarios(data.destinatarios);
      } catch { /* usa preview anterior */ }
      setLoading(false);
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  // Enviar teste
  const enviarTeste = async () => {
    setLoading(true);
    try {
      const assuntoTeste = assunto.replace(/\{\{nome\}\}/g, 'Carlos');
      const htmlTeste = html.replace(/\{\{nome\}\}/g, 'Carlos');
      await api.post('/campaigns/test-email', {
        to: 'contato@papelariabibelo.com.br',
        subject: `[TESTE] ${assuntoTeste}`,
        html: htmlTeste,
      });
      setTesteEnviado(true);
      success('Email de teste enviado para contato@papelariabibelo.com.br');
    } catch {
      showError('Erro ao enviar teste');
    } finally {
      setLoading(false);
    }
  };

  // Disparar campanha
  const disparar = async () => {
    setEnviando(true);
    try {
      const catLabel = catSelecionadas.slice(0, 3).join(', ');
      const nomeBase = selecaoTab === 'novidades'
        ? `Novidades — ${new Date().toLocaleDateString('pt-BR')}`
        : `Novidades ${catLabel} — ${new Date().toLocaleDateString('pt-BR')}`;
      const { data } = await api.post('/campaigns/enviar-personalizada', {
        nome_campanha: nomeBase,
        assunto,
        html,
        customer_ids: destSelecionados,
      });
      setEnviado(true);
      success(`Campanha em envio para ${data.total} destinatários`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao disparar campanha';
      showError(msg);
    } finally {
      setEnviando(false);
    }
  };

  // Toggle destinatário
  const toggleDest = (id: string) => {
    setDestSelecionados((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const catsFiltradas = categorias.filter((c) =>
    catSearch ? c.categoria.toLowerCase().includes(catSearch.toLowerCase()) : true
  );

  const destsFiltrados = destinatarios.filter((d) =>
    destSearch ? d.nome.toLowerCase().includes(destSearch.toLowerCase()) || d.email.toLowerCase().includes(destSearch.toLowerCase()) : true
  );

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => navigate('/campanhas')} className="text-bibelo-muted hover:text-bibelo-text text-sm flex items-center gap-1 mb-1">
            <ChevronLeft size={14} /> Campanhas
          </button>
          <h1 className="text-2xl font-bold text-bibelo-text">Nova Campanha Personalizada</h1>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              i === step ? 'bg-bibelo-primary text-white' :
              i < step ? 'bg-emerald-400/10 text-emerald-400' :
              'bg-bibelo-border text-bibelo-muted'
            }`}>
              {i < step ? <Check size={12} /> : <span>{i + 1}</span>}
              <span className="hidden sm:inline">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className="w-4 h-px bg-bibelo-border" />}
          </div>
        ))}
      </div>

      {/* Step 0: Selecionar (Categorias + Produtos individuais) */}
      {step === 0 && (
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-bibelo-card border border-bibelo-border rounded-lg p-1">
            <button
              onClick={() => setSelecaoTab('categorias')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selecaoTab === 'categorias' ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text'
              }`}
            >
              <Package size={14} /> Por categoria
            </button>
            <button
              onClick={() => setSelecaoTab('produtos')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selecaoTab === 'produtos' ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text'
              }`}
            >
              <Sparkles size={14} /> Produto individual
            </button>
            <button
              onClick={() => setSelecaoTab('novidades')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selecaoTab === 'novidades' ? 'bg-bibelo-primary text-white' : 'text-bibelo-muted hover:text-bibelo-text'
              }`}
            >
              <Star size={14} /> Novidades
            </button>
          </div>

          {/* Tab: Categorias */}
          {selecaoTab === 'categorias' && (
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6">
              <p className="text-xs text-bibelo-muted mb-4">Escolha categorias — max {maxPorCat} produtos de cada aparecerão no email</p>

              <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted" />
                <input
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  placeholder="Buscar categoria..."
                  className="w-full pl-9 pr-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-bibelo-primary"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                {catsFiltradas.map((c) => {
                  const sel = catSelecionadas.includes(c.categoria);
                  return (
                    <button
                      key={c.categoria}
                      onClick={() => toggleCat(c.categoria)}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        sel ? 'border-bibelo-primary bg-bibelo-primary/10' : 'border-bibelo-border hover:border-bibelo-primary/40'
                      }`}
                    >
                      <p className={`text-sm font-medium ${sel ? 'text-bibelo-primary' : 'text-bibelo-text'}`}>{c.categoria}</p>
                      <p className="text-[11px] text-bibelo-muted mt-0.5">{c.em_estoque} produtos · {formatCurrency(c.preco_medio)} medio</p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-bibelo-muted">Max por categoria:</label>
                  <select value={maxPorCat} onChange={(e) => setMaxPorCat(Number(e.target.value))} className="bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-1.5 text-sm text-bibelo-text">
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-bibelo-muted">Total no email:</label>
                  <select value={limiteProdutos} onChange={(e) => setLimiteProdutos(Number(e.target.value))} className="bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-1.5 text-sm text-bibelo-text">
                    {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Produtos individuais */}
          {selecaoTab === 'produtos' && (
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6">
              <p className="text-xs text-bibelo-muted mb-4">Busque e selecione produtos específicos para o email</p>

              {/* Produtos já selecionados */}
              {produtosSelecionados.length > 0 && (
                <div className="mb-4 p-3 bg-bibelo-bg rounded-lg">
                  <p className="text-xs font-bold text-bibelo-muted mb-2">{produtosSelecionados.length} produto(s) selecionado(s):</p>
                  <div className="flex flex-wrap gap-2">
                    {produtosSelecionados.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 bg-bibelo-card border border-bibelo-primary/30 rounded-lg p-1.5 pr-2">
                        {p.img && <img src={p.img} alt="" className="w-8 h-8 rounded object-cover" />}
                        <span className="text-xs text-bibelo-text font-medium">{p.nome.length > 25 ? p.nome.slice(0, 25) + '...' : p.nome}</span>
                        <button onClick={() => toggleProduto(p)} className="text-bibelo-muted hover:text-red-400"><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted" />
                <input
                  value={produtoBusca}
                  onChange={(e) => setProdutoBusca(e.target.value)}
                  placeholder="Buscar produto (ex: perfume, caneta, kit)..."
                  className="w-full pl-9 pr-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-bibelo-primary"
                />
              </div>

              {buscandoProdutos && <p className="text-xs text-bibelo-muted py-2">Buscando...</p>}

              {produtosDisponiveis.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto mb-4">
                  {produtosDisponiveis.map((p) => {
                    const sel = produtosSelecionados.some((x) => x.id === p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleProduto(p)}
                        className={`text-left rounded-lg border overflow-hidden transition-colors ${
                          sel ? 'border-bibelo-primary ring-2 ring-bibelo-primary/30' : 'border-bibelo-border hover:border-bibelo-primary/40'
                        }`}
                      >
                        {p.img ? (
                          <img src={p.img} alt={p.nome} className="w-full aspect-square object-cover" />
                        ) : (
                          <div className="w-full aspect-square bg-gradient-to-br from-pink-100 to-yellow-50 flex items-center justify-center text-2xl">🎀</div>
                        )}
                        <div className="p-2">
                          <p className="text-[11px] font-medium text-bibelo-text line-clamp-2">{p.nome}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs font-bold text-bibelo-text">{formatCurrency(p.preco)}</span>
                            {sel && <Check size={12} className="text-bibelo-primary" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {produtoBusca.length > 0 && produtoBusca.length < 2 && (
                <p className="text-xs text-bibelo-muted">Digite pelo menos 2 caracteres</p>
              )}

              <div className="flex items-center gap-2">
                <label className="text-xs text-bibelo-muted">Total no email:</label>
                <select value={limiteProdutos} onChange={(e) => setLimiteProdutos(Number(e.target.value))} className="bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-1.5 text-sm text-bibelo-text">
                  {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Tab: Novidades (última NF) */}
          {selecaoTab === 'novidades' && (
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6">
              <p className="text-xs text-bibelo-muted mb-4">
                Produtos com foto HD e estoque confirmado — vinculados diretamente à página do produto na loja.
              </p>

              {carregandoNF && (
                <div className="flex items-center justify-center py-10 text-bibelo-muted text-sm gap-2">
                  <span className="animate-spin">⟳</span> Carregando produtos...
                </div>
              )}

              {erroNF && !carregandoNF && (
                <div className="flex items-center gap-2 text-amber-400 text-xs py-4">
                  <AlertTriangle size={14} />
                  {erroNF}
                </div>
              )}

              {!carregandoNF && novidadesNF.length > 0 && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-96 overflow-y-auto mb-4">
                    {novidadesNF.map((p, i) => (
                      <div key={i} className="bg-bibelo-bg border border-bibelo-border rounded-lg overflow-hidden">
                        {p.img ? (
                          <img src={p.img} alt={p.nome} className="w-full aspect-square object-cover" />
                        ) : (
                          <div className="w-full aspect-square bg-gradient-to-br from-pink-100 to-yellow-50 flex items-center justify-center text-2xl">🎀</div>
                        )}
                        <div className="p-2">
                          <p className="text-[11px] font-medium text-bibelo-text line-clamp-2">{p.nome}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs font-bold text-bibelo-text">{formatCurrency(p.preco)}</span>
                            {p.estoque <= 3 && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-red-400/10 text-red-400 rounded-full">{p.estoque} un</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-bibelo-muted">Total no email:</label>
                    <select
                      value={limiteProdutos}
                      onChange={(e) => setLimiteProdutos(Number(e.target.value))}
                      className="bg-bibelo-bg border border-bibelo-border rounded-lg px-3 py-1.5 text-sm text-bibelo-text"
                    >
                      {[4, 6, 8, 10, 12].filter((n) => n <= novidadesNF.length).concat(
                        novidadesNF.length <= 12 ? [novidadesNF.length] : []
                      ).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <span className="text-xs text-bibelo-muted">de {novidadesNF.length} disponíveis</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Seleção atual (resumo) */}
          {(catSelecionadas.length > 0 || produtosSelecionados.length > 0) && (
            <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
              <p className="text-xs font-bold text-bibelo-muted mb-2">Selecionado:</p>
              <div className="flex flex-wrap gap-1.5">
                {catSelecionadas.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 px-2.5 py-1 bg-bibelo-primary/10 text-bibelo-primary text-xs rounded-full font-medium">
                    {c}
                    <button onClick={() => toggleCat(c)}><X size={12} /></button>
                  </span>
                ))}
                {produtosSelecionados.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-400/10 text-emerald-400 text-xs rounded-full font-medium">
                    {p.nome.length > 30 ? p.nome.slice(0, 30) + '...' : p.nome}
                    <button onClick={() => toggleProduto(p)}><X size={12} /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 1: Produtos Preview */}
      {step === 1 && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6">
          <h2 className="text-sm font-bold text-bibelo-text mb-1 flex items-center gap-2">
            <Sparkles size={16} className="text-bibelo-primary" />
            Produtos selecionados ({produtos.length})
          </h2>
          <p className="text-xs text-bibelo-muted mb-4">Estes produtos vão aparecer no email. Confira antes de continuar.</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {produtos.map((p, i) => (
              <div key={i} className="bg-bibelo-bg border border-bibelo-border rounded-lg overflow-hidden">
                {p.img ? (
                  <img src={p.img} alt={p.nome} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-gradient-to-br from-pink-100 to-yellow-50 flex items-center justify-center text-3xl">🎀</div>
                )}
                <div className="p-3">
                  <p className="text-xs font-medium text-bibelo-text line-clamp-2">{p.nome}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-bibelo-text">{formatCurrency(p.preco)}</span>
                    {p.estoque <= 3 && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-red-400/10 text-red-400 rounded-full font-medium">
                        {p.estoque} un
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Público */}
      {step === 2 && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6">
          <h2 className="text-sm font-bold text-bibelo-text mb-1 flex items-center gap-2">
            <Users size={16} className="text-bibelo-primary" />
            Selecione o publico
          </h2>
          <p className="text-xs text-bibelo-muted mb-4">Quem vai receber esta campanha?</p>

          <div className="flex gap-2 mb-4">
            {([
              { value: 'todos_com_email', label: 'Todos com email', icon: Users },
              { value: 'todos', label: 'Compraram', icon: Package },
              { value: 'nunca_contatados', label: 'Nunca contatados', icon: Mail },
              { value: 'manual', label: 'Manual', icon: Sparkles },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={async () => {
                  setPublico(opt.value);
                  if (opt.value !== 'manual') {
                    setLoading(true);
                    try {
                      const { data } = await api.post('/campaigns/gerar-personalizada', {
                        categorias: catSelecionadas,
                        produto_ids: produtosSelecionados.map((p) => p.id).filter(Boolean),
                        max_por_categoria: maxPorCat,
                        limite_produtos: selecaoTab === 'novidades' ? novidadesNF.length : limiteProdutos,
                        publico: opt.value,
                        fonte: selecaoTab === 'novidades' ? 'novidades' : undefined,
                      });
                      setDestinatarios(data.destinatarios);
                      setDestSelecionados(data.destinatarios.map((d: Destinatario) => d.id));
                    } catch { /* mantém lista anterior */ }
                    setLoading(false);
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  publico === opt.value
                    ? 'border-bibelo-primary bg-bibelo-primary/10 text-bibelo-primary'
                    : 'border-bibelo-border text-bibelo-muted hover:border-bibelo-primary/40'
                }`}
              >
                <opt.icon size={14} />
                {opt.label}
              </button>
            ))}
          </div>

          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bibelo-muted" />
            <input
              value={destSearch}
              onChange={(e) => setDestSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full pl-9 pr-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text placeholder:text-bibelo-muted/50 focus:outline-none focus:border-bibelo-primary"
            />
          </div>

          <div className="space-y-1 max-h-60 overflow-y-auto">
            <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bibelo-border/30 cursor-pointer border-b border-bibelo-border/50">
              <input
                type="checkbox"
                checked={destSelecionados.length === destinatarios.length && destinatarios.length > 0}
                onChange={() => {
                  if (destSelecionados.length === destinatarios.length) {
                    setDestSelecionados([]);
                  } else {
                    setDestSelecionados(destinatarios.map((d) => d.id));
                  }
                }}
                className="accent-[#8b5cf6]"
              />
              <span className="text-xs font-bold text-bibelo-muted">
                {destSelecionados.length === destinatarios.length ? 'Desmarcar todos' : 'Selecionar todos'} ({destinatarios.length})
              </span>
            </label>

            {destsFiltrados.map((d) => (
              <label key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bibelo-border/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={destSelecionados.includes(d.id)}
                  onChange={() => toggleDest(d.id)}
                  className="accent-[#8b5cf6]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-bibelo-text truncate">{d.nome}</p>
                  <p className="text-xs text-bibelo-muted truncate">{d.email}</p>
                </div>
              </label>
            ))}
          </div>

          <p className="mt-3 text-xs text-bibelo-muted">
            {destSelecionados.length} de {destinatarios.length} selecionados
          </p>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <h2 className="text-sm font-bold text-bibelo-text mb-3 flex items-center gap-2">
              <Eye size={16} className="text-bibelo-primary" />
              Preview do email
            </h2>

            <div className="mb-4">
              <label className="text-xs text-bibelo-muted">Assunto:</label>
              <input
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-bibelo-bg border border-bibelo-border rounded-lg text-sm text-bibelo-text focus:outline-none focus:border-bibelo-primary"
              />
            </div>

            <div className="bg-white rounded-lg border border-bibelo-border overflow-hidden">
              <div
                className="max-h-[600px] overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(
                  html.replace(/\{\{nome\}\}/g, 'Ana Paula').replace(/\{\{unsub_link\}\}/g, '#')
                ) }}
              />
            </div>
          </div>

          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
            <h2 className="text-sm font-bold text-bibelo-text mb-2">Destinatarios ({destSelecionados.length})</h2>
            <div className="flex flex-wrap gap-1.5">
              {destinatarios.filter((d) => destSelecionados.includes(d.id)).map((d) => (
                <span key={d.id} className="text-xs px-2.5 py-1 bg-bibelo-border rounded-full text-bibelo-text">
                  {d.nome.split(' ')[0]} ({d.email})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Enviar */}
      {step === 4 && (
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-6 text-center space-y-6">
          {!enviado ? (
            <>
              <div>
                <Send size={32} className="mx-auto mb-3 text-bibelo-primary" />
                <h2 className="text-lg font-bold text-bibelo-text">Pronto para enviar?</h2>
                <p className="text-sm text-bibelo-muted mt-1">
                  {destSelecionados.length} destinatario(s) · {produtos.length} produtos · {catSelecionadas.join(', ')}
                </p>
              </div>

              <div className="flex items-center gap-3 justify-center">
                <button
                  onClick={enviarTeste}
                  disabled={loading || testeEnviado}
                  className="flex items-center gap-2 px-5 py-2.5 border border-bibelo-primary text-bibelo-primary rounded-lg text-sm font-medium hover:bg-bibelo-primary/10 transition-colors disabled:opacity-50"
                >
                  <Mail size={14} />
                  {testeEnviado ? 'Teste enviado' : loading ? 'Enviando...' : 'Enviar teste para mim'}
                </button>

                <button
                  onClick={disparar}
                  disabled={enviando}
                  className="flex items-center gap-2 px-5 py-2.5 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/90 transition-colors disabled:opacity-50"
                >
                  <Send size={14} />
                  {enviando ? 'Enviando...' : `Disparar para ${destSelecionados.length} cliente(s)`}
                </button>
              </div>

              {!testeEnviado && (
                <div className="flex items-center gap-2 justify-center text-amber-400">
                  <AlertTriangle size={14} />
                  <span className="text-xs">Recomendamos enviar um teste antes de disparar</span>
                </div>
              )}
            </>
          ) : (
            <div>
              <div className="w-16 h-16 rounded-full bg-emerald-400/10 flex items-center justify-center mx-auto mb-4">
                <Check size={32} className="text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-bibelo-text">Campanha enviada!</h2>
              <p className="text-sm text-bibelo-muted mt-1">
                {destSelecionados.length} email(s) em envio. Acompanhe na página de Campanhas.
              </p>
              <button
                onClick={() => navigate('/campanhas')}
                className="mt-4 px-5 py-2.5 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/90 transition-colors"
              >
                Ver Campanhas
              </button>
            </div>
          )}
        </div>
      )}

      {/* Footer: navegação */}
      {step < 4 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="flex items-center gap-1 text-sm text-bibelo-muted hover:text-bibelo-text disabled:opacity-30"
          >
            <ChevronLeft size={14} /> Voltar
          </button>

          <button
            onClick={avancar}
            disabled={
            loading ||
            (step === 0 && selecaoTab !== 'novidades' && catSelecionadas.length === 0 && produtosSelecionados.length === 0) ||
            (step === 0 && selecaoTab === 'novidades' && novidadesNF.length === 0) ||
            (step === 2 && destSelecionados.length === 0)
          }
            className="flex items-center gap-2 px-5 py-2.5 bg-bibelo-primary text-white rounded-lg text-sm font-medium hover:bg-bibelo-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Carregando...' : step === 3 ? 'Ir para envio' : 'Continuar'}
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
