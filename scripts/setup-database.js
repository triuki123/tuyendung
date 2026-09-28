const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupDatabase() {
  try {
    console.log('🔄 Setting up Supabase database...');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../migrations/001_create_users_tables.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute the SQL
    const { error } = await supabase.rpc('sql', { query: sql });

    if (error && error.message.includes('does not exist')) {
      // sql function doesn't exist, try using raw query via the REST API
      console.log('📝 Running SQL migration directly...');

      // Split SQL by statements and execute each one
      const statements = sql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt && !stmt.startsWith('--'));

      for (const statement of statements) {
        try {
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: statement }),
          });

          if (!response.ok) {
            // Try alternative approach
          }
        } catch (err) {
          // Continue to alternative approach
        }
      }
    }

    // Check if tables exist by querying users table
    console.log('✅ Checking if tables were created...');
    const { data, error: checkError } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (checkError) {
      console.log('⚠️  Tables may not exist yet.');
      console.log('\n📋 Please run this SQL in the Supabase dashboard:');
      console.log('   1. Go to https://app.supabase.com');
      console.log('   2. Select your project and go to SQL Editor');
      console.log('   3. Create a new query and paste this SQL:');
      console.log('\n---START SQL---');
      console.log(sql);
      console.log('---END SQL---\n');
      process.exit(1);
    } else {
      console.log('✅ Database tables are ready!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupDatabase();
