# Requisitos do Storefront — Papelaria Bibelô

> Documento de requisitos para a construção do site próprio (Next.js + Medusa.js)
> Substitui a NuvemShop com controle total sobre UX, integrações e funcionalidades.
> Data: 1 de abril de 2026

---

## 1. Visão geral

O storefront é a vitrine pública da Papelaria Bibelô — acessível em `papelariabibelo.com.br`.
Consome dados do **Medusa.js** (motor e-commerce, porta 9000) e integra-se com o **BibelôCRM** (marketing, leads, tracking).

### Princípio fundamental

> **Bling é a fonte da verdade.** Produtos, categorias, estoque e imagens partem do Bling.
> O Medusa recebe tudo via sync automático. Nunca cadastrar dados manualmente no Medusa.

### Pipeline de dados

```
Bling ERP (fonte da verdade)
    │
    ├── Produtos, categorias, preços, estoque
    ├── Imagens (editadas/convertidas via Editor de Imagens do CRM)
    │
    ▼
Sync automático (BullMQ)
    │
    ▼
Medusa.js (motor e-commerce)
    │
    ├── Carrinho, pedidos, cupons, clientes
    ├── Pagamento (Mercado Pago)
    ├── Frete (Melhor Envio)
    │
    ▼
Next.js Storefront (vitrine pública)
    │
    ├── SSG/ISR para catálogo (SEO)
    ├── SSR para carrinho/checkout (tempo real)
    │
    ▼
Cliente final
```

### Pipeline de imagens

```
Foto do distribuidor/fornecedor
    │
    ▼
Editor de Imagens (BibelôCRM)
    ├── Upload (drag-and-drop, até 50 imagens)
    ├── Conversão via Sharp (redimensiona, fundo branco, preset)
    ├── Presets: Shopee, NuvemShop, Loja Própria, Instagram
    │
    ▼
Envio ao Bling (PATCH /produtos/{id} com imagensURL)
    ├── Bling baixa, processa, armazena no S3 interno
    │
    ▼
Sync Bling → Medusa (imagens chegam automaticamente)
    │
    ▼
Storefront exibe via Next.js Image (otimização automática)
```

---

## 2. Identidade visual e design

### Paleta de cores

| Token | Cor | Hex | Uso |
|-------|-----|-----|-----|
| cream | Creme | `#FAF7F2` | Fundo geral |
| warm | Quente | `#F2EBE0` | Fundo de cards |
| blush | Blush | `#EDD5C5` | Destaques suaves |
| rose | Rosê | `#C9896A` | CTAs, botões, links |
| bark | Casca | `#3D2B1F` | Texto principal, contraste |
| sage | Sálvia | `#8A9E8C` | Acentos verdes, tags |

### Tipografia

| Uso | Fonte | Peso |
|-----|-------|------|
| Títulos | Cormorant Garamond (serif) | 400, 500, 600, 700 |
| Corpo | DM Sans (sans-serif) | 400, 500, 700 |

### Regras de design

- Tom: papelaria premium, minimalista, feminino sem ser infantil
- **Nunca:** cores frias, Inter/Roboto/fontes genéricas, layouts 100% simétricos, "AI purple"
- Mobile first — 80% do tráfego é mobile
- Bordas suaves (8px–16px)
- Sombras sutis com tom quente
- Transições suaves (0.2s–0.3s)
- Imagens com lazy load + blur placeholder
- Skeleton loading em todos os fetches
- Mensagens de erro amigáveis em pt-BR

---

## 3. Idioma e ortografia

**Todo o site em português brasileiro (pt-BR), seguindo a norma culta.**

- Acentos gráficos corretos (é, ê, ã, õ, ç)
- Concordância verbal e nominal
- Sem abreviações informais
- Sem anglicismos desnecessários (usar "carrinho" em vez de "cart", "busca" em vez de "search")
- Preços no formato brasileiro: R$ 59,90 (vírgula decimal)
- Datas no formato brasileiro: 01/04/2026

---

## 4. Estrutura de URLs

**URLs limpas, sem prefixo de país** (loja opera apenas no Brasil).

| Página | URL | Renderização |
|--------|-----|-------------|
| Home | `/` | SSG + ISR |
| Produto | `/produto/[handle]` | SSG + ISR |
| Categoria | `/categoria/[...slug]` | SSG + ISR |
| Todos os produtos | `/produtos` | SSG + ISR |
| Busca | `/busca?q=` | SSR |
| Carrinho | `/carrinho` | SSR |
| Checkout | `/checkout` | SSR |
| Minha conta | `/conta` | SSR (auth) |
| Pedidos | `/conta/pedidos` | SSR (auth) |
| Detalhes pedido | `/conta/pedidos/[id]` | SSR (auth) |
| Confirmação | `/pedido/[id]/confirmado` | SSR |
| Quem somos | `/quem-somos` | SSG |
| Privacidade | `/politica-de-privacidade` | SSG |
| Trocas | `/trocas-e-devolucoes` | SSG |

---

## 5. Páginas e funcionalidades

### 5.1 Home (`/`)

| Seção | Descrição |
|-------|-----------|
| Hero | Banner principal com imagem/gradiente, título, CTA "Ver Novidades" |
| Categorias | Pills ou cards horizontais com scroll (32 categorias) |
| Novidades | Rail de produtos (coleção "Novidades") |
| Mais vendidos | Rail de produtos (coleção "Mais Vendidos") |
| Promoções | Rail com badge de desconto |
| Selos de confiança | Envio seguro, Pix com desconto, frete grátis acima de R$ 199 |
| Avaliações | Google Reviews 5.0 (5 avaliações reais) |
| Captura de leads | Seção newsletter / integração com popup |

### 5.2 Produto (`/produto/[handle]`)

| Elemento | Descrição |
|----------|-----------|
| Galeria | Imagens com zoom, thumbnails, lazy load |
| Informações | Título, marca, preço (R$), variantes (cor, tamanho), estoque |
| Ações | "Adicionar ao carrinho", quantidade, "Indisponível" se sem estoque |
| Frete | Calculadora de frete por CEP (Melhor Envio via Medusa) |
| WhatsApp | Botão "Dúvidas? Fale conosco" → wa.me com nome/preço do produto |
| Descrição | Abas: Descrição, Características, Informações de envio |
| Relacionados | "Produtos relacionados" (mesma categoria) |
| SEO | Structured data Product, breadcrumbs, meta tags OG |

### 5.3 Categoria (`/categoria/[slug]`)

| Elemento | Descrição |
|----------|-----------|
| Cabeçalho | Nome da categoria, descrição, contagem de produtos |
| Subcategorias | Pills navegáveis (ex.: Caneta → Gel, Esferográfica, Acrílica) |
| Filtros | Preço (faixa), marca, ordenação |
| Grid | Cards de produto responsivos (2 colunas mobile, 3–4 desktop) |
| Paginação | Scroll infinito ou "Carregar mais" |
| SEO | Structured data CollectionPage, BreadcrumbList |

### 5.4 Todos os produtos (`/produtos`)

- Grid com todos os produtos
- Ordenação: Lançamentos, Preço menor → maior, Preço maior → menor
- Filtros laterais no desktop, drawer no mobile

### 5.5 Busca (`/busca?q=`)

- Campo de busca no header (acessível em todas as páginas)
- Resultados em grid
- "Nenhum resultado para '[termo]'" quando vazio
- Sugestões de categorias populares quando sem resultado
- `noindex` para SEO (evitar conteúdo duplicado)

### 5.6 Carrinho (`/carrinho`)

| Elemento | Descrição |
|----------|-----------|
| Itens | Imagem, nome, variante, preço, quantidade editável, remover |
| Resumo | Subtotal, frete estimado, desconto, total |
| Cupom | Campo "Cupom de desconto" (ex.: BIBELO10) |
| Frete grátis | Barra de progresso: "Faltam R$ X para frete grátis!" |
| CTA | "Finalizar compra" |
| Carrinho vazio | Mensagem + "Continue comprando" |

### 5.7 Checkout (`/checkout`)

| Etapa | Campos |
|-------|--------|
| 1. Endereço | Nome, sobrenome, e-mail, telefone, CEP, endereço, número, complemento, cidade, estado |
| 2. Entrega | Opções: PAC, SEDEX (Melhor Envio), prazo e preço |
| 3. Pagamento | Pix (QR Code + código copia-e-cola + countdown) |
| 4. Revisão | Resumo completo, "Finalizar Pedido" |

**Pagamento:**
- Mercado Pago como provider principal
- Pix primeiro (checkout transparente, QR Code no site)
- Cartão de crédito em fase futura
- Polling automático do status do pagamento

### 5.8 Conta do cliente (`/conta`)

- Login / Registro em português
- Visão geral da conta
- Perfil (nome, e-mail, telefone)
- Endereços salvos
- Histórico de pedidos
- Detalhes do pedido com status e rastreio

### 5.9 Confirmação de pedido (`/pedido/[id]/confirmado`)

- Número do pedido
- Status do pagamento (Pix: aguardando / confirmado)
- Resumo dos itens
- Endereço de entrega
- Previsão de entrega

### 5.10 Páginas institucionais

| Página | Conteúdo |
|--------|----------|
| Quem somos | História da Papelaria Bibelô, Timbó/SC, missão, equipe |
| Política de privacidade | LGPD, cookies, dados coletados |
| Trocas e devoluções | Prazo, condições, processo |

---

## 6. SEO

### Meta tags

- Title template: `%s | Papelaria Bibelô`
- Default description: sobre a loja e produtos
- Open Graph: locale `pt_BR`, imagens de produto
- Canonical URLs em todas as páginas

### Structured data (JSON-LD)

| Página | Schema |
|--------|--------|
| Home | Organization, WebSite (com SearchAction) |
| Produto | Product (com Offer, AggregateRating) |
| Categoria | CollectionPage, BreadcrumbList |
| Institucional | WebPage |

### Sitemap e Robots

- Sitemap XML dinâmico (todos os produtos, categorias, institucionais)
- robots.txt: allow `/`, disallow `/checkout`, `/conta`

### Redirects 301 (migração NuvemShop)

- **118 URLs de produto:** `/produtos/{slug}/` → `/produto/{slug}`
- **36 URLs de categoria:** `/{handle}/` → `/categoria/{handle}`
- **Institucionais:** `/paginas/quem-somos/` → `/quem-somos`, etc.

**Crítico:** manter o SEO existente. Nenhuma URL antiga pode retornar 404.

---

## 7. Integrações

### 7.1 BibelôCRM (tracking + marketing)

| Integração | Detalhes |
|-----------|----------|
| bibelo.js | Tracking comportamental: page_view, product_view, search, checkout_start |
| popup.js | Captura de leads: timer 8s + exit intent, cupom BIBELO10 |
| Fluxos automáticos | 10 fluxos ativos (boas-vindas, pós-compra, carrinho abandonado, reativação) |
| Endpoint | `webhook.papelariabibelo.com.br/api/tracking/` e `/api/leads/` |

### 7.2 Google Analytics + Facebook

| Serviço | ID |
|---------|-----|
| GTM | GTM-M4MVC29L |
| GA4 | G-H92HV033XM |
| Facebook Pixel | 1380166206444041 |

### 7.3 WhatsApp

- Botão flutuante em todas as páginas (canto inferior direito)
- Na página de produto: mensagem contextual com nome e preço
- Número: (47) 9 3386-2514
- Link: `wa.me/5547933862514?text=...`

### 7.4 Google Reviews

- 5 avaliações, média 5.0
- Exibir na home com AggregateRating schema
- Link para avaliação: `https://g.page/r/CdahFa43hhIXEAE/review`

### 7.5 Chatwoot (futuro)

- Widget de chat no site
- WhatsApp + Instagram DM no mesmo painel
- Integração com timeline do CRM

---

## 8. Performance

| Requisito | Meta |
|-----------|------|
| LCP (Largest Contentful Paint) | < 2,5s |
| FID (First Input Delay) | < 100ms |
| CLS (Cumulative Layout Shift) | < 0,1 |
| Lighthouse mobile | > 90 |

### Estratégias

- SSG + ISR para páginas de catálogo
- Next.js Image com otimização automática (WebP, lazy load, blur placeholder)
- Fonts via `next/font` (sem FOUT)
- Scripts de terceiros via `<Script strategy="lazyOnload">`
- Cache /_next/static/ com max-age 1 ano (immutable)

---

## 9. Infraestrutura

### Docker

```yaml
storefront:
  build: ./storefront
  container_name: bibelo_storefront
  ports: "127.0.0.1:8000:8000"
  depends_on: medusa (service_healthy)
  networks: bibelo_network
```

### Nginx

- `papelariabibelo.com.br` e `www.papelariabibelo.com.br` → proxy para porta 8000
- SSL via Let's Encrypt (certbot)
- Cache para assets estáticos
- Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)

### Variáveis de ambiente

```env
MEDUSA_BACKEND_URL=http://bibelo_medusa:9000
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_042f8180...
NEXT_PUBLIC_BASE_URL=https://papelariabibelo.com.br
NEXT_PUBLIC_DEFAULT_REGION=br
```

---

## 10. Dados atuais para referência

### Catálogo

| Métrica | Valor |
|---------|-------|
| Produtos no Bling (total) | 390 |
| Produtos ativos no Bling | 376 |
| Produtos na NuvemShop | 118 |
| Produtos no Medusa | 373 |
| Categorias NuvemShop | 32 raiz + 4 subcategorias |
| Marcas distintas | 20 |
| Preço mínimo | R$ 2,50 |
| Preço máximo | R$ 69,90 |
| Preço médio | R$ 16,72 |

### Top categorias (por quantidade de produtos)

1. Caneta (68) — subcategorias: Gel, Esferográfica, Acrílica
2. Marcador de Texto (35)
3. Caderno (27) — subcategoria: Caderninho
4. Borracha (15)
5. Post-it (13)
6. Lapiseira (13)
7. Agenda (13)
8. Caderneta (12)
9. Lápis (12)
10. Porta-caneta (9)

### Top marcas

1. BRW (27)
2. Buendia (26)
3. Leonora (10)
4. Tris (9)
5. CIS (7)
6. Tilibra (5)

### Marketing ativo

| Métrica | Valor |
|---------|-------|
| Clientes no CRM | 128 |
| Leads capturados | 4 |
| Popups exibidos | 96 |
| Taxa de conversão popup | 9,4% |
| Grupo WhatsApp VIP | 115 membros |
| Fluxos automáticos | 10 ativos |
| Templates de e-mail | 15 |

---

## 11. Fases de implementação

### Fase 0 — Sync Bling → Medusa (pré-requisito)
Criar pipeline de sync: categorias, produtos, imagens e estoque do Bling para o Medusa.

### Fase 1 — Fundação: URLs, locale, design tokens
Remover /[countryCode]/, reestruturar rotas em pt-BR, instalar fontes e paleta.

### Fase 2 — Layout: Nav, Footer, SEO base
Header com logo e categorias, footer com dados da loja, meta tags.

### Fase 3 — Home + páginas de produto
Hero, rails de novidades/promoções, página de produto completa com structured data.

### Fase 4 — Categoria, loja, busca
Filtros, ordenação, página de busca.

### Fase 5 — Carrinho, checkout, Pix
Fluxo de compra completo com Mercado Pago Pix.

### Fase 6 — Conta, pedidos, institucional
Área do cliente, confirmação de pedido, páginas institucionais.

### Fase 7 — Integrações, SEO avançado, redirects 301
Scripts de tracking, popup, WhatsApp, sitemap, structured data, 301s.

### Fase 8 — Docker, Nginx, deploy
Container, proxy reverso, SSL, produção.

---

## 12. Critérios de aceite

- [ ] Todos os textos em pt-BR, norma culta, sem erros de ortografia
- [ ] Design premium aplicado (paleta cream/rose/bark, Cormorant Garamond + DM Sans)
- [ ] Produtos com imagens vindas do Bling (via sync)
- [ ] Fluxo de compra completo: produto → carrinho → checkout → Pix → confirmação
- [ ] SEO: structured data válido, sitemap, meta tags, OG images
- [ ] Redirects 301 para todas as URLs da NuvemShop
- [ ] Lighthouse mobile > 90
- [ ] Scripts de tracking (GTM, GA4, Pixel, bibelo.js) funcionando
- [ ] Popup de captura de leads ativo
- [ ] Botão WhatsApp visível em todas as páginas
- [ ] Responsivo mobile-first
- [ ] SSL válido em papelariabibelo.com.br

---

*Documento de requisitos — Papelaria Bibelô*
*Criado em 1 de abril de 2026*
*Base: análise completa do site NuvemShop + dados do Medusa + pipeline Bling*
