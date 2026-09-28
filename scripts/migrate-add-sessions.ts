/**
 * Migration script to add user_sessions and user_login_history tables
 * Run with: npx ts-node scripts/migrate-add-sessions.ts
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('[Migration] Starting...');

    // Create user_sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.user_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_name VARCHAR(255) DEFAULT 'Unknown Device',
        browser VARCHAR(100),
        os VARCHAR(100),
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE,

        CONSTRAINT valid_session CHECK (expires_at > created_at OR expires_at IS NULL)
      );
    `);
    console.log('[Migration] Created user_sessions table');

    // Create indexes for user_sessions
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON public.user_sessions(expires_at)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_created_at ON public.user_sessions(created_at DESC)'
    );
    console.log('[Migration] Created indexes for user_sessions');

    // Create user_login_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.user_login_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
        ip_address INET,
        browser VARCHAR(100),
        os VARCHAR(100),
        login_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        logout_at TIMESTAMP WITH TIME ZONE,
        success BOOLEAN DEFAULT true,
        failure_reason VARCHAR(255),

        CONSTRAINT valid_logout CHECK (logout_at > login_at OR logout_at IS NULL)
      );
    `);
    console.log('[Migration] Created user_login_history table');

    // Create indexes for user_login_history
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.user_login_history(user_id)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_login_history_login_at ON public.user_login_history(login_at DESC)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_login_history_session_id ON public.user_login_history(session_id)'
    );
    console.log('[Migration] Created indexes for user_login_history');

    console.log('[Migration] ✅ Complete!');
  } catch (error) {
    console.error('[Migration] ❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
