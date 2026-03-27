-- Migration 003: Expande ultimo_id para TEXT (tokens OAuth são maiores que 100 chars)
ALTER TABLE sync.sync_state ALTER COLUMN ultimo_id TYPE TEXT;
