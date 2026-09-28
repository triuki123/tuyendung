const fs = require('fs');
const path = require('path');

async function setupDatabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }

  try {
    console.log('🔄 Reading migration SQL...');
    const migrationPath = path.join(__dirname, '../migrations/001_create_users_tables.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements`);

    // Execute via REST API
    console.log('🔄 Executing SQL statements...');
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ query: statement }),
        });

        if (!response.ok && response.status !== 405) {
          console.log(`  Statement ${i + 1}: ⚠️ ${response.status}`);
        } else {
          console.log(`  Statement ${i + 1}: ✓`);
        }
      } catch (err) {
        console.log(`  Statement ${i + 1}: ⚠️ ${err.message}`);
      }
    }

    // Verify tables exist
    console.log('\n✅ Checking if tables exist...');
    const checkResponse = await fetch(`${supabaseUrl}/rest/v1/users?limit=0`, {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (checkResponse.ok) {
      console.log('✅ Database setup complete! Tables are ready.');
    } else {
      console.log('⚠️  Tables may not exist. You may need to run the SQL migration manually.');
      console.log('   Go to https://app.supabase.com, open the SQL Editor, and paste this:');
      console.log('\n' + sql);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupDatabase();
