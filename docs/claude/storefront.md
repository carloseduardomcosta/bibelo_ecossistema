# Storefront v2 — Referência

## Homepage (página principal)
Arquivo: `storefront-v2/src/app/(main)/page.tsx`

### Ordem das seções (decisão de 09/04/2026)
1. **HeroCarousel** — carrossel hero. Mobile: `h-[48dvh]` (~405px iPhone 14)
2. **BenefitsStrip** — mobile = ticker horizontal; desktop = 4 cards fixos com divisórias.
   - Frete Grátis → `/politica-de-frete`
   - Pagamento facilitado → sem link
   - Promoção de 1ª compra (CUPOM) → abre popup
   - Clube VIP no WhatsApp → link grupo VIP
3. **`<div className="h-8" />`** — espaçador intencional
4. **NovidadesSection** — produtos das últimas NFs do Bling (só renderiza se `novidadesBling.length > 0`)
5. **CategoriesSection** — mobile: scroll horizontal. Desktop: top 8 prioritárias grid 4×2 + "Ver todas →"
6. **ProductSection "Ofertas"** — só renderiza se houver promos com desconto
7. **LeadCapture** — captura Clube Bibelô

### Componentes NÃO usados na homepage
- `BenefitCards.tsx` — substituído pelo BenefitsStrip. Nunca usar junto.
- `MobileProductScroller.tsx` — descontinuado.

### Regra
Usar **BenefitsStrip** (responsivo). Nunca usar `BenefitCards.tsx` junto com o BenefitsStrip.

---

## Autenticação — grupo (auth)

Arquitetura de rotas de 16/04/2026: `/conta` e sub-páginas de auth ficam no grupo `(auth)` — layout limpo sem header/footer.

### Estrutura de arquivos
```
src/app/
├── (auth)/
│   ├── layout.tsx                  ← layout mínimo: min-h-screen bg-[#FAF7F2], force-dynamic
│   └── conta/
│       ├── page.tsx                ← /conta (login + painel da conta)
│       ├── callback/page.tsx       ← /conta/callback (OAuth Google)
│       ├── recuperar-senha/page.tsx
│       └── nova-senha/page.tsx
└── (main)/
    └── conta/
        ├── pedidos/
        ├── pedidos/[id]/
        ├── perfil/
        └── enderecos/
```

### Fluxo returnUrl
- Qualquer página protegida redireciona para `/conta?returnUrl=<pathname>`
- Login com email/senha: `router.replace(returnUrl || "/conta")`
- Login com Google: `returnUrl` salvo em `sessionStorage` antes do redirect OAuth → `callback/page.tsx` lê e redireciona
- Constante: `RETURN_URL_KEY = "bibelo-auth-returnUrl"`

### Hook useRequireAuth
`src/hooks/useRequireAuth.ts` — protege rotas client-side.
Usado em: `pedidos`, `pedidos/[id]`, `perfil`, `enderecos`.

```ts
const { isAuthorized, isLoading } = useRequireAuth()
// Se não logado → redireciona /conta?returnUrl=<pathname> automaticamente
```

---

## Página /novidades
Arquivo: `storefront-v2/src/app/(main)/novidades/page.tsx`

Exibe todos os produtos da NF mais recente (até 50), grid responsivo.
Chama `getNovidadesBling(50)` — mesma fonte que a `NovidadesSection` da homepage.
O link "Ver todas" da `NovidadesSection` aponta para `/novidades`.

---

## Página /produtos
Arquivo: `storefront-v2/src/app/(main)/produtos/page.tsx`

Grid de produtos com filtros e paginação. Revalidação ISR 300s.

- **FilterSidebar** (`components/product/FilterSidebar.tsx`): categorias root (sem `parent_category_id`), ordenadas pt-BR. Desktop: aside sticky. Mobile: drawer slide-from-right.
- **URL state**: todos os filtros em query params (`?categoria=`, `?sort=`, `?q=`, `?page=`). Sem estado client.
- **Grid**: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`
- **Ordenação**: Mais recentes (default), Mais antigos, Menor preço, Maior preço — preserva categoria+q ao trocar.
- **Badges no ProductCard**: NOVO (amarelo, < 30 dias, campo `created_at`) → % OFF (rosa) → ESGOTADO (cinza). Os 3 podem aparecer juntos.
- **Faixa de preço**: adiada para próxima iteração.

---

## Página /produto/[handle]
Arquivo: `storefront-v2/src/app/(main)/produto/[handle]/page.tsx`

Página de detalhe de produto. Revalidação ISR 300s.

### Componentes
| Componente | Arquivo | Tipo |
|---|---|---|
| ImageGallery | `components/product/ImageGallery.tsx` | client |
| FreteCalculator | `components/product/FreteCalculator.tsx` | client |
| BuyNowButton | `components/product/BuyNowButton.tsx` | client |
| AddToCartButton | `components/product/AddToCartButton.tsx` | client |
| VariantSelector | `components/product/VariantSelector.tsx` | client |
| DescriptionAccordion | inline em page.tsx | server |

### Galeria
- `ImageGallery.tsx`: thumbnails clicáveis trocam a imagem principal. Hover zoom `scale-110` no desktop.
- `images` = `product.images[]` se disponível, senão `[{ url: product.thumbnail }]`.

### Botões de ação
- **Produto simples** (sem variantes, em estoque): `BuyNowButton` (escuro) + `AddToCartButton` (rosa).
- **Produto com variantes**: `VariantSelector` (gerencia estado internamente).
- **Esgotado**: botão desabilitado + link WhatsApp "Avisar quando disponível".

### BuyNowButton
`addItem(variantId, 1)` → `router.push('/checkout')`. Passa pelo carrinho, redireciona sem abrir CartDrawer.

### Calculadora de frete
`FreteCalculator.tsx` chama `/api/frete?cep=` (rota Next.js em `src/app/api/frete/route.ts`).
A rota Next.js proxia para `${API_URL}/api/public/frete?cep=` (CRM interno, sem CORS).
Resultado: PAC + SEDEX com preço (centavos) e prazo (dias úteis). Nota: frete final recalculado no checkout.

### Descrição
`<details>` nativo (accordion sem JS extra). Classe `legal-content` para formatação.

### Avaliações
Placeholder visual (5 estrelas amarelas). Sem backend.

### Produtos relacionados
`listProducts({ categoryId: product.categories?.[0]?.id })`. Se sem categoria → `listProducts({ limit: 5 })` genérico.
Campo `+categories` adicionado ao `getProductByHandle` fields.

### WhatsApp
Botão verde "Tirar dúvidas" → `wa.me/5547933862514` com texto pré-preenchido incluindo URL do produto.

---

## Loja Online — Configurações centralizadas (CRM)

Painel no CRM (sidebar > Loja Online > Configurações) — storefront consome via API.

### Tabela `public.store_settings` — 31 configs em 5 categorias
- **pagamento**: pix_ativo, pix_desconto, cartao_ativo, cartao_parcelas_max, cartao_parcela_min, cartao_juros, boleto_ativo, boleto_prazo_dias
- **frete**: frete_gratis_ativo, frete_gratis_valor, frete_gratis_regioes, retirada_ativo, retirada_endereco, retirada_horario
- **checkout**: checkout_mensagem, checkout_whatsapp, checkout_cupom, checkout_conta_obrig
- **marketing**: popup_ativo, popup_desconto, popup_cupom, banner_frete_gratis, selo_seguranca
- **geral**: loja_nome, loja_telefone, loja_email, loja_horario, loja_endereco, loja_cnpj, loja_instagram, loja_facebook

### Endpoints
- `GET /api/store-settings` — **público** (cache 5min)
- `GET /api/store-settings/all` — autenticado (CRM, com metadados)
- `PUT /api/store-settings` — autenticado (body: `{ settings: [{ categoria, chave, valor }] }`)

### Divisão Medusa vs CRM
- **Medusa Admin**: regiões, moedas, providers pagamento/frete (config rara, técnica)
- **CRM Loja Online**: regras de negócio frequentes (desconto, parcelas, frete grátis, popup)

### Campos monetários
Banco armazena em **centavos** (ex: 7900). CRM exibe em **reais** (R$ 79,00). API converte automaticamente.
