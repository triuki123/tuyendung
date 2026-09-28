import { Pool, types } from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';
import { UserModulePermissions } from '@/lib/modules';

/**
 * 🐛 FIX TIMEZONE LÙI NGÀY (toàn hệ thống).
 *
 * Mặc định node-postgres parse cột DATE (OID 1082) thành đối tượng `Date` ở
 * giờ địa phương (Asia/Ho_Chi_Minh = UTC+7). Khi API trả JSON, `JSON.stringify`
 * gọi `Date.prototype.toISOString()` → quy về UTC → ngày bị LÙI 1 ngày
 * (vd 1990-01-15 → "1990-01-14T17:00:00.000Z"). Nếu client lưu lại giá trị đã
 * lùi, lần sau lại lùi tiếp → cộng dồn 2, 4 ngày.
 *
 * Cột DATE vốn KHÔNG có thành phần giờ, nên trả nguyên chuỗi 'YYYY-MM-DD' là
 * đúng nhất — không qua Date, không lệch timezone. Chỉ ảnh hưởng OID 1082;
 * TIMESTAMP/TIMESTAMPTZ (created_at...) giữ nguyên là Date như cũ.
 */
const PG_DATE_OID = 1082;
types.setTypeParser(PG_DATE_OID, (val: string) => val);

/**
 * Postgres connection pool for the self-hosted database.
 *
 * Connection comes from DATABASE_URL (preferred) or discrete PG* vars so the
 * same code runs against the docker `postgres` service and a local instance.
 */
const connectionString = process.env.DATABASE_URL;
const poolMax = Number(process.env.PG_POOL_MAX || 10);

// Timezone đặt qua options thay vì gọi SET trong 'connect' event (tránh race condition
// với pg@8 deprecation warning khi client.query() bị gọi trước khi query trước đó resolve).
const TZ_OPTION = "-c timezone=Asia/Ho_Chi_Minh";

function createPool(): Pool {
  if (
    process.env.NODE_ENV === 'production' &&
    !connectionString &&
    (!process.env.PGHOST ||
      !process.env.PGUSER ||
      !process.env.PGPASSWORD ||
      !process.env.PGDATABASE)
  ) {
    throw new Error(
      'Thiếu cấu hình PostgreSQL production: cần DATABASE_URL hoặc đầy đủ PGHOST/PGUSER/PGPASSWORD/PGDATABASE.'
    );
  }

  const p = connectionString
    ? new Pool({
        connectionString,
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
        max: poolMax,
        idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 20_000),
        options: TZ_OPTION,
      })
    : new Pool({
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'assetflow',
        max: poolMax,
        idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 20_000),
        options: TZ_OPTION,
      });

  p.on('error', (err: Error) => {
    // Surface idle-client failures instead of crashing the process.
    console.error('[db] idle pool client error:', err.message);
  });

  return p;
}

/**
 * Single shared pool, cached on globalThis.
 *
 * Next.js dev (HMR) re-evaluates this module on every code change. Without the
 * global cache each reload would spin up a NEW Pool while the old one keeps its
 * server sessions open — quickly exhausting a session-mode pooler (e.g. the
 * Supabase pooler caps at 15 sessions → EMAXCONNSESSION). Reusing one pool
 * keeps total connections bounded by `max` regardless of reloads.
 */
const globalForPool = globalThis as unknown as { __assetflowPgPool?: Pool };
const pool = globalForPool.__assetflowPgPool ?? createPool();
if (process.env.NODE_ENV !== 'production') {
  globalForPool.__assetflowPgPool = pool;
}

export { pool };

/**
 * Run a query and return all rows. Generic over the row shape.
 *
 *   const rows = await query<User>('SELECT * FROM users WHERE status = $1', ['active']);
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params: any[] = []
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/**
 * Run a query and return the first row, or null when nothing matched.
 * Mirrors the single-row reads the app relied on previously.
 */
export async function queryOne<T extends QueryResultRow = any>(
  text: string,
  params: any[] = []
): Promise<T | null> {
  const result = await pool.query<T>(text, params);
  return result.rows[0] ?? null;
}

/**
 * Run a write and return the number of affected rows.
 */
export async function execute(text: string, params: any[] = []): Promise<number> {
  const result = await pool.query(text, params);
  return result.rowCount ?? 0;
}

/**
 * Run several statements inside one transaction. The callback receives a
 * dedicated client; commit/rollback is handled automatically.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Regex that every column name must satisfy to prevent SQL injection. */
const SAFE_COL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateCol(col: string): void {
  if (!SAFE_COL_RE.test(col)) {
    throw new Error(`Invalid column name: ${col}`);
  }
}

/**
 * Build a parameterized `INSERT ... RETURNING *` from a column→value map.
 * Keeps the common create path terse without an ORM.
 *
 * Each column name is validated against a safe-identifier regex and then
 * double-quoted so that camelCase identifiers (e.g. "roleLabel") are
 * preserved exactly as Postgres stored them.
 */
export function buildInsert(
  table: string,
  data: Record<string, any>
): { text: string; params: any[] } {
  const cols = Object.keys(data);
  cols.forEach(validateCol);
  const params = Object.values(data);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const quotedCols = cols.map((c) => `"${c}"`);
  const text = `INSERT INTO ${table} (${quotedCols.join(', ')}) VALUES (${placeholders.join(
    ', '
  )}) RETURNING *`;
  return { text, params };
}

/**
 * Build a parameterized `UPDATE ... WHERE id = $n RETURNING *` from a
 * column→value map. `id` is appended as the final parameter.
 *
 * Each column name is validated against a safe-identifier regex and then
 * double-quoted so that camelCase identifiers are preserved.
 */
export function buildUpdateById(
  table: string,
  id: string | number,
  data: Record<string, any>
): { text: string; params: any[] } {
  const cols = Object.keys(data);
  cols.forEach(validateCol);
  const params = Object.values(data);
  const assignments = cols.map((c, i) => `"${c}" = $${i + 1}`);
  const text = `UPDATE ${table} SET ${assignments.join(', ')} WHERE id = $${
    cols.length + 1
  } RETURNING *`;
  return { text, params: [...params, id] };
}

// ---------------------------------------------------------------------------
// Shared domain types (moved off the old Supabase module).
// ---------------------------------------------------------------------------

export type User = {
  id: string;
  email: string;
  name: string;
  password: string;
  role: 'super_admin' | 'admin' | 'manager' | 'user';
  roleLabel: string;
  department: string;
  company?: string;
  position: string;
  avatar: string;
  phone: string;
  bio: string;
  status: 'active' | 'inactive';
  last_login?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  module_permissions?: UserModulePermissions;
  tags?: Array<{ id: string; name: string; color: string }>;
  // Hồ Sơ Nhân Sự
  hire_date?: string | null;
  employment_type?: string | null;
  bank_account_no?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  home_address?: string | null;
  work_location?: string | null;
};

export type AuditLog = {
  id: string;
  action: string;
  userId: string;
  details: string;
  performedBy: string;
  timestamp: string;
};
