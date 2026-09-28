-- Add slug column to companies table
-- This migration adds slug support for URL-friendly company identifiers

-- Step 1: Drop the problematic constraint if it exists
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_slug_key;

-- Step 2: Drop the slug column if it exists (to start fresh)
ALTER TABLE public.companies DROP COLUMN IF EXISTS slug;

-- Step 3: Add slug column (nullable initially)
ALTER TABLE public.companies ADD COLUMN slug VARCHAR(255);

-- Step 4: Create index for slug column
CREATE INDEX IF NOT EXISTS idx_companies_slug ON public.companies(slug);

-- Step 5: Create function to generate slug from name
CREATE OR REPLACE FUNCTION generate_slug_from_name(text_input VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
  IF text_input IS NULL OR TRIM(text_input) = '' THEN
    RETURN '';
  END IF;

  -- Simple slug generation: lowercase, replace spaces with hyphens, remove special chars
  RETURN LOWER(
    TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            text_input,
            '[^a-z0-9\s-]', '', 'gi'
          ),
          '\s+', '-', 'g'
        ),
        '-+', '-', 'g'
      ),
      '-', 'both'
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Step 6: Update existing records with generated slug
UPDATE public.companies
SET slug = generate_slug_from_name(name)
WHERE slug IS NULL AND name IS NOT NULL;

-- Step 7: Add UNIQUE constraint on slug
ALTER TABLE public.companies ADD CONSTRAINT companies_slug_key UNIQUE (slug);

-- Step 8: Make slug NOT NULL
ALTER TABLE public.companies ALTER COLUMN slug SET NOT NULL;

-- Verify the migration
SELECT COUNT(*) as total_companies FROM public.companies;
SELECT id, name, slug FROM public.companies ORDER BY created_at DESC LIMIT 5;
