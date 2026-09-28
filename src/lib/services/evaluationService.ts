import type { PoolClient } from 'pg';
import { query, queryOne, execute, withTransaction, buildUpdateById } from '@/lib/db';
import { moveEvaluationAttachmentsToHrDocs } from '@/lib/services/evaluationAttachmentsService';
import { generateContractCode } from '@/lib/services/contractCodeService';

export type EvaluationStatus = 'draft' | 'pending_signing' | 'evaluated' | 'passed' | 'failed' | 'extended';

export interface Evaluation {
  id: string;
  employee_id: string;
  employment_type_id: string | null;
  employment_type_name: string | null;
  post_evaluation_employment_type_id: string | null;
  post_evaluation_employment_type_name: string | null;
  hire_date: string | null;
  probation_end_date: string | null;
  status: EvaluationStatus;
  result: 'pass' | 'fail' | null;
  result_note: string | null;
  evaluated_by: string | null;
  concluded_by: string | null;
  concluded_at: string | null;
  resulting_contract_id: string | null;
  resulting_offboarding_id: string | null;
  auto_generated: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  employee_name?: string | null;
  employee_email?: string | null;
  employee_department_id?: string | null;
  employee_department_name?: string | null;
  attachment_count?: number;
  /** Nháp HĐ sinh ra khi kết luận ĐẠT còn tồn tại không (false = đã bị xoá, cho phép sinh lại). */
  resulting_contract_exists?: boolean;
}

const SELECT_WITH_JOINS = `
  SELECT e.*,
         u.name        AS employee_name,
         u.email       AS employee_email,
         d.id::text    AS employee_department_id,
         d.name        AS employee_department_name,
         (SELECT COUNT(*) FROM evaluation_attachments a
            WHERE a.evaluation_id = e.id AND a.deleted_at IS NULL) AS attachment_count,
         EXISTS(SELECT 1 FROM contracts c
            WHERE c.id = e.resulting_contract_id) AS resulting_contract_exists
    FROM evaluations e
    LEFT JOIN users u        ON u.id::text = e.employee_id
    LEFT JOIN departments d  ON d.id::text = u.department_id::text`;

export interface EvaluationFilter {
  employee_id?: string;
  employment_type_id?: string;
  status?: EvaluationStatus;
  allowedEmployeeIds?: string[] | null;
  companyId?: string | null;
  /** 'active' (mặc định) = chỉ chưa lưu trữ · 'archived' = chỉ đã lưu trữ · 'all' = cả hai */
  archiveScope?: 'active' | 'archived' | 'all';
}

export async function listEvaluations(filter: EvaluationFilter = {}): Promise<Evaluation[]> {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filter.allowedEmployeeIds !== undefined) {
    if (filter.allowedEmployeeIds === null || filter.allowedEmployeeIds.length === 0) {
      return [];
    }
    params.push(filter.allowedEmployeeIds);
    conditions.push(`e.employee_id = ANY($${params.length}::text[])`);
  }
  if (filter.employee_id) {
    params.push(filter.employee_id);
    conditions.push(`e.employee_id = $${params.length}`);
  }
  if (filter.employment_type_id) {
    params.push(filter.employment_type_id);
    conditions.push(`e.employment_type_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`e.status = $${params.length}`);
  }
  if (filter.companyId) {
    params.push(filter.companyId);
    conditions.push(`(u.company_id::text = $${params.length} OR u.company_id IS NULL)`);
  }
  // Mặc định ẩn thẻ đã lưu trữ khỏi danh sách chính.
  const scope = filter.archiveScope ?? 'active';
  if (scope === 'active') conditions.push(`e.archived_at IS NULL`);
  else if (scope === 'archived') conditions.push(`e.archived_at IS NOT NULL`);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return query<Evaluation>(
    `${SELECT_WITH_JOINS} ${where} ORDER BY e.probation_end_date ASC NULLS LAST, e.created_at DESC`,
    params
  );
}

/**
 * Đếm đánh giá ĐANG CHỜ XỬ LÝ (status ∉ passed/failed) — cho badge tab "Đánh giá".
 * DÙNG CHUNG scope với listEvaluations (allowedEmployeeIds + companyId) để badge và
 * danh sách không bao giờ lệch. Trước đây badge dùng getContractVisibility + không lọc
 * công ty → đếm xuyên công ty, badge ≠ số dòng thấy trong tab.
 */
export async function countPendingEvaluations(filter: {
  allowedEmployeeIds?: string[] | null;
  companyId?: string | null;
}): Promise<number> {
  const conditions: string[] = [`e.status NOT IN ('passed', 'failed')`, `e.archived_at IS NULL`];
  const params: any[] = [];

  if (filter.allowedEmployeeIds !== undefined) {
    if (filter.allowedEmployeeIds === null || filter.allowedEmployeeIds.length === 0) return 0;
    params.push(filter.allowedEmployeeIds);
    conditions.push(`e.employee_id = ANY($${params.length}::text[])`);
  }
  if (filter.companyId) {
    params.push(filter.companyId);
    conditions.push(`(u.company_id::text = $${params.length} OR u.company_id IS NULL)`);
  }

  const row = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
       FROM evaluations e
       LEFT JOIN users u ON u.id::text = e.employee_id
      WHERE ${conditions.join(' AND ')}`,
    params
  );
  return parseInt(row?.cnt || '0', 10);
}

export async function getEvaluationById(id: string): Promise<Evaluation | null> {
  return queryOne<Evaluation>(`${SELECT_WITH_JOINS} WHERE e.id = $1`, [id]);
}

export async function createEvaluation(data: {
  employee_id: string;
  employment_type_id?: string | null;
  employment_type_name?: string | null;
  post_evaluation_employment_type_id?: string | null;
  post_evaluation_employment_type_name?: string | null;
  hire_date?: string | null;
  probation_end_date?: string | null;
  status?: EvaluationStatus;
  auto_generated?: boolean;
  created_by?: string | null;
}): Promise<Evaluation> {
  const id = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const row = await queryOne<{ id: string }>(
    `INSERT INTO evaluations
       (id, employee_id, employment_type_id, employment_type_name,
        post_evaluation_employment_type_id, post_evaluation_employment_type_name,
        hire_date, probation_end_date, status, auto_generated, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      id,
      data.employee_id,
      data.employment_type_id ?? null,
      data.employment_type_name ?? null,
      data.post_evaluation_employment_type_id ?? null,
      data.post_evaluation_employment_type_name ?? null,
      data.hire_date ?? null,
      data.probation_end_date ?? null,
      data.status ?? 'pending_signing',
      data.auto_generated ?? false,
      data.created_by ?? null,
    ]
  );
  const created = await queryOne<Evaluation>(`${SELECT_WITH_JOINS} WHERE e.id = $1`, [row!.id]);
  return created as Evaluation;
}

export async function updateEvaluation(
  id: string,
  data: Partial<{
    employment_type_id: string | null;
    post_evaluation_employment_type_id: string | null;
    post_evaluation_employment_type_name: string | null;
    hire_date: string | null;
    probation_end_date: string | null;
    status: EvaluationStatus;
    result_note: string | null;
    evaluated_by: string | null;
  }>
): Promise<Evaluation | null> {
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of [
    'employment_type_id', 'post_evaluation_employment_type_id', 'post_evaluation_employment_type_name',
    'hire_date', 'probation_end_date',
    'status', 'result_note', 'evaluated_by',
  ] as const) {
    if (data[k] !== undefined) update[k] = data[k];
  }
  const { text, params } = buildUpdateById('evaluations', id, update);
  await execute(text, params);
  return queryOne<Evaluation>(`${SELECT_WITH_JOINS} WHERE e.id = $1`, [id]);
}

export async function deleteEvaluation(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `DELETE FROM evaluations WHERE id = $1 RETURNING id`, [id]
  );
  return !!row;
}

export interface ConcludeResult {
  evaluation: Evaluation;
  contractId: string | null;           // HĐ chính thức (pass)
  offboardingProcessId: string | null; // Quy trình Offboarding (terminate) — được set bởi route sau createProcess
  newEvaluationId: string | null;      // Thẻ đánh giá mới khi kéo dài thử việc
}

/**
 * Kết luận đánh giá:
 *  - PASS              → user sang full_time + tạo HĐ chính thức nháp (status 'passed')
 *  - FAIL + extend     → đẩy probation_end_date ra xa + tạo thẻ đánh giá mới (status 'extended')
 *  - FAIL + terminate  → set status 'failed'; route handler tạo quy trình Offboarding riêng
 * Toàn bộ trong transaction để nhất quán.
 */
/**
 * Sinh các NHÁP hợp đồng theo LUỒNG CHUYỂN TIẾP (from hình thức thử việc → to hình thức
 * đích): mỗi loại HĐ gán = 1 nháp. Tách biệt với cấu hình Onboarding. Chưa cấu hình
 * luồng → fallback HĐ không xác định thời hạn (không gãy).
 * Dùng chung khi kết luận ĐẠT và khi sinh lại nháp bị xoá nhầm.
 * @returns id của HĐ đầu tiên (kết quả chính của thẻ) hoặc null nếu không sinh được.
 */
async function createTransitionContractDrafts(
  client: PoolClient,
  evaluation: Evaluation,
  postTypeId: string,
  postTypeName: string,
  createdBy: string,
  noteText: string
): Promise<string | null> {
  const emp = await client.query<{ employee_code: string | null }>(
    `SELECT employee_code FROM users WHERE id::text = $1`,
    [evaluation.employee_id]
  );
  const empCode = emp.rows[0]?.employee_code ?? evaluation.employee_id.slice(-6);
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startDate = now.toISOString().slice(0, 10);

  const attached = await client.query<{ id: string; code: string | null }>(
    `SELECT ct.id, ct.code
       FROM employment_transitions t
       JOIN employment_transition_contract_types etct ON etct.transition_id = t.id
       JOIN contract_types ct ON ct.id = etct.contract_type_id
      WHERE t.from_employment_type_id = $1 AND t.to_employment_type_id = $2 AND t.is_active
      ORDER BY etct.sort_order ASC`,
    [evaluation.employment_type_id, postTypeId]
  );
  const types = attached.rows.length > 0 ? attached.rows : [{ id: 'ctype_indefinite', code: 'CT' }];

  let firstContractId: string | null = null;
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const contractId = `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    // Mã HĐ theo TEMPLATE cấu hình ở loại hợp đồng (giống nút Sinh mã / onboarding).
    // Loại chưa cấu hình mã / nhân viên thiếu mã công ty → fallback định dạng cũ (không gãy kết luận).
    let contractNum: string;
    try {
      contractNum = await generateContractCode(t.id, evaluation.employee_id);
    } catch {
      contractNum = `HD-${(t.code || 'CT').toUpperCase()}-${ym}-${empCode}-${contractId.slice(-4)}`;
    }
    await client.query(
      `INSERT INTO contracts
         (id, employee_id, contract_type_id, employment_type_id, contract_number, start_date, status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8)`,
      [contractId, evaluation.employee_id, t.id, postTypeId, contractNum, startDate, noteText, createdBy]
    );
    if (i === 0) firstContractId = contractId; // HĐ đầu tiên là kết quả chính của thẻ
  }
  return firstContractId;
}

/**
 * Sinh LẠI nháp hợp đồng chính thức cho thẻ đánh giá đã ĐẠT khi nháp tự động bị
 * xoá nhầm — chạy lại đúng luồng chuyển tiếp như lúc kết luận.
 */
export async function regenerateEvaluationContracts(
  id: string,
  actorId: string
): Promise<{ contractId: string | null }> {
  return withTransaction(async (client) => {
    const ev = await client.query<Evaluation>(`SELECT * FROM evaluations WHERE id = $1 FOR UPDATE`, [id]);
    if (ev.rows.length === 0) throw new Error('Không tìm thấy thẻ đánh giá');
    const evaluation = ev.rows[0];
    if (evaluation.status !== 'passed') {
      throw new Error('Chỉ sinh lại nháp hợp đồng cho thẻ đã kết luận ĐẠT');
    }

    // Nháp cũ còn sống thì không sinh nữa (tránh nhân đôi hợp đồng)
    if (evaluation.resulting_contract_id) {
      const existing = await client.query(
        `SELECT 1 FROM contracts WHERE id = $1`,
        [evaluation.resulting_contract_id]
      );
      if (existing.rows.length > 0) {
        throw new Error('Nháp hợp đồng của thẻ này vẫn còn — xem tại tab Hợp Đồng');
      }
    }

    const postTypeId = evaluation.post_evaluation_employment_type_id ?? 'etype_full_time';
    const postTypeName = evaluation.post_evaluation_employment_type_name ?? 'Toàn thời gian';
    const contractId = await createTransitionContractDrafts(
      client, evaluation, postTypeId, postTypeName, actorId,
      `Sinh lại thủ công (nháp tự động bị xoá) — đánh giá thử việc ĐẠT (hình thức: ${postTypeName}). Thẻ đánh giá: ${id}`
    );

    await client.query(
      `UPDATE evaluations SET resulting_contract_id = $1, updated_at = NOW() WHERE id = $2`,
      [contractId, id]
    );
    return { contractId };
  });
}

export async function concludeEvaluation(
  id: string,
  data: {
    result: 'pass' | 'fail';
    failAction?: 'extend' | 'terminate'; // bắt buộc khi result='fail'
    extendDays?: number;                  // bắt buộc khi failAction='extend'
    result_note?: string | null;
    concluded_by: string;
  }
): Promise<ConcludeResult> {
  return withTransaction(async (client) => {
    // Lấy evaluation hiện tại — FOR UPDATE chống 2 người cùng kết luận (tạo trùng HĐ / cut trùng).
    const ev = await client.query<Evaluation>(`SELECT * FROM evaluations WHERE id = $1 FOR UPDATE`, [id]);
    if (ev.rows.length === 0) throw new Error('Không tìm thấy thẻ đánh giá');
    const evaluation = ev.rows[0];
    if (!['pending_signing', 'evaluated'].includes(evaluation.status)) {
      throw new Error('Chỉ có thể kết luận khi đang ở trạng thái Chờ đánh giá hoặc Đã đánh giá');
    }

    let resulting_contract_id: string | null = null;
    let newEvaluationId: string | null = null;
    let newStatus: EvaluationStatus;

    // ── PASS ──────────────────────────────────────────────────────────────
    if (data.result === 'pass') {
      newStatus = 'passed';

      // Đổi hình thức làm việc sang loại đã chỉ định khi tạo thẻ (post_evaluation_employment_type_id)
      // hoặc fallback về Toàn thời gian nếu không chọn
      const postTypeId = evaluation.post_evaluation_employment_type_id ?? 'etype_full_time';
      const postTypeName = evaluation.post_evaluation_employment_type_name ?? 'Toàn thời gian';
      await client.query(
        `UPDATE users SET employment_type = $2, employment_type_id = $3,
         probation_end_date = NULL, updated_at = NOW()
         WHERE id::text = $1`,
        [evaluation.employee_id, postTypeName, postTypeId]
      );

      resulting_contract_id = await createTransitionContractDrafts(
        client, evaluation, postTypeId, postTypeName, data.concluded_by,
        `Tạo tự động sau khi đánh giá thử việc ĐẠT (hình thức: ${postTypeName}). Thẻ đánh giá: ${id}`
      );

      // CUT Biên Bản Đánh Giá Thử Việc → HỒ SƠ nhân sự (file RỜI khỏi thẻ, chỉ còn sống trong hồ sơ).
      await moveEvaluationAttachmentsToHrDocs(id, evaluation.employee_id, data.concluded_by, client);
    }
    // ── FAIL + KÉO DÀI THỬ VIỆC ───────────────────────────────────────────
    else if (data.failAction === 'extend') {
      const extendDays = data.extendDays;
      if (!extendDays || extendDays < 1) {
        throw new Error('Số ngày kéo dài không hợp lệ');
      }
      newStatus = 'extended';

      // Tính ngày kết thúc mới = ngày kết thúc cũ + số ngày kéo dài
      const baseDate = evaluation.probation_end_date
        ? new Date(evaluation.probation_end_date)
        : new Date();
      baseDate.setDate(baseDate.getDate() + extendDays);
      const newEndDate = baseDate.toISOString().slice(0, 10);

      // Cập nhật probation_end_date của nhân viên (giữ nguyên hình thức thử việc)
      await client.query(
        `UPDATE users SET probation_end_date = $1, updated_at = NOW() WHERE id::text = $2`,
        [newEndDate, evaluation.employee_id]
      );

      // Tạo thẻ đánh giá mới cho chu kỳ kéo dài
      newEvaluationId = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await client.query(
        `INSERT INTO evaluations
           (id, employee_id, employment_type_id, employment_type_name,
            hire_date, probation_end_date, status, auto_generated, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'pending_signing',false,$7)`,
        [
          newEvaluationId,
          evaluation.employee_id,
          evaluation.employment_type_id,
          evaluation.employment_type_name,
          evaluation.hire_date,
          newEndDate,
          data.concluded_by,
        ]
      );

      // Copy watchers từ thẻ cũ sang thẻ mới (giữ liên tục theo dõi)
      await client.query(
        `INSERT INTO evaluation_watchers (id, evaluation_id, user_id, added_by)
         SELECT 'evw_' || $1 || '_' || substr(md5(random()::text), 1, 6),
                $2, user_id, added_by
           FROM evaluation_watchers WHERE evaluation_id = $3
         ON CONFLICT (evaluation_id, user_id) DO NOTHING`,
        [Date.now().toString(), newEvaluationId, id]
      );
    }
    // ── FAIL + CHẤM DỨT THỬ VIỆC ──────────────────────────────────────────
    // Không tạo hợp đồng thôi việc nữa; route handler sẽ tạo quy trình Offboarding
    // và cập nhật evaluations.resulting_offboarding_id sau khi transaction này commit.
    else if (data.failAction === 'terminate') {
      newStatus = 'failed';
    } else {
      throw new Error('Kết luận FAIL phải chọn hành động: kéo dài hoặc chấm dứt');
    }

    // Cập nhật evaluation gốc
    await client.query(
      `UPDATE evaluations
         SET status = $1, result = $2, result_note = $3,
             concluded_by = $4, concluded_at = NOW(),
             resulting_contract_id = $5, updated_at = NOW()
       WHERE id = $6`,
      [
        newStatus,
        data.result,
        data.result_note ?? null,
        data.concluded_by,
        resulting_contract_id,
        id,
      ]
    );

    const updated = await queryOne<Evaluation>(`${SELECT_WITH_JOINS} WHERE e.id = $1`, [id]);
    return { evaluation: updated as Evaluation, contractId: resulting_contract_id, offboardingProcessId: null, newEvaluationId };
  });
}

/** Upload file đính kèm sau khi kết luận đánh giá (biên bản, biểu mẫu...) */
export async function setEvaluatedStatus(id: string, evaluatedBy: string): Promise<Evaluation | null> {
  await execute(
    `UPDATE evaluations SET status = 'evaluated', evaluated_by = $1, updated_at = NOW() WHERE id = $2`,
    [evaluatedBy, id]
  );
  return queryOne<Evaluation>(`${SELECT_WITH_JOINS} WHERE e.id = $1`, [id]);
}

/** Danh sách đánh giá sắp đến hạn (cho scheduler). */
export async function listPendingEvaluationsDue(daysAhead = 7): Promise<Evaluation[]> {
  return query<Evaluation>(
    `${SELECT_WITH_JOINS}
     WHERE e.status IN ('pending_signing', 'evaluated')
       AND e.probation_end_date IS NOT NULL
       AND e.probation_end_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + $1::int
       -- Đang bị cho nghỉ → ngừng nhắc đánh giá (cũng bịt các thẻ ma đã lỡ sinh trước fix).
       AND NOT EXISTS (
         SELECT 1 FROM offboarding_processes op
          WHERE op.user_id = e.employee_id AND op.status = 'in_progress'
       )
       -- Chu kỳ thử việc này đã có thẻ "Không đạt" → đừng nhắc thẻ trùng cùng chu kỳ.
       AND NOT EXISTS (
         SELECT 1 FROM evaluations fe
          WHERE fe.employee_id = e.employee_id
            AND fe.status = 'failed'
            AND fe.probation_end_date = e.probation_end_date
            AND fe.id <> e.id
       )
     ORDER BY e.probation_end_date ASC`,
    [daysAhead]
  );
}

/**
 * Lưu trữ / bỏ lưu trữ 1 thẻ đánh giá (thủ công).
 * CHỈ lưu trữ được thẻ ĐÃ KẾT LUẬN (passed/failed/extended) — thẻ đang xử lý phải kết luận
 * trước. Không xoá dữ liệu, chỉ ẩn khỏi danh sách chính.
 */
export async function setEvaluationArchived(
  id: string, archived: boolean, byUserId: string
): Promise<{ ok: boolean; error?: string }> {
  if (archived) {
    const ev = await queryOne<{ status: string }>(`SELECT status FROM evaluations WHERE id = $1`, [id]);
    if (!ev) return { ok: false, error: 'Không tìm thấy thẻ đánh giá' };
    if (!['passed', 'failed', 'extended'].includes(ev.status)) {
      return { ok: false, error: 'Chỉ lưu trữ được thẻ đã kết luận (Đạt / Không đạt / Gia hạn)' };
    }
    await execute(
      `UPDATE evaluations SET archived_at = NOW(), archived_by = $2::uuid, updated_at = NOW() WHERE id = $1`,
      [id, byUserId]
    );
  } else {
    await execute(
      `UPDATE evaluations SET archived_at = NULL, archived_by = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );
  }
  return { ok: true };
}

/**
 * TỰ LƯU TRỮ thẻ đã kết luận quá `days` ngày kể từ ngày kết luận (concluded_at).
 * days <= 0 → không làm gì (tắt). Idempotent (chỉ đụng thẻ chưa lưu trữ). Trả số thẻ đã lưu trữ.
 */
export async function autoArchiveConcludedEvaluations(days: number): Promise<number> {
  if (!Number.isFinite(days) || days <= 0) return 0;
  return execute(
    `UPDATE evaluations
        SET archived_at = NOW(), updated_at = NOW()
      WHERE archived_at IS NULL
        AND status IN ('passed', 'failed', 'extended')
        AND concluded_at IS NOT NULL
        AND concluded_at < NOW() - ($1::int || ' days')::interval`,
    [Math.floor(days)]
  );
}

/** Nhân viên chưa có evaluation active nào, còn ≤ daysBefore ngày hết thử việc. */
export async function findUsersNeedingEvaluation(daysBefore = 7): Promise<
  {
    id: string;
    name: string;
    email: string;
    hire_date: string;
    employment_type_id: string;
    employment_type_name: string;
    probation_end_date: string;
    probation_duration_days: number | null;
    default_duration_days: number | null;
  }[]
> {
  return query(
    `SELECT u.id::text AS id, u.name, u.email,
            u.hire_date::text AS hire_date,
            u.employment_type_id,
            et.name AS employment_type_name,
            u.probation_end_date::text AS probation_end_date,
            u.probation_duration_days,
            et.default_duration_days
       FROM users u
       JOIN employment_types et ON et.id = u.employment_type_id
      WHERE u.status = 'active'
        AND et.requires_evaluation = true
        AND u.hire_date IS NOT NULL
        AND u.probation_end_date IS NOT NULL
        AND u.probation_end_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + $1::int
        AND NOT EXISTS (
          SELECT 1 FROM evaluations ev
           WHERE ev.employee_id = u.id::text
             AND ev.status NOT IN ('passed', 'failed')
        )
        -- ĐANG BỊ CHO NGHỈ → đừng tự sinh thẻ đánh giá nữa. Kết luận "Không đạt + chấm dứt"
        -- tạo quy trình offboarding nhưng KHÔNG xoá probation_end_date của user, nên trước
        -- đây scheduler cứ sinh thẻ mới → nhắc "quá hạn" mãi dù đã chấm dứt.
        AND NOT EXISTS (
          SELECT 1 FROM offboarding_processes op
           WHERE op.user_id = u.id::text AND op.status = 'in_progress'
        )
        -- Đã có thẻ "Không đạt" cho ĐÚNG chu kỳ thử việc này (cùng probation_end_date) →
        -- chu kỳ đã kết luận, không sinh lại (phòng khi offboarding tạo lỗi bị nuốt).
        AND NOT EXISTS (
          SELECT 1 FROM evaluations fe
           WHERE fe.employee_id = u.id::text
             AND fe.status = 'failed'
             AND fe.probation_end_date = u.probation_end_date
        )`,
    [daysBefore]
  );
}
