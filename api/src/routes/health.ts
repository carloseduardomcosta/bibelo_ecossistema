import { Router } from "express";
import { db } from "../db";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "error" });
  }
});
