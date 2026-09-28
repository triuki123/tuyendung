const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ulsxqlsgkgfhuahscars.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const recreateSql = `
-- Drop existing tables
DROP TABLE IF EXISTS email_accounts CASCADE;
DROP TABLE IF EXISTS domains CASCADE;
DROP TABLE IF EXISTS software CASCADE;

-- Create software table with correct schema
CREATE TABLE software (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  version TEXT DEFAULT '',
  license_type TEXT DEFAULT 'subscription',
  total_licenses INTEGER DEFAULT 0,
  used_licenses INTEGER DEFAULT 0,
  unit_cost DECIMAL(10,2) DEFAULT 0,
  renewal_date TEXT DEFAULT '',
  category TEXT DEFAULT 'productivity',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create domains table with correct schema
CREATE TABLE domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  registrar TEXT NOT NULL,
  registration_date TEXT DEFAULT '',
  expiration_date TEXT DEFAULT '',
  renewal_cost DECIMAL(10,2) DEFAULT 0,
  auto_renewal BOOLEAN DEFAULT FALSE,
  dns_provider TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create email_accounts table with correct schema
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  storage_quota DECIMAL(10,2) DEFAULT 0,
  used_storage DECIMAL(10,2) DEFAULT 0,
  last_login TEXT DEFAULT '',
  two_fa_enabled BOOLEAN DEFAULT FALSE,
  created_date TEXT DEFAULT '',
  expiration_date TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_software_status ON software(status);
CREATE INDEX idx_domains_status ON domains(status);
CREATE INDEX idx_domains_domain ON domains(domain);
CREATE INDEX idx_email_accounts_status ON email_accounts(status);
CREATE INDEX idx_email_accounts_email ON email_accounts(email);
`;

async function recreateTables() {
  console.log('🔄 Recreating tables with correct schema...\n');
  console.log('📝 SQL to execute:\n', recreateSql.substring(0, 200) + '...\n');
  
  // Since direct SQL execution via RPC isn't available, 
  // we'll need to use the API endpoint or manual execution
  console.log('✅ SQL prepared for execution via Supabase SQL Editor');
  console.log('\nPlease run this in Supabase SQL Editor:');
  console.log('─'.repeat(80));
  console.log(recreateSql);
  console.log('─'.repeat(80));
  console.log('\nSteps:');
  console.log('1. Open: https://app.supabase.com');
  console.log('2. Select your project');
  console.log('3. Go to: SQL Editor');
  console.log('4. Create a new query');
  console.log('5. Paste the SQL above');
  console.log('6. Click "Run"');
}

recreateTables();
