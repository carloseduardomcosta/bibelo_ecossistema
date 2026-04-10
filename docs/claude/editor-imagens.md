# Editor de Imagens para Marketplaces

Ferramenta integrada para converter e enviar imagens de produtos para múltiplas plataformas.

## Fluxo: Foto distribuidor → Bling
1. Upload WEBP/JPG/PNG no editor (drag-and-drop, até 50 imagens)
2. Sharp converte: redimensiona quadrado, fundo branco, formato/qualidade por preset
3. Seleciona produto Bling por nome/SKU — preview das imagens atuais é exibido
4. Toggle "Substituir imagens existentes" (ativo por padrão) — limpa antes de enviar
5. "Enviar ao Bling" → imagem salva em URL pública temporária → PATCH /produtos/{id} com `imagensURL`
6. Bling baixa, processa, armazena no S3 interno. URL temporária expira em 1h.

## Remoção de fundo (IA local)
- Lib: `@imgly/background-removal-node` (ONNX, modelo U2Net, roda no servidor)
- Dockerfile API: `node:20-slim` (Debian) — necessário para onnxruntime (glibc)
- Tempo: ~10s por imagem de produto real
- Toggle no frontend: "Remover fundo (IA)" nas configurações de conversão

## Comportamento da API Bling para imagens
- `PATCH imagensURL: [{link}]` → **ADICIONA** às imagens existentes (não substitui)
- `PATCH imagensURL: []` → **LIMPA TODAS** as imagens do produto
- Para substituir: primeiro PATCH com `[]`, depois PATCH com as novas URLs (flag `replaceAll`)
- Campos `internas` e `externas` são readOnly — ignorados no PATCH

## Presets
| Preset | Dimensão | Formato | Qualidade |
|--------|----------|---------|-----------|
| Shopee | 1000×1000 | JPG | 90 |
| NuvemShop | 1024×1024 | JPG | 92 |
| Loja Própria | 1200×1200 | PNG | 95 |
| Instagram | 1080×1080 | JPG | 95 |

## Arquivos
- Backend: `api/src/routes/images.ts` — conversão, serve, envio Bling
- Frontend: `frontend/src/pages/EditorImagens.tsx`
- Testes: `api/src/routes/images.test.ts` (27 testes)
- Nginx: `api.papelariabibelo.com.br` tem bloco `/api/images/serve/` → porta 4000

## Segurança da rota pública `/api/images/serve/:id`
- Rate limit 60 req/min, regex whitelist, path traversal bloqueado
- IDs aleatórios (crypto.randomBytes), auto-cleanup 1h, X-Content-Type-Options: nosniff
