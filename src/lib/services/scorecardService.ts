/**
 * Scorecard phỏng vấn có cấu trúc (theo VỊ TRÍ / application).
 * Nhiều vòng, nhiều người phỏng vấn, chấm theo tiêu chí + khuyến nghị → tổng hợp quyết định.
 */
import { query, queryOne, execute } from '@/lib/db';

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface ScorecardCriterion { name: string; rating: number | null; comment?: string | null }

export interface Scorecard {
  id: string; application_id: string; cv_id: string; requisition_id: string;
  round_label: string; interviewer_id: string | null; interviewer_name: string | null;
  recommendation: string | null; overall: number | null;
  criteria: ScorecardCriterion[]; summary: string | null; created_at: string;
}

/** Danh sách scorecard của 1 application (mới nhất trước). */
export async function listScorecards(applicationId: string): Promise<Scorecard[]> {
  const rows = await query<any>(
    `SELECT s.id, s.application_id, s.cv_id, s.requisition_id, s.round_label,
            s.interviewer_id, u.name AS interviewer_name, s.recommendation, s.overall,
            s.criteria, s.summary, s.created_at
       FROM hr_interview_scorecards s
       LEFT JOIN users u ON u.id::text = s.interviewer_id
      WHERE s.application_id = $1
      ORDER BY s.created_at DESC`,
    [applicationId],
  );
  return rows.map((r) => ({
    ...r,
    overall: r.overall == null ? null : Number(r.overall),
    criteria: Array.isArray(r.criteria) ? r.criteria : [],
  }));
}

/** Thêm 1 scorecard cho application. */
export async function addScorecard(
  applicationId: string,
  data: {
    cvId: string; requisitionId: string; roundLabel?: string; interviewerId: string | null;
    recommendation?: string | null; overall?: number | null;
    criteria?: ScorecardCriterion[]; summary?: string | null;
  },
): Promise<Scorecard> {
  const id = genId('scr');
  await execute(
    `INSERT INTO hr_interview_scorecards
       (id, application_id, cv_id, requisition_id, round_label, interviewer_id,
        recommendation, overall, criteria, summary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [
      id, applicationId, data.cvId, data.requisitionId, data.roundLabel || 'Vòng 1',
      data.interviewerId, data.recommendation ?? null, data.overall ?? null,
      JSON.stringify(data.criteria ?? []), data.summary ?? null,
    ],
  );
  const row = await queryOne<any>(
    `SELECT s.id, s.application_id, s.cv_id, s.requisition_id, s.round_label,
            s.interviewer_id, u.name AS interviewer_name, s.recommendation, s.overall,
            s.criteria, s.summary, s.created_at
       FROM hr_interview_scorecards s LEFT JOIN users u ON u.id::text = s.interviewer_id
      WHERE s.id = $1`, [id],
  );
  return { ...row, overall: row.overall == null ? null : Number(row.overall), criteria: Array.isArray(row.criteria) ? row.criteria : [] };
}
