'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2, CheckCircle2, Clock, AlertTriangle, Upload, Trash2, FileText, Send, Briefcase,
} from 'lucide-react';
import OnboardingField from './OnboardingField';
import {
  FormFieldDef, OrgData,
  SECTION_LABELS, SECTION_ORDER, computeJobTitle, formatBytes,
} from './onboardingTypes';

type PageState = 'loading' | 'form' | 'submitted' | 'closed' | 'error';

// required / multiple cấu hình trong "Cấu Hình Biểu Mẫu" (hr_document_types).
interface OnboardingDocType {
  id: string;
  name: string;
  description: string | null;
  required: boolean;
  multiple: boolean;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Landing page PUBLIC nhân sự mới điền thông tin nhận việc.
 * Không cần đăng nhập — submit gửi data + file trong một multipart POST.
 */
export default function OnboardingFormClient() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [title, setTitle] = useState('Biểu Mẫu Thông Tin Nhận Việc');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<FormFieldDef[]>([]);
  const [org, setOrg] = useState<OrgData>({ companies: [], departments: [], subDepartments: [], positions: [] });
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [docTypes, setDocTypes] = useState<OnboardingDocType[]>([]);
  const [filesByType, setFilesByType] = useState<Record<string, File[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/public/onboarding/config');
        if (res.status === 404) { setPageState('closed'); return; }
        const json = await res.json();
        if (!res.ok) { setPageState('error'); return; }
        const d = json.data;
        setTitle(d.title || 'Biểu Mẫu Thông Tin Nhận Việc');
        setDescription(d.description || '');
        setFields(d.fields);
        setOrg(d.org);
        setDocTypes(Array.isArray(d.docTypes) ? d.docTypes : []);
        setPageState('form');
      } catch {
        setPageState('error');
      }
    })();
  }, []);

  const sections = useMemo(() => {
    const bySection: Record<string, FormFieldDef[]> = {};
    for (const f of fields) {
      if (!bySection[f.section]) bySection[f.section] = [];
      bySection[f.section].push(f);
    }
    return SECTION_ORDER.filter(s => bySection[s]?.length).map(s => ({ key: s, fields: bySection[s] }));
  }, [fields]);

  const jobTitle = useMemo(() => computeJobTitle(org, values), [org, values]);
  const hasVehicle = values.vehicle_type && values.vehicle_type !== 'Không có';
  const hasSocialInsurance = values.has_social_insurance === true;

  const handleChange = (key: string, value: any) => {
    setValues(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'company_id') { next.department_id = ''; next.sub_department_id = ''; next.position_id = ''; }
      if (key === 'department_id') { next.sub_department_id = ''; }
      return next;
    });
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const addFilesForType = (typeId: string, fileList: FileList | null) => {
    if (!fileList) return;
    const incoming = Array.from(fileList).filter(f => f.size > 0);
    const tooBig = incoming.find(f => f.size > MAX_FILE_BYTES);
    if (tooBig) { setSubmitError(`Tệp "${tooBig.name}" vượt quá 10MB`); return; }
    const multi = docTypes.find(d => d.id === typeId)?.multiple ?? false;
    setFilesByType(prev => ({
      ...prev,
      // Loại 1-tệp: chọn mới thay tệp cũ. Loại nhiều-tệp: cộng dồn (tối đa 10/loại).
      [typeId]: multi ? [...(prev[typeId] ?? []), ...incoming].slice(0, 10) : incoming.slice(0, 1),
    }));
    setSubmitError('');
    if (errors[`doc_${typeId}`]) setErrors(prev => ({ ...prev, [`doc_${typeId}`]: '' }));
  };

  const removeFileForType = (typeId: string, index: number) => {
    setFilesByType(prev => ({
      ...prev,
      [typeId]: (prev[typeId] ?? []).filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};
    for (const f of fields) {
      if (!f.required || f.field_type === 'file') continue;
      if (f.field_key === 'sub_department_id') {
        const opts = org.subDepartments.filter(s => s.department_id === values.department_id);
        if (opts.length === 0) continue;
      }
      const v = values[f.field_key];
      if (v === undefined || v === null || String(v).trim() === '') {
        newErrors[f.field_key] = `Vui lòng điền ${f.label}`;
      }
    }
    // Bắt buộc đính kèm các loại giấy tờ chính (chỉ áp dụng loại đang hiển thị trên form)
    for (const dt of docTypes) {
      if (dt.required && (filesByType[dt.id]?.length ?? 0) === 0) {
        newErrors[`doc_${dt.id}`] = `Vui lòng đính kèm: ${dt.name}`;
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      const firstKey = Object.keys(newErrors)[0];
      const isDoc = firstKey.startsWith('doc_');
      setSubmitError(isDoc
        ? 'Vui lòng đính kèm đầy đủ giấy tờ bắt buộc (đánh dấu *)'
        : 'Vui lòng điền đầy đủ các trường bắt buộc (đánh dấu *)');
      const anchor = isDoc ? 'field-attachments' : `field-${firstKey}`;
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const payload: Record<string, any> = { ...values, job_title: jobTitle };
      if (!hasVehicle) { payload.vehicle_plate = ''; payload.vehicle_model = ''; }
      // Nếu chưa tick BHXH thì xóa mã số khi gửi
      if (!hasSocialInsurance) { payload.social_insurance_number = ''; }
      const fd = new FormData();
      fd.append('data', JSON.stringify(payload));
      // Đính kèm theo loại — files[i] song song với fileDocTypes[i] (cùng thứ tự).
      const docTypeOrder: string[] = [];
      for (const dt of docTypes) {
        for (const f of filesByType[dt.id] ?? []) {
          fd.append('files', f);
          docTypeOrder.push(dt.id);
        }
      }
      fd.append('fileDocTypes', JSON.stringify(docTypeOrder));
      const res = await fetch('/api/public/onboarding/submit', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Nộp biểu mẫu thất bại');
      setPageState('submitted');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Nộp biểu mẫu thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  if (pageState === 'loading') {
    return (
      <Shell>
        <div className="flex flex-col items-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
          <p className="mt-3 text-sm text-muted-foreground">Đang tải biểu mẫu...</p>
        </div>
      </Shell>
    );
  }
  if (pageState === 'error' || pageState === 'closed') {
    return (
      <Shell>
        <StatusCard
          icon={<AlertTriangle className="h-10 w-10 text-amber-400" />}
          title={pageState === 'closed' ? 'Biểu mẫu tạm đóng' : 'Không tải được biểu mẫu'}
          desc={pageState === 'closed'
            ? 'Biểu mẫu hiện không nhận phản hồi. Vui lòng liên hệ bộ phận Tuyển Dụng FADO Group.'
            : 'Có lỗi khi tải biểu mẫu. Vui lòng thử lại sau hoặc liên hệ bộ phận Tuyển Dụng.'}
        />
      </Shell>
    );
  }
  if (pageState === 'submitted') {
    return (
      <Shell>
        <StatusCard
          icon={<CheckCircle2 className="h-10 w-10 text-emerald-400" />}
          title="Nộp biểu mẫu thành công!"
          desc={`Cảm ơn ${values.full_name || 'bạn'}! Thông tin đã được gửi tới bộ phận Tuyển Dụng FADO Group. Chúng tôi sẽ liên hệ với bạn qua email khi tài khoản được kích hoạt.`}
          extra={
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3">
              <Clock className="h-4 w-4 text-indigo-400 shrink-0" />
              <p className="text-xs text-indigo-300">Bước tiếp theo: Tuyển Dụng chuẩn hóa thông tin → Quản trị viên cấp tài khoản → bạn nhận thông báo chào mừng.</p>
            </div>
          }
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="rounded-3xl border border-line overflow-hidden mb-6"
        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.2))' }}>
        <div className="px-6 sm:px-8 py-7">
          <div className="flex items-center gap-2 text-2xs font-700 uppercase tracking-widest text-indigo-300 mb-2">
            <Briefcase className="h-3.5 w-3.5" /> FADO Group — Onboarding
          </div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">{title}</h1>
          <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-xl">
            {description || 'Vui lòng điền đầy đủ thông tin dưới đây để hoàn tất thủ tục nhận việc. Thông tin sẽ được bộ phận Tuyển Dụng kiểm tra trước khi kích hoạt tài khoản.'}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {sections.map(({ key, fields: sectionFields }) => (
          <section key={key} id={key === 'attachments' ? 'field-attachments' : undefined} className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="border-b border-line-subtle px-5 sm:px-6 py-4">
              <h2 className="text-base font-600 text-foreground">{SECTION_LABELS[key].title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{SECTION_LABELS[key].desc}</p>
            </div>
            <div className="p-5 sm:p-6">
              {key === 'attachments' ? (
                <AttachmentsBlock
                  docTypes={docTypes}
                  filesByType={filesByType}
                  errors={errors}
                  onAdd={addFilesForType}
                  onRemove={removeFileForType}
                  helpText={sectionFields[0]?.help_text}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {sectionFields.map(f => {
                    if (f.field_key === 'job_title') {
                      return (
                        <div key={f.id} id={`field-${f.field_key}`}>
                          <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">
                            {f.label} <span className="normal-case font-400">(tự tính)</span>
                          </label>
                          <div className="w-full h-11 px-3.5 rounded-xl text-sm flex items-center bg-surface-2 border border-dashed border-indigo-500/30 text-indigo-300">
                            {jobTitle || <span className="text-muted-foreground/50">Chọn Chức Vụ + Phòng Ban/Bộ Phận</span>}
                          </div>
                        </div>
                      );
                    }
                    if ((f.field_key === 'vehicle_plate' || f.field_key === 'vehicle_model') && !hasVehicle) {
                      return null;
                    }
                    if (f.field_key === 'social_insurance_number' && !hasSocialInsurance) {
                      return null;
                    }
                    return (
                      <div key={f.id} id={`field-${f.field_key}`}>
                        <OnboardingField
                          field={f}
                          value={values[f.field_key]}
                          org={org}
                          values={values}
                          error={errors[f.field_key]}
                          onChange={handleChange}
                        />
                      </div>
                    );
                  })}

                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-line-subtle p-5 sm:p-6" style={{ background: 'var(--card)' }}>
        {submitError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{submitError}</p>
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-12 rounded-xl text-sm font-700 text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
          style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting ? 'Đang gửi...' : 'Nộp Biểu Mẫu Nhận Việc'}
        </button>
        <p className="mt-3 text-center text-2xs text-muted-foreground">
          Thông tin của bạn được bảo mật và chỉ dùng cho mục đích quản lý nhân sự nội bộ FADO Group.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-12">
        {children}
        <p className="mt-8 text-center text-2xs text-muted-foreground/60">© 2026 FADO Group — AssetFlow Pro</p>
      </div>
    </div>
  );
}

function StatusCard({ icon, title, desc, extra }: { icon: React.ReactNode; title: string; desc: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-line px-6 py-14 flex flex-col items-center text-center" style={{ background: 'var(--card)' }}>
      {icon}
      <h1 className="mt-4 text-xl font-700 text-foreground">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{desc}</p>
      {extra}
    </div>
  );
}

function AttachmentsBlock({
  docTypes, filesByType, errors, onAdd, onRemove, helpText,
}: {
  docTypes: OnboardingDocType[];
  filesByType: Record<string, File[]>;
  errors: Record<string, string>;
  onAdd: (typeId: string, files: FileList | null) => void;
  onRemove: (typeId: string, index: number) => void;
  helpText?: string | null;
}) {
  if (docTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">Hiện chưa cấu hình loại giấy tờ đính kèm.</p>;
  }
  return (
    <div className="space-y-4">
      {helpText && <p className="text-2xs text-muted-foreground">{helpText}</p>}

      {docTypes.map((dt) => {
        const required = dt.required;
        const multi = dt.multiple;
        const list = filesByType[dt.id] ?? [];
        const err = errors[`doc_${dt.id}`];
        return (
          <div key={dt.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-500 text-foreground">
                {dt.name} {required && <span className="text-red-400">*</span>}
                {multi && <span className="ml-1 text-2xs font-400 text-muted-foreground">(có thể nhiều tệp)</span>}
              </p>
            </div>

            <label className={`flex items-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 cursor-pointer transition-colors ${
              err ? 'border-red-500/50' : 'border-line hover:border-indigo-500/40'
            }`}>
              <input
                type="file"
                multiple={multi}
                className="hidden"
                onChange={e => { onAdd(dt.id, e.target.files); e.target.value = ''; }}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              />
              <Upload className="h-4 w-4 text-indigo-400 shrink-0" />
              <span className="text-xs text-muted-foreground">
                {list.length > 0 ? (multi ? 'Thêm tệp khác' : 'Chọn tệp khác để thay') : 'Bấm để chọn tệp'}
                {dt.description ? ` — ${dt.description}` : ''}
              </span>
            </label>

            {list.length > 0 && (
              <ul className="space-y-1.5">
                {list.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-line-subtle bg-hover px-3.5 py-2">
                    <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-sm text-foreground truncate">{f.name}</p>
                      <p className="text-2xs text-muted-foreground">{formatBytes(f.size)}</p>
                    </div>
                    <button onClick={() => onRemove(dt.id, i)} className="btn-ghost rounded-lg p-1.5 text-muted-foreground hover:text-red-400" aria-label="Xóa tệp">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {err && <p className="text-2xs text-red-400">{err}</p>}
          </div>
        );
      })}

      <p className="text-2xs text-amber-400/80">
        Hồ sơ sẽ ở trạng thái <b>nháp</b> và chỉ trở thành hồ sơ nhân sự chính thức sau khi bạn được duyệt vào hệ thống. Mỗi tệp tối đa 10MB (PDF, ảnh hoặc Word).
      </p>
    </div>
  );
}
