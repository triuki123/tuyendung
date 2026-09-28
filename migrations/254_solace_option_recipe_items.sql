-- Migration 254: Định mức nguyên liệu theo TÙY CHỌN (option value)
-- Cho phép mỗi option value (vd "Thêm đường", "Topping trân châu") trừ thêm
-- nguyên liệu khi khách chọn — độc lập với công thức gốc của món.
CREATE TABLE IF NOT EXISTS public.solace_option_recipe_items (
  id              TEXT PRIMARY KEY,
  option_value_id TEXT NOT NULL REFERENCES public.solace_option_values(id) ON DELETE CASCADE,
  ingredient_id   TEXT NOT NULL REFERENCES public.solace_ingredients(id)   ON DELETE CASCADE,
  qty             NUMERIC(14,3) NOT NULL DEFAULT 0,   -- định mức cộng thêm / 1 phần
  wastage_pct     NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- % khấu hao hao hụt
  UNIQUE (option_value_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_solace_option_recipe_value
  ON public.solace_option_recipe_items (option_value_id);
