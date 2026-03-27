# Padrao de Imagens de Produtos — Bibelo

Analise realizada em 27/03/2026 para definir o padrao universal de imagens.

---

## Problema Atual

- Bling armazena e serve imagens em **WEBP** (converte automaticamente)
- Shopee **NAO aceita WEBP** — precisa JPG ou PNG
- Site NuvemShop tem tamanhos inconsistentes
- Upload de volta para o Bling e **manual** (limitacao da API deles)

---

## Requisitos por Marketplace

| Marketplace | Formatos | Min px | Recomendado | Fundo Branco | Max Tamanho |
|---|---|---|---|---|---|
| **Shopee BR** | JPG, PNG | 500x500 | 1024x1024 | Preferivel | 2 MB |
| **Mercado Livre** | JPG, PNG, WEBP | 500x500 | 1200x1200 | Obrigatorio (principal) | 10 MB |
| **Amazon BR** | JPEG, PNG, GIF, TIFF | 1000x1000 | 2000x2000 | Obrigatorio (principal) | 10 MB |
| **NuvemShop** | JPG, PNG, GIF, WEBP | sem minimo | 1024x1024 | Recomendado | 10 MB |
| **Bling** | JPG, PNG, GIF (converte p/ WEBP) | sem minimo | sem limite | Nao | varia |

---

## Padrao Universal Recomendado

### Formato Master (funciona em TODOS os canais)

```
Formato:     JPEG (.jpg)
Dimensao:    2000 x 2000 px (quadrado 1:1)
Qualidade:   85-90%
Fundo:       Branco puro (#FFFFFF)
Tamanho max: 2 MB
```

### Por que JPEG e nao PNG?

| Fator | JPEG | PNG |
|---|---|---|
| Tamanho | 60-200 KB | 500 KB - 2 MB+ |
| Qualidade | Otima para fotos | Excelente (lossless) |
| Transparencia | Nao | Sim |
| Compatibilidade | Universal | Universal |
| **Veredicto** | **Melhor para produto (foto)** | Melhor se precisa transparencia |

Para fotos de produtos de papelaria (canetas, cadernos etc), **JPEG 85% e o ideal** — arquivo leve, qualidade excelente, aceito em todos os marketplaces.

PNG so faz sentido se precisar de fundo transparente (composicoes, banners).

### Por que 2000x2000?

- Atende Amazon (zoom precisa de 1000+ px)
- Sobra qualidade para Shopee e ML
- Permite crop/redimensionamento sem perda
- Padrao da industria para e-commerce

### Por que fundo branco?

- Amazon e ML **exigem** fundo branco na imagem principal
- Shopee **recomenda**
- NuvemShop fica mais profissional
- Produto se destaca melhor

---

## Imagens do Bling (estado atual)

As imagens dos produtos no Bling estao em:
- Formato: WEBP (convertido automaticamente pelo Bling)
- Hospedagem: S3 da Bling (orgbling.s3.amazonaws.com)
- URLs tem expiracao (assinatura AWS)
- Imagens internas (upload) e externas (URL)

Exemplo de URL:
```
https://orgbling.s3.amazonaws.com/.../imagem?AWSAccessKeyId=...&Expires=...&Signature=...
```

---

## Pipeline de Conversao (a implementar)

```
1. Busca URL WEBP do Bling (ja temos no sync)
      ↓
2. Download da imagem original
      ↓
3. Conversao WEBP → JPEG 85%
      ↓
4. Redimensiona para 2000x2000 (pad com branco se nao quadrada)
      ↓
5. Salva localmente + disponibiliza download
      ↓
6. Download individual ou ZIP por categoria
      ↓
7. Upload manual para Bling / Shopee / etc
```

### Tecnologia sugerida
- **sharp** (Node.js) — conversao WEBP→JPEG, resize, padding
- Processamento em background (BullMQ)
- Armazenamento local ou R2 (Cloudflare)

---

## Regra de Negocio

- Imagem principal: JPEG 2000x2000, fundo branco, produto centralizado
- Imagens secundarias: podem ter contexto/lifestyle
- Nomear arquivo: `{SKU}_01.jpg`, `{SKU}_02.jpg` etc
- Organizar por categoria para upload em lote

---

*Documento de referencia para implementacao do conversor de imagens*
