-- Expand job_type to support specific trade categories.
-- Existing values are preserved; 'repair' stays as a legacy general fallback.

ALTER TABLE jobs DROP CONSTRAINT jobs_job_type_check;

ALTER TABLE jobs ADD CONSTRAINT jobs_job_type_check CHECK (job_type = ANY (ARRAY[
  'maintenance'::text,
  'painting'::text,
  'repair'::text,
  'custom'::text,
  'plumbing'::text,
  'electrical'::text,
  'hvac'::text,
  'carpentry'::text,
  'roofing'::text,
  'flooring'::text,
  'windows_doors'::text,
  'appliances'::text,
  'drywall'::text,
  'landscaping'::text
]));
