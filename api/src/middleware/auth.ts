import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { queryOne } from "../db";

const JWT_SECRET: string = process.env.JWT_SECRET || "";
if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is required");

export interface AuthPayload {
  userId: string;
  email:  string;
  papel:  string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token não fornecido" });
    return;
  }

  const token = header.substring(7);
  let payload: AuthPayload & { iss?: string; sub?: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as AuthPayload & { iss?: string; sub?: string };
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado" });
    return;
  }

  // Tokens do portal Sou Parceira (iss: 'souparceira') não têm acesso ao CRM
  if (payload.iss === "souparceira") {
    res.status(401).json({ error: "Token inválido ou expirado" });
    return;
  }

  // userId pode estar em 'sub' (tokens novos) ou 'userId' (tokens legados)
  const userId = payload.sub || payload.userId;
  if (!userId) {
    res.status(401).json({ error: "Token inválido ou expirado" });
    return;
  }

  // Verificar que o userId existe e está ativo no banco — previne tokens forjados com UUID inexistente
  queryOne<{ id: string; papel: string }>(
    "SELECT id, papel FROM public.users WHERE id = $1 AND ativo = true",
    [userId]
  ).then(user => {
    if (!user) {
      res.status(401).json({ error: "Token inválido ou expirado" });
      return;
    }
    // Usar papel do banco (fonte da verdade), não do JWT
    req.user = { userId: user.id, email: payload.email || "", papel: user.papel };
    next();
  }).catch(() => {
    res.status(401).json({ error: "Token inválido ou expirado" });
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.papel !== "admin") {
    res.status(403).json({ error: "Acesso restrito a administradores" });
    return;
  }
  next();
}
