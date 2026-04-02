# Analise Completa do Site NuvemShop — Papelaria Bibelo

> Documento de referencia para migracao NuvemShop -> Next.js + Medusa.js
> Data: 01 de Abril de 2026
> Fonte dos dados: banco PostgreSQL (sync.nuvemshop_products, sync.bling_products), codigo-fonte do BibeloCRM, memoria do projeto, API NuvemShop raw data

---

## NOTA IMPORTANTE

O site `www.papelariabibelo.com.br` esta atras do Cloudflare Challenge (protecao anti-bot), impedindo scraping direto. Esta analise foi construida a partir de:
1. **Dados sincronizados no banco** — 118 produtos NuvemShop, 390 produtos Bling
2. **Raw data da API NuvemShop** — URLs canonicas, categorias, handles, imagens
3. **Configuracoes do BibeloCRM** — popup, tracking, fluxos, templates
4. **Memoria do projeto** — cores, fontes, GTM, WhatsApp, dados da empresa
5. **Documentacao existente** — arquitetura, integracoes, padroes

---

## 1. IDENTIDADE DA LOJA

| Campo | Valor |
|-------|-------|
| Nome | Papelaria Bibelo |
| CNPJ | 63.961.764/0001-63 |
| Cidade | Timbo/SC |
| Email | contato@papelariabibelo.com.br |
| WhatsApp | (47) 9 3386-2514 |
| Instagram | @papelariabibelo |
| Google Reviews | 5.0 (5 avaliacoes) |
| Plataforma | NuvemShop (store ID: 7290881, app ID: 26424) |
| Dominio | www.papelariabibelo.com.br |
| CDN Imagens | dcdn-us.mitiendanube.com/stores/007/290/881/ |
| Plano NuvemShop | Nao determinado (provavelmente Essencial ou Plus) |

---

## 2. ESQUEMA DE CORES E FONTES

### Cores principais
| Elemento | Cor | Hex |
|----------|-----|-----|
| Fundo geral / rosa claro | Rosa bebe | `#ffe5ec` |
| Destaque / botoes / CTA | Pink vibrante | `#fe68c4` |
| Header e Footer | Amarelo claro | `#fff7c1` |
| Gradiente CTA | Pink -> rosa | `#fe68c4` -> `#f472b6` |
| Input borders | Rosa suave | `#ffe5ec` |
| Texto principal | Escuro | `#333333` |
| Texto secundario | Cinza | `#777777` |
| Fundo popup header | Amarelo | `#fff7c1` com borda `#fe68c4` |

### Fontes
| Uso | Fonte | Peso |
|-----|-------|------|
| Global (NuvemShop) | **Jost** | 500 (medium) |
| Popup/Scripts CRM | **Jost** | 400, 500, 600, 700 |

### Observacoes de design
- Estilo feminino, delicado, papelaria premium
- Bordas arredondadas (12px-20px nos componentes)
- Sombras suaves com tom rosa: `rgba(254,104,196,0.25)`
- Transicoes suaves (0.2s-0.4s)
- Gradientes predominantes no CTA principal

---

## 3. ESTRUTURA DE URLs

### Padrao NuvemShop
```
Homepage:    /
Produto:     /produtos/{slug}/
Categoria:   /{handle}/           (ex: /caneta/, /caderno/)
Busca:       /busca?q={termo}
Carrinho:    /cart/ ou /carrinho/
Checkout:    /checkout/
```

### URLs de categorias ativas (36 total)
| Categoria | URL | Produtos |
|-----------|-----|----------|
| Todas as Categorias | /todas-as-categorias/ | 108 |
| Novidades | /novidades/ | 46 |
| Caneta | /caneta/ | 20 |
| Caderno | /caderno/ | 14 |
| Post-it | /post-it/ | 13 |
| Marca Texto | /marca-texto/ | 11 |
| Perfume para Papel | /perfume-para-papel/ | 6 |
| Borracha | /borracha/ | 5 |
| Clips | /clips/ | 4 |
| Promocoes | /promocoes/ | 4 |
| Porta Caneta | /porta-caneta/ | 4 |
| Papel de Carta | /papel-de-carta1/ | 4 |
| Lapiseira | /lapiseira/ | 4 |
| Bloco de Anotacoes | /bloco-de-anotacoes/ | 3 |
| Tesoura | /tesoura/ | 3 |
| Cola | /cola/ | 3 |
| Regua | /regua/ | 2 |
| Hidrocor | /hidrocor/ | 2 |
| Apontador | /apontador/ | 2 |
| Lapis de Cor | /lapis-de-cor/ | 2 |
| Caderneta | /caderneta/ | 2 |
| Marca Pagina | /marca-pagina/ | 2 |
| Grafite | /grafite/ | 2 |
| Lapis | /lapis/ | 2 |
| Prancheta | /prancheta/ | 2 |
| Grampeador | /grampeador/ | 1 |
| Agenda | /agenda1/ | 1 |
| Bobbie Goods | /bobbie-goods/ | 1 |
| Porta Clips | /porta-clips/ | 1 |
| Mousepad | /mousepad/ | 1 |
| Corretivo | /corretivo/ | 1 |
| Protetor de Carregador de Celular | /protetor-de-carregador-de-celular/ | 1 |

### Subcategorias (Caneta)
| Subcategoria | Handle | Categoria pai |
|--------------|--------|---------------|
| Gel | /gel/ | Caneta |
| Esferografica | /esferografica/ | Caneta |
| Acrilica | /acrilica/ | Caneta |

### Subcategorias (Caderno)
| Subcategoria | Handle | Categoria pai |
|--------------|--------|---------------|
| Cadernico | /cadernico/ | Caderno |

### Subcategorias (Cola)
| Subcategoria | Handle | Categoria pai |
|--------------|--------|---------------|
| 2 subcategorias nao nomeadas nos dados | — | Cola |

---

## 4. CATALOGO DE PRODUTOS

### Estatisticas gerais
| Metrica | Valor |
|---------|-------|
| Produtos na NuvemShop | 118 publicados |
| Produtos no Bling (total) | 390 |
| Produtos Bling ativos | 376 |
| Categorias Bling distintas | 37 |
| Categorias NuvemShop raiz | 32 |
| Subcategorias NuvemShop | 4 |
| Marcas distintas | 20 |
| Produtos com estoque > 0 | 84 (71%) |
| Produtos sem estoque | 34 (29%) |
| Preco minimo | R$ 2,50 |
| Preco maximo | R$ 69,90 |
| Preco medio | R$ 16,72 |
| Preco mediano | R$ 12,90 |

### Distribuicao por faixa de preco
| Faixa | Quantidade | Percentual |
|-------|-----------|-----------|
| R$ 0-9,99 | 51 | 43% |
| R$ 10-19,99 | 28 | 24% |
| R$ 20-29,99 | 27 | 23% |
| R$ 30-49,99 | 8 | 7% |
| R$ 50+ | 4 | 3% |

### Top categorias Bling por produtos ativos
| Categoria | Qtd |
|-----------|-----|
| (sem categoria) | 78 |
| Caneta | 68 |
| Marcador de Texto | 35 |
| Caderno | 27 |
| Borracha | 15 |
| Post-it | 13 |
| Lapiseira | 13 |
| Agenda | 13 |
| Caderneta | 12 |
| Lapis | 12 |
| Porta Caneta | 9 |
| Cadernico | 6 |
| Perfume para Papel | 6 |
| Apontador | 6 |
| Kit Presente | 6 |

### Marcas presentes (NuvemShop)
| Marca | Produtos |
|-------|----------|
| BRW | 27 |
| BUENDIA | 26 |
| LEONORA | 10 |
| TRIS | 9 |
| CIS | 7 |
| TILIBRA | 5 |
| IMPORTADO/IMPORTADOS | 5 |
| BAZZE | 3 |
| MOLIN | 3 |
| YINS | 3 |
| ANIMATIVA | 2 |
| FABER CASTELL | 2 |
| CADERSIL, WALEU, GOLLER, BIC | 1 cada |

### Produtos mais caros (destaque)
| Produto | Preco |
|---------|-------|
| Caderno Minhas Receitas - Morangos | R$ 69,90 |
| Prancheta Estampada A5 + 30 Folhas Decoradas | R$ 63,50 |
| Prancheta com Folhas Planejamento La Dolce Vita | R$ 63,50 |
| Lapis 12 Cores Faber Castell Sparkle Pastel | R$ 59,90 |
| Caderno 80FLS Cadersil Audrey Colegial | R$ 47,90 |

### Tipos de produtos unicos
- Agendas (Tilibra, Foroni)
- Post-it / Anote & Cole (BRW, CIS, Leonora, Tris)
- Canetas (esferografica, gel, acrilica, apagavel, glitter, fofa/decorativa)
- Cadernos (1x1, colegial, 1/4, espiral)
- Cadernicos/Cadernetas (BRW, Animativa, Cadersil, Buendia)
- Marca-texto (BRW, Leonora, Molin, com glitter, com carimbo)
- Borrachas (formas decorativas, food trends, dino)
- Lapiseiras (multipontas, estampadas, capivara)
- Lapis e Lapis de Cor (Faber Castell, BIC)
- Cola (bastao, fita)
- Clips/Prendedores (coloridos pastel)
- Tesouras (escolar, multiuso premium)
- Organizadores (porta caneta, porta clips, mousepad)
- Reguas (acrilica, stencil)
- Perfumes para papel (Buendia, 6 aromas)
- Papeis de carta com envelopes (La Palomita)
- Blocos de anotacoes (Buendia)
- Pranchetas com folhas
- Marcadores de pagina / eclips decorativos
- Card para colorir (Bobbie Goods)
- Caderno de receitas
- Protetor de carregador de celular
- Kit presente

---

## 5. FORMATO DE IMAGENS

### CDN NuvemShop
- Base URL: `https://dcdn-us.mitiendanube.com/stores/007/290/881/products/`
- Formatos: WEBP e PNG
- Dimensao padrao: 1024x1024
- Multiplas imagens por produto (ate 9 observadas)
- Imagens servidas pelo CDN da Tienda Nube (mitiendanube.com)

### Exemplo de URL de imagem
```
https://dcdn-us.mitiendanube.com/stores/007/290/881/products/
9479b5422fb5b69bd3536d14b2dcb876-ca6a45ba8e4a52872017710257143215-1024-1024.webp
```

### Quantidade de imagens por produto
- Minimo: 1 imagem
- Maximo observado: 9 imagens (caderno Tilibra Abacute)
- Media: ~3 imagens por produto

---

## 6. NAVEGACAO E MENU

### Estrutura de menu NuvemShop (deduzida das categorias)
O menu principal no NuvemShop tipicamente exibe as categorias raiz. Com base nos dados:

**Menu provavel:**
- **Novidades** (46 produtos — provavelmente destaque no menu)
- **Promocoes** (4 produtos — provavelmente destaque visual)
- **Caneta** -> subcategorias: Gel, Esferografica, Acrilica
- **Caderno** -> subcategoria: Cadernico
- **Post-it**
- **Marca Texto**
- **Borracha**
- **Lapiseira**
- **Lapis / Lapis de Cor**
- **Caderneta**
- **Perfume para Papel**
- **Porta Caneta / Porta Clips**
- **Papel de Carta**
- **Clips**
- **Cola** (com 2 subcategorias)
- **+ mais categorias** (regua, tesoura, grampeador, etc.)

### Busca
- NuvemShop oferece busca nativa em `/busca?q=`
- Tracking BibeloCRM registra termos buscados (`search` event)

---

## 7. PAGINA DE PRODUTO (estrutura NuvemShop padrao)

Com base no tracking script (que faz scraping do DOM NuvemShop):

### Elementos detectaveis na pagina de produto
| Elemento | Seletor CSS (NuvemShop) |
|----------|------------------------|
| Preco | `[data-product-price]`, `.js-price-display`, `.product-price`, `#price_display`, `.js-product-price` |
| Titulo | `meta[property="og:title"]` ou `<title>` |
| Imagem | `meta[property="og:image"]` |
| Preco OG | `meta[property="product:price:amount"]` |

### Meta tags de produto (Open Graph)
- `og:title` — nome do produto
- `og:image` — imagem principal
- `product:price:amount` — preco
- `canonical_url` — URL canonica (ex: `/produtos/caneta-cis-0-7-spiro/`)

### SEO dos produtos
- **Titulos SEO:** nao customizados (campo vazio em todos os produtos analisados)
- **Meta descriptions:** nao customizadas (campo vazio)
- **Handles:** gerados automaticamente a partir do nome (slug)

### Informacoes adicionais na pagina de produto NuvemShop
- Galeria de imagens (slider)
- Variantes (cor, estampa, forma, tamanho — ex: "Cor:Roxo", "Estampa:Capivara")
- Botao "Comprar"
- Calculo de frete (CEP)
- Compartilhar (redes sociais)
- Descricao do produto (texto)

---

## 8. WIDGETS E SCRIPTS ATIVOS

### Google Tag Manager
- **GTM ID:** GTM-M4MVC29L
- **Conta:** carloseduardocostatj@gmail.com
- **Tag ativa:** "Popup Bibelo" — carrega popup.js via webhook.papelariabibelo.com.br

### Google Analytics 4
- **GA4 ID:** G-H92HV033XM

### Facebook Pixel
- **Pixel ID:** 1380166206444041

### Script de Tracking (BibeloCRM)
- **URL:** `webhook.papelariabibelo.com.br/api/tracking/bibelo.js`
- **Funcionalidades:**
  - Visitor ID persistente (cookie `_bibelo_vid`, 365 dias)
  - Captura UTM params (source, medium, campaign, content, term)
  - Deteccao automatica de tipo de pagina (home, produto, categoria, busca, checkout, carrinho)
  - Extracao de dados do produto (nome, preco, imagem via OG tags e DOM)
  - Debounce de 3s entre eventos
  - Envio via `sendBeacon` (nao bloqueia navegacao)
  - Registra: page_view, product_view, checkout_start, search

### Popup de Captura de Leads (BibeloCRM)
- **URL:** `webhook.papelariabibelo.com.br/api/leads/popup.js`
- **2 popups ativos:**

| Popup | Tipo | Delay | Campos | Cupom | Exibicoes | Capturas |
|-------|------|-------|--------|-------|-----------|----------|
| "Ganhe 10% na sua primeira compra!" | Timer | 8s | email, nome, telefone | BIBELO10 | 89 | 8 |
| "Ei, nao vai embora!" | Exit intent | 0s | email, telefone | BIBELO10 | 7 | 1 |

- **Design do popup:** Fundo branco, header amarelo (#fff7c1), badge gradiente pink, botao "Quero meu cupom!", border-radius 20px, fonte Jost
- **Comportamento:** Cookie 30 dias para nao repetir, cookie `_bibelo_lead` permanente apos captura
- **Fluxo pos-captura:** Verificacao de email via HMAC link -> cupom enviado por email

### Botao WhatsApp (planejado, nao implementado ainda)
- **Planejado:** Botao flutuante "Preciso de ajuda" em paginas de produto
- **URL:** `wa.me/5547933862514?text=...` com nome/preco/URL do produto
- **Status:** P2 no backlog, sera implementado via bibelo.js + GTM

---

## 9. FLUXOS AUTOMATICOS (pos-migracao)

Os fluxos que rodam hoje via BibeloCRM continuam funcionando no novo site:

| Fluxo | Gatilho | Status |
|-------|---------|--------|
| Boas-vindas novo cliente | order.first | Ativo |
| Pos-compra agradecimento | order.paid | Ativo |
| Avaliacao pos-entrega | order.delivered | Ativo |
| Recuperacao de carrinho | order.abandoned | Ativo |
| Lead boas-vindas cupom | lead.captured | Ativo |
| Lead quente — nao comprou | lead.cart_abandoned | Ativo |
| Nutricao de lead | lead.captured | Ativo |
| Visitou mas nao comprou | product.interested | Ativo |
| Recuperacao inativo | customer.inactive | Ativo |

### Templates de email (15 total)
- Agradecimento, Boas-vindas (3 variantes), Carrinho abandonado
- Lead boas-vindas cupom, Novidades da Semana, Novidades do Mes
- Pedido de avaliacao, Produto visitado, Promocao Especial
- Reativacao, Sentimos sua falta, Volta as Aulas, Ultima chance

---

## 10. PROVA SOCIAL (Google Reviews)

5 avaliacoes, media **5.0 estrelas**:

| Autor | Nota | Resumo |
|-------|------|--------|
| Cris Costa | 5 | "Produtos otimos, atendimento otimo" |
| Bruna Caroline | 5 | "Atendimento excelente, entrega rapida, mimo na encomenda, precos acessiveis" |
| Sonia Rosane | 5 | "Atendimento diferenciado com carinho, produtos lindos. Amei minha agenda" |
| Isa | 5 | "Produtos de boa qualidade e lindos, atendimento bom" |
| Bruna Penz | 5 | "Opcoes incriveis, bem embalado, Julia tem carisma incrivel" |

**Link para reviews:** https://g.page/r/CdahFa43hhIXEAE/review

---

## 11. ESTRUTURA DE PAGINAS NUVEMSHOP (padrao da plataforma)

### Header (estrutura tipica NuvemShop)
- Logo da loja
- Menu de categorias (hamburger no mobile)
- Barra de busca
- Icone do carrinho (com contador)
- Icone de login/conta
- Possivelmente: barra de anuncio superior (frete gratis, promocao)

### Homepage (estrutura tipica NuvemShop)
- **Banner/Hero:** Slider de banners (imagens configuradas no admin NuvemShop)
- **Secao Novidades:** 46 produtos marcados como "Novidades"
- **Secao Promocoes:** 4 produtos marcados como "Promocoes"
- **Grid de categorias:** Icones ou imagens das categorias
- **Produtos em destaque:** Grid com foto, nome, preco
- **Banner intermediario:** Promocional
- **Selos de confianca:** Compra segura, entrega rapida

### Footer (estrutura tipica NuvemShop)
- **Coluna 1:** Sobre a loja / Quem Somos
- **Coluna 2:** Links uteis (Politica de privacidade, Trocas e devolucoes, FAQ)
- **Coluna 3:** Contato (email, telefone, WhatsApp, endereco)
- **Redes sociais:** Instagram (@papelariabibelo)
- **Metodos de pagamento:** Icons (PIX, cartao, boleto)
- **Selo NuvemShop:** "Loja segura" / "Criado com NuvemShop"
- **CNPJ e razao social**

### Paginas institucionais (padrao NuvemShop)
- `/quem-somos/`
- `/politica-de-privacidade/`
- `/trocas-e-devolucoes/`
- `/formas-de-pagamento/`
- `/formas-de-envio/`
- `/termos-e-condicoes/`

---

## 12. CHECKOUT E PAGAMENTO

### Metodos de pagamento (NuvemShop atual)
- PIX
- Cartao de credito (parcelado)
- Boleto bancario
- Provavelmente: Mercado Pago como gateway principal

### Frete
- Calculo por CEP (Correios / transportadoras via NuvemShop)
- Nenhum produto marcado como frete gratis nos dados analisados
- **Migracao:** Melhor Envio sera o provider de frete no Medusa.js

---

## 13. DADOS PARA MIGRACAO (Redirects 301)

### URLs de produto a redirecionar (118 URLs)
Todas seguem o padrao: `www.papelariabibelo.com.br/produtos/{slug}/`

Exemplo de redirects necessarios:
```
/produtos/caneta-cis-0-7-spiro/                    -> /produto/caneta-cis-0-7-spiro
/produtos/caderno-01x1-cd-80fls-tilibra-abacute/   -> /produto/caderno-01x1-cd-80fls-tilibra-abacute
/novidades/                                         -> /produtos?categoria=novidades
/caneta/                                            -> /produtos?categoria=caneta
```

### URLs de categoria a redirecionar (36 URLs)
Categorias raiz NuvemShop usam `/{handle}/`, no novo site sera `/produtos?categoria={handle}` ou `/categoria/{handle}`.

---

## 14. METRICAS DE BASE

| Metrica | Valor |
|---------|-------|
| Clientes no CRM | 128 |
| Leads capturados | 4 |
| Popups exibidos | 96 (89 timer + 7 exit) |
| Taxa de conversao popup | 9.4% (9/96) |
| Grupo WhatsApp VIP | 115 membros |
| Reviews Google | 5 (todas 5 estrelas) |

---

## 15. FUNCIONALIDADES A REPLICAR NO NOVO SITE

### Obrigatorias (existem hoje)
- [x] Catalogo de produtos com categorias e subcategorias
- [x] Pagina de produto com galeria, variantes, descricao, preco
- [x] Busca de produtos
- [x] Carrinho de compras
- [x] Checkout com calculo de frete
- [x] Pagamento (PIX, cartao, boleto)
- [x] Conta do cliente (login, pedidos, endereco)
- [x] Popup de captura de leads
- [x] Tracking comportamental (page views, produto visitado)
- [x] Script de UTM tracking
- [x] Google Analytics 4
- [x] Facebook Pixel
- [x] Meta tags OG para compartilhamento social
- [x] Responsivo mobile

### Melhorias planejadas (nao existem hoje)
- [ ] Botao WhatsApp contextual por produto
- [ ] Reviews de clientes no site (Google Reviews ja coletados)
- [ ] Widget de chat (Chatwoot)
- [ ] SEO otimizado (titulos e descricoes customizados — hoje estao vazios!)
- [ ] Sitemap XML dinamico
- [ ] Structured data (JSON-LD para Product, BreadcrumbList, Organization)
- [ ] Performance (SSG/ISR com Next.js vs SPA NuvemShop)
- [ ] Design proprio (sem limitacoes de tema NuvemShop)
- [ ] Filtros avancados (preco, marca, cor, tipo)
- [ ] Wishlist
- [ ] Comparacao de produtos
- [ ] Notificacoes de estoque (produto indisponivel -> avisar quando chegar)
- [ ] Blog / conteudo

---

## 16. PROBLEMAS ATUAIS (oportunidades de melhoria)

1. **SEO fraco** — Nenhum produto tem titulo ou descricao SEO customizada
2. **Categorias desorganizadas** — 78 produtos Bling sem categoria atribuida
3. **29% sem estoque** — 34 de 118 produtos publicados estao sem estoque
4. **Sem precos promocionais** — Nenhum produto com `promotional_price` nos dados
5. **Frete nunca gratis** — Nenhum produto com `free_shipping: true`
6. **Poucos reviews** — Apenas 5 reviews no Google
7. **Poucas fotos** — Alguns produtos com apenas 1 imagem
8. **Nomes pouco amigaveis** — Produtos com nomes tecnicos (ex: "ANOTE COLE BRW 76X76 30FLS PRETO")
9. **Handles duplicados** — Alguns produtos com handle redundante (ex: `anote-cole-brw-38x51...` e `anote-cole-brw-38x51...1`)
10. **Popup com conversao ok** — 9.4% e razoavel, mas pode melhorar com A/B testing

---

## 17. CLOUDFLARE / DNS / SSL

- **DNS:** Cloudflare (proxied)
- **SSL:** Let's Encrypt (via Nginx no VPS) + Cloudflare edge SSL
- **Challenge ativo:** Bot protection Cloudflare (chl_page)
- **Implicacao para migracao:** Ao apontar DNS para o VPS, desativar proxy Cloudflare ou configurar Cloudflare para o novo site

---

## 18. RESUMO EXECUTIVO

A Papelaria Bibelo opera uma loja NuvemShop com **118 produtos publicados** em **32 categorias**, focada em papelaria criativa, feminina e premium. O ticket medio e de R$ 16,72, com 43% dos produtos abaixo de R$ 10. Principais marcas: BRW, Buendia, Leonora, Tris, CIS.

O site ja conta com tracking comportamental proprio (BibeloCRM), popup de captura de leads, 10 fluxos de email automaticos e integracao com Bling ERP. A infraestrutura de marketing esta madura.

**Gaps principais para o novo site:**
1. SEO (titulos, descricoes, structured data)
2. Reviews no site
3. Design proprio sem restricoes de tema
4. Filtros e busca avancada
5. Performance (SSG/ISR vs SPA)
6. Botao WhatsApp por produto
7. Chat integrado (Chatwoot)

**Migracao critica:** 118 URLs de produto + 36 URLs de categoria precisam de redirect 301 para manter SEO.

---

*Documento gerado em 01/04/2026 — Blueprint para migracao NuvemShop -> Next.js + Medusa.js*
