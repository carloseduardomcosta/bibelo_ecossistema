# Catálogo Fornecedor JC Atacado

Módulo para importar, curar e precificar o catálogo do fornecedor atacadojc.com.br diretamente no CRM.

---

## Visão geral

O módulo resolve um problema prático: a JC Atacado não oferece API ou exportação. O CRM extrai os dados via scraping do dataLayer GA4 embutido nas páginas de categoria, armazena localmente, e permite que Carlos configure markup e aprove produtos antes de qualquer uso externo.

**Fluxo completo:**
```
atacadojc.com.br (sitemap) → slugs das categorias
    → scraper percorre cada categoria (paginação automática)
    → extrai produtos do dataLayer GA4 (bracket-matching)
    → UPSERT em sync.fornecedor_catalogo_jc
    → Carlos configura markup por categoria
    → Carlos aprova produtos em lote (curadoria)
    → produtos aprovados ficam disponíveis para uso (B2B, revendedoras, etc.)
```

---

## Arquivos principais

| Arquivo | Função |
|---------|--------|
| `api/src/routes/fornecedor-catalogo.ts` | Backend completo: scraper + endpoints |
| `frontend/src/pages/FornecedorCatalogo.tsx` | Interface: stats, curadoria, markups, histórico |
| `db/migrations/033_fornecedor_catalogo.sql` | Tabelas do banco |
| `api/src/routes/fornecedor-catalogo.test.ts` | 46 testes automatizados |

---

## Banco de dados (`sync` schema)

### `sync.fornecedor_catalogo_jc`
Tabela central de produtos importados.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | ID interno |
| `item_id` | varchar(50) UNIQUE | ID do produto na JC (GA4 `item_id`) |
| `nome` | varchar(500) | Nome do produto |
| `categoria` | varchar(200) | Categoria extraída do GA4 `item_category` |
| `slug_categoria` | varchar(200) | Slug da URL da categoria (mais confiável que `categoria`) |
| `preco_custo` | numeric(10,2) | Preço de custo na JC (GA4 `price`) |
| `imagem_url` | text | NULL — não extraído ainda (fase 2) |
| `status` | varchar(20) | `rascunho` / `aprovado` / `pausado` |
| `markup_override` | numeric(4,2) | Markup individual (sobrepõe o da categoria) |
| `criado_em` | timestamptz | |
| `atualizado_em` | timestamptz | |

**Índices:** `item_id` (unique), `categoria` (btree), `nome` (gin trigram), `slug_categoria` (btree), `status` (btree)

### `sync.fornecedor_markup_categorias`
Markup padrão por categoria + marcador de conclusão do scraper.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `categoria` | varchar(200) PK | Slug da categoria |
| `markup` | numeric(4,2) | Multiplicador (default 2.00 = 100% de margem) |
| `atualizado_em` | timestamptz | Última edição de markup |

**Papel duplo:** além do markup, esta tabela funciona como marcador de categorias concluídas pelo scraper. Ao terminar uma categoria, o scraper insere um `ON CONFLICT DO NOTHING` aqui. O modo Retomar consulta esta tabela para saber o que já foi processado.

### `sync.fornecedor_sync_log`
Histórico de execuções do scraper.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | |
| `iniciado_em` | timestamptz | |
| `concluido_em` | timestamptz | NULL se ainda rodando |
| `status` | varchar(20) | `em_andamento` / `concluido` / `erro` / `interrompido` |
| `produtos_salvos` | int | Produtos novos inseridos |
| `produtos_atualizados` | int | Produtos existentes atualizados |
| `categorias_processadas` | int | Categorias concluídas |
| `total_categorias` | int | Total de categorias encontradas no sitemap |
| `erros` | int | Categorias que falharam (ex: 404) |
| `log` | text | Log linha a linha de cada categoria |

---

## Scraper — como funciona

### Extração de dados
O site atacadojc.com.br injeta um evento GA4 em cada página de listagem:
```js
dataLayer.push({
  event: 'view_item_list',
  ecommerce: {
    items: [
      { item_id: '12345', item_name: 'Caneta...', item_category: 'Canetas', price: 4.90 },
      ...
    ]
  }
});
```
O HTML usa aspas simples nos valores e chaves JS sem aspas (`items:` ao invés de `"items":`).

**Algoritmo de extração (bracket-matching):**
1. Localiza `view_item_list` no HTML
2. Busca `items:` via regex `/\bitems\s*:/` dentro de 600 chars
3. Encontra o `[` de abertura do array
4. Faz bracket-matching `[{` → `]}` para encontrar o fechamento
5. `JSON.parse()` do trecho extraído

### Paginação
1. Busca página 1: `https://www.atacadojc.com.br/{slug}/`
2. Extrai `CodigoDepartamento` do HTML (parâmetro de paginação)
3. Páginas seguintes: `/{slug}?CodigoDepartamento={id}&Pagina={n}`
4. Para quando a página retorna 0 produtos (fim da listagem)
5. Máximo de 80 páginas por categoria (proteção contra loop infinito)

### Rate limiting
- 900ms de delay entre cada requisição
- ~65 req/min (respeita o servidor)
- Pausa dupla (1800ms) após erro

### Categorias 404
42 categorias do sitemap retornam 404 — são categorias extintas ou movidas. O scraper registra como erro e continua. É comportamento esperado.

### Modo Retomar
Ao clicar "Retomar" (em vez de "Importar tudo"):
1. Consulta `SELECT categoria FROM sync.fornecedor_markup_categorias`
2. Filtra slugs pendentes = total_sitemap − já_concluídos
3. Inicia apenas pelos pendentes, mas exibe o total correto na barra de progresso

**Por que usar `fornecedor_markup_categorias` como marcador?**
A alternativa (`slug_categoria IS NOT NULL`) era frágil: se o container morresse entre o INSERT de produto e o UPDATE de `slug_categoria`, produtos existiam sem slug e a categoria era reprocessada parcialmente. Com a tabela de markups como marcador, a categoria só é marcada como "concluída" após todo o loop de páginas terminar.

### Estado em memória
`scraperState` (módulo-level) armazena progresso real-time:
- `running`, `total_categorias`, `categorias_feitas`, `categoria_atual`
- `produtos_salvos`, `produtos_atualizados`, `erros`
- `log_id`, `iniciado_em`, `mensagem`

O frontend faz polling a cada 3s em `/scraper/status` para atualizar a barra de progresso.

**Limitação:** o estado é perdido se o container reiniciar. Ao voltar, o status real está no banco (`fornecedor_sync_log`). Use "Retomar" após qualquer reinício.

---

## Endpoints da API

Todos protegidos por `authMiddleware`. Base: `/api/fornecedor-catalogo/`

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/stats` | Totais: total, rascunho, aprovado, pausado, categorias, última sync |
| `GET` | `/markup` | Lista markups por categoria com contagens de produtos |
| `PUT` | `/markup` | Atualiza markups em lote. Body: `{ markups: [{categoria, markup}] }` |
| `GET` | `/produtos` | Listagem com filtros. Params: `page`, `limit`(máx 500), `search`, `categoria`, `status` |
| `GET` | `/produtos/por-categoria` | Agrupado por categoria — usado na tab Curadoria |
| `PUT` | `/produtos/:id/status` | Altera status individual. Body: `{ status, markup_override? }` |
| `POST` | `/aprovar-lote` | Aprova lista de UUIDs. Body: `{ ids: string[] }` |
| `POST` | `/scraper/iniciar` | Inicia scraper. Body opcional: `{ retomar: true }` |
| `POST` | `/scraper/parar` | Interrompe scraper (seta `running = false`) |
| `GET` | `/scraper/status` | Estado em memória (progresso real-time) |
| `GET` | `/scraper/historico` | Últimas 20 execuções do banco |

### Cálculo de preço de revenda
```sql
preco_revenda = preco_custo × COALESCE(markup_override, markup_categoria, 2.00)
```
- Markup padrão: 2.00 (100% de margem — dobra o preço de custo)
- Hierarquia: override individual → markup da categoria → fallback 2.00
- Markup mínimo: 1.0 | Máximo: 5.0

---

## Frontend — FornecedorCatalogo.tsx

### Tab Curadoria
- Lista de categorias com total de produtos, faixa de preço e quantidade a aprovar
- Expandir categoria (setinha) → busca `/produtos?categoria={slug}&limit=200`
- Aprovar produto individual: `PUT /produtos/:id/status`
- Aprovar todos da categoria em lote: `POST /aprovar-lote` com os IDs filtrados
- Markup por categoria editável inline (salva no PUT /markup)

### Tab Markups
- Tabela de todas as categorias com markup atual
- Edição inline do multiplicador
- Salva em lote ao clicar "Salvar"

### Tab Histórico
- Lista das últimas execuções com status, duração, contadores
- Botão "Ver log" para exibir o log linha a linha

### Botões de import
- **Retomar** — aparece apenas quando já existem produtos no banco; usa `{ retomar: true }`
- **Importar tudo** — sempre disponível; reprocessa todas as 172 categorias

---

## Resultado do import inicial (12/04/2026)

| Métrica | Valor |
|---------|-------|
| Categorias processadas | 130/172 |
| Categorias com 404 | 42 (extintas no site) |
| Produtos novos | 1.186 |
| Produtos atualizados (runs anteriores) | ~73.778 |
| Duração total | ~89 minutos |
| Erros de scraping | 0 |

---

## Próximos passos

### Fase 2 — Curadoria e precificação
1. **Configurar markups por categoria** — definir margem de cada categoria (ex: cadernos 2.5×, artigos de festa 3×)
2. **Aprovar produtos** — percorrer categorias relevantes e aprovar os produtos que valem repassar para revendedoras
3. **Pausar categorias fora do escopo** — produtos que a Bibelô não trabalha

### Fase 3 — Enriquecimento de dados (backlog)
Scraping de página individual `atacadojc.com.br/produto/{slug}` para buscar:
- **Foto** — URL da imagem principal
- **Descritivo** — descrição longa do produto
- **Medidas e peso** — dimensões (útil para calcular frete e para catálogo)

Implementação: job de enriquecimento em background, similar ao `syncProductImages` do Bling. Processa produtos com `imagem_url IS NULL`, sem bloquear o scraper principal.

### Fase 4 — Portal B2B revendedoras
Com curadoria e preços prontos, definir o formato de entrega para as revendedoras:
- **Opção A** — PDF gerado automaticamente com os produtos aprovados + preços
- **Opção B** — Catálogo web privado (link + senha)
- **Opção C** — Integração com o módulo Revendedoras já existente no CRM

### Atualizações periódicas do catálogo
O scraper deve ser reexecutado periodicamente (ex: mensal) para capturar:
- Novos produtos da JC
- Mudanças de preço
- Produtos descontinuados (status do site → marcar como pausado)

**Sugestão:** botão "Atualizar preços" que roda o scraper em modo full mas sem mudar `status` dos produtos já aprovados.

---

## Problemas conhecidos e soluções

| Problema | Causa | Solução |
|----------|-------|---------|
| GA4 `item_category` impreciso | A JC categoriza produtos incorretamente no GA4 | Usar `slug_categoria` (URL) como chave — mais confiável |
| Estado do scraper perdido após rebuild | `scraperState` é in-memory | Usar "Retomar" após qualquer reinício do container |
| 42 categorias com erro | Páginas 404 — categorias extintas no site | Esperado. Não são falhas do scraper |
| `z.toFixed is not a function` | PostgreSQL `NUMERIC` retorna string via node-postgres | `Number()` em todos os cálculos de markup no frontend |
| Paginação com max 80 páginas | Proteção contra loop infinito | Categorias grandes (ex: adesivos) têm 80 páginas × ~24 produtos = ~1.920 itens |
