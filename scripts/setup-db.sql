-- ==========================================
-- AssetFlowPro Database Setup
-- Run this SQL in Supabase SQL Editor
-- ==========================================

-- Create software table
CREATE TABLE IF NOT EXISTS software (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  version TEXT DEFAULT '',
  licenseType TEXT DEFAULT 'subscription',
  totalLicenses INTEGER DEFAULT 0,
  usedLicenses INTEGER DEFAULT 0,
  unitCost DECIMAL(10,2) DEFAULT 0,
  renewalDate TEXT DEFAULT '',
  category TEXT DEFAULT 'productivity',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for software status
CREATE INDEX IF NOT EXISTS idx_software_status ON software(status);
CREATE INDEX IF NOT EXISTS idx_software_name ON software(name);

-- ==========================================

-- Create domains table
CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  registrar TEXT NOT NULL,
  registrationDate TEXT DEFAULT '',
  expirationDate TEXT DEFAULT '',
  renewalCost DECIMAL(10,2) DEFAULT 0,
  autoRenewal BOOLEAN DEFAULT FALSE,
  dnsProvider TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for domains
CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);

-- ==========================================

-- Create email_accounts table
CREATE TABLE IF NOT EXISTS email_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  nguoiSuDung TEXT DEFAULT '',
  congtyDonvi TEXT DEFAULT '',
  phongban TEXT DEFAULT '',
  createdDate TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'locked', 'archived')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for email_accounts
CREATE INDEX IF NOT EXISTS idx_email_accounts_status ON email_accounts(status);
CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON email_accounts(email);
CREATE INDEX IF NOT EXISTS idx_email_accounts_provider ON email_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_email_accounts_nguoiSuDung ON email_accounts(nguoiSuDung);
CREATE INDEX IF NOT EXISTS idx_email_accounts_congtyDonvi ON email_accounts(congtyDonvi);

-- ==========================================

-- Create hardware table
CREATE TABLE IF NOT EXISTS hardware (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  serialnumber TEXT NOT NULL UNIQUE,
  manufacturer TEXT DEFAULT '',
  model TEXT DEFAULT '',
  purchasedate TEXT DEFAULT '',
  cost DECIMAL(15,2) DEFAULT 0,
  warrantyexpiry TEXT DEFAULT '',
  assignedto TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'decommissioned')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for hardware
CREATE INDEX IF NOT EXISTS idx_hardware_status ON hardware(status);
CREATE INDEX IF NOT EXISTS idx_hardware_type ON hardware(type);
CREATE INDEX IF NOT EXISTS idx_hardware_serialnumber ON hardware(serialnumber);

-- ==========================================

-- Create assets table (Main Asset Management)
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  status TEXT DEFAULT 'active',
  assigned_to TEXT,
  assigned_to_name TEXT,
  department TEXT,
  purchase_date TEXT,
  warranty_expiry TEXT,
  value NUMERIC(15,2),
  condition TEXT,
  location TEXT,
  notes TEXT,
  image_url TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_code ON assets(code);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);

-- ==========================================

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  domain_id TEXT,
  icon TEXT DEFAULT 'bell',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- ==========================================

-- Create notification_history table
CREATE TABLE IF NOT EXISTS notification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for notification_history
CREATE INDEX IF NOT EXISTS idx_notification_history_domain_id ON notification_history(domain_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(notification_type);

-- ==========================================
-- Setup Complete!
-- ==========================================
