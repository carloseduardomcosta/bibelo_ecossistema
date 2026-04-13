# Portal Sou Parceira — Levantamento de Evoluções

**Data:** 12/04/2026  
**Status:** Planejado — implementar a partir de 13/04/2026

---

## 4 evoluções mapeadas

### 1. Formulário de cadastro B2B com endereço completo

**Onde:** `https://boasvindas.papelariabibelo.com.br/api/links/parcerias`  
**Arquivo:** `api/src/routes/links.ts` (GET + POST `/parcerias`)

**O que adicionar:**
- Campos: CEP, logradouro, número, complemento, bairro (cidade e estado já existem em `crm.revendedoras`)
- CEP auto-preenche via **ViaCEP** (`https://viacep.com.br/ws/{cep}/json/`) — chamada client-side
- Campos auto-preenchidos ficam com fundo cinza (editáveis)
- Número obrigatório; complemento opcional

**Migration necessária:**
```sql
ALTER TABLE crm.revendedoras
  ADD COLUMN IF NOT EXISTS cep          VARCHAR(8),
  ADD COLUMN IF NOT EXISTS logradouro   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS numero       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS complemento  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bairro       VARCHAR(100);
```

**Backend:** Zod schema de `parceriasSchema` ganha 5 campos opcionais; INSERT em `crm.revendedoras` inclui os novos campos.

**Segurança:**
- Validar CEP no backend: `/^\d{8}$/`
- Endereço sanitizado com `esc()` em qualquer email de confirmação
- Campos LGPD — cobertos pelo aviso de privacidade existente
- Chamada ViaCEP é client-side (não expõe infra)

**CRM:** `RevendedoraPerfil.tsx` ganha seção de endereço na edição (já exibe cidade/estado, adicionar os 5 novos campos)

---

### 2. Dashboard de KPIs para a revendedora (tela inicial pós-login)

**Arquivo:** `frontend/src/pages/SouParceira.tsx` (nova tela entre login e catálogo)  
**Endpoint novo:** `GET /api/souparceira/dashboard`

**Layout:**
```
┌──────────────────────────────────────────┐
│  Bom dia, [Nome]!  [Badge Nível] [X% off] │
├──────────┬──────────┬──────────┬──────────┤
│ Vendas   │ Pedidos  │ Pontos   │ Próxima  │
│ R$ X.XXX │    12    │   450    │  meta    │
│ este mês │  total   │ acumul.  │ progbar  │
├──────────┴──────────┴──────────┴──────────┤
│ Últimos pedidos                    Ver →  │
│  [data]  [badge status]   [R$ valor]     │
│  [data]  [badge status]   [R$ valor]     │
├───────────────────────────────────────────┤
│  [Botão] Acessar catálogo →              │
└───────────────────────────────────────────┘
```

**KPI cards:**
- Volume mês atual (`volume_mes_atual` em `crm.revendedoras`)
- Número total de pedidos (`crm.revendedora_pedidos`)
- Pontos acumulados (`pontos`)
- Barra de progresso do tier: Bronze→Prata (R$ 600) → Prata→Ouro (R$ 1.200)

**Tabela de últimos pedidos:** status, total, data — apenas 3 mais recentes

**Segurança:**
- Endpoint usa `authParceira` (JWT `iss: 'souparceira'`)
- `WHERE revendedora_id = $1` — sem IDOR possível
- Pedidos retornam apenas `status`, `total`, `criado_em` — sem dados de custo/markup

**Migration:** nenhuma — usa tabelas existentes (`crm.revendedoras` + `crm.revendedora_pedidos`)

---

### 3. Área de módulos / assinaturas (scaffold)

**Onde:** Nova tela "Recursos" no portal `SouParceira.tsx`  
**Conceito:** Módulos adicionais que a revendedora pode adquirir (fluxo de caixa, relatórios, etc.)

**Layout:**
```
┌──────────────────────────────────────────┐
│  Recursos disponíveis                    │
├───────────────────┬──────────────────────┤
│ 🔒 Fluxo de Caixa │ 🔒 Relatório Vendas  │
│ Controle finanças │ Análise desempenho   │
│ pessoais          │                      │
│ [Saber mais →]    │ [Em breve]           │
├───────────────────┴──────────────────────┤
│  Seus módulos ativos: [nenhum]           │
└──────────────────────────────────────────┘
```

**Migrations necessárias:**
```sql
-- Catálogo de módulos disponíveis
CREATE TABLE crm.modulos (
  id          VARCHAR(50) PRIMARY KEY,  -- 'fluxo_caixa', 'relatorio_vendas'
  nome        VARCHAR(200) NOT NULL,
  descricao   TEXT,
  preco_mensal NUMERIC(8,2),
  ativo       BOOLEAN DEFAULT true
);

-- Assinaturas ativas por revendedora
CREATE TABLE crm.revendedora_modulos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revendedora_id UUID REFERENCES crm.revendedoras(id),
  modulo_id      VARCHAR(50) REFERENCES crm.modulos(id),
  ativo_desde    TIMESTAMPTZ DEFAULT NOW(),
  expira_em      TIMESTAMPTZ,    -- NULL = sem expiração (vitalício)
  plano          VARCHAR(20),    -- 'basico', 'pro'
  UNIQUE(revendedora_id, modulo_id)
);
```

**Endpoints novos:**
- `GET /api/souparceira/modulos` — catálogo de módulos + flags de acesso da revendedora
- `GET /api/souparceira/modulos/:id/dados` — dados do módulo (só se tiver acesso)

**MVP do módulo Fluxo de Caixa:**
- Lançamentos de receita e despesa da revendedora
- Saldo do mês
- Baseado na lógica do módulo financeiro do CRM (adaptar para B2B)

**Segurança:**
- Acesso ao módulo validado **server-side** em cada request (consulta `revendedora_modulos`)
- Nunca só no frontend
- Pagamento no MVP: redireciona para WhatsApp — sem gateway, sem PCI-DSS

---

### 4. Catálogo com densidade configurável

**Arquivo:** `frontend/src/pages/SouParceira.tsx` (componente `Catalogo`)  
**Backend:** `api/src/routes/portal-souparceira.ts` (endpoint GET `/catalogo`)

**O que muda:**

**UI — Barra de controles:**
```
[Busca...]  [Categoria ▾]  [Ordenar ▾]  Exibir: [12 ▾]
Mostrando 1–12 de 1.186 produtos
```

**Seletor de itens por página:** 8 · 12 · 24 · 48 (default: **12**)  
Persiste em `localStorage('souparceira_limit')`

**Seletor de ordenação:**
- Nome A–Z (padrão)
- Nome Z–A
- Menor preço
- Maior preço

**Mensagem contextual:** "Mostrando 1–12 de 1.186 produtos"

**Cards:** quando `imagem_url` for null → placeholder com inicial da categoria (mesmo padrão do storefront)

**Backend:**
- Adicionar parâmetro `sort` ao endpoint `/catalogo`: `nome_asc | nome_desc | preco_asc | preco_desc`
- `ORDER BY` dinâmico com whitelist (sem SQL injection)
- Limite já é parâmetro aceito (1–100) — nenhuma alteração de segurança

**Migration:** nenhuma

---

## Ordem de implementação sugerida

| Prioridade | Item | Motivo |
|-----------|------|--------|
| 1 | Catálogo configurável | Menor esforço, impacto imediato na UX |
| 2 | Dashboard KPIs | Core da experiência do portal |
| 3 | Endereço no cadastro | Coleta dados importantes; migration simples |
| 4 | Módulos/assinaturas | Mais estrutural; migration + novos endpoints |

---

## Arquivos a modificar

| Arquivo | Alterações |
|---------|-----------|
| `db/migrations/036_revendedoras_endereco.sql` | 5 colunas de endereço |
| `db/migrations/037_modulos.sql` | Tabelas modulos + revendedora_modulos |
| `api/src/routes/links.ts` | Parcerias: Zod + HTML + ViaCEP + INSERT |
| `api/src/routes/portal-souparceira.ts` | Endpoints dashboard + modulos + sort no catálogo |
| `frontend/src/pages/SouParceira.tsx` | Telas: Dashboard + Recursos + catálogo configurável |
| `frontend/src/pages/RevendedoraPerfil.tsx` | Seção de endereço no perfil |
