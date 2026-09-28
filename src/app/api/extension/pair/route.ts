import { NextRequest, NextResponse } from 'next/server';
import { pool, queryOne } from '@/lib/db';
import { extensionCors, hashExtensionSecret, newExtensionToken } from '@/lib/cvExtensionAuth';

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: extensionCors }); }

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  const pairing = await queryOne<{ id: string; user_id: string; company_id: string | null; full_name: string; email: string }>(
    `SELECT p.id, p.user_id, p.company_id, u.name AS full_name, u.email
     FROM cv_extension_pairing_codes p JOIN users u ON u.id = p.user_id
     WHERE p.code_hash = $1 AND p.used_at IS NULL AND p.expires_at > NOW()`, [hashExtensionSecret(code)]);
  if (!pairing) return NextResponse.json({ error: 'Mã không hợp lệ hoặc đã hết hạn' }, { status: 400, headers: extensionCors });
  const token = newExtensionToken();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE cv_extension_pairing_codes SET used_at = NOW() WHERE id = $1`, [pairing.id]);
    await client.query(
      `INSERT INTO cv_extension_tokens(token_hash, user_id, company_id, device_name) VALUES ($1,$2,$3,$4)`,
      [hashExtensionSecret(token), pairing.user_id, pairing.company_id, String(body.deviceName || 'Chrome Extension').slice(0, 100)]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  return NextResponse.json({ success: true, data: { token, user: { id: pairing.user_id, fullName: pairing.full_name, email: pairing.email } } }, { headers: extensionCors });
}
