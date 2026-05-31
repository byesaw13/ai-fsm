-- Migration 099: Fix painting material pricing bugs
--
-- Bug 1: 'Stain-blocking primer (BIN or Zinsser)' had no condition_factor_key,
--   so it was added to EVERY painting job regardless of prep level.
--   BIN/shellac primer is only required for nicotine staining or smoke damage.
--   Minor patching just needs a spray spot-sealer — NOT full-wall BIN.
--   Fix: add condition_factor_key = 'nicotine_staining' to gate it correctly.
--
-- Bug 2: Sort order 2 was shared between the BIN primer and the dark-to-light primer.
--   The dark-to-light primer (already has condition_factor_key) is correct — no change.

UPDATE service_materials
SET condition_factor_key = 'nicotine_staining'
WHERE category = 'painting_finishes'
  AND material_name = 'Stain-blocking primer (BIN or Zinsser)'
  AND condition_factor_key IS NULL;

-- Confirm the dark-to-light primer is already gated (should already be correct):
-- SELECT material_name, condition_factor_key FROM service_materials
--   WHERE category='painting_finishes' AND material_name LIKE '%primer%';
