import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { query, queryOne } from "../db";
import { triggerFlow, executeStep, processReadySteps } from "../services/flow.service";
import { getNuvemShopToken, nsRequest } from "../integrations/nuvemshop/auth";

// ── Helpers ──────────────────────────────────────────────────────

const PREFIX = "vitest-cond-";
const createdCustomerIds: string[] = [];
const createdFlowIds: string[] = [];

async function criarCliente(nome: string, email: string): Promise<string> {
  const c = await queryOne<{ id: string }>(
    `INSERT INTO crm.customers (nome, email, email_optout) VALUES ($1, $2, false) RETURNING id`,
    [nome, email],
  );
  createdCustomerIds.push(c!.id);
  return c!.id;
}

// Avança todos os steps pendentes forçando proximo_step_em para o passado
async function avancarTempo(executionId?: string): Promise<void> {
  const where = executionId
    ? `WHERE id = '${executionId}'`
    : `WHERE status = 'ativo' AND id IN (SELECT fe.id FROM marketing.flow_executions fe JOIN marketing.flows f ON f.id = fe.flow_id WHERE f.nome LIKE '${PREFIX}%')`;
  await query(`UPDATE marketing.flow_executions SET proximo_step_em = NOW() - INTERVAL '1 minute' ${where}`);
  await processReadySteps();
}

// Simula abertura de email (insere evento em email_events)
async function simularEmailAberto(customerId: string, messageId: string): Promise<void> {
  await query(
    `INSERT INTO marketing.email_events (customer_id, message_id, tipo) VALUES ($1, $2, 'opened')`,
    [customerId, messageId],
  );
}

// Simula clique em email
async function simularEmailClicado(customerId: string, messageId: string, link?: string): Promise<void> {
  await query(
    `INSERT INTO marketing.email_events (customer_id, message_id, tipo, link) VALUES ($1, $2, 'clicked', $3)`,
    [customerId, messageId, link || "https://papelariabibelo.com.br"],
  );
}

// Simula visita ao site
async function simularVisitaSite(customerId: string): Promise<void> {
  await query(
    `INSERT INTO crm.tracking_events (visitor_id, customer_id, evento, pagina) VALUES ($1, $2, 'page_view', 'https://papelariabibelo.com.br')`,
    [`vitest-visitor-${customerId.slice(0, 8)}`, customerId],
  );
}

// Simula compra
async function simularCompra(customerId: string): Promise<void> {
  await query(
    `INSERT INTO sync.nuvemshop_orders (ns_id, customer_id, numero, valor, status, processado) VALUES ($1, $2, $3, 99.90, 'paid', true)`,
    [`vitest-order-${Date.now()}`, customerId, `VITEST-${Date.now()}`],
  );
}

// Busca a execução ativa de um fluxo para um cliente
async function getExecucao(flowId: string, customerId: string) {
  return queryOne<{
    id: string; step_atual: number; status: string;
  }>(
    `SELECT id, step_atual, status FROM marketing.flow_executions WHERE flow_id = $1 AND customer_id = $2 ORDER BY iniciado_em DESC LIMIT 1`,
    [flowId, customerId],
  );
}

// Busca o execution_id do fluxo de teste (não dos reais)
async function getTestExecId(flowId: string, customerId: string): Promise<string> {
  const e = await getExecucao(flowId, customerId);
  return e!.id;
}

// Busca messageId do resultado de um step de email
async function getMessageId(executionId: string, stepIndex: number): Promise<string | null> {
  const step = await queryOne<{ resultado: Record<string, unknown> }>(
    `SELECT resultado FROM marketing.flow_step_executions WHERE execution_id = $1 AND step_index = $2`,
    [executionId, stepIndex],
  );
  return (step?.resultado?.messageId as string) || null;
}

// Busca todos os steps executados de uma execução
async function getStepsExecutados(executionId: string) {
  return query<{ step_index: number; tipo: string; status: string; resultado: Record<string, unknown> }>(
    `SELECT step_index, tipo, status, resultado FROM marketing.flow_step_executions WHERE execution_id = $1 ORDER BY step_index`,
    [executionId],
  );
}

// ── Cleanup ─────────────────────────────────────────────────────

afterAll(async () => {
  // Limpar cupons BIB-* criados na NuvemShop durante os testes
  try {
    const token = await getNuvemShopToken();
    if (token) {
      const coupons = await nsRequest<Array<{ id: number; code: string }>>("get", "coupons?per_page=200", token);
      const testCoupons = (coupons || []).filter(c => /^BIB-VITEST/i.test(c.code));
      for (const c of testCoupons) {
        await nsRequest("delete", `coupons/${c.id}`, token);
      }
      if (testCoupons.length > 0) {
        console.log(`Cleanup: ${testCoupons.length} cupons de teste removidos da NuvemShop`);
      }
    }
  } catch {
    // NuvemShop indisponível nos testes — não falha o cleanup
  }

  for (const fid of createdFlowIds) {
    await query("DELETE FROM marketing.flow_step_executions WHERE execution_id IN (SELECT id FROM marketing.flow_executions WHERE flow_id = $1)", [fid]);
    await query("DELETE FROM marketing.flow_executions WHERE flow_id = $1", [fid]);
    await query("DELETE FROM marketing.flows WHERE id = $1", [fid]);
  }
  for (const cid of createdCustomerIds) {
    await query("DELETE FROM marketing.email_events WHERE customer_id = $1", [cid]);
    await query("DELETE FROM crm.tracking_events WHERE customer_id = $1", [cid]);
    await query("DELETE FROM sync.nuvemshop_orders WHERE customer_id = $1", [cid]);
    await query("DELETE FROM crm.interactions WHERE customer_id = $1", [cid]);
    await query("DELETE FROM crm.customers WHERE id = $1", [cid]);
  }
});

// ── Testes: Carrinho Abandonado Inteligente ─────────────────────

describe("Carrinho abandonado — branching condicional", () => {
  let flowId: string;

  beforeAll(async () => {
    // Criar fluxo de teste (réplica do "Carrinho abandonado inteligente")
    const flow = await queryOne<{ id: string }>(
      `INSERT INTO marketing.flows (nome, gatilho, steps, ativo) VALUES ($1, 'order.abandoned',
        '[
          {"tipo":"email","template":"Carrinho abandonado","delay_horas":0},
          {"tipo":"wait","delay_horas":0},
          {"tipo":"condicao","delay_horas":0,"condicao":"email_aberto","ref_step":0,"sim":3,"nao":7},
          {"tipo":"condicao","delay_horas":0,"condicao":"email_clicado","ref_step":0,"sim":4,"nao":6},
          {"tipo":"condicao","delay_horas":0,"condicao":"comprou","sim":-1,"nao":5},
          {"tipo":"email","template":"Última chance","delay_horas":0,"proximo":8},
          {"tipo":"email","template":"Carrinho abandonado","delay_horas":0,"proximo":8},
          {"tipo":"email","template":"Carrinho reenvio","delay_horas":0},
          {"tipo":"wait","delay_horas":0},
          {"tipo":"condicao","delay_horas":0,"condicao":"comprou","sim":-1,"nao":10},
          {"tipo":"condicao","delay_horas":0,"condicao":"email_aberto","ref_step":0,"sim":11,"nao":-1},
          {"tipo":"email","template":"Cupom recuperação carrinho","delay_horas":0}
        ]'::jsonb,
        true) RETURNING id`,
      [`${PREFIX}carrinho`],
    );
    flowId = flow!.id;
    createdFlowIds.push(flowId);
  });

  it("Caminho 1: abriu → clicou → comprou → FIM", async () => {
    const cid = await criarCliente(`${PREFIX}c1`, `${PREFIX}c1@test.com`);
    await triggerFlow("order.abandoned", cid);
    const execId = await getTestExecId(flowId, cid);

    // Step 0: email enviado
    await avancarTempo(execId);

    // Simular abertura + clique
    const msgId = await getMessageId(execId, 0);
    if (msgId) {
      await simularEmailAberto(cid, msgId);
      await simularEmailClicado(cid, msgId);
    }
    await simularCompra(cid);

    for (let i = 0; i < 6; i++) await avancarTempo(execId);

    const final = await getExecucao(flowId, cid);
    expect(final!.status).toBe("concluido");
  });

  it("Caminho 2: abriu → clicou → NÃO comprou → escassez", async () => {
    const cid = await criarCliente(`${PREFIX}c2`, `${PREFIX}c2@test.com`);
    await triggerFlow("order.abandoned", cid);
    const execId = await getTestExecId(flowId, cid);

    await avancarTempo(execId);

    const msgId = await getMessageId(execId, 0);
    if (msgId) {
      await simularEmailAberto(cid, msgId);
      await simularEmailClicado(cid, msgId);
    }

    for (let i = 0; i < 6; i++) await avancarTempo(execId);

    const steps = await getStepsExecutados(execId);
    const stepIndices = steps.map((s) => s.step_index);
    expect(stepIndices).toContain(5); // email escassez
    expect(stepIndices).not.toContain(7); // NÃO reenvio
  });

  it("Caminho 3: NÃO abriu → reenvio assunto diferente", async () => {
    const cid = await criarCliente(`${PREFIX}c3`, `${PREFIX}c3@test.com`);
    await triggerFlow("order.abandoned", cid);
    const execId = await getTestExecId(flowId, cid);

    await avancarTempo(execId);

    for (let i = 0; i < 5; i++) await avancarTempo(execId);

    const steps = await getStepsExecutados(execId);
    const stepIndices = steps.map((s) => s.step_index);
    expect(stepIndices).toContain(7); // reenvio
    expect(stepIndices).not.toContain(5); // NÃO escassez
    expect(stepIndices).not.toContain(6); // NÃO destaque
  });

  it("Caminho 4: engajou mas não comprou → cupom 5% no final", async () => {
    const cid = await criarCliente(`${PREFIX}c4`, `${PREFIX}c4@test.com`);
    await triggerFlow("order.abandoned", cid);
    const execId = await getTestExecId(flowId, cid);

    await avancarTempo(execId);

    const msgId = await getMessageId(execId, 0);
    if (msgId) await simularEmailAberto(cid, msgId);

    for (let i = 0; i < 10; i++) await avancarTempo(execId);

    const steps = await getStepsExecutados(execId);
    const stepIndices = steps.map((s) => s.step_index);
    expect(stepIndices).toContain(11); // cupom 5%
  });

  it("Caminho 5: não engajou nada → para sem cupom (economia cota)", async () => {
    const cid = await criarCliente(`${PREFIX}c5`, `${PREFIX}c5@test.com`);
    await triggerFlow("order.abandoned", cid);
    const execId = await getTestExecId(flowId, cid);

    await avancarTempo(execId);
    for (let i = 0; i < 10; i++) await avancarTempo(execId);

    const final = await getExecucao(flowId, cid);
    expect(final!.status).toBe("concluido");

    const steps = await getStepsExecutados(execId);
    const stepIndices = steps.map((s) => s.step_index);
    expect(stepIndices).not.toContain(11); // NÃO cupom
  });
});

// ── Testes: Nutrição de Lead Inteligente ────────────────────────

describe("Nutrição de lead — branching condicional", () => {
  let flowId: string;

  beforeAll(async () => {
    const flow = await queryOne<{ id: string }>(
      `INSERT INTO marketing.flows (nome, gatilho, steps, ativo) VALUES ($1, 'lead.captured',
        '[
          {"tipo":"wait","delay_horas":0},
          {"tipo":"condicao","delay_horas":0,"condicao":"visitou_site","sim":2,"nao":3},
          {"tipo":"email","template":"Novidades da Semana","delay_horas":0,"proximo":4},
          {"tipo":"email","template":"Lead FOMO grupo VIP","delay_horas":0},
          {"tipo":"wait","delay_horas":0},
          {"tipo":"condicao","delay_horas":0,"condicao":"viu_produto","sim":6,"nao":7},
          {"tipo":"email","template":"Produto visitado","delay_horas":0,"proximo":8},
          {"tipo":"email","template":"Lead convite VIP","delay_horas":0},
          {"tipo":"wait","delay_horas":0},
          {"tipo":"condicao","delay_horas":0,"condicao":"comprou","sim":-1,"nao":10},
          {"tipo":"condicao","delay_horas":0,"condicao":"visitou_site","sim":11,"nao":-1},
          {"tipo":"email","template":"Lead cupom exclusivo","delay_horas":0}
        ]'::jsonb,
        true) RETURNING id`,
      [`${PREFIX}nutricao`],
    );
    flowId = flow!.id;
    createdFlowIds.push(flowId);
  });

  it("Visitou + viu produto + não comprou + engajou → cupom 10%", async () => {
    const cid = await criarCliente(`${PREFIX}n1`, `${PREFIX}n1@test.com`);

    await triggerFlow("lead.captured", cid);
    const execId = await getTestExecId(flowId, cid);

    // Step 0: wait — avançar
    await avancarTempo(execId);

    // Simular visita e produto visto DEPOIS do trigger (condição verifica > flowStart)
    await simularVisitaSite(cid);
    await query(
      `INSERT INTO crm.tracking_events (visitor_id, customer_id, evento, resource_nome) VALUES ($1, $2, 'product_view', 'Caneta Pompom')`,
      [`vitest-visitor-${cid.slice(0, 8)}`, cid],
    );

    for (let i = 0; i < 12; i++) await avancarTempo(execId);

    const steps = await getStepsExecutados(execId);
    const stepIndices = steps.map((s) => s.step_index);

    expect(stepIndices).toContain(2); // Novidades (visitou)
    expect(stepIndices).not.toContain(3); // NÃO FOMO (pq visitou)
    expect(stepIndices).toContain(6); // Produto visitado
    expect(stepIndices).not.toContain(7); // NÃO convite VIP (pq viu produto)
    expect(stepIndices).toContain(11); // Cupom 10%
  });

  it("NÃO visitou + NÃO viu produto → FOMO + convite VIP", async () => {
    const cid = await criarCliente(`${PREFIX}n2`, `${PREFIX}n2@test.com`);
    // Sem visitar, sem ver produto
    await triggerFlow("lead.captured", cid);
    const execId = await getTestExecId(flowId, cid);

    for (let i = 0; i < 12; i++) await avancarTempo(execId);

    const steps = await getStepsExecutados(execId);
    const stepIndices = steps.map((s) => s.step_index);

    expect(stepIndices).not.toContain(2); // NÃO novidades
    expect(stepIndices).toContain(3); // FOMO (não visitou)
    expect(stepIndices).not.toContain(6); // NÃO produto visitado
    expect(stepIndices).toContain(7); // Convite VIP (não viu produto)
  });

  it("Comprou durante nutrição → FIM (sem cupom)", async () => {
    const cid = await criarCliente(`${PREFIX}n3`, `${PREFIX}n3@test.com`);
    await simularVisitaSite(cid);

    await triggerFlow("lead.captured", cid);
    const execId = await getTestExecId(flowId, cid);

    // Avançar até step 4 (wait antes da condição comprou)
    for (let i = 0; i < 6; i++) await avancarTempo(execId);

    // Simular compra
    await simularCompra(cid);

    // Avançar restante
    for (let i = 0; i < 6; i++) await avancarTempo(execId);

    const final = await getExecucao(flowId, cid);
    expect(final!.status).toBe("concluido");

    const steps = await getStepsExecutados(execId);
    const stepIndices = steps.map((s) => s.step_index);
    expect(stepIndices).not.toContain(11); // NÃO cupom (comprou)
  });
});

// ── Testes: Reativação Inteligente ──────────────────────────────

describe("Reativação — branching condicional", () => {
  let flowId: string;

  beforeAll(async () => {
    const flow = await queryOne<{ id: string }>(
      `INSERT INTO marketing.flows (nome, gatilho, steps, ativo) VALUES ($1, 'customer.inactive',
        '[
          {"tipo":"email","template":"Reativação","delay_horas":0},
          {"tipo":"wait","delay_horas":0},
          {"tipo":"condicao","delay_horas":0,"condicao":"comprou","sim":-1,"nao":3},
          {"tipo":"condicao","delay_horas":0,"condicao":"email_aberto","ref_step":0,"sim":4,"nao":5},
          {"tipo":"email","template":"Novidades da Semana","delay_horas":0,"proximo":6},
          {"tipo":"email","template":"Sentimos sua falta","delay_horas":0},
          {"tipo":"wait","delay_horas":0},
          {"tipo":"condicao","delay_horas":0,"condicao":"comprou","sim":-1,"nao":8},
          {"tipo":"condicao","delay_horas":0,"condicao":"visitou_site","sim":9,"nao":-1},
          {"tipo":"email","template":"Reativação cupom","delay_horas":0}
        ]'::jsonb,
        true) RETURNING id`,
      [`${PREFIX}reativacao`],
    );
    flowId = flow!.id;
    createdFlowIds.push(flowId);
  });

  it("Abriu email + visitou site + não comprou → cupom 10%", async () => {
    const cid = await criarCliente(`${PREFIX}r1`, `${PREFIX}r1@test.com`);
    await triggerFlow("customer.inactive", cid);
    const execId = await getTestExecId(flowId, cid);
    // Remove execuções de fluxos reais que foram co-disparados (evita interferência de dedup 72h)
    await query(
      `DELETE FROM marketing.flow_step_executions WHERE execution_id IN (
         SELECT id FROM marketing.flow_executions WHERE customer_id = $1 AND flow_id != $2
       )`,
      [cid, flowId]
    );
    await query(
      "DELETE FROM marketing.flow_executions WHERE customer_id = $1 AND flow_id != $2",
      [cid, flowId]
    );

    await avancarTempo(execId);

    const msgId = await getMessageId(execId, 0);
    if (msgId) await simularEmailAberto(cid, msgId);
    await simularVisitaSite(cid);

    for (let i = 0; i < 8; i++) await avancarTempo(execId);

    const steps = await getStepsExecutados(execId);
    const stepIndices = steps.map((s) => s.step_index);
    expect(stepIndices).toContain(4); // Novidades (abriu)
    expect(stepIndices).not.toContain(5); // NÃO reenvio
    expect(stepIndices).toContain(9); // Cupom (visitou + não comprou)
  });

  it("Não abriu + não visitou → FIM sem cupom", async () => {
    const cid = await criarCliente(`${PREFIX}r2`, `${PREFIX}r2@test.com`);
    await triggerFlow("customer.inactive", cid);
    const execId = await getTestExecId(flowId, cid);
    await query(
      `DELETE FROM marketing.flow_step_executions WHERE execution_id IN (
         SELECT id FROM marketing.flow_executions WHERE customer_id = $1 AND flow_id != $2
       )`,
      [cid, flowId]
    );
    await query(
      "DELETE FROM marketing.flow_executions WHERE customer_id = $1 AND flow_id != $2",
      [cid, flowId]
    );

    await avancarTempo(execId);

    for (let i = 0; i < 8; i++) await avancarTempo(execId);

    const final = await getExecucao(flowId, cid);
    expect(final!.status).toBe("concluido");

    const steps = await getStepsExecutados(execId);
    const stepIndices = steps.map((s) => s.step_index);
    expect(stepIndices).toContain(5); // Reenvio (não abriu)
    expect(stepIndices).not.toContain(9); // NÃO cupom (não visitou)
  });

  it("Comprou após 1º email → FIM imediato", async () => {
    const cid = await criarCliente(`${PREFIX}r3`, `${PREFIX}r3@test.com`);
    await triggerFlow("customer.inactive", cid);
    const execId = await getTestExecId(flowId, cid);

    await avancarTempo(execId);
    await simularCompra(cid);

    for (let i = 0; i < 5; i++) await avancarTempo(execId);

    const final = await getExecucao(flowId, cid);
    expect(final!.status).toBe("concluido");

    const steps = await getStepsExecutados(execId);
    const stepIndices = steps.map((s) => s.step_index);
    expect(stepIndices).not.toContain(4); // NÃO novidades
    expect(stepIndices).not.toContain(9); // NÃO cupom
  });
});
