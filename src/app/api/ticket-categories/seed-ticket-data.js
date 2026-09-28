const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    // Insert request types
    console.log('Inserting request types...');
    await client.query(`
      INSERT INTO public.ticket_request_types (id, code, name, sort_order, is_active)
      VALUES 
        ('rt-bug', 'BUG', 'Bug Report', 1, true),
        ('rt-feature', 'FEATURE', 'Feature Request', 2, true),
        ('rt-support', 'SUPPORT', 'Support', 3, true),
        ('rt-maintenance', 'MAINT', 'Maintenance', 4, true)
      ON CONFLICT DO NOTHING;
    `);
    console.log('✅ Request types inserted');

    // Insert ticket categories
    console.log('Inserting categories...');
    await client.query(`
      INSERT INTO public.ticket_categories (id, parent_id, name, request_type, custom_fields, sort_order, is_active)
      VALUES 
        ('cat-general', NULL, 'General', NULL, '[]'::jsonb, 0, true),
        ('cat-bug', 'cat-general', 'Bug', 'BUG', '[]'::jsonb, 1, true),
        ('cat-feature', 'cat-general', 'Feature', 'FEATURE', '[]'::jsonb, 2, true),
        ('cat-support', 'cat-general', 'Support', 'SUPPORT', '[]'::jsonb, 3, true)
      ON CONFLICT DO NOTHING;
    `);
    console.log('✅ Categories inserted');

    // Verify
    const reqTypes = await client.query('SELECT COUNT(*) FROM ticket_request_types');
    const cats = await client.query('SELECT COUNT(*) FROM ticket_categories');
    console.log(`Total request types: ${reqTypes.rows[0].count}`);
    console.log(`Total categories: ${cats.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
