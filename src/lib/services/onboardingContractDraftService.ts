/**
 * Tự động tạo bản nháp 2 thỏa thuận cho nhân sự MỚI, lịch suy ra từ ngày vào làm:
 * tạo ĐÚNG 1 ngày trước hire_date (giờ VN), kèm bắt kịp vào đúng ngày vào làm nếu lỡ:
 *   - Thỏa thuận hợp tác           (contract_type ctype_cooperation)
 *   - Thỏa thuận bảo mật thông tin (contract_type ctype_nda — migration 101)
 *
 * Lưu vào "Quản Lý Hợp Đồng" dạng nháp (status='draft'), KHÔNG kèm file (bản ghi rỗng
 * đánh dấu "cần chuẩn bị"). HR/C&B hoàn thiện nội dung & ký; khi hoàn tất, luồng lưu trữ
 * hợp đồng sẵn có (migration 095/096) tự đẩy bản đã ký vào Hồ Sơ Nhân Sự.
 *
 * Idempotent: nếu nhân sự đã có hợp đồng thuộc loại đó thì BỎ QUA (không tạo trùng) —
 * an toàn khi scheduler tick lặp nhiều lần trong cùng khung giờ.
 */
import { query } from '@/lib/db';
import { createContract } from './contractService';
import { getHrNotifyRecipientUserIds } from './hrSettingsService';
import { notify } from '@/lib/notifications/engine';
import { listWatchers } from './contractWatcherService';
import { getContractTypesForEmploymentType } from './employmentTypeContractService';
import { generateContractCode } from './contractCodeService';
import { getHrAutomationConfig } from './systemSettingsService';

/**
 * Loại thỏa thuận mặc định khi nhân sự CHƯA gắn hình thức làm việc (hoặc hình thức chưa map
 * loại HĐ nào). Giữ nguyên hành vi cũ để không vỡ luồng đang chạy.
 */
const ONBOARDING_FALLBACK_TYPES: { typeId: string; prefix: string; label: string }[] = [
  { typeId: 'ctype_cooperation', prefix: 'TTHT', label: 'Thỏa thuận hợp tác' },
  { typeId: 'ctype_nda', prefix: 'TTBM', label: 'Thỏa thuận bảo mật thông tin' },
];

interface NewHire {
  id: string;
  name: string | null;
  employee_code: string | null;
  employment_type_id: string | null;
  hire_date: string | null; // YYYY-MM-DD (có thể null khi tạo nháp thủ công sớm)
}

/**
 * Sinh số hợp đồng cho bản nháp onboarding: ưu tiên template cấu hình; nếu thiếu cấu hình
 * (loại chưa có mã / nhân viên chưa có công ty) thì fallback format ad-hoc để vẫn tạo được nháp.
 */
async function buildDraftNumber(
  typeId: string,
  prefix: string,
  hire: NewHire
): Promise<string> {
  try {
    return await generateContractCode(typeId, hire.id);
  } catch {
    const empPart = (hire.employee_code || hire.id).toString().replace(/-/g, '').slice(0, 12).toUpperCase();
    const datePart = (hire.hire_date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    return `${prefix}-${empPart}-${datePart}`;
  }
}

/** Bản nháp vừa tạo cho 1 nhân sự — gom để báo C&B 1 thông báo/nhân sự. */
interface CreatedDraftsForHire {
  hire: NewHire;
  contractId: string; // id 1 hợp đồng để mở link
  labels: string[];   // tên các thỏa thuận đã tạo
}

export interface OnboardingDraftResult {
  /** Số nhân sự có hire_date = ngày mai. */
  hires: number;
  /** Số bản nháp đã tạo mới. */
  created: number;
  /** Số bản bỏ qua vì đã tồn tại hợp đồng cùng loại. */
  skipped: number;
}

/**
 * Tạo các bản nháp thỏa thuận cho 1 nhân sự (dùng chung cho scheduler & nút thủ công).
 * Idempotent: bỏ qua loại HĐ đã có. Trả về số tạo mới / bỏ qua + entry để gửi thông báo.
 * KHÔNG tự gửi notify ở đây — caller quyết định gộp/gửi (tránh spam khi chạy batch).
 */
async function createDraftsForHire(
  h: NewHire
): Promise<{ created: number; skipped: number; entry: CreatedDraftsForHire | null }> {
  // Loại HĐ cần tạo nháp: ưu tiên các loại đã gắn với hình thức làm việc của nhân sự;
  // nếu chưa gắn (hoặc chưa có hình thức) → dùng cặp mặc định cũ.
  let types: { typeId: string; prefix: string; label: string }[] = [];
  if (h.employment_type_id) {
    try {
      const mapped = await getContractTypesForEmploymentType(h.employment_type_id);
      types = mapped.map((m) => ({ typeId: m.id, prefix: m.code || 'HD', label: m.name }));
    } catch (e) {
      console.error(`[OnboardingDraft] Lỗi lấy mapping loại HĐ cho ${h.id}:`, (e as Error).message);
    }
  }
  if (types.length === 0) types = ONBOARDING_FALLBACK_TYPES;

  let created = 0;
  let skipped = 0;
  const newDrafts: { contractId: string; label: string }[] = [];
  for (const t of types) {
    try {
      // Idempotent: đã có hợp đồng loại này cho nhân sự → bỏ qua (kể cả do scheduler hay nút thủ công).
      const existing = await query<{ id: string }>(
        `SELECT id FROM contracts WHERE employee_id = $1 AND contract_type_id = $2 LIMIT 1`,
        [h.id, t.typeId]
      );
      if (existing.length > 0) { skipped++; continue; }

      const contractNumber = await buildDraftNumber(t.typeId, t.prefix, h);
      const dateNote = h.hire_date ? `tạo trước ngày vào làm (${h.hire_date})` : 'tạo thủ công';
      const contract = await createContract({
        employee_id: h.id,
        contract_type_id: t.typeId,
        contract_number: contractNumber,
        start_date: h.hire_date,
        status: 'draft',
        notes: `[Tự động] Bản nháp ${t.label} ${dateNote}. Vui lòng hoàn thiện nội dung và ký.`,
        created_by: null,
      });
      created++;
      newDrafts.push({ contractId: contract.id, label: t.label });
      console.log(`[OnboardingDraft] Tạo nháp "${t.label}" cho ${h.name || h.id} (${contractNumber})`);
    } catch (err) {
      // Một lỗi (vd: trùng contract_number) không được chặn cả batch.
      console.error(`[OnboardingDraft] Lỗi tạo nháp ${t.typeId} cho ${h.id}:`, err);
    }
  }

  const entry: CreatedDraftsForHire | null = newDrafts.length > 0
    ? { hire: h, contractId: newDrafts[0].contractId, labels: newDrafts.map((d) => d.label) }
    : null;
  return { created, skipped, entry };
}

/**
 * Tạo bản nháp thỏa thuận cho nhân sự có hire_date = ngày mai (giờ VN).
 * Gọi bởi scheduler 9h VN và route cron thủ công.
 */
export async function runOnboardingContractDrafts(): Promise<OnboardingDraftResult> {
  // Số ngày tạo nháp TRƯỚC ngày vào làm — cấu hình ở /cau-hinh-he-thong (mặc định 1 = hành vi cũ).
  // Tăng giá trị này để mốc tạo không rơi vào cuối tuần (vd vào làm Thứ 2 → đặt 3 để tạo từ Thứ 6).
  const { onboardingDraftLeadDays } = await getHrAutomationConfig();
  const leadDays = Number.isInteger(onboardingDraftLeadDays) && onboardingDraftLeadDays >= 1 ? onboardingDraftLeadDays : 1;

  // Nhân sự active sắp vào làm: hire_date trong khoảng [hôm nay, hôm nay + leadDays] theo giờ VN.
  // - Bắt khi còn ≤ leadDays ngày tới ngày vào làm → tạo nháp sớm theo cấu hình.
  // - Bắt kịp (catch-up): nếu hôm trước server down/lỡ khung giờ, ngày vào làm vẫn tạo.
  //   Idempotent (bỏ qua nếu đã có) đảm bảo không tạo trùng giữa các ngày trong cửa sổ.
  const hires = await query<NewHire>(
    `SELECT id::text AS id, name, employee_code, employment_type_id, hire_date::text AS hire_date
       FROM users
      WHERE status = 'active'
        AND hire_date IS NOT NULL
        AND hire_date >= (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        AND hire_date <= (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + $1::int`,
    [leadDays]
  );

  let created = 0;
  let skipped = 0;
  const createdPerHire: CreatedDraftsForHire[] = [];

  for (const h of hires) {
    const r = await createDraftsForHire(h);
    created += r.created;
    skipped += r.skipped;
    if (r.entry) createdPerHire.push(r.entry);
  }

  // Báo C&B/QTV về nháp mới (chỉ khi THỰC SỰ tạo mới → không spam khi tick lặp).
  if (createdPerHire.length > 0) {
    try {
      await notifyHrNewDrafts(createdPerHire);
    } catch (e) {
      console.error('[OnboardingDraft] Lỗi gửi thông báo C&B:', (e as Error).message);
    }
  }

  return { hires: hires.length, created, skipped };
}

/**
 * Tạo nháp HĐ NGAY cho 1 nhân sự (nút thủ công ở Onboarding), KHÔNG chờ tới mốc scheduler.
 * - Bỏ ràng buộc cửa sổ ngày: tạo bất kể hire_date còn xa.
 * - Vẫn idempotent: loại HĐ đã có thì bỏ qua → khi scheduler chạy đúng ngày sẽ KHÔNG tạo lại.
 * - Gửi cùng thông báo C&B như luồng tự động (chỉ khi thực sự tạo mới).
 */
export async function runOnboardingDraftsForEmployee(employeeId: string): Promise<OnboardingDraftResult> {
  const rows = await query<NewHire>(
    `SELECT id::text AS id, name, employee_code, employment_type_id, hire_date::text AS hire_date
       FROM users WHERE id::text = $1 AND status = 'active'`,
    [employeeId]
  );
  if (rows.length === 0) return { hires: 0, created: 0, skipped: 0 };

  const r = await createDraftsForHire(rows[0]);
  if (r.entry) {
    try {
      await notifyHrNewDrafts([r.entry]);
    } catch (e) {
      console.error('[OnboardingDraft] Lỗi gửi thông báo C&B (thủ công):', (e as Error).message);
    }
  }
  return { hires: 1, created: r.created, skipped: r.skipped };
}

/**
 * Gửi thông báo (in-app + Telegram qua notifyUser) cho người nhận thông báo
 * Quản Lý Hồ Sơ + người theo dõi (watcher) hợp đồng đó.
 *
 * Recipients = cấu hình ở tab Cài Đặt → Người Nhận Thông Báo (super_admin set).
 *              PLUS các watcher đã đính kèm cho từng bản nháp.
 * Dedup theo user_id để tránh nhận trùng. notifyUser tôn trọng cờ telegram_enabled.
 */
async function notifyHrNewDrafts(items: CreatedDraftsForHire[]): Promise<void> {
  const baseIds: string[] = await getHrNotifyRecipientUserIds();

  for (const it of items) {
    const emp = it.hire.name || it.hire.id;

    // (3) watchers riêng cho bản nháp này (nếu C&B đã đính kèm)
    let watcherIds: string[] = [];
    try {
      const watchers = await listWatchers(it.contractId);
      watcherIds = watchers.map(w => w.user_id);
    } catch (e) {
      console.error('[OnboardingDraft] listWatchers error:', (e as Error).message);
    }

    const allIds = Array.from(new Set([...baseIds, ...watcherIds])).filter(Boolean);
    if (allIds.length === 0) {
      console.warn(`[OnboardingDraft] Không có người nhận thông báo cho nháp ${it.contractId}`);
      continue;
    }

    try {
      await notify('onboarding.contractDraft', {
        labels: it.labels.join(' và '), emp, hireDate: it.hire.hire_date ?? 'chưa đặt',
      }, { recipients: allIds, relatedId: it.contractId });
    } catch (e) {
      console.error('[OnboardingDraft] notify error:', (e as Error).message);
    }
  }
}
