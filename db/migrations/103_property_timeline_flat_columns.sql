-- 103_property_timeline_flat_columns.sql
--
-- Enhances property_timeline_v with flat columns for direct page consumption.
-- New columns are appended after all existing columns (required by CREATE OR REPLACE VIEW).
--
-- Existing columns (unchanged):
--   account_id, property_id, event_type, entity_id, occurred_at, summary, metadata
--
-- NEW flat columns (appended, additive):
--   link_id     text   entity id for navigable types (visit/estimate/invoice); NULL otherwise
--   detail      text   flat status/category/source — was previously extracted from jsonb at query time
--   total_cents int    financial amount; NULL for non-financial types
--
-- NEW event type added:
--   membership  from maintenance_plans (was in page inline UNION but missing from view)
--
-- Estimate label improved:
--   Was: 'Estimate' (hardcoded)
--   Now: COALESCE(j.title, 'Estimate') — shows job title when available
--
-- Existing consumers (API route, portal page) select:
--   entity_id, occurred_at, summary, metadata — all unchanged, additive only.

CREATE OR REPLACE VIEW property_timeline_v AS

  -- Visits
  SELECT
    v.account_id,
    j.property_id,
    'visit'::text                               AS event_type,
    v.id                                        AS entity_id,
    COALESCE(v.completed_at, v.scheduled_start) AS occurred_at,
    COALESCE(j.title, 'Untitled visit')         AS summary,
    jsonb_build_object(
      'visit_type',  v.visit_type,
      'status',      v.status,
      'tech_notes',  v.tech_notes,
      'job_id',      j.id,
      'job_status',  j.status,
      'plan_id',     v.maintenance_plan_id
    )                                           AS metadata,
    -- flat columns (new)
    v.id::text                                  AS link_id,
    v.status                                    AS detail,
    NULL::int                                   AS total_cents
  FROM visits v
  JOIN jobs j ON j.id = v.job_id
  WHERE j.property_id IS NOT NULL

UNION ALL

  -- Estimates (not draft) — label uses job title when available
  SELECT
    e.account_id,
    e.property_id,
    'estimate'::text,
    e.id,
    COALESCE(e.sent_at, e.created_at),
    COALESCE(j.title, 'Estimate'),
    jsonb_build_object(
      'status',        e.status,
      'total_cents',   e.total_cents,
      'vault_item_id', e.vault_item_id
    ),
    e.id::text,
    e.status,
    e.total_cents
  FROM estimates e
  LEFT JOIN jobs j ON j.id = e.job_id
  WHERE e.property_id IS NOT NULL
    AND e.status <> 'draft'

UNION ALL

  -- Invoices (not draft)
  SELECT
    i.account_id,
    i.property_id,
    'invoice'::text,
    i.id,
    COALESCE(i.sent_at, i.created_at),
    'Invoice ' || i.invoice_number,
    jsonb_build_object(
      'status',      i.status,
      'total_cents', i.total_cents,
      'paid_cents',  i.paid_cents
    ),
    i.id::text,
    i.status,
    i.total_cents
  FROM invoices i
  WHERE i.property_id IS NOT NULL
    AND i.status <> 'draft'

UNION ALL

  -- Vault items
  SELECT
    pvi.account_id,
    pvi.property_id,
    'vault_item'::text,
    pvi.id,
    pvi.created_at,
    pvi.name,
    jsonb_build_object(
      'category',      pvi.category,
      'manufacturer',  pvi.manufacturer,
      'model_number',  pvi.model_number,
      'install_date',  pvi.install_date,
      'last_serviced', pvi.last_serviced_date
    ),
    NULL::text,
    pvi.category::text,
    NULL::int
  FROM property_vault_items pvi

UNION ALL

  -- Vault item photos
  SELECT
    pvi.account_id,
    pvi.property_id,
    'photo'::text,
    pvim.id,
    pvim.created_at,
    pvim.photo_role || ' — ' || pvi.name,
    jsonb_build_object(
      'photo_role',      pvim.photo_role,
      'vault_item_id',   pvim.vault_item_id,
      'vault_item_name', pvi.name,
      'visit_id',        pvim.visit_id,
      'paired_media_id', pvim.paired_media_id,
      'filename',        pvim.filename
    ),
    NULL::text,
    pvim.photo_role,
    NULL::int
  FROM property_vault_item_media pvim
  JOIN property_vault_items pvi ON pvi.id = pvim.vault_item_id

UNION ALL

  -- Recurring issues (anchored at first_noted_at)
  SELECT
    pi.account_id,
    pi.property_id,
    'issue'::text,
    pi.id,
    pi.first_noted_at,
    pi.title,
    jsonb_build_object(
      'status',      pi.status,
      'severity',    pi.severity,
      'area',        pi.area,
      'occurrences', pi.occurrence_count
    ),
    NULL::text,
    pi.status::text,
    NULL::int
  FROM property_issues pi

UNION ALL

  -- Property notes
  SELECT
    pn.account_id,
    pn.property_id,
    'note'::text,
    pn.id,
    pn.created_at,
    LEFT(pn.body, 120),
    jsonb_build_object(
      'source',   pn.source,
      'pinned',   pn.pinned,
      'visit_id', pn.visit_id
    ),
    NULL::text,
    pn.source,
    NULL::int
  FROM property_notes pn

UNION ALL

  -- Maintenance plans / memberships (new arm — was in inline UNION, missing from view)
  SELECT
    mp.account_id,
    mp.property_id,
    'membership'::text,
    mp.id,
    mp.created_at,
    mp.name,
    jsonb_build_object(
      'status', mp.status
    ),
    mp.id::text,
    mp.status,
    NULL::int
  FROM maintenance_plans mp
  WHERE mp.property_id IS NOT NULL;
