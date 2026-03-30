import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.papel !== "admin") {
    res.status(403).json({ error: "Acesso restrito a administradores" });
    return;
  }
  next();
}
