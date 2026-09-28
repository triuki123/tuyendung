const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ulsxqlsgkgfhuahscars.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyTables() {
  console.log('\n🔍 Verifying Database Tables\n');
  console.log('═'.repeat(60));

  const tables = [
    { name: 'software', emoji: '📦' },
    { name: 'domains', emoji: '🌐' },
    { name: 'email_accounts', emoji: '📧' }
  ];

  let verified = 0;

  for (const table of tables) {
    console.log(`\n${table.emoji} Checking ${table.name} table...`);
    try {
      const { count, error } = await supabase
        .from(table.name)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`   ❌ Error: ${error.message}`);
      } else {
        console.log(`   ✅ Table exists (0 rows)`);
        verified++;
      }
    } catch (err) {
      console.log(`   ❌ ${err.message}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`\n📊 Verification: ${verified}/${tables.length} tables confirmed\n`);

  if (verified === tables.length) {
    console.log('✨ All tables ready!\n');
    console.log('🚀 Next Steps:\n');
    console.log('1. Start your dev server:');
    console.log('   npm run dev\n');
    console.log('2. Open browser:');
    console.log('   http://localhost:3000\n');
    console.log('3. Navigate to Asset Management:\n');
    console.log('   - Quản Lý Phần Mềm (Software)');
    console.log('   - Quản Lý Tên Miền (Domains)');
    console.log('   - Quản Lý Tài Khoản Email (Email Accounts)\n');
    console.log('4. Click "Thêm" (Add) to create your first entry!\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tables are missing.\n');
    console.log('Try these manual steps:\n');
    console.log('1. Open: https://app.supabase.com');
    console.log('2. Select your project');
    console.log('3. Go to: SQL Editor');
    console.log('4. Create each table with the SQL from setup-db.sql\n');
    process.exit(1);
  }
}

verifyTables().catch(err => {
  console.error('\n❌ Verification failed:', err.message);
  process.exit(1);
});
