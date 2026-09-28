// Script to get Supabase PostgreSQL connection details from environment

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

console.log('\n📋 Supabase Configuration Found:\n');
console.log('URL:', url);
console.log('Service Key:', serviceKey.substring(0, 20) + '...');

// Construct PostgreSQL connection string from Supabase details
// Format: postgresql://postgres:password@host:port/postgres
// For Supabase, password is typically the service key (masked)

// Extract host from URL
const host = url.replace('https://', '').replace('.supabase.co', '');

console.log('\n🔧 Supabase Host:', host + '.supabase.co');
console.log('Port: 5432');
console.log('Database: postgres');
console.log('User: postgres');

console.log('\n💡 To setup database, you need the PostgreSQL password.');
console.log('   Go to: https://app.supabase.com > Project > Settings > Database\n');
