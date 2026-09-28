#!/usr/bin/env node

/**
 * Database Initialization Script
 * This script creates all necessary tables in Supabase
 * Run with: node scripts/initializeDatabase.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const createTables = async () => {
  try {
    console.log('🚀 Starting database initialization...\n');

    // Create software table
    console.log('📦 Creating software table...');
    const { error: softwareError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS software (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          vendor TEXT NOT NULL,
          version TEXT,
          licenseType TEXT DEFAULT 'subscription',
          totalLicenses INTEGER DEFAULT 0,
          usedLicenses INTEGER DEFAULT 0,
          unitCost DECIMAL(10,2) DEFAULT 0,
          renewalDate TEXT,
          category TEXT DEFAULT 'productivity',
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `
    });

    if (softwareError && !softwareError.message.includes('already exists')) {
      console.error('❌ Software table error:', softwareError.message);
    } else {
      console.log('✅ Software table created/verified');
    }

    // Create domains table
    console.log('🌐 Creating domains table...');
    const { error: domainsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS domains (
          id TEXT PRIMARY KEY,
          domain TEXT NOT NULL UNIQUE,
          registrar TEXT NOT NULL,
          registrationDate TEXT,
          expirationDate TEXT,
          renewalCost DECIMAL(10,2) DEFAULT 0,
          autoRenewal BOOLEAN DEFAULT FALSE,
          dnsProvider TEXT,
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `
    });

    if (domainsError && !domainsError.message.includes('already exists')) {
      console.error('❌ Domains table error:', domainsError.message);
    } else {
      console.log('✅ Domains table created/verified');
    }

    // Create email_accounts table
    console.log('📧 Creating email_accounts table...');
    const { error: emailError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS email_accounts (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          provider TEXT NOT NULL,
          storageQuota INTEGER DEFAULT 0,
          usedStorage INTEGER DEFAULT 0,
          lastLogin TEXT,
          twoFaEnabled BOOLEAN DEFAULT FALSE,
          createdDate TEXT,
          expirationDate TEXT,
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `
    });

    if (emailError && !emailError.message.includes('already exists')) {
      console.error('❌ Email accounts table error:', emailError.message);
    } else {
      console.log('✅ Email accounts table created/verified');
    }

    console.log('\n✨ Database initialization complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
};

createTables();
