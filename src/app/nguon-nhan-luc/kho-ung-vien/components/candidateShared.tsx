'use client';

import React from 'react';
import { Star } from 'lucide-react';

export const DEFAULT_INDUSTRIES = [
  'Kế toán - Kiểm toán',
  'Công nghệ thông tin',
  'Kinh doanh - Bán hàng',
  'Marketing - Truyền thông',
  'Nhân sự - Hành chính',
  'Tài chính - Ngân hàng',
  'Vận hành - Kho vận',
  'Kỹ thuật - Sản xuất',
  'Chăm sóc khách hàng',
];

/** Nguồn CV chuẩn hoá để lọc và báo cáo tuyển dụng nhất quán. */
export const CV_SOURCES = ['Giới thiệu', 'TopCV', 'Việc Làm 24h', 'Jobgo', 'Indeed', 'Jobkobo', 'LinkedIn', 'Khác'] as const;
export const normalizeCvSource = (value?: string | null): string => CV_SOURCES.includes(value as typeof CV_SOURCES[number]) ? value! : 'Khác';

/** Các giai đoạn pipeline tuyển dụng (khớp CHECK constraint hr_cv_pool.status). */
export const STAGES: { key: string; label: string; color: string; dot: string; ring: string }[] = [
  { key: 'new',         label: 'Mới',        color: 'text-sky-300 bg-sky-500/15 border-sky-500/30',         dot: 'bg-sky-400',     ring: 'ring-sky-500/40' },
  { key: 'screening',   label: 'Sàng lọc',   color: 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30', dot: 'bg-indigo-400',  ring: 'ring-indigo-500/40' },
  { key: 'interviewed', label: 'Phỏng vấn',  color: 'text-purple-300 bg-purple-500/15 border-purple-500/30', dot: 'bg-purple-400',  ring: 'ring-purple-500/40' },
  { key: 'offered',     label: 'Đã offer',   color: 'text-amber-300 bg-amber-500/15 border-amber-500/30',    dot: 'bg-amber-400',   ring: 'ring-amber-500/40' },
  { key: 'hired',       label: 'Đã Onboard', color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400', ring: 'ring-emerald-500/40' },
  { key: 'rejected',    label: 'Loại',       color: 'text-red-300 bg-red-500/15 border-red-500/30',          dot: 'bg-red-400',     ring: 'ring-red-500/40' },
  { key: 'pool',        label: 'Lưu kho',    color: 'text-ink-bright bg-slate-500/15 border-slate-500/30',    dot: 'bg-slate-400',   ring: 'ring-slate-500/40' },
];
export const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.key, s]));

/** Lý do loại ứng viên chuẩn hóa (theo vị trí) — để nhóm thống kê & tái sử dụng CV. */
export const REJECT_REASONS: { code: string; label: string }[] = [
  { code: 'underqualified',    label: 'Thiếu kỹ năng / kinh nghiệm' },
  { code: 'failed_interview',  label: 'Không đạt phỏng vấn' },
  { code: 'salary_mismatch',   label: 'Lệch kỳ vọng lương' },
  { code: 'culture_fit',       label: 'Không phù hợp văn hóa' },
  { code: 'location',          label: 'Vị trí địa lý không phù hợp' },
  { code: 'candidate_withdrew', label: 'Ứng viên rút hồ sơ' },
  { code: 'position_closed',   label: 'Vị trí đã đủ / đóng' },
  { code: 'other',             label: 'Lý do khác' },
];
export const REJECT_REASON_MAP = Object.fromEntries(REJECT_REASONS.map((r) => [r.code, r.label]));

/** Khuyến nghị tuyển sau phỏng vấn (scorecard). */
export const RECOMMENDATIONS: { code: string; label: string; color: string }[] = [
  { code: 'strong_yes', label: 'Rất nên tuyển', color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
  { code: 'yes',        label: 'Nên tuyển',     color: 'text-green-300 bg-green-500/15 border-green-500/30' },
  { code: 'neutral',    label: 'Cân nhắc',      color: 'text-amber-300 bg-amber-500/15 border-amber-500/30' },
  { code: 'no',         label: 'Không nên',     color: 'text-orange-300 bg-orange-500/15 border-orange-500/30' },
  { code: 'strong_no',  label: 'Rất không nên', color: 'text-red-300 bg-red-500/15 border-red-500/30' },
];
export const RECOMMENDATION_MAP = Object.fromEntries(RECOMMENDATIONS.map((r) => [r.code, r]));

/** Tiêu chí chấm điểm mặc định trong scorecard phỏng vấn. */
export const SCORECARD_CRITERIA: string[] = [
  'Chuyên môn', 'Kinh nghiệm', 'Kỹ năng giao tiếp', 'Thái độ / động lực', 'Phù hợp văn hóa',
];

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#a855f7)', 'linear-gradient(135deg,#0ea5e9,#6366f1)',
  'linear-gradient(135deg,#10b981,#0ea5e9)', 'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#a855f7,#ec4899)',
];
export const avatarFor = (name: string) => AVATAR_GRADIENTS[(name.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length];

/** Hiển thị/chọn sao đánh giá 1..5. Chỉ đọc nếu không truyền onChange. */
export function StarRating({ value, onChange, size = 14 }: { value: number | null; onChange?: (v: number | null) => void; size?: number }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = (value || 0) >= n;
        return (
          <button
            key={n}
            type="button"
            disabled={!onChange}
            onClick={() => onChange?.(value === n ? null : n)}
            className={onChange ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}
            title={`${n} sao`}
          >
            <Star size={size} className={active ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'} />
          </button>
        );
      })}
    </div>
  );
}

/** Chip kỹ năng (nhãn nhỏ). */
export function SkillChip({ label, onRemove, highlight }: { label: string; onRemove?: () => void; highlight?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-600 border ${
      highlight ? 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40' : 'bg-hover text-muted-foreground border-line'
    }`}>
      {label}
      {onRemove && (
        <button type="button" onClick={onRemove} className="hover:text-red-300 -mr-0.5">×</button>
      )}
    </span>
  );
}

export const fmtExp = (y: number | null): string => (y == null ? '' : `${y} năm KN`);
export const fmtSalary = (n: number | null): string => {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)} triệu`;
  return n.toLocaleString('vi-VN');
};
