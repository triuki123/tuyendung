/**
 * Yêu cầu tuyển dụng (requisitions) — nền tảng phân tích time-to-fill, plan-vs-actual,
 * vị trí tồn đọng (aging), tải theo recruiter. (P2)
 */
import { query, queryOne, execute, buildInsert, buildUpdateById } from '@/lib/db';
import { notify } from '@/lib/notifications/engine';
import { logRequisition, buildRequisitionChanges } from '@/lib/services/requisitionAuditService';
import { ensureRequisitionWorkflow } from '@/lib/services/requisitionWorkflowService';

const ORDER_URL = '/yeu-cau-tuyen-dung';
const HR_URL = '/nguon-nhan-luc?tab=requisitions';

export type ReqStatus = 'pending' | 'pending_approval' | 'open' | 'on_hold' | 'filled' | 'cancelled' | 'rejected';
export type ReqPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Requisition {
  id: string;
  title: string;
  company_id: string | null;
  department_id: string | null;
  position_id: string | null;
  jd_id: string | null;
  target_headcount: number;
  filled_count: number;
  status: ReqStatus;
  priority: ReqPriority;
  owner_id: string | null;
  open_date: string;
  target_close_date: string | null;
  filled_at: string | null;
  note: string | null;
  created_by: string | null;
  reject_reason?: string | null;
  accepted_at?: string | null;
  accepted_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_type?: string | null;
  budget_code?: string | null;
  cnt_sourcing?: number | null;
  cnt_screening?: number | null;
  cnt_interview?: number | null;
  cnt_offer?: number | null;
  created_at: string;
  updated_at: string;
  // joined
  company_name?: string | null;
  department_name?: string | null;
  sub_department_id?: string | null;
  sub_department_name?: string | null;
  owner_name?: string | null;
  requested_by?: string | null;
  requester_name?: string | null;
  days_open?: number | null;
  // Panel phỏng vấn + người theo dõi (users.id) và tên đã join sẵn để hiển thị.
  interviewer_ids?: string[];
  interviewer_names?: string[];
  follower_ids?: string[];
  follower_names?: string[];
}

const SELECT = `
  SELECT r.*,
         co.name AS company_name,
         d.name  AS department_name,
         sd.name AS sub_department_name,
         u.name  AS owner_name,
         ru.name AS requester_name,
         COALESCE(iv.names, '{}') AS interviewer_names,
         COALESCE(fw.names, '{}') AS follower_names,
         pl.live_total, pl.live_sourcing, pl.live_screening, pl.live_interview, pl.live_offer,
         CASE WHEN r.status IN ('open','on_hold')
              THEN (CURRENT_DATE - r.open_date)
              ELSE NULL END AS days_open
    FROM requisitions r
    LEFT JOIN companies co       ON co.id::text = NULLIF(r.company_id, '')
    LEFT JOIN departments d      ON d.id::text = NULLIF(r.department_id, '')
    LEFT JOIN sub_departments sd ON sd.id::text = NULLIF(r.sub_department_id, '')
    LEFT JOIN users u            ON u.id::text = NULLIF(r.owner_id, '')
    LEFT JOIN users ru           ON ru.id::text = NULLIF(r.requested_by, '')
    LEFT JOIN LATERAL (
      SELECT array_agg(u2.name ORDER BY u2.name) AS names
        FROM users u2 WHERE u2.id::text = ANY(r.interviewer_ids)
    ) iv ON TRUE
    LEFT JOIN LATERAL (
      SELECT array_agg(u3.name ORDER BY u3.name) AS names
        FROM users u3 WHERE u3.id::text = ANY(r.follower_ids)
    ) fw ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)                                          AS live_total,
             COUNT(*) FILTER (WHERE a.status = 'new')          AS live_sourcing,
             COUNT(*) FILTER (WHERE a.status = 'screening')    AS live_screening,
             COUNT(*) FILTER (WHERE a.status = 'interviewed')  AS live_interview,
             COUNT(*) FILTER (WHERE a.status = 'offered')      AS live_offer
        FROM hr_applications a WHERE a.requisition_id = r.id
    ) pl ON TRUE`;

function genId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Pipeline hiển thị = ĐẾM THẬT từ ứng viên đã liên kết (hr_applications), theo giai đoạn
 * hiện tại của từng ứng viên — khớp đúng badge trong danh sách "Ứng viên liên kết".
 * Chỉ khi yêu cầu CHƯA có ứng viên nào mới rơi về số HR nhập tay (cnt_* trong DB, dữ liệu cũ).
 */
function mapRequisition(row: any): Requisition {
  const { live_total, live_sourcing, live_screening, live_interview, live_offer, ...r } = row || {};
  const n = (v: any) => Number(v) || 0;
  if (n(live_total) > 0) {
    r.cnt_sourcing = n(live_sourcing);
    r.cnt_screening = n(live_screening);
    r.cnt_interview = n(live_interview);
    r.cnt_offer = n(live_offer);
  }
  return r as Requisition;
}

/** Chuẩn hoá danh sách users.id: bỏ rỗng, bỏ trùng, giữ thứ tự nhập. */
function normIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => String(x ?? '').trim()).filter(Boolean))];
}

export async function listRequisitions(filter: { status?: string; company_id?: string; owner_id?: string; company_ids?: string[] } = {}): Promise<Requisition[]> {
  const where: string[] = ['r.deleted_at IS NULL'];
  const params: any[] = [];
  if (filter.status) { params.push(filter.status); where.push(`r.status = $${params.length}`); }
  if (filter.company_id) { params.push(filter.company_id); where.push(`r.company_id = $${params.length}`); }
  if (filter.company_ids?.length) { params.push(filter.company_ids); where.push(`r.company_id = ANY($${params.length})`); }
  if (filter.owner_id) { params.push(filter.owner_id); where.push(`r.owner_id = $${params.length}`); }
  const rows = await query<any>(
    `${SELECT} WHERE ${where.join(' AND ')}
     ORDER BY CASE r.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
              r.open_date ASC`,
    params
  );
  return rows.map(mapRequisition);
}

export async function getRequisitionById(id: string): Promise<Requisition | null> {
  const row = await queryOne<any>(`${SELECT} WHERE r.id = $1 AND r.deleted_at IS NULL`, [id]);
  return row ? mapRequisition(row) : null;
}

export async function createRequisition(data: Partial<Requisition>): Promise<Requisition> {
  const row: any = {
    id: genId(),
    title: String(data.title || '').trim(),
    company_id: data.company_id || null,
    department_id: data.department_id || null,
    sub_department_id: data.sub_department_id || null,
    position_id: data.position_id || null,
    jd_id: data.jd_id || null,
    target_headcount: data.target_headcount && data.target_headcount > 0 ? Math.floor(data.target_headcount) : 1,
    filled_count: data.filled_count && data.filled_count > 0 ? Math.floor(data.filled_count) : 0,
    // Mọi yêu cầu mới đều phải qua phê duyệt của admin trước khi xử lý.
    status: 'pending_approval',
    priority: data.priority || 'normal',
    owner_id: data.owner_id || null,
    open_date: data.open_date || new Date().toISOString().slice(0, 10),
    target_close_date: data.target_close_date || null,
    note: data.note || null,
    created_by: data.created_by || null,
    // Người YÊU CẦU: HR tạo hộ thì chọn tường minh; nếu không có, mặc định = người bấm tạo.
    requested_by: data.requested_by || data.created_by || null,
    salary_min: data.salary_min != null ? Math.floor(Number(data.salary_min)) : null,
    salary_max: data.salary_max != null ? Math.floor(Number(data.salary_max)) : null,
    salary_type: data.salary_type || 'negotiable',
    budget_code: data.budget_code || null,
    cnt_sourcing: data.cnt_sourcing != null ? Math.max(0, Math.floor(Number(data.cnt_sourcing))) : 0,
    cnt_screening: data.cnt_screening != null ? Math.max(0, Math.floor(Number(data.cnt_screening))) : 0,
    cnt_interview: data.cnt_interview != null ? Math.max(0, Math.floor(Number(data.cnt_interview))) : 0,
    cnt_offer: data.cnt_offer != null ? Math.max(0, Math.floor(Number(data.cnt_offer))) : 0,
    approved_at: null,
    approved_by: null,
    interviewer_ids: normIds(data.interviewer_ids),
    follower_ids: normIds(data.follower_ids),
  };
  if (!row.title) throw new Error('Tên vị trí tuyển dụng không được để trống');
  const { text, params } = buildInsert('requisitions', row);
  const created = await queryOne<{ id: string }>(text, params);
  const result = (await getRequisitionById(created!.id))!;
  await logRequisition({
    requisitionId: result.id,
    action: 'create',
    details: `Tạo yêu cầu tuyển dụng ${REQ_LABEL(result)} — cần ${result.target_headcount} người.`,
    performedBy: data.created_by || null,
  });
  await ensureRequisitionWorkflow(result.id);
  // Mọi yêu cầu mới đều ở trạng thái pending_approval → báo cho admin/super_admin để phê duyệt.
  await notifyApprovers(
    '⏳ Yêu cầu tuyển dụng mới chờ phê duyệt',
    `${REQ_LABEL(result)} vừa được tạo và đang chờ bạn phê duyệt.`,
    result.id,
    result.company_id ?? null,
  );
  // Báo người phụ trách (owner) biết họ được giao (sẽ xử lý sau khi được duyệt).
  if (result.owner_id) {
    await notifyUser(
      result.owner_id,
      'requisition_assigned',
      '📋 Yêu cầu tuyển dụng mới được giao cho bạn',
      `${REQ_LABEL(result)} đã được giao cho bạn, sẽ xử lý sau khi admin phê duyệt.`,
      result.id,
      HR_URL,
    );
  }
  return result;
}

// Map trạng thái → nội dung thông báo [tiêu đề cho requester, tiêu đề cho owner]
const STATUS_NOTIFY: Partial<Record<ReqStatus, [string, string, string]>> = {
  pending_approval: ['⏳ Yêu cầu tuyển dụng đang chờ phê duyệt', 'Chờ Phê Duyệt', '⏳ Yêu cầu tuyển dụng mới chờ phê duyệt'],
  open:      ['🟢 Yêu cầu tuyển dụng đang được xử lý',   'Đang Tuyển',  '🟢 Yêu cầu bạn phụ trách đang được xử lý'],
  on_hold:   ['⏸ Yêu cầu tuyển dụng tạm dừng',           'Tạm Dừng',    '⏸ Yêu cầu bạn phụ trách bị tạm dừng'],
  filled:    ['🎉 Yêu cầu tuyển dụng đã hoàn thành',      'Hoàn Thành',  '🎉 Yêu cầu bạn phụ trách đã hoàn thành'],
  cancelled: ['🗂 Yêu cầu tuyển dụng đã lưu trữ',         'Lưu Trữ',     '🗂 Yêu cầu bạn phụ trách đã lưu trữ'],
};

export async function updateRequisition(
  id: string,
  data: Partial<Requisition>,
  performedBy?: string | null,
): Promise<Requisition | null> {
  const cur = await getRequisitionById(id);
  if (!cur) return null;
  const upd: any = { updated_at: new Date().toISOString() };
  for (const k of ['title', 'company_id', 'department_id', 'sub_department_id', 'position_id', 'jd_id', 'status', 'priority', 'owner_id', 'requested_by', 'open_date', 'target_close_date', 'note', 'budget_code', 'salary_type'] as const) {
    if (data[k] !== undefined) upd[k] = (data as any)[k] || null;
  }
  if (data.target_headcount !== undefined) upd.target_headcount = Math.max(1, Math.floor(Number(data.target_headcount) || 1));
  if (data.filled_count !== undefined) upd.filled_count = Math.max(0, Math.floor(Number(data.filled_count) || 0));
  if (data.salary_min !== undefined) upd.salary_min = data.salary_min != null ? Math.floor(Number(data.salary_min)) : null;
  if (data.salary_max !== undefined) upd.salary_max = data.salary_max != null ? Math.floor(Number(data.salary_max)) : null;
  for (const k of ['cnt_sourcing', 'cnt_screening', 'cnt_interview', 'cnt_offer'] as const) {
    if (data[k] !== undefined) upd[k] = Math.max(0, Math.floor(Number(data[k]) || 0));
  }
  if (data.interviewer_ids !== undefined) upd.interviewer_ids = normIds(data.interviewer_ids);
  if (data.follower_ids !== undefined) upd.follower_ids = normIds(data.follower_ids);
  if (data.approved_at !== undefined) upd.approved_at = data.approved_at || null;
  if (data.approved_by !== undefined) upd.approved_by = data.approved_by || null;
  // Tự đánh dấu filled_at khi chuyển sang 'filled' (nếu chưa có)
  if (data.status === 'filled' && !cur.filled_at) upd.filled_at = new Date().toISOString().slice(0, 10);
  if (data.status && data.status !== 'filled') upd.filled_at = null;
  const { text, params } = buildUpdateById('requisitions', id, upd);
  await queryOne(text, params);
  const updated = await getRequisitionById(id);

  // Lịch sử: diff trước/sau (bỏ qua nếu không có cột theo dõi nào đổi).
  if (updated) {
    const { changes, details } = buildRequisitionChanges(
      cur as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (Object.keys(changes).length) {
      const statusChanged = !!data.status && data.status !== cur.status;
      await logRequisition({
        requisitionId: id,
        action: statusChanged ? 'status_change' : 'update',
        details,
        changes,
        performedBy: performedBy || null,
      });
    }
  }

  // Thông báo đổi trạng thái cho cả người gửi lẫn người phụ trách
  const newStatus = data.status;
  if (updated && newStatus && newStatus !== cur.status) {
    const cfg = STATUS_NOTIFY[newStatus];
    if (cfg) {
      const [titleReq, statusLabel, titleOwner] = cfg;
      await notifyBoth(
        updated,
        'requisition_status',
        titleReq,
        `${REQ_LABEL(updated)} đã chuyển sang trạng thái: ${statusLabel}.`,
        titleOwner,
        `${REQ_LABEL(updated)} đã chuyển sang trạng thái: ${statusLabel}.`,
      );
    }
    // Thông báo riêng khi owner được giao/thay đổi
    if (data.owner_id && data.owner_id !== cur.owner_id && updated.owner_id) {
      await notifyUser(
        updated.owner_id,
        'requisition_assigned',
        '📋 Bạn được giao phụ trách yêu cầu tuyển dụng',
        `${REQ_LABEL(updated)} vừa được giao cho bạn.`,
        updated.id,
        HR_URL,
      );
    }
  }

  return updated;
}

export async function deleteRequisition(id: string, performedBy?: string | null): Promise<boolean> {
  const r = await execute(`UPDATE requisitions SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id]);
  await logRequisition({ requisitionId: id, action: 'delete', details: 'Xóa yêu cầu tuyển dụng.', performedBy: performedBy || null });
  return (r as any) >= 0;
}

/**
 * Bật/tắt theo dõi cho CHÍNH người đang đăng nhập (nút "Theo dõi" trên thẻ).
 * Trả về bản ghi sau khi cập nhật; `following` = trạng thái mới của người đó.
 */
export async function toggleRequisitionFollow(
  id: string,
  userId: string,
): Promise<{ requisition: Requisition; following: boolean }> {
  const cur = await getRequisitionById(id);
  if (!cur) throw new Error('Không tìm thấy yêu cầu');
  const followers = normIds(cur.follower_ids);
  const following = !followers.includes(userId);
  const next = following ? [...followers, userId] : followers.filter((f) => f !== userId);

  await execute(
    `UPDATE requisitions SET follower_ids = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`,
    [next, id]
  );
  await logRequisition({
    requisitionId: id,
    action: following ? 'follow' : 'unfollow',
    details: following ? 'Bắt đầu theo dõi yêu cầu tuyển dụng.' : 'Bỏ theo dõi yêu cầu tuyển dụng.',
    performedBy: userId,
  });
  return { requisition: (await getRequisitionById(id))!, following };
}

/** Gửi thông báo in-app + Telegram cho 1 user theo userId. */
async function notifyUser(
  userId: string,
  type: string,
  title: string,
  body: string,
  relatedId: string,
  url: string,
): Promise<void> {
  const u = await queryOne<{ id: string }>(
    `SELECT id::text AS id FROM users WHERE id::text = $1 AND status='active'`,
    [userId]
  );
  if (!u) return;
  // Qua engine: in-app + Telegram (nội dung động passthrough). notifType + url giữ nguyên.
  await notify('requisition.generic', { notifType: type, title, body, url }, { recipients: [u.id], relatedId });
}

/**
 * Gửi thông báo cho người có quyền phê duyệt yêu cầu tuyển dụng — SCOPE theo công ty
 * của yêu cầu (kèm kiêm nhiệm); admin công ty khác không nhận. super_admin nhận tất cả.
 */
async function notifyApprovers(title: string, body: string, relatedId: string, companyId?: string | null): Promise<void> {
  const admins = await query<{ id: string }>(
    `SELECT DISTINCT u.id::text AS id
       FROM users u
       LEFT JOIN user_company_memberships m
         ON m.user_id = u.id AND m.is_active = TRUE
      WHERE u.status = 'active'
        AND (
          u.role = 'super_admin'
          OR (
            u.role = 'admin'
            AND u.module_permissions->'hr-requisitions' @> '"approve"'
            AND ($1::text IS NULL OR u.company_id::text = $1 OR m.company_id::text = $1)
          )
        )`,
    [companyId ?? null]
  );
  for (const a of admins) {
    await notifyUser(a.id, 'requisition_approval', title, body, relatedId, HR_URL);
  }
}

/**
 * Gửi thông báo cho cả người gửi (created_by) lẫn người phụ trách (owner_id),
 * bỏ qua nếu cùng 1 người hoặc không có.
 */
async function notifyBoth(
  req: Requisition,
  type: string,
  titleRequester: string,
  bodyRequester: string,
  titleOwner: string,
  bodyOwner: string,
): Promise<void> {
  const sent = new Set<string>();
  if (req.created_by) {
    await notifyUser(req.created_by, type, titleRequester, bodyRequester, req.id, ORDER_URL);
    sent.add(req.created_by);
  }
  if (req.owner_id && !sent.has(req.owner_id)) {
    await notifyUser(req.owner_id, type, titleOwner, bodyOwner, req.id, HR_URL);
  }
}

const REQ_LABEL = (req: Requisition) =>
  `"${req.title}"${req.company_name ? ` · ${req.company_name}` : ''}`;

/** Tiếp nhận yêu cầu (pending → open) + báo cả 2 bên. */
export async function acceptRequisition(id: string, byUserId: string | null): Promise<Requisition> {
  const cur = await getRequisitionById(id);
  if (!cur) throw new Error('Không tìm thấy yêu cầu');
  if (cur.status !== 'pending') throw new Error('Chỉ tiếp nhận được yêu cầu đang chờ tiếp nhận');
  const { text, params } = buildUpdateById('requisitions', id, {
    status: 'open', accepted_at: new Date().toISOString(), accepted_by: byUserId || null, updated_at: new Date().toISOString(),
  });
  await queryOne(text, params);
  const updated = (await getRequisitionById(id))!;
  await logRequisition({
    requisitionId: id, action: 'accept', performedBy: byUserId,
    details: 'Tiếp nhận yêu cầu — chuyển sang Đang tuyển.',
  });
  await notifyBoth(
    updated,
    'requisition_status',
    `✅ Yêu cầu tuyển dụng đã được tiếp nhận`,
    `${REQ_LABEL(updated)} đã được bộ phận Tuyển Dụng tiếp nhận và bắt đầu xử lý.`,
    `✅ Yêu cầu tuyển dụng bạn phụ trách đã được mở`,
    `${REQ_LABEL(updated)} vừa được tiếp nhận và chuyển sang trạng thái Đang Tuyển.`,
  );
  return updated;
}

/** Từ chối yêu cầu (pending → rejected) kèm lý do + báo cả 2 bên. */
export async function rejectRequisition(id: string, byUserId: string | null, reason: string): Promise<Requisition> {
  const cur = await getRequisitionById(id);
  if (!cur) throw new Error('Không tìm thấy yêu cầu');
  if (cur.status !== 'pending') throw new Error('Chỉ từ chối được yêu cầu đang chờ tiếp nhận');
  const r = String(reason || '').trim();
  if (!r) throw new Error('Vui lòng nhập lý do từ chối');
  const { text, params } = buildUpdateById('requisitions', id, {
    status: 'rejected', rejected_at: new Date().toISOString(), rejected_by: byUserId || null, reject_reason: r, updated_at: new Date().toISOString(),
  });
  await queryOne(text, params);
  const updated = (await getRequisitionById(id))!;
  await logRequisition({
    requisitionId: id, action: 'reject', performedBy: byUserId,
    details: `Từ chối yêu cầu. Lý do: ${r}`,
  });
  await notifyBoth(
    updated,
    'requisition_status',
    `❌ Yêu cầu tuyển dụng bị từ chối`,
    `${REQ_LABEL(updated)} đã bị từ chối. Lý do: ${r}`,
    `❌ Yêu cầu tuyển dụng bạn phụ trách bị từ chối`,
    `${REQ_LABEL(updated)} đã bị từ chối. Lý do: ${r}`,
  );
  return updated;
}

/** Phê duyệt yêu cầu (pending_approval → pending) — chỉ admin/super_admin. */
export async function approveRequisition(id: string, byUserId: string | null): Promise<Requisition> {
  const cur = await getRequisitionById(id);
  if (!cur) throw new Error('Không tìm thấy yêu cầu');
  if (cur.status !== 'pending_approval') throw new Error('Yêu cầu không ở trạng thái chờ duyệt');
  const { text, params } = buildUpdateById('requisitions', id, {
    status: 'pending',
    approved_at: new Date().toISOString(),
    approved_by: byUserId || null,
    updated_at: new Date().toISOString(),
  });
  await queryOne(text, params);
  const updated = (await getRequisitionById(id))!;
  await logRequisition({
    requisitionId: id, action: 'approve', performedBy: byUserId,
    details: 'Phê duyệt yêu cầu — chuyển sang Chờ tiếp nhận.',
  });
  // Thông báo cho người phụ trách (owner/recruiter) nếu đã được chỉ định
  if (updated.owner_id) {
    await notifyUser(
      updated.owner_id,
      'requisition_status',
      '✅ Yêu cầu tuyển dụng đã được duyệt',
      `${REQ_LABEL(updated)} đã được phê duyệt và sẵn sàng để bạn tiếp nhận xử lý.`,
      updated.id,
      HR_URL,
    );
  }
  // Thông báo cho người tạo yêu cầu
  if (updated.created_by) {
    await notifyUser(
      updated.created_by,
      'requisition_status',
      '✅ Yêu cầu tuyển dụng đã được phê duyệt',
      `${REQ_LABEL(updated)} đã được phê duyệt và chuyển tới bộ phận Tuyển Dụng.`,
      updated.id,
      ORDER_URL,
    );
  }
  return updated;
}

export interface RequisitionStats {
  open: number;
  onHold: number;
  filledThisMonth: number;
  totalTarget: number;       // tổng cần tuyển (open + on_hold)
  totalFilled: number;       // tổng đã tuyển của các req đang mở
  avgTimeToFill: number;     // ngày trung bình (req đã filled)
  byPriority: { label: string; value: number }[];
  aging: { id: string; title: string; days_open: number; owner_name: string | null; target_headcount: number; filled_count: number }[];
  byOwner: { label: string; value: number }[];
}

/** Số liệu requisition cho dashboard. companyId = scope theo công ty (admin); bỏ trống = toàn bộ. */
export async function getRequisitionStats(companyId?: string): Promise<RequisitionStats> {
  // Lọc công ty qua tham số $1 (an toàn injection). Bí danh khác nhau giữa các query.
  const p = companyId ? [companyId] : [];
  const cAgg = companyId ? `AND company_id::text = $1` : '';
  const cR   = companyId ? `AND r.company_id::text = $1` : '';
  const [agg, prio, aging, owner] = await Promise.all([
    queryOne<any>(
      `SELECT
         COUNT(*) FILTER (WHERE status='open') AS open,
         COUNT(*) FILTER (WHERE status='on_hold') AS on_hold,
         COUNT(*) FILTER (WHERE status='filled' AND filled_at >= date_trunc('month', CURRENT_DATE)) AS filled_month,
         COALESCE(SUM(target_headcount) FILTER (WHERE status IN ('open','on_hold')), 0) AS total_target,
         COALESCE(SUM(filled_count)     FILTER (WHERE status IN ('open','on_hold')), 0) AS total_filled,
         AVG(filled_at - open_date) FILTER (WHERE status='filled' AND filled_at IS NOT NULL) AS avg_ttf
       FROM requisitions WHERE deleted_at IS NULL ${cAgg}`, p
    ),
    query<any>(
      `SELECT priority AS label, COUNT(*) AS value FROM requisitions
        WHERE deleted_at IS NULL AND status IN ('open','on_hold') ${cAgg} GROUP BY priority`, p
    ),
    query<any>(
      `SELECT r.id, r.title, (CURRENT_DATE - r.open_date) AS days_open, r.target_headcount, r.filled_count, u.name AS owner_name
         FROM requisitions r LEFT JOIN users u ON u.id::text = NULLIF(r.owner_id, '')
        WHERE r.deleted_at IS NULL AND r.status IN ('open','on_hold') ${cR}
        ORDER BY days_open DESC LIMIT 15`, p
    ),
    query<any>(
      `SELECT COALESCE(u.name, 'Chưa giao') AS label, COUNT(*) AS value
         FROM requisitions r LEFT JOIN users u ON u.id::text = NULLIF(r.owner_id, '')
        WHERE r.deleted_at IS NULL AND r.status IN ('open','on_hold') ${cR}
        GROUP BY 1 ORDER BY value DESC`, p
    ),
  ]);

  const num = (v: any) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  return {
    open: num(agg?.open), onHold: num(agg?.on_hold), filledThisMonth: num(agg?.filled_month),
    totalTarget: num(agg?.total_target), totalFilled: num(agg?.total_filled),
    avgTimeToFill: Math.round(num(agg?.avg_ttf) * 10) / 10,
    byPriority: prio.map((p) => ({ label: p.label, value: num(p.value) })),
    aging: aging.map((a) => ({ id: a.id, title: a.title, days_open: num(a.days_open), owner_name: a.owner_name, target_headcount: num(a.target_headcount), filled_count: num(a.filled_count) })),
    byOwner: owner.map((o) => ({ label: o.label, value: num(o.value) })),
  };
}
