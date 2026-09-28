-- Migration 044: Create user_sessions table for device/session tracking
-- Tracks active login sessions across devices/browsers

CREATE TABLE IF NOT EXISTS user_sessions (
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

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_created_at ON user_sessions(created_at DESC);

COMMENT ON TABLE user_sessions IS 'Tracks active login sessions per device/browser. Follows OAuth/OpenID session tracking standards.';
COMMENT ON COLUMN user_sessions.device_name IS 'Human-readable device identifier (e.g., "Chrome on Windows 11")';
COMMENT ON COLUMN user_sessions.expires_at IS 'Session expiration time; NULL = no expiration';
COMMENT ON COLUMN user_sessions.last_activity IS 'Last API call or page refresh from this session';
