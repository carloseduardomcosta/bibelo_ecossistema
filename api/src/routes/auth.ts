import { Router, Request, Response } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { queryOne, query } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

export const authRouter = Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleSchema = z.object({
  credential: z.string().min(1),
});

// ── Login via Google OAuth
authRouter.post("/google", async (req: Request, res: Response) => {
  const parse = googleSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Token Google não fornecido" });
    return;
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: parse.data.credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    res.status(401).json({ error: "Token Google inválido" });
    return;
  }

  const { sub: googleId, email, name, picture } = payload;

  // Upsert: busca por google_id ou email, cria se não existe
  let user = await queryOne<{
    id: string; nome: string; email: string; papel: string; ativo: boolean;
  }>(
    "SELECT id, nome, email, papel, ativo FROM public.users WHERE google_id = $1 OR email = $2",
    [googleId, email]
  );

  if (user && !user.ativo) {
    res.status(403).json({ error: "Conta desativada. Contate o administrador." });
    return;
  }

  if (!user) {
    // Primeiro login — cria conta como viewer inativo (admin ativa manualmente)
    // Exceção: email do dono do projeto é auto-aprovado como admin
    const isOwner = email === "carloseduardocostatj@gmail.com";
    const papel = isOwner ? "admin" : "viewer";
    const ativo = isOwner;

    user = await queryOne<{
      id: string; nome: string; email: string; papel: string; ativo: boolean;
    }>(
      `INSERT INTO public.users (nome, email, google_id, avatar_url, papel, ativo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nome, email, papel, ativo`,
      [name || email.split("@")[0], email, googleId, picture || null, papel, ativo]
    );

    if (!ativo) {
      logger.warn("Novo usuário aguardando aprovação", { email, googleId });
      res.status(403).json({ error: "Conta criada, mas aguarda aprovação do administrador." });
      return;
    }
  } else {
    // Atualiza google_id e avatar se ainda não tinha
    await query(
      `UPDATE public.users
       SET google_id = COALESCE(google_id, $1),
           avatar_url = COALESCE($2, avatar_url),
           nome = COALESCE($3, nome),
           ultimo_acesso = NOW()
       WHERE id = $4`,
      [googleId, picture || null, name, user.id]
    );
  }

  const secret = process.env.JWT_SECRET as string;
  const jwtPayload = { userId: user!.id, email: user!.email, papel: user!.papel };

  const accessOptions: SignOptions  = { expiresIn: "8h" };
  const refreshOptions: SignOptions = { expiresIn: "30d" };

  const accessToken  = jwt.sign(jwtPayload, secret, accessOptions);
  const refreshToken = jwt.sign(jwtPayload, secret, refreshOptions);

  await query(
    `INSERT INTO public.sessions (user_id, refresh_token, ip, expira_em)
     VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`,
    [user!.id, refreshToken, req.ip]
  );

  logger.info("Login Google realizado", { email, userId: user!.id });

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user!.id,
      nome: user!.nome || name,
      email: user!.email,
      papel: user!.papel,
    },
  });
});

// ── Perfil do usuário logado
authRouter.get("/me", authMiddleware, async (req: Request, res: Response) => {
  const user = await queryOne(
    "SELECT id, nome, email, papel, avatar_url, criado_em FROM public.users WHERE id = $1",
    [req.user!.userId]
  );
  res.json(user);
});

// ── Logout
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
