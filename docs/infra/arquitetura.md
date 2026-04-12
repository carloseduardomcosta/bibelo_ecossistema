# Arquitetura do Ecossistema Bibelô

> Visão técnica completa — atualizado em 12/04/2026

---

## Fluxo de deploy (CI/CD)

```mermaid
sequenceDiagram
    actor Carlos
    participant GitHub
    participant Actions as GitHub Actions
    participant VPS as VPS Hostinger
    participant Docker

    Carlos->>GitHub: git push origin main
    GitHub->>Actions: trigger deploy.yml

    Actions->>Actions: npm ci + tsc (API)
    Actions->>Actions: npm ci + vite build (Frontend)

    Actions->>VPS: rsync --delete (exclui .git, node_modules, .env)
    VPS->>VPS: npm install (deps de teste)
    VPS->>VPS: bash scripts/test.sh

    alt Testes falharam
        VPS-->>Actions: exit 1
        Actions-->>Carlos: ❌ Deploy abortado
    else Testes OK
        VPS->>Docker: docker compose up -d --build
        Docker-->>VPS: containers rodando
        VPS->>VPS: health check API (15 tentativas × 5s)
        VPS-->>Actions: ✅ OK
        Actions-->>Carlos: 🎀 Deploy OK
    end
```

---

## Rede Docker interna

```mermaid
graph LR
    subgraph bibelo_internal["Docker network: bibelo_internal"]
        API[bibelocrm-api\n:4000]
        FRONTEND[bibelocrm-frontend\n:3000]
        MEDUSA[bibelocrm-medusa\n:9000]
        STOREFRONT[bibelocrm-storefront-v2\n:8001]
        PG[(postgres:16\n:5432)]
        REDIS[(redis:7\n:6379)]
        UPTIME[uptime-kuma\n:3001]
    end

    subgraph Nginx["Nginx (host network)"]
        CRM_VHOST[crm.papelariabibelo.com.br]
        API_VHOST[api.papelariabibelo.com.br]
        WH_VHOST[webhook.papelariabibelo.com.br]
        STORE_VHOST[homolog.papelariabibelo.com.br]
        STATUS_VHOST[status.papelariabibelo.com.br]
        BOAS_VHOST[boasvindas.papelariabibelo.com.br]
    end

    CRM_VHOST -->|127.0.0.1:3000| FRONTEND
    API_VHOST -->|127.0.0.1:4000| API
    API_VHOST -->|/app/ 127.0.0.1:9000| MEDUSA
    WH_VHOST -->|127.0.0.1:4000| API
    STORE_VHOST -->|127.0.0.1:8001| STOREFRONT
    STATUS_VHOST -->|127.0.0.1:3001| UPTIME
    BOAS_VHOST -->|127.0.0.1:4000| API

    API <-->|pool pg| PG
    API <-->|BullMQ| REDIS
    MEDUSA <-->|pg| PG
    STOREFRONT -.->|SSR interno| MEDUSA
```

---

## Fluxo de sync Bling → Sistema

```mermaid
flowchart TD
    BLING[Bling ERP]

    subgraph Triggers["Triggers de sync"]
        WH[Webhook product.*\norder.*\n contact.*]
        CRON[BullMQ cron 30min\nsync incremental]
        MANUAL[POST /api/sync\nmanual]
    end

    subgraph API["BibelôCRM API"]
        PROC[processProduct\nprocessOrder\nprocessContact]
        SYNC_FUNC[syncProducts\nsyncOrders\nsyncStock]
        MEDUSA_SYNC[syncBlingToMedusa]
    end

    subgraph DB["PostgreSQL"]
        BP[sync.bling_products]
        BO[sync.bling_orders]
        BC[sync.bling_customers]
        BS[sync.bling_stock]
        CRM_C[crm.customers]
        CRM_I[crm.interactions]
    end

    MEDUSA[Medusa.js v2\nprodutos + variantes]

    BLING -->|HMAC sha256| WH
    WH --> PROC
    CRON --> SYNC_FUNC
    MANUAL --> SYNC_FUNC

    PROC --> BP
    PROC --> BO
    PROC --> BC
    SYNC_FUNC --> BP
    SYNC_FUNC --> BO
    SYNC_FUNC --> BS

    BP --> MEDUSA_SYNC
    MEDUSA_SYNC --> MEDUSA

    BO -->|trigger| CRM_C
    BO -->|trigger| CRM_I
```

---

## Fluxo de marketing (lead → email)

```mermaid
flowchart LR
    subgraph Capturas["Capturas de lead"]
        POPUP[Popup NuvemShop\nBIBELO10 10% OFF]
        LP[Landing Page\n/lp/novidades etc]
        VIP[Grupo VIP WhatsApp\nboasvindas.papelariabibelo.com.br]
        TRACKING[bibelo.js\ntracking comportamental]
    end

    subgraph Leads["marketing.leads"]
        LEAD_DB[(lead\nemail + nome + fonte)]
    end

    subgraph Verificacao["Verificação email"]
        HMAC_LINK[Link HMAC\nexpira 48h]
        CONFIRM[Confirmado\n→ cupom único]
    end

    subgraph Fluxos["Motor de fluxos — BullMQ"]
        TRIGGER[triggerFlow\nlead.captured]
        STEPS[Steps condicionais\n7 tipos de condição]
        DEDUP[Dedup 72h\ntemplates recentes]
        EMAIL_SEND[sendEmail\nSES primário\nResend fallback]
    end

    subgraph Templates["23 templates de email"]
        T1[Boas-vindas clube]
        T2[Nutrição lead]
        T3[Carrinho abandonado]
        T_ETC[...]
    end

    POPUP --> LEAD_DB
    LP --> LEAD_DB
    VIP --> LEAD_DB
    TRACKING --> LEAD_DB

    LEAD_DB --> HMAC_LINK
    HMAC_LINK -->|clicou| CONFIRM
    CONFIRM --> TRIGGER
    TRIGGER --> STEPS
    STEPS --> DEDUP
    DEDUP -->|não duplicado| EMAIL_SEND
    EMAIL_SEND --> T1
    EMAIL_SEND --> T2
    EMAIL_SEND --> T3
    EMAIL_SEND --> T_ETC
```

---

## Portal B2B Revendedoras

```mermaid
sequenceDiagram
    actor Carlos
    actor Revendedora

    Carlos->>CRM: POST /revendedoras/:id/gerar-token
    CRM-->>Carlos: { link: "/portal/abc123...", expira: +90 dias }
    Carlos->>Revendedora: envia o link por WhatsApp

    Revendedora->>Portal: GET /portal/abc123...
    Portal->>API: GET /api/portal/abc123... (validar token)
    API-->>Portal: { nome, nivel: "prata", percentual_desconto: 25 }
    Portal-->>Revendedora: catálogo com preço de revendedora

    Note over Portal,API: preco_final = preco_custo × markup × (1 - 0.25)
    Note over Portal,API: preco_custo e markup NUNCA são expostos
```

---

## Fluxo de compra (storefront)

```mermaid
flowchart TD
    CLIENT[Cliente na loja]

    subgraph Storefront["Next.js Storefront"]
        PROD[Página produto]
        CART[Carrinho]
        CHECKOUT[Checkout]
    end

    subgraph Medusa["Medusa.js v2"]
        CART_API[Cart API]
        ORDER_API[Order API]
        PAY[Payment sessions]
    end

    subgraph Pagamentos
        PIX[Mercado Pago Pix\nQR Code + copia-e-cola]
        CARD[Cartão de crédito\nMP.js tokenização]
        BOLETO[Boleto bancário]
    end

    subgraph Fulfillment
        ME_CALC[Melhor Envio\ncalcula PAC + SEDEX]
        ME_ET[Melhor Envio\ngera etiqueta]
    end

    subgraph CRM_Flow["CRM Flow"]
        SUB[subscriber order.placed]
        BLING_ORDER[Cria pedido Bling]
        EMAIL_CONF[Email confirmação\nvia SES/Resend]
    end

    CLIENT --> PROD --> CART --> CHECKOUT
    CHECKOUT --> CART_API --> ORDER_API
    ORDER_API --> PAY
    PAY --> PIX
    PAY --> CARD
    PAY --> BOLETO

    CHECKOUT -->|CEP| ME_CALC
    ORDER_API -->|order.placed| SUB
    SUB --> BLING_ORDER
    SUB --> EMAIL_CONF
    BLING_ORDER -->|after payment| ME_ET
```

---

## Segurança em camadas

```mermaid
graph TB
    INTERNET[Internet]

    subgraph Camada1["Camada 1 — Cloudflare"]
        WAF[WAF + DDoS\nCloudflare Proxy]
        ACCESS[Zero Trust\nGoogle login obrigatório\nCRM admin]
        DNS_ONLY[DNS-only\nwebhooks e storefront]
    end

    subgraph Camada2["Camada 2 — VPS"]
        UFW[UFW Firewall\nsomente 60222+80+443]
        F2B[Fail2ban\n1 tentativa = ban permanente]
        SSH[SSH porta 60222\nchave ed25519]
    end

    subgraph Camada3["Camada 3 — Nginx"]
        SSL[SSL/TLS Let's Encrypt]
        HEADERS[Headers de segurança\nHSTS, X-Frame, CSP]
        RL_NGINX[Rate limit\ntracking 20/min\nleads 10/min]
    end

    subgraph Camada4["Camada 4 — Aplicação"]
        JWT[JWT auth\ntodos os endpoints]
        ZOD[Zod validation\ntodos os inputs]
        SQL[SQL parametrizado\n$1, $2 sempre]
        RL_APP[Rate limit Express\nglobal 120/min]
        HMAC[HMAC webhooks\ntimingSafeEqual]
    end

    INTERNET --> Camada1 --> Camada2 --> Camada3 --> Camada4
```

---

## Backup e DR

```mermaid
flowchart LR
    subgraph Crons["Crons do host"]
        DAILY[Cron 3:30h diário\nbackup.sh]
        WEEKLY[Cron domingo 4h\ndr-backup.sh]
    end

    subgraph Conteudo["Conteúdo"]
        PG_DUMP[pg_dump CRM + Medusa\n.sql.gz]
        FULL[.env + nginx + SSL\ncerts + crontab\nRedis + UFW]
    end

    subgraph Drive["Google Drive"]
        FOLDER[BibeloCRM-Backups\nrclone OAuth2]
        RET30[Retenção 30 dias\nbackup diário]
        RET60[Retenção 60 dias\nsnapshot semanal]
    end

    DAILY --> PG_DUMP --> FOLDER --> RET30
    WEEKLY --> FULL --> FOLDER --> RET60

    FOLDER -->|DR: nova VPS| RESTORE[Recuperação\n~30 minutos]
```
