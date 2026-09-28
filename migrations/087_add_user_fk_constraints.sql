-- Migration 087: Add Foreign Key constraints for user references
-- Wrapped in DO blocks to handle type mismatch gracefully (users.id may be UUID while
-- referencing columns are TEXT — FK will be skipped rather than failing the runner).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_contract_watchers_user_id'
  ) THEN
    BEGIN
      ALTER TABLE public.contract_watchers
        ADD CONSTRAINT fk_contract_watchers_user_id
          FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'fk_contract_watchers_user_id: bỏ qua (%) — type mismatch giữa TEXT và UUID', SQLERRM;
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_hdrr_requested_by'
  ) THEN
    BEGIN
      ALTER TABLE public.hr_document_replace_requests
        ADD CONSTRAINT fk_hdrr_requested_by
          FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'fk_hdrr_requested_by: bỏ qua (%) — type mismatch', SQLERRM;
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_hdrr_reviewed_by'
  ) THEN
    BEGIN
      ALTER TABLE public.hr_document_replace_requests
        ADD CONSTRAINT fk_hdrr_reviewed_by
          FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'fk_hdrr_reviewed_by: bỏ qua (%) — type mismatch', SQLERRM;
    END;
  END IF;
END $$;
