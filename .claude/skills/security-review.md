---
name: security-review
description: Use quando adicionar auth, tratar input de usuário, criar endpoints de API, trabalhar com secrets, integrar Bling/NuvemShop/SES, ou implementar webhooks. Checklist de segurança específico para o stack BibelôCRM.
allowed-tools: Read, Grep, Glob, Bash
---

# Security Review — BibelôCRM

Checklist de segurança antes de qualquer commit que toque em endpoints, emails, webhooks ou integrações externas.

## 1. SQL — Parameterização obrigatória

```typescript
// ERRADO — concatenação = SQL injection
const q = `SELECT * FROM crm.customers WHERE email = '${email}'`

// CORRETO — sempre $1, $2
const row = await queryOne(
  'SELECT * FROM crm.customers WHERE email = LOWER($1)',
  [email]
)

// CORRETO — intervalos dinâmicos
await query(`SELECT * FROM ... WHERE criado_em >= NOW() - make_interval(days => $1)`, [dias])
```

Verificar: `grep -r "WHERE.*\${" api/src/` — resultado esperado: vazio.

## 2. XSS — Escaping em HTML/emails

```typescript
// ERRADO — variável do banco direta em HTML
const html = `<p>Olá ${customer.nome}</p>`

// CORRETO — sempre esc() em variáveis dentro de HTML ou templates de email
import { esc } from '../utils/email'
const html = `<p>Olá ${esc(customer.nome)}</p>`
```

Verificar em templates de email: todo `${customer.nome}`, `${produto.nome}`, `${order.id}` deve passar por `esc()`.

## 3. HMAC — Webhooks Bling e NuvemShop

```typescript
// CORRETO — verificação em tempo constante + tamanho + prefixo
import { timingSafeEqual } from 'crypto'

const expected = Buffer.from(`sha256=${hmac}`)
const received = Buffer.from(signature)
if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
  return res.status(401).json({ error: 'Assinatura inválida' })
}
```

Nunca usar `===` para comparar HMACs — vulnerável a timing attack.

## 4. Secrets — nunca hardcodados

```typescript
// ERRADO
const token = 'eyJhbGciOiJIUzI1NiJ9...'

// CORRETO
const token = process.env.BLING_ACCESS_TOKEN
if (!token) throw new Error('BLING_ACCESS_TOKEN não configurado')
```

Verificar: `grep -r "Bearer ey" api/src/` — resultado esperado: vazio.

## 5. Rate limiting — endpoints públicos

Todo endpoint sem `authMiddleware` deve ter `publicLimiter`:

```typescript
import { publicLimiter } from '../middleware/rateLimiter'

router.post('/capture', publicLimiter, async (req, res) => { ... })
```

Endpoints que precisam de rate limit especial (ex: webhooks externos):
verificar se já têm `publicLimiter` ou o próprio `express-rate-limit` configurado.

## 6. Auth — nunca expor detalhes internos

```typescript
// ERRADO — expõe stack trace
catch (error) {
  res.status(500).json({ error: error.message, stack: error.stack })
}

// CORRETO — log interno, resposta genérica
catch (error) {
  logger.error('Falha ao processar pedido', { error })
  res.status(500).json({ error: 'Erro interno. Tente novamente.' })
}
```

## 7. Logs — nunca logar secrets

```typescript
// ERRADO
logger.info('Token Bling', { token: process.env.BLING_ACCESS_TOKEN })

// CORRETO — logar só identificadores seguros
logger.info('Sync Bling iniciado', { customerId, syncType })
```

## 8. Inputs — validação Zod em todas as rotas

```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  nome: z.string().min(1).max(200),
})

router.post('/leads', publicLimiter, async (req, res) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
  // ...
})
```

## Checklist pré-commit

- [ ] Nenhuma query SQL concatenada com variável — só `$1, $2`
- [ ] Todo HTML de email tem `esc()` nas variáveis do banco
- [ ] Webhooks verificam HMAC com `timingSafeEqual`
- [ ] Sem secrets hardcodados — `grep -r "sk-\|eyJ\|token.*=.*'" api/src/`
- [ ] Endpoints públicos têm `publicLimiter`
- [ ] Catch blocks retornam mensagem genérica ao cliente
- [ ] Nenhum `console.log` — só `logger.info/error`
- [ ] Inputs validados com Zod

## Proteção especial — Bling ERP

NUNCA enviar PATCH ao Bling que inclua campos de estoque, preço ou imagens sem autorização explícita do Carlos. Verificar antes de qualquer `blingApi.patch('/produtos/...')`.
