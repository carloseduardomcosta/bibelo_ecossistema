-- Migration 044: endereço completo na tabela crm.customers
-- Adiciona logradouro, numero, complemento, bairro

ALTER TABLE crm.customers
  ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255),
  ADD COLUMN IF NOT EXISTS numero     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS complemento VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bairro     VARCHAR(100);
