-- Migration 006: Add company and address fields to clients
-- Adds optional fields to capture richer client information

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS company_name  text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS city          text,
  ADD COLUMN IF NOT EXISTS state         text,
  ADD COLUMN IF NOT EXISTS zip           text;
