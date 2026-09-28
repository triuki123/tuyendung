-- Migration 045: Create user_login_history table for audit trail
-- Records all login/logout events for security audit and user activity tracking

CREATE TABLE IF NOT EXISTS user_login_history (
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

CREATE INDEX idx_login_history_user_id ON user_login_history(user_id);
CREATE INDEX idx_login_history_login_at ON user_login_history(login_at DESC);
CREATE INDEX idx_login_history_session_id ON user_login_history(session_id);

COMMENT ON TABLE user_login_history IS 'Audit trail of all login/logout events. Used for security analysis and user activity tracking.';
COMMENT ON COLUMN user_login_history.success IS 'Whether login succeeded; false with failure_reason for failed login attempts';
COMMENT ON COLUMN user_login_history.logout_at IS 'NULL = user still logged in from this session';
