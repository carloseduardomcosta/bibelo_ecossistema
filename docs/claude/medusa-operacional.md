# Medusa.js v2 — Guia operacional completo

## Contexto
- Versão: @medusajs/medusa 2.13.5 + @medusajs/utils 2.13.5
- Container: bibelo_medusa → porta interna 9000
- Acesso externo: https://api.papelariabibelo.com.br → Nginx → localhost:9000
- Admin: DESABILITADO (admin: { disable: true }) — bug ADMIN_RELATIVE_OUTPUT_DIR na versão atual
- Demora ~90s para ficar healthy após subir

## Estrutura de arquivos no container de produção
- `.medusa/` → build output do framework
- `node_modules/` → dependências (1228 pacotes, NÃO ignorar no .dockerignore)
- `package.json`, `medusa-config.ts`, `tsconfig.json`
- `dist/` → módulos customizados compilados (src/ compilado)

**CRÍTICO**: Custom modules precisam ser copiados via `dist/`. O `medusa build` NÃO copia custom modules para `.medusa/server/`.
Sempre adicionar no Dockerfile stage production: `COPY --from=builder --chown=medusa:medusa /app/dist ./dist`

## .dockerignore obrigatório
```
.git
.env
*.log
.medusa
```
NÃO ignorar `node_modules` — evita npm ci dentro do Docker (25+ min)

## Dockerfile padrão validado
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN DATABASE_URL=postgres://x:x@localhost/x \
    REDIS_URL=redis://localhost:6379 \
    STORE_CORS=http://localhost \
    ADMIN_CORS=http://localhost \
    AUTH_CORS=http://localhost \
    ./node_modules/.bin/medusa build

FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -S medusa && adduser -S medusa -G medusa
COPY --from=builder --chown=medusa:medusa /app/.medusa ./.medusa
COPY --from=builder --chown=medusa:medusa /app/node_modules ./node_modules
COPY --from=builder --chown=medusa:medusa /app/package.json ./
COPY --from=builder --chown=medusa:medusa /app/medusa-config.ts ./
COPY --from=builder --chown=medusa:medusa /app/tsconfig.json ./
COPY --from=builder --chown=medusa:medusa /app/dist ./dist
COPY --from=builder --chown=medusa:medusa /app/.medusa/client ./public/admin
RUN node -e "const fs=require('fs');const f='/app/node_modules/@medusajs/utils/dist/index.js';const c=fs.readFileSync(f,'utf8');if(!c.includes('ADMIN_RELATIVE_OUTPUT_DIR')){fs.appendFileSync(f,'\nexports.ADMIN_RELATIVE_OUTPUT_DIR=\".medusa/client\";\n');}"
USER medusa
ENV NODE_ENV=production
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=90s \
  CMD node -e "require('http').get('http://localhost:9000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
```

## Regras de build — NUNCA violar
- NUNCA usar --no-cache → demora 25+ minutos
- SEMPRE usar DOCKER_BUILDKIT=1
- NUNCA rodar npm ci dentro do Docker
- Timeout mínimo 15 minutos em qualquer build
- Comando correto: `DOCKER_BUILDKIT=1 docker compose build medusa`

## DATABASE_URL obrigatório
Sempre com `?sslmode=disable` — Postgres interno não tem SSL:
```
DATABASE_URL: postgresql://${DB_USER}:${DB_PASS}@postgres:5432/medusa_db?sslmode=disable
```

## Nginx — roteamento obrigatório
O Medusa só é acessível externamente via Nginx.
Webhooks externos (MP, Bling) chegam em `api.papelariabibelo.com.br` → Nginx → localhost:9000
```bash
nginx -t && grep -r "9000" /etc/nginx/sites-enabled/
```

## Módulos customizados
Path no medusa-config.ts: `"./dist/src/modules/NOME"`
NÃO usar `"./src/modules/NOME"` — src/ não existe no container de produção.
Após criar qualquer módulo novo → rebuild obrigatório.

## Comandos do dia a dia
```bash
# Health check
curl -s http://localhost:9000/health

# Logs em tempo real
docker compose logs -f medusa --tail=30

# Rebuild correto
DOCKER_BUILDKIT=1 docker compose build medusa && docker compose up -d medusa

# Aguardar health após rebuild
for i in $(seq 1 24); do sleep 5; S=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/health 2>/dev/null); echo "$i: $S"; [ "$S" = "200" ] && echo "OK" && break; done

# Criar admin user
docker compose exec medusa npx medusa user -e EMAIL -p SENHA

# Migrations manuais
docker compose exec medusa npx medusa db:migrate

# Testar webhook local
curl -v -X POST http://localhost:9000/webhooks/mercadopago \
  -H "Content-Type: application/json" \
  -d '{"type":"payment","data":{"id":"123"}}'
```

## Problemas conhecidos e soluções
| Problema | Causa | Solução |
|---|---|---|
| Cannot find module './src/modules/X' | dist/ não copiado para container | Adicionar COPY dist/ no Dockerfile |
| ADMIN_RELATIVE_OUTPUT_DIR undefined | Bug versão 2.13.5 | Patch no utils/dist/index.js + admin: disable: true |
| ENOTEMPTY no npm install | node_modules corrompido | rm -rf node_modules package-lock.json && npm install |
| Connection refused porta 9000 | Container caiu ou ainda subindo | Aguardar 90s, verificar logs |
| 404 em webhook externo | Nginx sem bloco para api.papelariabibelo.com.br | Criar site no Nginx + certbot SSL |
| npm ci demora 25+ min | Baixando 1228 pacotes do zero | Não ignorar node_modules no .dockerignore |

## Admin Dashboard — RESOLVIDO em 01/04/2026
Causa: admin-bundler usa `ADMIN_RELATIVE_OUTPUT_DIR = "./public/admin"`
Solução: `COPY --from=builder --chown=medusa:medusa /app/.medusa/client ./public/admin`
Acesso: https://api.papelariabibelo.com.br/app/ (restrito por IP no Nginx)
Admin user: contato@papelariabibelo.com.br
IPs autorizados:
- 186.226.157.81 — casa
- 163.116.233.0/24 — bloco Netskope
- 187.85.161.0/24 — empresa bloco Netskope
