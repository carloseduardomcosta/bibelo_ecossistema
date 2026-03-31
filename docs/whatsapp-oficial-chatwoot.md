# WhatsApp Oficial + Chatwoot — Plano de Implementação

## Arquitetura

```
Cliente (WhatsApp / Instagram DM / Chat no site)
        ↕
    Meta Cloud API (WhatsApp/Insta) + Widget JS (site)
        ↕
    Chatwoot (self-hosted, Docker)
        ↕ webhooks bidirecional
    BibelôCRM (flow engine)
        → dispara templates aprovados via Chatwoot API
        ← recebe eventos (msg recebida, lida, respondida)
```

## Por que Chatwoot + Meta Cloud API

- **100% oficial** — sem risco de ban (API certificada pela Meta)
- **Open-source** — roda self-hosted no mesmo VPS, custo zero
- **Multi-canal nativo** — WhatsApp + Instagram DM + Facebook Messenger no mesmo painel
- **Painel de atendimento** — agentes, filas, macros, labels, SLA
- **API completa** — BibelôCRM envia templates proativos via REST
- **Webhooks** — Chatwoot notifica o CRM de cada evento (msg criada, conversa resolvida)

## Custos Meta Cloud API (Brasil, 2026)

| Categoria | Preço/msg (USD) | Preço/msg (BRL aprox) | Exemplo |
|-----------|----------------|----------------------|---------|
| Marketing | $0.0625 | ~R$ 0,35 | Cupom, promoção, reativação |
| Utility | $0.0068 | ~R$ 0,038 | Confirmação pedido, rastreio |
| Authentication | $0.0068 | ~R$ 0,038 | Código de verificação |
| Service | Grátis | R$ 0,00 | Resposta dentro de 24h |

**Estimativa mensal Bibelô:**
- ~200 carrinhos abandonados × R$ 0,35 = R$ 70
- ~100 cupons/reativação × R$ 0,35 = R$ 35
- ~500 confirmações (utility grátis na janela 24h) = R$ 0
- **Total: ~R$ 105/mês**

## Pré-requisitos Meta

1. **Meta Business Manager** em business.facebook.com
2. **Verificação do negócio** — CNPJ 63.961.764/0001-63 + comprovante endereço (2-5 dias úteis)
3. **Facebook App** tipo "Business" em developers.facebook.com
4. **Produto WhatsApp** adicionado ao app
5. **Número dedicado NOVO** — comprar chip novo só para a API/Chatwoot
   - Decisão: manter o (47) 9 3386-2514 no WhatsApp Business App (grupo VIP 115 membros, catálogo, atendimento pessoal)
   - Meta não permite mesmo número no app + API simultaneamente
   - Número atual fica no celular, número novo fica no Chatwoot
6. **Display name** = "Papelaria Bibelô" (precisa refletir o negócio real)
7. **Two-Factor Authentication** no Facebook — obrigatório

### Tiers de envio
| Tier | Limite diário |
|------|--------------|
| Inicial (sem verificação) | 250 contatos únicos |
| Após verificação (Q2 2026) | 100K contatos únicos |
| Unlimited | Sem limite |

Avaliação de upgrade: a cada 6 horas. Começa em 250, sobe conforme qualidade.

## Templates WhatsApp (precisam aprovação Meta)

### Templates iniciais a criar:

1. **carrinho_abandonado** (marketing)
   ```
   Oi {{1}}! 🛒 Seus itens estão esperando na Papelaria Bibelô!
   Finalize sua compra: {{2}}
   ```

2. **ultima_chance_carrinho** (marketing)
   ```
   ⏰ {{1}}, última chance! Seus produtos podem esgotar.
   Garanta agora: {{2}}
   ```

3. **cupom_lembrete** (marketing)
   ```
   {{1}}, seu cupom {{2}} de 10% OFF expira em breve! 🎀
   Use agora: {{3}}
   ```

4. **pos_compra_agradecimento** (utility)
   ```
   Obrigada pela compra, {{1}}! 💕
   Pedido #{{2}} confirmado. Valor: R$ {{3}}
   Acompanhe pelo site: {{4}}
   ```

5. **rastreio_envio** (utility)
   ```
   {{1}}, seu pedido foi enviado! 📦
   Rastreio: {{2}}
   Prazo: {{3}} dias úteis
   ```

6. **avaliacao_pos_entrega** (marketing)
   ```
   {{1}}, recebeu seu pedido? 🎀
   Conte como foi sua experiência: {{2}}
   Sua opinião é muito importante pra gente!
   ```

7. **reativacao_cliente** (marketing)
   ```
   {{1}}, sentimos sua falta! 💝
   Temos novidades esperando por você na Papelaria Bibelô.
   Dá uma olhadinha: {{2}}
   ```

8. **lead_boas_vindas** (marketing)
   ```
   Oi {{1}}! 🎀 Bem-vinda à família Papelaria Bibelô!
   Seu cupom exclusivo: {{2}}
   Aproveite: {{3}}
   ```

**Regras de aprovação:**
- Tempo: 1 min a 48h (maioria aprovada por ML em minutos)
- Categoria deve ser correta — Meta re-categoriza se errar
- Limite: ~2 marketing templates por usuário por dia (across all brands)

## Setup Chatwoot (Docker)

### docker-compose (adicionar ao existente)

```yaml
services:
  chatwoot-rails:
    image: chatwoot/chatwoot:v4.12.1
    container_name: bibelo_chatwoot
    depends_on:
      - postgres
      - redis
    environment:
      - RAILS_ENV=production
      - SECRET_KEY_BASE=${CHATWOOT_SECRET_KEY}
      - FRONTEND_URL=https://chat.papelariabibelo.com.br
      - DEFAULT_LOCALE=pt_BR
      - DATABASE_URL=postgresql://bibelocrm:${POSTGRES_PASSWORD}@postgres:5432/chatwoot
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/1
      - RAILS_LOG_TO_STDOUT=true
      # WhatsApp Cloud API (via Chatwoot Embedded Signup)
      - FB_APP_ID=${FB_APP_ID}
      - FB_APP_SECRET=${FB_APP_SECRET}
      # Instagram
      - IG_VERIFY_TOKEN=${IG_VERIFY_TOKEN}
    ports:
      - "3001:3000"
    restart: unless-stopped
    networks:
      - bibelo_net

  chatwoot-sidekiq:
    image: chatwoot/chatwoot:v4.12.1
    container_name: bibelo_chatwoot_worker
    depends_on:
      - chatwoot-rails
    environment:
      # mesmas env vars do rails
      - RAILS_ENV=production
      - SECRET_KEY_BASE=${CHATWOOT_SECRET_KEY}
      - DATABASE_URL=postgresql://bibelocrm:${POSTGRES_PASSWORD}@postgres:5432/chatwoot
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/1
    command: bundle exec sidekiq -C config/sidekiq.yml
    restart: unless-stopped
    networks:
      - bibelo_net
```

### Nginx (subdomínio dedicado)

```nginx
server {
    server_name chat.papelariabibelo.com.br;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/chat.papelariabibelo.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.papelariabibelo.com.br/privkey.pem;
}
```

### DNS Cloudflare
```
chat.papelariabibelo.com.br  A  <IP_VPS>  (DNS-only, sem proxy)
```

---

## Widget de Chat no Site (Live Chat)

Balão de chat no canto inferior direito da NuvemShop. Cliente clica, conversa em tempo real, tudo cai no painel do Chatwoot junto com WhatsApp e Instagram.

### Recursos do widget

- Balão customizável (cor rosa Bibelô `#fe68c4`, posição, texto)
- **Pré-chat form** — coleta nome, email e WhatsApp antes de iniciar (vincula ao CRM)
- Chat em tempo real com typing indicator
- Histórico persistente (cookie) — cliente volta e vê conversas anteriores
- Emojis, anexos (foto, arquivo)
- **Horário de atendimento** — fora do expediente mostra "Deixe sua mensagem, responderemos em breve!"
- Multilíngua pt-BR nativo
- Responsivo (mobile + desktop)

### Instalação via GTM (NuvemShop)

Adicionar tag HTML personalizada no **GTM-M4MVC29L** (mesmo GTM do popup e tracking):

```html
<script>
  window.chatwootSettings = {
    hideMessageBubble: false,
    position: "right",
    locale: "pt_BR",
    type: "standard",
    launcherTitle: "Fale conosco 💬"
  };
  (function(d,t) {
    var g=d.createElement(t),s=d.getElementsByTagName(t)[0];
    g.src="https://chat.papelariabibelo.com.br/packs/js/sdk.js";
    g.defer=true;
    g.async=true;
    s.parentNode.insertBefore(g,s);
    g.onload=function(){
      window.chatwootSDK.run({
        websiteToken: '<TOKEN_DO_INBOX_WEBSITE>',
        baseUrl: 'https://chat.papelariabibelo.com.br'
      })
    }
  })(document,"script");
</script>
```

**Trigger GTM:** All Pages (mesmo trigger do tracking e popup).

### Pré-chat form (coleta dados antes do chat)

Configurar no painel Chatwoot → Inbox Website → Pre-chat Form:

| Campo | Obrigatório | Motivo |
|-------|------------|--------|
| Nome | Sim | Identificar no CRM |
| Email | Sim | Vincular ao customer |
| WhatsApp | Não | Contato alternativo |

Quando o cliente preenche, o Chatwoot cria/atualiza o Contact. O webhook `conversation_created` envia para o BibelôCRM → upsert customer → interação na timeline.

### Horário de atendimento

Configurar no Chatwoot → Settings → Business Hours:

| Dia | Horário |
|-----|---------|
| Segunda a Sexta | 09:00 - 18:00 |
| Sábado | 09:00 - 13:00 |
| Domingo | Fechado |

Fora do horário: widget mostra formulário de mensagem offline → vira conversa pendente no painel.

### Personalização visual (cores Bibelô)

```javascript
// Chatwoot permite customizar via SDK
window.chatwootSettings = {
  // ... config base
  darkMode: "light",
  widgetStyle: "standard" // ou "expanded"
};

// Customizar cores via CSS injection no Chatwoot admin:
// --widget-color: #fe68c4 (rosa Bibelô)
// --widget-bubble-color: #fe68c4
```

No painel do Chatwoot → Inbox → Widget Settings:
- **Widget Color:** `#fe68c4` (rosa Bibelô)
- **Welcome Title:** "Olá! 🎀 Bem-vinda à Papelaria Bibelô"
- **Welcome Tagline:** "Tire suas dúvidas aqui ou pelo WhatsApp"
- **Reply Time:** "Respondemos em minutos"

### Identificar visitante automaticamente (se já é lead/customer)

Se o visitante já preencheu o popup de leads, podemos passar os dados ao widget:

```javascript
// No script de tracking (bibelo.js), após identificar visitante:
if (window.$chatwoot && customerEmail) {
  window.$chatwoot.setUser(customerId, {
    email: customerEmail,
    name: customerName,
    phone_number: customerPhone,
    identifier_hash: hmacHash // HMAC para segurança
  });
}
```

Isso evita que o cliente preencha o pré-chat form de novo e vincula a conversa ao perfil existente no CRM.

### Integração widget → BibelôCRM

```
Cliente abre chat no site
    ↓
Preenche nome + email (ou já identificado)
    ↓
Chatwoot cria conversa + contact
    ↓
Webhook "conversation_created" → BibelôCRM
    ↓
CRM faz upsert customer (por email)
    ↓
Registra interação na timeline: "Chat iniciado pelo site"
    ↓
Agente responde no painel Chatwoot
    ↓
Webhook "message_created" → CRM atualiza timeline
```

### Convivência com popup de leads e widget de reviews

O site terá 3 elementos visuais:
1. **Popup de leads** — aparece 1x após delay/exit-intent (já existe)
2. **Widget Google Reviews** — carrossel na home (já existe)
3. **Balão de chat** — fixo no canto inferior direito (novo)

Não há conflito visual — o popup é overlay temporário, reviews é inline, e o chat é fixo no canto.

---

## Integração BibelôCRM → Chatwoot

### Enviar WhatsApp template via Chatwoot API

```typescript
// api/src/integrations/whatsapp/chatwoot.ts

const CHATWOOT_URL = process.env.CHATWOOT_URL; // https://chat.papelariabibelo.com.br
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const CHATWOOT_INBOX_ID = process.env.CHATWOOT_WHATSAPP_INBOX_ID;

// 1. Buscar ou criar contato
async function findOrCreateContact(phone: string, name: string) {
  // POST /api/v1/accounts/:id/contacts
  // { name, phone_number: "+55..." }
}

// 2. Buscar ou criar conversa
async function findOrCreateConversation(contactId: string) {
  // POST /api/v1/accounts/:id/conversations
  // { source_id: phone, inbox_id: whatsapp_inbox_id, contact_id }
}

// 3. Enviar template message
async function sendWhatsAppTemplate(
  conversationId: string,
  templateName: string,
  params: Record<string, string>
) {
  // POST /api/v1/accounts/:id/conversations/:conv_id/messages
  // { message_type: "template", template_name, template_params: params }
}

// Função principal usada pelo flow engine
export async function sendWhatsAppMessage(
  phone: string,
  name: string,
  templateName: string,
  params: Record<string, string>
) {
  const contact = await findOrCreateContact(phone, name);
  const conversation = await findOrCreateConversation(contact.id);
  return await sendWhatsAppTemplate(conversation.id, templateName, params);
}
```

### Chatwoot → BibelôCRM (webhooks)

Configurar webhook no Chatwoot apontando para:
`https://webhook.papelariabibelo.com.br/api/webhooks/chatwoot`

Eventos úteis:
- `message_created` → registrar interação na timeline do cliente
- `conversation_status_changed` → atualizar deal no pipeline
- `conversation_created` → criar/atualizar customer se não existe

### Modificação no flow engine

Substituir Evolution API por Chatwoot API no `executeWhatsAppStep()`:

```typescript
// flow.service.ts — executeWhatsAppStep
async function executeWhatsAppStep(customer, step, metadata) {
  if (!customer.telefone) return { skipped: true, reason: "Cliente sem telefone" };

  const templateName = mapStepToTemplate(step.template);
  const params = buildTemplateParams(customer, metadata);

  const result = await sendWhatsAppMessage(
    customer.telefone,
    customer.nome,
    templateName,
    params
  );

  // Registrar interação
  await query(
    `INSERT INTO crm.interactions (customer_id, tipo, canal, descricao, metadata)
     VALUES ($1, 'whatsapp_enviado', 'whatsapp', $2, $3)`,
    [customer.id, `WhatsApp: ${templateName}`, JSON.stringify(result)]
  );

  return { sent: true, messageId: result.id, template: templateName };
}
```

## Instagram DM — Integração

### Requisitos
- Conta Instagram **Business** (já tem: @papelariabibelo)
- Facebook Page vinculada
- Facebook App com permissões: `instagram_manage_messages`, `instagram_basic`, `pages_show_list`

### Limitações importantes
- **Só responde dentro de 24h** após última mensagem do cliente
- **Sem templates proativos** (diferente do WhatsApp)
- **Rate limit: 200 calls/hora** (reduzido em 2026)
- Funciona como canal **reativo** — cliente inicia, agente responde

### No Chatwoot
- Adicionar Instagram como "Inbox" no painel
- Configurar Instagram Business Login
- DMs aparecem automaticamente no painel junto com WhatsApp

## Fluxos de automação WhatsApp (exemplos)

### 1. Lead não pegou cupom (24h)
```
Trigger: lead.verified (email confirmado)
Step 1: wait 24h
Step 2: condição — verificar se cupom foi usado
Step 3: whatsapp — template "cupom_lembrete" com cupom e link
```

### 2. Carrinho abandonado (multi-canal)
```
Trigger: order.abandoned
Step 1: email — carrinho abandonado (2h)
Step 2: wait 12h
Step 3: condição — se não converteu
Step 4: whatsapp — template "carrinho_abandonado" com recovery_url
Step 5: wait 24h
Step 6: condição — se não converteu
Step 7: whatsapp — template "ultima_chance_carrinho"
```

### 3. Pós-compra + avaliação
```
Trigger: order.paid
Step 1: whatsapp — template "pos_compra_agradecimento" (imediato)
Step 2: wait 72h (após entrega estimada)
Step 3: whatsapp — template "avaliacao_pos_entrega"
```

### 4. Reativação de cliente inativo
```
Trigger: customer.inactive (60+ dias sem compra)
Step 1: email — reativação
Step 2: wait 48h
Step 3: condição — se não abriu email
Step 4: whatsapp — template "reativacao_cliente"
```

## Etapas de implementação

### Fase 1: Setup Chatwoot (1-2 dias)
- [ ] Criar banco `chatwoot` no PostgreSQL
- [ ] Adicionar serviços ao docker-compose
- [ ] Configurar Nginx + SSL para chat.papelariabibelo.com.br
- [ ] DNS Cloudflare
- [ ] Criar conta admin no Chatwoot

### Fase 2: Meta Business + WhatsApp (3-5 dias)
- [ ] Verificar negócio no Meta Business Manager
- [ ] Criar Facebook App tipo Business
- [ ] Adicionar produto WhatsApp
- [ ] Registrar número de telefone (decidir: novo número ou migrar existente)
- [ ] Conectar WhatsApp no Chatwoot (Embedded Signup)
- [ ] Submeter templates para aprovação

### Fase 3: Integração CRM (2-3 dias)
- [ ] Criar `api/src/integrations/whatsapp/chatwoot.ts`
- [ ] Implementar `sendWhatsAppMessage()` via Chatwoot API
- [ ] Modificar `executeWhatsAppStep()` no flow engine
- [ ] Criar rota webhook `/api/webhooks/chatwoot`
- [ ] Registrar webhook no Chatwoot → BibelôCRM
- [ ] Adicionar variáveis de ambiente (CHATWOOT_URL, TOKEN, IDs)

### Fase 4: Templates + Fluxos (1-2 dias)
- [ ] Criar templates no Meta (aguardar aprovação)
- [ ] Sincronizar templates no Chatwoot
- [ ] Criar fluxos multi-canal no BibelôCRM
- [ ] Testar com número do Carlos

### Fase 5: Widget de Chat no Site (1 dia)
- [ ] Criar Inbox "Website" no Chatwoot (gera websiteToken)
- [ ] Configurar pré-chat form (nome, email, WhatsApp opcional)
- [ ] Personalizar cores (`#fe68c4`), textos, horário de atendimento
- [ ] Adicionar script no GTM (tag HTML, trigger All Pages)
- [ ] Integrar identificação automática (visitor → $chatwoot.setUser)
- [ ] Testar convivência com popup de leads e widget reviews

### Fase 6: Instagram (1 dia)
- [ ] Conectar Instagram Business no Chatwoot
- [ ] Testar recebimento de DMs
- [ ] Configurar webhook → BibelôCRM

### Fase 7: Go-live (1 dia)
- [ ] Ativar fluxos WhatsApp em produção
- [ ] Ativar widget de chat no site
- [ ] Monitorar qualidade (taxa de bloqueio WhatsApp)
- [ ] Ajustar templates e horários conforme feedback

**Tempo total estimado: 9-14 dias**

## Variáveis de ambiente novas

```env
# Chatwoot
CHATWOOT_URL=https://chat.papelariabibelo.com.br
CHATWOOT_API_TOKEN=
CHATWOOT_ACCOUNT_ID=
CHATWOOT_WHATSAPP_INBOX_ID=
CHATWOOT_INSTAGRAM_INBOX_ID=
CHATWOOT_WEBSITE_INBOX_TOKEN=
CHATWOOT_SECRET_KEY=

# Meta / Facebook App
FB_APP_ID=
FB_APP_SECRET=

# Instagram
IG_VERIFY_TOKEN=
```
