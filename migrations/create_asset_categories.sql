-- Create asset_categories table
CREATE TABLE IF NOT EXISTS public.asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_asset_categories_name ON public.asset_categories(name);
CREATE INDEX IF NOT EXISTS idx_asset_categories_active ON public.asset_categories(is_active);

-- Insert default categories
INSERT INTO public.asset_categories (name, description, color, is_active) VALUES
  ('Laptop', 'Máy tính xách tay', '#3b82f6', true),
  ('Màn hình', 'Màn hình máy tính', '#8b5cf6', true),
  ('Điện thoại', 'Điện thoại di động', '#ec4899', true),
  ('Máy in', 'Máy in và thiết bị scan', '#f59e0b', true),
  ('Máy tính bảng', 'Máy tính bảng và tablet', '#10b981', true),
  ('Thiết bị mạng', 'Router, switch, access point', '#06b6d4', true),
  ('Máy chủ', 'Server và máy chủ vật lý', '#6366f1', true),
  ('Phụ kiện', 'Chuột, bàn phím, cáp và phụ kiện khác', '#64748b', true)
ON CONFLICT (name) DO NOTHING;
