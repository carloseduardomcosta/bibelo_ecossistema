-- 041: Templates de email editáveis para revendedoras
-- Adiciona coluna slug em marketing.templates e insere os 3 templates do programa Sou Parceira

ALTER TABLE marketing.templates
  ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE;

-- Template 1: Boas-vindas ao cadastrar
INSERT INTO marketing.templates (id, nome, slug, canal, categoria, assunto, html, variaveis, ativo)
VALUES (
  uuid_generate_v4(),
  'Boas-vindas Sou Parceira',
  'revendedoras_boas_vindas',
  'email',
  'revendedoras',
  'Bem-vinda ao Programa Sou Parceira — Papelaria Bibelô! 🤝',
  '<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#ffe5ec;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffe5ec;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;max-width:560px;width:100%;">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#fe68c4,#f43f8e);padding:32px 36px;text-align:center;">
    <p style="margin:0 0 8px;color:#fff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">🎀 Papelaria Bibelô</p>
    <p style="margin:0;color:rgba(255,255,255,0.9);font-size:15px;font-weight:500;">Programa Sou Parceira</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px 36px;">
    <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#2d2d2d;">Olá, {{nome}}! 🤝</p>
    <p style="margin:0 0 20px;font-size:14px;color:#666;line-height:1.7;">
      Seu cadastro no <strong>Programa Sou Parceira</strong> foi realizado com sucesso!
      Você começa como <strong>{{nivel_label}}</strong> com <strong>{{desconto}}% de desconto</strong> em todos os produtos.
    </p>

    <!-- Seus dados -->
    <div style="background:#fdf6f9;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#fe68c4;text-transform:uppercase;letter-spacing:0.5px;">Seus dados</p>
      <p style="margin:0 0 4px;font-size:13px;color:#444;"><strong>CPF:</strong> {{cpf_formatado}}</p>
      <p style="margin:0;font-size:13px;color:#444;"><strong>Desconto atual:</strong> {{desconto}}% OFF em todos os produtos</p>
    </div>

    <!-- Tabela de níveis -->
    {{tabela_niveis}}

    <p style="margin:20px 0 0;font-size:13px;color:#888;line-height:1.6;">
      Acesse o portal para fazer seus pedidos:<br/>
      <a href="https://souparceira.papelariabibelo.com.br" style="color:#fe68c4;font-weight:700;">souparceira.papelariabibelo.com.br</a>
    </p>
    <p style="margin:12px 0 0;font-size:13px;color:#888;">
      Dúvidas? Fale com a gente: <a href="https://wa.me/5547933862514" style="color:#fe68c4;">(47) 9 3386-2514</a>
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9f9f9;padding:16px 36px;text-align:center;border-top:1px solid #f0e0e8;">
    <p style="margin:0;color:#bbb;font-size:11px;">Papelaria Bibelô · Timbó/SC · contato@papelariabibelo.com.br</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>',
  '[
    {"nome":"nome","descricao":"Nome da revendedora"},
    {"nome":"cpf_formatado","descricao":"CPF formatado (ex: 000.000.000-00)"},
    {"nome":"desconto","descricao":"Percentual de desconto atual (ex: 15)"},
    {"nome":"nivel_label","descricao":"Nome do nível (Iniciante, Bronze, Prata, Ouro, Diamante)"},
    {"nome":"tabela_niveis","descricao":"Tabela comparativa de níveis (gerada automaticamente)"}
  ]'::jsonb,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- Template 2: Atualização de status do pedido
INSERT INTO marketing.templates (id, nome, slug, canal, categoria, assunto, html, variaveis, ativo)
VALUES (
  uuid_generate_v4(),
  'Status do Pedido — Sou Parceira',
  'revendedoras_status_pedido',
  'email',
  'revendedoras',
  'Pedido {{numero_pedido}} — status atualizado',
  '<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#ffe5ec;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffe5ec;padding:32px 16px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;max-width:480px;width:100%;">
  <tr><td style="background:#fe68c4;padding:24px 32px;">
    <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">🎀 Papelaria Bibelô</p>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Atualização do seu pedido</p>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 6px;font-size:14px;color:#555;">Olá, <strong>{{nome}}</strong>!</p>
    <p style="margin:0 0 16px;font-size:13px;color:#777;">Seu pedido <strong>{{numero_pedido}}</strong> foi atualizado:</p>
    <div style="text-align:center;padding:20px;background:#fdf6f9;border-radius:12px;margin:0 0 16px;">
      <p style="margin:0;font-size:24px;font-weight:800;color:#333;">{{status_label}}</p>
    </div>
    {{observacao_block}}
    <p style="margin:20px 0 0;font-size:12px;color:#aaa;">Acesse o portal Sou Parceira para mais detalhes.</p>
  </td></tr>
  <tr><td style="background:#f9f9f9;padding:14px 32px;text-align:center;border-top:1px solid #f0e0e8;">
    <p style="margin:0;color:#aaa;font-size:11px;">Papelaria Bibelô · Timbó/SC</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>',
  '[
    {"nome":"nome","descricao":"Nome da revendedora"},
    {"nome":"numero_pedido","descricao":"Número do pedido (ex: PED-2026-001)"},
    {"nome":"status_label","descricao":"Status com emoji (ex: ✅ Aprovado)"},
    {"nome":"observacao_block","descricao":"Bloco HTML com mensagem do admin (gerado automaticamente, vazio se não houver)"}
  ]'::jsonb,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- Template 3: Nova mensagem no pedido
INSERT INTO marketing.templates (id, nome, slug, canal, categoria, assunto, html, variaveis, ativo)
VALUES (
  uuid_generate_v4(),
  'Nova Mensagem no Pedido — Sou Parceira',
  'revendedoras_nova_mensagem',
  'email',
  'revendedoras',
  'Nova mensagem no pedido {{numero_pedido}} — Papelaria Bibelô',
  '<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#ffe5ec;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffe5ec;padding:32px 16px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;max-width:480px;width:100%;">
  <tr><td style="background:#fe68c4;padding:24px 32px;">
    <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">🎀 Papelaria Bibelô</p>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Nova mensagem — Pedido {{numero_pedido}}</p>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:14px;color:#555;">Olá, <strong>{{destinatario}}</strong>!</p>
    <p style="margin:6px 0 16px;font-size:13px;color:#777;"><strong>{{remetente}}</strong> enviou uma mensagem:</p>
    <div style="background:#fdf6f9;border-left:4px solid #fe68c4;border-radius:0 8px 8px 0;padding:14px 16px;">
      <p style="margin:0;font-size:14px;color:#333;line-height:1.6;">{{conteudo}}</p>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#aaa;">Acesse o portal para responder.</p>
  </td></tr>
  <tr><td style="background:#f9f9f9;padding:14px 32px;text-align:center;border-top:1px solid #f0e0e8;">
    <p style="margin:0;color:#aaa;font-size:11px;">Papelaria Bibelô · Timbó/SC</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>',
  '[
    {"nome":"destinatario","descricao":"Nome de quem recebe (revendedora ou admin)"},
    {"nome":"remetente","descricao":"Nome de quem enviou a mensagem"},
    {"nome":"numero_pedido","descricao":"Número do pedido"},
    {"nome":"conteudo","descricao":"Conteúdo da mensagem"}
  ]'::jsonb,
  true
)
ON CONFLICT (slug) DO NOTHING;
