-- Backfill property_id on invoices/estimates/jobs where we can infer it.
-- Priority: existing job property → estimate property → client's first property.

UPDATE invoices i
SET property_id = src.prop_id,
    updated_at = now()
FROM (
  SELECT i2.id,
         COALESCE(
           j.property_id,
           e.property_id,
           (
             SELECT p.id
             FROM properties p
             WHERE p.client_id = i2.client_id
               AND p.account_id = i2.account_id
             ORDER BY p.created_at ASC
             LIMIT 1
           )
         ) AS prop_id
  FROM invoices i2
  LEFT JOIN jobs j ON j.id = i2.job_id
  LEFT JOIN estimates e ON e.id = i2.estimate_id
  WHERE i2.property_id IS NULL
) src
WHERE i.id = src.id
  AND src.prop_id IS NOT NULL;

UPDATE estimates e
SET property_id = src.prop_id,
    updated_at = now()
FROM (
  SELECT e2.id,
         COALESCE(
           j.property_id,
           (
             SELECT p.id
             FROM properties p
             WHERE p.client_id = e2.client_id
               AND p.account_id = e2.account_id
             ORDER BY p.created_at ASC
             LIMIT 1
           )
         ) AS prop_id
  FROM estimates e2
  LEFT JOIN jobs j ON j.id = e2.job_id
  WHERE e2.property_id IS NULL
) src
WHERE e.id = src.id
  AND src.prop_id IS NOT NULL;

UPDATE jobs j
SET property_id = src.prop_id,
    updated_at = now()
FROM (
  SELECT j2.id,
         (
           SELECT p.id
           FROM properties p
           WHERE p.client_id = j2.client_id
             AND p.account_id = j2.account_id
           ORDER BY p.created_at ASC
           LIMIT 1
         ) AS prop_id
  FROM jobs j2
  WHERE j2.property_id IS NULL
) src
WHERE j.id = src.id
  AND src.prop_id IS NOT NULL;