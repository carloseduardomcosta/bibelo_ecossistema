---
name: verification-loop
description: Use antes de criar PR, após feature completa, ou após refactor. Roda build → typecheck → lint → testes e reporta o que está quebrado. Stack: Node.js + TypeScript + Vitest.
allowed-tools: Bash
---

# Verification Loop — BibelôCRM

Checklist de qualidade antes de qualquer PR ou deploy. Rodar em sequência — parar na primeira falha crítica.

## Fase 1 — Build da API

```bash
cd /opt/bibelocrm
docker compose exec api npx tsc --noEmit -p api/tsconfig.json 2>&1 | head -40
```

Se tiver erros de tipo: listar todos, corrigir antes de continuar.

## Fase 2 — Build do Frontend

```bash
docker compose exec frontend npx tsc --noEmit -p frontend/tsconfig.json 2>&1 | head -40
```

## Fase 3 — Testes

```bash
cd /opt/bibelocrm
bash scripts/test.sh 2>&1 | tail -30
```

Baseline: **615 testes** (484 CRM + 131 storefront). Se cair abaixo de 480 na API ou 120 no storefront — investigar regressão antes do commit.

Para rodar um arquivo específico:
```bash
bash scripts/test.sh api/src/routes/ARQUIVO.test.ts
```

## Fase 4 — Health check dos containers

```bash
curl -s http://localhost:4000/health | jq .
docker compose ps --format "table {{.Name}}\t{{.Status}}"
```

Todos os serviços devem estar `healthy` ou `running`.

## Fase 5 — Verificações rápidas de segurança

```bash
# SQL injection — concatenações suspeitas
grep -rn "WHERE.*\${" api/src/routes/ api/src/services/ 2>/dev/null

# Secrets hardcodados
grep -rn "Bearer ey\|sk-proj\|password.*=.*['\"]" api/src/ 2>/dev/null | grep -v ".env\|node_modules"

# console.log esquecido
grep -rn "console\.\(log\|warn\|error\)" api/src/ frontend/src/ 2>/dev/null | grep -v "node_modules\|\.test\."
```

Resultado esperado: vazio nos três.

## Fase 6 — Migration pendente?

```bash
ls db/migrations/ | tail -5
docker compose exec postgres psql -U bibelocrm bibelocrm -c \
  "SELECT filename FROM public.migrations ORDER BY run_on DESC LIMIT 3;"
```

Se tiver migration nova que ainda não rodou — executar antes do deploy.

## Relatório de saída

```
## Verification Loop — [data]

### Build
- API typecheck: ✅ OK | ❌ N erros
- Frontend typecheck: ✅ OK | ❌ N erros

### Testes
- Total: N/615 | Falhas: X
- [listar testes que falharam]

### Containers
- [status de cada serviço]

### Segurança
- SQL injection scan: ✅ limpo | ⚠️ [arquivos suspeitos]
- Secrets scan: ✅ limpo | ⚠️ [arquivos suspeitos]
- console.log scan: ✅ limpo | ⚠️ [N ocorrências]

### Migrations
- Última migration aplicada: [nome]
- Pendente: [sim/não]

### Veredicto
✅ Pronto para PR | ❌ Corrigir antes: [lista]
```
