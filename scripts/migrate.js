require('dotenv').config();
const { Pool } = require('pg');

console.log('[Migration] DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 50) + '...');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? true : false,
  statement_timeout: 10000,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('[Migration] Starting...');

    // Check if user_sessions table exists
    const sessionTableExists = await client.query(`
      SELECT EXISTS(SELECT 1 FROM information_schema.tables
       WHERE table_name='user_sessions' AND table_schema='public')
    `);

    if (sessionTableExists.rows[0].exists) {
      console.log('[Migration] user_sessions table already exists, checking columns...');

      // Check if expires_at column exists
      const expiresAtExists = await client.query(`
        SELECT EXISTS(SELECT 1 FROM information_schema.columns
         WHERE table_name='user_sessions' AND column_name='expires_at' AND table_schema='public')
      `);

      if (!expiresAtExists.rows[0].exists) {
        console.log('[Migration] Adding missing expires_at column...');
        await client.query(`
          ALTER TABLE public.user_sessions
          ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE
        `);
        console.log('✓ Added expires_at column');
      }
    } else {
      // Create table
      await client.query(`
        CREATE TABLE public.user_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_name VARCHAR(255) DEFAULT 'Unknown Device',
          browser VARCHAR(100),
          os VARCHAR(100),
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP WITH TIME ZONE,
          CONSTRAINT valid_session CHECK (expires_at > created_at OR expires_at IS NULL)
        )
      `);
      console.log('✓ Created user_sessions');

      await client.query(`CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id)`);
      await client.query(`CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions(expires_at)`);
      await client.query(`CREATE INDEX idx_user_sessions_created_at ON public.user_sessions(created_at DESC)`);
      console.log('✓ Created indexes for user_sessions');
    }

    // Check if user_login_history table exists
    const historyTableExists = await client.query(`
      SELECT EXISTS(SELECT 1 FROM information_schema.tables
       WHERE table_name='user_login_history' AND table_schema='public')
    `);

    if (!historyTableExists.rows[0].exists) {
      await client.query(`
        CREATE TABLE public.user_login_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
          ip_address INET,
          browser VARCHAR(100),
          os VARCHAR(100),
          login_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          logout_at TIMESTAMP WITH TIME ZONE,
          success BOOLEAN DEFAULT true,
          failure_reason VARCHAR(255),
          CONSTRAINT valid_logout CHECK (logout_at > login_at OR logout_at IS NULL)
        )
      `);
      console.log('✓ Created user_login_history');

      await client.query(`CREATE INDEX idx_login_history_user_id ON public.user_login_history(user_id)`);
      await client.query(`CREATE INDEX idx_login_history_login_at ON public.user_login_history(login_at DESC)`);
      await client.query(`CREATE INDEX idx_login_history_session_id ON public.user_login_history(session_id)`);
      console.log('✓ Created indexes for user_login_history');
    } else {
      console.log('[Migration] user_login_history table already exists');
    }

    console.log('\n✅ Migration complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
