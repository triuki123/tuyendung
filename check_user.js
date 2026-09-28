const pg = require('pg');
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

(async () => {
  try {
    const res = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      ['namtp@fadogroup.com.au']
    );

    if (res.rows.length === 0) {
      console.log('❌ Tài khoản không tồn tại');
    } else {
      const user = res.rows[0];
      console.log('✅ Tài khoản tìm thấy:');
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Password Hash: ${user.password_hash}`);

      const expectedHash = '$2b$10$U9mEdwUVkUlNeF3zwGVC4eGDtx/OLS/tNHwqsX3RYEOwTG4Db5D4y';
      if (user.password_hash === expectedHash) {
        console.log(`\n✅ Mật khẩu mới đã được set thành công!`);
        console.log(`   Mật khẩu mới: Fado@2026`);
      } else {
        console.log(`\n⚠️ Hash password hiện tại khác:`);
        console.log(`   ${user.password_hash}`);
      }
    }
  } catch (err) {
    console.error('❌ Lỗi:', err.message);
  } finally {
    await pool.end();
  }
})();
