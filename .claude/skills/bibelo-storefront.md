# Bibelo Storefront — Design System

## Identidade visual
- Paleta: cream #FAF7F2, warm #F2EBE0, blush #EDD5C5, rose #C9896A, bark #3D2B1F, sage #8A9E8C
- Tipografia: Cormorant Garamond (títulos, serif elegante) + DM Sans (corpo, funcional)
- Tom: papelaria premium, minimalista, feminino sem ser infantil
- Nunca: cores frias, Inter/Roboto, layouts 100% simétricos, "AI purple"

## Stack técnica
- Next.js 14+ App Router
- Tailwind CSS
- TypeScript
- Medusa.js Storefront SDK (@medusajs/js-sdk)
- Backend: http://localhost:9000 (dev) / https://api.papelariabibelo.com.br (prod)

## Estrutura de páginas
- / → home com hero, destaques, novidades, banner VIP
- /categoria/[slug] → grid de produtos com filtros
- /produto/[handle] → página de produto com variantes e swatches
- /carrinho → resumo com cálculo de frete (Melhor Envio)
- /checkout → form + Pix QR Code (Mercado Pago)
- /pedido/[id] → confirmação e rastreio

## Componentes principais
- ProductCard → imagem, marca, nome, swatches de cor, preço, botão +
- CategoryPills → filtros em pills navegáveis
- CartDrawer → sidebar com resumo do carrinho
- PixCheckout → QR Code + countdown de expiração
- ShippingCalculator → input CEP + opções PAC/SEDEX/Jadlog

## Regras de UX
- Mobile first — 80% do tráfego é mobile
- Imagens lazy load com blur placeholder
- Skeleton loading em todos os fetches
- Erro amigável em pt-BR sempre
- Frete grátis acima de R$199 — destacar sempre no carrinho

## Produtos reais da loja (para mocks)
- Lápis Faber-Castell Sparkle Pastel 12 cores — R$59,90
- Caneta BRW Stiletto Premium — R$7,90 (era R$9,90)
- Caderno Tilibra West Village 80fls — R$24,90 (era R$32,90)
- Caneta Gel Holic Essenza 0.7 Tris — R$7,90
- Lapiseira BRW Soul Estampada 2.0 — R$8,90

## Integrações
- Produtos/estoque: GET /store/products (Medusa)
- Carrinho: POST /store/carts (Medusa)
- Frete: POST /store/shipping-options (Medusa → Melhor Envio)
- Pagamento: POST /store/payment-sessions (Medusa → Mercado Pago)
- Webhook status: /webhooks/mercadopago

## Referência visual
Preview gerado: ver artifact bibelo_storefront_preview no histórico
