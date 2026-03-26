import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "express-async-errors";

import { logger } from "./utils/logger";
import { dbConnect } from "./db";
import { healthRouter } from "./routes/health";
import { authRouter }   from "./routes/auth";

const app  = express();
const PORT = Number(process.env.API_PORT) || 4000;

// ── Segurança
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin:      process.env.APP_URL || "http://localhost:3000",
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
app.use("/api/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message: { error: "Muitas tentativas de login" },
}));

// ── Body parser
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Rotas
app.use("/",        healthRouter);
app.use("/api/auth", authRouter);

// ── 404
app.use((_req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

// ── Error handler global
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Erro não tratado", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Erro interno do servidor" });
});

// ── Start
async function start(): Promise<void> {
  await dbConnect();
  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`BibelôCRM API rodando na porta ${PORT}`);
    logger.info(`Ambiente: ${process.env.NODE_ENV}`);
  });
}

start().catch((err) => {
  logger.error("Falha ao iniciar API", { error: err.message });
  process.exit(1);
});
