# Squid SSL Inspection + WPAD — Rede Bibelô

Guia completo para (re)configurar inspeção HTTPS com proxy automático via WPAD.
**Status: ✅ Validado e funcional em 20/04/2026**

---

## Visão Geral

```
PC (Windows)
  │  DHCP option 252 → descobre wpad.dat automaticamente
  │  PAC file → "use proxy 10.0.111.7:3130"
  └─► Squid (porta 3130, explícito) ──► Internet
        │  SSL Bump: decripta, inspeciona, re-encripta
        │  CA: Bibelo-CA (instalada no PC)
        └─► Log de acesso em /opt/dnsstack/squid/logs/access.log

iPhone (10.0.111.2)
  └─► iptables REDIRECT 80→3128, 443→3129 (transparente)
        └─► Squid (porta 3128/3129, intercept)
```

**Squid:** `/opt/dnsstack/` — `docker compose` — container `dnsstack_squid`
**Certificado CA:** `Bibelo-CA` — válido até 09/04/2036
**Fingerprint SHA1:** `D3:D0:00:8A:5F:7B:35:6E:9B:2D:0A:6B:9E:CF:1E:E0:05:80:69:52`

---

## Arquivos do Stack

| Arquivo | Função |
|---------|--------|
| `/opt/dnsstack/squid/squid.conf` | Configuração do Squid |
| `/opt/dnsstack/squid/ssl/ca.crt` | Certificado CA público |
| `/opt/dnsstack/squid/ssl/ca.key` | Chave privada da CA (nunca expor) |
| `/opt/dnsstack/wpad.dat` | PAC file servido para WPAD |
| `/opt/dnsstack/squid/logs/access.log` | Log de acesso |
| `/etc/nginx/sites-available/cert-download` | Nginx servindo CA + wpad.dat |
| `/opt/dnsstack/scripts/iptables-setup.sh` | Regras iptables para iPhone |

---

## Portas do Squid

| Porta | Tipo | Uso |
|-------|------|-----|
| `127.0.0.1:3127` | Explícito (localhost) | Interno Squid |
| `3128` intercept | Transparente HTTP | iPhone via iptables |
| `3129` intercept ssl-bump | Transparente HTTPS | iPhone via iptables |
| `10.0.111.7:3130` ssl-bump | **Explícito WPAD** | **PC via PAC file** |

---

## WPAD — Como Funciona

1. PC renova DHCP → recebe `option 252 = http://10.0.111.7/wpad.dat`
2. Windows baixa o PAC file automaticamente
3. PAC file instrui o sistema a usar `PROXY 10.0.111.7:3130` para todo tráfego externo
4. PC conecta ao Squid que inspeciona e re-encripta com a CA `Bibelo-CA`
5. Como a CA está instalada como raiz confiável, nenhum aviso de certificado aparece

**Fallback:** PAC file tem `; DIRECT` — se o VPS cair, tráfego vai direto (sem blackout de internet).

---

## Configurar do Zero

### 1. Certificados (já existem — só se recriar o stack)

```bash
cd /opt/dnsstack/squid/ssl

openssl req -new -newkey rsa:4096 -days 3650 -nodes -x509 \
  -subj "/C=BR/ST=SC/L=Timbo/O=Bibelo Home/OU=Network Security/CN=Bibelo-CA" \
  -keyout ca.key -out ca.crt
```

### 2. Subir o stack

```bash
cd /opt/dnsstack
docker compose up -d
```

Squid demora ~10s para inicializar o banco de certificados (`ssl_db`).

### 3. UFW — portas necessárias

```bash
# DNS para AdGuard
ufw allow from 10.0.111.0/28 to any port 53 proto udp comment "AdGuard DNS UDP - WireGuard"
ufw allow from 10.0.111.0/28 to any port 53 proto tcp comment "AdGuard DNS TCP - WireGuard"

# AdGuard admin
ufw allow from 10.0.111.0/28 to any port 3001 comment "AdGuard Home - WireGuard only"

# Squid WPAD proxy explícito
ufw allow from 10.0.111.0/28 to any port 3130 proto tcp comment "Squid WPAD proxy explícito - WireGuard"
```

### 4. nginx — servir CA + wpad.dat

Site em `/etc/nginx/sites-available/cert-download`:
- `http://10.0.111.7/bibelo-ca.crt` — certificado para instalar nos devices
- `http://10.0.111.7/bibelo-ca.pem` — mesmo cert, extensão .pem (iPhone)
- `http://10.0.111.7/wpad.dat` — PAC file para WPAD

```bash
ln -sf /etc/nginx/sites-available/cert-download /etc/nginx/sites-enabled/cert-download
nginx -s reload
```

### 5. MikroTik — DHCP option 252

```routeros
# Criar opção WPAD
/ip dhcp-server option
add name=wpad code=252 value="'http://10.0.111.7/wpad.dat'"

# Aplicar na rede do PC (ether5 — 10.0.100.0/24)
/ip dhcp-server network
set [find where address="10.0.100.0/24"] dhcp-option=wpad
```

### 6. iptables para iPhone (modo transparente)

```bash
bash /opt/dnsstack/scripts/iptables-setup.sh
```

Regras aplicadas em runtime. Não persistem após reboot — adicionar ao cron ou rc.local se necessário.

---

## Instalar o Certificado CA nos Devices

### Download

```
http://10.0.111.7/bibelo-ca.crt   ← Windows / Android
http://10.0.111.7/bibelo-ca.pem   ← iPhone (usar Safari)
```

### Windows

1. Baixar `bibelo-ca.crt` via navegador
2. Duplo clique → "Instalar Certificado"
3. Selecionar **"Computador Local"** (requer admin)
4. "Colocar no repositório a seguir" → **"Autoridades de Certificação Raiz Confiáveis"**
5. Concluir

**Verificar:** `Win + R → certlm.msc → Autoridades de Certificação Raiz Confiáveis → Certificados → Bibelo-CA`

### iPhone

1. Abrir **Safari** (obrigatório) → `http://10.0.111.7/bibelo-ca.pem`
2. "Perfil Baixado" → OK
3. **Ajustes → Perfil Baixado → Instalar**
4. **Ajustes → Geral → Sobre → Configurações de Confiança do Certificado → Ativar Bibelo-CA**

Passo 4 é obrigatório — sem ele o cert é instalado mas não confiado.

### WSL (Ubuntu no Windows)

```bash
curl -s http://10.0.111.7/bibelo-ca.crt | sudo tee /usr/local/share/ca-certificates/bibelo-ca.crt > /dev/null
sudo update-ca-certificates
```

---

## Ativar WPAD no PC

Após `ipconfig /renew`, verificar:
`Configurações → Rede e Internet → Proxy → "Detectar configurações automaticamente" = Ativado`

Esta opção deve estar **ativa por padrão** no Windows 10/11.

---

## Monitoramento

```bash
# Log em tempo real
tail -f /opt/dnsstack/squid/logs/access.log

# Requests por IP
awk '{print $3}' /opt/dnsstack/squid/logs/access.log | sort | uniq -c | sort -rn

# Top domínios interceptados
grep -oP 'CONNECT \K[^:]+' /opt/dnsstack/squid/logs/access.log | sort | uniq -c | sort -rn | head -20

# Requests bloqueados
grep "DENIED" /opt/dnsstack/squid/logs/access.log | tail -20

# Status do container
docker compose -f /opt/dnsstack/docker-compose.yml ps
```

---

## Solução de Problemas

| Sintoma | Causa | Solução |
|---------|-------|---------|
| Log vazio após `ipconfig /renew` | WPAD não ativo no Windows | Verificar "Detectar configurações automaticamente" |
| Aviso de certificado no browser | CA não instalada ou não confiada | Reinstalar seguindo os passos acima |
| `mtalk.google.com:5228` bloqueado | Porta 5228 fora do `SSL_ports` ACL | Adicionar `5228` ao ACL `SSL_ports` no squid.conf |
| Squid não sobe | ssl_db corrompido | `docker exec dnsstack_squid rm -rf /var/lib/squid/ssl_db && docker compose restart squid` |
| 503 em alguns sites | SSL bump incompatível (certificate pinning) | Adicionar exceção: `ssl_bump splice domínio.com` |
| iptables não persiste após reboot | Regras são runtime | Adicionar `bash /opt/dnsstack/scripts/iptables-setup.sh` ao cron `@reboot` |

---

## Sites com Certificate Pinning (não inspecionados)

Alguns apps/sites usam certificate pinning e rejeitam CAs customizadas. Nesses casos o Squid deve fazer `splice` (tunelar sem inspecionar) em vez de `bump`.

Para adicionar exceção no `squid.conf`:
```
acl no_bump_domains dstdomain .apple.com .icloud.com .whatsapp.com
ssl_bump splice no_bump_domains
ssl_bump peek step1
ssl_bump bump all
```

---

## Referências do Ambiente

| Item | Valor |
|------|-------|
| CA | Bibelo-CA — válido até 09/04/2036 |
| Squid proxy explícito | `10.0.111.7:3130` |
| PAC file | `http://10.0.111.7/wpad.dat` |
| CA download | `http://10.0.111.7/bibelo-ca.crt` |
| DHCP option | 252 aplicado em `10.0.100.0/24` (ether5) |
| iPhone (transparente) | `10.0.111.2` → iptables → portas 3128/3129 |

---

*Última atualização: 20 de Abril de 2026 — WPAD + SSL Inspection validados e funcionais*
