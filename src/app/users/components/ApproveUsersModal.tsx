'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, UserCheck, ChevronLeft, ShieldCheck, FileText, Download, AlertTriangle, XCircle, Inbox, Tag,
} from 'lucide-react';
import {
  listOnbSubmissions, getOnbSubmission, approveOnbSubmission, rejectOnbSubmission, loadOrgData,
  downloadHrDoc, OnbSubmission, fmtBytes, fmtDateTime,
} from '@/lib/api/onboardingApi';
import { getCurrentUser } from '@/lib/authStore';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import SendAccountEmailModal, { AccountEmailDefaults } from './SendAccountEmailModal';
import ManagerPicker, { type ManagerOption } from './ManagerPicker';

interface Props {
  onClose: () => void;
  onApproved: () => void;
}

/**
 * Duyệt Người Dùng — QTV xem hồ sơ onboarding đã được Tuyển Dụng gửi lên,
 * cấp working email + mật khẩu + vai trò → tạo user chính thức.
 */
export default function ApproveUsersModal({ onClose, onApproved }: Props) {
  const toast = useToast();
  const [list, setList] = useState<OnbSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OnbSubmission | null>(null);
  const [org, setOrg] = useState<Awaited<ReturnType<typeof loadOrgData>> | null>(null);
  const [form, setForm] = useState({ working_email: '', password: '', confirm: '', role: 'user' });
  // Hình thức làm việc chọn ngay lúc duyệt — cùng danh mục /api/employment-types với modal Chỉnh Sửa.
  const [empTypes, setEmpTypes] = useState<{ id: string; name: string }[]>([]);
  const [employmentTypeId, setEmploymentTypeId] = useState('');
  const [busy, setBusy] = useState<'' | 'approve' | 'reject'>('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [allTags, setAllTags] = useState<{ id: string; name: string; color: string; description?: string }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [telegramId, setTelegramId] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  // Quản lý trực tiếp — gợi ý theo đúng công ty/phòng ban/bộ phận ghi trong hồ sơ.
  // Trước đây màn Duyệt không có ô này nên user tạo ra luôn thiếu quản lý, phải vào
  // Chỉnh Sửa bổ sung thủ công.
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [managerId, setManagerId] = useState('');
  const confirmDialog = useConfirm();
  // Form gửi "Email cấp tài khoản cho nhân sự mới" (mở sau khi duyệt + QTV đồng ý gửi)
  const [accountEmail, setAccountEmail] = useState<AccountEmailDefaults | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [res, o, tagsRes, empRes] = await Promise.all([
          listOnbSubmissions('sent_to_admin'),
          loadOrgData(),
          fetch('/api/tags'),
          fetch('/api/employment-types').then((r) => r.json()).catch(() => null),
        ]);
        setList(res.data);
        setOrg(o);
        if (empRes?.success) setEmpTypes(empRes.data || []);
        if (tagsRes.ok) {
          const tagsData = await tagsRes.json();
          setAllTags(tagsData.data || tagsData || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openDetail = async (s: OnbSubmission) => {
    setError('');
    setDone('');
    setForm({ working_email: String(s.data?.working_email || ''), password: '', confirm: '', role: 'user' });
    setEmploymentTypeId('');
    setSelectedTagIds([]);
    setTelegramId(s.data?.telegram_id || '');
    setTelegramEnabled(false);
    setManagerId('');
    setManagers([]);
    try {
      const full = await getOnbSubmission(s.id);
      setSelected(full);
    } catch {
      setSelected(s);
    }
  };

  // Nạp danh sách quản lý theo CÔNG TY của hồ sơ đang duyệt. Picker tự nhóm theo
  // phòng ban / bộ phận và đẩy trưởng-phó đơn vị lên đầu.
  const submissionCompanyId = selected?.data?.company_id || '';
  useEffect(() => {
    if (!submissionCompanyId) { setManagers([]); return; }
    let cancelled = false;
    fetch(`/api/users/managers?company_id=${encodeURIComponent(submissionCompanyId)}`)
      .then(r => (r.ok ? r.json() : []))
      .then(data => { if (!cancelled) setManagers(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setManagers([]); });
    return () => { cancelled = true; };
  }, [submissionCompanyId]);

  const orgNames = useMemo(() => {
    if (!selected || !org) return { company: '', dept: '', subDept: '', position: '' };
    const d = selected.data || {};
    return {
      company: org.companies.find(c => c.id === d.company_id)?.name || '',
      dept: org.departments.find(x => x.id === d.department_id)?.name || '',
      subDept: org.subDepartments.find(x => x.id === d.sub_department_id)?.name || '',
      position: org.positions.find(x => x.id === d.position_id)?.name || '',
    };
  }, [selected, org]);

  const handleApprove = async () => {
    if (!selected) return;
    if (!form.working_email.trim()) { setError('Vui lòng điền working email'); return; }
    if (form.password.length < 10) { setError('Mật khẩu phải có ít nhất 10 ký tự'); return; }
    if (form.password !== form.confirm) { setError('Mật khẩu xác nhận không khớp'); return; }
    setBusy('approve');
    setError('');
    try {
      const result = await approveOnbSubmission(selected.id, {
        working_email: form.working_email.trim(),
        password: form.password,
        role: form.role,
        employment_type_id: employmentTypeId || undefined,
        employment_type: empTypes.find((t) => t.id === employmentTypeId)?.name || undefined,
        manager_id: managerId || undefined,
      });
      const userId = result.user_id;
      // Set tags sau khi tạo user
      if (selectedTagIds.length > 0 && userId) {
        const u = getCurrentUser() as any;
        await fetch(`/api/users/${userId}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(u?.id ? { 'x-current-user-id': u.id } : {}) },
          body: JSON.stringify({ tagIds: selectedTagIds }),
        }).catch(() => {});
      }
      // Set telegram nếu có
      if (telegramId && userId) {
        const u = getCurrentUser() as any;
        await fetch(`/api/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(u?.id ? { 'x-current-user-id': u.id } : {}) },
          body: JSON.stringify({ telegram_chat_id: telegramId, telegram_enabled: telegramEnabled }),
        }).catch(() => {});
      }
      setList(prev => prev.filter(x => x.id !== selected.id));
      setDone(`Đã duyệt ${selected.candidate_name} — user được tạo${selectedTagIds.length > 0 ? `, ${selectedTagIds.length} quyền đã gán` : ''}${selected.data?.telegram_id ? ', đã gửi Telegram chào mừng' : ''}.`);
      // Giữ lại thông tin trước khi đóng chi tiết để hỏi gửi email cấp tài khoản
      const emailDefaults: AccountEmailDefaults = {
        to: String(selected.data?.personal_email || selected.candidate_email || ''),
        ung_vien: String(selected.data?.full_name || selected.candidate_name || ''),
        cong_ty: orgNames.company,
        assetflow_user: form.working_email.trim(),
        assetflow_pass: form.password,
        zimbra_user: form.working_email.trim(),
        zimbra_pass: '',
      };
      setSelected(null);
      onApproved();
      if (await confirmDialog({
        title: 'Gửi email cấp tài khoản?',
        message: `Bạn có muốn gửi "Email cấp tài khoản cho nhân sự mới" tới ${emailDefaults.ung_vien}?`,
        confirmLabel: 'Có, soạn email',
        cancelLabel: 'Không',
        danger: false,
      })) {
        setAccountEmail(emailDefaults);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duyệt thất bại');
    } finally {
      setBusy('');
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    const reason = window.prompt('Lý do từ chối?');
    if (reason === null) return;
    setBusy('reject');
    setError('');
    try {
      await rejectOnbSubmission(selected.id, reason);
      setList(prev => prev.filter(x => x.id !== selected.id));
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Từ chối thất bại');
    } finally {
      setBusy('');
    }
  };

  const d = selected?.data || {};
  const inputCls = 'w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60';

  const InfoRow = ({ label, value }: { label: string; value: any }) => (
    <div>
      <p className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm text-foreground mt-0.5">{value || '—'}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            {selected && (
              <button onClick={() => setSelected(null)} className="btn-ghost rounded-lg p-1.5">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <UserCheck className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-700 text-foreground">
              {selected ? `Duyệt: ${selected.candidate_name}` : `Duyệt Người Dùng (${list.length})`}
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !selected ? (
            <>
              {done && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                  <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                  <p className="text-xs text-emerald-300">{done}</p>
                </div>
              )}
              {list.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <Inbox className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Không có hồ sơ chờ duyệt</p>
                  <p className="text-xs mt-1 opacity-60">Hồ sơ sẽ xuất hiện khi Tuyển Dụng nhấn &quot;Gửi Quản Trị Viên&quot;</p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {list.map(s => (
                    <li key={s.id}>
                      <button
                        onClick={() => openDetail(s)}
                        className="w-full flex items-center gap-4 rounded-2xl border border-line-subtle hover:border-indigo-500/40 hover:bg-hover px-5 py-4 text-left transition-colors"
                      >
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-700 text-white shrink-0"
                          style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
                          {s.candidate_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-600 text-foreground truncate">{s.candidate_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {s.data?.job_title || s.candidate_email} · Gửi lên {fmtDateTime(s.sent_to_admin_at)}
                          </p>
                        </div>
                        <span className="text-2xs font-600 text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded-full px-2.5 py-0.5 shrink-0">
                          Chờ duyệt
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="space-y-5">
              {/* Tóm tắt thông tin đã chuẩn hóa */}
              <section>
                <h3 className="text-xs font-700 uppercase tracking-widest text-indigo-400 mb-2.5">Thông tin đã chuẩn hóa</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-2xl border border-line-subtle bg-hover p-4">
                  <InfoRow label="Họ tên" value={d.full_name || selected.candidate_name} />
                  <InfoRow label="Email cá nhân" value={d.personal_email || selected.candidate_email} />
                  <InfoRow label="SĐT" value={d.phone} />
                  <InfoRow label="Công ty" value={orgNames.company} />
                  <InfoRow label="Phòng ban" value={orgNames.dept} />
                  <InfoRow label="Bộ phận" value={orgNames.subDept} />
                  <InfoRow label="Chức vụ" value={orgNames.position} />
                  <InfoRow label="Chức danh" value={d.job_title} />
                  <InfoRow label="Ngày vào làm" value={d.hire_date} />
                  <InfoRow label="CCCD" value={d.national_id} />
                  <InfoRow label="Telegram ID" value={d.telegram_id} />
                  <InfoRow label="Ngân hàng" value={d.bank_account_no ? `${d.bank_account_no} · ${d.bank_name || ''}` : ''} />
                </div>
              </section>

              {/* Hồ sơ đính kèm */}
              {(selected.attachments || []).length > 0 && (
                <section>
                  <h3 className="text-xs font-700 uppercase tracking-widest text-indigo-400 mb-2.5">
                    Hồ sơ đính kèm (sẽ thành chính thức khi duyệt)
                  </h3>
                  <ul className="space-y-2">
                    {(selected.attachments || []).map(a => (
                      <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line-subtle bg-hover px-3.5 py-2.5">
                        <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-sm text-foreground truncate">{a.file_name}</p>
                          <p className="text-2xs text-muted-foreground">{fmtBytes(a.size_bytes)}</p>
                        </div>
                        <button
                          onClick={() => downloadHrDoc(a.id, a.file_name).catch(err => toast.error(err.message))}
                          className="btn-ghost rounded-lg p-1.5" title="Tải xuống"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Cấp tài khoản */}
              <section>
                <h3 className="text-xs font-700 uppercase tracking-widest text-amber-400 mb-2.5">Cấp tài khoản hệ thống</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="sm:col-span-2">
                    <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">Working email (đăng nhập) *</label>
                    <input type="email" value={form.working_email} onChange={e => setForm(p => ({ ...p, working_email: e.target.value }))}
                      className={inputCls} placeholder="ten.nv@fado.vn" />
                  </div>
                  <div>
                    <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">Mật khẩu *</label>
                    <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      className={inputCls} placeholder="Ít nhất 10 ký tự" />
                  </div>
                  <div>
                    <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">Xác nhận mật khẩu *</label>
                    <input type="password" value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                      className={inputCls} placeholder="Nhập lại mật khẩu" />
                  </div>
                  <div>
                    <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">Vai trò</label>
                    <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className={inputCls}>
                      <option value="user">Người Dùng</option>
                      <option value="manager">Quản Lý</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">Hình thức làm việc</label>
                    <select value={employmentTypeId} onChange={e => setEmploymentTypeId(e.target.value)} className={inputCls}>
                      <option value="">-- Chọn hình thức --</option>
                      {empTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <p className="text-2xs text-muted-foreground mt-1">Để trống nếu C&amp;B bổ sung sau (sửa được ở Hồ Sơ Nhân Sự)</p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">
                      Quản lý trực tiếp
                    </label>
                    <ManagerPicker
                      value={managerId}
                      onChange={setManagerId}
                      managers={managers}
                      departmentId={selected?.data?.department_id || undefined}
                      subDepartmentId={selected?.data?.sub_department_id || undefined}
                      placeholder="-- Chọn quản lý trực tiếp --"
                    />
                    <p className="text-2xs text-muted-foreground mt-1">
                      Gợi ý theo {orgNames.subDept ? `bộ phận ${orgNames.subDept}` : orgNames.dept ? `phòng ban ${orgNames.dept}` : 'công ty'} của hồ sơ — người phụ trách đơn vị xếp lên đầu
                    </p>
                  </div>
                </div>
              </section>

              {/* Phân quyền */}
              <section>
                <h3 className="text-xs font-700 uppercase tracking-widest text-purple-400 mb-2.5 flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5" /> Phân quyền
                </h3>
                <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-4">
                  {/* Tags */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-2xs font-600 text-muted-foreground uppercase tracking-wider">Thẻ quyền</p>
                      {selectedTagIds.length > 0 && (
                        <span className="text-2xs font-600 text-purple-400 bg-purple-500/15 px-2 py-0.5 rounded-full">
                          Đã chọn {selectedTagIds.length}
                        </span>
                      )}
                    </div>
                    {allTags.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Không có thẻ quyền nào</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {allTags.map(tag => {
                          const isSelected = selectedTagIds.includes(tag.id);
                          return (
                            <button key={tag.id} type="button"
                              onClick={() => setSelectedTagIds(prev =>
                                prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                              )}
                              className={`px-3 py-2 rounded-lg text-xs font-600 transition-all border-2 text-left ${
                                isSelected ? 'text-white shadow-lg' : 'border-line-strong text-muted-foreground hover:border-white/40 hover:bg-hover'
                              }`}
                              style={{ backgroundColor: isSelected ? tag.color : 'transparent', borderColor: isSelected ? tag.color : undefined }}
                              title={tag.description || tag.name}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>{tag.name}</span>
                                {isSelected && <span className="flex items-center justify-center w-4 h-4 rounded-full bg-white/30 shrink-0">✓</span>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Telegram */}
                  <div className="border-t border-line pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">Telegram User ID</label>
                      <input type="text" value={telegramId} onChange={e => setTelegramId(e.target.value)}
                        className={inputCls} placeholder="Ví dụ: 5195958362" />
                      <p className="text-2xs text-muted-foreground mt-1">Để trống nếu chưa có</p>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={telegramEnabled} disabled={!telegramId}
                          onChange={e => setTelegramEnabled(e.target.checked)}
                          className="w-5 h-5 rounded border-line-strong accent-indigo-500 disabled:opacity-60" />
                        <span className="text-sm font-500 text-foreground">
                          {telegramEnabled ? '✅ Bật thông báo' : '⭕ Tắt thông báo'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              {error && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {selected && (
          <div className="flex items-center justify-end gap-2.5 border-t border-line-subtle px-6 py-4 shrink-0">
            <button onClick={handleReject} disabled={!!busy}
              className="rounded-xl px-4 py-2 text-sm font-500 text-red-400 border border-red-500/30 hover:bg-red-500/10 flex items-center gap-2 disabled:opacity-50">
              {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Từ chối
            </button>
            <button onClick={handleApprove} disabled={!!busy || !form.working_email || !form.password}
              className="btn-accent rounded-xl px-5 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
              {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Duyệt Người Dùng
            </button>
          </div>
        )}
      </div>

      {accountEmail && (
        <SendAccountEmailModal defaults={accountEmail} onClose={() => setAccountEmail(null)} />
      )}
    </div>
  );
}
