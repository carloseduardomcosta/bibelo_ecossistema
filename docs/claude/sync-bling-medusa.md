# Sync Bling → Medusa: Produtos, Variações e Imagens HD

## Produtos com variações (Bling → Medusa)

Sync agrupa produtos Bling por `idProdutoPai`:
- **Produto simples** (sem filhos): 1 produto Medusa + 1 variante "Padrão"
- **Produto pai** (com filhos): 1 produto Medusa + N variantes (uma por filho)
- **Produto filho**: vira variante do pai (não cria produto separado)

Parser de variação: nome do filho = "NomePai Opção:Valor"
- `CANETA BAZZE GEL GLITTER Tinta:Azul` → opção "Tinta", valor "Azul"
- Opções detectadas: Cor, Tinta, Estampa, Cor/Cheiro, Cor/Forma, etc.

Números: 145 produtos no Medusa (32 com variantes, 104 variantes totais, 50 categorias).

Webhook Bling `product.*` → salva em `sync.bling_products` → `syncBlingToMedusa()` em background.
Endpoint dedicado: `POST /api/sync/bling/categorias` — mapeia categoria→produtos sem full sync.

---

## Imagens de produtos Bling — qualidade HD

### Problema
O sync por listing (`GET /produtos`) retorna `imagemURL` = miniatura (path com `/t/`).
Imagens HD só estão disponíveis via `GET /produtos/{id}` → `midia.imagens.internas[].link`.

### Solução implementada
`api/src/integrations/bling/sync.ts` — dois mecanismos:

1. **UPSERT protegido**: se a imagem nova tem `/t/` no path E já existe imagem HD no banco → mantém a HD.
2. **`syncProductImages(blingIds?)`** — busca até 300 produtos com miniatura ou sem imagem, faz GET individual, salva HD.

Rota: `POST /api/sync/bling/imagens` (autenticada) — dispara em background.
Body opcional: `{ blingIds: ["123", "456"] }` para produtos específicos.

### Quando re-executar
- Ao cadastrar novos produtos no Bling com fotos
- Após troca de fotos de produtos existentes
- O sync incremental NÃO atualiza fotos HD automaticamente

---

## GTINs de produtos Bling

### Problema
O listing `GET /produtos` retorna `ProdutosDadosBaseDTO` que **não inclui o campo `gtin`**.
Somente `GET /produtos/{id}` (`ProdutosDados`) retorna o GTIN. Resultado: o sync incremental
nunca populava `sync.bling_products.gtin`, deixando todos os produtos com `gtin = NULL`.

### Impacto
O match de produtos na query de Novidades tem 4 critérios (OR):
1. SKU exato
2. GTIN produto = código NF
3. `nei.gtin IS NOT NULL AND bp.gtin = nei.gtin` ← exige bp.gtin preenchido
4. SKU normalizado (remove ` - `)

Sem GTIN, produtos cujo SKU difere do código da NF não aparecem nas Novidades.

### Solução implementada
**Dupla proteção em `sync.ts`:**

1. **UPSERT protegido**: `gtin = COALESCE($13, sync.bling_products.gtin)` — o listing envia NULL, mas `COALESCE` preserva o valor já salvo. O GTIN nunca é sobrescrito para NULL a cada ciclo incremental.

2. **`syncProductGtins(blingIds?)`** — backfill via `GET /produtos/{id}`: busca até 500 produtos com `gtin IS NULL`, extrai `data.gtin` e atualiza. Mesmo padrão do `syncProductImages`.

**Webhook** (`webhook.ts`): `processProduct()` já chama `GET /produtos/{id}` — salva `gtin` corretamente em product events.

Rota: `POST /api/sync/bling/gtins` (autenticada) — dispara em background.
Body opcional: `{ blingIds: ["123", "456"] }` para produtos específicos.

### Resultado atual
105/417 produtos com GTIN (os demais não têm GTIN cadastrado no Bling).

### Quando re-executar
- Ao cadastrar novos produtos com GTIN no Bling (webhook cuida automaticamente)
- Após backfill inicial em novo ambiente
- O sync incremental NÃO sobrescreve mais os GTINs salvos

---

## Fluxo completo: Produto no Bling → Seção Novidades

### Como funciona a seção Novidades
Mostra os produtos da **NF de entrada mais recente** com todos estes critérios:
- Produto ativo no Bling
- Tem foto com URL válida
- Tem preço de venda > 0
- Tem descrição não vazia
- Tem estoque físico > 0

Tabelas envolvidas: JOIN entre `sync.bling_products` e `financeiro.notas_entrada_itens`.

### Fluxo para aparecer em Novidades
1. **Produto no Bling** → webhook `product.created/updated` → salva imagem HD imediatamente
2. **NF de entrada** → Carlos aciona `POST /api/financeiro/nf-entrada/sync/bling` → importa NFs + itens
3. **Cache** → `/api/public/novidades` tem `Cache-Control: max-age=300` (5 min)

Sem a NF sincronizada, o produto não aparece — mesmo completo no catálogo.

### Cenários práticos
| Situação | Resultado |
|----------|-----------|
| Produto criado + tem NF + foto adicionada | Foto aparece em segundos (webhook) |
| Produto criado + tem NF + sem foto | Não aparece (sem foto) |
| Produto criado + SEM NF no sistema | Não aparece |
| Nova NF + Carlos sincronizou via CRM | Aparece em até 5 min |
| Nova NF + Carlos NÃO sincronizou | Não aparece |

### Match produto NF × catálogo (5 critérios OR)
1. SKU exato: `TRIM(bp.sku) = TRIM(nei.codigo_produto)`
2. GTIN como código: `bp.gtin = nei.codigo_produto`
3. GTIN direto: `nei.gtin IS NOT NULL AND bp.gtin = nei.gtin`
4. Separador normalizado: `REPLACE(TRIM(bp.sku), ' - ', ' ') = REPLACE(TRIM(nei.codigo_produto), ' - ', ' ')`
5. Nome do catálogo = descrição do item na NF: `LOWER(TRIM(bp.nome)) = LOWER(TRIM(nei.descricao))`

O critério 5 foi adicionado em 27/04/2026 para cobrir dois casos reais identificados na NF 099777:
- Produtos cadastrados no Bling **sem SKU** (nome é o único identificador confiável)
- Produtos cujo código do fornecedor na NF difere completamente do SKU interno (`CLIPS TONS PASTEL - BRW` → `CLIPS_N2_0002`)

Produtos pai+filho não usam GTIN — só SKU com sufixo (`CADERNETA_BRW - AZUL`).

### Coluna `gtin` em `notas_entrada_itens`
Adicionada live (09/04/2026 — sem migration file):
```sql
ALTER TABLE financeiro.notas_entrada_itens ADD COLUMN IF NOT EXISTS gtin character varying(14);
CREATE INDEX IF NOT EXISTS idx_nf_itens_gtin ON financeiro.notas_entrada_itens (gtin) WHERE gtin IS NOT NULL;
```

### Fluxo recomendado para NF com muitas fotos
1. Sobe as fotos no Bling produto a produto
2. Sincroniza a NF via CRM → `POST /nf-entrada/sync/bling`
3. Chama `POST /nf-entrada/:id/sync-imagens` → busca HD para todos os produtos da NF
4. Em ~30s todos os produtos têm imagens HD e aparecem em Novidades

### Arquivos-chave
- `api/src/integrations/bling/webhook.ts` → `processProduct()` — webhook com imagem HD, idempotência por `eventId`
- `api/src/routes/public-novidades.ts` → query JOIN bling_products + notas_entrada_itens
- `api/src/routes/nf-entrada.ts` → `POST /sync/bling`
- `api/src/integrations/bling/sync.ts` → `syncProductImages()`
