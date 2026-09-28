const https = require('https');
const url = require('url');

const SUPABASE_URL = 'https://ulsxqlsgkgfhuahscars.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;

const sqls = [
  {
    name: 'Drop existing tables',
    sql: `DROP TABLE IF EXISTS email_accounts CASCADE;
          DROP TABLE IF EXISTS domains CASCADE;
          DROP TABLE IF EXISTS software CASCADE;`
  },
  {
    name: 'Create software table',
    sql: `CREATE TABLE software (
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
    );`
  },
  {
    name: 'Create domains table',
    sql: `CREATE TABLE domains (
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
    );`
  },
  {
    name: 'Create email_accounts table',
    sql: `CREATE TABLE email_accounts (
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
    );`
  },
  {
    name: 'Create indexes',
    sql: `CREATE INDEX idx_software_status ON software(status);
          CREATE INDEX idx_domains_status ON domains(status);
          CREATE INDEX idx_domains_domain ON domains(domain);
          CREATE INDEX idx_email_accounts_status ON email_accounts(status);
          CREATE INDEX idx_email_accounts_email ON email_accounts(email);`
  }
];

function makeRequest(path, method, data, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'ulsxqlsgkgfhuahscars.supabase.co',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'apikey': apiKey
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function fixTables() {
  console.log('\n🔧 Fixing database table schema...\n');
  console.log('═'.repeat(60));

  for (const item of sqls) {
    console.log(`\n${item.name}...`);
    try {
      // Try graphql endpoint for raw SQL
      const response = await makeRequest(
        '/graphql/v1',
        'POST',
        { 
          query: `mutation { sqlRaw(sql: "${item.sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}") }`
        },
        SERVICE_KEY
      );
      
      if (response.status >= 200 && response.status < 300) {
        console.log(`   ✅ Success`);
      } else {
        console.log(`   ⚠️  Status ${response.status}`);
      }
    } catch (err) {
      console.log(`   ⚠️  Error: ${err.message}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n⚠️  If the above didn\'t work, please execute manually:\n');
  console.log('1. Go to: https://app.supabase.com');
  console.log('2. Select your project');
  console.log('3. Go to: SQL Editor');
  console.log('4. Run the SQL script from fix-schema.js output\n');
}

fixTables().catch(err => {
  console.error('Error:', err);
});
