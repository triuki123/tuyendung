/**
 * templates.ts — NGUỒN DUY NHẤT cho mẫu nội dung thông báo (title/message/icon).
 *
 * Theo skill hardcode-to-config: DEFAULT ở đây KHỚP CHÍNH XÁC chuỗi hardcode cũ
 * trong từng service. Service `notificationTemplateService` đọc DB rồi merge lên
 * các DEFAULT này; seed rỗng ⇒ hành vi y hệt.
 *
 * Quy ước key: `<type>` hoặc `<type>:<trạng thái>` cho thông báo nhiều trạng thái
 * (vd hợp đồng: before/today/overdue). `type` lưu vào bảng notifications GIỮ NGUYÊN
 * (không đổi), key template chỉ để tra mẫu.
 *
 * File thuần TS (không import DB) → dùng được cả client lẫn server.
 */

export interface NotificationTemplate {
  category: string;       // nhóm để gom trong UI
  label: string;          // nhãn hiển thị cho admin
  title: string;          // có {{biến}} + emoji
  message: string;        // có {{biến}}
  icon: string;
  /** Biến thể Telegram (Markdown, nhiều dòng). Bỏ trống = fallback *tiêu đề* + nội dung. */
  telegram?: string;
  placeholders: string[]; // gợi ý biến cho UI
}

/** Thay {{biến}} bằng giá trị; biến thiếu → chuỗi rỗng. Hàm thuần. */
export function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : ''));
}

/** Escape ký tự Markdown trong GIÁ TRỊ biến (Telegram) — không đụng literal trong template. */
export function escapeTelegramVars(vars: Record<string, string | number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) out[k] = String(v).replace(/([_*[\]])/g, '\\$1');
  return out;
}

const P_CONTRACT = ['contractNumber', 'employeeName', 'endDate', 'daysLeft', 'daysOverdue'];
const P_EVAL = ['typeName', 'employeeName', 'probationEndDate', 'daysLeft', 'daysOverdue'];

/** Mẫu mặc định — đợt 1: 5 nhắc Quản Lý Hồ Sơ. Sẽ bổ sung các nhóm khác sau. */
export const DEFAULT_NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  // ── Solace (quán cà phê) ──
  'solace_order_new': {
    category: 'Solace — Quán cà phê', label: 'Đơn đặt món mới (webapp)', icon: 'shopping-bag',
    placeholders: ['code', 'customer', 'total', 'fulfillment'],
    title: '🛎️ Đơn mới {{code}} — {{customer}}',
    message: '{{customer}} vừa đặt {{total}} · {{fulfillment}}. Vào Bán Hàng → Hàng đợi để xử lý.',
    telegram: '🛎️ *Đơn Solace mới: {{code}}*\n\n👤 {{customer}}\n💵 {{total}}\n📍 {{fulfillment}}\n\n_Vào Bán Hàng → Hàng đợi để pha chế._',
  },
  'solace_order_ready': {
    category: 'Solace — Quán cà phê', label: 'Đơn của bạn đã sẵn sàng', icon: 'coffee',
    placeholders: ['code', 'pickupLine'],
    title: '☕ Đơn {{code}} đã sẵn sàng',
    message: 'Đơn {{code}} của bạn đã pha xong.{{pickupLine}}',
    telegram: '☕ *Đơn {{code}} đã sẵn sàng!*\n{{pickupLine}}',
  },
  'solace_wallet_payment': {
    category: 'Solace — Quán cà phê', label: 'Đã trừ ví cho đơn (biên lai)', icon: 'wallet',
    placeholders: ['code', 'items', 'amount', 'balance'],
    title: '☕ Solace đã trừ ví −{{amount}}',
    message: 'Đơn {{code}}: {{items}}\nĐã trừ: {{amount}} · Số dư còn: {{balance}}',
    telegram: '☕ *Solace — đã trừ ví*\n\n🧾 Đơn {{code}}\n{{items}}\n💸 Trừ: *{{amount}}*\n💰 Số dư còn: *{{balance}}*',
  },
  'solace_payment_confirmed': {
    category: 'Solace — Quán cà phê', label: 'Đã xác nhận thanh toán đơn', icon: 'check-circle',
    placeholders: ['code', 'amount', 'method'],
    title: '✅ Solace đã nhận thanh toán {{code}}',
    message: 'Quán đã xác nhận nhận {{amount}} ({{method}}) cho đơn {{code}}. Cảm ơn bạn!',
    telegram: '✅ *Solace đã nhận thanh toán*\n\nĐơn {{code}} · {{amount}} ({{method}})\n_Cảm ơn bạn!_',
  },
  'solace_wallet_refund': {
    category: 'Solace — Quán cà phê', label: 'Hoàn tiền vào ví', icon: 'wallet',
    placeholders: ['code', 'amount', 'balance'],
    title: '↩️ Solace hoàn ví +{{amount}}',
    message: 'Đơn {{code}} đã huỷ. Đã hoàn {{amount}} vào ví. Số dư hiện tại: {{balance}}.',
    telegram: '↩️ *Solace hoàn tiền vào ví*\n\nĐơn {{code}} huỷ → hoàn *+{{amount}}*\n💰 Số dư: *{{balance}}*',
  },
  'solace_topup_rejected': {
    category: 'Solace — Quán cà phê', label: 'Yêu cầu nạp ví bị từ chối', icon: 'x-circle',
    placeholders: ['amount'],
    title: '⚠️ Yêu cầu nạp ví {{amount}} bị từ chối',
    message: 'Yêu cầu nạp {{amount}} vào ví Solace của bạn đã bị từ chối. Liên hệ nhân viên nếu cần.',
    telegram: '⚠️ *Yêu cầu nạp ví bị từ chối*\n\nSố tiền: {{amount}}\n_Liên hệ nhân viên Solace nếu cần._',
  },
  'solace_order_cancelled': {
    category: 'Solace — Quán cà phê', label: 'Đơn bị huỷ', icon: 'x-circle',
    placeholders: ['code', 'refundLine'],
    title: '❌ Đơn Solace {{code}} đã huỷ',
    message: 'Đơn {{code}} của bạn đã bị huỷ.{{refundLine}}',
    telegram: '❌ *Đơn Solace {{code}} đã huỷ*{{refundLine}}',
  },
  'solace_debt_recorded': {
    category: 'Solace — Quán cà phê', label: 'Đã ghi nợ cho đơn', icon: 'book-open',
    placeholders: ['code', 'amount', 'totalDebt'],
    title: '📒 Đã ghi nợ đơn {{code}} ({{amount}})',
    message: 'Đơn {{code}} được ghi nợ {{amount}}. Tổng nợ Solace hiện tại: {{totalDebt}}.',
    telegram: '📒 *Solace — ghi nợ*\n\nĐơn {{code}}: {{amount}}\nTổng nợ hiện tại: *{{totalDebt}}*',
  },
  'solace_debt_reminder': {
    category: 'Solace — Quán cà phê', label: 'Nhắc công nợ', icon: 'book-open',
    placeholders: ['totalDebt', 'orderCount'],
    title: '🔔 Bạn còn nợ Solace {{totalDebt}}',
    message: 'Bạn đang còn nợ {{totalDebt}} ({{orderCount}} đơn) tại quán Solace. Vui lòng thanh toán bằng ví, chuyển khoản hoặc tại quầy. Cảm ơn bạn!',
    telegram: '🔔 *Nhắc công nợ Solace*\n\nBạn còn nợ *{{totalDebt}}* ({{orderCount}} đơn).\n_Vui lòng thanh toán bằng ví, chuyển khoản hoặc tại quầy. Cảm ơn!_',
  },
  'solace_debt_settled': {
    category: 'Solace — Quán cà phê', label: 'Đã tất toán công nợ', icon: 'check-circle',
    placeholders: [],
    title: '🎉 Bạn đã tất toán nợ Solace',
    message: 'Bạn đã thanh toán hết công nợ tại quán Solace. Cảm ơn bạn!',
    telegram: '🎉 *Đã tất toán nợ Solace*\n\n_Cảm ơn bạn đã thanh toán đầy đủ!_',
  },
  'solace_low_stock': {
    category: 'Solace — Quán cà phê', label: 'Cảnh báo tồn kho thấp', icon: 'alert-triangle',
    placeholders: ['count', 'list'],
    title: '📦 Solace: {{count}} nguyên liệu sắp hết',
    message: 'Các nguyên liệu dưới ngưỡng tồn tối thiểu:\n{{list}}',
    telegram: '📦 *Solace — cảnh báo tồn kho*\n\n{{count}} nguyên liệu sắp/đã hết:\n{{list}}',
  },
  'solace_minigame_reward': {
    category: 'Solace — Quán cà phê', label: 'Quà minigame đến sớm', icon: 'gift',
    placeholders: ['code', 'expire', 'minutes', 'items'],
    title: '🎁 Quà chào ngày mới từ Solace!',
    message: 'Chúc mừng bạn đến sớm! 🎉 Mã quà: {{code}} — chọn 1 món miễn phí ({{items}}). Dùng trước {{expire}} (trong {{minutes}} phút).',
    telegram: '🎁 *Quà chào ngày mới từ Solace!* 🎉\n\nChúc mừng bạn đến sớm hôm nay!\nMã quà: *{{code}}*\nChọn 1 món miễn phí: _{{items}}_\n⏱ Dùng trước *{{expire}}* (trong {{minutes}} phút)\n\n_Đưa mã cho nhân viên hoặc nhập khi đặt món._',
  },
  'solace_order_delivering': {
    category: 'Solace — Quán cà phê', label: 'Đơn đang giao', icon: 'truck',
    placeholders: ['code'],
    title: '🚚 Đơn {{code}} đang giao',
    message: 'Đơn {{code}} đang được giao tới bạn. Vui lòng chuẩn bị nhận nhé!',
    telegram: '🚚 *Đơn {{code}} đang giao tới bạn!*\n\n_Vui lòng chuẩn bị nhận nhé._',
  },
  'solace_order_done': {
    category: 'Solace — Quán cà phê', label: 'Đơn đã hoàn tất', icon: 'check-circle',
    placeholders: ['code'],
    title: '☕ Đơn {{code}} đã hoàn tất',
    message: 'Đơn {{code}} của bạn đã hoàn tất. Cảm ơn bạn đã dùng Solace — hẹn gặp lại!',
    telegram: '☕ *Đơn {{code}} đã hoàn tất*\n\n_Cảm ơn bạn đã dùng Solace — hẹn gặp lại!_',
  },
  'solace_wallet_low': {
    category: 'Solace — Quán cà phê', label: 'Số dư ví thấp', icon: 'wallet',
    placeholders: ['balance', 'threshold'],
    title: '⚠️ Số dư ví Solace còn thấp ({{balance}})',
    message: 'Số dư ví Solace của bạn còn {{balance}} (dưới {{threshold}}). Nạp thêm để tiếp tục đặt món nhé!',
    telegram: '⚠️ *Số dư ví Solace thấp*\n\nCòn lại: *{{balance}}* (dưới {{threshold}})\n_Nạp thêm để tiếp tục đặt món nhé!_',
  },
  'solace_topup_request': {
    category: 'Solace — Quán cà phê', label: 'Yêu cầu nạp ví mới', icon: 'wallet',
    placeholders: ['name', 'amount', 'method'],
    title: '💰 Yêu cầu nạp ví: {{name}}',
    message: '{{name}} yêu cầu nạp {{amount}} ({{method}}). Vào Quản Lý Quán → Ví & Nạp Tiền để duyệt.',
    telegram: '💰 *Yêu cầu nạp ví Solace*\n\n👤 {{name}}\n💵 *{{amount}}* — {{method}}\n\n_Vào duyệt trong Quản Lý Quán → Ví & Nạp Tiền._',
  },
  'solace_topup_approved': {
    category: 'Solace — Quán cà phê', label: 'Nạp ví thành công', icon: 'wallet',
    placeholders: ['amount', 'balance'],
    title: '✅ Ví Solace +{{amount}}',
    message: 'Ví Solace của bạn đã được cộng {{amount}}. Số dư hiện tại: {{balance}}.',
    telegram: '✅ *Nạp ví Solace thành công*\n\n+{{amount}}\nSố dư: *{{balance}}*',
  },
  'solace_shift_close': {
    category: 'Solace — Quán cà phê', label: 'Kết ca quán Solace', icon: 'coffee',
    placeholders: ['date', 'orders', 'revenue', 'cash', 'bankqr', 'wallet', 'unpaid', 'variance', 'closedBy'],
    title: '☕ Kết ca Solace {{date}}',
    message: 'Tổng đơn: {{orders}} · Doanh thu đã thu: {{revenue}}\nTiền mặt: {{cash}} · Chuyển khoản: {{bankqr}} · Ví: {{wallet}}\nCòn nợ/chưa thu: {{unpaid}} · Chênh lệch quỹ tiền mặt: {{variance}}\nNgười kết ca: {{closedBy}}',
    telegram: '☕ *KẾT CA SOLACE — {{date}}*\n\n🧾 Đơn: *{{orders}}*\n💰 Doanh thu đã thu: *{{revenue}}*\n• Tiền mặt: {{cash}}\n• Chuyển khoản: {{bankqr}}\n• Ví: {{wallet}}\n⏳ Còn nợ/chưa thu: {{unpaid}}\n📊 Chênh lệch quỹ tiền mặt: {{variance}}\n\n_Người kết ca: {{closedBy}}_',
  },
  'solace_shift_unclosed': {
    category: 'Solace — Quán cà phê', label: 'Nhắc chưa kết ca', icon: 'alert-triangle',
    placeholders: ['date', 'orders', 'cash'],
    title: '⏰ Chưa kết ca Solace {{date}}',
    message: 'Hôm nay có {{orders}} đơn nhưng chưa kết ca. Tiền mặt dự kiến trong két: {{cash}}.\nVui lòng đếm tiền & kết ca trước khi nghỉ.',
    telegram: '⏰ *CHƯA KẾT CA SOLACE — {{date}}*\n\n🧾 Đơn hôm nay: *{{orders}}*\n💵 Tiền mặt dự kiến: *{{cash}}*\n\n_Vui lòng đếm tiền & kết ca trước khi nghỉ._',
  },
  // ── Sinh nhật ──
  'birthday_monthly_digest': {
    category: 'Sinh nhật', label: 'Danh sách sinh nhật trong tháng', icon: 'cake', placeholders: ['month', 'count', 'list'],
    title: '🎂 Sinh nhật tháng {{month}} ({{count}} người)',
    message: 'Danh sách nhân sự sinh nhật trong tháng {{month}}:\n{{list}}',
    telegram: '🎂 *Sinh nhật tháng {{month}}* — {{count}} người\n\n{{list}}\n\n_Hãy chuẩn bị lời chúc & quà nhé!_ 🎉',
  },
  'birthday_vip_today': {
    category: 'Sinh nhật', label: 'Sinh nhật BOD & Leader hôm nay', icon: 'cake', placeholders: ['userName', 'deptLine'],
    title: '⭐ Hôm nay là sinh nhật {{userName}}',
    message: 'Hôm nay là sinh nhật của {{userName}} {{deptLine}}. Hãy chuẩn bị lời chúc trang trọng tới BOD & Leader nhé!',
    telegram: '⭐🎂 *Sinh nhật BOD & Leader hôm nay*\n\n👤 *{{userName}}*\n{{deptLine}}\n\n_Hãy gửi lời chúc trang trọng nhé!_ 🎉',
  },
  // ── Hợp đồng (3 trạng thái) ──
  'contract_renewal:before': {
    category: 'Hồ sơ — Hợp đồng', label: 'Hợp đồng sắp hết hạn', icon: 'file-text', placeholders: P_CONTRACT,
    title: '🔔 Hợp đồng sắp hết hạn (còn {{daysLeft}} ngày)',
    message: 'Hợp đồng {{contractNumber}} của {{employeeName}} sẽ hết hạn ngày {{endDate}} (còn {{daysLeft}} ngày). Vui lòng chuẩn bị gia hạn.',
  },
  'contract_renewal:today': {
    category: 'Hồ sơ — Hợp đồng', label: 'Hợp đồng hết hạn hôm nay', icon: 'file-text', placeholders: P_CONTRACT,
    title: '🚨 Hợp đồng hết hạn hôm nay',
    message: 'Hợp đồng {{contractNumber}} của {{employeeName}} hết hạn hôm nay ({{endDate}}). Cần xử lý gia hạn ngay.',
  },
  'contract_renewal:overdue': {
    category: 'Hồ sơ — Hợp đồng', label: 'Hợp đồng quá hạn', icon: 'file-text', placeholders: P_CONTRACT,
    title: '⚠️ Hợp đồng đã quá hạn {{daysOverdue}} ngày',
    message: 'Hợp đồng {{contractNumber}} của {{employeeName}} đã quá hạn từ {{endDate}} ({{daysOverdue}} ngày). Vui lòng gia hạn hoặc cập nhật trạng thái.',
  },

  // ── Pháp chế: giấy phép/văn bản + hợp đồng thương mại + ủy quyền + tuân thủ ──
  'legal_document_expiry:before': {
    category: 'Pháp chế', label: 'Giấy phép/văn bản sắp hết hạn', icon: 'file-text',
    placeholders: ['title', 'companyName', 'expiryDate', 'daysLeft'],
    title: '🔔 Giấy phép sắp hết hạn (còn {{daysLeft}} ngày)',
    message: '{{title}} của {{companyName}} sẽ hết hạn ngày {{expiryDate}} (còn {{daysLeft}} ngày). Cần chuẩn bị thủ tục gia hạn sớm.',
  },
  'legal_document_expiry:overdue': {
    category: 'Pháp chế', label: 'Giấy phép/văn bản quá hạn', icon: 'file-text',
    placeholders: ['title', 'companyName', 'expiryDate', 'daysOverdue'],
    title: '⚠️ Giấy phép đã quá hạn {{daysOverdue}} ngày',
    message: '{{title}} của {{companyName}} đã hết hạn từ {{expiryDate}} ({{daysOverdue}} ngày). Rủi ro pháp lý — xử lý gấp hoặc cập nhật trạng thái.',
  },
  'legal_contract_expiry:before': {
    category: 'Pháp chế', label: 'Hợp đồng thương mại sắp hết hiệu lực', icon: 'handshake',
    placeholders: ['title', 'companyName', 'expiryDate', 'daysLeft'],
    title: '🔔 Hợp đồng thương mại sắp hết hiệu lực (còn {{daysLeft}} ngày)',
    message: 'Hợp đồng "{{title}}" ({{companyName}}) hết hiệu lực ngày {{expiryDate}} (còn {{daysLeft}} ngày). Chuẩn bị tái ký hoặc thanh lý.',
  },
  'legal_contract_expiry:overdue': {
    category: 'Pháp chế', label: 'Hợp đồng thương mại quá hạn', icon: 'handshake',
    placeholders: ['title', 'companyName', 'expiryDate', 'daysOverdue'],
    title: '⚠️ Hợp đồng thương mại đã quá hạn {{daysOverdue}} ngày',
    message: 'Hợp đồng "{{title}}" ({{companyName}}) đã hết hiệu lực từ {{expiryDate}}. Cập nhật trạng thái (hết hạn/thanh lý) hoặc tái ký.',
  },
  'legal_authorization_expiry:before': {
    category: 'Pháp chế', label: 'Ủy quyền sắp hết hạn', icon: 'file-signature',
    placeholders: ['title', 'companyName', 'expiryDate', 'daysLeft'],
    title: '🔔 Giấy ủy quyền sắp hết hạn (còn {{daysLeft}} ngày)',
    message: 'Ủy quyền {{title}} ({{companyName}}) hết hạn ngày {{expiryDate}}. Gia hạn hoặc lập ủy quyền mới nếu còn nhu cầu.',
  },
  'legal_compliance_due': {
    category: 'Pháp chế', label: 'Nghĩa vụ định kỳ đến hạn', icon: 'calendar-check',
    placeholders: ['name', 'agency', 'period', 'dueDate'],
    title: '📅 Nghĩa vụ "{{name}}" đến hạn kỳ {{period}}',
    message: 'Nghĩa vụ "{{name}}"{{agency}} đến hạn nộp ({{dueDate}}). Hoàn thành rồi đánh dấu "đã nộp" trong Pháp Chế → Lịch tuân thủ.',
  },

  // ── Đánh giá thử việc (3 trạng thái) ──
  'evaluation_reminder:before': {
    category: 'Hồ sơ — Đánh giá', label: 'Đánh giá sắp đến hạn', icon: 'clipboard-check', placeholders: P_EVAL,
    title: '🔔 Đánh giá {{typeName}} sắp đến hạn (còn {{daysLeft}} ngày)',
    message: 'Đánh giá {{typeName}} của {{employeeName}} sẽ đến hạn ngày {{probationEndDate}} (còn {{daysLeft}} ngày). Vui lòng tiến hành đánh giá và kết luận.',
  },
  'evaluation_reminder:today': {
    category: 'Hồ sơ — Đánh giá', label: 'Đánh giá đến hạn hôm nay', icon: 'clipboard-check', placeholders: P_EVAL,
    title: '🚨 Đánh giá {{typeName}} đến hạn hôm nay',
    message: 'Đánh giá {{typeName}} của {{employeeName}} đến hạn hôm nay ({{probationEndDate}}). Cần kết luận ngay.',
  },
  'evaluation_reminder:overdue': {
    category: 'Hồ sơ — Đánh giá', label: 'Đánh giá quá hạn', icon: 'clipboard-check', placeholders: P_EVAL,
    title: '⚠️ Đánh giá {{typeName}} đã quá hạn {{daysOverdue}} ngày',
    message: 'Đánh giá {{typeName}} của {{employeeName}} đã quá hạn từ {{probationEndDate}} ({{daysOverdue}} ngày). Vui lòng kết luận để chuyển trạng thái nhân viên.',
  },

  'evaluation_autocreated': {
    category: 'Hồ sơ — Đánh giá', label: 'Tự tạo thẻ đánh giá (báo C&B)', icon: 'clipboard-check',
    placeholders: ['typeName', 'employeeName', 'probationEndDate'],
    title: '📋 Đã tạo thẻ đánh giá {{typeName}}',
    message: 'Hệ thống tự động tạo thẻ đánh giá {{typeName}} cho {{employeeName}}. Hạn đánh giá: {{probationEndDate}}. Vui lòng assign quản lý và tiến hành đánh giá.',
    telegram: '📋 *Đã Tạo Thẻ Đánh Giá {{typeName}}*\n\n👤 Nhân viên: {{employeeName}}\n📅 Hạn đánh giá: {{probationEndDate}}\n\nVui lòng assign quản lý và tiến hành đánh giá.',
  },

  // ── Phép năm sắp hết hạn (1 dạng) ──
  'leave_balance_expiry': {
    category: 'Hồ sơ — Phép năm', label: 'Phép năm cũ sắp hết hạn', icon: 'calendar', placeholders: ['daysLeft', 'days', 'expiryFmt'],
    title: '⏰ Phép năm cũ hết hạn sau {{daysLeft}} ngày',
    message: 'Bạn còn {{days}} ngày phép chuyển năm, sẽ hết hạn vào {{expiryFmt}}. Hãy đăng ký nghỉ phép trước khi hết hạn!',
  },

  // ── Yêu cầu tuyển dụng sắp hết hạn (2 mức khẩn) ──
  'requisition_deadline:normal': {
    category: 'Hồ sơ — Tuyển dụng', label: 'Yêu cầu tuyển dụng sắp hết hạn', icon: 'clipboard-list', placeholders: ['title', 'meta', 'closeDate', 'daysLeft'],
    title: '🔔 Yêu cầu tuyển dụng sắp hết hạn (còn {{daysLeft}} ngày)',
    message: '"{{title}}"{{meta}} — hạn {{closeDate}}. Vui lòng xử lý / cập nhật tiến độ.',
  },
  'requisition_deadline:urgent': {
    category: 'Hồ sơ — Tuyển dụng', label: 'Yêu cầu tuyển dụng hết hạn ngày mai', icon: 'clipboard-list', placeholders: ['title', 'meta', 'closeDate', 'daysLeft'],
    title: '🚨 Yêu cầu tuyển dụng sắp hết hạn (còn {{daysLeft}} ngày)',
    message: '"{{title}}"{{meta}} — hạn {{closeDate}}. Vui lòng xử lý / cập nhật tiến độ.',
  },

  // ── Hợp đồng — theo dõi/ký (tiêu đề sửa được, nội dung động qua {{message}}) ──
  'contract_watcher': {
    category: 'Hợp đồng — Theo dõi', label: 'Được thêm theo dõi hợp đồng', icon: 'file-text', placeholders: ['message'],
    title: '👥 Theo dõi hợp đồng', message: '{{message}}',
  },
  'contract_status_change': {
    category: 'Hợp đồng — Theo dõi', label: 'Hợp đồng đổi trạng thái', icon: 'file-text', placeholders: ['message'],
    title: '🔄 Hợp đồng đổi trạng thái', message: '{{message}}',
  },
  'contract_pending_sign': {
    category: 'Hợp đồng — Theo dõi', label: 'Hợp đồng cần ký', icon: 'file-text', placeholders: ['message'],
    title: '✍️ Hợp đồng cần ký', message: '{{message}}',
  },
  'contract_sign_reminder': {
    category: 'Hợp đồng — Theo dõi', label: 'Nhắc ký hợp đồng', icon: 'file-text', placeholders: ['message'],
    title: '🔔 Nhắc ký hợp đồng', message: '{{message}}',
  },
  'contract_sign_escalated': {
    category: 'Hợp đồng — Theo dõi', label: 'Báo cáo cấp trên: hồ sơ chưa hoàn thành', icon: 'alert-triangle', placeholders: ['message'],
    title: '🚨 Báo cáo: hồ sơ nhân sự chưa hoàn thành', message: '{{message}}',
  },

  // ── Đánh giá — theo dõi ──
  'evaluation_status_change': {
    category: 'Đánh giá — Theo dõi', label: 'Đánh giá đổi trạng thái', icon: 'clipboard-check', placeholders: ['message'],
    title: '🔄 Đánh giá đổi trạng thái', message: '{{message}}',
  },
  'evaluation_created': {
    category: 'Đánh giá — Theo dõi', label: 'Thẻ đánh giá đã được tạo', icon: 'clipboard-check', placeholders: ['typeName', 'message'],
    title: '📋 Thẻ đánh giá {{typeName}} đã được tạo', message: '{{message}}',
  },
  'evaluation_passed': {
    category: 'Đánh giá — Theo dõi', label: 'Đạt thử việc — cần hoàn thiện hợp đồng', icon: 'file-text', placeholders: ['message'],
    title: '✅ Nhân viên đạt thử việc — cần hoàn thiện hợp đồng', message: '{{message}}',
  },
  'evaluation_terminated': {
    category: 'Đánh giá — Theo dõi', label: 'Chấm dứt thử việc — quy trình Offboarding đã khởi tạo', icon: 'user-x', placeholders: ['message'],
    title: '⚠️ Chấm dứt thử việc — quy trình Offboarding đã khởi tạo', message: '{{message}}',
  },

  // ── Chấm công / Phép (in-app, đơn lẻ) ──
  'attendance_checkin': {
    category: 'Chấm công', label: 'Điểm danh vào', icon: 'clock', placeholders: ['time', 'date', 'src', 'userName'],
    title: 'Điểm danh vào thành công', message: '{{time}} — {{date}} · {{src}}',
    telegram: '✅ *Bạn Đã Điểm Danh Vào Thành Công!*\n\n👤 {{userName}}\n📱 {{src}}\n🕐 {{time}} - {{date}}\n\n☀️ Chúc bạn có một ngày làm việc năng lượng! 💪⚡',
  },
  'attendance_checkout': {
    category: 'Chấm công', label: 'Điểm danh ra', icon: 'clock', placeholders: ['time', 'date', 'src', 'userName'],
    title: 'Điểm danh ra thành công', message: '{{time}} — {{date}} · {{src}}',
    telegram: '🔚 *Bạn Đã Điểm Danh Ra Thành Công!*\n\n👤 {{userName}}\n📱 {{src}}\n🕐 {{time}} - {{date}}\n\n🏡 Chúc bạn về nhà cẩn thận và có một bữa cơm ngon miệng nhé! 🍚😋',
  },
  'overtime_submitted': {
    category: 'Chấm công', label: 'Khai báo tăng ca mới', icon: 'timer', placeholders: ['companyLine', 'employeeName', 'date', 'startTime', 'endTime', 'totalHours'],
    title: 'Khai báo tăng ca mới', message: '{{companyLine}}{{employeeName}} · Ngày {{date}}: {{startTime}}–{{endTime}} ({{totalHours}})',
  },
  'overtime_reviewed:approved': {
    category: 'Chấm công', label: 'Tăng ca được duyệt', icon: 'timer', placeholders: ['date', 'startTime', 'endTime', 'totalHours', 'noteSuffix', 'reviewerLine', 'noteLine'],
    title: 'Tăng ca đã được duyệt', message: 'Ngày {{date}}: {{startTime}}–{{endTime}} ({{totalHours}}){{noteSuffix}}',
    telegram: '✅ *Khai Báo Tăng Ca Đã Được Duyệt*\n\n📅 Ngày: {{date}}\n🕐 Giờ: {{startTime}} – {{endTime}} ({{totalHours}}){{reviewerLine}}',
  },
  'overtime_reviewed:rejected': {
    category: 'Chấm công', label: 'Tăng ca bị từ chối', icon: 'timer', placeholders: ['date', 'startTime', 'endTime', 'totalHours', 'noteSuffix', 'reviewerLine', 'noteLine'],
    title: 'Tăng ca bị từ chối', message: 'Ngày {{date}}: {{startTime}}–{{endTime}} ({{totalHours}}){{noteSuffix}}',
    telegram: '❌ *Khai Báo Tăng Ca Bị Từ Chối*\n\n📅 Ngày: {{date}}\n🕐 Giờ: {{startTime}} – {{endTime}} ({{totalHours}}){{reviewerLine}}{{noteLine}}',
  },
  'adjustment_submitted': {
    category: 'Chấm công', label: 'Đề xuất điều chỉnh công mới', icon: 'file-text', placeholders: ['companyLine', 'typeLabel', 'employeeName', 'date'],
    title: 'Đề xuất {{typeLabel}} mới', message: '{{companyLine}}{{employeeName}} · Ngày {{date}}',
  },
  'adjustment_reviewed:approved': {
    category: 'Chấm công', label: 'Điều chỉnh công được duyệt', icon: 'file-text', placeholders: ['typeLabel', 'date', 'noteSuffix', 'reviewerLine', 'noteLine'],
    title: '{{typeLabel}} đã được duyệt', message: 'Ngày {{date}}{{noteSuffix}}',
    telegram: '✅ *Đề Xuất {{typeLabel}} Đã Được Duyệt*\n\n📅 Ngày: {{date}}{{reviewerLine}}',
  },
  'adjustment_reviewed:rejected': {
    category: 'Chấm công', label: 'Điều chỉnh công bị từ chối', icon: 'file-text', placeholders: ['typeLabel', 'date', 'noteSuffix', 'reviewerLine', 'noteLine'],
    title: '{{typeLabel}} bị từ chối', message: 'Ngày {{date}}{{noteSuffix}}',
    telegram: '❌ *Đề Xuất {{typeLabel}} Bị Từ Chối*\n\n📅 Ngày: {{date}}{{reviewerLine}}{{noteLine}}',
  },
  'adjustment_auto_cancelled:employee': {
    category: 'Chấm công', label: 'Điều chỉnh tự hủy (báo nhân viên)', icon: 'refresh-cw', placeholders: ['typeLabel', 'date'],
    title: 'Đề xuất {{typeLabel}} tự động hủy', message: 'Ngày {{date}} — Dữ liệu chấm công đã về, đề xuất không còn cần thiết.',
    telegram: '🔄 *Đề Xuất {{typeLabel}} Tự Động Hủy*\n\n📅 Ngày: {{date}}\n\n✅ Dữ liệu chấm công đã được ghi nhận.\n_Đề xuất không còn cần thiết._',
  },
  'adjustment_auto_cancelled:manager': {
    category: 'Chấm công', label: 'Điều chỉnh tự hủy (báo quản lý)', icon: 'refresh-cw', placeholders: ['typeLabel', 'employeeName', 'date'],
    title: 'Đề xuất {{typeLabel}} tự động hủy', message: '{{employeeName}} · Ngày {{date}} — Dữ liệu vân tay đã về, không cần xét duyệt.',
    telegram: '🔄 *Đề Xuất {{typeLabel}} Tự Động Hủy*\n\n👤 Nhân viên: *{{employeeName}}*\n📅 Ngày: {{date}}\n\n✅ Dữ liệu đã về — không cần xét duyệt.',
  },
  'leave_submitted': {
    category: 'Chấm công', label: 'Đơn nghỉ phép mới', icon: 'calendar', placeholders: ['companyLine', 'employeeName', 'typeName', 'range', 'totalDays'],
    title: 'Đơn nghỉ phép mới', message: '{{companyLine}}{{employeeName}} · {{typeName}} · {{range}} ({{totalDays}} ngày)',
  },
  'leave_reviewed:approved': {
    category: 'Chấm công', label: 'Đơn nghỉ được duyệt', icon: 'calendar', placeholders: ['typeName', 'range', 'noteSuffix', 'totalDays', 'noteLine'],
    title: 'Đơn {{typeName}} đã được duyệt', message: '{{range}}{{noteSuffix}}',
    telegram: '✅ *Đơn {{typeName}} Đã Được Duyệt*\n\n📅 Thời gian: {{range}} ({{totalDays}} ngày công){{noteLine}}',
  },
  'leave_reviewed:rejected': {
    category: 'Chấm công', label: 'Đơn nghỉ bị từ chối', icon: 'calendar', placeholders: ['typeName', 'range', 'noteSuffix', 'totalDays', 'noteLine'],
    title: 'Đơn {{typeName}} bị từ chối', message: '{{range}}{{noteSuffix}}',
    telegram: '❌ *Đơn {{typeName}} Bị Từ Chối*\n\n📅 Thời gian: {{range}} ({{totalDays}} ngày công){{noteLine}}',
  },

  // ── Tài sản ──
  'asset_assigned': {
    category: 'Tài sản', label: 'Cấp tài sản cho nhân viên', icon: 'package', placeholders: ['name', 'code', 'brandLine', 'serialLine', 'performedBy'],
    title: '📦 Tài sản vừa được cấp cho bạn', message: '{{name}} · Mã {{code}}',
    telegram: '📦 *Tài Sản Vừa Được Cấp Cho Bạn*\n\n🏷️ *Tên:* {{name}}\n🔢 *Mã:* {{code}}\n{{brandLine}}{{serialLine}}👤 *Cấp bởi:* {{performedBy}}',
  },
  'asset_revoked': {
    category: 'Tài sản', label: 'Thu hồi tài sản', icon: 'package', placeholders: ['name', 'code', 'performedBy'],
    title: '🔄 Tài sản đã được thu hồi', message: '{{name}} · Mã {{code}}',
    telegram: '🔄 *Tài Sản Đã Được Thu Hồi*\n\n🏷️ *Tên:* {{name}}\n🔢 *Mã:* {{code}}\n👤 *Thu hồi bởi:* {{performedBy}}',
  },
  'attendance_summary:full': {
    category: 'Chấm công', label: 'Tổng kết chấm công tháng (mặc định đủ công)', icon: 'clock',
    placeholders: ['monthLabel', 'daysPresent', 'leaveDays'],
    title: '📊 Tổng kết chấm công {{monthLabel}}',
    message: 'Bạn được tính đủ công {{daysPresent}} ngày trong {{monthLabel}} (vị trí không phải điểm danh). Nghỉ phép {{leaveDays}} ngày. Xem chi tiết bảng công tại hệ thống.',
    telegram: '📊 *Tổng Kết Chấm Công {{monthLabel}}*\n\n✅ *Đủ công:* {{daysPresent}} ngày\n🌴 *Nghỉ phép:* {{leaveDays}} ngày\n\n_Vị trí của bạn được cấu hình mặc định đủ công nên không cần điểm danh._',
  },
  'attendance_summary:punch': {
    category: 'Chấm công', label: 'Tổng kết chấm công tháng', icon: 'clock',
    placeholders: ['monthLabel', 'daysPresent', 'fingerprintDays', 'phoneDays', 'adjustmentDays', 'leaveDays'],
    title: '📊 Tổng kết chấm công {{monthLabel}}',
    message: 'Bạn đã có mặt {{daysPresent}} ngày trong {{monthLabel}} (vân tay {{fingerprintDays}} · app {{phoneDays}} · bù công {{adjustmentDays}}). Nghỉ phép {{leaveDays}} ngày. Xem chi tiết bảng công tại hệ thống.',
    telegram: '📊 *Tổng Kết Chấm Công {{monthLabel}}*\n\n✅ *Có mặt:* {{daysPresent}} ngày\n • Vân tay: {{fingerprintDays}}\n • App điện thoại: {{phoneDays}}\n • Bù công / WFH / công tác: {{adjustmentDays}}\n🌴 *Nghỉ phép:* {{leaveDays}} ngày\n\n_Số liệu tính theo kỳ công, khớp với Bảng Công trên hệ thống._',
  },

  // ── Đánh giá thử việc — kết luận (báo nhân viên) ──
  'evaluation_passed_employee': {
    category: 'Đánh giá — Kết luận', label: 'Đạt thử việc (báo nhân viên)', icon: 'check-circle', placeholders: [],
    title: '🎉 Chúc mừng! Bạn đã đạt thử việc',
    message: 'Bạn đã hoàn thành giai đoạn thử việc và chuyển sang nhân viên chính thức. Hệ thống đã tạo hợp đồng chính thức — C&B sẽ liên hệ để ký kết.',
  },
  'evaluation_extended': {
    category: 'Đánh giá — Kết luận', label: 'Thử việc kéo dài', icon: 'clock', placeholders: ['message'],
    title: '📋 Thử việc được kéo dài', message: '{{message}}',
  },
  'evaluation_failed': {
    category: 'Đánh giá — Kết luận', label: 'Không đạt thử việc', icon: 'x-circle', placeholders: ['message'],
    title: '📋 Kết quả đánh giá thử việc', message: '{{message}}',
  },

  // ── Yêu cầu xoá tài sản ──
  'delete_request_pending': {
    category: 'Yêu cầu xoá tài sản', label: 'Yêu cầu xoá mới (báo super admin)', icon: 'trash', placeholders: ['requestedByName', 'assetName', 'assetCode', 'reason'],
    title: 'Có yêu cầu xóa tài sản mới', message: '{{requestedByName}} yêu cầu xóa tài sản: {{assetName}} ({{assetCode}}). Lý do: {{reason}}',
  },
  'delete_request_approved': {
    category: 'Yêu cầu xoá tài sản', label: 'Yêu cầu xoá được duyệt', icon: 'trash', placeholders: ['assetName', 'assetCode', 'reason'],
    title: 'Yêu cầu xóa tài sản đã được phê duyệt', message: '{{assetName}} ({{assetCode}}) đã được xóa khỏi hệ thống. Lý do: {{reason}}',
  },
  'delete_request_rejected': {
    category: 'Yêu cầu xoá tài sản', label: 'Yêu cầu xoá bị từ chối', icon: 'alert-triangle', placeholders: ['assetName', 'reason'],
    title: 'Yêu cầu xóa tài sản bị từ chối', message: 'Yêu cầu xóa {{assetName}} đã bị từ chối. Lý do: {{reason}}',
  },

  // ── Đổi hồ sơ HR ──
  'hr_doc_replace_request': {
    category: 'Hồ sơ HR', label: 'Yêu cầu đổi hồ sơ', icon: 'folder', placeholders: ['requester', 'docTitle', 'docType'],
    title: '📄 Yêu cầu đổi hồ sơ', message: '{{requester}} yêu cầu đổi hồ sơ "{{docTitle}}" ({{docType}}). Vui lòng xem xét và duyệt trong trang Quản Lý Hồ Sơ.',
  },
  'hr_doc_replace_approved': {
    category: 'Hồ sơ HR', label: 'Đổi hồ sơ được duyệt', icon: 'folder', placeholders: [],
    title: '✅ Hồ sơ đã được đổi', message: 'Yêu cầu đổi hồ sơ của bạn đã được C&B chấp nhận. Hồ sơ đã được cập nhật.',
  },
  'hr_doc_replace_rejected': {
    category: 'Hồ sơ HR', label: 'Đổi hồ sơ bị từ chối', icon: 'folder', placeholders: ['noteSuffix'],
    title: '❌ Yêu cầu đổi hồ sơ bị từ chối', message: 'Yêu cầu đổi hồ sơ của bạn đã bị từ chối{{noteSuffix}}',
  },

  // ── Onboarding — duyệt hồ sơ ──
  'onboarding_submitted': {
    category: 'Onboarding', label: 'Nhân sự mới nộp biểu mẫu', icon: 'user-plus', placeholders: ['candidateName', 'jtSuffix', 'jtLine', 'emailLine'],
    title: '📩 Nhân sự mới nộp biểu mẫu nhận việc',
    message: '{{candidateName}}{{jtSuffix}} vừa gửi thông tin. Vui lòng kiểm tra và chuẩn hóa.',
    telegram: '📩 *Nhân sự mới nộp biểu mẫu nhận việc*\n\n👤 {{candidateName}}\n{{jtLine}}{{emailLine}}\n_Vui lòng kiểm tra và chuẩn hóa thông tin._',
  },
  'onboarding_sent_to_admin': {
    category: 'Onboarding', label: 'Hồ sơ chờ duyệt tạo tài khoản', icon: 'user-check', placeholders: ['candidateName', 'jtSuffix', 'jtLine'],
    title: '🔔 Hồ sơ nhân sự chờ duyệt tạo tài khoản',
    message: '{{candidateName}}{{jtSuffix}} đã được Tuyển Dụng chuẩn hóa. Vui lòng xem xét và cấp tài khoản.',
    telegram: '🔔 *Hồ sơ nhân sự chờ duyệt tạo tài khoản*\n\n👤 {{candidateName}}\n{{jtLine}}\n_Bộ phận Tuyển Dụng đã chuẩn hóa xong, cần Quản trị viên cấp tài khoản._',
  },
  'onboarding_approved': {
    category: 'Onboarding', label: 'Nhân sự mới được duyệt', icon: 'check-circle', placeholders: ['candidateName'],
    title: '✅ Nhân sự mới đã được duyệt vào hệ thống',
    message: '{{candidateName}} đã được cấp tài khoản và trở thành nhân sự chính thức.',
    telegram: '✅ *Nhân sự mới đã được duyệt vào hệ thống*\n\n👤 {{candidateName}}\n\n_Tài khoản đã được tạo, hồ sơ chuyển thành chính thức._',
  },
  'onboarding_rejected': {
    category: 'Onboarding', label: 'Hồ sơ nhân sự bị từ chối', icon: 'x-circle', placeholders: ['candidateName', 'reasonSuffix', 'reasonLine'],
    title: '❌ Hồ sơ nhân sự mới bị từ chối',
    message: '{{candidateName}} không được duyệt vào hệ thống.{{reasonSuffix}}',
    telegram: '❌ *Hồ sơ nhân sự mới bị từ chối*\n\n👤 {{candidateName}}\n{{reasonLine}}\n_Xem chi tiết trong mục Onboarding._',
  },
  'onboarding_welcome': {
    category: 'Onboarding', label: 'Chào mừng nhân sự mới (gửi cho nhân sự)', icon: 'party-popper', placeholders: ['name'],
    title: '🎉 Chào mừng gia nhập FADO Group',
    message: 'Tài khoản AssetFlow Pro của {{name}} đã được kích hoạt. Chúc bạn khởi đầu thuận lợi!',
    telegram:
      '🎉 *Chào mừng {{name}} gia nhập hệ sinh thái FADO Group!*\n\n' +
      'Tài khoản AssetFlow Pro của bạn đã được kích hoạt.\n' +
      'Bạn sẽ nhận thông báo chấm công, công việc và đặt phòng họp qua Telegram này.\n\n' +
      '_Chúc bạn khởi đầu thuận lợi và gắn bó dài lâu cùng FADO!_ 🚀',
  },

  // ── Onboarding — thoả thuận nháp ──
  'onboarding_contract_draft': {
    category: 'Onboarding', label: 'Cần chuẩn bị thoả thuận nhân sự mới', icon: 'file-text', placeholders: ['labels', 'emp', 'hireDate'],
    title: '📝 Cần chuẩn bị thoả thuận cho nhân sự mới',
    message: 'Đã tạo bản nháp {{labels}} cho {{emp}} (ngày vào làm {{hireDate}}). Vui lòng hoàn thiện nội dung và ký trước ngày nhận việc.',
  },

  // ── Tuyển dụng — gắn ứng viên ──
  'requisition_candidate_linked': {
    category: 'Tuyển dụng', label: 'Có CV phù hợp', icon: 'users', placeholders: ['candidate', 'reqTitle'],
    title: 'Có CV phù hợp cho yêu cầu tuyển dụng',
    message: 'Ứng viên {{candidate}} đã được liên kết với "{{reqTitle}}". Vui lòng kiểm tra và đánh giá.',
  },

  // ── Tuyển dụng — đánh giá/ghi chú ứng viên ──
  'requisition_candidate_note': {
    category: 'Tuyển dụng', label: 'Đánh giá/ghi chú ứng viên mới', icon: 'users',
    placeholders: ['candidate', 'reqTitle', 'author', 'excerpt'],
    title: '💬 Đánh giá mới cho ứng viên {{candidate}}',
    message: '{{author}} vừa ghi đánh giá cho {{candidate}} — yêu cầu "{{reqTitle}}": {{excerpt}}',
    telegram: '💬 *ĐÁNH GIÁ ỨNG VIÊN MỚI*\n\n👤 *Ứng viên:* {{candidate}}\n📋 *Yêu cầu:* {{reqTitle}}\n✍️ *Người đánh giá:* {{author}}\n\n{{excerpt}}',
  },

  // ── Công việc (Task) — tương tác ──
  'task_assigned': {
    category: 'Công việc', label: 'Công việc mới được giao', icon: 'task', placeholders: ['code', 'title', 'priority', 'dueDate', 'createdBy'],
    title: '📋 Công việc mới được giao',
    message: 'Task {{code}}: "{{title}}" đã được giao cho bạn. Ưu tiên: {{priority}}',
    telegram: '📋 *TASK MỚI ĐƯỢC GIAO*\n\n🔖 *Mã:* {{code}}\n📝 *Tiêu đề:* {{title}}\n🎯 *Ưu tiên:* {{priority}}\n📅 *Hạn chót:* {{dueDate}}\n👤 *Giao bởi:* {{createdBy}}',
  },
  'task_co_assigned': {
    category: 'Công việc', label: 'Được thêm đồng phụ trách', icon: 'task', placeholders: ['code', 'title', 'priority', 'dueDate', 'actorName'],
    title: '👥 Bạn là đồng phụ trách task mới',
    message: 'Bạn được thêm làm đồng phụ trách task {{code}}: "{{title}}" bởi {{actorName}}',
    telegram: '👥 *BẠN LÀ ĐỒNG PHỤ TRÁCH TASK MỚI*\n\n🔖 *Mã:* {{code}}\n📝 *Tiêu đề:* {{title}}\n🎯 *Ưu tiên:* {{priority}}\n📅 *Hạn chót:* {{dueDate}}\n👤 *Thêm bởi:* {{actorName}}',
  },
  'task_commented': {
    category: 'Công việc', label: 'Bình luận mới trong công việc', icon: 'comment', placeholders: ['code', 'title', 'actorName', 'excerpt'],
    title: '💬 Bình luận mới trong công việc',
    message: '{{actorName}} đã bình luận trong task {{code}}: "{{excerpt}}"',
    telegram: '💬 *BÌNH LUẬN MỚI TRONG TASK*\n\n🔖 *Mã:* {{code}}\n📝 *Tiêu đề:* {{title}}\n👤 *Người bình luận:* {{actorName}}\n💭 *Nội dung:* {{excerpt}}',
  },
  'task_subtask_added': {
    category: 'Công việc', label: 'Subtask mới', icon: 'task', placeholders: ['code', 'taskTitle', 'subtaskTitle', 'actorName'],
    title: '➕ Subtask mới',
    message: '{{actorName}} đã thêm subtask "{{subtaskTitle}}" vào task {{code}}',
    telegram: '➕ *SUBTASK MỚI*\n\n🔖 *Task:* {{code}} — {{taskTitle}}\n📌 *Subtask:* {{subtaskTitle}}\n👤 *Thêm bởi:* {{actorName}}',
  },

  'task_status_changed': {
    category: 'Công việc', label: 'Trạng thái công việc thay đổi', icon: 'update',
    placeholders: ['code', 'title', 'oldLabel', 'newLabel', 'oldStatusTg', 'newStatusTg', 'priorityTg', 'changedBy'],
    title: '🔄 Trạng thái công việc thay đổi',
    message: 'Task {{code}}: "{{title}}" đã được chuyển từ "{{oldLabel}}" → "{{newLabel}}"',
    telegram: '🔄 *CÔNG VIỆC CỦA BẠN CÓ CẬP NHẬT*\n\n📋 *Mã:* {{code}}\n📝 *Tiêu đề:* {{title}}\n━━━━━━━━━━━━━━━━━━━━━━━━\n📊 *Cập nhật:*\n• Trạng thái: {{oldStatusTg}} → {{newStatusTg}}\n• Ưu tiên: {{priorityTg}}\n• Cập nhật bởi: {{changedBy}}',
  },
  'task_mention': {
    category: 'Công việc', label: 'Được nhắc tên trong công việc', icon: 'message-circle',
    placeholders: ['code', 'title', 'authorName', 'excerpt'],
    title: '{{authorName}} đã nhắc đến bạn',
    message: 'Trong task [{{code}}] {{title}}: "{{excerpt}}"',
    telegram: '💬 *BẠN ĐÃ ĐƯỢC NHẮC ĐẾN TRONG TASK*\n\n📋 *Mã:* {{code}}\n📝 *Tiêu đề:* {{title}}\n👤 *Từ:* {{authorName}}\n💭 *Nội dung:* "_{{excerpt}}_"',
  },

  // ── Tuyển dụng — trạng thái ứng viên theo vị trí (2 chiều: người yêu cầu ↔ tuyển dụng) ──
  'application_status_changed': {
    category: 'Tuyển dụng', label: 'Cập nhật trạng thái ứng viên', icon: 'users',
    placeholders: ['candidate', 'reqTitle', 'statusLabel', 'actorName', 'actorSide'],
    title: '🔄 Ứng viên {{candidate}} — {{statusLabel}}',
    message: '{{actorSide}} ({{actorName}}) đã chuyển ứng viên {{candidate}} sang "{{statusLabel}}" cho vị trí "{{reqTitle}}".',
    telegram: '🔄 *CẬP NHẬT ỨNG VIÊN*\n\n👤 *Ứng viên:* {{candidate}}\n💼 *Vị trí:* {{reqTitle}}\n📊 *Trạng thái mới:* {{statusLabel}}\n✍️ *Bởi:* {{actorSide}} — {{actorName}}',
  },

  // ── Tuyển dụng — lịch phỏng vấn (gửi người phỏng vấn) ──
  'interview_scheduled': {
    category: 'Tuyển dụng', label: 'Lịch phỏng vấn mới', icon: 'calendar',
    placeholders: ['candidate', 'reqTitle', 'round', 'when', 'mode', 'where'],
    title: '📅 Lịch phỏng vấn: {{candidate}} — {{round}}',
    message: 'Phỏng vấn {{candidate}} cho "{{reqTitle}}" ({{round}}) lúc {{when}} · {{mode}} · {{where}}',
    telegram: '📅 *LỊCH PHỎNG VẤN MỚI*\n\n👤 *Ứng viên:* {{candidate}}\n💼 *Vị trí:* {{reqTitle}}\n🔄 *Vòng:* {{round}}\n🕒 *Thời gian:* {{when}}\n📍 *Hình thức:* {{mode}} · {{where}}',
  },
  'interview_cancelled': {
    category: 'Tuyển dụng', label: 'Huỷ lịch phỏng vấn', icon: 'calendar-x',
    placeholders: ['candidate', 'reqTitle', 'round', 'when'],
    title: '❌ Huỷ phỏng vấn: {{candidate}} — {{round}}',
    message: 'Đã huỷ lịch phỏng vấn {{candidate}} cho "{{reqTitle}}" ({{round}}) lúc {{when}}',
    telegram: '❌ *HUỶ LỊCH PHỎNG VẤN*\n\n👤 *Ứng viên:* {{candidate}}\n💼 *Vị trí:* {{reqTitle}}\n🕒 *Đã huỷ:* {{when}}',
  },

  // ── Tuyển dụng — yêu cầu (nội dung động qua {{title}}/{{body}}) ──
  'requisition_passthrough': {
    category: 'Tuyển dụng', label: 'Yêu cầu tuyển dụng (nội dung động)', icon: 'megaphone', placeholders: ['title', 'body'],
    title: '{{title}}', message: '{{body}}',
  },
  'recruitment_update': {
    category: 'Tuyển dụng', label: 'Cập nhật thông tin tuyển dụng', icon: 'megaphone',
    placeholders: ['title', 'body'], title: '{{title}}', message: '{{body}}',
  },
  'fdv_reminder': {
    category: 'Tuyển dụng', label: 'FDV nhắc công việc', icon: 'bell',
    placeholders: ['body'], title: 'FDV · Nhắc công việc', message: '{{body}}',
  },

  // ── Tuyển dụng — báo cáo tuần (Telegram) ──
  'recruitment_weekly_report': {
    category: 'Tuyển dụng', label: 'Báo cáo tuyển dụng tuần', icon: 'bar-chart',
    placeholders: ['newSub', 'approvedWeek', 'processing', 'reqOpen', 'reqOnHold', 'totalFilled', 'totalTarget', 'avgTimeToFill', 'agingLine', 'probationPassRate', 'headcount', 'leavers12m', 'turnoverRate', 'forecastNextMonth'],
    title: '📊 Báo cáo tuyển dụng tuần',
    message: 'Hồ sơ mới {{newSub}} · Đã duyệt {{approvedWeek}} · Đang tuyển {{reqOpen}}',
    telegram:
      '📊 *BÁO CÁO TUYỂN DỤNG TUẦN — FADO Group*\n\n' +
      '*Tiếp nhận nhân sự (7 ngày qua)*\n' +
      '• Hồ sơ mới nộp: *{{newSub}}*\n' +
      '• Đã duyệt vào hệ thống: *{{approvedWeek}}*\n' +
      '• Đang xử lý: {{processing}}\n\n' +
      '*Yêu cầu tuyển dụng*\n' +
      '• Đang tuyển: *{{reqOpen}}* (tạm dừng {{reqOnHold}})\n' +
      '• Nhu cầu đã lấp: {{totalFilled}}/{{totalTarget}}\n' +
      '• Time-to-fill TB: {{avgTimeToFill}} ngày\n' +
      '{{agingLine}}\n\n' +
      '*Chất lượng & nhân sự*\n' +
      '• Tỷ lệ đậu thử việc: *{{probationPassRate}}%*\n' +
      '• Tổng nhân sự (active): {{headcount}}\n' +
      '• Nghỉ việc 12 tháng: {{leavers12m}} (turnover {{turnoverRate}}%)\n' +
      '• Dự báo tuyển tháng tới: ~{{forecastNextMonth}} người',
  },

  // ── Ticket — theo dõi & nhắc tên ──
  'ticket_watcher_status': {
    category: 'Ticket', label: 'Ticket đổi trạng thái (người theo dõi)', icon: 'refresh-cw',
    placeholders: ['code', 'title', 'actorName', 'oldLabel', 'newLabel', 'oldStatusTg', 'newStatusTg', 'priorityTg'],
    title: 'Ticket [{{code}}] thay đổi trạng thái',
    message: '{{actorName}} đổi từ "{{oldLabel}}" → "{{newLabel}}"',
    telegram: '🔄 *TICKET CỦA BẠN CÓ CẬP NHẬT*\n\n🎫 *Mã:* {{code}}\n📝 *Tiêu đề:* {{title}}\n━━━━━━━━━━━━━━━━━━━━━━━━\n📊 *Cập nhật:*\n• Trạng thái: {{oldStatusTg}} → {{newStatusTg}}\n• Ưu tiên: {{priorityTg}}\n• Cập nhật bởi: {{actorName}}',
  },
  'ticket_watcher_comment': {
    category: 'Ticket', label: 'Bình luận mới (người theo dõi)', icon: 'message-circle',
    placeholders: ['code', 'title', 'actorName', 'excerptShort', 'excerptLong'],
    title: 'Bình luận mới trong ticket [{{code}}]',
    message: '{{actorName}}: "{{excerptShort}}"',
    telegram: '💬 *BÌNH LUẬN MỚI TRONG TICKET BẠN THEO DÕI*\n\n🎫 *Mã:* {{code}}\n📝 *Tiêu đề:* {{title}}\n👤 *Từ:* {{actorName}}\n💭 *Nội dung:* "_{{excerptLong}}_"',
  },
  'ticket_mention': {
    category: 'Ticket', label: 'Được nhắc tên trong ticket', icon: 'message-circle',
    placeholders: ['authorName', 'code', 'title', 'excerptShort', 'excerptLong'],
    title: '{{authorName}} đã nhắc đến bạn',
    message: 'Trong ticket [{{code}}] {{title}}: "{{excerptShort}}"',
    telegram: '💬 *BẠN ĐÃ ĐƯỢC NHẮC ĐẾN TRONG TICKET*\n\n🎫 *Mã:* {{code}}\n📝 *Tiêu đề:* {{title}}\n👤 *Từ:* {{authorName}}\n💭 *Nội dung:* "_{{excerptLong}}_"',
  },
  // ── Ticket — giao việc / leo thang / đổi trạng thái (người được giao & người tạo) ──
  // detailLines = các dòng tùy chọn (Loại Yêu Cầu / Danh Mục / Chi tiết) ghép sẵn, có thể rỗng.
  'ticket_assigned': {
    category: 'Ticket', label: 'Ticket mới được giao', icon: 'ticket',
    placeholders: ['code', 'title', 'description', 'priorityLabel', 'statusLabel', 'detailLines', 'requesterName', 'formattedTime'],
    title: '📌 Ticket mới được giao',
    message: 'Ticket {{code}}: "{{title}}" đã được giao cho bạn. Ưu tiên: {{priorityLabel}}',
    telegram: '📌 *Ticket Mới Được Giao*\n\nMã: {{code}}\nTiêu đề: {{title}}\nMô tả: {{description}}\n━━━━━━━━━━━━━━━━━━━━━━━━\n📊 *Chi tiết:*\n• Ưu tiên: {{priorityLabel}}\n• Trạng thái: {{statusLabel}}{{detailLines}}\n━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Người yêu cầu: {{requesterName}}\n📅 Thời gian: {{formattedTime}}',
  },
  'ticket_escalated': {
    category: 'Ticket', label: 'Ticket leo thang ưu tiên', icon: 'alert-triangle',
    placeholders: ['code', 'title', 'description', 'oldPriorityLabel', 'newPriorityLabel', 'statusLabel', 'detailLines', 'requesterName', 'formattedTime'],
    title: '🚨 Ticket leo thang ưu tiên',
    message: 'Ticket {{code}}: "{{title}}" leo thang {{oldPriorityLabel}} → {{newPriorityLabel}} — cần xử lý ngay!',
    telegram: '🚨 *TICKET ESCALATION ALERT*\n\nMã: {{code}}\nTiêu đề: {{title}}\nMô tả: {{description}}\n━━━━━━━━━━━━━━━━━━━━━━━━\n📊 *Chi tiết:*\n• Ưu tiên: {{oldPriorityLabel}} → {{newPriorityLabel}}\n• Trạng thái: {{statusLabel}}{{detailLines}}\n━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Người yêu cầu: {{requesterName}}\n📅 Thời gian: {{formattedTime}}\n\n⚠️ *Ticket này cần action ngay lập tức!*',
  },
  'ticket_status_party': {
    category: 'Ticket', label: 'Ticket đổi trạng thái (người được giao & người tạo)', icon: 'refresh-cw',
    placeholders: ['code', 'title', 'oldStatusTg', 'newStatusTg', 'priorityTg', 'actorName'],
    title: 'Ticket [{{code}}] thay đổi trạng thái',
    message: 'Ticket "{{title}}" được cập nhật bởi {{actorName}}',
    telegram: '🔄 *TICKET CỦA BẠN CÓ CẬP NHẬT*\n\n🎫 *Mã:* {{code}}\n📝 *Tiêu đề:* {{title}}\n━━━━━━━━━━━━━━━━━━━━━━━━\n📊 *Cập nhật:*\n• Trạng thái: {{oldStatusTg}} → {{newStatusTg}}\n• Ưu tiên: {{priorityTg}}\n• Cập nhật bởi: {{actorName}}',
  },

  // ── Thông báo chung & Văn bản (broadcast) ──
  'announcement_broadcast': {
    category: 'Thông báo chung', label: 'Thông báo mới (broadcast)', icon: 'megaphone', placeholders: ['title', 'contentExcerpt'],
    title: 'Thông báo mới',
    message: '{{title}}',
    telegram: '📢 *Thông Báo Mới*\n\n*{{title}}*\n\n{{contentExcerpt}}...',
  },
  'document_broadcast': {
    category: 'Thông báo chung', label: 'Văn bản / Quyết định mới (broadcast)', icon: 'file-text', placeholders: ['docTitle', 'numberSuffix', 'numberLine'],
    title: 'Văn bản - Quyết định mới',
    message: '{{docTitle}}{{numberSuffix}}',
    telegram: '📄 *Văn bản - Quyết định mới*\n\n*{{docTitle}}*{{numberLine}}',
  },

  // ── Cảnh báo tên miền ──
  'domain_alert:30': {
    category: 'Tên miền', label: 'Tên miền sắp hết hạn (30 ngày)', icon: 'bell', placeholders: ['domain', 'expirationDate'],
    title: '🔔 Tên miền sắp hết hạn (30 ngày)', message: 'Tên miền {{domain}} sẽ hết hạn vào {{expirationDate}}. Còn 30 ngày để gia hạn.',
  },
  'domain_alert:20': {
    category: 'Tên miền', label: 'Tên miền sắp hết hạn (20 ngày)', icon: 'bell', placeholders: ['domain', 'expirationDate'],
    title: '🔔 Tên miền sắp hết hạn (20 ngày)', message: 'Tên miền {{domain}} sẽ hết hạn vào {{expirationDate}}. Còn 20 ngày để gia hạn.',
  },
  'domain_alert:10': {
    category: 'Tên miền', label: 'Tên miền sắp hết hạn (10 ngày)', icon: 'bell', placeholders: ['domain', 'expirationDate'],
    title: '⚠️ Tên miền sắp hết hạn (10 ngày)', message: 'Tên miền {{domain}} sẽ hết hạn vào {{expirationDate}}. Còn 10 ngày để gia hạn.',
  },
  'domain_alert:1': {
    category: 'Tên miền', label: 'Tên miền sắp hết hạn (1 ngày)', icon: 'bell', placeholders: ['domain'],
    title: '🚨 Tên miền sắp hết hạn (1 ngày)', message: 'Tên miền {{domain}} sẽ hết hạn ngày mai. Vui lòng gia hạn ngay!',
  },
  'domain_alert:expired': {
    category: 'Tên miền', label: 'Tên miền đã hết hạn', icon: 'bell', placeholders: ['domain', 'expirationDate'],
    title: '⚠️ Tên miền đã hết hạn', message: 'Tên miền {{domain}} đã hết hạn vào ngày {{expirationDate}}. Vui lòng gia hạn ngay!',
  },

  // ── Offboarding (nghỉ việc) ──
  'offboarding_created': {
    category: 'Offboarding', label: 'Quy trình nghỉ việc mới', icon: 'user-minus', placeholders: ['userName', 'deptLine', 'dateLine'],
    title: '📤 Quy trình nghỉ việc mới',
    message: '{{userName}} — quy trình nghỉ việc vừa được khởi tạo. Vui lòng phối hợp hoàn tất checklist.',
    telegram: '📤 *Quy trình nghỉ việc mới*\n\n👤 {{userName}}\n{{deptLine}}{{dateLine}}\n_Vui lòng phối hợp hoàn tất các đầu mục bàn giao._',
  },
  'offboarding_assigned': {
    category: 'Offboarding', label: 'Nhiệm vụ offboarding được giao', icon: 'clipboard-check', placeholders: ['count', 'userName', 'preview'],
    title: '📋 Nhiệm vụ offboarding được giao',
    message: 'Bạn được giao hoàn thành {{count}} đầu mục cho quy trình nghỉ việc của {{userName}}: {{preview}}',
    telegram: '📋 *Nhiệm vụ offboarding được giao*\n\nBạn được giao hoàn thành {{count}} đầu mục cho quy trình nghỉ việc của {{userName}}: {{preview}}',
  },
  'offboarding_completed': {
    category: 'Offboarding', label: 'Hoàn tất thủ tục nghỉ việc', icon: 'user-minus', placeholders: ['userName', 'deptLine'],
    title: '✅ Hoàn tất thủ tục nghỉ việc',
    message: '{{userName}} đã đủ thủ tục nghỉ việc. Tài khoản đã được vô hiệu hóa.',
    telegram: '✅ *Hoàn tất thủ tục nghỉ việc*\n\n👤 {{userName}}\n{{deptLine}}🔒 Tài khoản đã bị vô hiệu hóa ngay lập tức.',
  },

  // ── Đặt phòng họp — nhắc trước 30 phút ──
  'room_booking_reminder': {
    category: 'Đặt phòng họp', label: 'Nhắc cuộc họp sắp bắt đầu', icon: 'calendar', placeholders: ['roomName', 'startTime', 'endTime', 'purposeSuffix'],
    title: '📍 Phòng họp bắt đầu sau 30 phút',
    message: '{{roomName}} — {{startTime}} đến {{endTime}}{{purposeSuffix}}',
  },

  // ── Phòng họp — đến giờ chưa nhận phòng ──
  'room_checkin_reminder': {
    category: 'Đặt phòng họp', label: 'Nhắc nhận phòng (đến giờ)', icon: 'door-open', placeholders: ['roomName', 'startTime', 'endTime'],
    title: '⏰ Đến giờ họp — nhớ nhận phòng {{roomName}}',
    message: 'Cuộc họp {{startTime}}–{{endTime}} tại {{roomName}}. Quét QR ở cửa phòng để xác nhận đã nhận phòng (tránh bị tự nhả).',
  },

  // ── Phòng họp — sắp hết giờ, nhắc trả phòng ──
  'room_checkout_reminder': {
    category: 'Đặt phòng họp', label: 'Nhắc trả phòng (sắp hết giờ)', icon: 'log-out', placeholders: ['roomName', 'endTime', 'minsLeft'],
    title: '🔔 Còn {{minsLeft}} phút — phòng {{roomName}} sắp hết giờ',
    message: 'Phòng {{roomName}} kết thúc lúc {{endTime}}. Nếu xong sớm hãy trả phòng để người khác dùng. Nếu cần họp thêm, vui lòng GIA HẠN (bấm nút trên Telegram hoặc vào lịch đặt phòng).',
  },

  // ── Phòng họp — tự trả & hoàn tất do quá giờ không thao tác ──
  'room_auto_completed': {
    category: 'Đặt phòng họp', label: 'Tự hoàn tất do quá giờ', icon: 'check-circle', placeholders: ['roomName', 'startTime', 'endTime'],
    title: '✔️ Đã tự hoàn tất & trả phòng {{roomName}}',
    message: 'Cuộc họp {{startTime}}–{{endTime}} tại {{roomName}} đã quá giờ mà chưa trả phòng — hệ thống tự trả phòng và chuyển sang "Đã xong". Phòng đã sẵn sàng cho người khác.',
  },

  // ── Phòng họp — tự nhả do không nhận phòng (no-show) ──
  'room_auto_released': {
    category: 'Đặt phòng họp', label: 'Phòng tự nhả do không nhận', icon: 'alert-triangle', placeholders: ['roomName', 'startTime', 'endTime', 'graceMin'],
    title: '⚠️ Đã tự nhả phòng {{roomName}} (không nhận phòng)',
    message: 'Lịch {{startTime}}–{{endTime}} tại {{roomName}} bị huỷ do không nhận phòng sau {{graceMin}} phút. Phòng đã được giải phóng cho người khác.',
  },

  // ── Onboarding chưa xử lý ──
  'onboarding_reminder': {
    category: 'Onboarding', label: 'Hồ sơ onboarding chưa xử lý', icon: 'user-plus', placeholders: ['daysPending', 'candidateName', 'candidateEmail', 'statusLabel'],
    title: '📋 Onboarding chưa xử lý ({{daysPending}} ngày)',
    message: 'Ứng viên {{candidateName}} ({{candidateEmail}}) — đang {{statusLabel}} sau {{daysPending}} ngày.',
  },

  // ── Công việc / Ticket quá hạn (2 type × 2 trạng thái) ──
  'task_overdue:today': {
    category: 'Công việc', label: 'Công việc đến hạn hôm nay', icon: 'alert-circle', placeholders: ['itemTitle', 'dueFmt'],
    title: '⚠️ Công việc đến hạn hôm nay',
    message: '"{{itemTitle}}" — Hạn {{dueFmt}}. Cần hoàn thành trong hôm nay!',
  },
  'task_overdue:overdue': {
    category: 'Công việc', label: 'Công việc quá hạn', icon: 'alert-circle', placeholders: ['itemTitle', 'dueFmt'],
    title: '🔴 Công việc quá hạn',
    message: '"{{itemTitle}}" — Hạn {{dueFmt}}. Đã quá hạn, cần xử lý ngay!',
  },
  'ticket_overdue:today': {
    category: 'Ticket', label: 'Ticket đến hạn hôm nay', icon: 'alert-circle', placeholders: ['itemTitle', 'dueFmt'],
    title: '⚠️ Ticket đến hạn hôm nay',
    message: '"{{itemTitle}}" — Hạn {{dueFmt}}. Cần hoàn thành trong hôm nay!',
  },
  'ticket_overdue:overdue': {
    category: 'Ticket', label: 'Ticket quá hạn', icon: 'alert-circle', placeholders: ['itemTitle', 'dueFmt'],
    title: '🔴 Ticket quá hạn',
    message: '"{{itemTitle}}" — Hạn {{dueFmt}}. Đã quá hạn, cần xử lý ngay!',
  },

  // ── Bảo trì / bảo hành tài sản (1 dạng) ──
  'asset_reminder': {
    category: 'Hồ sơ — Tài sản', label: 'Bảo trì / bảo hành tài sản', icon: 'package', placeholders: ['reminderType', 'daysUntil', 'assetCode', 'assetName', 'dateFmt'],
    title: '🔧 {{reminderType}} tài sản hết hạn sau {{daysUntil}} ngày',
    message: 'Tài sản [{{assetCode}}] {{assetName}} — {{reminderTypeLower}} hết hạn {{dateFmt}}.',
  },

  // ── Chi Phí ──
  'expense_submitted': {
    category: 'Chi Phí', label: 'Phiếu chi chờ bạn duyệt', icon: 'receipt',
    placeholders: ['code', 'title', 'amountFmt', 'requester', 'company'],
    title: '💸 Phiếu chi {{code}} chờ bạn duyệt',
    message: '{{requester}} đề nghị chi {{amountFmt}} cho {{company}}: "{{title}}". Đến lượt bạn duyệt.',
    telegram: '💸 *Phiếu chi chờ duyệt: {{code}}*\n\n👤 {{requester}}\n🏢 {{company}}\n💵 *{{amountFmt}}*\n📝 {{title}}\n\n_Đến lượt bạn duyệt._',
  },
  'expense_step_approved': {
    category: 'Chi Phí', label: 'Phiếu chi qua 1 cấp duyệt', icon: 'receipt',
    placeholders: ['code', 'title', 'approver'],
    title: '✅ Phiếu chi {{code}} đã qua cấp duyệt',
    message: '{{approver}} đã duyệt phiếu "{{title}}" — đang chuyển cấp tiếp theo.',
  },
  'expense_approved': {
    category: 'Chi Phí', label: 'Phiếu chi được duyệt hoàn tất', icon: 'receipt',
    placeholders: ['code', 'title', 'amountFmt'],
    title: '🎉 Phiếu chi {{code}} đã được duyệt',
    message: 'Phiếu "{{title}}" ({{amountFmt}}) đã duyệt xong toàn bộ các cấp.',
    telegram: '🎉 *Phiếu chi {{code}} ĐÃ DUYỆT*\n\n📝 {{title}}\n💵 *{{amountFmt}}*',
  },
  'expense_rejected': {
    category: 'Chi Phí', label: 'Phiếu chi bị từ chối', icon: 'receipt',
    placeholders: ['code', 'title', 'approver', 'reason'],
    title: '❌ Phiếu chi {{code}} bị từ chối',
    message: '{{approver}} từ chối phiếu "{{title}}". Lý do: {{reason}}',
    telegram: '❌ *Phiếu chi {{code}} bị từ chối*\n\n📝 {{title}}\n👤 {{approver}}\n💬 {{reason}}',
  },
  'expense_message_new': {
    category: 'Chi Phí', label: 'Tin nhắn mới trong phiếu chi', icon: 'message-square',
    placeholders: ['code', 'author', 'preview'],
    title: '💬 {{author}} nhắn trong phiếu chi {{code}}',
    message: '{{preview}}',
  },
  'expense_refund_confirmed': {
    category: 'Chi Phí', label: 'Công ty xác nhận đã nhận hoàn ứng', icon: 'receipt',
    placeholders: ['code', 'title', 'refundFmt', 'confirmer'],
    title: '✅ Hoàn ứng phiếu {{code}} đã được xác nhận',
    message: '{{confirmer}} xác nhận công ty đã nhận {{refundFmt}} hoàn ứng cho phiếu "{{title}}".',
    telegram: '✅ *Đã nhận hoàn ứng — phiếu {{code}}*\n\n📝 {{title}}\n💵 *{{refundFmt}}*\n👤 {{confirmer}}',
  },

  // ── KPI & Đánh Giá — cá nhân ──
  'kpi_assigned': {
    category: 'KPI & Đánh Giá', label: 'Được giao phiếu KPI mới', icon: 'target',
    placeholders: ['cycleName'],
    title: '🎯 Bạn được giao KPI kỳ {{cycleName}}',
    message: 'Hãy vào tự nhận xét kết quả công việc theo các chỉ tiêu đã giao.',
    telegram: '🎯 *KPI kỳ {{cycleName}}*\n\nBạn vừa được giao chỉ tiêu KPI. Hãy tự nhận xét kết quả công việc.',
  },
  'kpi_manager_pending': {
    category: 'KPI & Đánh Giá', label: 'Nhân viên đã tự nhận xét — chờ chấm', icon: 'target',
    placeholders: ['employeeName', 'cycleName'],
    title: '🎯 {{employeeName}} đã tự nhận xét KPI kỳ {{cycleName}}',
    message: 'Đến lượt bạn chấm điểm KPI cho {{employeeName}}.',
    telegram: '🎯 *KPI chờ bạn chấm*\n\n👤 {{employeeName}}\n📅 Kỳ {{cycleName}}',
  },
  'kpi_senior_pending': {
    category: 'KPI & Đánh Giá', label: 'KPI đã qua quản lý — chờ cấp cao chốt', icon: 'target',
    placeholders: ['employeeName', 'cycleName'],
    title: '🎯 KPI của {{employeeName}} chờ bạn chốt điểm',
    message: 'Phiếu KPI kỳ {{cycleName}} đã qua quản lý đánh giá, đến lượt bạn chốt điểm cuối cùng.',
    telegram: '🎯 *KPI chờ bạn chốt điểm*\n\n👤 {{employeeName}}\n📅 Kỳ {{cycleName}}',
  },
  'kpi_concluded': {
    category: 'KPI & Đánh Giá', label: 'KPI cá nhân đã được chốt điểm', icon: 'target',
    placeholders: ['cycleName', 'finalScore'],
    title: '🎯 KPI kỳ {{cycleName}} của bạn đã được chốt: {{finalScore}} điểm',
    message: 'Xem chi tiết đánh giá và biểu đồ so sánh điểm theo từng chỉ tiêu.',
    telegram: '🎯 *KPI kỳ {{cycleName}} đã chốt*\n\n⭐ Điểm chính thức: *{{finalScore}}*',
  },

  // ── KPI & Đánh Giá — đơn vị (phòng ban/bộ phận) ──
  'kpi_unit_self_pending': {
    category: 'KPI & Đánh Giá', label: 'Đơn vị chờ tự nhận xét', icon: 'target',
    placeholders: ['unitName', 'cycleName'],
    title: '🎯 Đơn vị {{unitName}} chờ bạn tự nhận xét KPI',
    message: 'Kỳ {{cycleName}} — với vai trò trưởng đơn vị, hãy tự nhận xét kết quả của đơn vị.',
    telegram: '🎯 *KPI đơn vị {{unitName}}*\n\n📅 Kỳ {{cycleName}}\nHãy tự nhận xét kết quả đơn vị.',
  },
  'kpi_unit_approve_pending': {
    category: 'KPI & Đánh Giá', label: 'Phiếu đơn vị chờ bạn duyệt', icon: 'target',
    placeholders: ['unitName', 'cycleName', 'tier'],
    title: '🎯 Phiếu KPI đơn vị {{unitName}} chờ bạn duyệt (tầng {{tier}})',
    message: 'Kỳ {{cycleName}} — đến lượt bạn duyệt phiếu đánh giá của đơn vị này.',
    telegram: '🎯 *KPI đơn vị {{unitName}} chờ duyệt*\n\n📅 Kỳ {{cycleName}}\n🔢 Tầng {{tier}}',
  },
  'kpi_unit_concluded': {
    category: 'KPI & Đánh Giá', label: 'Phiếu đơn vị đã được chốt điểm', icon: 'target',
    placeholders: ['unitName', 'cycleName', 'finalScore'],
    title: '🎯 KPI đơn vị {{unitName}} đã được chốt: {{finalScore}} điểm',
    message: 'Kỳ {{cycleName}} — phiếu đánh giá đơn vị đã hoàn tất chuỗi duyệt.',
    telegram: '🎯 *KPI đơn vị {{unitName}} đã chốt*\n\n⭐ Điểm chính thức: *{{finalScore}}*',
  },
  'kpi_deadline_reminder': {
    category: 'KPI & Đánh Giá', label: 'Nhắc hạn KPI cá nhân sắp hết kỳ', icon: 'target',
    placeholders: ['cycleName', 'daysLeft', 'roleLabel'],
    title: '⏰ Còn {{daysLeft}} ngày hết kỳ {{cycleName}} — bạn chưa {{roleLabel}}',
    message: 'Hãy xử lý phiếu KPI sớm để kịp kết thúc kỳ đánh giá.',
    telegram: '⏰ *Sắp hết hạn KPI kỳ {{cycleName}}*\n\nCòn {{daysLeft}} ngày. Bạn chưa {{roleLabel}}.',
  },
  'kpi_unit_deadline_reminder': {
    category: 'KPI & Đánh Giá', label: 'Nhắc hạn KPI đơn vị sắp hết kỳ', icon: 'target',
    placeholders: ['unitName', 'cycleName', 'daysLeft', 'roleLabel'],
    title: '⏰ Còn {{daysLeft}} ngày hết kỳ {{cycleName}} — đơn vị {{unitName}} chưa {{roleLabel}}',
    message: 'Hãy xử lý phiếu KPI đơn vị sớm để kịp kết thúc kỳ đánh giá.',
    telegram: '⏰ *Sắp hết hạn KPI đơn vị {{unitName}}*\n\nKỳ {{cycleName}} — còn {{daysLeft}} ngày. Chưa {{roleLabel}}.',
  },

  // ── Yêu Cầu Thiết Kế ──
  'design_request_assigned': {
    category: 'Yêu Cầu Thiết Kế', label: 'Yêu cầu thiết kế mới được giao', icon: 'palette',
    placeholders: ['requesterName', 'title', 'dueDate'],
    title: '🎨 Yêu Cầu Thiết Kế mới: {{title}}',
    message: '{{requesterName}} vừa giao cho bạn yêu cầu "{{title}}"{{dueDate}} trong Yêu Cầu Thiết Kế. Vào để xem chi tiết.',
    telegram: '🎨 *Yêu Cầu Thiết Kế — Giao việc mới*\n\n👤 Từ: {{requesterName}}\n📋 {{title}}{{dueDate}}\n\n_Vào Yêu Cầu Thiết Kế để tiếp nhận._',
  },

  'design_request_version_uploaded': {
    category: 'Yêu Cầu Thiết Kế', label: 'Có phiên bản thiết kế mới', icon: 'image',
    placeholders: ['uploaderName', 'title', 'versionNo'],
    title: '🖼️ Yêu Cầu Thiết Kế — Phiên bản {{versionNo}}: {{title}}',
    message: '{{uploaderName}} vừa tải lên phiên bản {{versionNo}} cho "{{title}}" trong Yêu Cầu Thiết Kế. Vào để xem và duyệt.',
    telegram: '🖼️ *Yêu Cầu Thiết Kế — Phiên bản mới*\n\n👤 {{uploaderName}}\n📋 {{title}} — phiên bản {{versionNo}}\n\n_Vào Yêu Cầu Thiết Kế để duyệt._',
  },
  'design_request_feedback_new': {
    category: 'Yêu Cầu Thiết Kế', label: 'Có feedback mới trên yêu cầu', icon: 'message-circle',
    placeholders: ['authorName', 'title', 'message'],
    title: '💬 Yêu Cầu Thiết Kế — Feedback mới: {{title}}',
    message: 'Bạn nhận được feedback mới trong Yêu Cầu Thiết Kế "{{title}}". {{authorName}}: "{{message}}"',
    telegram: '💬 *Yêu Cầu Thiết Kế — Feedback mới*\n\n📋 {{title}}\n👤 {{authorName}}\n📝 {{message}}',
  },
  'design_request_revision_requested': {
    category: 'Yêu Cầu Thiết Kế', label: 'Yêu cầu chỉnh sửa thiết kế', icon: 'rotate-ccw',
    placeholders: ['requesterName', 'title'],
    title: '✏️ Yêu Cầu Thiết Kế — Cần chỉnh sửa: {{title}}',
    message: '{{requesterName}} yêu cầu chỉnh sửa lại "{{title}}" trong Yêu Cầu Thiết Kế. Xem feedback để biết chi tiết.',
    telegram: '✏️ *Yêu Cầu Thiết Kế — Cần chỉnh sửa*\n\n📋 {{title}}\n👤 {{requesterName}} yêu cầu sửa lại thiết kế.',
  },
  'design_request_approved': {
    category: 'Yêu Cầu Thiết Kế', label: 'Thiết kế đã được duyệt', icon: 'check-circle',
    placeholders: ['requesterName', 'title'],
    title: '✅ Yêu Cầu Thiết Kế — Đã duyệt: {{title}}',
    message: '{{requesterName}} đã duyệt thiết kế "{{title}}" trong Yêu Cầu Thiết Kế.',
    telegram: '✅ *Yêu Cầu Thiết Kế — Đã duyệt*\n\n📋 {{title}}\n👤 {{requesterName}} đã duyệt thiết kế của bạn.',
  },
  'design_request_blocked': {
    category: 'Yêu Cầu Thiết Kế', label: 'Yêu cầu thiết kế đang bị chặn', icon: 'alert-triangle',
    placeholders: ['assigneeName', 'title', 'reason'],
    title: '🚧 Yêu Cầu Thiết Kế — Đang bị chặn: {{title}}',
    message: '{{assigneeName}} báo "{{title}}" đang bị chặn trong Yêu Cầu Thiết Kế: {{reason}}.',
    telegram: '🚧 *Yêu Cầu Thiết Kế — Task bị chặn*\n\n📋 {{title}}\n👤 {{assigneeName}}\n⚠️ Lý do: {{reason}}',
  },

  // ── SSO ──
  'sso_sync_failed': {
    category: 'Hệ thống — SSO', label: 'Đồng bộ SSO thất bại', icon: 'alert-triangle',
    placeholders: ['userName', 'userEmail', 'errorMessage'],
    title: '⚠️ Đồng bộ SSO thất bại — {{userName}}',
    message: 'Không đồng bộ được tài khoản {{userEmail}} sang SSO: {{errorMessage}}. Vào Người Dùng → nút Đồng bộ SSO để thử lại.',
    telegram: '⚠️ *Đồng bộ SSO thất bại*\n\n👤 {{userName}} ({{userEmail}})\n❌ {{errorMessage}}\n\n_Vào Người Dùng → nút Đồng bộ SSO để thử lại._',
  },
};

/**
 * Gom `category` (nhóm nhỏ) → module theo sidebar, để UI hiển thị gọn theo module.
 * Mỗi key là chuỗi category dùng trong DEFAULT_NOTIFICATION_TEMPLATES ở trên.
 */
export const TEMPLATE_CATEGORY_TO_MODULE: Record<string, string> = {
  'Yêu Cầu Thiết Kế': 'design-requests',
  'Chấm công': 'cham-cong',
  'Hồ sơ — Hợp đồng': 'hr',
  'Hợp đồng — Theo dõi': 'hr',
  'Hồ sơ HR': 'hr',
  'Hồ sơ — Phép năm': 'hr',
  'Đánh giá — Theo dõi': 'hr',
  'Đánh giá — Kết luận': 'hr',
  'Hồ sơ — Đánh giá': 'hr',
  'Onboarding': 'hr-resources',
  'Offboarding': 'hr-resources',
  'Tuyển dụng': 'hr-resources',
  'Hồ sơ — Tuyển dụng': 'hr-resources',
  'Công việc': 'tasks',
  'Ticket': 'tickets',
  'Tên miền': 'asset-management',
  'Hồ sơ — Tài sản': 'asset-management',
  'Yêu cầu xoá tài sản': 'delete-requests',
  'Thông báo chung': 'announcements',
  'Đặt phòng họp': 'room-bookings',
  'Chi Phí': 'expense',
  'KPI & Đánh Giá': 'kpi',
  'Tùy chỉnh': 'custom',
};

/** Thứ tự + nhãn module hiển thị (theo sidebar). UI tự gắn icon/màu theo `key`. */
export const TEMPLATE_MODULES: { key: string; label: string }[] = [
  { key: 'cham-cong',        label: 'Dữ Liệu Chấm Công' },
  { key: 'hr',               label: 'Quản Lý Hồ Sơ' },
  { key: 'hr-resources',     label: 'Nguồn Nhân Lực' },
  { key: 'tasks',            label: 'Nhiệm Vụ' },
  { key: 'tickets',          label: 'Ticket Hỗ Trợ' },
  { key: 'asset-management', label: 'Quản Lý Tài Sản' },
  { key: 'delete-requests',  label: 'Duyệt Xóa Tài Sản' },
  { key: 'announcements',    label: 'Thông Báo – Truyền Thông' },
  { key: 'room-bookings',    label: 'Đặt Phòng' },
  { key: 'expense',          label: 'Chi Phí' },
  { key: 'kpi',              label: 'KPI & Đánh Giá' },
  { key: 'custom',           label: 'Tùy Chỉnh (Gửi Thủ Công)' },
];

/** Module key cho 1 category (fallback 'khac' nếu chưa map). */
export function moduleForCategory(category: string): string {
  return TEMPLATE_CATEGORY_TO_MODULE[category] ?? 'khac';
}
