# Roadmap para Produção — Storefront v2

Levantamento completo para ir de homolog → produção 100% funcional.
Auditoria realizada em 08/04/2026.

---

## Status atual

**O que funciona:**
- Carrinho (add/remove/update via Medusa API)
- Listagem e busca de produtos (180 produtos do Bling)
- Autenticação Google OAuth + email/senha
- Conta: perfil com foto Google, pedidos, endereços (CRUD)
- Carrossel, categorias, vitrines, bottom nav mobile
- Design responsivo mobile-first
- Segurança hardened (headers, rate limiting, pentest validado)
- 28 smoke tests passando

**O que NÃO funciona (precisa para produção):**
- Checkout (UI only, sem backend)
- Pagamento (nenhum gateway)
- Frete (valores hardcoded)
- Newsletter (form sem ação)
- Páginas legais (links quebrados no footer)
- Seleção de variantes (sempre pega a primeira)
- "Esqueci minha senha"

---

## Fases de implementação

### FASE 1 — Checkout funcional (P0 — obrigatório)

| # | Item | Esforço | Dependência |
|---|------|---------|-------------|
| 1.1 | **Mercado Pago** — integrar SDK no checkout (Pix, cartão, boleto) | 6-8h | Módulo já existe no Medusa |
| 1.2 | **Melhor Envio** — cálculo de frete real por CEP | 4-6h | Módulo já existe no Medusa |
| 1.3 | **Checkout conectado** — forms → Medusa cart → shipping → payment → order | 6-8h | 1.1 + 1.2 |
| 1.4 | **Página de confirmação** — pedido criado, resumo, próximos passos | 2h | 1.3 |
| 1.5 | **Seleção de variantes** — cor, tamanho, opções no produto | 3-4h | — |
| 1.6 | **"Esqueci minha senha"** — reset via email | 2-3h | Medusa emailpass já suporta |

**Resultado:** Cliente consegue comprar de verdade.

### FASE 2 — Páginas legais + UX essencial (P0)

| # | Item | Esforço |
|---|------|---------|
| 2.1 | **Sobre nós** (`/sobre`) | 1h |
| 2.2 | **Política de Privacidade** (`/politica-de-privacidade`) | 1h |
| 2.3 | **Termos de Uso** (`/termos-de-uso`) | 1h |
| 2.4 | **Política de Frete** (`/politica-de-frete`) | 1h |
| 2.5 | **Trocas e Devoluções** (`/trocas-e-devolucoes`) | 1h |
| 2.6 | **FAQ** (`/faq`) — acordeão com perguntas comuns | 2h |
| 2.7 | **Página 404** personalizada com marca | 1h |
| 2.8 | **Newsletter funcional** — captura email → CRM leads | 2h |

**Resultado:** Site legalmente compliant, todos os links funcionam.

### FASE 3 — PWA + App-ready (P1)

| # | Item | Esforço |
|---|------|---------|
| 3.1 | **manifest.json** — nome, ícones, cores, start_url, display: standalone | 1h |
| 3.2 | **Service Worker** — cache de assets, offline básico | 3-4h |
| 3.3 | **Ícones PWA** — 192x192, 512x512, maskable (logo gatinhos) | 1h |
| 3.4 | **Splash screen** — tela de carregamento ao abrir como app | 1h |
| 3.5 | **Banner "Instalar App"** — prompt nativo do Chrome/Safari | 2h |
| 3.6 | **Push notifications** — aviso de promoção, carrinho abandonado | 4-6h |

**Resultado:** Site se comporta como app nativo. Base para publicar nas lojas.

### FASE 4 — SEO + Analytics (P1)

| # | Item | Esforço |
|---|------|---------|
| 4.1 | **sitemap.xml** dinâmico (produtos + categorias) | 2h |
| 4.2 | **robots.txt** | 0.5h |
| 4.3 | **JSON-LD** structured data (Product, Organization, LocalBusiness) | 3h |
| 4.4 | **Open Graph** por produto (imagem + preço + disponibilidade) | 1h |
| 4.5 | **Google Analytics 4** + eventos de conversão | 2h |
| 4.6 | **Facebook Pixel** + eventos ViewContent, AddToCart, Purchase | 2h |
| 4.7 | **Meta tags** otimizadas por página | 1h |

**Resultado:** Indexação correta, tracking de conversão, dados para otimizar ads.

### FASE 5 — UX avançada (P2)

| # | Item | Esforço |
|---|------|---------|
| 5.1 | **Galeria de imagens** — zoom, swipe entre fotos, fullscreen | 4h |
| 5.2 | **Produtos relacionados inteligentes** — mesma categoria/tag | 2h |
| 5.3 | **"Poucas unidades"** — aviso de estoque baixo | 1h |
| 5.4 | **Loading skeletons** nas vitrines e listagens | 2h |
| 5.5 | **Error boundaries** por rota (error.tsx) | 1h |
| 5.6 | **Busca com autocomplete** — sugestões enquanto digita | 3h |
| 5.7 | **Filtros de produto** — faixa de preço, marca, categoria | 4h |
| 5.8 | **Wishlist** — favoritar produtos | 3h |
| 5.9 | **Cupom visual melhorado** — feedback claro de sucesso/erro | 1h |

### FASE 6 — Integrações + KPIs (P2)

| # | Item | Esforço |
|---|------|---------|
| 6.1 | **Email pós-compra** — confirmação, NF, tracking | 3h |
| 6.2 | **Sync customer → CRM** — Google OAuth data → BibelôCRM | 3h |
| 6.3 | **Dashboard KPIs** no CRM — conversão, LTV, canal, abandono | 4h |
| 6.4 | **Avaliações de produto** — estrelas + texto | 4h |
| 6.5 | **Chatbot WhatsApp** — link contextual por produto/pedido | 2h |

### FASE 7 — App nativo (P3 — futuro)

| # | Item | Esforço |
|---|------|---------|
| 7.1 | **TWA (Trusted Web Activity)** — PWA na Play Store | 4h |
| 7.2 | **Capacitor/Expo wrapper** — se precisar funcionalidades nativas | 8-12h |
| 7.3 | **Apple App Store** — via Safari Web App ou Capacitor | 8-12h |
| 7.4 | **Push notifications nativas** — Firebase Cloud Messaging | 4h |

---

## Infraestrutura para produção

| Item | Status | Ação |
|------|--------|------|
| Domínio | `homolog.papelariabibelo.com.br` | Trocar para `loja.papelariabibelo.com.br` ou `papelariabibelo.com.br` |
| SSL | Let's Encrypt | Certbot para o novo domínio |
| Nginx | Configurado | Duplicar config de homolog → produção |
| DNS | Cloudflare | Criar A record para o novo domínio |
| CDN | Nenhum | Configurar Cloudflare Full (SSL + cache assets) |
| CI/CD | GitHub Actions existe | Adicionar storefront-v2 ao pipeline |
| Monitoring | Uptime Kuma | Adicionar monitor para storefront-v2 |
| Backup | Google Drive diário | Já cobre PostgreSQL (Medusa DB incluído) |
| Remover NuvemShop | Gradual | Redirecionar domínio após validação completa |

---

## Estimativa consolidada

| Fase | Horas | Prioridade |
|------|-------|------------|
| Fase 1 — Checkout funcional | ~25h | P0 (obrigatório) |
| Fase 2 — Páginas legais + UX | ~10h | P0 (obrigatório) |
| Fase 3 — PWA + App-ready | ~12h | P1 (importante) |
| Fase 4 — SEO + Analytics | ~12h | P1 (importante) |
| Fase 5 — UX avançada | ~21h | P2 (melhoria) |
| Fase 6 — Integrações + KPIs | ~16h | P2 (melhoria) |
| Fase 7 — App nativo | ~28h | P3 (futuro) |
| **Total** | **~124h** | |

**Para ir ao ar funcional (Fase 1+2): ~35 horas de desenvolvimento.**

---

## Ordem de execução recomendada

```
AGORA:    Fase 1 (checkout) + Fase 2 (legais) → lançar em produção
SEMANA 2: Fase 3 (PWA) + Fase 4 (SEO) → app installable + indexação Google
SEMANA 3: Fase 5 (UX) → experiência premium
MÊS 2:   Fase 6 (KPIs) + Fase 7 (app stores)
```

---

*Criado em 08/04/2026 — Auditoria completa do storefront-v2*
