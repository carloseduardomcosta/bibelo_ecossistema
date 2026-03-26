import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { queryOne, query } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(6),
});

// POST /api/auth/login
authRouter.post("/login", async (req: Request, res: Response) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const { email, senha } = parse.data;

  const user = await queryOne<{
    id: string; nome: string; email: string;
    senha_hash: string; papel: string; ativo: boolean;
  }>(
    "SELECT id, nome, email, senha_hash, papel, ativo FROM public.users WHERE email = $1",
    [email]
  );

  if (!user || !user.ativo) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const senhaOk = await bcrypt.compare(senha, user.senha_hash);
  if (!senhaOk) {
    logger.warn("Tentativa de login falhou", { email, ip: req.ip });
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const payload = { userId: user.id, email: user.email, papel: user.papel };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  });

  // Salva refresh token
  await query(
    `INSERT INTO public.sessions (user_id, refresh_token, ip, expira_em)
     VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`,
    [user.id, refreshToken, req.ip]
  );

  await query(
    "UPDATE public.users SET ultimo_acesso = NOW() WHERE id = $1",
    [user.id]
  );

  logger.info("Login realizado", { email, userId: user.id });

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, nome: user.nome, email: user.email, papel: user.papel },
  });
});

// GET /api/auth/me
authRouter.get("/me", authMiddleware, async (req: Request, res: Response) => {
  const user = await queryOne(
    "SELECT id, nome, email, papel, criado_em FROM public.users WHERE id = $1",
    [req.user!.userId]
  );
  res.json(user);
});

// POST /api/auth/logout
authRouter.post("/logout", authMiddleware, async (req: Request, res: Response) => {
  const token = req.headers.authorization?.substring(7);
  if (token) {
    await query(
      "DELETE FROM public.sessions WHERE refresh_token = $1",
      [token]
    ).catch(() => {});
  }
  res.json({ message: "Logout realizado" });
});
