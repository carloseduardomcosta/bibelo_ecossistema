-- Migration 002: Google OAuth login
-- Torna senha_hash opcional (login via Google não tem senha)
-- Adiciona google_id e avatar_url

ALTER TABLE public.users
  ALTER COLUMN senha_hash DROP NOT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS google_id   VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar_url  VARCHAR(500);
