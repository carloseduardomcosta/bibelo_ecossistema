-- Migration 030: Índice funcional LOWER(email) em crm.customers
-- O índice idx_customers_email existente usa email exato (case-sensitive).
-- Todas as queries usam WHERE LOWER(c.email) = $1, que não usa o índice atual.
-- Este índice cobre buscas de cliente por email em todas as rotas críticas:
-- leads/capture, flow.service, customer.service, campaigns, etc.

CREATE INDEX IF NOT EXISTS idx_customers_email_lower
  ON crm.customers(LOWER(email));
