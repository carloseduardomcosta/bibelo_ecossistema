# Campanha Meta Ads — Dia das Mães 2026
**Período:** 25/04 – 09/05/2026 (15 dias)  
**Orçamento total estimado:** R$ 525  
**Objetivo:** Conversão com rastreamento real de compras

---

## Pré-requisitos obrigatórios (fazer ANTES de criar as campanhas)

### 1. Ativar pixel de conversão no Meta Events Manager
O ROAS registrado até agora é 0,00 em todas as campanhas — o pixel não está enviando o evento `Purchase`.

Checklist:
- [ ] Acessar [Meta Events Manager](https://business.facebook.com/events_manager2)
- [ ] Selecionar o pixel da Bibelô
- [ ] Em "Atividade do Pixel", verificar se o evento `Purchase` está aparecendo
- [ ] Se não aparecer: instalar o pixel na NuvemShop via integração nativa (Configurações > Canais de venda > Facebook/Instagram > Pixel)
- [ ] Confirmar com a ferramenta "Test Events" antes de criar a campanha
- [ ] Aguardar 24–48h de dados antes de escalar budget

### 2. Ativar a Landing Page Dia das Mães
A LP `/lp/dia-das-maes` ("Presente perfeito para a mãe!") já existe no CRM mas está inativa.

```
CRM > Landing Pages > dia-das-maes > Ativar
```

Checar se a vitrine de produtos está carregando (precisa de NF entrada recente sincronizada).

---

## Estrutura das Campanhas

### Campanha A — Dia das Mães (Conversão)
**Foco: vendas rastreadas com produto destaque**

| Campo | Configuração |
|-------|-------------|
| Nome | `Bibelô — Dia das Mães — Conversão — Mai/2026` |
| Objetivo | **Vendas** (OUTCOME_SALES) |
| Pixel evento | **Purchase** |
| Orçamento | R$ 35/dia |
| Período | 25/04 a 09/05 (15 dias = R$ 525 total máximo) |
| Destino | `/lp/dia-das-maes` → loja |

**Conjunto de anúncios 1 — Público Quente (mulheres)**

| Campo | Configuração |
|-------|-------------|
| Nome | `Mães — Feminino 25–54 — Sul+SE` |
| Localização | SC · PR · RS · SP · RJ |
| Gênero | **Feminino** |
| Idade | 25 a 54 anos |
| Interesses | Papelaria · Organização · Planejamento · Material escolar · Cadernos · Caneta · Journaling |
| Posicionamento | Facebook Feed + Instagram Feed (manual — **não usar automático**) |
| Orçamento diário | R$ 25 |

> Por que separar posicionamentos manualmente? Facebook teve CTR 7,51% e CPC R$0,09 no histórico. No automático, o Meta joga tudo no Instagram (mais caro) e ignora o Facebook.

**Conjunto de anúncios 2 — Público Frio (compradores para a mãe)**

| Campo | Configuração |
|-------|-------------|
| Nome | `Mães — Misto 25–45 — Sul+SE` |
| Localização | SC · PR · RS · SP · RJ |
| Gênero | Todos |
| Idade | 25 a 45 anos |
| Interesses | Dia das Mães · Presentes · Papelaria · Decoração |
| Posicionamento | Facebook Feed + Instagram Feed |
| Orçamento diário | R$ 10 |

---

### Campanha B — Teste Facebook (Validação de canal)
**Foco: confirmar se CTR 7,51% e CPC R$0,09 do Facebook se repetem com produto específico**

| Campo | Configuração |
|-------|-------------|
| Nome | `Bibelô — [PRODUTO] — Facebook Only — Mai/2026` |
| Objetivo | **Vendas** (OUTCOME_SALES) |
| Orçamento | R$ 20/dia |
| Período | 25/04 a 01/05 (7 dias = R$ 140) |
| Plataforma | **Apenas Facebook Feed + Facebook Stories** (desativar tudo mais) |
| Público | Mulheres 25–54 · SC + PR + RS + SP |
| Produto | Produto único com preço claro (ver seção Criativos abaixo) |

> Manter separado da Campanha A para ter dados limpos por plataforma.

---

## Produtos recomendados para criativos

Com base no histórico (Caderno gerou CTR 5,11% com produto único), evitar catálogos mistos.

### Opção 1 — Produto entrada (gera volume de dados rápido)
**LÁPIS FABER CASTELL SPARKLE** — R$ 3,50  
SKUs: rosa, azul, lilás — produto feminino, marca reconhecida, visual bonito para criativo.  
Copy sugerida: *"O lápis que ela vai amar. Lápis Faber-Castell Sparkle na Bibelô. Frete grátis a partir de R$ 79!"*

### Opção 2 — Kit Dia das Mães (ticket maior, melhor ROAS)
Montar kit visual no criativo com: Lápis FaberCastell + Marca-texto Pastel + Caneta colorida.  
Preço sugerido no criativo: "Monte o kit dela → a partir de R$ 10"  
Destino: LP dia-das-maes com vitrine dos produtos.

### Opção 3 — Produto de melhor margem
Verificar no Bling qual produto tem maior margem (preco_venda / preco_custo) com foto e estoque — esse é o candidato ideal para ROAS positivo.

---

## Criativos — diretrizes

### Formato
- **Imagem estática**: 1080×1080 (feed) + 1080×1920 (stories) — formato de maior alcance
- **Vídeo curto**: 6–15s com produto em destaque + preço + CTA. A campanha de vídeo teve CTR 6,41% — o formato funciona.

### Copy do anúncio
```
Headline: "Presente especial para a mãe que ama organização 🌸"
Texto principal: "Canetas, cadernos e muito mais com frete grátis para o Sul e Sudeste. 
Aproveite o Dia das Mães na Bibelô!"
CTA: "Comprar agora"
```

### Visual — Design System Bibelô
- Fundo rosa `#ffe5ec` ou pink `#fe68c4`
- Fontes: Cormorant Garamond (título) + Jost (preço e CTA)
- Produto em destaque, sem excesso de elementos
- Preço em destaque (produtos com preço claro convertem mais)
- Selos: "Frete Grátis Sul/SE" + "Entrega para todo o Brasil"

---

## Regras de execução

| Regra | Por quê |
|-------|---------|
| Não pausar antes de 7 dias | Meta precisa de tempo mínimo para sair da fase de aprendizado (~50 conversões ou 7 dias) |
| Não alterar público ou orçamento nos primeiros 5 dias | Cada edição reinicia a fase de aprendizado |
| Subir orçamento no máximo +20%/dia se quiser escalar | Subidas bruscas reiniciam o aprendizado |
| Duplicar o conjunto de anúncios, nunca editar o original | Preserva os dados históricos de aprendizado |
| Testar um elemento por vez (público OU criativo, não ambos) | Isolamento de variável para decisão clara |

---

## KPIs-alvo e semáforo de decisão

| Métrica | Ruim (pausar) | Ok (manter) | Bom (escalar) |
|---------|--------------|-------------|---------------|
| CTR | < 1% | 1–3% | > 3% |
| CPC | > R$ 0,80 | R$ 0,30–0,80 | < R$ 0,30 |
| ROAS | < 1x | 1x–3x | > 3x |
| CPM | > R$ 20 | R$ 8–20 | < R$ 8 |

**ROAS alvo mínimo:** 3x  
Exemplo: R$ 35/dia investido → precisa gerar R$ 105/dia em vendas para ser rentável.  
Com ticket médio ~R$ 100, isso significa **1 venda/dia por campanha** já cobre o investimento.

---

## Cronograma

| Data | Ação |
|------|------|
| **Hoje (13/04)** | Verificar pixel de conversão — se não está rastreando Purchase, resolver isso primeiro |
| **15–18/04** | Preparar criativos (imagem + vídeo) no formato Bibelô |
| **20/04** | Ativar LP `/lp/dia-das-maes` no CRM |
| **25/04** | **Publicar Campanhas A e B** (15 dias antes do Dia das Mães) |
| **28–30/04** | Primeira análise de dados — nada de ajustes antes disso |
| **01/05** | Avaliar Campanha B (Facebook Only) — escalar se CPC < R$ 0,30 |
| **05/05** | Última análise — pausar conjunto fraco, dobrar budget no melhor |
| **09/05** | Encerrar campanhas (véspera do Dia das Mães) |

---

## Ações de remarketing (se pixel estiver funcionando)

Após 7 dias com pixel ativo, criar:

**Campanha C — Retargeting Visitantes**
- Público: quem visitou a loja nos últimos 14 dias + não comprou
- Objetivo: Vendas
- Orçamento: R$ 15/dia
- Criativo: lembrete com o produto que viram + "Ainda dá tempo pro Dia das Mães!"

**Público personalizado recomendado:**
- Visitantes do site (pixel) últimos 14 dias
- Seguidores do Instagram (engajaram mas não compraram)
- Lista de leads capturados pelo CRM (Custom Audience por email — Phase 2 do Meta Ads)

---

## Próximos passos técnicos (futuro)

Com a Phase 2 do módulo Meta Ads (Sync CRM → Meta), será possível:
- Enviar lista de leads capturados pelo popup como Custom Audience
- Criar Lookalike Audiences dos clientes que já compraram
- Isso costuma reduzir o CPC em 40–60% comparado a públicos frios

---

*Documento criado em 13/04/2026 — baseado na análise das 7 campanhas históricas*
