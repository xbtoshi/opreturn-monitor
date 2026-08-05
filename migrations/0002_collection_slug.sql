-- 0002_collection_slug.sql
-- Add a stable URL slug for collections; backfill existing rows from name.
-- Collections with no slug fall back to their numeric id in URLs.

ALTER TABLE collections ADD COLUMN slug TEXT;

UPDATE collections
   SET slug = lower(replace(replace(name, ' & ', '-'), ' ', '-'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_slug ON collections(slug);
