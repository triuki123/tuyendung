import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    // Fetch all active users to check company_id coverage
    const allUsers = await query<{
      id: string;
      name: string;
      email: string;
      company_id: string | null;
      status: string;
    }>(
      `SELECT id, name, email, company_id, status FROM users WHERE status = 'active'`
    );

    const withoutCompany = allUsers.filter(
      u => u.company_id === null || u.company_id === ''
    );
    const withCompany = allUsers.filter(
      u => u.company_id !== null && u.company_id !== ''
    );

    // Separate query for users explicitly having NULL company_id
    const nullCompanyUsers = await query<{
      id: string;
      name: string;
      email: string;
      company_id: null;
      status: string;
    }>(
      `SELECT id, name, email, company_id, status
       FROM users
       WHERE company_id IS NULL
         AND status = 'active'`
    );

    return NextResponse.json({
      total_users: allUsers.length,
      with_company: withCompany.length,
      without_company: withoutCompany.length,
      null_company_query_result: nullCompanyUsers.length,
      sample_without_company: withoutCompany.slice(0, 5),
      sample_with_company: withCompany.slice(0, 3),
      details: {
        all_users_count: allUsers.length,
        null_company_users_count: nullCompanyUsers.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
