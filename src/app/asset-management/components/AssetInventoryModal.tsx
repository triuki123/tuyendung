'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, ArchiveX, Building2, Loader2, Wrench, ShieldCheck, X } from 'lucide-react';
import { Asset } from '@/lib/mockData';
import { fetchCompanies, fetchDepartmentsByCompany, fetchSubDepartmentsByDepartment, fetchUsers, inventoryHardware } from '@/lib/api-client';
import SearchableSelect, { SearchableOption } from '@/components/ui/SearchableSelect';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useToast } from '@/context/ToastContext';

type ActionType = 'recover' | 'maintenance' | 'assign' | 'retire';

interface Props {
  asset: Asset;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}

function todayVn(): string {
  return new Intl.DateTimeFormat('vi-VN').format(new Date());
}

function makeUserOptions(users: any[], companyId: string, departmentId: string, subDepartmentId: string): SearchableOption[] {
  return users
    .filter((u: any) => !companyId || u.company_id === companyId)
    .filter((u: any) => !departmentId || u.department_id === departmentId)
    .filter((u: any) => !subDepartmentId || u.sub_department_id === subDepartmentId)
    .map((u: any) => ({ value: u.id, label: u.name || u.email || u.id, sublabel: u.position || u.department || undefined }));
}

export default function AssetInventoryModal({ asset, onClose, onSaved }: Props) {
  const toast = useToast();
  const [action, setAction] = useState<ActionType>('recover');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(`Đã kiểm kê ngày ${todayVn()}`);
  const [setMaintenanceStatus, setSetMaintenanceStatus] = useState(false);

  const [companies, setCompanies] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState(asset.company || '');
  const [departments, setDepartments] = useState<any[]>([]);
  const [subDepartments, setSubDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [departmentId, setDepartmentId] = useState(asset.division || '');
  const [subDepartmentId, setSubDepartmentId] = useState(asset.department || '');
  const [assignedTo, setAssignedTo] = useState(asset.assignedTo || '');

  useEscapeKey(onClose);

  useEffect(() => {
    (async () => {
      try {
        const [co, us] = await Promise.all([fetchCompanies(), fetchUsers()]);
        setCompanies(Array.isArray(co) ? co : []);
        setUsers(Array.isArray(us) ? us : []);
      } catch {
        setCompanies([]);
        setUsers([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!companyId) return setDepartments([]);
    fetchDepartmentsByCompany(companyId).then(setDepartments).catch(() => setDepartments([]));
  }, [companyId]);

  useEffect(() => {
    if (!departmentId) return setSubDepartments([]);
    fetchSubDepartmentsByDepartment(departmentId).then(setSubDepartments).catch(() => setSubDepartments([]));
  }, [departmentId]);

  useEffect(() => {
    if (action === 'maintenance') setNote(`Đã bảo trì ngày ${todayVn()}`);
  }, [action]);

  const userOptions = useMemo(() => makeUserOptions(users, companyId, departmentId, subDepartmentId), [users, companyId, departmentId, subDepartmentId]);

  async function submit() {
    setSaving(true);
    try {
      const actor = JSON.parse(localStorage.getItem('assetflow_auth') || localStorage.getItem('currentUser') || '{}');
      const payload: any = {
        action,
        note: note.trim(),
        performed_by: actor?.id || 'system',
        set_maintenance_status: setMaintenanceStatus,
      };
      if (action === 'assign') {
        payload.company_id = companyId;
        payload.department_id = departmentId;
        payload.sub_department_id = subDepartmentId;
        payload.assigned_to = assignedTo;
      }
      const updated = await inventoryHardware(asset.id, payload);
      onSaved({ ...asset, ...updated });
      onClose();
      toast.success('Đã cập nhật kiểm kê tài sản');
    } catch (error: any) {
      toast.error(error?.message || 'Không thể kiểm kê tài sản');
    } finally {
      setSaving(false);
    }
  }

  const actionCards: Array<{ id: ActionType; label: string; icon: React.ReactNode; desc: string }> = [
    { id: 'recover', label: 'Thu Hồi Tài Sản', icon: <ArrowLeftRight size={16} />, desc: 'Đưa về sẵn sàng, gỡ phân bổ hiện tại.' },
    { id: 'maintenance', label: 'Bảo Trì / Vệ Sinh', icon: <Wrench size={16} />, desc: 'Ghi nhận bảo trì; chỉ đổi trạng thái nếu chọn.' },
    { id: 'assign', label: 'Cấp Phát Tài Sản', icon: <Building2 size={16} />, desc: 'Phân bổ lại công ty, phòng ban, bộ phận, nhân viên.' },
    { id: 'retire', label: 'Thanh Lý Tài Sản', icon: <ArchiveX size={16} />, desc: 'Chuyển về trạng thái thanh lý.' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-3xl border border-white/08 overflow-hidden" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/08">
          <div>
            <h3 className="text-base font-700 text-foreground">Kiểm Kê Tài Sản</h3>
            <p className="text-xs text-muted-foreground">{asset.name} · {asset.code}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl btn-ghost text-muted-foreground flex items-center justify-center"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {actionCards.map(card => (
              <button
                key={card.id}
                type="button"
                onClick={() => setAction(card.id)}
                disabled={card.id === 'assign' && asset.status !== 'available'}
                className={`text-left rounded-2xl border p-4 transition-colors ${action === card.id ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-line bg-hover hover:bg-white/05'} ${card.id === 'assign' && asset.status !== 'available' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1 text-sm font-600 text-foreground">{card.icon}{card.label}</div>
                <p className="text-xs text-muted-foreground">{card.desc}</p>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/08 p-4 bg-white/03">
            {action === 'recover' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Tài sản sẽ về trạng thái <span className="text-foreground font-600">Sẵn sàng</span> và bỏ phân bổ hiện tại.</p>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="w-full rounded-xl px-3 py-2 bg-surface-2 border border-line text-sm text-foreground" placeholder="Ghi chú thu hồi..." />
              </div>
            )}

            {action === 'maintenance' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Phù hợp cho vệ sinh, kiểm tra, bảo dưỡng định kỳ. Mặc định chỉ lưu lịch sử, không đổi trạng thái.</p>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="w-full rounded-xl px-3 py-2 bg-surface-2 border border-line text-sm text-foreground" placeholder="Ví dụ: Đã vệ sinh ngày 29/06/2026..." />
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={setMaintenanceStatus} onChange={e => setSetMaintenanceStatus(e.target.checked)} />
                  Đưa tài sản sang trạng thái <span className="font-600">Đang bảo trì</span>
                </label>
              </div>
            )}

            {action === 'assign' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {asset.status !== 'available' && (
                  <div className="sm:col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                    Chỉ có thể cấp phát khi tài sản đang ở trạng thái sẵn sàng.
                  </div>
                )}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Công ty</label>
                  <select value={companyId} onChange={e => { setCompanyId(e.target.value); setDepartmentId(''); setSubDepartmentId(''); setAssignedTo(''); }} className="w-full h-10 rounded-xl bg-surface-2 border border-line px-3 text-sm text-foreground">
                    <option value="">-- Chọn công ty --</option>
                    {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Phòng ban</label>
                  <select value={departmentId} onChange={e => { setDepartmentId(e.target.value); setSubDepartmentId(''); setAssignedTo(''); }} className="w-full h-10 rounded-xl bg-surface-2 border border-line px-3 text-sm text-foreground" disabled={!companyId}>
                    <option value="">-- Chọn phòng ban --</option>
                    {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Bộ phận</label>
                  <select value={subDepartmentId} onChange={e => { setSubDepartmentId(e.target.value); setAssignedTo(''); }} className="w-full h-10 rounded-xl bg-surface-2 border border-line px-3 text-sm text-foreground" disabled={!departmentId}>
                    <option value="">-- Chọn bộ phận --</option>
                    {subDepartments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Phân bổ cho nhân viên</label>
                  <SearchableSelect options={userOptions} value={assignedTo || null} onChange={(v) => setAssignedTo(v || '')} placeholder={companyId ? '-- Chọn nhân viên --' : '-- Chọn công ty trước --'} emptyText="Không có nhân viên phù hợp" disabled={!companyId} />
                </div>
                <div className="sm:col-span-2">
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="w-full rounded-xl px-3 py-2 bg-surface-2 border border-line text-sm text-foreground" placeholder="Ghi chú cấp phát..." />
                </div>
              </div>
            )}

            {action === 'retire' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Tài sản sẽ chuyển sang trạng thái <span className="text-foreground font-600">Thanh lý</span>.</p>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="w-full rounded-xl px-3 py-2 bg-surface-2 border border-line text-sm text-foreground" placeholder="Ghi chú thanh lý..." />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl btn-ghost text-sm font-600">Đóng</button>
            <button type="button" onClick={submit} disabled={saving} className="h-10 px-4 rounded-xl btn-indigo text-sm font-600 inline-flex items-center gap-2 disabled:opacity-60">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Lưu kiểm kê
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
