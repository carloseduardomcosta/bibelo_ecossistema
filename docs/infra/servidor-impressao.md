# Servidor de Impressão — CUPS via WireGuard

## Visão geral

Servidor CUPS em container Docker no VPS, acessível via rede WireGuard.
Permite imprimir de qualquer dispositivo (PC, celular, tablet) conectado ao WireGuard — sem driver, sem Bluetooth, sem estar na mesma rede WiFi.

## Infraestrutura

```
Dispositivo (WireGuard) → 10.0.111.7:631 (CUPS/VPS) → wg0 tunnel → Impressora 10.0.0.110 (LAN casa)
```

| Componente | Detalhe |
|---|---|
| Container | `bibelo_cups` — `/opt/printserver/` |
| IP WireGuard VPS | `10.0.111.7` (interface `wg0`) |
| Porta CUPS | `631/tcp` — liberada só na interface `wg0` (UFW) |
| Impressora | Epson L4260 Series — `10.0.0.110` (LAN doméstica) |
| Protocolo | IPP Everywhere (driverless) — sem driver nos clientes |
| Driver | `cups-filters 1.28.17` + PPD gerado via `driverless` |

## Arquivos

```
/opt/printserver/
├── docker-compose.yml   ← serviço cups
├── Dockerfile           ← debian:bookworm-slim + cups + cups-filters
└── entrypoint.sh        ← configura cupsd.conf + adiciona impressora via driverless
```

## WireGuard — rota LAN doméstica

O VPS precisa rotear `10.0.0.0/24` pelo peer MikroTik para chegar na impressora.
Configuração em `/etc/wireguard/wg0.conf`:

```ini
[Peer]
PublicKey           = Hi/KZbEwAoRe/OW6CW+sCvb+V0jmw+61NfTJoCDQOCE=
AllowedIPs          = 10.0.111.0/28, 10.0.0.0/24
PersistentKeepalive = 25
```

Rota de kernel adicionada na inicialização:
```bash
ip route add 10.0.0.0/24 dev wg0
```

> **Atenção**: se o VPS reiniciar, a rota precisa ser re-adicionada. Adicionar ao `/etc/rc.local` ou systemd se necessário.

## Comandos úteis

```bash
# Status do container
docker compose -f /opt/printserver/docker-compose.yml ps

# Logs em tempo real
docker logs bibelo_cups -f

# Status da impressora
docker exec bibelo_cups lpstat -p -v

# Enviar job de teste
docker exec bibelo_cups lp -d EpsonL4260 /usr/share/cups/data/testprint

# Cancelar todos os jobs
docker exec bibelo_cups cancel -a

# Reiniciar CUPS
docker compose -f /opt/printserver/docker-compose.yml restart
```

## Adicionar nos dispositivos

| Dispositivo | Método |
|---|---|
| **Windows** | Configurações → Impressoras → Adicionar → "Não está na lista" → "Selecionar pelo nome" → `http://10.0.111.7:631/printers/EpsonL4260` |
| **Mac** | Preferências → Impressoras → `+` → IP → protocolo IPP → `10.0.111.7` |
| **Android** | Configurações → Impressão → Adicionar serviço → `ipp://10.0.111.7:631/printers/EpsonL4260` |
| **iPhone/iPad** | AirPrint detecta automaticamente (precisa estar no WireGuard) |
| **Linux** | `lpadmin -p Epson -v ipp://10.0.111.7:631/printers/EpsonL4260 -E` |

## Interface web admin

URL: `http://10.0.111.7:631`
Login: `bibelo` / senha configurada em `CUPS_PASS` no `docker-compose.yml`

## UFW — regra ativa

```
631/tcp on wg0    ALLOW    Anywhere    # CUPS - WireGuard only
```

A porta 631 **não está exposta na internet** — apenas na interface `wg0`.
