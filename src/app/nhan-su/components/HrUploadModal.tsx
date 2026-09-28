'use client';

/**
 * Modal upload hồ sơ nhân sự — dùng chung cho admin (HrDocsTab) và nhân viên (MyHRClient).
 * Khi employeeProp = null → hiển thị EmployeePicker để chọn nhân viên.
 * Khi employeeProp = UserOption → field nhân viên cố định (không đổi được).
 */

import { useRef, useState } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import EmployeePicker from './EmployeePicker';
import { LookupItem, UserOption, uploadHrDocuments, fmtBytes } from './hrApi';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface Props {
  docTypes: LookupItem[];
  /** Nếu truyền vào thì field nhân viên cố định; nếu null thì cho phép chọn. */
  employeeProp: UserOption | null;
  onClose: () => void;
  onDone: () => void;
}

export default function HrUploadModal({ docTypes, employeeProp, onClose, onDone }: Props) {
  const [employee, setEmployee] = useState<UserOption | null>(employeeProp);
  const [docTypeId, setDocTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...picked]);
    if (picked.length === 1 && !title) setTitle(picked[0].name.replace(/\.[^.]+$/, ''));
    if (e.target) e.target.value = '';
    if (picked.length) markDirty();
  }

  async function handleUpload() {
    if (!files.length) return setError('Chưa chọn tệp');
    if (!employee) return setError('Vui lòng chọn nhân viên');
    setBusy(true);
    setError('');
    try {
      const fileList = Object.assign(files, { item: (i: number) => files[i] }) as unknown as FileList;
      await uploadHrDocuments({
        files: fileList,
        employeeId: employee.id,
        docTypeId: docTypeId || null,
        title: title.trim() || null,
      });
      markClean();
      onDone();
    } catch (e: any) {
      setError(e.message || 'Lỗi khi tải lên');
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={guardedClose}>
      <div className="w-full max-w-md rounded-3xl border border-line overflow-hidden"
        style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()} onChange={markDirty}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Tải lên hồ sơ</h2>
          <button onClick={guardedClose} className="rounded-lg p-1.5 hover:bg-hover text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">

          {/* Nhân viên */}
          <div className="space-y-1.5">
            <label className="text-2xs font-600 uppercase tracking-wider text-muted-foreground">
              Nhân viên {!employeeProp && '*'}
            </label>
            {employeeProp ? (
              <div className="rounded-xl border border-line px-3 py-2 text-sm text-foreground"
                style={{ background: 'var(--input)' }}>
                {employeeProp.name}
              </div>
            ) : (
              <EmployeePicker value={employee} onChange={setEmployee} placeholder="Chọn nhân viên…" />
            )}
          </div>

          {/* Loại hồ sơ */}
          <div className="space-y-1.5">
            <label className="text-2xs font-600 uppercase tracking-wider text-muted-foreground">Loại hồ sơ</label>
            <select value={docTypeId} onChange={(e) => setDocTypeId(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              style={{ background: 'var(--input)' }}>
              <option value="">— Chọn loại —</option>
              {docTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Tiêu đề */}
          <div className="space-y-1.5">
            <label className="text-2xs font-600 uppercase tracking-wider text-muted-foreground">Tiêu đề (tuỳ chọn)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: CCCD mặt trước…"
              className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              style={{ background: 'var(--input)' }} />
          </div>

          {/* File picker */}
          <div className="space-y-1.5">
            <label className="text-2xs font-600 uppercase tracking-wider text-muted-foreground">Tệp</label>
            <div onClick={() => fileRef.current?.click()}
              className="rounded-xl border border-dashed border-line-strong hover:border-indigo-500/50 px-4 py-6 text-center cursor-pointer transition-colors">
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nhấn để chọn tệp</p>
              <p className="text-2xs text-muted-foreground mt-0.5">PDF, ảnh, Word, Excel… tối đa 10MB/file</p>
            </div>
            <input ref={fileRef} type="file" multiple hidden onChange={onFileChange} />

            {files.length > 0 && (
              <ul className="space-y-1 mt-2">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-foreground rounded-lg border border-line-subtle px-3 py-1.5">
                    <span className="truncate">
                      {f.name} <span className="text-muted-foreground">{fmtBytes(f.size)}</span>
                    </span>
                    <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-red-400 ml-2 shrink-0">
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button onClick={guardedClose}
            className="rounded-xl border border-line px-4 py-2 text-sm text-muted-foreground hover:bg-hover">
            Hủy
          </button>
          <button onClick={handleUpload} disabled={busy || !files.length}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white flex items-center gap-2 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Tải lên{files.length > 0 ? ` (${files.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
