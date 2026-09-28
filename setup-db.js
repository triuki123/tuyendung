const { Client } = require('pg');

// Supabase PostgreSQL connection string
// Format: postgresql://user:password@host:port/database
const connectionString = 'postgresql://postgres:[YOUR_PASSWORD]@ulsxqlsgkgfhuahscars.supabase.co:5432/postgres';

// For direct connection (if you have Supabase password)
// You can get the connection string from: Supabase > Settings > Database > Connection string > URI

const client = new Client({
  connectionString: process.env.DATABASE_URL || connectionString
});

const sqls = [
  {
    name: 'Software Table',
    sql: `
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
    `
  },
  {
    name: 'Domains Table',
    sql: `
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
    `
  },
  {
    name: 'Email Accounts Table',
    sql: `
      CREATE TABLE IF NOT EXISTS email_accounts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        storageQuota DECIMAL(10,2) DEFAULT 0,
        usedStorage DECIMAL(10,2) DEFAULT 0,
        lastLogin TEXT DEFAULT '',
        twoFaEnabled BOOLEAN DEFAULT FALSE,
        createdDate TEXT DEFAULT '',
        expirationDate TEXT DEFAULT '',
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
        notes TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `
  },
  {
    name: 'Indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_software_status ON software(status);
      CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
      CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
      CREATE INDEX IF NOT EXISTS idx_email_accounts_status ON email_accounts(status);
      CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON email_accounts(email);
    `
  }
];

async function setupDatabase() {
  console.log('\n🚀 AssetFlowPro Database Setup\n');
  console.log('═'.repeat(60));

  try {
    console.log('\n📡 Connecting to Supabase...');
    await client.connect();
    console.log('✅ Connected!\n');

    let successCount = 0;

    for (const item of sqls) {
      console.log(`📦 Creating ${item.name}...`);
      try {
        await client.query(item.sql);
        console.log(`   ✅ ${item.name} - Created\n`);
        successCount++;
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`   ✅ ${item.name} - Already exists\n`);
          successCount++;
        } else {
          console.error(`   ❌ Error: ${error.message}\n`);
        }
      }
    }

    console.log('═'.repeat(60));
    console.log(`\n✨ Setup Complete: ${successCount}/${sqls.length} successful\n`);

    if (successCount === sqls.length) {
      console.log('🎉 All tables created successfully!\n');
      console.log('✅ You can now use:\n');
      console.log('   📦 Software Management');
      console.log('   🌐 Domain Management');
      console.log('   📧 Email Account Management\n');
    }

    await client.end();
    process.exit(successCount === sqls.length ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Connection Error:', error.message);
    console.error('\n📝 Instructions:\n');
    console.error('1. Get your Supabase PostgreSQL connection string:');
    console.error('   - Go to: https://app.supabase.com');
    console.error('   - Select your project');
    console.error('   - Settings > Database > Connection strings > PostgreSQL');
    console.error('   - Copy the URI\n');
    console.error('2. Set environment variable:');
    console.error('   Windows: set DATABASE_URL=your_connection_string');
    console.error('   Linux/Mac: export DATABASE_URL=your_connection_string\n');
    console.error('3. Run again: node setup-db.js\n');

    try {
      await client.end();
    } catch {}
    process.exit(1);
  }
}

setupDatabase();
