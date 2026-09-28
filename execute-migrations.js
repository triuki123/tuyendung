const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client with provided credentials
const supabaseUrl = 'https://ulsxqlsgkgfhuahscars.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Read migration files
const migrations = [
  'migrations/012_create_companies_table.sql',
  'migrations/013_create_departments_table.sql',
  'migrations/014_create_sub_departments_table.sql',
];

async function executeMigrations() {
  console.log('Starting migration execution...\n');

  for (const migrationFile of migrations) {
    try {
      const filePath = path.join(__dirname, migrationFile);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`Executing: ${migrationFile}`);

      // Execute SQL using Supabase admin API
      const { data, error } = await supabase.rpc('exec', { sql_query: sql }).catch(async () => {
        // If rpc method doesn't exist, try using the SQL directly via fetch
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ query: sql }),
        });
        return { error: 'Cannot execute DDL via REST API' };
      });

      if (error) {
        // Try alternative approach: use the postgres connection directly
        console.log(`⚠️  Note: ${migrationFile} needs to be executed directly in Supabase SQL Editor`);
      } else {
        console.log(`✅ Successfully executed: ${migrationFile}\n`);
      }
    } catch (err) {
      console.log(`⚠️  Note: ${migrationFile} needs manual execution in Supabase SQL Editor`);
      console.log(`   Reason: ${err.message}\n`);
    }
  }
}

executeMigrations().then(() => {
  console.log('Migration execution completed.');
  console.log('\n⚠️  IMPORTANT: Please verify tables were created by checking Supabase dashboard');
  process.exit(0);
}).catch((err) => {
  console.error('Error during migration:', err);
  process.exit(1);
});
