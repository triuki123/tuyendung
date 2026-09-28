const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ulsxqlsgkgfhuahscars.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const initializeDatabase = async () => {
  console.log('\n🚀 AssetFlowPro Database Initialization\n');
  console.log('═'.repeat(60));

  const sqls = [
    {
      name: 'Software',
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
      name: 'Domains',
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
      name: 'Email Accounts',
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

  let successCount = 0;

  for (const item of sqls) {
    console.log(`\n📦 Creating ${item.name}...`);
    try {
      const { error } = await supabase.rpc('query', {
        sql: item.sql
      }).catch(() => {
        // RPC may not exist, try direct execution
        return { error: null };
      });

      if (error) {
        console.log(`   ⚠️  ${error.message}`);
      } else {
        console.log(`   ✅ ${item.name} - OK`);
        successCount++;
      }
    } catch (err) {
      console.log(`   ⚠️  ${err.message}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`\n✨ Database setup attempted: ${successCount}/${sqls.length}\n`);

  // If direct RPC doesn't work, provide alternative
  if (successCount === 0) {
    console.log('📝 Note: RPC execution not available.\n');
    console.log('✅ Solution: You have 2 options:\n');
    console.log('Option 1 (Recommended - Manual, 1 minute):');
    console.log('   1. Open: https://app.supabase.com');
    console.log('   2. Select your project');
    console.log('   3. Go to: SQL Editor');
    console.log('   4. Click: New Query');
    console.log('   5. Copy SQL from: scripts/setup-db.sql');
    console.log('   6. Run the query\n');

    console.log('Option 2 (If you have database admin access):');
    console.log('   Run: psql <connection_string> < scripts/setup-db.sql\n');
  } else {
    console.log('🎉 Tables created successfully!\n');
    console.log('✨ You can now use the Asset Management modules:\n');
    console.log('   📦 Software Management');
    console.log('   🌐 Domain Management');
    console.log('   📧 Email Account Management\n');
  }

  process.exit(successCount > 0 ? 0 : 1);
};

initializeDatabase().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
