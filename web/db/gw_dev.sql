-- Groundwork non-production tables. Safe to re-run. Applied by `npm run db:setup`.
-- Prefixed gw_dev_ so they never collide with team tables (parcels, regions, watchlist, reports, ...).

CREATE TABLE IF NOT EXISTS gw_dev_runs (
  run_id       text PRIMARY KEY,
  property_id  text NOT NULL,
  status       text NOT NULL CHECK (status IN ('running', 'done', 'error')),
  started_at   timestamptz NOT NULL,
  finished_at  timestamptz,
  error        text,
  steps        jsonb NOT NULL DEFAULT '[]'::jsonb,
  memo_id      text
);
CREATE INDEX IF NOT EXISTS gw_dev_runs_property_idx ON gw_dev_runs (property_id, started_at DESC);

CREATE TABLE IF NOT EXISTS gw_dev_memos (
  memo_id        text PRIMARY KEY,
  property_id    text NOT NULL,
  generated_at   timestamptz NOT NULL,
  digest_sha256  text NOT NULL,
  body           jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS gw_dev_memos_property_idx ON gw_dev_memos (property_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS gw_dev_property_reviews (
  client_id    text NOT NULL,
  property_id  text NOT NULL,
  review       jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, property_id)
);
