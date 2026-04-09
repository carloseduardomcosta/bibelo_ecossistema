# Descrições de Produtos — Bling

Levantamento e plano de preenchimento das descrições de produtos no Bling ERP.

**Data do levantamento:** 09/04/2026
**Fonte:** API Bling v3 — consulta individual em cada produto (`GET /produtos/{id}`)
**Escopo:** 285 produtos pai/simples ativos (exclui 127 variações/filhos)

---

## Campos de descrição no Bling

| Campo | Onde aparece | Uso |
|-------|-------------|-----|
| `descricaoCurta` | Aba principal do cadastro | Descrição principal do produto — HTML rico (h3, p, ul/li). Exibida na loja, marketplace e sincronizada com Medusa via `extractDescription()` |
| `descricaoComplementar` | Aba complementar do cadastro | Descrição reduzida/resumida. Texto mais curto, pode ser HTML simples |

---

## Resultado do levantamento

| Status | Qtd | % |
|--------|:---:|:-:|
| Com AMBAS (curta + complementar) | 83 | 29,1% |
| Só curta, sem complementar | 182 | 63,9% |
| Só complementar, sem curta | 8 | 2,8% |
| Sem nenhuma descrição | 12 | 4,2% |
| **Total** | **285** | **100%** |

---

## Produtos sem nenhuma descrição (12)

| Bling ID | Produto | Formato |
|----------|---------|:-------:|
| 16579716047 | CADERNO 01X1 CD.80FLS TILIBRA AMARENA | V |
| 16627671017 | CANETA BRW 0.7 GEL GLITTER RT COLORS CA0214 - APAGAVEL | S |
| 16579716028 | CANETA BRW 0.7 GEL PAWS AZUL APAGAVEL - PREMIUM | V |
| 16579716029 | CANETA BRW 0.7 GEL POMPOM FLUFFY AZUL APAGAVEL - PREMIUM | V |
| 16627049021 | Caixinha Adesivo | S |
| 16627535384 | Caneta Capivara Buendia | S |
| 16627043050 | Kit 3 Canetas Floral China | S |
| 16601420034 | Kit Volta às Aulas | V |
| 16627671025 | LAPIS 24=48 CORES FABER CASTELL BICOLOR | S |
| 16579682021 | Lápis HB C/ PONTEIRA CORACAO BRW | V |
| 16627045985 | Marcador de Página Capivara | S |
| 16627028482 | Marcador de página gato no livro | S |

---

## Produtos só com complementar, sem curta (8)

| Bling ID | Produto | Formato |
|----------|---------|:-------:|
| 16604935555 | CADERNETA ESP.CF.80FLS BRW ZOO | V |
| 16595598945 | CADERNO 01X1 CD.80FLS ANIMATIVA PIXEL | V |
| 16589454551 | CANETA BRW 0.7 GEL S2 AZUL APAGAVEL - PREMIUM | V |
| 16618612296 | CANETA BRW 0.7 UNIC ESTAMPADA TINTA AZUL | V |
| 16622599117 | CANETA VORTEX BRW 0.7 | V |
| 16618612290 | MARCA TEXTO BRW SORTIDO NEON + CARIMBO P.FINA | V |
| 16622597543 | MARCADOR MULTISSUPERFICIE TRIS ACRILICO 1.2 | V |
| 16623060147 | Regua Transparente com Stencil | V |

> Todos são formato "V" (com variações). Para atualizar via API, o PATCH exige enviar as variações junto.

---

## Produtos só com curta, sem complementar (182)

São 182 produtos que têm `descricaoCurta` preenchida mas `descricaoComplementar` vazia. Lista completa não incluída por extensão — consultar via API ou banco local (`dados_raw`).

**Categorias predominantes:** agendas, cadernos, canetas, kits, marcadores, papéis, estojos, acessórios.

---

## Padrão HTML das descrições

### descricaoCurta (principal) — padrão completo

```html
<h3>Nome do Produto</h3>
<p>Parágrafo descritivo com apelo emocional e uso prático.</p>
<h4>Especificações:</h4>
<ul>
<li>Marca: XXX</li>
<li>Modelo: XXX</li>
<li>Ponta/Tamanho: XXX</li>
<li>Material: XXX</li>
<li>Conteúdo: X unidade(s)</li>
</ul>
<h4>Benefícios:</h4>
<ul>
<li>Benefício 1</li>
<li>Benefício 2</li>
<li>Benefício 3</li>
</ul>
<p>Frase de fechamento com apelo à compra.</p>
```

### descricaoComplementar (reduzida) — padrão texto simples

A complementar é um **texto curto e direto, sem HTML**, com 1-2 frases que resumem o produto. Fórmula:

```
[O que é] + [especificação principal] + [diferencial/linha] + [para quem/uso]. Contém X unidade(s).
```

**Exemplo real aplicado:**

descricaoCurta (HTML rico):
```html
<h3>Caneta BRW 0.7 Gel Crazy Fluffles Azul CA0241 - Apagável</h3>
<p>A Caneta Gel Crazy Fluffles da BRW é pura diversão e fofura!...</p>
<h4>Especificações:</h4>
<ul><li>Marca: BRW</li><li>Modelo: CA0241</li>...</ul>
<h4>Benefícios:</h4>
<ul><li>Escrita macia e fluida</li>...</ul>
<p>Uma caneta cheia de personalidade...</p>
```

descricaoComplementar (texto simples):
```
Caneta gel azul 0.7 mm apagável com design divertido da linha Crazy Fluffles. Escrita macia e ideal para estudos, planners e uso criativo. Contém 1 unidade.
```

### Diferença entre curta e complementar

| Aspecto | descricaoCurta | descricaoComplementar |
|---------|---------------|----------------------|
| Formato | HTML rico (h3, h4, ul/li, p) | Texto simples, sem HTML |
| Estrutura | Título + descrição + specs + benefícios + fechamento | 1-2 frases diretas |
| Tom | Detalhado, visual de ficha técnica | Resumido, objetivo |
| Tamanho | ~400-600 caracteres | ~100-200 caracteres |
| Uso | Página do produto, marketplace | Listagens, resumos, buscas |

---

## Atualização via API Bling

### Produto simples (formato "S")

```bash
curl -X PATCH "https://api.bling.com.br/Api/v3/produtos/{id}" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"descricaoCurta": "...", "descricaoComplementar": "..."}'
```

### Produto com variações (formato "V")

O PATCH exige o campo `variações` no body. Necessário buscar as variações existentes via `GET /produtos/{id}` e reenviá-las no PATCH junto com os campos de descrição.

```bash
# 1. GET para obter variações atuais
curl "https://api.bling.com.br/Api/v3/produtos/{id}" -H "Authorization: Bearer {token}"

# 2. PATCH com variações + descrição
curl -X PATCH "https://api.bling.com.br/Api/v3/produtos/{id}" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"descricaoCurta": "...", "descricaoComplementar": "...", "variações": [...]}'
```

---

## Prioridade de preenchimento

| Prioridade | Grupo | Qtd | Ação |
|:----------:|-------|:---:|------|
| **P0** | Sem nenhuma descrição | 12 | Gerar curta + complementar |
| **P1** | Só complementar (sem curta) | 8 | Gerar curta |
| **P2** | Só curta (sem complementar) | 182 | Gerar complementar |

---

## Sync local — observação

O sync incremental do Bling salva `descricaoCurta` no campo `dados_raw` da tabela `sync.bling_products`, mas **não salva** `descricaoComplementar`. Para levantamentos futuros, consultar a API diretamente.

O Medusa recebe a descrição via `extractDescription()` em `api/src/integrations/medusa/sync.ts:599-600`:
```typescript
const desc = raw?.descricaoCurta || raw?.descricaoComplementar || ""
```
Ou seja, usa `descricaoCurta` como prioridade e fallback para `descricaoComplementar`.

---

## Testes realizados

Em 09/04/2026:
1. **descricaoCurta** enviada para CANETA BRW 0.7 GEL CRAZY FLUFFLES AZUL CA0241 (ID `16627671023`, formato S) — sucesso
2. **descricaoComplementar** enviada para o mesmo produto — sucesso
3. Ambos os campos atualizados via PATCH único — sem impacto em estoque, preço ou imagens
4. Padrão HTML documentado a partir de 83 produtos que já possuem ambas as descrições

---

*Última atualização: 09/04/2026*
