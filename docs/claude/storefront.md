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

## Página /novidades
Arquivo: `storefront-v2/src/app/(main)/novidades/page.tsx`

Exibe todos os produtos da NF mais recente (até 50), grid responsivo.
Chama `getNovidadesBling(50)` — mesma fonte que a `NovidadesSection` da homepage.
O link "Ver todas" da `NovidadesSection` aponta para `/novidades`.

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
