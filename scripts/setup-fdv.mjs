import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
dotenv.config({ path: '.env.local', quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Local database only');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query(await readFile(new URL('../migrations/303_fdv_assistant.sql', import.meta.url), 'utf8'));
  console.log('FDV schema ready. OpenAI configured:', !!process.env.OPENAI_API_KEY);
} finally { await client.end(); }
