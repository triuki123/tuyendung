'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown, Check, Loader2 } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { getActiveCompanyId, setActiveCompanyId } from '@/lib/activeCompany';

interface CompanyItem {
  company_id: string;
  company_name: string | null;
  role: string;
  is_primary: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Quản Lý',
  user: 'Người Dùng',
};

/**
 * Bộ chuyển Công Ty (Đa Công Ty) trên Topbar.
 * Chỉ hiển thị khi user thuộc >= 2 công ty. Đổi công ty → cập nhật role/quyền
 * hiệu lực vào localStorage rồi reload để sidebar + dữ liệu chạy đúng công ty.
 */
export default function CompanySwitcher({ userId }: { userId: string }) {
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, () => setOpen(false), open);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${userId}/companies`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const list: CompanyItem[] = json.data || [];
        setCompanies(list);
        const active = getActiveCompanyId();
        // Nếu active không còn hợp lệ (vd membership bị gỡ) → về công ty chính.
        const valid = list.find((c) => c.company_id === active);
        const primary = list.find((c) => c.is_primary);
        const resolved = valid ? active : primary?.company_id ?? null;
        if (!valid && resolved) setActiveCompanyId(resolved);
        setActiveId(resolved);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const current = companies.find((c) => c.company_id === activeId);

  const handleSwitch = async (companyId: string) => {
    if (companyId === activeId || switching) { setOpen(false); return; }
    setSwitching(true);
    try {
      const res = await fetch(`/api/users/${userId}/effective-context?company_id=${companyId}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Không đổi được công ty');
      const ctx = json.data;

      // Cập nhật phiên client: role + quyền + công ty đang làm việc.
      setActiveCompanyId(companyId);
      const raw = localStorage.getItem('assetflow_auth') || localStorage.getItem('currentUser');
      if (raw) {
        const u = JSON.parse(raw);
        u.role = ctx.role;
        u.roleLabel = ROLE_LABEL[ctx.role] || ctx.role;
        u.module_permissions = ctx.module_permissions;
        u.company_id = companyId;
        u.department_id = ctx.department_id ?? null;
        u.sub_department_id = ctx.sub_department_id ?? null;
        u.position_id = ctx.position_id ?? null;
        u.job_title_id = ctx.job_title_id ?? null;
        u.manager_id = ctx.manager_id ?? null;
        localStorage.setItem('assetflow_auth', JSON.stringify(u));
        localStorage.setItem('currentUser', JSON.stringify(u));
      }
      // Reload để sidebar/quyền/dữ liệu áp công ty mới.
      window.location.reload();
    } catch (e) {
      console.error('[CompanySwitcher] switch error:', e);
      setSwitching(false);
      setOpen(false);
    }
  };

  // Chỉ hiện khi đa công ty
  if (companies.length < 2) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl btn-ghost text-sm max-w-[180px]"
        title="Chuyển công ty"
      >
        {switching ? (
          <Loader2 size={15} className="animate-spin text-indigo-400 shrink-0" />
        ) : (
          <Building2 size={15} className="text-indigo-400 shrink-0" />
        )}
        <span className="hidden md:block truncate text-foreground font-500">
          {current?.company_name || 'Công ty'}
        </span>
        <ChevronDown size={13} className="text-muted-foreground shrink-0" />
      </button>

      {open && (
          <div
            className="absolute right-0 top-12 w-64 rounded-2xl border border-white/08 z-50 overflow-hidden modal-entrance"
            style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)' }}
          >
            <div className="px-4 py-2.5 border-b border-white/05">
              <p className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">
                Công ty đang làm việc
              </p>
            </div>
            <div className="py-1 max-h-72 overflow-y-auto">
              {companies.map((c) => (
                <button
                  key={c.company_id}
                  onClick={() => handleSwitch(c.company_id)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-white/05 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate flex items-center gap-1.5">
                      {c.company_name || c.company_id}
                      {c.is_primary && (
                        <span className="text-2xs text-indigo-400 border border-indigo-500/30 rounded px-1">
                          Chính
                        </span>
                      )}
                    </p>
                    <p className="text-2xs text-muted-foreground">{ROLE_LABEL[c.role] || c.role}</p>
                  </div>
                  {c.company_id === activeId && (
                    <Check size={15} className="text-indigo-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
      )}
    </div>
  );
}
