# IPv6 — Configuração MikroTik + Unifique + AdGuard

Guia completo para (re)configurar IPv6 nativo no ambiente Bibelô.
Válido mesmo sem acesso ao Claude Code.

---

## Visão Geral da Arquitetura

```
Internet (IPv6)
      │
   PPPoE (pppoe-out1)
      │  prefixo /56: 2804:30c:968:8c00::/56
   MikroTik RB750Gr3 (RouterOS 7.19.1)
      │  distribui /64 para cada VLAN via SLAAC
   Rede LAN (VLANs)
      │
   Devices (PC, iPhone, etc.) — IPv6 automático via RA
```

**ISP:** Unifique — fornece IPv6 nativo via DHCPv6-PD  
**Prefixo recebido:** `2804:30c:968:8c00::/56` (256 sub-redes /64 disponíveis)  
**DNS IPv6:** não usar DNS do ISP — usar AdGuard via WireGuard (IPv4 `10.0.111.7`)

---

## Pré-requisitos

- WireGuard ativo entre MikroTik e VPS (peer `VPS-BIBELO`)
- AdGuard rodando no VPS em `10.0.111.7:53`
- Interface PPPoE chamada `pppoe-out1`

---

## Passo 1 — DHCPv6-PD Client (solicitar prefixo ao ISP)

```routeros
/ipv6 dhcp-client add \
  interface=pppoe-out1 \
  request=prefix \
  pool-name=ipv6-pool \
  pool-prefix-length=64 \
  add-default-route=yes \
  use-peer-dns=no
```

**Verificar:**
```routeros
/ipv6 dhcp-client print
```

Resultado esperado:
```
# INTERFACE   STATUS  REQUEST  PREFIX
0 pppoe-out1  bound   prefix   2804:30c:968:8c00::/56, 6d23h...
```

Se `STATUS = searching` por mais de 30s — a Unifique não está provendo IPv6 naquele momento. Aguardar ou contatar suporte.

> **IMPORTANTE:** `use-peer-dns=no` impede que os DNS IPv6 da Unifique substituam o AdGuard.

---

## Passo 2 — Bloquear DNS dinâmico do ISP

Após configurar o DHCPv6-PD, verificar se o ISP injetou DNS dinâmicos:

```routeros
/ip dns print
```

O campo `dynamic-servers` deve ficar vazio. Se aparecer endereços IPv6 da Unifique (ex: `2804:30c:...`), o bloqueio funcionou via `use-peer-dns=no`.

Se ainda aparecer, forçar:
```routeros
/ipv6 dhcp-client set [find interface=pppoe-out1] use-peer-dns=no
/ip dns flush-cache
```

---

## Passo 3 — Firewall IPv6 (OBRIGATÓRIO antes de distribuir)

IPv6 não tem NAT. Sem firewall, cada device da rede fica com IP público roteável diretamente na internet.

```routeros
/ipv6 firewall filter

# Permitir estabelecidas e relacionadas
add chain=input   action=accept connection-state=established,related,untracked comment="IPv6: input established"
add chain=forward action=accept connection-state=established,related,untracked comment="IPv6: forward established"

# ICMPv6 obrigatório (NDP, Router Advertisement, Neighbor Discovery)
add chain=input   action=accept protocol=icmpv6 comment="IPv6: ICMPv6 input"
add chain=forward action=accept protocol=icmpv6 comment="IPv6: ICMPv6 forward"

# LAN pode sair para internet
add chain=forward action=accept in-interface-list=LAN out-interface=pppoe-out1 comment="IPv6: LAN -> internet"

# Bloquear internet entrando direto nas VLANs
add chain=forward action=drop in-interface=pppoe-out1 comment="IPv6: bloquear internet -> LAN"

# Bloquear conexões inválidas
add chain=input   action=drop connection-state=invalid comment="IPv6: drop invalid input"
add chain=forward action=drop connection-state=invalid comment="IPv6: drop invalid forward"

# Bloquear acesso externo ao router
add chain=input action=drop in-interface=pppoe-out1 comment="IPv6: drop internet -> router"
```

**Verificar:**
```routeros
/ipv6 firewall filter print
```

---

## Passo 4 — Distribuir IPv6 nas interfaces LAN

Atribuir uma sub-rede `/64` de cada interface/VLAN. O `advertise=yes` ativa o Router Advertisement (SLAAC) — devices configuram IPv6 automaticamente.

```routeros
/ipv6 address
add address=::1/64 from-pool=ipv6-pool interface=bridge    advertise=yes comment="IPv6: LAN principal"
add address=::1/64 from-pool=ipv6-pool interface=vlan10    advertise=yes comment="IPv6: VLAN 10"
add address=::1/64 from-pool=ipv6-pool interface=vlan100   advertise=yes comment="IPv6: VLAN 100"
```

> Substituir `bridge`, `vlan10`, `vlan100` pelos nomes reais das suas interfaces.

**Verificar:**
```routeros
/ipv6 address print
```

Cada interface deve mostrar um endereço `2804:30c:968:8cXX::1/64` com `ADVERTISE`.

---

## Passo 5 — Rota padrão IPv6

O DHCPv6-PD com `add-default-route=yes` deve criar automaticamente. Verificar:

```routeros
/ipv6 route print
```

Deve existir: `dst-address=::/0 gateway=pppoe-out1`

Se não existir, criar manualmente:
```routeros
/ipv6 route add dst-address=::/0 gateway=pppoe-out1
```

---

## Passo 6 — DNS IPv6 no MikroTik

O AdGuard (VPS) só tem interface WireGuard IPv4 (`10.0.111.7`). O MikroTik resolve tanto A quanto AAAA pelo mesmo caminho IPv4. Nenhuma configuração adicional necessária no DNS.

Para confirmar que o DNS está correto:
```routeros
/ip dns print
# servers: 10.0.111.7  ← correto
# dynamic-servers: (vazio)  ← correto
```

---

## Verificação Final

```routeros
# 1. Prefixo recebido do ISP
/ipv6 dhcp-client print

# 2. Endereços nas interfaces
/ipv6 address print

# 3. Rota padrão
/ipv6 route print where dst-address=::/0

# 4. Firewall ativo
/ipv6 firewall filter print count-only

# 5. Testar conectividade IPv6 a partir do MikroTik
/ping 2001:4860:4860::8888 count=3
```

**No PC (Windows):**
```
ipconfig /all
# Deve aparecer endereço 2804:30c:968:8cXX:... em "Servidores DNS"
ping -6 google.com
```

**No PC (Linux/WSL):**
```bash
ip -6 addr
curl -6 https://ifconfig.me
# Deve retornar um endereço IPv6
```

---

## Solução de Problemas

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| `STATUS = searching` no dhcp-client | Unifique não fornece IPv6 no link | Verificar com suporte Unifique |
| Devices sem endereço IPv6 | RA não configurado | Verificar `advertise=yes` nas interfaces |
| IPv6 funciona mas DNS falha | DNS ISP injetado | `/ipv6 dhcp-client set use-peer-dns=no` |
| Acesso externo às portas internas | Firewall IPv6 não aplicado | Refazer Passo 3 |
| Prefixo muda após reconexão PPPoE | ISP não é prefix-stable | Normal em alguns planos — SLAAC se adapta |
| `dynamic-servers` com IPv6 do ISP | DHCPv6 ignorou use-peer-dns | Refazer com `use-peer-dns=no` explícito |

---

## Referências do Ambiente

| Item | Valor |
|------|-------|
| ISP | Unifique (SC) |
| Prefixo atual | `2804:30c:968:8c00::/56` |
| Interface PPPoE | `pppoe-out1` |
| Pool IPv6 | `ipv6-pool` |
| DNS upstream | `10.0.111.7` (AdGuard via WireGuard) |
| MikroTik model | RB750Gr3 — RouterOS 7.19.1 |
| VPS WireGuard IP | `10.0.111.7/28` |
| MikroTik WireGuard IP | `10.0.111.1/28` |

---

## DNS Stack completo — AdGuard

Documentação do stack de DNS/filtragem: ver `docs/infra/adguard-stack.md`

Resumo:
- AdGuard Home: `10.0.111.7:53` (DNS) + `10.0.111.7:3001` (admin)
- Filtros ativos: AdGuard DNS, HaGeZi Multi PRO, HaGeZi NSFW, StevenBlack, Phishing URL
- Acesso admin: somente via WireGuard (`10.0.111.0/28`)
- UFW porta 53: liberada para `10.0.111.0/28`

---

*Última atualização: 20 de Abril de 2026*
