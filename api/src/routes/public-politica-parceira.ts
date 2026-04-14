/**
 * Regulamento do Programa Sou Parceira — Papelaria Bibelô
 * Rota pública, sem auth. Serve HTML standalone.
 */
import { Router, Request, Response } from "express";

export const politicaParceiraRouter = Router();

const PORTAL_URL = "https://souparceira.papelariabibelo.com.br";
const WHATSAPP   = "https://wa.me/5547933862514";

politicaParceiraRouter.get("/", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Regulamento — Programa Sou Parceira · Papelaria Bibelô</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Jost', Arial, sans-serif;
      background: #ffe5ec;
      color: #2d2d2d;
      line-height: 1.7;
    }
    a { color: #fe68c4; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ── Header ── */
    .header {
      background: linear-gradient(135deg, #fe68c4 0%, #fd4fb8 100%);
      text-align: center;
      padding: 36px 20px 28px;
    }
    .logo-mark {
      width: 52px; height: 52px;
      border-radius: 14px;
      background: rgba(255,255,255,0.22);
      border: 2px solid rgba(255,255,255,0.45);
      color: #fff;
      font-family: 'Jost', Arial, sans-serif;
      font-size: 26px;
      font-weight: 700;
      line-height: 52px;
      margin: 0 auto 14px;
      letter-spacing: -1px;
    }
    .header h1 { color: #fff; font-size: 22px; font-weight: 700; letter-spacing: -0.4px; }
    .header p  { color: rgba(255,255,255,0.85); font-size: 14px; margin-top: 6px; }

    /* ── Container ── */
    .container {
      max-width: 760px;
      margin: 0 auto;
      padding: 32px 20px 60px;
    }

    /* ── Seções ── */
    .card {
      background: #fff;
      border-radius: 14px;
      padding: 28px 28px 24px;
      margin-bottom: 20px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .card h2 {
      font-size: 16px;
      font-weight: 700;
      color: #fe68c4;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card h2 .emoji { font-size: 18px; }
    .card p, .card li { font-size: 14px; color: #444; margin-bottom: 8px; }
    .card ul, .card ol { padding-left: 20px; }
    .card li { margin-bottom: 6px; }
    strong { color: #2d2d2d; }

    /* ── Tabela de níveis ── */
    .nivel-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    .nivel-table th {
      background: #ffe5ec;
      color: #fe68c4;
      font-weight: 700;
      padding: 10px 12px;
      text-align: left;
      font-size: 11px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .nivel-table td { padding: 10px 12px; border-bottom: 1px solid #fce8f0; }
    .nivel-table tr:last-child td { border-bottom: none; }
    .nivel-table tr.destaque td { background: #fffbf0; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
    }
    .badge.iniciante { color: #888; }
    .badge.bronze    { color: #b45309; }
    .badge.prata     { color: #64748b; }
    .badge.ouro      { color: #d97706; }
    .badge.diamante  { color: #0891b2; }
    .desconto { color: #fe68c4; font-weight: 700; }
    .frete-gratis  { color: #16a34a; font-weight: 600; }
    .frete-proprio { color: #888; }

    /* ── CTA ── */
    .cta-block { text-align: center; margin-top: 32px; }
    .btn-pink {
      display: inline-block;
      background: #fe68c4;
      color: #fff;
      font-size: 15px;
      font-weight: 700;
      padding: 14px 36px;
      border-radius: 10px;
      letter-spacing: -0.3px;
      text-decoration: none;
    }
    .btn-pink:hover { background: #fd4fb8; text-decoration: none; }

    /* ── Footer ── */
    .footer {
      text-align: center;
      padding: 24px 20px;
      color: #aaa;
      font-size: 12px;
      line-height: 1.8;
    }
    .footer a { color: #fe68c4; }

    /* ── Responsive ── */
    @media (max-width: 540px) {
      .card { padding: 20px 16px; }
      .nivel-table th, .nivel-table td { padding: 8px 8px; font-size: 12px; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="logo-mark">B</div>
    <h1>🤝 Regulamento do Programa Sou Parceira</h1>
    <p>Papelaria Bibelô · Timbó/SC · Versão atualizada em abril de 2026</p>
  </div>

  <div class="container">

    <!-- 1. O que é o programa -->
    <div class="card">
      <h2><span class="emoji">📋</span> 1. O que é o Programa Sou Parceira?</h2>
      <p>
        O <strong>Programa Sou Parceira</strong> é o canal B2B exclusivo da Papelaria Bibelô
        para revendedoras autorizadas. Ao participar, você tem acesso a um catálogo especial
        com preços de atacado, pedidos pelo portal online e descontos progressivos conforme
        seu volume mensal de compras.
      </p>
      <p>
        O programa destina-se a revendedoras que comercializam produtos Bibelô em suas
        cidades, seja em lojas físicas, vendas por catálogo, redes sociais ou outros canais.
      </p>
    </div>

    <!-- 2. Como participar -->
    <div class="card">
      <h2><span class="emoji">✅</span> 2. Como se tornar parceira</h2>
      <ol>
        <li>Entre em contato com a Bibelô pelo WhatsApp <a href="${WHATSAPP}">(47) 9 3386-2514</a> ou aguarde contato após indicação.</li>
        <li>Após aprovação pela equipe Bibelô, você receberá um e-mail de boas-vindas com instruções de acesso.</li>
        <li>Acesse o portal em <a href="${PORTAL_URL}">${PORTAL_URL}</a> usando seu CPF cadastrado.</li>
        <li>Um código de 6 dígitos será enviado para seu e-mail a cada acesso — não é necessário senha.</li>
      </ol>
      <p style="margin-top:12px;">
        A Bibelô reserva-se o direito de aprovar, recusar ou encerrar parcerias a qualquer momento,
        sem obrigação de justificativa formal.
      </p>
    </div>

    <!-- 3. Níveis e descontos -->
    <div class="card">
      <h2><span class="emoji">📊</span> 3. Níveis e descontos</h2>
      <p>
        O desconto é calculado com base no <strong>volume total de compras no mês vigente</strong>.
        O nível é atualizado automaticamente no início de cada ciclo mensal.
      </p>
      <table class="nivel-table">
        <thead>
          <tr>
            <th>Nível</th>
            <th>Volume mensal</th>
            <th>Desconto</th>
            <th>Frete</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="badge iniciante">✨ Iniciante</span></td>
            <td>1º pedido ≥ R$&nbsp;300</td>
            <td><span class="desconto">— sem desconto</span></td>
            <td><span class="frete-proprio">📦 Por sua conta</span></td>
          </tr>
          <tr>
            <td><span class="badge bronze">🥉 Bronze</span></td>
            <td>R$&nbsp;300 a R$&nbsp;599/mês</td>
            <td><span class="desconto">15% OFF</span></td>
            <td><span class="frete-proprio">📦 Por sua conta</span></td>
          </tr>
          <tr>
            <td><span class="badge prata">🥈 Prata</span></td>
            <td>R$&nbsp;600 a R$&nbsp;1.199/mês</td>
            <td><span class="desconto">20% OFF</span></td>
            <td><span class="frete-proprio">📦 Por sua conta</span></td>
          </tr>
          <tr class="destaque">
            <td><span class="badge ouro">🥇 Ouro</span></td>
            <td>R$&nbsp;1.200 a R$&nbsp;2.999/mês</td>
            <td><span class="desconto">25% OFF</span></td>
            <td><span class="frete-gratis">🤝 Frete 50/50</span></td>
          </tr>
          <tr class="destaque">
            <td><span class="badge diamante">💎 Diamante</span></td>
            <td>R$&nbsp;3.000+/mês</td>
            <td><span class="desconto">30% OFF</span></td>
            <td><span class="frete-gratis">✅ Frete grátis</span></td>
          </tr>
        </tbody>
      </table>
      <p style="margin-top:12px;font-size:12px;color:#aaa;">
        Os descontos são aplicados sobre o preço de tabela do catálogo exclusivo para parceiras,
        que pode diferir dos preços da loja online pública.
      </p>
    </div>

    <!-- 4. Como fazer pedidos -->
    <div class="card">
      <h2><span class="emoji">🛒</span> 4. Como fazer pedidos</h2>
      <ol>
        <li>Acesse o portal e entre na aba <strong>Catálogo</strong>.</li>
        <li>Adicione os produtos ao carrinho. O preço já exibe o desconto do seu nível.</li>
        <li>Finalize o pedido — ele será enviado automaticamente para nossa equipe.</li>
        <li>Nossa equipe analisará o pedido e entrará em contato pelo WhatsApp ou e-mail para combinar pagamento e entrega.</li>
        <li>Acompanhe seus pedidos na aba <strong>Meus Pedidos</strong> do portal.</li>
      </ol>
      <p style="margin-top:10px;">
        O pedido mínimo é de <strong>R$&nbsp;300,00</strong> por pedido.
      </p>
    </div>

    <!-- 5. Pagamento -->
    <div class="card">
      <h2><span class="emoji">💳</span> 5. Formas de pagamento</h2>
      <ul>
        <li><strong>PIX</strong> — pagamento imediato, sem taxa adicional.</li>
        <li><strong>Transferência bancária</strong> — combinada diretamente com nossa equipe.</li>
        <li>Outras formas podem ser acordadas caso a caso.</li>
      </ul>
      <p style="margin-top:10px;">
        O pagamento deve ser realizado antes do envio dos produtos, salvo acordo prévio.
      </p>
    </div>

    <!-- 6. Frete e entrega -->
    <div class="card">
      <h2><span class="emoji">🚚</span> 6. Frete e entrega</h2>
      <ul>
        <li>Parceiras nos níveis <strong>Iniciante, Bronze e Prata</strong> são responsáveis pelo custo integral do frete.</li>
        <li>Parceiras no nível <strong>Ouro</strong> dividem o frete com a Bibelô (50% cada parte).</li>
        <li>Parceiras no nível <strong>Diamante</strong> têm frete grátis (Bibelô arca 100% com o envio).</li>
        <li>O frete é calculado com base no CEP de destino e peso do pedido.</li>
        <li>O prazo de entrega varia conforme a transportadora e a região.</li>
        <li>Bibelô utiliza transportadoras parceiras e Correios (PAC/SEDEX).</li>
      </ul>
    </div>

    <!-- 7. Cancelamentos e trocas -->
    <div class="card">
      <h2><span class="emoji">↩️</span> 7. Cancelamentos e trocas</h2>
      <ul>
        <li>Pedidos podem ser cancelados antes do despacho mediante solicitação pelo portal ou WhatsApp.</li>
        <li>Produtos com defeito de fabricação podem ser trocados em até <strong>7 dias</strong> após o recebimento.</li>
        <li>Não há troca por arrependimento de compra após o envio.</li>
        <li>Trocas e devoluções devem ser acordadas diretamente com nossa equipe.</li>
      </ul>
    </div>

    <!-- 8. Sigilo e exclusividade -->
    <div class="card">
      <h2><span class="emoji">🔒</span> 8. Sigilo e exclusividade</h2>
      <ul>
        <li>Os preços do catálogo exclusivo para parceiras são <strong>confidenciais</strong> e não devem ser divulgados publicamente.</li>
        <li>A revenda dos produtos é autorizada, mas a exposição de preços de atacado é proibida.</li>
        <li>O acesso ao portal é pessoal e intransferível. O CPF e o código OTP são de uso exclusivo da parceira cadastrada.</li>
      </ul>
    </div>

    <!-- 9. Alterações -->
    <div class="card">
      <h2><span class="emoji">📝</span> 9. Alterações no programa</h2>
      <p>
        A Papelaria Bibelô reserva-se o direito de alterar os termos deste regulamento, os percentuais de desconto
        e as regras do programa a qualquer momento, com aviso prévio por e-mail às parceiras ativas.
      </p>
    </div>

    <!-- CTA -->
    <div class="cta-block">
      <a href="${PORTAL_URL}" class="btn-pink">Acessar o portal Sou Parceira →</a>
      <p style="margin-top:16px;font-size:13px;color:#888;">
        Dúvidas? <a href="${WHATSAPP}">Fale conosco no WhatsApp (47) 9 3386-2514</a>
      </p>
    </div>

  </div>

  <div class="footer">
    <p>Papelaria Bibelô · CNPJ 63.961.764/0001-63 · Timbó/SC</p>
    <p><a href="https://papelariabibelo.com.br">papelariabibelo.com.br</a></p>
  </div>

</body>
</html>`);
});
