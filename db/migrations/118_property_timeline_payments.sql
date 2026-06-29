-- Migration 118: surface payments on the property timeline (EPIC-004 / TASK-034)
--
-- Adds a `payment` arm to property_timeline_v so the Daily Operations Log /
-- property history shows "Payment received — $X — <method>". Additive: same
-- leading column list/types as migration 103; only a new UNION arm is appended.
-- Restates the full view because CREATE OR REPLACE VIEW cannot add an arm in
-- isolation.

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
    v.id::text                                  AS link_id,
    v.status                                    AS detail,
    NULL::int                                   AS total_cents
  FROM visits v
  JOIN jobs j ON j.id = v.job_id
  WHERE j.property_id IS NOT NULL

UNION ALL

  -- Estimates (not draft)
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

  -- Payments (completed) — links to the parent invoice for navigation
  SELECT
    p.account_id,
    i.property_id,
    'payment'::text,
    p.id,
    COALESCE(p.paid_at, p.received_at),
    'Payment received — ' || p.method,
    jsonb_build_object(
      'method',       p.method,
      'payment_type', p.payment_type,
      'status',       p.status,
      'amount_cents', p.amount_cents,
      'invoice_id',   p.invoice_id
    ),
    p.invoice_id::text,
    p.method,
    p.amount_cents
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
  WHERE i.property_id IS NOT NULL
    AND p.status = 'paid'

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

  -- Recurring issues
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

  -- Maintenance plans / memberships
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

-- Rollback: re-run migration 103 to drop the payment arm.
