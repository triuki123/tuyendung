'use client';

import { useState, useRef } from 'react';
import { X, Upload, Loader2, AlertCircle } from 'lucide-react';
import { LookupItem, UserOption, uploadHrDocument, listUsers, fmtBytes } from './hrApi';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface FileRow {
  file: File;
  docTypeId: string;
  employeeId: string;
  employeeName: string;
}

interface Props {
  docTypes: LookupItem[];
  employeeProp?: UserOption | null; // nếu có → mode "1 nhân viên, nhiều loại hồ sơ"
  onClose: () => void;
  onDone: () => void;
}

export default function BulkUploadModal({ docTypes, employeeProp, onClose, onDone }: Props) {
  // Mode A: employeeProp có → cố định nhân viên, mỗi file chọn loại riêng
  // Mode B: employeeProp null → 1 loại hồ sơ, mỗi file chọn nhân viên riêng
  const modeA = !!employeeProp;

  const [step, setStep] = useState<'upload' | 'assign'>('upload');
  const [files, setFiles] = useState<FileRow[]>([]);
  const [sharedDocTypeId, setSharedDocTypeId] = useState(''); // Mode B: 1 loại cho tất cả
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);

  async function loadEmployees() {
    try {
      const data = await listUsers();
      setEmployees(data || []);
    } catch { /* noop */ }
  }

  function handleFileSelect(fileList: FileList | null) {
    if (!fileList) return;
    if (!modeA && !sharedDocTypeId) {
      setError('Vui lòng chọn loại hồ sơ trước');
      return;
    }
    const newRows: FileRow[] = Array.from(fileList).map((file) => ({
      file,
      docTypeId: modeA ? '' : sharedDocTypeId, // Mode A: để trống, user tự chọn ở step 2
      employeeId: modeA ? employeeProp!.id : '',
      employeeName: modeA ? employeeProp!.name : '',
    }));
    setFiles((prev) => [...prev, ...newRows]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError('');
    if (newRows.length) markDirty();
  }

  function handleNext() {
    if (!files.length) { setError('Vui lòng chọn ít nhất 1 tệp'); return; }
    if (!modeA) loadEmployees();
    setStep('assign');
    setError('');
  }

  function updateRow(idx: number, field: 'docTypeId' | 'employeeId', value: string) {
    setFiles((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === 'employeeId') {
        const emp = employees.find((e) => e.id === value);
        updated[idx].employeeName = emp?.name || '';
      }
      return updated;
    });
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSaveAll() {
    const missingEmployee = !modeA && files.some((f) => !f.employeeId);
    const missingDocType  = modeA  && files.some((f) => !f.docTypeId);
    if (missingEmployee) { setError('Mỗi tệp phải được gán cho một nhân viên'); return; }
    if (missingDocType)  { setError('Mỗi tệp phải có loại hồ sơ'); return; }

    setSaving(true);
    setError('');
    try {
      for (const f of files) {
        await uploadHrDocument({
          employeeId: f.employeeId,
          docTypeId: f.docTypeId,
          title: f.file.name.replace(/\.[^.]+$/, ''),
          fileName: f.file.name,
          mimeType: f.file.type,
          sizeBytes: f.file.size,
          buffer: await f.file.arrayBuffer(),
          uploadedBy: null,
        });
      }
      markClean();
      onDone();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải lên');
    } finally {
      setSaving(false);
    }
  }

  const title = modeA
    ? `Tải nhiều hồ sơ — ${employeeProp!.name}`
    : 'Tải lên đồng loạt';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={guardedClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-line overflow-hidden"
        style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()} onChange={markDirty}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <div>
            <h2 className="text-base font-600 text-foreground">{title}</h2>
            {modeA && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Tải nhiều tệp cùng lúc — mỗi tệp chọn loại hồ sơ riêng
              </p>
            )}
          </div>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          {step === 'upload' ? (
            <div className="space-y-4">
              {/* Mode B: chọn 1 loại hồ sơ chung */}
              {!modeA && (
                <div>
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-2 block">
                    Loại hồ sơ <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={sharedDocTypeId}
                    onChange={(e) => setSharedDocTypeId(e.target.value)}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
                    style={{ background: 'var(--input)' }}>
                    <option value="">— Chọn loại —</option>
                    {docTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              {/* Drop zone */}
              <div>
                <input ref={fileInputRef} type="file" multiple
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-line-strong hover:border-indigo-500 px-6 py-8 text-center transition-colors">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-600 text-foreground">Bấm để chọn hoặc kéo file vào đây</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, ảnh, tài liệu… (tối đa 10MB/file)</p>
                </button>
              </div>

              {/* Danh sách file đã chọn */}
              {files.length > 0 && (
                <div className="rounded-xl bg-hover p-4">
                  <p className="text-sm font-600 text-foreground mb-3">Đã chọn {files.length} tệp</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {files.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm p-2 rounded bg-hover">
                        <span className="text-foreground truncate flex-1">{f.file.name}</span>
                        <span className="text-xs text-muted-foreground mx-3 shrink-0">{fmtBytes(f.file.size)}</span>
                        <button onClick={() => removeFile(idx)} className="text-red-400 hover:text-red-300 shrink-0">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4" /> {error}
                </div>
              )}
            </div>
          ) : (
            /* Step 2: Gán thông tin */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {modeA
                  ? `Chọn loại hồ sơ cho từng tệp — tất cả sẽ được lưu cho ${employeeProp!.name}:`
                  : 'Gán từng tệp cho nhân viên tương ứng:'}
              </p>

              {/* Mobile: card list */}
              <div className="sm:hidden space-y-3">
                {files.map((f, idx) => (
                  <div key={idx} className="rounded-xl border border-line-subtle p-3 space-y-2"
                    style={{ background: 'var(--card)' }}>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground truncate flex-1">{f.file.name}</p>
                      <span className="text-2xs text-muted-foreground shrink-0">{fmtBytes(f.file.size)}</span>
                      <button onClick={() => removeFile(idx)}
                        className="shrink-0 text-red-400 hover:text-red-300 p-1 rounded">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {modeA ? (
                      <select
                        value={f.docTypeId}
                        onChange={(e) => updateRow(idx, 'docTypeId', e.target.value)}
                        className="w-full rounded-lg border border-line px-2 py-1.5 text-sm text-foreground outline-none focus:border-indigo-500"
                        style={{ background: 'var(--input)' }}>
                        <option value="">— Chọn loại hồ sơ —</option>
                        {docTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : (
                      <select
                        value={f.employeeId}
                        onChange={(e) => updateRow(idx, 'employeeId', e.target.value)}
                        className="w-full rounded-lg border border-line px-2 py-1.5 text-sm text-foreground outline-none focus:border-indigo-500"
                        style={{ background: 'var(--input)' }}>
                        <option value="">— Chọn nhân viên —</option>
                        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left px-3 py-2 text-muted-foreground font-600">Tên tệp</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-600">Kích thước</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-600">
                        {modeA ? 'Loại hồ sơ' : 'Nhân viên'}
                      </th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f, idx) => (
                      <tr key={idx} className="border-b border-line-subtle hover:bg-hover">
                        <td className="px-3 py-3 text-foreground truncate max-w-[180px]">{f.file.name}</td>
                        <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{fmtBytes(f.file.size)}</td>
                        <td className="px-3 py-3">
                          {modeA ? (
                            <select
                              value={f.docTypeId}
                              onChange={(e) => updateRow(idx, 'docTypeId', e.target.value)}
                              className="rounded-lg border border-line px-2 py-1 text-sm text-foreground outline-none focus:border-indigo-500 w-44"
                              style={{ background: 'var(--input)' }}>
                              <option value="">— Chọn loại —</option>
                              {docTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          ) : (
                            <select
                              value={f.employeeId}
                              onChange={(e) => updateRow(idx, 'employeeId', e.target.value)}
                              className="rounded-lg border border-line px-2 py-1 text-sm text-foreground outline-none focus:border-indigo-500 w-44"
                              style={{ background: 'var(--input)' }}>
                              <option value="">— Chọn —</option>
                              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <button onClick={() => removeFile(idx)}
                            className="text-muted-foreground hover:text-red-400 p-1 rounded transition-colors">
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4" /> {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          {step === 'upload' ? (
            <button
              onClick={handleNext}
              disabled={files.length === 0 || (!modeA && !sharedDocTypeId)}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">
              Tiếp theo →
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button onClick={() => setStep('upload')}
                className="btn-ghost rounded-xl px-4 py-2 text-sm text-muted-foreground">
                ← Quay lại
              </button>
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-600 text-white flex items-center gap-2 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Lưu {files.length} tệp
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
