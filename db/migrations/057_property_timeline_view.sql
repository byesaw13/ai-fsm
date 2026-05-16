CREATE OR REPLACE VIEW property_timeline_v AS

  -- Completed visits
  SELECT
    v.account_id,
    j.property_id,
    'visit'::text                          AS event_type,
    v.id                                   AS entity_id,
    COALESCE(v.completed_at, v.scheduled_start) AS occurred_at,
    COALESCE(j.title, 'Untitled visit')    AS summary,
    jsonb_build_object(
      'visit_type',  v.visit_type,
      'status',      v.status,
      'tech_notes',  v.tech_notes,
      'job_id',      j.id,
      'job_status',  j.status,
      'plan_id',     v.maintenance_plan_id
    ) AS metadata
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
    'Estimate',
    jsonb_build_object(
      'status',        e.status,
      'total_cents',   e.total_cents,
      'vault_item_id', e.vault_item_id
    )
  FROM estimates e
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
    )
  FROM invoices i
  WHERE i.property_id IS NOT NULL
    AND i.status <> 'draft'

UNION ALL

  -- Equipment added to vault
  SELECT
    pvi.account_id,
    pvi.property_id,
    'equipment'::text,
    pvi.id,
    pvi.created_at,
    pvi.name,
    jsonb_build_object(
      'category',      pvi.category,
      'manufacturer',  pvi.manufacturer,
      'model_number',  pvi.model_number,
      'install_date',  pvi.install_date,
      'last_serviced', pvi.last_serviced_date
    )
  FROM property_vault_items pvi

UNION ALL

  -- Photos uploaded to vault
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
    )
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
    )
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
    )
  FROM property_notes pn;
