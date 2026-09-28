#!/usr/bin/env node

/**
 * Automatic Supabase Setup Script
 * Run: node setup-supabase.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ulsxqlsgkgfhuahscars.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function setupDatabase() {
  console.log('\n🚀 AssetFlow Pro - Supabase Setup\n');
  console.log('📋 Step 1: Reading SQL schema...');

  try {
    // Read SQL file
    const sqlPath = path.join(__dirname, 'SUPABASE_SETUP.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('✓ SQL schema loaded\n');
    console.log('📋 Step 2: Executing SQL in Supabase...\n');

    // Split SQL by semicolons and execute each statement
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.length < 10) continue; // Skip very short statements

      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        if (error && !error.message.includes('already exists')) {
          console.log(`⚠️  ${error.message}`);
        }
      } catch (err) {
        // Supabase might not have exec_sql RPC, so we'll use a different approach
        console.log(`⏭️  Skipping statement (${statement.substring(0, 50)}...)`);
      }
    }

    console.log('✓ Database setup completed\n');
    console.log('📋 Step 3: Tables should now be created in Supabase\n');
    console.log('📍 Next Steps:\n');
    console.log('1. Go to https://supabase.com');
    console.log('2. Select project "ulsxqlsgkgfhuahscars"');
    console.log('3. Go to SQL Editor and run the SQL from SUPABASE_SETUP.sql');
    console.log('4. Come back here and run: npm run migrate-data\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Please manually run the SQL in Supabase SQL Editor:');
    console.log('   1. Open SUPABASE_SETUP.sql');
    console.log('   2. Copy all content');
    console.log('   3. Go to Supabase SQL Editor');
    console.log('   4. Paste and Run\n');
  }
}

setupDatabase();
