if (!process.env.ADMIN_INITIAL_PASSWORD) throw new Error('Set ADMIN_INITIAL_PASSWORD before running this script');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addAdmin() {
  try {
    console.log('🔄 Adding admin account to Supabase...');
    
    const adminUser = {
      id: 'usr-admin-001',
      email: 'admin@admin',
      name: 'Admin Master',
      password: process.env.ADMIN_INITIAL_PASSWORD,
      role: 'super_admin',
      roleLabel: 'Super Admin',
      department: 'Ban Giám Đốc',
      position: 'Quản Trị Viên',
      avatar: 'AM',
      phone: '0000000000',
      bio: 'Tài khoản chủ',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'system',
      updated_by: 'system'
    };

    const { data, error } = await supabase
      .from('users')
      .insert([adminUser])
      .select();

    if (error) {
      if (error.message.includes('duplicate key') || error.message.includes('violates unique')) {
        console.log('⚠️  Admin account already exists');
        
        // Try to update instead
        const { data: updated, error: updateError } = await supabase
          .from('users')
          .update(adminUser)
          .eq('email', 'admin')
          .select();
        
        if (updateError) throw updateError;
        console.log('✅ Admin account updated');
      } else {
        throw error;
      }
    } else {
      console.log('✅ Admin account created successfully');
      console.log('\n📋 Admin Details:');
      console.log('   Email: admin@admin');
      console.log('   Password: REPLACE_WITH_LOCAL_SECRET');
      console.log('   Role: Super Admin');
    }

    console.log('\n🎉 Done! You can now login at http://localhost:4028');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addAdmin();
