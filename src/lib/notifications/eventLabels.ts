/**
 * eventLabels.ts — danh mục SỰ KIỆN cho UI "Tùy chọn thông báo".
 * Gom các event trong NOTIFICATION_EVENTS thành nhóm (CATEGORY_META) + nhãn tiếng Việt,
 * và cờ kênh có thể TẮT: telegram (nếu event dùng kênh telegram) / webpush (mirror in-app).
 */
import { NOTIFICATION_EVENTS } from './eventCatalog';
import { DEFAULT_NOTIFICATION_TEMPLATES } from './templates';
import { CATEGORY_META, type CategoryKey } from './categories';

const PREFIX_TO_CATEGORY: Record<string, CategoryKey> = {
  task: 'tasks',
  ticket: 'tickets',
  solace: 'solace',
  contract: 'hr',
  evaluation: 'hr',
  offboarding: 'hr',
  onboarding: 'hr',
  hrDoc: 'hr',
  attendance: 'attendance',
  leave: 'attendance',
  overtime: 'attendance',
  adjustment: 'attendance',
  asset: 'assets',
  domain: 'assets',
  deleteRequest: 'assets',
  roomBooking: 'rooms',
  requisition: 'recruitment',
  interview: 'recruitment',
  application: 'recruitment',
  recruitment: 'recruitment',
  announcement: 'announcements',
  document: 'announcements',
  birthday: 'announcements',
  manual: 'announcements',
};

/** Nhãn thủ công cho các event có templateKey động (không tra được label tĩnh). */
const LABEL_OVERRIDE: Record<string, string> = {
  'contract.expiring': 'Hợp đồng sắp hết hạn',
  'evaluation.due': 'Đánh giá thử việc tới hạn',
  'requisition.deadline': 'Yêu cầu tuyển dụng sắp hết hạn',
  'overtime.reviewed': 'Kết quả duyệt tăng ca',
  'adjustment.reviewed': 'Kết quả duyệt bù công',
  'leave.reviewed': 'Kết quả duyệt nghỉ phép',
  'task.overdue': 'Công việc đến/quá hạn',
  'ticket.overdue': 'Ticket đến/quá hạn',
  'domain.alert': 'Cảnh báo tên miền',
  'requisition.generic': 'Cập nhật yêu cầu tuyển dụng',
  'manual.send': 'Thông báo gửi thủ công',
};

function prettify(key: string): string {
  const last = key.split('.').slice(1).join(' ') || key;
  const spaced = last.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface PrefEvent {
  eventKey: string;
  label: string;
  telegram: boolean;
  webpush: boolean;
}

export interface PrefGroup {
  key: CategoryKey;
  label: string;
  icon: string;
  items: PrefEvent[];
}

/** Danh mục sự kiện đã gom nhóm + sắp xếp, chỉ gồm event có ít nhất 1 kênh tắt được. */
export function getPreferenceCatalog(): PrefGroup[] {
  const groups = new Map<CategoryKey, PrefEvent[]>();

  for (const ev of Object.values(NOTIFICATION_EVENTS)) {
    const telegram = ev.channels.includes('telegram');
    const webpush = ev.channels.includes('inapp'); // Web Push mirror in-app
    if (!telegram && !webpush) continue;

    const prefix = ev.key.split('.')[0];
    const cat = PREFIX_TO_CATEGORY[prefix] || 'other';

    let label = LABEL_OVERRIDE[ev.key];
    if (!label && typeof ev.templateKey === 'string') {
      label = DEFAULT_NOTIFICATION_TEMPLATES[ev.templateKey]?.label;
    }
    if (!label) label = prettify(ev.key);

    const arr = groups.get(cat) || [];
    arr.push({ eventKey: ev.key, label, telegram, webpush });
    groups.set(cat, arr);
  }

  return CATEGORY_META.filter((m) => groups.has(m.key)).map((m) => ({
    key: m.key,
    label: m.label,
    icon: m.icon,
    items: (groups.get(m.key) || []).sort((a, b) => a.label.localeCompare(b.label, 'vi')),
  }));
}
