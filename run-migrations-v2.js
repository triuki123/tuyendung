#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ulsxqlsgkgfhuahscars.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const MIGRATIONS = [
  'migrations/012_create_companies_table.sql',
  'migrations/013_create_departments_table.sql',
  'migrations/014_create_sub_departments_table.sql',
];

async function runMigrations() {
  console.log('🚀 Starting migration execution using Supabase admin client...\n');

  // Create admin client with secret key
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
    }
  });

  let successCount = 0;
  let failCount = 0;

  for (const migrationFile of MIGRATIONS) {
    try {
      const filePath = path.join(__dirname, migrationFile);

      if (!fs.existsSync(filePath)) {
        console.log(`❌ File not found: ${migrationFile}\n`);
        failCount++;
        continue;
      }

      const sqlContent = fs.readFileSync(filePath, 'utf8');
      console.log(`⏳ Executing: ${migrationFile}`);

      // Split SQL statements and execute each one
      const statements = sqlContent
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        const { error } = await supabase.rpc('exec', {
          sql_query: statement + ';'
        });

        if (error) {
          // If exec function doesn't exist, try alternative approach
          if (error.message.includes('Could not find the function')) {
            throw new Error('exec function not found. Trying alternative method...');
          }
          throw error;
        }
      }

      console.log(`✅ Successfully executed: ${migrationFile}\n`);
      successCount++;
    } catch (err) {
      console.log(`❌ Failed: ${migrationFile}`);
      console.log(`   Error: ${err.message}\n`);
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Successful: ${successCount} | ❌ Failed: ${failCount}`);
  console.log('='.repeat(60) + '\n');

  if (failCount === 0) {
    console.log('🎉 All migrations completed successfully!');
    console.log('The module is ready to use.\n');
  }
}

runMigrations().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
