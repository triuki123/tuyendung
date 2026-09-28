-- Create delete_requests table
CREATE TABLE IF NOT EXISTS delete_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID NOT NULL,
  asset_code VARCHAR(100) NOT NULL,
  asset_name VARCHAR(255) NOT NULL,
  asset_type VARCHAR(50),
  requested_by UUID,
  requested_by_name VARCHAR(255),
  requested_at TIMESTAMP WITH TIME ZONE,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_delete_requests_status ON delete_requests(status);
CREATE INDEX IF NOT EXISTS idx_delete_requests_asset_id ON delete_requests(asset_id);
CREATE INDEX IF NOT EXISTS idx_delete_requests_requested_by ON delete_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_delete_requests_created_at ON delete_requests(created_at DESC);

-- Enable Row Level Security
ALTER TABLE delete_requests ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view delete requests
CREATE POLICY "Allow authenticated users to view delete requests"
  ON delete_requests FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to create delete requests
CREATE POLICY "Allow authenticated users to create delete requests"
  ON delete_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update delete requests
CREATE POLICY "Allow authenticated users to update delete requests"
  ON delete_requests FOR UPDATE
  TO authenticated
  USING (true);
