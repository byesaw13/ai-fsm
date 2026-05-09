ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS sub_status text
    CHECK (sub_status IN ('waiting_parts','customer_hold','dispute','quote_revision'));

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS sub_status text
    CHECK (sub_status IN ('no_show','weather_hold','waiting_parts','reschedule_requested'));
