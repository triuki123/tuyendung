'use client';

import React from 'react';
import Link from 'next/link';
import {
  Building2,
  Users,
  UserSquare,
  CheckCircle2,
  UserPlus,
  Crown,
  ArrowUpRight,
  Trash2,
  Loader2,
} from 'lucide-react';

// ==== Kiểu dữ liệu trả về từ GET /api/organizations/health ====
export interface HealthUser {
  id: string;
  name: string;
  email: string;
  company_name: string | null;
}

export interface HealthUnit {
  unit_type: 'company' | 'department' | 'sub_department';
  id: string;
  name: string;
  company_name: string | null;
}

export interface HealthJobTitle {
  id: string;
  title: string;
  company_name: string | null;
  rank: number;
}

// ==== Kiểu dữ liệu trả về từ GET /api/organizations/hidden-units ====
export interface HiddenUnit {
  unit_type: 'company' | 'department' | 'sub_department';
  id: string;
  name: string;
  company_id: string | null;
  company_name: string | null;
  parent_name: string | null;
  active_assignments: number;
  users_referencing: number;
  /** Số đơn vị con còn trong DB (company = số phòng ban/bộ phận bên trong). */
  child_units: number;
}

const UNIT_META: Record<HealthUnit['unit_type'], { label: string; icon: React.ReactNode; badge: string }> = {
  company: {
    label: 'Công ty',
    icon: <Building2 className="h-4 w-4 text-indigo-400" />,
    badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  },
  department: {
    label: 'Phòng ban',
    icon: <Users className="h-4 w-4 text-purple-400" />,
    badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  },
  sub_department: {
    label: 'Bộ phận',
    icon: <UserSquare className="h-4 w-4 text-cyan-400" />,
    badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  },
};

/** Khung section card chung: tiêu đề + đếm + nội dung. */
function SectionCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between border-b border-white/5 px-4 sm:px-5 py-3.5">
        <h2 className="text-base font-600 text-foreground">{title}</h2>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-600 ${
            count > 0
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          }`}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Empty state tích cực khi section không còn mục nào cần xử lý. */
function EmptyOk({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center py-10 text-muted-foreground">
      <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-400" />
      <p className="text-sm text-emerald-400">✓ {message}</p>
    </div>
  );
}

/** Section 1: Nhân sự chưa có phân công chính. */
export function UsersWithoutPrimarySection({ items }: { items: HealthUser[] }) {
  return (
    <SectionCard title="Nhân sự chưa có phân công chính" count={items.length}>
      {items.length === 0 ? (
        <EmptyOk message="Tất cả nhân sự đã có phân công chính" />
      ) : (
        <ul className="divide-y divide-white/5">
          {items.map((u) => (
            <li key={u.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 sm:px-5 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{u.name}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              <span className="text-xs text-muted-foreground sm:text-right sm:w-44 truncate">
                {u.company_name || '—'}
              </span>
              <Link
                href={`/users?openUser=${u.id}`}
                className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-600 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5" /> Phân công
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Section 2: Đơn vị chưa có trưởng khai báo. */
export function UnitsWithoutHeadSection({ items }: { items: HealthUnit[] }) {
  return (
    <SectionCard title="Đơn vị chưa có trưởng" count={items.length}>
      {items.length === 0 ? (
        <EmptyOk message="Tất cả đơn vị đã có trưởng" />
      ) : (
        <ul className="divide-y divide-white/5">
          {items.map((unit) => {
            const meta = UNIT_META[unit.unit_type];
            return (
              <li
                key={`${unit.unit_type}-${unit.id}`}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 sm:px-5 py-3"
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span className="flex-shrink-0">{meta.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{unit.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{unit.company_name || '—'}</p>
                  </div>
                </div>
                <span className={`inline-flex self-start sm:self-auto items-center rounded-full border px-2.5 py-0.5 text-2xs sm:text-xs ${meta.badge}`}>
                  {meta.label}
                </span>
                <Link
                  href="/organization/companies-organization"
                  className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-600 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                >
                  <Crown className="h-3.5 w-3.5" /> Gán trưởng
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/** Section 3: Chức danh còn cấp bậc mặc định (chưa xếp tường minh). */
export function JobTitlesDefaultRankSection({ items }: { items: HealthJobTitle[] }) {
  return (
    <SectionCard title="Chức danh chưa xếp cấp bậc" count={items.length}>
      {items.length === 0 ? (
        <EmptyOk message="Tất cả chức danh đã được xếp cấp bậc" />
      ) : (
        <ul className="divide-y divide-white/5">
          {items.map((jt) => (
            <li key={jt.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 sm:px-5 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{jt.title}</p>
                <p className="text-xs text-muted-foreground truncate">{jt.company_name || '—'}</p>
              </div>
              <span className="inline-flex self-start sm:self-auto items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-2xs sm:text-xs text-amber-400">
                Mặc định ({jt.rank})
              </span>
              <Link
                href="/organization/positions"
                className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-600 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
              >
                <ArrowUpRight className="h-3.5 w-3.5" /> Xếp cấp bậc
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Thứ tự hiển thị: Công ty → Phòng ban → Bộ phận. */
const HIDDEN_UNIT_ORDER: Record<HiddenUnit['unit_type'], number> = {
  company: 0,
  department: 1,
  sub_department: 2,
};

/** Ghép dòng cảnh báo đỏ — chỉ liệt kê phần > 0. */
function hiddenUnitWarning(unit: HiddenUnit): string | null {
  const parts: string[] = [];
  if (unit.active_assignments > 0) parts.push(`${unit.active_assignments} phân công`);
  if (unit.users_referencing > 0) parts.push(`${unit.users_referencing} người`);
  if (unit.child_units > 0) parts.push(`${unit.child_units} đơn vị con`);
  return parts.length ? `⚠ còn ${parts.join(' · ')}` : null;
}

/** Section 4: Đơn vị đã xoá mềm (is_active=false) còn nằm trong DB. */
export function HiddenUnitsSection({
  items,
  isSuperAdmin,
  busyKey,
  onDelete,
}: {
  items: HiddenUnit[];
  isSuperAdmin: boolean;
  busyKey: string | null;
  onDelete: (unit: HiddenUnit) => void;
}) {
  const sorted = [...items].sort(
    (a, b) =>
      HIDDEN_UNIT_ORDER[a.unit_type] - HIDDEN_UNIT_ORDER[b.unit_type] ||
      a.name.localeCompare(b.name, 'vi')
  );
  return (
    <SectionCard title="Đơn vị ẩn trong hệ thống" count={items.length}>
      {items.length === 0 ? (
        <EmptyOk message="Không còn đơn vị ẩn nào trong DB" />
      ) : (
        <ul className="divide-y divide-white/5">
          {sorted.map((unit) => {
            const meta = UNIT_META[unit.unit_type];
            const key = `${unit.unit_type}-${unit.id}`;
            const busy = busyKey === key;
            const warning = hiddenUnitWarning(unit);
            return (
              <li key={key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 sm:px-5 py-3">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span className="flex-shrink-0">{meta.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{unit.name}</p>
                    {unit.unit_type !== 'company' && (
                      <p className="text-xs text-muted-foreground truncate">
                        {unit.company_name || '—'}
                        {unit.unit_type === 'sub_department' && unit.parent_name ? ` · thuộc: ${unit.parent_name}` : ''}
                      </p>
                    )}
                    {warning && <p className="text-2xs text-red-400 mt-0.5">{warning}</p>}
                  </div>
                </div>
                <span className={`inline-flex self-start sm:self-auto items-center rounded-full border px-2.5 py-0.5 text-2xs sm:text-xs ${meta.badge}`}>
                  {meta.label}
                </span>
                {isSuperAdmin && (
                  <button
                    onClick={() => onDelete(unit)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg bg-red-600 hover:bg-red-500 px-3 py-1.5 text-xs font-600 text-white disabled:opacity-50 transition-colors"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Xoá cứng
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
