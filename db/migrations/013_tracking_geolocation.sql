-- 013_tracking_geolocation.sql — Geolocalização nos eventos de tracking

ALTER TABLE crm.tracking_events
  ADD COLUMN IF NOT EXISTS ip          INET,
  ADD COLUMN IF NOT EXISTS geo_city    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS geo_region  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS geo_country VARCHAR(2),
  ADD COLUMN IF NOT EXISTS geo_lat     NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS geo_lon     NUMERIC(9,6);

CREATE INDEX IF NOT EXISTS idx_track_geo_region
  ON crm.tracking_events(geo_region, geo_country, criado_em DESC)
  WHERE geo_region IS NOT NULL;
