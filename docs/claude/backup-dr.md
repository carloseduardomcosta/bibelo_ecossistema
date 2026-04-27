# Backup e Disaster Recovery

## Backup diário — Google Drive
- **Script:** `scripts/backup.sh` — dump PostgreSQL + upload via rclone OAuth2
- **Cron:** `30 3 * * *` (diário 3:30 AM)
- **Destino:** Google Drive pessoal (pasta `BibeloCRM-Backups`)
- **Retenção:** 7 dias local, 30 dias no Drive
- **Config:** `~/.config/rclone/rclone.conf` (OAuth2 pessoal, client Desktop app)

## DR semanal — Google Drive
- **Script:** `scripts/dr-backup.sh` — snapshot completo do sistema
- **Cron:** `0 4 * * 0` (domingos 4:00 AM)
- **Conteúdo:** .env, secrets, nginx, SSL certs, crontab, PostgreSQL (CRM + Medusa), Redis, uploads (imagens dos usuários), sessão WAHA (WhatsApp), histórico Uptime Kuma, UFW, inventário
- **Retenção:** 60 dias no Drive, 2 últimos locais
- **Tamanho:** ~51 MB comprimido (atualizado 27/04/2026 — antes ~3 MB sem uploads/WAHA/Uptime)
- **Recuperação:** VPS nova em ~30 min
- **Atenção:** arquivo não criptografado — contém .env com todos os secrets. Plano: criptografia GPG futura.

## CI/CD
- **GitHub Actions:** `deploy.yml` — build CI → rsync → testes na VPS → deploy containers → health check
- **Testes rodam ANTES do deploy** — se falharem, deploy é abortado (containers mantêm versão anterior)
