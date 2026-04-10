/**
 * Emails transacionais do Storefront — Papelaria Bibelô
 * Confirmação de pedido, pagamento aprovado, envio com rastreio
 */

import { sendEmail, isEmailConfigured } from "../integrations/resend/email";
import { gerarLinkDescadastro } from "../routes/email";
import { logger } from "../utils/logger";
import { escHtml as esc } from "../utils/sanitize";

// ── Helpers ──────────────────────────────────────────────────────

function formatBRL(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;
}

function wrapper(content: string, email?: string): string {
  const unsubLink = email ? gerarLinkDescadastro(email) : "#";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{font-family:Jost,'Segoe UI',Arial,sans-serif;}</style>
</head>
<body style="margin:0;padding:0;background:#ffe5ec;">
<div style="max-width:600px;margin:0 auto;padding:20px 10px;">
  <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(254,104,196,0.12);">
    <div style="background:linear-gradient(135deg,#fff7c1,#ffe5ec);padding:40px 30px;text-align:center;border-bottom:3px solid #fe68c4;">
      <a href="https://www.papelariabibelo.com.br" target="_blank" style="text-decoration:none;">
        <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" style="width:80px;height:80px;border-radius:50%;border:3px solid #fe68c4;" />
      </a>
      <h1 style="color:#fe68c4;margin:10px 0 0;font-size:28px;font-weight:700;">Papelaria Bibelô</h1>
      <p style="color:#888;margin:5px 0 0;font-size:14px;font-weight:500;">Encantando momentos com papelaria</p>
    </div>
    <div style="padding:35px 30px;">
      ${content}
      <p style="font-size:13px;color:#999;text-align:center;margin:24px 0 0;">Dúvidas? Fale conosco: <a href="https://wa.me/5547933862514" style="color:#fe68c4;text-decoration:none;">(47) 9 3386-2514</a></p>
    </div>
    <div style="background:#fff7c1;padding:24px 30px;text-align:center;border-top:1px solid #fee;">
      <p style="color:#777;font-size:13px;margin:0;font-weight:500;">Papelaria Bibelô</p>
      <p style="color:#aaa;font-size:11px;margin:4px 0 0;">CNPJ 63.961.764/0001-63 · contato@papelariabibelo.com.br · (47) 9 3386-2514</p>
      <p style="margin:8px 0 0;"><a href="https://www.papelariabibelo.com.br" style="color:#fe68c4;text-decoration:none;font-size:12px;font-weight:500;">papelariabibelo.com.br</a></p>
      <p style="margin:6px 0 0;"><a href="${unsubLink}" style="color:#ccc;text-decoration:underline;font-size:10px;">Não quero mais receber emails</a></p>
    </div>
  </div>
</div>
</body>
</html>`;
}

function ctaBtn(text: string, url: string): string {
  return `<div style="text-align:center;margin:28px 0;">
    <a href="${url}" style="background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:16px 40px;text-decoration:none;border-radius:50px;font-size:16px;font-weight:600;display:inline-block;box-shadow:0 4px 15px rgba(254,104,196,0.35);">${text}</a>
  </div>`;
}

// ── Tipos ────────────────────────────────────────────────────────

interface OrderItem {
  title: string;
  sku: string;
  quantity: number;
  unit_price: number; // centavos
}

interface OrderEmailData {
  email: string;
  display_id: string | number;
  total: number; // centavos
  subtotal?: number;
  shipping_total?: number;
  items: OrderItem[];
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    address_1?: string;
    city?: string;
    province?: string;
    postal_code?: string;
  };
  shipping_method?: string;
  payment_method?: string;
}

// ── Tabela de itens ──────────────────────────────────────────────

function buildItemsTable(items: OrderItem[]): string {
  const rows = items.map((item) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
        <p style="margin:0;font-weight:600;color:#2d2d2d;font-size:14px;">${esc(item.title)}</p>
        ${item.sku ? `<p style="margin:2px 0 0;font-size:11px;color:#999;">SKU: ${esc(item.sku)}</p>` : ""}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;text-align:center;color:#666;font-size:14px;">${item.quantity}x</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;color:#2d2d2d;font-size:14px;">${formatBRL(item.unit_price * item.quantity)}</td>
    </tr>`).join("");

  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <thead><tr>
      <th style="text-align:left;padding:8px 0;border-bottom:2px solid #fe68c4;color:#fe68c4;font-size:12px;font-weight:600;text-transform:uppercase;">Produto</th>
      <th style="text-align:center;padding:8px 0;border-bottom:2px solid #fe68c4;color:#fe68c4;font-size:12px;font-weight:600;">Qtd</th>
      <th style="text-align:right;padding:8px 0;border-bottom:2px solid #fe68c4;color:#fe68c4;font-size:12px;font-weight:600;">Valor</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── 1. Email de confirmação de pedido ─────────────────────────────

export async function sendOrderConfirmationEmail(order: OrderEmailData): Promise<void> {
  if (!isEmailConfigured() || !order.email) return;

  const nome = order.shipping_address?.first_name
    ? esc(order.shipping_address.first_name)
    : "Cliente";

  const addr = order.shipping_address;
  const enderecoHtml = addr
    ? `<p style="margin:0;font-size:13px;color:#666;">
        ${esc(addr.address_1 || "")}${addr.city ? `, ${esc(addr.city)}` : ""}${addr.province ? `/${esc(addr.province)}` : ""}
        ${addr.postal_code ? `— CEP ${esc(addr.postal_code)}` : ""}
      </p>`
    : "";

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:60px;height:60px;background:#e8fce8;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:28px;">✓</span>
      </div>
      <h2 style="color:#2d2d2d;margin:0;font-size:22px;">Pedido recebido!</h2>
      <p style="color:#fe68c4;font-weight:600;font-size:16px;margin:4px 0 0;">Pedido #${esc(String(order.display_id))}</p>
    </div>

    <p style="color:#555;font-size:15px;line-height:1.6;">
      Olá, ${nome}! Recebemos seu pedido e ele está sendo processado. Assim que o pagamento for confirmado, começaremos a preparar tudo com muito carinho.
    </p>

    ${buildItemsTable(order.items)}

    <div style="background:#f9f9f9;border-radius:12px;padding:16px;margin:16px 0;">
      ${order.subtotal ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#888;font-size:13px;">Subtotal</span><span style="color:#555;font-size:13px;">${formatBRL(order.subtotal)}</span></div>` : ""}
      ${order.shipping_total ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#888;font-size:13px;">Frete (${esc(order.shipping_method || "Correios")})</span><span style="color:#555;font-size:13px;">${order.shipping_total > 0 ? formatBRL(order.shipping_total) : "Grátis"}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;border-top:1px solid #eee;padding-top:8px;margin-top:4px;">
        <span style="color:#2d2d2d;font-size:16px;font-weight:700;">Total</span>
        <span style="color:#fe68c4;font-size:16px;font-weight:700;">${formatBRL(order.total)}</span>
      </div>
    </div>

    ${enderecoHtml ? `<div style="margin:16px 0;"><p style="font-weight:600;color:#2d2d2d;font-size:13px;margin:0 0 4px;">Endereço de entrega:</p>${enderecoHtml}</div>` : ""}

    ${ctaBtn("Acompanhar pedido", "https://homolog.papelariabibelo.com.br/conta/pedidos")}

    <p style="color:#888;font-size:13px;text-align:center;">
      Pagamento via <strong>${esc(order.payment_method || "Pix")}</strong>
    </p>
  `;

  try {
    await sendEmail({
      to: order.email,
      subject: `Pedido #${order.display_id} recebido — Papelaria Bibelô`,
      html: wrapper(content, order.email),
      tags: [
        { name: "type", value: "order-confirmation" },
        { name: "order_id", value: String(order.display_id) },
      ],
    });
    logger.info(`Email confirmação pedido #${order.display_id} enviado para ${order.email}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao enviar email";
    logger.error(`Erro ao enviar email confirmação pedido #${order.display_id}: ${msg}`);
  }
}

// ── 2. Email de pagamento aprovado ───────────────────────────────

export async function sendPaymentApprovedEmail(data: {
  email: string;
  display_id: string | number;
  total: number;
  payment_method?: string;
}): Promise<void> {
  if (!isEmailConfigured() || !data.email) return;

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:60px;height:60px;background:#e8fce8;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:28px;">💳</span>
      </div>
      <h2 style="color:#2d2d2d;margin:0;font-size:22px;">Pagamento confirmado!</h2>
      <p style="color:#fe68c4;font-weight:600;font-size:16px;margin:4px 0 0;">Pedido #${esc(String(data.display_id))}</p>
    </div>

    <p style="color:#555;font-size:15px;line-height:1.6;">
      Seu pagamento de <strong style="color:#fe68c4;">${formatBRL(data.total)}</strong> foi aprovado com sucesso!
    </p>

    <p style="color:#555;font-size:15px;line-height:1.6;">
      Agora vamos preparar seu pedido com todo carinho. Quando enviarmos, você receberá outro e-mail com o código de rastreamento.
    </p>

    <div style="background:#e8fce8;border-radius:12px;padding:16px;text-align:center;margin:20px 0;">
      <p style="margin:0;color:#2a7a2a;font-weight:600;">✓ Pagamento aprovado via ${esc(data.payment_method || "Pix")}</p>
    </div>

    ${ctaBtn("Acompanhar pedido", "https://homolog.papelariabibelo.com.br/conta/pedidos")}
  `;

  try {
    await sendEmail({
      to: data.email,
      subject: `Pagamento aprovado — Pedido #${data.display_id}`,
      html: wrapper(content, data.email),
      tags: [
        { name: "type", value: "payment-approved" },
        { name: "order_id", value: String(data.display_id) },
      ],
    });
    logger.info(`Email pagamento aprovado pedido #${data.display_id} enviado para ${data.email}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error(`Erro email pagamento pedido #${data.display_id}: ${msg}`);
  }
}

// ── 3. Email de envio com rastreio ───────────────────────────────

export async function sendShippingEmail(data: {
  email: string;
  display_id: string | number;
  tracking_code: string;
  carrier?: string;
  tracking_url?: string;
}): Promise<void> {
  if (!isEmailConfigured() || !data.email) return;

  const trackingUrl = data.tracking_url
    || `https://www.linkcorreios.com.br/?id=${encodeURIComponent(data.tracking_code)}`;

  const content = `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:60px;height:60px;background:#e8f0fe;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:28px;">📦</span>
      </div>
      <h2 style="color:#2d2d2d;margin:0;font-size:22px;">Seu pedido foi enviado!</h2>
      <p style="color:#fe68c4;font-weight:600;font-size:16px;margin:4px 0 0;">Pedido #${esc(String(data.display_id))}</p>
    </div>

    <p style="color:#555;font-size:15px;line-height:1.6;">
      Oba! Seu pedido acabou de sair para entrega. Acompanhe pelo código de rastreamento abaixo.
    </p>

    <div style="background:#f0f4ff;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
      <p style="margin:0 0 4px;color:#888;font-size:12px;text-transform:uppercase;font-weight:600;">Código de rastreamento</p>
      <p style="margin:0;color:#2d2d2d;font-size:20px;font-weight:700;letter-spacing:2px;">${esc(data.tracking_code)}</p>
      <p style="margin:6px 0 0;color:#888;font-size:13px;">via ${esc(data.carrier || "Correios")}</p>
    </div>

    ${ctaBtn("Rastrear pedido", trackingUrl)}

    <p style="color:#888;font-size:13px;text-align:center;">
      O prazo de entrega começa a contar a partir da postagem. Acompanhe pelo site dos Correios ou pelo link acima.
    </p>
  `;

  try {
    await sendEmail({
      to: data.email,
      subject: `Pedido #${data.display_id} enviado — Rastreie aqui!`,
      html: wrapper(content, data.email),
      tags: [
        { name: "type", value: "shipping-tracking" },
        { name: "order_id", value: String(data.display_id) },
      ],
    });
    logger.info(`Email envio pedido #${data.display_id} (rastreio ${data.tracking_code}) enviado para ${data.email}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error(`Erro email envio pedido #${data.display_id}: ${msg}`);
  }
}
