# Docker — Guia de Operação BibelôCRM

Referência completa para operar, debugar e recuperar o ambiente Docker do BibelôCRM.
Válido mesmo sem acesso ao Claude Code.

---

## Containers e Portas

| Container | Imagem | Porta | Descrição |
|---|---|---|---|
| `bibelo_postgres` | `postgres:16-alpine` | 5432 (interno) | Banco principal |
| `bibelo_redis` | `redis:7-alpine` | 6379 (interno) | Cache + filas BullMQ |
| `bibelo_api` | build local | 4000 | Backend Node.js/Express |
| `bibelo_frontend` | build local | 3000 | Painel CRM React |
| `bibelo_medusa` | build local | 9000 | E-commerce Medusa.js v2 |
| `bibelo_storefront_v2` | build local | 8001 | Loja Next.js |
| `bibelo_uptime` | `louislam/uptime-kuma:1` | 3001 | Monitor Uptime Kuma |

> Todos os containers ficam em `/opt/bibelocrm/` — nunca rodar fora desse diretório.

---

## Comandos do Dia a Dia

```bash
cd /opt/bibelocrm

# Ver status de todos os containers
docker compose ps

# Ver logs em tempo real (Ctrl+C para sair)
docker compose logs -f api
docker compose logs -f frontend
docker compose logs -f medusa
docker compose logs -f storefront-v2

# Ver últimas 100 linhas de um serviço
docker compose logs --tail=100 api

# Health check da API
curl -s http://localhost:4000/health | python3 -m json.tool
```

---

## Rebuild de Serviços

```bash
cd /opt/bibelocrm

# Rebuild e restart de um serviço específico
docker compose up -d --build api
docker compose up -d --build frontend
docker compose up -d --build medusa
docker compose up -d --build storefront-v2

# Rebuild de TUDO (demora ~10 min)
docker compose up -d --build

# Restart sem rebuild (só reinicia o container)
docker compose restart api
docker compose restart frontend
```

> ⚠️ O Medusa demora ~90 segundos para ficar healthy após subir.

---

## Banco de Dados (PostgreSQL)

```bash
cd /opt/bibelocrm

# Acessar o psql
docker compose exec postgres psql -U bibelocrm bibelocrm

# Comandos úteis dentro do psql
\dt crm.*          -- tabelas do schema CRM
\dt marketing.*    -- tabelas de marketing/fluxos
\dt sync.*         -- tabelas de sync Bling/NuvemShop
\dt financeiro.*   -- tabelas financeiras
\q                 -- sair

# Rodar query direta sem entrar no psql
docker compose exec postgres psql -U bibelocrm bibelocrm -c "SELECT COUNT(*) FROM crm.customers;"

# Backup manual do banco
bash scripts/backup.sh
```

---

## Migrations de Banco

```bash
cd /opt/bibelocrm

# Rodar migrations pendentes
docker compose exec api node -e "require('./src/db/migrate').runMigrations()"

# Ver migrations já aplicadas
docker compose exec postgres psql -U bibelocrm bibelocrm -c \
  "SELECT filename, run_on FROM public.migrations ORDER BY run_on DESC LIMIT 10;"

# Verificar qual foi a última migration
ls db/migrations/ | tail -5
```

---

## Redis / Filas BullMQ

```bash
cd /opt/bibelocrm

# Acessar o Redis CLI
docker compose exec redis redis-cli

# Comandos úteis dentro do redis-cli
KEYS *                     -- listar todas as chaves
LLEN bull:bibelo-flows:wait -- jobs aguardando na fila
LLEN bull:bibelo-flows:active -- jobs ativos
FLUSHDB                    -- ⚠️ LIMPA TUDO (só em emergência)
exit
```

---

## Situações de Emergência

### API não responde

```bash
cd /opt/bibelocrm

# 1. Verificar status
docker compose ps api

# 2. Ver último erro
docker compose logs --tail=50 api

# 3. Restart
docker compose restart api

# 4. Se não subir, rebuild
docker compose up -d --build api
```

### Medusa não sobe (porta 9000)

```bash
cd /opt/bibelocrm

# Verificar logs (aguardar até 90s)
docker compose logs -f medusa

# Rebuild correto (NUNCA sem DOCKER_BUILDKIT=1)
DOCKER_BUILDKIT=1 docker compose build medusa
docker compose up -d medusa

# Aguardar health (verifica a cada 5s por 2 min)
for i in $(seq 1 24); do
  sleep 5
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/health)
  echo "$i: $STATUS"
  [ "$STATUS" = "200" ] && echo "Medusa OK!" && break
done
```

### Banco não responde

```bash
cd /opt/bibelocrm

# Ver logs do postgres
docker compose logs --tail=50 postgres

# Restart do postgres (NÃO perde dados — dados em volume Docker)
docker compose restart postgres

# Verificar volumes (onde os dados ficam)
docker volume ls | grep bibelo
```

### Container travado / sem resposta

```bash
cd /opt/bibelocrm

# Forçar parada e subida
docker compose stop NOME_SERVICO
docker compose up -d NOME_SERVICO

# Nuclear: derruba tudo e sobe tudo
docker compose down
docker compose up -d
```

> ⚠️ `docker compose down` NÃO apaga dados — volumes são preservados.
> ⚠️ `docker compose down -v` APAGA volumes — NUNCA usar em produção.

---

## Limpeza de Disco

```bash
# Ver uso de disco do Docker
docker system df

# Limpar build cache (SEGURO — não apaga imagens nem containers)
docker builder prune -f

# Ver tamanho das imagens
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

# Remover imagens não usadas (CUIDADO — confirmar antes)
docker image prune -f
```

> O build cache é limpo automaticamente toda segunda-feira às 4h30 via cron.

---

## Deploy via GitHub Actions

```bash
# O deploy roda automaticamente ao fazer push na branch main
git push origin main

# Acompanhar o deploy
# Acesse: https://github.com/carloseduardomcosta/bibelo_ecossistema/actions

# Se o deploy falhar, rodar manualmente:
cd /opt/bibelocrm
git pull origin main
docker compose up -d --build
```

---

## Variáveis de Ambiente

Ficam em `/opt/bibelocrm/.env` — **NUNCA commitar este arquivo**.

```bash
# Ver variáveis configuradas (sem os valores)
cat .env | cut -d'=' -f1

# Editar variáveis
nano .env

# Após editar .env, rebuildar os serviços afetados
docker compose up -d --build api
```

---

## Verificação Completa do Sistema

```bash
cd /opt/bibelocrm

# 1. Status dos containers
docker compose ps

# 2. Health check
curl -s http://localhost:4000/health

# 3. Disco
df -h /

# 4. Memória
free -h

# 5. Logs recentes de erro
docker compose logs --tail=20 api | grep -i error
docker compose logs --tail=20 medusa | grep -i error
```

---

## Contatos de Suporte

- **Dono:** Carlos Eduardo — carloseduardocostatj@gmail.com
- **Repositório:** https://github.com/carloseduardomcosta/bibelo_ecossistema
- **Monitoramento:** https://status.papelariabibelo.com.br

---

*Última atualização: Abril 2026*
