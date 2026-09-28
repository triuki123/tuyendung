'use client';

import React, { useMemo, useState } from 'react';
import { Search, X, ChevronDown, Crown } from 'lucide-react';
import { normalizeVN } from '@/lib/utils/searchVN';

/**
 * Ô chọn Quản Lý Trực Tiếp — gợi ý theo CÔNG TY → PHÒNG BAN → BỘ PHẬN.
 *
 * Nguyên tắc (user chốt): KHÔNG giấu ai. Vẫn chọn được người ngoài phòng ban
 * (báo cáo chéo là có thật), nhưng người thuộc đúng đơn vị được đẩy lên đầu,
 * còn phần còn lại gom vào nhóm "Khác trong công ty" phải bấm mới mở.
 *
 * Thứ tự trong mỗi nhóm: trưởng/phó đơn vị (org_assignments.org_role) trước,
 * rồi tới các thành viên khác, mỗi phần xếp theo tên.
 */

export interface ManagerOption {
  id: string;
  name: string;
  job_title?: string;
  department_id?: string | null;
  sub_department_id?: string | null;
  /** Phòng ban mà người này giữ chức trưởng/phó */
  head_departments?: string[];
  /** Bộ phận mà người này giữ chức trưởng/phó */
  head_sub_departments?: string[];
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  managers: ManagerOption[];
  /** Phòng ban đang chọn trên form — dùng để gom nhóm gợi ý */
  departmentId?: string;
  /** Bộ phận đang chọn trên form — ưu tiên cao hơn phòng ban */
  subDepartmentId?: string;
  disabled?: boolean;
  placeholder?: string;
}

type Bucket = 'sub' | 'dept' | 'other';

interface Group {
  key: Bucket;
  label: string;
  items: ManagerOption[];
  /** Nhóm mặc định đóng (chỉ nhóm "khác") */
  collapsible: boolean;
}

function isHeadOf(m: ManagerOption, deptId?: string, subId?: string): boolean {
  if (subId && m.head_sub_departments?.includes(subId)) return true;
  if (deptId && m.head_departments?.includes(deptId)) return true;
  return false;
}

/** Xếp: trưởng/phó đơn vị lên trước, sau đó theo tên (có dấu tiếng Việt). */
function sortBucket(items: ManagerOption[], deptId?: string, subId?: string): ManagerOption[] {
  return [...items].sort((a, b) => {
    const ha = isHeadOf(a, deptId, subId) ? 0 : 1;
    const hb = isHeadOf(b, deptId, subId) ? 0 : 1;
    if (ha !== hb) return ha - hb;
    return a.name.localeCompare(b.name, 'vi');
  });
}

export default function ManagerPicker({
  value, onChange, managers,
  departmentId, subDepartmentId,
  disabled = false,
  placeholder = '-- Chọn quản lý --',
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [showOther, setShowOther] = useState(false);

  const tokens = useMemo(() => normalizeVN(q).split(/\s+/).filter(Boolean), [q]);

  // Lọc theo từ khoá trước, rồi mới chia nhóm — để khi đang tìm thì kết quả
  // vẫn giữ ngữ cảnh đơn vị thay vì trộn thành một danh sách phẳng.
  const groups = useMemo<Group[]>(() => {
    const matched = managers.filter(m => {
      if (tokens.length === 0) return true;
      const hay = normalizeVN(`${m.name} ${m.job_title || ''}`);
      return tokens.every(t => hay.includes(t));
    });

    const sub: ManagerOption[] = [];
    const dept: ManagerOption[] = [];
    const other: ManagerOption[] = [];
    for (const m of matched) {
      if (subDepartmentId && m.sub_department_id === subDepartmentId) sub.push(m);
      else if (departmentId && m.department_id === departmentId) dept.push(m);
      else other.push(m);
    }

    const out: Group[] = [];
    if (sub.length) out.push({ key: 'sub', label: 'Cùng bộ phận', items: sortBucket(sub, departmentId, subDepartmentId), collapsible: false });
    if (dept.length) out.push({ key: 'dept', label: 'Cùng phòng ban', items: sortBucket(dept, departmentId, subDepartmentId), collapsible: false });
    if (other.length) {
      // Chưa chọn đơn vị nào → không có gì để "ưu tiên", đừng bắt bấm mở vô nghĩa.
      const hasContext = !!(departmentId || subDepartmentId);
      out.push({
        key: 'other',
        label: hasContext ? 'Khác trong công ty' : 'Toàn công ty',
        items: sortBucket(other, departmentId, subDepartmentId),
        collapsible: hasContext,
      });
    }
    return out;
  }, [managers, tokens, departmentId, subDepartmentId]);

  const selected = managers.find(m => m.id === value);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  // Đang gõ tìm thì mở luôn nhóm "khác" — người dùng đang chủ động tìm, đừng giấu.
  const otherOpen = showOther || tokens.length > 0;

  const pick = (id: string) => { onChange(id); setOpen(false); setQ(''); };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(v => !v); setQ(''); setShowOther(false); }}
        className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 flex items-center justify-between gap-2 text-left disabled:opacity-50"
      >
        {selected ? (
          <span className="truncate">
            {selected.name}
            {selected.job_title && selected.job_title !== 'No Title' && (
              <span className="text-muted-foreground ml-1.5">· {selected.job_title}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground/60">{placeholder}</span>
        )}
        {value ? (
          <X
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); onChange(''); }}
          />
        ) : (
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-line shadow-xl overflow-hidden"
          style={{ background: 'var(--card)' }}
        >
          <div className="p-2 border-b border-line-subtle">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Tìm theo tên, chức danh..."
                className="w-full h-8 pl-8 pr-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60"
              />
            </div>
          </div>

          <ul className="max-h-64 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => pick('')}
                className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-hover"
              >
                -- Chưa có quản lý --
              </button>
            </li>

            {total === 0 ? (
              <li className="py-3 text-center text-xs text-muted-foreground">Không tìm thấy</li>
            ) : (
              groups.map(g => {
                const collapsed = g.collapsible && !otherOpen;
                return (
                  <li key={g.key}>
                    {g.collapsible ? (
                      <button
                        type="button"
                        onClick={() => setShowOther(v => !v)}
                        className="w-full flex items-center justify-between px-3 py-1.5 bg-white/[0.03] hover:bg-hover transition-colors"
                      >
                        <span className="text-2xs font-600 uppercase tracking-wider text-muted-foreground">
                          {g.label} ({g.items.length})
                        </span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-180'}`}
                        />
                      </button>
                    ) : (
                      <div className="px-3 py-1.5 bg-white/[0.03]">
                        <span className="text-2xs font-600 uppercase tracking-wider text-indigo-400">
                          {g.label}
                        </span>
                      </div>
                    )}

                    {!collapsed && (
                      <ul>
                        {g.items.map(m => {
                          const head = isHeadOf(m, departmentId, subDepartmentId);
                          return (
                            <li key={m.id}>
                              <button
                                type="button"
                                onClick={() => pick(m.id)}
                                className={`w-full text-left px-3 py-2.5 hover:bg-hover transition-colors ${m.id === value ? 'text-indigo-300' : 'text-foreground'}`}
                              >
                                <p className="text-sm font-500 flex items-center gap-1.5">
                                  {m.name}
                                  {head && (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-600 text-amber-400"
                                      title="Giữ chức trưởng/phó của đơn vị này"
                                    >
                                      <Crown className="h-2.5 w-2.5" /> Phụ trách
                                    </span>
                                  )}
                                </p>
                                {m.job_title && m.job_title !== 'No Title' && (
                                  <p className="text-2xs text-muted-foreground">{m.job_title}</p>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
