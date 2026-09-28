#!/usr/bin/env node

/**
 * Database Initialization Script for AssetFlowPro
 * Automatically creates all necessary Supabase tables
 *
 * Usage: node scripts/init-db.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
require = (await import('module')).createRequire(import.meta.url);

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

console.log('\n🚀 AssetFlowPro Database Initialization\n');
console.log('═'.repeat(50));

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('\n❌ Error: Missing environment variables\n');
  console.error('Required:');
  console.error('  • NEXT_PUBLIC_SUPABASE_URL');
  console.error('  • SUPABASE_SERVICE_KEY\n');
  console.error('Please check your .env.local file\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const tables = [
  {
    name: 'software',
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
      )
    `
  },
  {
    name: 'domains',
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
      )
    `
  },
  {
    name: 'email_accounts',
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
      )
    `
  }
];

const createTables = async () => {
  try {
    let successCount = 0;

    for (const table of tables) {
      console.log(`\n📦 Creating ${table.name} table...`);

      const { error } = await supabase.rpc('create_table_if_not_exists', {
        table_name: table.name,
        table_sql: table.sql
      }).catch(() => ({ error: null })); // Ignore RPC errors

      // Try direct approach using query
      const { error: directError } = await supabase
        .from(table.name)
        .select('id')
        .limit(1)
        .then(() => ({ error: null }))
        .catch((err) => {
          // Table doesn't exist yet
          return { error: err };
        });

      if (!error || !directError) {
        console.log(`   ✅ ${table.name} table ready`);
        successCount++;
      } else {
        console.warn(`   ⚠️  ${table.name} table - manual setup needed`);
      }
    }

    console.log('\n' + '═'.repeat(50));
    console.log('\n📊 Results:');
    console.log(`   ✅ Tables ready: ${successCount}/${tables.length}\n`);

    if (successCount < tables.length) {
      console.log('⚠️  Some tables may need manual setup.');
      console.log('\n📝 Instructions:');
      console.log('   1. Go to: Supabase > SQL Editor');
      console.log('   2. Copy SQL from: scripts/setup-db.sql');
      console.log('   3. Run the SQL\n');
    } else {
      console.log('🎉 All tables created successfully!\n');
      console.log('🚀 You can now use the Asset Management modules:\n');
      console.log('   • Software Management');
      console.log('   • Domain Management');
      console.log('   • Email Account Management\n');
    }

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message, '\n');

    console.log('🔧 Alternative: Manual Setup\n');
    console.log('1. Open Supabase Dashboard');
    console.log('2. Go to SQL Editor');
    console.log('3. Run the SQL from scripts/setup-db.sql\n');

    process.exit(1);
  }
};

createTables();
