/** Bound a human search string for ILIKE. Null when it is too short to search. */
export function searchLikePattern(raw: string): string | null {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return null;
  const escaped = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

export type PropertySearchHit = {
  kind: "property" | "invoice";
  id: string;
  title: string;
  detail: string;
  href: string;
};

export const PROPERTY_SEARCH_SQL = `
SELECT kind, id, title, detail, href FROM (
  SELECT 'property'::text AS kind,
         p.id::text AS id,
         COALESCE(NULLIF(c.name, ''), NULLIF(p.name, ''), 'House') AS title,
         p.address AS detail,
         '/app/properties/' || p.id::text AS href,
         CASE
           WHEN c.name ILIKE $2 ESCAPE '\\' THEN 1
           WHEN p.address ILIKE $2 ESCAPE '\\' THEN 2
           WHEN COALESCE(p.name, '') ILIKE $2 ESCAPE '\\' THEN 3
           ELSE 4
         END AS rank
  FROM properties p
  JOIN clients c ON c.id = p.client_id AND c.account_id = p.account_id
  WHERE p.account_id = $1
    AND (
      c.name ILIKE $2 ESCAPE '\\'
      OR COALESCE(p.name, '') ILIKE $2 ESCAPE '\\'
      OR p.address ILIKE $2 ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM jobs j
        JOIN visits v ON v.job_id = j.id AND v.account_id = j.account_id
        JOIN site_visit_assessments a ON a.visit_id = v.id AND a.account_id = j.account_id
        WHERE j.property_id = p.id
          AND j.account_id = p.account_id
          AND a.rooms::text ILIKE $2 ESCAPE '\\'
      )
    )
  UNION ALL
  SELECT 'invoice'::text,
         i.id::text,
         i.invoice_number,
         TRIM(BOTH ' ·' FROM CONCAT_WS(' · ', NULLIF(c.name, ''), NULLIF(p.address, ''))),
         '/app/invoices/' || i.id::text,
         0
  FROM invoices i
  LEFT JOIN clients c ON c.id = i.client_id AND c.account_id = i.account_id
  LEFT JOIN properties p ON p.id = i.property_id AND p.account_id = i.account_id
  WHERE i.account_id = $1
    AND i.invoice_number ILIKE $2 ESCAPE '\\'
) hits
ORDER BY rank, title
LIMIT 8`;
