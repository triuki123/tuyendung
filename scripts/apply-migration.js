/**
 * Apply missing migration tables to the running database
 * This runs through the app's database connection
 */

const http = require('http');

async function applyMigration() {
  console.log('[Migration] Applying user_sessions and user_login_history tables...');

  try {
    const response = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        queries: [
          `CREATE TABLE IF NOT EXISTS public.user_sessions (
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
          );`,
          `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);`,
          `CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON public.user_sessions(expires_at);`,
          `CREATE INDEX IF NOT EXISTS idx_user_sessions_created_at ON public.user_sessions(created_at DESC);`,
          `CREATE TABLE IF NOT EXISTS public.user_login_history (
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
          );`,
          `CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.user_login_history(user_id);`,
          `CREATE INDEX IF NOT EXISTS idx_login_history_login_at ON public.user_login_history(login_at DESC);`,
          `CREATE INDEX IF NOT EXISTS idx_login_history_session_id ON public.user_login_history(session_id);`,
        ]
      });

      const options = {
        hostname: 'localhost',
        port: 4028,
        path: '/api/admin/migration',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'x-current-user-id': 'system',
          'x-current-user-name': 'System',
          'x-current-user-role': 'super_admin'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, data });
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.write(postData);
      req.end();
    });

    if (response.statusCode === 200) {
      console.log('[Migration] ✅ Tables created successfully!');
    } else {
      console.log(`[Migration] Response: ${response.statusCode}`);
      console.log(response.data);
    }
  } catch (error) {
    console.error('[Migration] ❌ Error:', error.message);
    console.log('\nTrying direct SQL execution instead...\n');

    // Fallback: just try to execute SQL through psql if available
    console.log('Please manually run these SQL commands in your database:');
    console.log(`
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

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON public.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_created_at ON public.user_sessions(created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.user_login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_login_at ON public.user_login_history(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_session_id ON public.user_login_history(session_id);
    `);
  }
}

applyMigration();
