import { Router, Request, Response } from "express";
import crypto from "crypto";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";
import { sendEmail } from "../resend/email";

export const mpModulosWebhookRouter = Router();

const MP_TOKEN = process.env.MP_ACCESS_TOKEN!;
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET!;

// ── Validação de assinatura (mesmo padrão do Medusa) ────────────

function validarAssinatura(req: Request): boolean {
  const signature = req.headers["x-signature"] as string | undefined;
  const requestId = req.headers["x-request-id"] as string | undefined;
  if (!signature || !MP_WEBHOOK_SECRET) return false;

  const parts: Record<string, string> = {};
  signature.split(",").forEach(p => {
    const [k, v] = p.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  });

  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const dataId = (req.body as { data?: { id?: string } })?.data?.id ?? "";
  const manifest = `id:${dataId};request-id:${requestId ?? ""};ts:${ts};`;
  const expected = crypto.createHmac("sha256", MP_WEBHOOK_SECRET)
    .update(manifest).digest("hex");

  try {
    const expBuf = Buffer.from(expected);
    const recBuf = Buffer.from(v1);
    return expBuf.length === recBuf.length && crypto.timingSafeEqual(expBuf, recBuf);
  } catch {
    return false;
  }
}

// ── Consulta pagamento no MP ────────────────────────────────────

interface MPPayment {
  id: number;
  status: string;
  external_reference?: string;
  order?: { id: string };
}

async function fetchPayment(paymentId: string): Promise<MPPayment | null> {
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    });
    if (!res.ok) return null;
    return res.json() as Promise<MPPayment>;
  } catch {
    return null;
  }
}

// ── Ativar módulo após pagamento aprovado ───────────────────────

async function ativarModulo(
  revendedoraId: string,
  moduloId: string,
  plano: "mensal" | "anual",
  pagamentoId: string
): Promise<void> {
  const diasAcesso = plano === "anual" ? 365 : 30;
  const expira = new Date(Date.now() + diasAcesso * 24 * 60 * 60 * 1000);

  // Upsert — se ainda vigente, estende; se expirou, reinicia
  await query(`
    INSERT INTO crm.revendedora_modulos
      (revendedora_id, modulo_id, ativo_desde, expira_em, plano, status, ultimo_pagamento_em)
    VALUES ($1, $2, NOW(), $3, $4, 'ativo', NOW())
    ON CONFLICT (revendedora_id, modulo_id) DO UPDATE SET
      expira_em           = CASE
        WHEN crm.revendedora_modulos.expira_em > NOW()
        THEN crm.revendedora_modulos.expira_em + make_interval(days => $5)
        ELSE $3
      END,
      plano               = $4,
      status              = 'ativo',
      ultimo_pagamento_em = NOW()
  `, [revendedoraId, moduloId, expira, plano, diasAcesso]);

  await query(
    `UPDATE crm.modulo_pagamentos SET status = 'aprovado', atualizado_em = NOW() WHERE id = $1`,
    [pagamentoId]
  );

  // Email de confirmação para a revendedora
  const rev = await queryOne<{ nome: string; email: string }>(
    `SELECT r.nome, COALESCE(c.email, r.email) AS email
     FROM crm.revendedoras r LEFT JOIN crm.customers c ON c.id = r.customer_id
     WHERE r.id = $1`,
    [revendedoraId]
  );
  const mod = await queryOne<{ nome: string }>(
    `SELECT nome FROM crm.modulos WHERE id = $1`,
    [moduloId]
  );

  if (rev && mod) {
    sendEmail({
      to:      rev.email,
      subject: `✅ Módulo ${mod.nome} ativado — Bibelô Parceira`,
      html:    buildEmailAtivacao(rev.nome, mod.nome, plano, expira),
      tags:    [{ name: "tipo", value: "modulo_ativado" }],
    }).catch(err =>
      logger.error("Email ativação módulo", { error: (err as Error).message })
    );
  }
}

function buildEmailAtivacao(
  nome: string,
  modulo: string,
  plano: string,
  expira: Date
): string {
  const dataExpira = expira.toLocaleDateString("pt-BR");
  const labelPlano = plano === "anual" ? "Anual (12 meses)" : "Mensal";
  return `
<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
  <div style="background:#fe68c4;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
    <h1 style="color:#fff;margin:0;font-size:22px">✅ Módulo Ativado!</h1>
  </div>
  <p style="color:#444">Olá, <strong>${nome}</strong>!</p>
  <p style="color:#444">
    O módulo <strong>${modulo}</strong> (Plano ${labelPlano}) foi ativado com sucesso
    na sua conta Bibelô Parceira.
  </p>
  <p style="color:#444">Acesso válido até: <strong>${dataExpira}</strong></p>
  <div style="text-align:center;margin:28px 0">
    <a href="https://souparceira.papelariabibelo.com.br"
       style="background:#fe68c4;color:#fff;padding:14px 32px;border-radius:8px;
              text-decoration:none;font-weight:bold;font-size:15px">
      Acessar Portal Parceira
    </a>
  </div>
  <p style="color:#999;font-size:12px;text-align:center">
    Papelaria Bibelô — Timbó/SC
  </p>
</div>`;
}

// ── Handler principal ───────────────────────────────────────────

mpModulosWebhookRouter.post("/", async (req: Request, res: Response) => {
  if (!validarAssinatura(req)) {
    logger.warn("MP Módulos webhook: assinatura inválida");
    return res.status(401).json({ error: "Assinatura inválida" });
  }

  const body = req.body as {
    type?: string;
    action?: string;
    data?: { id?: string };
  };

  const type   = body.type;
  const dataId = body.data?.id;

  // Só processa notificações de pagamento
  if (type !== "payment" || !dataId) {
    return res.status(200).json({ ok: true });
  }

  try {
    const payment = await fetchPayment(dataId);
    if (!payment) {
      logger.warn("MP Módulos: pagamento não encontrado no MP", { paymentId: dataId });
      return res.status(200).json({ ok: true });
    }

    const extRef = payment.external_reference;
    if (!extRef?.startsWith("modulo:")) {
      return res.status(200).json({ ok: true }); // pagamento de outro fluxo
    }

    const pagRow = await queryOne<{
      id: string;
      revendedora_id: string;
      modulo_id: string;
      plano: string;
      status: string;
    }>(
      `SELECT id, revendedora_id, modulo_id, plano, status
       FROM crm.modulo_pagamentos WHERE external_reference = $1`,
      [extRef]
    );

    if (!pagRow) {
      logger.warn("MP Módulos: external_reference não encontrado no banco", { extRef });
      return res.status(200).json({ ok: true });
    }

    // Registrar mp_payment_id se ainda não temos
    if (!pagRow.status || pagRow.status === "pendente") {
      await query(
        `UPDATE crm.modulo_pagamentos SET mp_payment_id = $1, atualizado_em = NOW() WHERE id = $2`,
        [String(payment.id), pagRow.id]
      );
    }

    if (payment.status === "approved" && pagRow.status !== "aprovado") {
      await ativarModulo(
        pagRow.revendedora_id,
        pagRow.modulo_id,
        pagRow.plano as "mensal" | "anual",
        pagRow.id
      );
      logger.info("Módulo ativado via webhook MP", {
        extRef,
        moduloId: pagRow.modulo_id,
        revendedoraId: pagRow.revendedora_id,
        plano: pagRow.plano,
      });
    } else if (["rejected", "cancelled"].includes(payment.status) && pagRow.status === "pendente") {
      await query(
        `UPDATE crm.modulo_pagamentos SET status = $1, atualizado_em = NOW() WHERE id = $2`,
        [payment.status === "rejected" ? "rejeitado" : "cancelado", pagRow.id]
      );
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error("Erro no webhook MP módulos", { error: (err as Error).message });
    res.status(200).json({ ok: true }); // sempre 200 para MP não retentar
  }
});
