import fs from "fs";
import path from "path";
import { db } from "./index";
import { logger } from "../utils/logger";

async function runMigrations(): Promise<void> {
  const client = await db.connect();
  try {
    // Tabela de controle de migrations
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(255) UNIQUE NOT NULL,
        aplicado_em TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrationsDir = path.resolve(__dirname, "../../../db/migrations");
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        "SELECT id FROM public.migrations WHERE filename = $1",
        [file]
      );

      if (rows.length > 0) {
        logger.info(`Migration já aplicada: ${file}`);
        continue;
      }

      logger.info(`Aplicando migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.migrations (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
        logger.info(`✅ Migration aplicada: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    logger.info("Todas as migrations aplicadas com sucesso");
  } finally {
    client.release();
    await db.end();
  }
}

runMigrations().catch((err) => {
  logger.error("Erro nas migrations", { error: err.message });
  process.exit(1);
});
