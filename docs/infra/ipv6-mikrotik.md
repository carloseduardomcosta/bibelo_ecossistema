# IPv6 — Configuração MikroTik + Unifique + AdGuard

Guia completo para (re)configurar IPv6 nativo no ambiente Bibelô.
Válido mesmo sem acesso ao Claude Code.
**Status: ✅ Validado e funcional em 20/04/2026**

---

## Visão Geral da Arquitetura

```
Internet (IPv6)
      │
   PPPoE (pppoe-out1)
      │  prefixo /56: 2804:30c:968:8c00::/56
   MikroTik RB750Gr3 (RouterOS 7.19.1)
      │  distribui /64 por interface via SLAAC (Router Advertisement)
      ├── ether2 → 2804:30c:968:8c00::/64  (LAN principal — SW Sala)
      ├── ether5 → 2804:30c:968:8c03::/64  (PC Bibelô)
      ├── VLAN 10 → 2804:30c:968:8c01::/64 (WiFi)
      └── VLAN 11 → 2804:30c:968:8c02::/64 (IoT)
```

**ISP:** Unifique (SC) — fornece IPv6 nativo via DHCPv6-PD
**Prefixo recebido:** `2804:30c:968:8c00::/56` (256 sub-redes /64 disponíveis)
**DNS:** AdGuard em `10.0.111.7` via WireGuard (IPv4) — resolve A e AAAA sem precisar de DNS IPv6 separado

---

## Pré-requisitos

- WireGuard ativo entre MikroTik e VPS (peer `VPS-BIBELO`)
- AdGuard rodando no VPS em `10.0.111.7:53`
- UFW porta 53 liberada para `10.0.111.0/28` no VPS
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

Se `STATUS = searching` por mais de 30s — a Unifique não está provendo IPv6 naquele momento.

> `use-peer-dns=no` impede que os DNS IPv6 da Unifique substituam o AdGuard.

---

## Passo 2 — Bloquear DNS dinâmico do ISP

O PPPoE e o DHCPv6-PD injetam DNS da Unifique automaticamente como `dynamic-servers`.
Isso faz o MikroTik responder com o DNS mais rápido (ISP vence o AdGuard) — bypassando o filtro.

```routeros
/ip firewall nat
# Desabilitar use-peer-dns no cliente PPPoE
/interface pppoe-client set [find] use-peer-dns=no

# Desabilitar no DHCPv6 também
/ipv6 dhcp-client set [find interface=pppoe-out1] use-peer-dns=no

# Limpar cache
/ip dns flush-cache
```

**Verificar** — `dynamic-servers` deve estar vazio:
```routeros
/ip dns print
# servers: 10.0.111.7       ← correto
# dynamic-servers: (vazio)  ← correto
```

---

## Passo 3 — Firewall IPv6 (OBRIGATÓRIO antes de distribuir)

IPv6 não tem NAT. Sem firewall, cada device da rede fica com IP público roteável diretamente na internet.

```routeros
/ipv6 firewall filter

add chain=input   action=accept connection-state=established,related,untracked comment="IPv6: input established"
add chain=forward action=accept connection-state=established,related,untracked comment="IPv6: forward established"
add chain=input   action=accept protocol=icmpv6 comment="IPv6: ICMPv6 input"
add chain=forward action=accept protocol=icmpv6 comment="IPv6: ICMPv6 forward"
add chain=forward action=accept in-interface-list=LAN out-interface=pppoe-out1 comment="IPv6: LAN -> internet"
add chain=forward action=drop in-interface=pppoe-out1 comment="IPv6: bloquear internet -> LAN"
add chain=input   action=drop connection-state=invalid comment="IPv6: drop invalid input"
add chain=forward action=drop connection-state=invalid comment="IPv6: drop invalid forward"
add chain=input   action=drop in-interface=pppoe-out1 comment="IPv6: drop internet -> router"
```

---

## Passo 4 — Distribuir IPv6 nas interfaces LAN

### Interfaces do ambiente Bibelô

O ambiente não usa bridge para LAN — cada rede tem sua interface direta.

> **Atenção:** os nomes de interfaces contêm caracteres especiais (acentos). Usar `[find where name~"texto"]` para evitar erros de encoding no terminal.

```routeros
/ipv6 address

# LAN principal (SW Sala — ether2)
add address=::1/64 from-pool=ipv6-pool \
  interface=[/interface find where name~"ether2"] \
  advertise=yes comment="IPv6: LAN principal"

# PC Bibelô (ether5)
add address=::1/64 from-pool=ipv6-pool \
  interface=[/interface find where name~"ether5"] \
  advertise=yes comment="IPv6: PC Bibelo"

# WiFi (VLAN 10)
add address=::1/64 from-pool=ipv6-pool \
  interface=[/interface find where name~"VLAN 10"] \
  advertise=yes comment="IPv6: WiFi"

# IoT (VLAN 11)
add address=::1/64 from-pool=ipv6-pool \
  interface=[/interface find where name~"VLAN 11"] \
  advertise=yes comment="IPv6: IoT"
```

### Resultado esperado após aplicar

```
 #   ADDRESS                  FROM-POOL  INTERFACE        ADVERTISE
 0 G 2804:30c:968:8c00::1/64  ipv6-pool  ether2 - SW...   yes
 1 G 2804:30c:968:8c01::1/64  ipv6-pool  VLAN 10 - WLAN   yes
 2 G 2804:30c:968:8c02::1/64  ipv6-pool  VLAN 11 - IoT    yes
 3 G 2804:30c:968:8c03::1/64  ipv6-pool  ether5 - PC...   yes
```

Se aparecerem entradas com flag `I` (INVALID) de pool antigo, remover:
```routeros
/ipv6 address remove [find where from-pool="Pool_PD_v6"]
```

---

## Passo 5 — Rota padrão IPv6

O `add-default-route=yes` no DHCPv6-PD cria automaticamente. Verificar:

```routeros
/ipv6 route print where dst-address=::/0
```

Deve aparecer `DAv+ ::/0  pppoe-out1` como ativo. Se não existir:
```routeros
/ipv6 route add dst-address=::/0 gateway=pppoe-out1
```

---

## Passo 6 — DNS

Nenhuma configuração adicional necessária. O MikroTik usa `10.0.111.7` (IPv4) para resolver tanto registros A quanto AAAA. Devices recebem IPv4 DNS via DHCP e fazem resolução dual-stack normalmente.

### Sobre RDNSS (DNS via RA) — opcional, não recomendado

RDNSS anuncia um servidor DNS IPv6 junto com o Router Advertisement. **Não vale a pena ativar** neste ambiente porque:
- A rede tem IPv4 + IPv6 (dual-stack) — IPv4 DNS já funciona para tudo
- RDNSS com endereço global muda a cada reconexão PPPoE
- Adiciona complexidade sem benefício prático

---

## Verificação Final

```routeros
# 1. Prefixo recebido do ISP
/ipv6 dhcp-client print

# 2. Endereços nas interfaces (só ipv6-pool, sem entradas INVALID)
/ipv6 address print where from-pool="ipv6-pool"

# 3. Rota padrão ativa
/ipv6 route print where dst-address=::/0

# 4. Firewall ativo
/ipv6 firewall filter print count-only

# 5. DNS sem dynamic-servers
/ip dns print

# 6. Conectividade IPv6 do MikroTik
/ping 2001:4860:4860::8888 count=3
```

**No PC (Windows) — validação:**
```cmd
ipconfig /all
REM Deve aparecer: Endereço IPv6 . . . : 2804:30c:968:8c03:xxxx...

ping -6 google.com
REM Deve responder com endereço 2804:...
```

**No PC (Linux/WSL):**
```bash
ip -6 addr show eth0
curl -6 https://ifconfig.me   # retorna endereço IPv6 global
```

---

## Solução de Problemas

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| `STATUS = searching` no dhcp-client | Unifique não fornece IPv6 no link | Aguardar ou verificar com suporte |
| Devices sem endereço IPv6 | RA não configurado | Verificar `advertise=yes` nas interfaces |
| `dynamic-servers` com IPv6 do ISP | `use-peer-dns` não aplicado | Passo 2 — aplicar nos dois clientes |
| AdGuard sem queries do MikroTik | UFW bloqueando porta 53 | `ufw allow from 10.0.111.0/28 to any port 53` |
| MikroTik usa DNS do ISP mesmo com `servers=10.0.111.7` | Cache cheio + dynamic-servers mais rápido | `ip dns flush-cache` + Passo 2 |
| Entradas INVALID no `ipv6 address print` | Pool antigo (`Pool_PD_v6`) | `remove [find where from-pool="Pool_PD_v6"]` |
| Interface com nome especial não aceita no comando | Encoding terminal | Usar `[/interface find where name~"parte-do-nome"]` |
| Acesso externo às portas internas | Firewall IPv6 não aplicado | Refazer Passo 3 |
| VLAN rotas com flag `DIc` (inativas) | Interface física sem link | Esperado — ativa quando o AP/switch conectar |

---

## Mapa de Sub-redes IPv6 — Ambiente Bibelô

| Sub-rede | Interface | Rede IPv4 equivalente | Uso |
|----------|-----------|----------------------|-----|
| `2804:30c:968:8c00::/64` | ether2 | 10.0.0.0/24 | LAN principal (SW Sala) |
| `2804:30c:968:8c01::/64` | VLAN 10 | 10.0.10.0/24 | WiFi |
| `2804:30c:968:8c02::/64` | VLAN 11 | 10.11.11.0/24 | IoT |
| `2804:30c:968:8c03::/64` | ether5 | 10.0.100.0/24 | PC Bibelô |
| `2804:30c:968:8c04::/64` — `8cff::/64` | disponíveis | — | Expansão futura |

---

## Referências do Ambiente

| Item | Valor |
|------|-------|
| ISP | Unifique (SC) |
| Prefixo delegado | `2804:30c:968:8c00::/56` |
| Interface PPPoE | `pppoe-out1` |
| Pool IPv6 | `ipv6-pool` |
| DNS upstream | `10.0.111.7` (AdGuard via WireGuard IPv4) |
| MikroTik | RB750Gr3 — RouterOS 7.19.1 |
| VPS WireGuard IP | `10.0.111.7/28` |
| MikroTik WireGuard IP | `10.0.111.1/28` |
| AdGuard admin | `http://10.0.111.7:3001` (somente via WireGuard) |

---

*Última atualização: 20 de Abril de 2026 — IPv6 validado e funcional*
