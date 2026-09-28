/**
 * eventCatalog.ts — danh mục SỰ KIỆN thông báo (lớp ngữ nghĩa trên `type`).
 *
 * Mỗi event ánh xạ: key template (registry), giá trị `notifications.type` GIỮ NGUYÊN
 * (không vỡ UI/filter cũ), icon fallback, mẫu related_url, nhãn nút Telegram, kênh.
 *
 * Đây là nền của engine `notify(eventKey, vars, opts)` (M1). Call site sẽ chuyển sang
 * phát event ở M2 — hiện CHƯA ai gọi nên thêm file này không đổi hành vi.
 */

export type Channel = 'inapp' | 'telegram';

export interface NotificationEvent {
  key: string;
  /** Key template trong notification_templates; hàm nếu phụ thuộc trạng thái (vd hợp đồng). */
  templateKey: string | ((vars: Record<string, string | number>) => string);
  /** Giá trị cột notifications.type — GIỮ NGUYÊN giá trị lịch sử; hàm nếu phụ thuộc vars. */
  notifType: string | ((vars: Record<string, string | number>) => string);
  /** Kênh mặc định. */
  channels: Channel[];
  /** Nhãn nút trên Telegram (mặc định 'Xem chi tiết'); hàm nếu phụ thuộc vars. */
  telegramButtonLabel?: string | ((vars: Record<string, string | number>) => string);
  /** Mẫu đường dẫn nội bộ; nhận vars (thường có {{relatedId}}). */
  relatedUrl?: (vars: Record<string, string | number>) => string | null;
  /**
   * Bật gộp Telegram khi nhiều tin cùng nhóm tới một người trong một lượt drain.
   *  - group: khoá gộp (vd 'asset'); title: tiêu đề tin tóm tắt; landingUrl: nút "xem tất cả".
   * Hàm nếu phụ thuộc vars (vd tách theo approved/rejected); trả undefined = không gộp.
   * Bỏ trống = không gộp (gửi lẻ, hành vi cũ).
   */
  digest?: DigestCfg | ((vars: Record<string, string | number>) => DigestCfg | undefined);
}

interface DigestCfg { group: string; title: string; landingUrl: string }

const DEFAULT_CHANNELS: Channel[] = ['inapp', 'telegram'];

/**
 * Catalog khởi đầu = 5 nhắc Quản Lý Hồ Sơ (đã có template). Bổ sung dần các nhóm khác
 * ở các đợt sau (ticket, đặt phòng, onboarding…), mỗi nhóm thêm entry + wire call site.
 */
export const NOTIFICATION_EVENTS: Record<string, NotificationEvent> = {
  // ── Solace (quán cà phê) ──
  'solace.order_new': {
    key: 'solace.order_new',
    templateKey: 'solace_order_new',
    notifType: 'solace_order_new',
    channels: ['inapp'], // Telegram cho admin dùng tin có NÚT điều khiển (solaceBotAdmin), không gửi tin phẳng
    relatedUrl: () => '/solace/pos',
  },
  'solace.order_ready': {
    key: 'solace.order_ready',
    templateKey: 'solace_order_ready',
    notifType: 'solace_order_ready',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem đơn',
    relatedUrl: () => '/solace/don-cua-toi',
  },
  'solace.wallet_payment': {
    key: 'solace.wallet_payment', templateKey: 'solace_wallet_payment', notifType: 'solace_wallet_payment',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem ví', relatedUrl: () => '/solace/vi',
  },
  'solace.payment_confirmed': {
    key: 'solace.payment_confirmed', templateKey: 'solace_payment_confirmed', notifType: 'solace_payment_confirmed',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem đơn', relatedUrl: () => '/solace/don-cua-toi',
  },
  'solace.wallet_refund': {
    key: 'solace.wallet_refund', templateKey: 'solace_wallet_refund', notifType: 'solace_wallet_refund',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem ví', relatedUrl: () => '/solace/vi',
  },
  'solace.topup_rejected': {
    key: 'solace.topup_rejected', templateKey: 'solace_topup_rejected', notifType: 'solace_topup_rejected',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem ví', relatedUrl: () => '/solace/vi',
  },
  'solace.order_cancelled': {
    key: 'solace.order_cancelled', templateKey: 'solace_order_cancelled', notifType: 'solace_order_cancelled',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem đơn', relatedUrl: () => '/solace/don-cua-toi',
  },
  'solace.debt_recorded': {
    key: 'solace.debt_recorded', templateKey: 'solace_debt_recorded', notifType: 'solace_debt_recorded',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem đơn', relatedUrl: () => '/solace/don-cua-toi',
  },
  'solace.debt_reminder': {
    key: 'solace.debt_reminder', templateKey: 'solace_debt_reminder', notifType: 'solace_debt_reminder',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Trả nợ', relatedUrl: () => '/solace/tra-tien',
  },
  'solace.debt_settled': {
    key: 'solace.debt_settled', templateKey: 'solace_debt_settled', notifType: 'solace_debt_settled',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem ví', relatedUrl: () => '/solace/vi',
  },
  'solace.low_stock': {
    key: 'solace.low_stock', templateKey: 'solace_low_stock', notifType: 'solace_low_stock',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem kho', relatedUrl: () => '/solace/quan-ly?tab=inventory',
  },
  'solace.minigame_reward': {
    key: 'solace.minigame_reward', templateKey: 'solace_minigame_reward', notifType: 'solace_minigame_reward',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Đặt món', relatedUrl: () => '/solace/minigame',
  },
  'solace.order_delivering': {
    key: 'solace.order_delivering', templateKey: 'solace_order_delivering', notifType: 'solace_order_delivering',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem đơn', relatedUrl: () => '/solace/don-cua-toi',
  },
  'solace.order_done': {
    key: 'solace.order_done', templateKey: 'solace_order_done', notifType: 'solace_order_done',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem đơn', relatedUrl: () => '/solace/don-cua-toi',
  },
  'solace.wallet_low': {
    key: 'solace.wallet_low', templateKey: 'solace_wallet_low', notifType: 'solace_wallet_low',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Nạp ví', relatedUrl: () => '/solace/vi',
  },
  'solace.topup_request': {
    key: 'solace.topup_request',
    templateKey: 'solace_topup_request',
    notifType: 'solace_topup_request',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Duyệt nạp ví',
    relatedUrl: () => '/solace/quan-ly?tab=wallet',
  },
  'solace.topup_approved': {
    key: 'solace.topup_approved',
    templateKey: 'solace_topup_approved',
    notifType: 'solace_topup_approved',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem ví',
    relatedUrl: () => '/solace/vi',
  },
  'solace.shift_close': {
    key: 'solace.shift_close',
    templateKey: 'solace_shift_close',
    notifType: 'solace_shift_close',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem báo cáo',
    relatedUrl: () => '/solace/quan-ly',
  },
  'solace.shift_unclosed': {
    key: 'solace.shift_unclosed',
    templateKey: 'solace_shift_unclosed',
    notifType: 'solace_shift_unclosed',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Kết ca ngay',
    relatedUrl: () => '/solace-pos',
  },
  // ── Sinh nhật ──
  'birthday.monthly_digest': {
    key: 'birthday.monthly_digest',
    templateKey: 'birthday_monthly_digest',
    notifType: 'birthday_digest',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem danh sách',
    relatedUrl: () => '/users?birthday=1',
  },
  'birthday.vip_today': {
    key: 'birthday.vip_today',
    templateKey: 'birthday_vip_today',
    notifType: 'birthday_vip',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem hồ sơ',
    relatedUrl: (v) => `/users?userId=${v.relatedId}`,
  },
  'contract.expiring': {
    key: 'contract.expiring',
    templateKey: (v) => `contract_renewal:${v.state}`,
    notifType: 'contract_renewal',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem hợp đồng',
    relatedUrl: (v) => `/nhan-su?contractId=${v.relatedId}`,
    digest: { group: 'contract', title: '🔔 Hợp đồng sắp tới hạn', landingUrl: '/nhan-su?tab=contracts' },
  },
  // ── Pháp chế: nhắc hạn giấy phép / hợp đồng thương mại / ủy quyền / tuân thủ ──
  'legal.document.expiring': {
    key: 'legal.document.expiring',
    templateKey: (v) => `legal_document_expiry:${v.state}`,
    notifType: 'legal_expiry',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem văn bản',
    relatedUrl: () => `/phap-che`,
    digest: { group: 'legal', title: '⚖️ Pháp chế: mục sắp hết hạn', landingUrl: '/phap-che' },
  },
  'legal.contract.expiring': {
    key: 'legal.contract.expiring',
    templateKey: (v) => `legal_contract_expiry:${v.state}`,
    notifType: 'legal_expiry',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem hợp đồng',
    relatedUrl: () => `/phap-che?tab=contracts`,
    digest: { group: 'legal', title: '⚖️ Pháp chế: mục sắp hết hạn', landingUrl: '/phap-che' },
  },
  'legal.authorization.expiring': {
    key: 'legal.authorization.expiring',
    templateKey: 'legal_authorization_expiry:before',
    notifType: 'legal_expiry',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem ủy quyền',
    relatedUrl: () => `/phap-che?tab=auth-seal`,
    digest: { group: 'legal', title: '⚖️ Pháp chế: mục sắp hết hạn', landingUrl: '/phap-che' },
  },
  'legal.compliance.due': {
    key: 'legal.compliance.due',
    templateKey: 'legal_compliance_due',
    notifType: 'legal_compliance',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Mở lịch tuân thủ',
    relatedUrl: () => `/phap-che?tab=compliance`,
    digest: { group: 'legal', title: '⚖️ Pháp chế: nghĩa vụ đến hạn', landingUrl: '/phap-che?tab=compliance' },
  },
  'evaluation.due': {
    key: 'evaluation.due',
    templateKey: (v) => `evaluation_reminder:${v.state}`,
    notifType: 'evaluation_reminder',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem đánh giá',
    relatedUrl: (v) => `/nhan-su?tab=evaluations&evalId=${v.relatedId}`,
    digest: { group: 'evaluation', title: '🔔 Đánh giá thử việc tới hạn', landingUrl: '/nhan-su?tab=evaluations' },
  },
  'evaluation.autoCreated': {
    key: 'evaluation.autoCreated', templateKey: 'evaluation_autocreated', notifType: 'evaluation_reminder',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem đánh giá',
    relatedUrl: (v) => `/nhan-su?tab=evaluations&evalId=${v.relatedId}`,
  },
  'leave.balanceExpiring': {
    key: 'leave.balanceExpiring',
    templateKey: 'leave_balance_expiry',
    notifType: 'leave_balance_expiry',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem phép của tôi',
    relatedUrl: () => '/ho-so-cua-toi',
  },
  'requisition.deadline': {
    key: 'requisition.deadline',
    templateKey: (v) => `requisition_deadline:${v.state}`,
    notifType: 'requisition_deadline',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem yêu cầu',
    relatedUrl: () => '/nguon-nhan-luc/yeu-cau-tuyen-dung',
    digest: { group: 'requisition', title: '🔔 Yêu cầu tuyển dụng sắp hết hạn', landingUrl: '/nguon-nhan-luc/yeu-cau-tuyen-dung' },
  },
  'contract.watcherAdded': {
    key: 'contract.watcherAdded', templateKey: 'contract_watcher', notifType: 'contract_watcher',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hợp đồng',
    relatedUrl: (v) => `/nhan-su?contractId=${v.relatedId}`,
  },
  'contract.statusChange': {
    key: 'contract.statusChange', templateKey: 'contract_status_change', notifType: 'contract_status_change',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hợp đồng',
    relatedUrl: (v) => `/nhan-su?contractId=${v.relatedId}`,
  },
  'contract.pendingSign': {
    key: 'contract.pendingSign', templateKey: 'contract_pending_sign', notifType: 'contract_pending_sign',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hồ sơ của tôi',
    relatedUrl: () => '/ho-so-cua-toi',
  },
  'contract.signReminder': {
    key: 'contract.signReminder', templateKey: 'contract_sign_reminder', notifType: 'contract_sign_reminder',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hồ sơ của tôi',
    relatedUrl: () => '/ho-so-cua-toi',
  },
  'contract.signEscalated': {
    key: 'contract.signEscalated', templateKey: 'contract_sign_escalated', notifType: 'contract_sign_escalated',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hợp đồng',
    relatedUrl: (v) => `/nhan-su?contractId=${v.relatedId}`,
  },
  'evaluation.statusChange': {
    key: 'evaluation.statusChange', templateKey: 'evaluation_status_change', notifType: 'evaluation_status_change',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem đánh giá',
    relatedUrl: (v) => `/nhan-su?tab=evaluations&evalId=${v.relatedId}`,
  },
  'evaluation.cardCreated': {
    key: 'evaluation.cardCreated', templateKey: 'evaluation_created', notifType: 'evaluation_created',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hồ sơ của tôi',
    relatedUrl: () => '/ho-so-cua-toi?tab=evaluations',
  },
  'evaluation.concludedPass': {
    key: 'evaluation.concludedPass', templateKey: 'evaluation_passed', notifType: 'evaluation_passed',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: (v) => (v.contractId ? 'Xem hồ sơ nháp' : 'Xem đánh giá'),
    relatedUrl: (v) => (v.contractId
      ? `/nhan-su?tab=contracts&contractId=${v.contractId}`
      : `/nhan-su?tab=evaluations&evalId=${v.evaluationId}`),
  },
  'evaluation.concludedTerminate': {
    key: 'evaluation.concludedTerminate', templateKey: 'evaluation_terminated', notifType: 'evaluation_terminated',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: (v) => (v.offboardingProcessId ? 'Xem quy trình Offboarding' : 'Xem đánh giá'),
    relatedUrl: (v) => (v.offboardingProcessId
      ? `/nguon-nhan-luc/offboarding`
      : `/nhan-su?tab=evaluations&evalId=${v.evaluationId}`),
  },
  'offboarding.created': {
    key: 'offboarding.created', templateKey: 'offboarding_created', notifType: 'offboarding_created',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem quy trình',
    relatedUrl: () => '/nguon-nhan-luc/offboarding',
  },
  'offboarding.assigned': {
    key: 'offboarding.assigned', templateKey: 'offboarding_assigned', notifType: 'offboarding_assigned',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: () => '/nguon-nhan-luc/offboarding',
  },
  'offboarding.completed': {
    key: 'offboarding.completed', templateKey: 'offboarding_completed', notifType: 'offboarding_completed',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem quy trình',
    relatedUrl: () => '/nguon-nhan-luc/offboarding',
  },
  // Chấm công / Phép — in-app + Telegram (nội dung Telegram cá nhân hoá nằm trong templates.ts)
  'attendance.checkin': {
    key: 'attendance.checkin', templateKey: 'attendance_checkin', notifType: 'attendance_checkin',
    channels: ['inapp', 'telegram'], telegramButtonLabel: 'Xem chấm công', relatedUrl: () => '/tra-cuu/du-lieu-cong/tra-cuu',
  },
  'attendance.checkout': {
    key: 'attendance.checkout', templateKey: 'attendance_checkout', notifType: 'attendance_checkout',
    channels: ['inapp', 'telegram'], telegramButtonLabel: 'Xem chấm công', relatedUrl: () => '/tra-cuu/du-lieu-cong/tra-cuu',
  },
  'overtime.submitted': {
    key: 'overtime.submitted', templateKey: 'overtime_submitted', notifType: 'overtime_submitted',
    channels: ['inapp'], relatedUrl: () => '/duyet-yeu-cau/cong',
  },
  'overtime.reviewed': {
    key: 'overtime.reviewed', templateKey: (v) => `overtime_reviewed:${v.action}`, notifType: 'overtime_reviewed',
    channels: ['inapp', 'telegram'], telegramButtonLabel: 'Xem chấm công', relatedUrl: () => '/tra-cuu/du-lieu-cong/tra-cuu',
    digest: (v) => ({
      group: `overtime_reviewed:${v.action}`,
      title: v.action === 'approved' ? '✅ Khai báo tăng ca đã được duyệt' : '❌ Khai báo tăng ca bị từ chối',
      landingUrl: '/tra-cuu/du-lieu-cong/tra-cuu',
    }),
  },
  'adjustment.submitted': {
    key: 'adjustment.submitted', templateKey: 'adjustment_submitted', notifType: 'adjustment_submitted',
    channels: ['inapp'], relatedUrl: () => '/duyet-yeu-cau/cong',
  },
  'adjustment.reviewed': {
    key: 'adjustment.reviewed', templateKey: (v) => `adjustment_reviewed:${v.action}`, notifType: 'adjustment_reviewed',
    channels: ['inapp', 'telegram'], telegramButtonLabel: 'Xem chấm công', relatedUrl: () => '/tra-cuu/du-lieu-cong/tra-cuu',
    digest: (v) => ({
      group: `adjustment_reviewed:${v.action}`,
      title: v.action === 'approved' ? '✅ Đề xuất bù công đã được duyệt' : '❌ Đề xuất bù công bị từ chối',
      landingUrl: '/tra-cuu/du-lieu-cong/tra-cuu',
    }),
  },
  'adjustment.autoCancelledEmployee': {
    key: 'adjustment.autoCancelledEmployee', templateKey: 'adjustment_auto_cancelled:employee', notifType: 'adjustment_auto_cancelled',
    channels: ['inapp', 'telegram'], telegramButtonLabel: 'Xem chấm công', relatedUrl: () => '/tra-cuu/du-lieu-cong/tra-cuu',
  },
  'adjustment.autoCancelledManager': {
    key: 'adjustment.autoCancelledManager', templateKey: 'adjustment_auto_cancelled:manager', notifType: 'adjustment_auto_cancelled',
    channels: ['inapp', 'telegram'], telegramButtonLabel: 'Xem duyệt công', relatedUrl: () => '/duyet-yeu-cau/cong',
  },
  'leave.submitted': {
    key: 'leave.submitted', templateKey: 'leave_submitted', notifType: 'leave_submitted',
    channels: ['inapp'], relatedUrl: () => '/duyet-yeu-cau/cong',
  },
  'leave.reviewed': {
    key: 'leave.reviewed', templateKey: (v) => `leave_reviewed:${v.action}`, notifType: 'leave_reviewed',
    channels: ['inapp', 'telegram'], telegramButtonLabel: 'Xem nghỉ phép', relatedUrl: () => '/tra-cuu/du-lieu-cong/nghi-phep',
    digest: (v) => ({
      group: `leave_reviewed:${v.action}`,
      title: v.action === 'approved' ? '✅ Đơn nghỉ phép đã được duyệt' : '❌ Đơn nghỉ phép bị từ chối',
      landingUrl: '/tra-cuu/du-lieu-cong/nghi-phep',
    }),
  },
  'attendance.summary': {
    // mode='full' = người "Mặc Định Đủ Công" (không phải điểm danh) → mẫu riêng,
    // không liệt kê vân tay/app vì họ không chấm công.
    key: 'attendance.summary', templateKey: (v) => `attendance_summary:${v.mode}`, notifType: 'attendance_summary',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem bảng công', relatedUrl: () => '/ho-so-cua-toi',
  },
  // Tài sản — cấp/thu hồi (in-app + Telegram, nút "Xem tài sản")
  'asset.assigned': {
    key: 'asset.assigned', templateKey: 'asset_assigned', notifType: 'asset_assigned',
    channels: ['inapp', 'telegram'], telegramButtonLabel: 'Xem tài sản', relatedUrl: (v) => `/assets/${v.relatedId}`,
  },
  'asset.revoked': {
    key: 'asset.revoked', templateKey: 'asset_revoked', notifType: 'asset_revoked',
    channels: ['inapp', 'telegram'], telegramButtonLabel: 'Xem tài sản', relatedUrl: (v) => `/assets/${v.relatedId}`,
  },
  // Đánh giá — kết luận (báo nhân viên)
  'evaluation.concludedPassEmployee': {
    key: 'evaluation.concludedPassEmployee', templateKey: 'evaluation_passed_employee', notifType: 'evaluation_passed',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hồ sơ của tôi', relatedUrl: () => '/ho-so-cua-toi',
  },
  'evaluation.concludedExtended': {
    key: 'evaluation.concludedExtended', templateKey: 'evaluation_extended', notifType: 'evaluation_extended',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hồ sơ của tôi', relatedUrl: () => '/ho-so-cua-toi',
  },
  'evaluation.concludedFailed': {
    key: 'evaluation.concludedFailed', templateKey: 'evaluation_failed', notifType: 'evaluation_failed',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hồ sơ của tôi', relatedUrl: () => '/ho-so-cua-toi',
  },
  // Yêu cầu xoá tài sản
  'deleteRequest.pending': {
    key: 'deleteRequest.pending', templateKey: 'delete_request_pending', notifType: 'delete_request_pending',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem yêu cầu', relatedUrl: () => '/delete-requests',
  },
  'deleteRequest.approved': {
    key: 'deleteRequest.approved', templateKey: 'delete_request_approved', notifType: 'delete_request_approved',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem yêu cầu', relatedUrl: () => '/delete-requests',
  },
  'deleteRequest.rejected': {
    key: 'deleteRequest.rejected', templateKey: 'delete_request_rejected', notifType: 'delete_request_rejected',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem yêu cầu', relatedUrl: () => '/delete-requests',
  },
  // Đổi hồ sơ HR
  'hrDoc.replaceRequest': {
    key: 'hrDoc.replaceRequest', templateKey: 'hr_doc_replace_request', notifType: 'hr_doc_replace_request',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi tiết', relatedUrl: () => '/nhan-su?tab=hosoCuaToi',
  },
  'hrDoc.replaceApproved': {
    key: 'hrDoc.replaceApproved', templateKey: 'hr_doc_replace_approved', notifType: 'hr_doc_replace_approved',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hồ sơ của tôi', relatedUrl: () => '/ho-so-cua-toi',
  },
  'hrDoc.replaceRejected': {
    key: 'hrDoc.replaceRejected', templateKey: 'hr_doc_replace_rejected', notifType: 'hr_doc_replace_rejected',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hồ sơ của tôi', relatedUrl: () => '/ho-so-cua-toi',
  },
  // Onboarding — thoả thuận nháp
  'onboarding.contractDraft': {
    key: 'onboarding.contractDraft', templateKey: 'onboarding_contract_draft', notifType: 'onboarding_contract_draft',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hợp đồng',
    relatedUrl: (v) => `/nhan-su?contractId=${v.relatedId}`,
  },
  // Tuyển dụng — gắn ứng viên
  'requisition.candidateLinked': {
    key: 'requisition.candidateLinked', templateKey: 'requisition_candidate_linked', notifType: 'requisition_candidate_linked',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem yêu cầu', relatedUrl: () => '/yeu-cau-tuyen-dung',
  },
  // Tuyển dụng — có người ghi đánh giá/ghi chú cho ứng viên
  'requisition.candidateNote': {
    key: 'requisition.candidateNote', templateKey: 'requisition_candidate_note', notifType: 'requisition_candidate_note',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem ứng viên', relatedUrl: () => '/nguon-nhan-luc/yeu-cau-tuyen-dung',
  },
  // Tuyển dụng — lịch phỏng vấn (gửi người phỏng vấn)
  'interview.scheduled': {
    key: 'interview.scheduled', templateKey: 'interview_scheduled', notifType: 'interview_scheduled',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem ứng viên', relatedUrl: () => '/nguon-nhan-luc/yeu-cau-tuyen-dung',
  },
  'interview.cancelled': {
    key: 'interview.cancelled', templateKey: 'interview_cancelled', notifType: 'interview_cancelled',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem ứng viên', relatedUrl: () => '/nguon-nhan-luc/yeu-cau-tuyen-dung',
  },
  // Tuyển dụng — đổi trạng thái ứng viên theo vị trí (báo cho phía còn lại; url theo người nhận qua {{url}})
  'application.statusChanged': {
    key: 'application.statusChanged', templateKey: 'application_status_changed', notifType: 'application_status_changed',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem ứng viên', relatedUrl: (v) => String(v.url || '/yeu-cau-tuyen-dung'),
  },
  // Onboarding — duyệt hồ sơ
  'onboarding.submitted': {
    key: 'onboarding.submitted', templateKey: 'onboarding_submitted', notifType: 'onboarding_submitted',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem hồ sơ', relatedUrl: () => '/nguon-nhan-luc/onboarding',
  },
  'onboarding.sentToAdmin': {
    key: 'onboarding.sentToAdmin', templateKey: 'onboarding_sent_to_admin', notifType: 'onboarding_sent_to_admin',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Duyệt người dùng', relatedUrl: () => '/users',
  },
  'onboarding.approved': {
    key: 'onboarding.approved', templateKey: 'onboarding_approved', notifType: 'onboarding_approved',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem onboarding', relatedUrl: () => '/nguon-nhan-luc/onboarding',
  },
  'onboarding.rejected': {
    key: 'onboarding.rejected', templateKey: 'onboarding_rejected', notifType: 'onboarding_rejected',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem onboarding', relatedUrl: () => '/nguon-nhan-luc/onboarding',
  },
  // Chào mừng nhân sự mới — gửi cho chính nhân sự (in-app + Telegram)
  'onboarding.welcome': {
    key: 'onboarding.welcome', templateKey: 'onboarding_welcome', notifType: 'onboarding_welcome',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Đăng nhập', relatedUrl: () => '/',
  },
  // Thông báo chung & Văn bản (broadcast)
  'announcement.published': {
    key: 'announcement.published', templateKey: 'announcement_broadcast', notifType: 'announcement',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi tiết', relatedUrl: () => '/tra-cuu/thong-bao',
  },
  'document.published': {
    key: 'document.published', templateKey: 'document_broadcast', notifType: 'document',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi tiết', relatedUrl: () => '/tra-cuu/van-ban',
  },
  // Tuyển dụng — yêu cầu (notifType + url động; nội dung passthrough)
  'requisition.generic': {
    key: 'requisition.generic', templateKey: 'requisition_passthrough',
    notifType: (v) => String(v.notifType), channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem chi tiết', relatedUrl: (v) => String(v.url),
  },
  'recruitment.updated': {
    key: 'recruitment.updated', templateKey: 'recruitment_update',
    notifType: 'recruitment_update', channels: ['telegram'],
    telegramButtonLabel: 'Mở tuyển dụng', relatedUrl: (v) => String(v.url),
  },
  'fdv.reminder': {
    key: 'fdv.reminder', templateKey: 'fdv_reminder', notifType: 'recruitment_update', channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Mở công việc FDV', relatedUrl: () => '/nguon-nhan-luc/fdv',
  },
  // Tuyển dụng — báo cáo tuần (chỉ Telegram, gửi tới phòng ban cấu hình)
  'recruitment.weeklyReport': {
    key: 'recruitment.weeklyReport', templateKey: 'recruitment_weekly_report', notifType: 'recruitment_report',
    channels: ['telegram'], telegramButtonLabel: 'Xem dashboard',
    relatedUrl: () => '/nguon-nhan-luc/tinh-hinh-tuyen-dung',
  },
  // Ticket — theo dõi & nhắc tên
  'ticket.watcherStatus': {
    key: 'ticket.watcherStatus', templateKey: 'ticket_watcher_status', notifType: 'ticket_watcher_status',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: (v) => `/tickets/admin?ticketId=${v.relatedId}`,
  },
  'ticket.watcherComment': {
    key: 'ticket.watcherComment', templateKey: 'ticket_watcher_comment', notifType: 'ticket_watcher_comment',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: (v) => `/tickets/admin?ticketId=${v.relatedId}`,
  },
  'ticket.mention': {
    key: 'ticket.mention', templateKey: 'ticket_mention', notifType: 'ticket_mention',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: (v) => `/tickets/admin?ticketId=${v.relatedId}`,
  },
  // Ticket — giao việc / leo thang / đổi trạng thái (chỉ Telegram, giữ đúng hành vi cũ:
  // người được giao & người tạo nhận Telegram, không có in-app riêng).
  'ticket.assigned': {
    key: 'ticket.assigned', templateKey: 'ticket_assigned', notifType: 'ticket_assigned',
    channels: ['telegram'], telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: (v) => `/tickets/admin?ticketId=${v.relatedId}`,
  },
  'ticket.escalated': {
    key: 'ticket.escalated', templateKey: 'ticket_escalated', notifType: 'ticket_escalation',
    channels: ['telegram'], telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: (v) => `/tickets/admin?ticketId=${v.relatedId}`,
  },
  'ticket.statusChanged': {
    key: 'ticket.statusChanged', templateKey: 'ticket_status_party', notifType: 'ticket_status_change',
    channels: ['telegram'], telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: (v) => `/tickets/admin?ticketId=${v.relatedId}`,
  },
  // Cảnh báo tên miền (notifType + templateKey động theo mốc ngày)
  'domain.alert': {
    key: 'domain.alert',
    templateKey: (v) => `domain_alert:${v.milestone}`,
    notifType: (v) => String(v.notifType),
    channels: DEFAULT_CHANNELS,
  },
  // Công việc (Task) — tương tác
  'task.assigned': {
    key: 'task.assigned', templateKey: 'task_assigned', notifType: 'task_assigned',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: (v) => `/tasks?openTask=${v.relatedId}`,
  },
  'task.coAssigned': {
    key: 'task.coAssigned', templateKey: 'task_co_assigned', notifType: 'task_co_assigned',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: (v) => `/tasks?openTask=${v.relatedId}`,
  },
  'task.commented': {
    key: 'task.commented', templateKey: 'task_commented', notifType: 'task_commented',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: (v) => `/tasks?openTask=${v.relatedId}`,
  },
  'task.statusChanged': {
    key: 'task.statusChanged', templateKey: 'task_status_changed', notifType: 'task_status_changed',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: (v) => `/tasks?openTask=${v.relatedId}`,
  },
  'task.subtaskAdded': {
    key: 'task.subtaskAdded', templateKey: 'task_subtask_added', notifType: 'task_subtask_added',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: (v) => `/tasks?openTask=${v.relatedId}`,
  },
  // Nhắc tên trong bình luận task (chỉ Telegram — giữ đúng hành vi cũ).
  'task.mention': {
    key: 'task.mention', templateKey: 'task_mention', notifType: 'task_mention',
    channels: ['telegram'], telegramButtonLabel: 'Xem chi tiết',
    relatedUrl: (v) => `/tasks?openTask=${v.relatedId}`,
  },
  'roomBooking.reminder': {
    key: 'roomBooking.reminder',
    templateKey: 'room_booking_reminder',
    notifType: 'room_booking_reminder',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem lịch đặt phòng',
    relatedUrl: () => '/room-bookings',
  },
  'roomBooking.checkinReminder': {
    key: 'roomBooking.checkinReminder',
    templateKey: 'room_checkin_reminder',
    notifType: 'room_checkin_reminder',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem lịch đặt phòng',
    relatedUrl: () => '/room-bookings',
  },
  'roomBooking.checkoutReminder': {
    key: 'roomBooking.checkoutReminder',
    templateKey: 'room_checkout_reminder',
    notifType: 'room_checkout_reminder',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem lịch đặt phòng',
    relatedUrl: () => '/room-bookings',
  },
  'roomBooking.autoReleased': {
    key: 'roomBooking.autoReleased',
    templateKey: 'room_auto_released',
    notifType: 'room_auto_released',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem lịch đặt phòng',
    relatedUrl: () => '/room-bookings',
  },
  'roomBooking.autoCompleted': {
    key: 'roomBooking.autoCompleted',
    templateKey: 'room_auto_completed',
    notifType: 'room_auto_completed',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem lịch đặt phòng',
    relatedUrl: () => '/room-bookings',
  },
  'onboarding.checklistOverdue': {
    key: 'onboarding.checklistOverdue',
    templateKey: 'onboarding_reminder',
    notifType: 'onboarding_reminder',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem Onboarding',
    relatedUrl: () => '/nguon-nhan-luc',
  },
  'task.overdue': {
    key: 'task.overdue',
    templateKey: (v) => `task_overdue:${v.state}`,
    notifType: 'task_overdue',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem Công việc',
    relatedUrl: () => '/tasks',
    digest: { group: 'task', title: '⏰ Công việc đến/quá hạn', landingUrl: '/tasks' },
  },
  'ticket.overdue': {
    key: 'ticket.overdue',
    templateKey: (v) => `ticket_overdue:${v.state}`,
    notifType: 'ticket_overdue',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem Ticket',
    relatedUrl: () => '/tickets',
    digest: { group: 'ticket', title: '⏰ Ticket đến/quá hạn', landingUrl: '/tickets' },
  },
  // Gửi THỦ CÔNG / broadcast (mẫu tùy chỉnh): templateKey động truyền qua vars.__templateKey
  'manual.send': {
    key: 'manual.send',
    templateKey: (v) => String(v.__templateKey),
    notifType: 'announcement',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem thông báo',
    relatedUrl: () => '/tra-cuu/thong-bao',
  },
  'asset.maintenanceDue': {
    key: 'asset.maintenanceDue',
    templateKey: 'asset_reminder',
    notifType: 'asset_reminder',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Xem tài sản',
    relatedUrl: () => '/asset-management',
    digest: { group: 'asset', title: '🔧 Tài sản sắp tới hạn bảo trì/bảo hành', landingUrl: '/asset-management' },
  },

  // ── SSO ──
  'sso.sync_failed': {
    key: 'sso.sync_failed',
    templateKey: 'sso_sync_failed',
    notifType: 'sso_sync_failed',
    channels: DEFAULT_CHANNELS,
    telegramButtonLabel: 'Mở Người Dùng',
    relatedUrl: () => '/users',
    // Bulk migrate/retry có thể lỗi hàng trăm user cùng lượt → gộp về 1 tin/Telegram
    // cho mỗi super_admin thay vì bão thông báo (I10).
    digest: { group: 'sso', title: '⚠️ Đồng bộ SSO thất bại', landingUrl: '/users' },
  },

  // ── Chi Phí (docs/technical/expense-module-roadmap.md §5) ──
  'expense.submitted': {
    key: 'expense.submitted', templateKey: 'expense_submitted', notifType: 'expense_submitted',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi phí',
    relatedUrl: (v) => `/chi-phi?open=${v.expenseId ?? ''}`,
  },
  'expense.step_approved': {
    key: 'expense.step_approved', templateKey: 'expense_step_approved', notifType: 'expense_step_approved',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi phí',
    relatedUrl: (v) => `/chi-phi?open=${v.expenseId ?? ''}`,
  },
  'expense.approved': {
    key: 'expense.approved', templateKey: 'expense_approved', notifType: 'expense_approved',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi phí',
    relatedUrl: (v) => `/chi-phi?open=${v.expenseId ?? ''}`,
  },
  'expense.rejected': {
    key: 'expense.rejected', templateKey: 'expense_rejected', notifType: 'expense_rejected',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi phí',
    relatedUrl: (v) => `/chi-phi?open=${v.expenseId ?? ''}`,
  },
  'expense.message_new': {
    key: 'expense.message_new', templateKey: 'expense_message_new', notifType: 'expense_message_new',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem trao đổi',
    relatedUrl: (v) => `/chi-phi?open=${v.expenseId ?? ''}`,
    digest: { group: 'expense', title: '💬 Tin nhắn mới trong các phiếu chi', landingUrl: '/chi-phi' },
  },
  'expense.refund_confirmed': {
    key: 'expense.refund_confirmed', templateKey: 'expense_refund_confirmed', notifType: 'expense_refund_confirmed',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem chi phí',
    relatedUrl: (v) => `/chi-phi?open=${v.expenseId ?? ''}`,
  },

  // ── KPI & Đánh Giá — cá nhân ──
  'kpi.assigned': {
    key: 'kpi.assigned', templateKey: 'kpi_assigned', notifType: 'kpi_assigned',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem KPI',
    relatedUrl: (v) => `/kpi?open=${v.relatedId ?? ''}`,
  },
  'kpi.manager_pending': {
    key: 'kpi.manager_pending', templateKey: 'kpi_manager_pending', notifType: 'kpi_manager_pending',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Chấm điểm',
    relatedUrl: (v) => `/kpi?open=${v.relatedId ?? ''}`,
  },
  'kpi.senior_pending': {
    key: 'kpi.senior_pending', templateKey: 'kpi_senior_pending', notifType: 'kpi_senior_pending',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Chốt điểm',
    relatedUrl: (v) => `/kpi?open=${v.relatedId ?? ''}`,
  },
  'kpi.concluded': {
    key: 'kpi.concluded', templateKey: 'kpi_concluded', notifType: 'kpi_concluded',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem KPI',
    relatedUrl: (v) => `/kpi?open=${v.relatedId ?? ''}`,
  },

  // ── KPI & Đánh Giá — đơn vị (phòng ban/bộ phận) ──
  'kpi.unit_self_pending': {
    key: 'kpi.unit_self_pending', templateKey: 'kpi_unit_self_pending', notifType: 'kpi_unit_self_pending',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Tự nhận xét',
    relatedUrl: (v) => `/kpi?openUnit=${v.relatedId ?? ''}`,
  },
  'kpi.unit_approve_pending': {
    key: 'kpi.unit_approve_pending', templateKey: 'kpi_unit_approve_pending', notifType: 'kpi_unit_approve_pending',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Duyệt phiếu',
    relatedUrl: (v) => `/kpi?openUnit=${v.relatedId ?? ''}`,
  },
  'kpi.unit_concluded': {
    key: 'kpi.unit_concluded', templateKey: 'kpi_unit_concluded', notifType: 'kpi_unit_concluded',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem KPI đơn vị',
    relatedUrl: (v) => `/kpi?openUnit=${v.relatedId ?? ''}`,
  },
  'kpi.deadline_reminder': {
    key: 'kpi.deadline_reminder', templateKey: 'kpi_deadline_reminder', notifType: 'kpi_deadline_reminder',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xử lý ngay',
    relatedUrl: (v) => `/kpi?open=${v.relatedId ?? ''}`,
  },
  'kpi.unit_deadline_reminder': {
    key: 'kpi.unit_deadline_reminder', templateKey: 'kpi_unit_deadline_reminder', notifType: 'kpi_unit_deadline_reminder',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xử lý ngay',
    relatedUrl: (v) => `/kpi?openUnit=${v.relatedId ?? ''}`,
  },
  'design.request.assigned': {
    key: 'design.request.assigned', templateKey: 'design_request_assigned', notifType: 'design_request',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem yêu cầu', relatedUrl: () => '/yeu-cau-thiet-ke',
  },
  'design.request.version_uploaded': {
    key: 'design.request.version_uploaded', templateKey: 'design_request_version_uploaded', notifType: 'design_request',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem phiên bản', relatedUrl: () => '/yeu-cau-thiet-ke',
  },
  'design.request.feedback_new': {
    key: 'design.request.feedback_new', templateKey: 'design_request_feedback_new', notifType: 'design_request',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem feedback', relatedUrl: () => '/yeu-cau-thiet-ke',
  },
  'design.request.revision_requested': {
    key: 'design.request.revision_requested', templateKey: 'design_request_revision_requested', notifType: 'design_request',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem yêu cầu', relatedUrl: () => '/yeu-cau-thiet-ke',
  },
  'design.request.approved': {
    key: 'design.request.approved', templateKey: 'design_request_approved', notifType: 'design_request',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem yêu cầu', relatedUrl: () => '/yeu-cau-thiet-ke',
  },
  'design.request.blocked': {
    key: 'design.request.blocked', templateKey: 'design_request_blocked', notifType: 'design_request',
    channels: DEFAULT_CHANNELS, telegramButtonLabel: 'Xem yêu cầu', relatedUrl: () => '/yeu-cau-thiet-ke',
  },
};

export function getEvent(key: string): NotificationEvent | undefined {
  return NOTIFICATION_EVENTS[key];
}
