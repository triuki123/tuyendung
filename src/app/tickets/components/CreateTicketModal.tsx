'use client';

import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { X, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { createTicket } from '@/lib/api-client';
import { includesVN } from '@/lib/utils/searchVN';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface CreateTicketModalProps {
  onClose: () => void;
  currentUser: any;
  users: any[];
  onTicketCreated: (ticket: any) => void;
}

interface OrgTag {
  id: string;
  name: string;
}

interface Assignee {
  id: string;
  name: string;
  email?: string;
  department?: string;
  position?: string;
  job_title?: string;
}

interface CustomFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select';
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface TicketCategory {
  id: string;
  parent_id: string | null;
  name: string;
  request_type: string | null;
  default_unit_tag_id: string | null;
  custom_fields: CustomFieldDef[];
  sort_order: number;
}

interface RequestType {
  code: string;
  name: string;
}

const inputCls =
  'w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB / tệp (khớp giới hạn server)

// Search dropdown component for assignee & requester
const SearchDropdown = React.forwardRef<HTMLDivElement, {
  items: Assignee[];
  value: string;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (id: string) => void;
  isOpen: boolean;
  onOpenChange: (v: boolean) => void;
  placeholder: string;
  showEmpty?: boolean | string;
  isLoading?: boolean;
  disabled?: boolean;
}>(({
  items,
  value,
  search,
  onSearchChange,
  onSelect,
  isOpen,
  onOpenChange,
  placeholder,
  showEmpty = false,
  isLoading = false,
  disabled = false,
}, ref) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [inputPos, setInputPos] = React.useState<{ top: number; left: number; width: number; bottom: number }>({ top: 0, left: 0, width: 0, bottom: 0 });
  const [shouldRenderAbove, setShouldRenderAbove] = React.useState(false);

  React.useEffect(() => {
    if (!inputRef.current || !isOpen) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = 240; // max-h-60 ≈ 240px

    const renderAbove = spaceBelow < dropdownHeight && spaceAbove > dropdownHeight;
    setShouldRenderAbove(renderAbove);

    setInputPos({
      top: renderAbove ? rect.top - dropdownHeight : rect.bottom,
      left: rect.left,
      width: rect.width,
      bottom: renderAbove ? window.innerHeight - rect.top : 0,
    });
  }, [isOpen]);

  // Helper: Check if string is a UUID (to avoid displaying IDs)
  const isUUID = (str?: string) => {
    if (!str) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  const filteredItems = React.useMemo(() => {
    if (!search.trim()) return items;
    const query = search.toLowerCase();
    return items.filter(a =>
      a.name.toLowerCase().includes(query) ||
      a.job_title?.toLowerCase().includes(query) ||
      a.position?.toLowerCase().includes(query) ||
      (a.department && !isUUID(a.department) && a.department.toLowerCase().includes(query)) ||
      a.email?.toLowerCase().includes(query)
    );
  }, [items, search]);

  return (
    <div ref={ref}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={search || (value ? items.find(i => i.id === value)?.name || '' : '')}
          onChange={e => onSearchChange(e.target.value)}
          onFocus={() => onOpenChange(true)}
          disabled={disabled}
          className={`${inputCls} text-xs disabled:opacity-50`}
        />
        {search && (
          <button
            onClick={() => { onSearchChange(''); onSelect(''); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={disabled}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {isOpen && !disabled && typeof window !== 'undefined' && ReactDOM.createPortal(
        <>
          <div
            className="fixed bg-surface-2 border border-line rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
            style={{
              top: shouldRenderAbove ? 'auto' : `${inputPos.top}px`,
              bottom: shouldRenderAbove ? `${inputPos.bottom}px` : 'auto',
              left: `${inputPos.left}px`,
              width: `${inputPos.width}px`,
            }}
          >
            {showEmpty && (
              <button
                onClick={() => {
                  onSelect('');
                  onSearchChange('');
                  onOpenChange(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-hover-strong border-b border-line-subtle transition-colors font-500"
              >
                {showEmpty === 'unassigned' ? 'Chưa phân công' : '—'}
              </button>
            )}
            {isLoading ? (
              <p className="px-3 py-2 text-2xs text-muted-foreground">Đang tải...</p>
            ) : filteredItems.length === 0 ? (
              <p className="px-3 py-2 text-2xs text-muted-foreground">Không tìm thấy kết quả</p>
            ) : (
              filteredItems.map((a, idx) => (
                <button
                  key={a.id}
                  onClick={() => {
                    onSelect(a.id);
                    onSearchChange('');
                    onOpenChange(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs text-foreground hover:bg-hover-strong ${
                    idx < filteredItems.length - 1 ? 'border-b border-line-subtle' : ''
                  } transition-colors`}
                >
                  <div className="font-500">{a.name}</div>
                  {a.job_title && (
                    <div className="text-2xs text-muted-foreground">
                      {a.job_title}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
        </>,
        document.body
      )}
    </div>
  );
});

SearchDropdown.displayName = 'SearchDropdown';

export default function CreateTicketModal({
  onClose,
  currentUser,
  onTicketCreated,
}: CreateTicketModalProps) {
  const [form, setForm] = useState<any>({
    title: '',
    description: '',
    priority: 'medium',
    request_type: '',
    parent_id: '',
    category_id: '',
    assigned_unit_tag_id: '',
    assigned_to: '',
    followers: [], // Array of follower IDs
  });
  const [customValues, setCustomValues] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const [orgTags, setOrgTags] = useState<OrgTag[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [requestTypes, setRequestTypes] = useState<RequestType[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const [showAllStaff, setShowAllStaff] = useState(false);

  // On-behalf: nguoi yeu cau (mac dinh la nguoi dang dang nhap)
  const [onBehalf, setOnBehalf] = useState(false);
  const [requesterId, setRequesterId] = useState('');
  const [allStaff, setAllStaff] = useState<Assignee[]>([]);

  // Search states for assignee, requester, and followers
  const [searchAssignee, setSearchAssignee] = useState('');
  const [searchRequester, setSearchRequester] = useState('');
  const [searchFollowers, setSearchFollowers] = useState('');
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [showRequesterDropdown, setShowRequesterDropdown] = useState(false);
  const [showFollowersDropdown, setShowFollowersDropdown] = useState(false);

  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);

  useEffect(() => {
    fetch('/api/org-tags')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setOrgTags(Array.isArray(d) ? d : []))
      .catch(() => setOrgTags([]));
    fetch('/api/ticket-categories')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setCategories(Array.isArray(d) ? d : []))
      .catch(() => setCategories([]));
    fetch('/api/ticket-request-types')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setRequestTypes(Array.isArray(d) ? d : []))
      .catch(() => setRequestTypes([]));
  }, []);

  // Load danh sach toan bo nhan su cho on-behalf hoac followers
  useEffect(() => {
    if ((!onBehalf && !showFollowersDropdown) || allStaff.length > 0) return;
    fetch('/api/tickets/assignable-users')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setAllStaff(Array.isArray(d) ? d : []))
      .catch(() => setAllStaff([]));
  }, [onBehalf, showFollowersDropdown, allStaff.length]);

  // Close followers dropdown when clicking outside
  useEffect(() => {
    if (!showFollowersDropdown) return;
    const handleClick = () => setShowFollowersDropdown(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showFollowersDropdown]);

  // Danh mục gốc: nếu đã chọn loại yêu cầu thì chỉ hiện danh mục được gắn đúng loại đó.
  const parents = useMemo(
    () => categories.filter(c => !c.parent_id && (!form.request_type || c.request_type === form.request_type)),
    [categories, form.request_type]
  );
  // Danh mục con: lọc theo parent đã chọn + loại yêu cầu.
  const children = useMemo(
    () =>
      categories.filter(
        c =>
          c.parent_id === form.parent_id &&
          (!form.request_type || c.request_type === form.request_type)
      ),
    [categories, form.parent_id, form.request_type]
  );
  const selectedCategory = useMemo(
    () => categories.find(c => c.id === form.category_id),
    [categories, form.category_id]
  );
  const customFields: CustomFieldDef[] = selectedCategory?.custom_fields || [];

  // Tai nhan su duoc giao theo don vi (hoac tat ca).
  useEffect(() => {
    const tagId = form.assigned_unit_tag_id;
    if (!tagId && !showAllStaff) {
      setAssignees([]);
      return;
    }
    setLoadingAssignees(true);
    const url = showAllStaff
      ? '/api/tickets/assignable-users'
      : `/api/tickets/assignable-users?tagId=${encodeURIComponent(tagId)}`;
    fetch(url)
      .then(r => (r.ok ? r.json() : []))
      .then(d => setAssignees(Array.isArray(d) ? d : []))
      .catch(() => setAssignees([]))
      .finally(() => setLoadingAssignees(false));
  }, [form.assigned_unit_tag_id, showAllStaff]);

  const handleSelectChild = (childId: string) => {
    const cat = categories.find(c => c.id === childId);
    setForm((prev: any) => ({
      ...prev,
      category_id: childId,
      // Neu danh muc rang buoc request_type thi tu set.
      request_type: cat?.request_type || prev.request_type,
      // Auto don vi xu ly neu danh muc co default.
      assigned_unit_tag_id: cat?.default_unit_tag_id || prev.assigned_unit_tag_id,
    }));
    setCustomValues({});
  };

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    const tooBig = picked.filter(f => f.size > MAX_FILE_BYTES);
    const ok = picked.filter(f => f.size <= MAX_FILE_BYTES);
    if (tooBig.length > 0) {
      setError(`Tệp vượt quá 10MB: ${tooBig.map(f => f.name).join(', ')}`);
    }
    if (ok.length > 0) setFiles(prev => [...prev, ...ok]);
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('Tiêu đề không được để trống');
      return;
    }
    if (!form.category_id) {
      setError('Vui lòng chọn danh mục');
      return;
    }
    const missing = customFields.find(f => f.required && !String(customValues[f.key] ?? '').trim());
    if (missing) {
      setError(`Vui lòng nhập "${missing.label}"`);
      return;
    }

    try {
      setIsSaving(true);
      setError('');

      const unit = orgTags.find(t => t.id === form.assigned_unit_tag_id);
      const assignee = assignees.find(a => a.id === form.assigned_to);
      const requester =
        onBehalf && requesterId ? allStaff.find(s => s.id === requesterId) : null;

      // Ma ticket do server sinh (TK-YYYY-NNNN) de tranh trung.
      const newTicket = await createTicket({
        title: form.title,
        description: form.description,
        priority: form.priority,
        status: 'open',
        request_type: form.request_type || null,
        category_id: form.category_id,
        category_name: selectedCategory?.name || null,
        custom_fields: customValues,
        created_by: currentUser?.id,
        created_by_name: currentUser?.name,
        requester_id: requester?.id || currentUser?.id,
        requester_name: requester?.name || currentUser?.name,
        requester_department: requester?.department || currentUser?.department || null,
        requester_position: requester?.position || currentUser?.position || null,
        assigned_unit_tag_id: form.assigned_unit_tag_id || null,
        assigned_unit_name: unit?.name || null,
        assigned_to: assignee?.id || null,
        assigned_to_name: assignee?.name || null,
        followers: form.followers && form.followers.length > 0 ? form.followers : [],
      });

      // Upload dinh kem (neu co) sau khi ticket da tao.
      if (files.length > 0 && newTicket?.id) {
        const fd = new FormData();
        files.forEach(f => fd.append('files', f));
        if (currentUser?.id) fd.append('uploaded_by', currentUser.id);
        const upRes = await fetch(`/api/tickets/${newTicket.id}/attachments`, { method: 'POST', body: fd });
        if (!upRes.ok) {
          const upErr = await upRes.json().catch(() => ({}));
          // Ticket da tao thanh cong, chi rieng dinh kem that bai -> bao ro de nguoi dung tai lai.
          setError(
            `Ticket đã được tạo nhưng tải tệp đính kèm thất bại: ${upErr.error || 'lỗi không xác định'}. Vui lòng mở ticket và đính kèm lại.`
          );
          markClean();
          onTicketCreated(newTicket);
          return;
        }
      }

      markClean();
      onTicketCreated(newTicket);
    } catch (err: any) {
      setError(err.message || 'Lỗi tạo ticket');
    } finally {
      setIsSaving(false);
    }
  };

  const renderCustomField = (f: CustomFieldDef) => {
    const val = customValues[f.key] ?? '';
    const set = (v: any) => setCustomValues(prev => ({ ...prev, [f.key]: v }));
    const label = (
      <label className="block text-sm font-500 text-foreground mb-1.5">
        {f.label}{f.required ? ' *' : ''}
      </label>
    );
    if (f.type === 'textarea') {
      return (
        <div key={f.key} className="sm:col-span-2">
          {label}
          <textarea
            value={val}
            onChange={e => set(e.target.value)}
            rows={3}
            placeholder={f.placeholder}
            className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 resize-none"
          />
        </div>
      );
    }
    if (f.type === 'select') {
      return (
        <div key={f.key}>
          {label}
          <select value={val} onChange={e => set(e.target.value)} className={inputCls}>
            <option value="">-- Chọn --</option>
            {(f.options || []).map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      );
    }
    return (
      <div key={f.key}>
        {label}
        <input
          type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
          value={val}
          onChange={e => set(e.target.value)}
          placeholder={f.placeholder}
          className={inputCls}
        />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()} onChange={markDirty}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/08">
          <h2 className="text-lg font-700 text-foreground">Tạo Ticket Mới</h2>
          <button onClick={guardedClose} aria-label="Đóng" className="w-8 h-8 rounded-xl btn-ghost flex items-center justify-center text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Nguoi yeu cau */}
          <div className="rounded-xl bg-white/03 border border-white/08 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xs text-muted-foreground">Người yêu cầu</p>
                <p className="text-sm font-600 text-foreground">
                  {onBehalf && requesterId
                    ? allStaff.find(s => s.id === requesterId)?.name || '—'
                    : `${currentUser?.name || '—'}${currentUser?.job_title ? ` — ${currentUser.job_title}` : ''}`}
                </p>
              </div>
              <label className="flex items-center gap-1.5 text-2xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={onBehalf} onChange={e => { setOnBehalf(e.target.checked); setRequesterId(''); setSearchRequester(''); }} className="accent-indigo" />
                Tạo hộ người khác
              </label>
            </div>
            {onBehalf && (
              <SearchDropdown
                items={allStaff}
                value={requesterId}
                search={searchRequester}
                onSearchChange={setSearchRequester}
                onSelect={setRequesterId}
                isOpen={showRequesterDropdown}
                onOpenChange={setShowRequesterDropdown}
                placeholder="Tìm kiếm theo tên, chức vụ, phòng ban..."
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-500 text-foreground mb-1.5">Tiêu Đề *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm((p: any) => ({ ...p, title: e.target.value }))}
              className={inputCls}
              placeholder="Mô tả ngắn gọn vấn đề..."
            />
          </div>

          {/* Loai yeu cau + Danh muc cha */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Loại Yêu Cầu</label>
              <select
                value={form.request_type}
                onChange={e => {
                  const rt = e.target.value;
                  // Khi đổi loại yêu cầu: reset parent_id + category_id nếu không còn hợp lệ.
                  const parentStillValid = (p: any) => {
                    if (!rt) return true;
                    const par = categories.find(c => c.id === p.parent_id);
                    return !par || !par.request_type || par.request_type === rt;
                  };
                  const catStillValid =
                    !rt || !selectedCategory?.request_type || selectedCategory.request_type === rt;
                  setForm((p: any) => ({
                    ...p,
                    request_type: rt,
                    parent_id: parentStillValid(p) ? p.parent_id : '',
                    category_id: catStillValid && parentStillValid(p) ? p.category_id : '',
                  }));
                  if (!catStillValid) setCustomValues({});
                }}
                className={inputCls}
              >
                <option value="">-- Chọn loại --</option>
                {requestTypes.map(rt => (
                  <option key={rt.code} value={rt.code}>{rt.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Danh Mục</label>
              <select
                value={form.parent_id}
                onChange={e => setForm((p: any) => ({ ...p, parent_id: e.target.value, category_id: '' }))}
                className={inputCls}
              >
                <option value="">-- Chọn nhóm --</option>
                {parents.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Danh muc con */}
          {form.parent_id && (
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Danh Mục Chi Tiết *</label>
              <select value={form.category_id} onChange={e => handleSelectChild(e.target.value)} className={inputCls}>
                <option value="">-- Chọn danh mục --</option>
                {children.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-500 text-foreground mb-1.5">Mô Tả Chi Tiết</label>
            <textarea
              value={form.description}
              onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 resize-none"
              placeholder="Mô tả chi tiết vấn đề..."
            />
          </div>

          {/* Truong dong theo danh muc */}
          {customFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-white/03 border border-white/08 p-4">
              {customFields.map(renderCustomField)}
            </div>
          )}

          <div>
            <label className="block text-sm font-500 text-foreground mb-1.5">Độ Ưu Tiên</label>
            <select
              value={form.priority}
              onChange={e => setForm((p: any) => ({ ...p, priority: e.target.value }))}
              className={inputCls}
            >
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
              <option value="critical">Khẩn cấp</option>
            </select>
          </div>

          {/* Don vi xu ly + Nguoi duoc giao */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">Đơn Vị Xử Lý</label>
              <select
                value={form.assigned_unit_tag_id}
                onChange={e => setForm((p: any) => ({ ...p, assigned_unit_tag_id: e.target.value, assigned_to: '' }))}
                className={inputCls}
              >
                <option value="">-- Chọn đơn vị --</option>
                {orgTags.map(tag => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-500 text-foreground">Người Được Giao</label>
                <label className="flex items-center gap-1 text-2xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={showAllStaff} onChange={e => { setShowAllStaff(e.target.checked); setSearchAssignee(''); }} className="accent-indigo" />
                  Hiện tất cả nhân sự
                </label>
              </div>
              <SearchDropdown
                items={assignees}
                value={form.assigned_to}
                search={searchAssignee}
                onSearchChange={setSearchAssignee}
                onSelect={(id) => setForm((p: any) => ({ ...p, assigned_to: id }))}
                isOpen={showAssigneeDropdown}
                onOpenChange={setShowAssigneeDropdown}
                placeholder="Tìm kiếm theo tên, chức vụ, phòng ban..."
                showEmpty="unassigned"
                isLoading={loadingAssignees}
                disabled={loadingAssignees}
              />
              {loadingAssignees && (
                <p className="mt-1 text-2xs text-muted-foreground">Đang tải danh sách...</p>
              )}
              {!form.assigned_unit_tag_id && !showAllStaff && (
                <p className="mt-1 text-2xs text-muted-foreground">Chọn đơn vị để lọc nhân sự</p>
              )}
            </div>
          </div>

          {/* Người Theo Dõi */}
          <div className="overflow-visible">
            <label className="block text-sm font-500 text-foreground mb-2">👁️ Người Theo Dõi</label>
            <p className="text-2xs text-muted-foreground mb-2">Những người sẽ nhận thông báo khi ticket thay đổi</p>

            {/* Followers input/dropdown */}
            <div className="relative mb-2 overflow-visible" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                value={searchFollowers}
                onChange={e => {
                  setSearchFollowers(e.target.value);
                  setShowFollowersDropdown(true);
                }}
                onFocus={() => setShowFollowersDropdown(true)}
                onClick={e => { e.stopPropagation(); setShowFollowersDropdown(true); }}
                placeholder="Tìm kiếm người theo dõi..."
                className={inputCls}
              />

              {/* Dropdown followers */}
              {showFollowersDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 z-[100] max-h-60 overflow-y-auto rounded-xl bg-[#0f1419] border border-line shadow-lg">
                  {allStaff
                    .filter(user =>
                      includesVN(user.name, searchFollowers) ||
                      includesVN(user.job_title, searchFollowers)
                    )
                    .map(user => (
                      <label
                        key={user.id}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-white/05 cursor-pointer border-b border-white/05 last:border-0"
                      >
                        <input
                          type="checkbox"
                          checked={form.followers.includes(user.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setForm((p: any) => ({
                                ...p,
                                followers: [...p.followers, user.id],
                              }));
                            } else {
                              setForm((p: any) => ({
                                ...p,
                                followers: p.followers.filter((id: string) => id !== user.id),
                              }));
                            }
                          }}
                          className="w-4 h-4 accent-indigo rounded cursor-pointer"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-500 text-foreground">{user.name}</p>
                          {user.job_title && (
                            <p className="text-2xs text-muted-foreground">{user.job_title}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  {allStaff.filter(u => includesVN(u.name, searchFollowers)).length === 0 && (
                    <div className="px-4 py-3 text-center text-2xs text-muted-foreground">
                      Không tìm thấy người dùng
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Selected followers chips */}
          {form.followers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.followers.map((followerId: string) => {
                  const follower = allStaff.find(u => u.id === followerId);
                  return follower ? (
                    <div
                      key={followerId}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-indigo-500/20 border border-indigo-500/30 text-indigo-300"
                    >
                      <span>{follower.name}</span>
                      <button
                        onClick={() => {
                          setForm((p: any) => ({
                            ...p,
                            followers: p.followers.filter((id: string) => id !== followerId),
                          }));
                        }}
                        className="text-indigo-400 hover:text-indigo-300 ml-1"
                      >
                        ✕
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            )}

          {/* Dinh kem */}
          <div>
            <label className="block text-sm font-500 text-foreground mb-1.5">Đính Kèm</label>
            <label className="flex items-center gap-2 h-10 px-3 rounded-xl text-sm text-muted-foreground bg-surface-2 border border-dashed border-white/15 cursor-pointer hover:border-indigo/40">
              <Paperclip size={15} />
              Chọn tệp (tối đa 10MB/tệp)
              <input type="file" multiple className="hidden" onChange={onFilesPicked} />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-2xs text-foreground bg-white/03 rounded-lg px-3 py-1.5">
                    <span className="truncate">{f.name} <span className="text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span></span>
                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/08 bg-white/02">
          <button onClick={guardedClose} className="h-9 px-5 rounded-xl btn-ghost text-sm font-600">Hủy</button>
          <button
            onClick={handleSave}
            disabled={isSaving || !form.title.trim()}
            className="h-9 px-5 rounded-xl btn-accent text-sm font-600 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            Tạo Ticket
          </button>
        </div>
      </div>
    </div>
  );
}
