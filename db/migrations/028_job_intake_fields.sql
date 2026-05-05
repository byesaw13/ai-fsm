-- 028_job_intake_fields.sql
-- Adds Dovetails job intake / acceptance filter fields to the jobs table.
-- All columns are nullable so existing jobs are unaffected.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS job_category        text
    CHECK (job_category IN ('membership', 'realtor_baseline', 'high_margin_project', 'reactive_low_quality')),

  ADD COLUMN IF NOT EXISTS strategy_fit        smallint CHECK (strategy_fit BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS scope_clarity       smallint CHECK (scope_clarity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS margin_confidence   smallint CHECK (margin_confidence BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS schedule_impact     smallint CHECK (schedule_impact BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS quality_fit         smallint CHECK (quality_fit BETWEEN 1 AND 5),

  ADD COLUMN IF NOT EXISTS intake_decision     text
    CHECK (intake_decision IN ('accept', 'decline', 'defer', 'reframe')),

  ADD COLUMN IF NOT EXISTS intake_notes        text;

COMMENT ON COLUMN jobs.job_category IS 'Dovetails acceptance category: membership | realtor_baseline | high_margin_project | reactive_low_quality';
COMMENT ON COLUMN jobs.intake_decision IS 'Owner intake decision: accept | decline | defer | reframe';
