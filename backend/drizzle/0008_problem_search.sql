-- Problem search: tsvector FTS + pg_trgm typo fallback
--
-- Layered search needs:
--   1. Stored tsvector over title (A) + description (B) for ranked full-text
--   2. pg_trgm + GIN indexes for similarity() / % when FTS returns too few rows
--   3. Trigram index on tags.name so topic queries can fuzzy-match curated tags

--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "problems"
  ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_problems_search_vector"
  ON "problems" USING gin ("searchVector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_problems_title_trgm"
  ON "problems" USING gin (title gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tags_name_trgm"
  ON "tags" USING gin (name gin_trgm_ops);
