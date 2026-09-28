/**
 * Dịch vụ trạng thái tuyển dụng theo TỪNG VỊ TRÍ (hr_applications).
 *
 * Nguồn sự thật cho quyết định Loại/Offer/... là hr_applications.status (per cv×requisition),
 * KHÔNG phải hr_cv_pool.status. Một CV có thể "Loại" ở vị trí A nhưng vẫn ứng tuyển vị trí B.
 *
 * Luật nghiệp vụ (user chốt):
 *  1. Khóa độc quyền: CV vào Phỏng vấn/Offer/Đã Onboard ở 1 vị trí → không cho gắn/đẩy tiếp
 *     ở vị trí khác. Bị Loại ở vị trí đó → mở khóa, sẵn sàng gắn nơi khác.
 *  2. Trạng thái theo vị trí được phản ánh lên Kho CV để hồ sơ luôn nằm đúng tab.
 */
import { query, queryOne, execute, withTransaction } from '@/lib/db';

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** 7 giai đoạn — khớp candidateShared.STAGES. */
export const APPLICATION_STAGES = ['new', 'screening', 'interviewed', 'offered', 'hired', 'rejected', 'pool'] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

/** Giai đoạn "cam kết" — khi ở đây, CV bị khóa độc quyền với các vị trí khác. */
export const LOCKED_STAGES: ReadonlySet<string> = new Set(['interviewed', 'offered', 'hired']);

export type ActorRole = 'requester' | 'recruiter';

export interface ApplicationLock {
  application_id: string;
  requisition_id: string;
  requisition_title: string | null;
  status: string;
}

/**
 * Trả về liên kết đang KHÓA CV (đang ở giai đoạn cam kết) nếu có, bỏ qua 1 application (khi tự đổi).
 * Dùng để chặn gắn/đẩy CV vào vị trí khác khi đang phỏng vấn/offer/đã tuyển nơi khác.
 */
export async function getCvLock(cvId: string, exceptAppId?: string): Promise<ApplicationLock | null> {
  const row = await queryOne<ApplicationLock>(
    `SELECT a.id AS application_id, a.requisition_id, a.status, r.title AS requisition_title
       FROM hr_applications a
       LEFT JOIN requisitions r ON r.id = a.requisition_id
      WHERE a.cv_id = $1
        AND a.status IN ('interviewed','offered','hired')
        AND ($2::text IS NULL OR a.id <> $2)
      ORDER BY a.updated_at DESC
      LIMIT 1`,
    [cvId, exceptAppId ?? null],
  );
  return row ?? null;
}

/** Nếu CV đang khóa ở vị trí khác → ném lỗi có tên vị trí (chặn gắn/đẩy). */
export async function assertCvNotLocked(cvId: string, exceptAppId?: string): Promise<void> {
  const lock = await getCvLock(cvId, exceptAppId);
  if (lock) {
    const pos = lock.requisition_title ? `“${lock.requisition_title}”` : 'một vị trí khác';
    throw new Error(`Ứng viên đang ở vòng ${STAGE_LABEL[lock.status] ?? lock.status} tại ${pos} — không thể gắn/đổi sang vị trí khác cho tới khi bị loại tại đó.`);
  }
}

const STAGE_LABEL: Record<string, string> = {
  new: 'Mới', screening: 'Sàng lọc', interviewed: 'Phỏng vấn',
  offered: 'Offer', hired: 'Đã Onboard', rejected: 'Loại', pool: 'Lưu kho',
};

export interface ApplicationRow {
  id: string; cv_id: string; requisition_id: string; status: string | null;
}

export interface ChangeStatusOpts {
  actorRole: ActorRole;
  changedBy: string | null;
  note?: string | null;
  rejectReason?: string | null;      // ghi chú tự do khi loại
  rejectReasonCode?: string | null;  // mã lý do chuẩn (nhóm thống kê)
}

/**
 * Đổi trạng thái 1 application (theo vị trí) + ghi lịch sử.
 * - Enforce khóa độc quyền khi đẩy sang giai đoạn cam kết (interviewed/offered/hired).
 * - Loại → giữ application ở 'rejected' (mở khóa CV để gắn nơi khác).
 * - Đồng bộ trạng thái đích lên hr_cv_pool để các tab Kho CV không bị lệch.
 * Trả về application sau khi đổi (kèm tiêu đề vị trí).
 */
export async function changeApplicationStatus(
  appId: string,
  toStatus: ApplicationStage,
  opts: ChangeStatusOpts,
): Promise<ApplicationRow> {
  if (!APPLICATION_STAGES.includes(toStatus)) {
    throw new Error('Trạng thái không hợp lệ');
  }
  const rejectReason = toStatus === 'rejected' ? (opts.rejectReason ?? opts.note ?? null) : null;
  const rejectCode = toStatus === 'rejected' ? (opts.rejectReasonCode ?? null) : null;

  // Toàn bộ đọc–ghi trong 1 transaction: khóa hàng để check-then-act nguyên tử, và dựa
  // partial unique index uq_hr_app_committed_per_cv để chống race (2 request cùng đẩy 1 CV
  // vào giai đoạn cam kết ở 2 vị trí) — Postgres tự chối cái thứ 2 (lỗi 23505).
  let app: ApplicationRow;
  let changed = false;
  try {
    app = await withTransaction(async (client) => {
      const cur = await client.query<ApplicationRow>(
        `SELECT id, cv_id, requisition_id, status FROM hr_applications WHERE id = $1 FOR UPDATE`,
        [appId],
      );
      const a = cur.rows[0];
      if (!a) throw new Error('Không tìm thấy liên kết ứng tuyển');

      const fromStatus = a.status ?? null;
      if (fromStatus === toStatus) return a;
      changed = true;

      if (LOCKED_STAGES.has(toStatus)) {
        // Khóa các application cam kết khác của cùng CV rồi kiểm tra (nguyên tử trong tx).
        const lock = await client.query<{ requisition_title: string | null; status: string }>(
          `SELECT r.title AS requisition_title, a.status
             FROM hr_applications a LEFT JOIN requisitions r ON r.id = a.requisition_id
            WHERE a.cv_id = $1 AND a.status IN ('interviewed','offered','hired') AND a.id <> $2
            FOR UPDATE OF a`,
          [a.cv_id, appId],
        );
        if (lock.rows[0]) {
          const l = lock.rows[0];
          const pos = l.requisition_title ? `“${l.requisition_title}”` : 'một vị trí khác';
          throw new Error(`Ứng viên đang ở vòng ${STAGE_LABEL[l.status] ?? l.status} tại ${pos} — không thể đổi sang vị trí khác cho tới khi bị loại tại đó.`);
        }
      }

      await client.query(
        `UPDATE hr_applications
            SET status = $1, decided_by = $2, decided_at = NOW(), updated_at = NOW(),
                reject_reason = $3, reject_reason_code = $4
          WHERE id = $5`,
        [toStatus, opts.changedBy ?? null, rejectReason, rejectCode, appId],
      );
      await client.query(
        `INSERT INTO hr_application_history
           (id, application_id, cv_id, requisition_id, from_status, to_status, actor_role, note, changed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [genId('aph'), appId, a.cv_id, a.requisition_id, fromStatus, toStatus,
         opts.actorRole, opts.note ?? rejectReason ?? null, opts.changedBy ?? null],
      );
      // Kho CV là góc nhìn tổng hợp: luôn đưa hồ sơ vào đúng tab vừa được
      // cập nhật ở pipeline theo vị trí. Mã `hired` giữ nguyên để tương thích
      // dữ liệu cũ; giao diện hiển thị là “Đã Onboard”.
      const cv = await client.query<{ status: string }>(
        `SELECT status FROM hr_cv_pool WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [a.cv_id],
      );
      const previousCvStatus = cv.rows[0]?.status ?? null;
      if (previousCvStatus !== toStatus) {
        await client.query(
          `UPDATE hr_cv_pool SET status = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`,
          [toStatus, a.cv_id],
        );
        await client.query(
          `INSERT INTO hr_cv_stage_history (id, cv_id, from_status, to_status, changed_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [genId('cvh'), a.cv_id, previousCvStatus, toStatus, opts.changedBy ?? null],
        );
      }
      return { ...a, status: toStatus };
    });
  } catch (e: any) {
    // Vi phạm partial unique index (race) → cùng thông điệp khóa độc quyền.
    if (e?.code === '23505') {
      throw new Error('Ứng viên vừa được đưa vào vòng cam kết ở một vị trí khác — không thể đổi sang vị trí này.');
    }
    throw e;
  }

  // Không đổi gì (trạng thái trùng) → khỏi bắn thông báo.
  if (!changed) return app;

  // Thông báo chéo (fire-and-forget, SAU khi commit) cho phía còn lại — in-app + Telegram.
  import('./notificationsService')
    .then((m) => m.sendApplicationStatusNotification({
      requisitionId: app.requisition_id, cvId: app.cv_id, toStatus,
      actorRole: opts.actorRole, changedBy: opts.changedBy ?? null,
    }))
    .catch((e) => console.error('[changeApplicationStatus] notify error:', e));

  return app;
}

export interface ApplicationDetail {
  id: string; cv_id: string; requisition_id: string; requisition_title: string | null;
  status: string; reject_reason: string | null; reject_reason_code: string | null;
  decided_by: string | null; decided_by_name: string | null; decided_at: string | null;
  requisition_owner_id: string | null; requisition_created_by: string | null;
}

/** Lấy 1 application (tùy chọn ràng buộc thuộc requisition) kèm thông tin vị trí. */
export async function getApplication(appId: string, requisitionId?: string): Promise<ApplicationDetail | null> {
  const row = await queryOne<ApplicationDetail>(
    `SELECT a.id, a.cv_id, a.requisition_id, r.title AS requisition_title,
            a.status, a.reject_reason, a.reject_reason_code, a.decided_by, u.name AS decided_by_name, a.decided_at,
            r.owner_id AS requisition_owner_id, r.created_by AS requisition_created_by
       FROM hr_applications a
       LEFT JOIN requisitions r ON r.id = a.requisition_id
       LEFT JOIN users u ON u.id::text = a.decided_by
      WHERE a.id = $1 AND ($2::text IS NULL OR a.requisition_id = $2)`,
    [appId, requisitionId ?? null],
  );
  return row ?? null;
}

export interface ApplicationHistoryEvent {
  id: string; application_id: string; cv_id: string; requisition_id: string;
  requisition_title: string | null; from_status: string | null; to_status: string;
  actor_role: string | null; note: string | null; changed_by: string | null;
  changed_by_name: string | null; created_at: string;
}

/** Lịch sử quyết định của MỌI vị trí gắn với 1 CV (cho mục "Lịch sử theo vị trí"). */
export async function listApplicationHistoryForCv(cvId: string): Promise<ApplicationHistoryEvent[]> {
  return query<ApplicationHistoryEvent>(
    `SELECT h.id, h.application_id, h.cv_id, h.requisition_id, r.title AS requisition_title,
            h.from_status, h.to_status, h.actor_role, h.note, h.changed_by,
            u.name AS changed_by_name, h.created_at
       FROM hr_application_history h
       LEFT JOIN requisitions r ON r.id = h.requisition_id
       LEFT JOIN users u ON u.id::text = h.changed_by
      WHERE h.cv_id = $1
      ORDER BY h.created_at DESC`,
    [cvId],
  );
}
