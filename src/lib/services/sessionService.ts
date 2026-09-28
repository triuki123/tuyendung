import { query, queryOne, execute } from '@/lib/db';

interface DeviceInfo {
  userAgent?: string;
  ipAddress?: string;
}

interface Session {
  id: string;
  user_id: string;
  device_name: string;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_activity: string;
  expires_at: string | null;
}

interface LoginHistory {
  id: string;
  user_id: string | null;
  session_id: string | null;
  ip_address: string | null;
  browser: string | null;
  os: string | null;
  login_at: string;
  logout_at: string | null;
  success: boolean;
  failure_reason: string | null;
}

/**
 * Parse user agent string to extract browser and OS information
 * @param userAgent User-Agent header string
 * @returns Object with browser and os properties
 */
export function parseUserAgent(userAgent?: string): { browser: string; os: string; device: string } {
  if (!userAgent) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown Device' };

  const browserMatch = userAgent.match(/(Chrome|Safari|Firefox|Edge|Opera|IE|MSIE)\/?([\d.]+)?/i);
  const osMatch = userAgent.match(/(Windows|Macintosh|Linux|iPhone|iPad|Android)/i);

  const browser = browserMatch ? browserMatch[1] : 'Unknown';
  const os = osMatch ? osMatch[1] : 'Unknown';

  let device = 'Desktop';
  if (userAgent.match(/(iPhone|iPad|Android)/i)) {
    device = userAgent.match(/iPhone/i) ? 'iPhone' : userAgent.match(/iPad/i) ? 'iPad' : 'Android Device';
  }

  return { browser, os, device: `${browser} on ${os}` };
}

/**
 * Create a new login session for a user
 * @param userId User ID
 * @param deviceInfo Device information (userAgent, ipAddress)
 * @returns Created session object
 */
export async function createSession(userId: string, deviceInfo: DeviceInfo): Promise<Session> {
  const { browser, os, device } = parseUserAgent(deviceInfo.userAgent);
  const ipAddress = deviceInfo.ipAddress || '::1';

  const result = await queryOne<Session>(
    `INSERT INTO user_sessions (user_id, device_name, browser, os, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5::inet, $6)
     RETURNING *`,
    [userId, device, browser, os, ipAddress, deviceInfo.userAgent || '']
  );

  if (!result) {
    throw new Error('Failed to create session');
  }

  return result;
}

/**
 * Get all active sessions for a user (not expired)
 * @param userId User ID
 * @returns Array of session objects
 */
export async function getActiveSessions(userId: string): Promise<Session[]> {
  const sessions = await query<Session>(
    `SELECT * FROM user_sessions
     WHERE user_id = $1
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY last_activity DESC`,
    [userId]
  );

  return sessions;
}

/**
 * Kiểm tra một session có thật sự thuộc về user và còn hiệu lực hay không.
 * Dùng để xác thực các thao tác nhạy cảm (vd liên kết/hủy Telegram) — không chỉ
 * tin header x-current-user-id (vốn client tự gửi được), mà đối chiếu session_id
 * (cấp lúc đăng nhập, lưu trong assetflow_auth) với bảng user_sessions.
 * @param sessionId session_id từ client (header x-session-id)
 * @param userId    user id từ client (header x-current-user-id)
 * @returns true nếu session hợp lệ, thuộc đúng user và chưa hết hạn.
 */
export async function isSessionValidForUser(
  sessionId: string | null | undefined,
  userId: string | null | undefined
): Promise<boolean> {
  if (!sessionId || !userId) return false;
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM user_sessions
      WHERE id::text = $1
        AND user_id::text = $2
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    [sessionId, userId]
  );
  return !!row;
}

/**
 * Update last activity timestamp for a session
 * @param sessionId Session ID
 */
export async function updateSessionActivity(sessionId: string): Promise<void> {
  await execute(
    `UPDATE user_sessions
     SET last_activity = NOW()
     WHERE id = $1`,
    [sessionId]
  );
}

/**
 * Logout a specific session (mark as expired)
 * @param sessionId Session ID
 */
export async function logoutSession(sessionId: string): Promise<void> {
  await execute(
    `UPDATE user_sessions
     SET expires_at = NOW()
     WHERE id = $1`,
    [sessionId]
  );

  // Record logout in history
  await execute(
    `UPDATE user_login_history
     SET logout_at = NOW()
     WHERE session_id = $1
       AND logout_at IS NULL`,
    [sessionId]
  );
}

/** Thu hồi một session chỉ khi session đó thuộc đúng user đang đăng nhập. */
export async function logoutSessionForUser(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const session = await queryOne<{ id: string }>(
    `UPDATE user_sessions
        SET expires_at = NOW()
      WHERE id::text = $1
        AND user_id::text = $2
      RETURNING id::text AS id`,
    [sessionId, userId]
  );
  if (!session) return false;

  await execute(
    `UPDATE user_login_history
        SET logout_at = NOW()
      WHERE session_id::text = $1
        AND user_id::text = $2
        AND logout_at IS NULL`,
    [sessionId, userId]
  );
  return true;
}

/**
 * Logout all sessions except the current one
 * @param userId User ID
 * @param currentSessionId Session ID to keep active
 */
export async function logoutAllOtherSessions(userId: string, currentSessionId: string): Promise<void> {
  await execute(
    `UPDATE user_sessions
     SET expires_at = NOW()
     WHERE user_id = $1
       AND id != $2
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [userId, currentSessionId]
  );

  // Record logouts in history
  await execute(
    `UPDATE user_login_history
     SET logout_at = NOW()
     WHERE user_id = $1
       AND session_id NOT IN (SELECT id FROM user_sessions WHERE id = $2)
       AND logout_at IS NULL`,
    [userId, currentSessionId]
  );
}

/**
 * Record a login attempt in history
 * @param userId User ID (can be null for failed login attempts)
 * @param sessionId Session ID (can be null if login failed)
 * @param deviceInfo Device information
 * @param success Whether login succeeded
 * @param failureReason Reason for failure if unsuccessful
 */
export async function recordLoginHistory(
  userId: string | null,
  sessionId: string | null,
  deviceInfo: DeviceInfo,
  success: boolean = true,
  failureReason: string | null = null
): Promise<LoginHistory> {
  const { browser, os } = parseUserAgent(deviceInfo.userAgent);
  const ipAddress = deviceInfo.ipAddress || '::1';

  const result = await queryOne<LoginHistory>(
    `INSERT INTO user_login_history (user_id, session_id, ip_address, browser, os, success, failure_reason)
     VALUES ($1::uuid, $2::uuid, $3::inet, $4, $5, $6, $7)
     RETURNING *`,
    [userId, sessionId, ipAddress, browser, os, success, failureReason]
  );

  if (!result) {
    throw new Error('Failed to record login history');
  }

  return result;
}

/**
 * Get login history for a user (recent entries)
 * @param userId User ID
 * @param limit Number of records to return
 * @returns Array of login history entries
 */
export async function getLoginHistory(userId: string, limit: number = 20): Promise<LoginHistory[]> {
  const history = await query<LoginHistory>(
    `SELECT * FROM user_login_history
     WHERE user_id = $1
     ORDER BY login_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return history;
}

/**
 * Clean up expired sessions (older than 90 days)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await execute(
    `DELETE FROM user_sessions
     WHERE expires_at IS NOT NULL
       AND expires_at < NOW() - INTERVAL '90 days'`,
    []
  );

  return 0; // PostgreSQL doesn't return affected rows directly
}
