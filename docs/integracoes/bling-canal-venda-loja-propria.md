# Registrar Canal de Venda "Loja Própria" no Bling

> Para que pedidos da loja própria (Medusa) apareçam nos relatórios do Bling
> como um canal separado (assim como NuvemShop e Shopee).

---

## Passo a passo

### 1. Criar o canal no painel do Bling

1. Acesse o Bling → **Preferências** → **Central de Extensões** → **Canais de Venda**
2. Clique em **Novo Canal de Venda**
3. Selecione o tipo: **API**
4. Preencha:
   - **Nome:** `Papelaria Bibelô - Loja Própria`
   - **Descrição:** `E-commerce próprio (Medusa.js) — papelariabibelo.com.br`
5. Salve e anote o **ID do canal** (aparece na URL ou no retorno da API)

### 2. Verificar o canal criado

Após criar, o canal aparecerá na API:

```bash
curl -s "https://api.bling.com.br/Api/v3/canais-venda" \
  -H "Authorization: Bearer {token}" | python3 -m json.tool
```

Procure por: `"tipo": "Api"` e `"descricao": "Papelaria Bibelô - Loja Própria"`

### 3. Atualizar o .env do BibelôCRM

Adicione o ID do novo canal na variável `BLING_LOJAS_ONLINE`:

```env
# Antes:
BLING_LOJAS_ONLINE=205945450:nuvemshop,205891189:shopee

# Depois (adicionar o novo ID):
BLING_LOJAS_ONLINE=205945450:nuvemshop,205891189:shopee,{NOVO_ID}:loja-propria
```

### 4. Efeito nos relatórios

Com o canal registrado, os pedidos criados via Medusa → Bling (`POST /pedidos/vendas`) incluirão o ID do canal. Isso permite:

- **Relatório de vendas por canal** no Bling
- **Estoque dedicado** por canal (opcional)
- **Preço diferenciado** por canal via `/produtos/lojas` (opcional)

---

## Canais atuais no Bling

| ID | Nome | Tipo | Status |
|-----|------|------|--------|
| 205995943 | 0_Venda Presencial | LojaFisica | Ativo |
| 205945450 | Papelaria Bibelô - NUVEM SHOP OFICIAL | Nuvemshop | Ativo |
| 205891189 | Papelaria Bibelô - SHOPEE | Shopee | Ativo |
| 205852835 | Papelaria Bibelô - Mercado Livre | MercadoLivre | Ativo |
| 205898275 | Papelaria Bibelo - GOOGLE | GoogleShopping | Ativo |
| **A criar** | **Papelaria Bibelô - Loja Própria** | **Api** | **—** |

---

*Documento criado em 1 de abril de 2026*
