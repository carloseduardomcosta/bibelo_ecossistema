# Storefront v2 — Documentação Completa

Novo frontend e-commerce da Papelaria Bibelô, substituindo o storefront v1.

**Deploy**: 08/04/2026
**URL**: https://homolog.papelariabibelo.com.br
**Porta**: 8001 (container `bibelo_storefront_v2`)
**Stack**: Next.js 15 + React 19 + TypeScript + Tailwind CSS
**Backend**: Medusa.js v2 (porta 9000, mesmo do v1)

---

## Estrutura de arquivos

```
storefront-v2/
├── Dockerfile                          ← Multi-stage pnpm + standalone
├── .dockerignore
├── next.config.ts                      ← output: standalone, image domains
├── tailwind.config.ts                  ← Paleta Bibelô, fontes Cormorant+Jost
├── package.json                        ← pnpm, porta 8001
├── public/
│   ├── logo-bibelo.png                 ← Logo gatinhos (circular no desktop/menu)
│   ├── titulo-bibelo.png               ← Título "Bibelô Papelaria" (header mobile)
│   └── carousel/
│       ├── pc/                         ← Banners desktop (16:5)
│       │   ├── fretegratis.webp
│       │   ├── 7off.webp
│       │   └── grupo_vip.webp
│       └── mobile/                     ← Banners mobile (4:5 portrait)
│           ├── fretegratis_mobile.webp
│           └── grupovip_mobile.webp
├── src/
│   ├── app/
│   │   ├── layout.tsx                  ← Root layout, viewport-fit, theme-color
│   │   ├── globals.css                 ← Cormorant Garamond + Jost, componentes
│   │   └── (main)/
│   │       ├── layout.tsx              ← Header + Footer + CartDrawer + MobileNav
│   │       ├── page.tsx                ← Homepage
│   │       ├── produtos/page.tsx       ← Catálogo com filtros
│   │       ├── produto/[handle]/       ← Página de produto
│   │       ├── busca/page.tsx          ← Busca
│   │       ├── carrinho/page.tsx       ← Carrinho completo
│   │       └── checkout/page.tsx       ← Checkout 3 etapas
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx              ← Desktop: logo+busca+ações / Mobile: menu+título+carrinho
│   │   │   ├── TopBar.tsx              ← Redes sociais + contato (só desktop)
│   │   │   ├── Footer.tsx              ← Newsletter + links + pagamentos
│   │   │   ├── BottomNav.tsx           ← Barra inferior tipo app (só mobile)
│   │   │   ├── SideMenu.tsx            ← Menu lateral drawer (categorias, links, WhatsApp)
│   │   │   └── MobileNav.tsx           ← Wrapper: BottomNav + SideMenu + espaçador
│   │   ├── home/
│   │   │   ├── HeroCarousel.tsx        ← Carrossel com imagens PC/mobile + swipe
│   │   │   ├── BenefitsStrip.tsx       ← Ticker infinito 4 informativos
│   │   │   ├── ProductSection.tsx      ← Vitrine: scroll horizontal mobile, grid desktop
│   │   │   └── CategoriesSection.tsx   ← 12 categorias com emoji
│   │   ├── product/
│   │   │   ├── ProductCard.tsx         ← Card com preço, desconto, add-to-cart
│   │   │   └── AddToCartButton.tsx     ← Seletor de quantidade + botão
│   │   └── cart/
│   │       ├── CartDrawer.tsx          ← Drawer lateral direita
│   │       └── CartInitializer.tsx     ← Inicializa carrinho no mount
│   ├── lib/
│   │   ├── medusa/
│   │   │   ├── client.ts              ← Medusa SDK config
│   │   │   ├── products.ts            ← listProducts, getByHandle, categories
│   │   │   └── cart.ts                ← create, addItem, updateItem, removeItem
│   │   └── utils/
│   │       └── index.ts               ← formatPrice, formatInstallments, etc
│   └── store/
│       ├── cart.ts                     ← Zustand store (localStorage persistence)
│       └── menu.ts                     ← Zustand store (estado do menu lateral)
```

---

## Design System

### Cores (idênticas ao v1)
| Token | Hex | Uso |
|-------|-----|-----|
| `bibelo-pink` | `#fe68c4` | Botões, destaques, CTA |
| `bibelo-pink-dark` | `#e050a8` | Hover |
| `bibelo-rosa` | `#ffe5ec` | Fundos suaves, categorias |
| `bibelo-amarelo` | `#fff7c1` | Banners, fundo carrossel |
| `bibelo-dark` | `#2d2d2d` | Texto principal |

### Fontes
- **Cormorant Garamond** (headings): `h1`–`h6`, via CSS
- **Jost** (corpo): body, botões, labels, via Tailwind `font-sans`

---

## Navegação Mobile (90% do público)

### Header Mobile
```
[☰ Menu]  [Bibelô Papelaria título]  [🛒 Carrinho]
```
- Menu abre drawer lateral esquerda
- Título é imagem da marca (`titulo-bibelo.png`)
- Carrinho abre drawer lateral direita com badge

### Bottom Nav (barra inferior tipo app)
```
[Menu]  [Início]  [🛒 Carrinho]  [Buscar]  [Conta]
```
- Fixa no rodapé, `safe-area-bottom` para iPhones
- Carrinho em destaque central (bolha pink elevada)
- Menu dispara o mesmo drawer do header

### Menu Lateral (SideMenu)
- Logo + nome no topo
- 3 destaques com ícone: Novidades, Ofertas, Todos os Produtos
- 8 departamentos em grid 2 colunas
- Links: Meus Pedidos, Minha Conta, Frete, Trocas
- CTA WhatsApp verde
- Redes sociais (Instagram, Facebook, WhatsApp)

---

## Homepage — Ordem das seções

1. **HeroCarousel** — 3 slides (Frete Grátis, 7% OFF, Clube VIP), swipe touch, autoplay 5s
2. **BenefitsStrip** — Ticker infinito com 4 informativos (Frete, Pagamento, Cupom, Clube VIP)
3. **Destaques** — Vitrine scroll horizontal mobile / grid desktop
4. **Categorias** — 12 departamentos com emoji, scroll mobile / grid desktop
5. **Ofertas** — Produtos com desconto (filtra `original > calculated`)
6. **Banner Cupom** — 7% OFF BIBELO7, fundo amarelo
7. **Footer** — Newsletter, links, contato, pagamentos

---

## Docker

### Dockerfile
- Multi-stage: `base` (pnpm) → `deps` (install) → `builder` (next build) → `production` (standalone)
- Imagem final ~150MB (node:20-alpine + standalone output)

### docker-compose.yml (serviço adicionado)
```yaml
storefront-v2:
  container_name: bibelo_storefront_v2
  porta: 127.0.0.1:8001:8001
  depends_on: medusa (healthy)
  env: NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://bibelo_medusa:9000
```

### CORS
Medusa STORE_CORS atualizado para incluir `http://localhost:8001`

### Nginx
`/etc/nginx/sites-enabled/homolog` → `proxy_pass http://127.0.0.1:8001`

---

## Medusa Integration

### Publishable Key
```
pk_042f8180dfdbe6168d60806151daaf71a16f54691a9981201a8f3c298d325735
```

### APIs consumidas
| SDK Method | Uso |
|------------|-----|
| `medusa.store.product.list()` | Listagem, busca, filtro por categoria |
| `medusa.store.product.list({ handle })` | Página de produto |
| `medusa.store.category.list()` | Categorias |
| `medusa.store.collection.list()` | Coleções |
| `medusa.store.cart.create()` | Criar carrinho |
| `medusa.store.cart.retrieve()` | Buscar carrinho |
| `medusa.store.cart.createLineItem()` | Adicionar item |
| `medusa.store.cart.updateLineItem()` | Atualizar quantidade |
| `medusa.store.cart.deleteLineItem()` | Remover item |

### Produtos
180 produtos sincronizados do Bling → Medusa (sync existente)

---

## Autenticação

### Providers configurados no Medusa
- **Email/Senha** (`@medusajs/auth-emailpass`) — registro e login convencional
- **Google OAuth** (`@medusajs/auth-google`) — login com conta Google

### Credenciais Google OAuth
- **Projeto GCP**: `bibelo-491511`
- **Client ID**: `130005911318-8j46...oo0l.apps.googleusercontent.com` (Storefront Login)
- **Callback URL**: `https://homolog.papelariabibelo.com.br/api/auth/callback/google`
- **Env vars**: `GOOGLE_STORE_CLIENT_ID`, `GOOGLE_STORE_CLIENT_SECRET`, `GOOGLE_STORE_CALLBACK_URL`

### Fluxo Google OAuth
1. Cliente clica "Continuar com Google" → fetch `/api/auth/customer/google` → Medusa retorna URL do Google
2. Google autentica → redireciona para `/api/auth/callback/google` (rota Next.js API)
3. Next.js faz proxy server-side ao Medusa → recebe JWT token
4. Redireciona para `/conta/callback?token=xxx` → salva no sessionStorage
5. `ensureCustomer()` — se customer não existe no Medusa, cria automaticamente com dados do Google
6. Exibe perfil com foto, nome e email do Google

### Dados capturados do Google
- `given_name` / `family_name` — nome completo
- `email` — email verificado pelo Google
- `picture` — foto de perfil (exibida no avatar da conta)
- `auth_provider` — "google" (para KPIs de canal de aquisição)

### Segurança da autenticação
- Token JWT no **sessionStorage** (não localStorage — mitigação XSS, não persiste entre abas)
- Token **limpo da URL** após captura no callback (`replaceState`)
- Mensagem de erro no callback é **fixa** (não usa param da URL — anti-phishing)
- Rate limiting: **5 req/min** nos endpoints `/api/auth/` (Nginx `limit_req`)
- Admin panel `/app` **bloqueado** por IP (403 para acessos externos)

### Páginas de conta
| Rota | Função |
|------|--------|
| `/conta` | Login (Google + email/senha) ou perfil logado |
| `/conta/callback` | Processa token do Google OAuth |
| `/conta/pedidos` | Histórico de pedidos do cliente |
| `/conta/enderecos` | Gerenciar endereços (CRUD completo) |

---

## Segurança

### Headers Nginx (todos presentes)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Robots-Tag: noindex, nofollow` (homolog)
- `X-Powered-By` — **removido** (proxy_hide_header)

### Rate Limiting
- `/api/auth/` — 5 req/min com burst 3 (anti brute-force)

### Pentest validado (08/04/2026)
- CORS: PASS (rejeita origins não autorizados)
- Path traversal: PASS (404/400)
- SQL injection: PASS (Medusa usa ORM parametrizado)
- Auth bypass: PASS (requer publishable key + JWT)
- Input validation: PASS (sem reflection, sem 500)
- Admin endpoints: PASS (protegidos por auth + IP restriction)

### Correções aplicadas
- URL injection nos search params → `encodeURIComponent`
- WhatsApp URLs → `encodeURIComponent`
- Token na URL callback → `replaceState` limpa após captura
- Phishing via error param → mensagem fixa
- Demo key fallback → removido
- localhost em image config → só em development

---

## Testes automatizados

**Arquivo**: `tests/smoke.test.sh` — 28 testes

```bash
bash tests/smoke.test.sh  # ou com URL custom:
STOREFRONT_URL=https://homolog.papelariabibelo.com.br bash tests/smoke.test.sh
```

| Seção | Testes |
|-------|--------|
| Rotas (HTTP 200) | 7 — homepage, produtos, busca, carrinho, checkout, conta, callback |
| Conta subpáginas | 2 — pedidos, endereços |
| Assets estáticos | 7 — logo, título, 5 imagens carrossel |
| Medusa API | 3 — health, products, categories |
| Auth endpoints | 2 — emailpass invalid (401), register empty (401) |
| Conteúdo HTML | 4 — Bibelô presente, Cormorant no CSS, cor #fe68c4, sem Kanit |
| Headers segurança | 3 — X-Robots-Tag, X-Frame-Options, X-Content-Type-Options |

---

## Pendências e próximos passos

### Funcional
- [ ] Checkout funcional (Mercado Pago)
- [ ] Cálculo de frete real (Melhor Envio) — hoje hardcoded PAC/SEDEX
- [ ] Cupom funcional (validação Medusa)
- [ ] Meus Pedidos (histórico)
- [ ] Página de produto: galeria com thumbnails clicáveis

### Visual
- [ ] Imagem mobile do banner 7% OFF
- [ ] Favicon personalizado
- [ ] Loading skeletons nas vitrines
- [ ] Breadcrumb nas páginas internas

### Infra
- [ ] CI/CD para storefront-v2 no GitHub Actions
- [ ] Domínio definitivo (loja.papelariabibelo.com.br ou substituir NuvemShop)
- [ ] PWA manifest para "instalar" como app

---

*Última atualização: 08/04/2026 — auth Google OAuth, páginas conta/pedidos/endereços, segurança hardened, 28 smoke tests*
