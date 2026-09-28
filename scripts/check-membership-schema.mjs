import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
export async function checkMembershipSchema({ repair = false } = {}) {
  if (repair && (!process.env.DATABASE_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))) throw new Error('Local repair only');
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await c.connect();
    if (repair) {
      const present = await c.query("SELECT to_regclass('public.user_company_memberships') IS NOT NULL AS present");
      console.log('Membership table present before repair:', present.rows[0].present);
      await c.query('BEGIN');
      await c.query(await readFile(new URL('../migrations/305_repair_company_memberships.sql', import.meta.url), 'utf8'));
      await c.query('COMMIT');
    }
    await c.query(`SELECT m.user_id, m.company_id, m.role, m.department_id, m.sub_department_id,
      m.position_id, m.job_title_id, m.manager_id, m.module_permissions, m.is_active
      FROM public.user_company_memberships m LEFT JOIN public.companies c ON c.id = m.company_id LIMIT 0`);
    await c.query('SELECT u.id FROM public.users u JOIN public.user_company_memberships m ON m.user_id = u.id LIMIT 0');
    console.log('PASS membership table, organization columns and ID type compatibility.');
  } catch (error) {
    await c.query('ROLLBACK').catch(() => {});
    throw new Error(`Company membership schema: ${error.message}. Apply migration 305 or run node scripts/check-membership-schema.mjs --repair on local DB.`);
  } finally { await c.end(); }
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/check-membership-schema.mjs')) checkMembershipSchema({ repair: process.argv.includes('--repair') }).catch(e => { console.error(e.message); process.exitCode = 1; });
