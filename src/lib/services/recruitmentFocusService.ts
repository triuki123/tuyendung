import { query, queryOne } from '@/lib/db';

export interface RecruitmentFocusData {
  mode: 'recruitment-focus';
  cvs: { total: number; byStage: { label: string; value: number }[]; bySource: { label: string; value: number }[] };
  applications: { total: number; byStage: { label: string; value: number }[] };
  requisitions: { open: number; onHold: number; filledThisMonth: number; totalTarget: number; totalFilled: number };
}

/** Only recruitment tables are required by this focused development workspace. */
export async function getRecruitmentFocusOverview(companyId?: string): Promise<RecruitmentFocusData> {
  const params = companyId ? [companyId] : [];
  const reqScope = companyId ? 'AND company_id::text = $1' : '';
  const appScope = companyId ? 'AND r.company_id::text = $1' : '';
  const [cvStages, cvSources, appStages, req] = await Promise.all([
    query<{ label: string; value: number }>(
      'SELECT status AS label, COUNT(*)::int AS value FROM hr_cv_pool WHERE deleted_at IS NULL GROUP BY status',
    ),
    query<{ label: string; value: number }>(
      `SELECT COALESCE(NULLIF(BTRIM(source), ''), 'Chưa xác định nguồn') AS label, COUNT(*)::int AS value
         FROM hr_cv_pool WHERE deleted_at IS NULL GROUP BY 1 ORDER BY value DESC LIMIT 8`,
    ),
    query<{ label: string; value: number }>(
      `SELECT a.status AS label, COUNT(*)::int AS value FROM hr_applications a
         JOIN requisitions r ON r.id = a.requisition_id AND r.deleted_at IS NULL
        WHERE COALESCE(a.status, '') <> '' ${appScope} GROUP BY a.status`, params,
    ),
    queryOne<Record<string, number>>(
      `SELECT COUNT(*) FILTER (WHERE status = 'open')::int AS open,
              COUNT(*) FILTER (WHERE status = 'on_hold')::int AS on_hold,
              COUNT(*) FILTER (WHERE status = 'filled' AND filled_at >= date_trunc('month', CURRENT_DATE))::int AS filled_month,
              COALESCE(SUM(target_headcount) FILTER (WHERE status IN ('open','on_hold')), 0)::int AS total_target,
              COALESCE(SUM(filled_count) FILTER (WHERE status IN ('open','on_hold')), 0)::int AS total_filled
         FROM requisitions WHERE deleted_at IS NULL ${reqScope}`, params,
    ),
  ]);
  return {
    mode: 'recruitment-focus',
    cvs: { total: cvStages.reduce((total, stage) => total + stage.value, 0), byStage: cvStages, bySource: cvSources },
    applications: { total: appStages.reduce((total, stage) => total + stage.value, 0), byStage: appStages },
    requisitions: { open: req?.open ?? 0, onHold: req?.on_hold ?? 0, filledThisMonth: req?.filled_month ?? 0, totalTarget: req?.total_target ?? 0, totalFilled: req?.total_filled ?? 0 },
  };
}
