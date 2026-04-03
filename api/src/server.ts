import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "express-async-errors";

import { logger } from "./utils/logger";
import { dbConnect, db } from "./db";
import { healthRouter } from "./routes/health";
import { authRouter }   from "./routes/auth";
import { customersRouter } from "./routes/customers";
import { analyticsRouter } from "./routes/analytics";
import { campaignsRouter }  from "./routes/campaigns";
import { templatesRouter }  from "./routes/templates";
import { syncRouter }       from "./routes/sync";
import { productsRouter }   from "./routes/products";
import { financeiroRouter } from "./routes/financeiro";
import { nfEntradaRouter }  from "./routes/nf-entrada";
import { contasPagarRouter } from "./routes/contas-pagar";
import { searchRouter }     from "./routes/search";
import { dealsRouter }      from "./routes/deals";
import { flowsRouter }      from "./routes/flows";
import { leadsRouter }      from "./routes/leads";
import { leadsScriptRouter } from "./routes/leads-script";
import { trackingRouter }    from "./routes/tracking";
import { trackingScriptRouter } from "./routes/tracking-script";
import { emailRouter }           from "./routes/email";
import { linksRouter }           from "./routes/links";
import { reviewsWidgetRouter }   from "./routes/reviews-widget";
import { briefingRouter }        from "./routes/briefing";
import { ordersRouter }          from "./routes/orders";
import { imagesRouter, imagesPublicRouter } from "./routes/images";
import { nuvemshopWebhookRouter } from "./integrations/nuvemshop/webhook";
import { blingWebhookRouter }     from "./integrations/bling/webhook";
import { resendWebhookRouter }   from "./integrations/resend/webhook";
import { sesWebhookRouter }      from "./integrations/ses/webhook";
import { emailConsumptionRouter } from "./routes/email-consumption";
import { registerScheduledJobs, closeSyncQueue } from "./queues/sync.queue";
import { registerFlowJobs, closeFlowQueue }      from "./queues/flow.queue";

const app  = express();
const PORT = Number(process.env.API_PORT) || 4000;

// ── Segurança
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin: [
    process.env.APP_URL || "http://localhost:3000",
    "https://www.papelariabibelo.com.br",
    "https://papelariabibelo.com.br",
  ],
  credentials: true,
}));

// ── Rate limit global
app.use(rateLimit({
  windowMs: 60 * 1000,
  max:      120,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Muitas requisições — tente novamente em 1 minuto" },
}));

// ── Rate limit no login
app.use("/api/auth/google", rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message: { error: "Muitas tentativas de login" },
}));

// ── Body parser
app.use(express.json({ limit: "1mb", verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; } }));
app.use(express.text({ type: "text/plain", limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Rotas
app.use("/",        healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/search", searchRouter);
app.use("/api/deals", dealsRouter);
app.use("/api/flows", flowsRouter);
app.use("/api/customers", customersRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/products", productsRouter);
app.use("/api/financeiro", financeiroRouter);
app.use("/api/contas-pagar", contasPagarRouter);
app.use("/api/financeiro/nf-entrada", nfEntradaRouter);
app.use("/api/briefing", briefingRouter);
app.use("/api/sync", syncRouter);
app.use("/api",      syncRouter);  // /api/auth/bling e /api/auth/bling/callback
app.use("/api/leads", leadsRouter);
app.use("/api/leads", leadsScriptRouter);
app.use("/api/tracking", trackingRouter);
app.use("/api/tracking", trackingScriptRouter);
app.use("/api/links", linksRouter);   // página de links + redirect com tracking
app.use("/api/reviews", reviewsWidgetRouter); // widget reviews público + script JS
app.use("/api/email", emailRouter);  // público: descadastro 1-click (LGPD)
app.use("/api/orders", ordersRouter);
app.use("/api/images", imagesPublicRouter); // serve imagens sem auth (antes do auth router)
app.use("/api/images", imagesRouter);
app.use("/api/webhooks/nuvemshop", nuvemshopWebhookRouter);
app.use("/api/webhooks/bling", blingWebhookRouter);
app.use("/api/webhooks/resend", resendWebhookRouter);
app.use("/api/webhooks/ses", sesWebhookRouter);
app.use("/api/email-consumption", emailConsumptionRouter);

// ── 404
app.use((_req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

// ── Error handler global
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Erro não tratado", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Erro interno do servidor" });
});

// ── Export para testes (supertest)
export { app };

// ── Start (não executa durante testes)
async function start(): Promise<void> {
  await dbConnect();
  await registerScheduledJobs();
  await registerFlowJobs();
  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info(`BibelôCRM API rodando na porta ${PORT}`);
    logger.info(`Ambiente: ${process.env.NODE_ENV}`);
  });

  // ── Graceful shutdown ───────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`Recebido ${signal} — iniciando shutdown graceful...`);
    server.close(() => {
      logger.info("Servidor HTTP encerrado");
    });
    try {
      await Promise.all([closeSyncQueue(), closeFlowQueue()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      logger.error("Erro ao encerrar filas", { error: msg });
    }
    try {
      await db.end();
      logger.info("Pool PostgreSQL encerrado");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      logger.error("Erro ao encerrar pool PostgreSQL", { error: msg });
    }
    logger.info("Shutdown graceful concluído");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";

if (!isTest) {
  start().catch((err) => {
    logger.error("Falha ao iniciar API", { error: err.message });
    process.exit(1);
  });
}
