'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X, FileText } from 'lucide-react';
import MoneyInput from '@/components/ui/MoneyInput';
import { createCvWithDup, CvItem, extractCvCandidateData } from '@/lib/api/onboardingApi';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { CV_SOURCES, DEFAULT_INDUSTRIES, normalizeCvSource } from './candidateShared';
import CandidateCriteriaFields from './CandidateCriteriaFields';
import CandidateEducationField from './CandidateEducationField';
import CandidateExtractionReport from './CandidateExtractionReport';
import { CV_IMPORT_FIELDS, cvExtractionFormValues } from '@/lib/cvImport';
import type { CvImportField, ExtractedCvCandidateData } from '@/lib/cvImport';
import { inferIndustryFromCandidate } from '@/lib/cvIndustry';
import { CV_WORK_TYPES, CV_GENDERS, CV_JOB_SEARCH_STATUSES, CV_EDUCATION_LEVELS, inferCvEducationDegree } from '@/lib/cvFilters';

const inputCls = 'candidate-add-field w-full h-10 px-3 rounded-xl text-sm text-foreground border focus:outline-none';
const labelCls = 'text-2xs font-600 text-muted-foreground uppercase tracking-wider';

/** Modal thêm ứng viên — đầy đủ trường ATS. Có file → hệ thống tự gợi ý kỹ năng & số năm KN. */
export interface CandidateImportDraft {
  name?: string; email?: string; phone?: string; title?: string; industry?: string;
  skills?: string; note?: string; location?: string; source_site?: string; source_url?: string;
}

type BatchEntry = {
  file: File;
  values: Record<CvImportField, string>;
  manualFields: CvImportField[];
  data?: ExtractedCvCandidateData;
  error?: string;
};

export default function CandidateAddModal({ onClose, onCreated, onCreatedMany, initialIndustry = '', initialDraft }: { onClose: () => void; onCreated: (cv: CvItem) => void; onCreatedMany?: (cvs: CvItem[]) => void; initialIndustry?: string; initialDraft?: CandidateImportDraft | null }) {
  const toast = useToast();
  const savedBatch = useRef<CvItem[]>([]);
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(() => {
    if (savedBatch.current.length) {
      (onCreatedMany || ((items: CvItem[]) => items.forEach(onCreated)))(savedBatch.current);
      savedBatch.current = [];
    }
    onClose();
  });
  const [form, setForm] = useState({
    candidate_name: initialDraft?.name || '', candidate_email: initialDraft?.email || '', candidate_phone: initialDraft?.phone || '', position_applied: initialDraft?.title || '', industry: initialDraft?.industry || initialIndustry,
    current_title: initialDraft?.title || '', source: normalizeCvSource(initialDraft?.source_site), location: initialDraft?.location || '', education_level: '', expected_salary: '',
    years_experience: '', skills: initialDraft?.skills || '', languages: '', tags: '', note: initialDraft?.note || (initialDraft?.source_url ? `Hồ sơ gốc: ${initialDraft.source_url}` : ''),
    gender: '', date_of_birth: '', employment_type: '', job_search_status: '', education_degree: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [batchEntries, setBatchEntries] = useState<BatchEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ExtractedCvCandidateData | null>(null);
  const request = useRef<{ id: number; controller?: AbortController }>({ id: 0 });
  const manualFields = useRef(new Set<string>(initialDraft ? Object.entries({ candidate_name: initialDraft.name, candidate_email: initialDraft.email,
    candidate_phone: initialDraft.phone, position_applied: initialDraft.title, current_title: initialDraft.title, industry: initialDraft.industry,
    skills: initialDraft.skills, location: initialDraft.location }).filter(([, value]) => value).map(([key]) => key) : []));
  useEffect(() => () => { request.current.id++; request.current.controller?.abort(); }, []);
  const close = () => { if (!saving) void guardedClose(); };
  useEscapeKey(close);
  const setValue = (key: keyof typeof form, value: string) => {
    const degreeWasManual = manualFields.current.has('education_degree');
    manualFields.current.add(key); markDirty();
    setForm(current => ({ ...current, [key]: value,
      ...((key === 'position_applied' || key === 'languages') && !manualFields.current.has('industry') ? { industry: inferIndustryFromCandidate(key === 'position_applied' ? value : current.position_applied, key === 'languages' ? value : current.languages) || '' } : {}),
      ...(key === 'education_level' && !degreeWasManual && inferCvEducationDegree(value) ? { education_degree: inferCvEducationDegree(value)! } : {}) }));
  };
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(key, event.target.value);

  const onFilesChange = async (fileList: FileList | null) => {
    const selected = Array.from(fileList || []);
    if (selected.length > 30) { setError('Vui lòng tải tối đa 30 CV mỗi lượt.'); return; }
    if (savedBatch.current.length) { setError('Hãy lưu hoặc đóng lượt CV hiện tại trước khi chọn tệp mới.'); return; }
    request.current.controller?.abort();
    const controller = new AbortController(), id = ++request.current.id;
    request.current.controller = controller;
    setError(''); setReport(null); setBatchEntries([]); setFile(selected.length === 1 ? selected[0] : null);
    setForm(current => ({ ...current, ...Object.fromEntries(Object.keys(CV_IMPORT_FIELDS)
      .filter(key => !manualFields.current.has(key)).map(key => [key, key === 'industry' && !selected.length ? initialIndustry : ''])) }));
    if (!selected.length) { setExtracting(false); return; }
    markDirty(); setExtracting(true);
    const empty = () => Object.fromEntries(Object.keys(CV_IMPORT_FIELDS).map(key => [key, ''])) as Record<CvImportField, string>;
    if (selected.length > 1) setBatchEntries(selected.map(item => ({ file: item, values: empty(), manualFields: [] })));
    try {
      for (const item of selected) {
        if (id !== request.current.id) return;
        try {
          if (item.size > 20 * 1024 * 1024) throw new Error('Tệp CV tối đa 20MB.');
          const data = await extractCvCandidateData(item, controller.signal);
          if (id !== request.current.id) return;
          const values = cvExtractionFormValues(data);
          if (selected.length === 1) {
            setReport(data);
            setForm(current => ({ ...current, ...Object.fromEntries(Object.entries(values).filter(([key]) => !manualFields.current.has(key))),
              ...(!manualFields.current.has('industry') ? { industry: data.industry || inferIndustryFromCandidate(manualFields.current.has('position_applied') ? current.position_applied : data.position_applied, manualFields.current.has('languages') ? current.languages : data.languages) || '' } : {}) }));
          } else setBatchEntries(entries => entries.map(entry => {
            if (entry.file !== item) return entry;
            const merged = { ...values, ...Object.fromEntries(entry.manualFields.map(key => [key, entry.values[key]])) };
            if (!entry.manualFields.includes('industry')) merged.industry = data.industry || inferIndustryFromCandidate(merged.position_applied, merged.languages) || '';
            return { ...entry, data, values: merged };
          }));
        } catch (error) {
          if (id !== request.current.id || controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : 'Không thể đọc CV';
          if (selected.length === 1) setError(message);
          else setBatchEntries(entries => entries.map(entry => entry.file === item ? { ...entry, error: message } : entry));
        }
      }
    } finally { if (id === request.current.id) setExtracting(false); }
  };

  const updateBatch = (file: File, key: CvImportField, value: string) => {
    markDirty();
    setBatchEntries(entries => entries.map(entry => entry.file !== file ? entry : {
      ...entry, manualFields: [...new Set([...entry.manualFields, key])],
      values: { ...entry.values, [key]: value, ...((key === 'position_applied' || key === 'languages') && !entry.manualFields.includes('industry') ? { industry: inferIndustryFromCandidate(key === 'position_applied' ? value : entry.values.position_applied, key === 'languages' ? value : entry.values.languages) || '' } : {}) },
    }));
  };

  const handleSave = async () => {
    if (saving || extracting) return;
    setSaving(true); setError('');
    try {
      if (batchEntries.length) {
        const failed: BatchEntry[] = [];
        for (const entry of batchEntries) {
          if (!entry.values.candidate_name.trim()) { failed.push({ ...entry, error: 'Cần nhập tên ứng viên trước khi lưu.' }); continue; }
          const fd = new FormData();
          Object.entries(entry.values).forEach(([key, value]) => fd.append(key, value));
          fd.append('manual_fields', JSON.stringify(entry.manualFields));
          fd.append('industry_mode', entry.manualFields.includes('industry') ? 'manual' : 'auto');
          fd.append('source', 'Khác'); fd.append('file', entry.file);
          try {
            const { cv, duplicates } = await createCvWithDup(fd);
            savedBatch.current.push(cv);
            if (duplicates.length) toast.warning(`Hồ sơ ${cv.candidate_name} trùng email hoặc số điện thoại với hồ sơ đã có. Vui lòng kiểm tra.`);
          } catch (error) { failed.push({ ...entry, error: error instanceof Error ? error.message : 'Không thể lưu CV' }); }
        }
        if (failed.length) {
          setBatchEntries(failed);
          setError(`Đã lưu ${savedBatch.current.length} CV. Còn ${failed.length} CV cần kiểm tra. Lần lưu tiếp theo chỉ xử lý những CV chưa lưu.`);
          return;
        }
        markClean();
        const created = [...savedBatch.current]; savedBatch.current = [];
        (onCreatedMany || ((items: CvItem[]) => items.forEach(onCreated)))(created);
        return;
      }
      if (!form.candidate_name.trim()) { setError('Thiếu tên ứng viên'); return; }
      const fd = new FormData();
      Object.entries(form).forEach(([key, value]) => fd.append(key, value));
      fd.append('manual_fields', JSON.stringify([...manualFields.current].filter(key => key in CV_IMPORT_FIELDS)));
      fd.append('industry_mode', manualFields.current.has('industry') ? 'manual' : 'auto');
      if (!form.source) fd.set('source', 'Khác');
      if (file) fd.append('file', file);
      const { cv, duplicates } = await createCvWithDup(fd);
      if (duplicates.length) toast.warning(`Đã lưu hồ sơ. Email hoặc số điện thoại trùng với ${duplicates.map(item => item.candidate_name).join(', ')}. Vui lòng kiểm tra.`);
      markClean(); onCreated(cv);
    } catch (error) { setError(error instanceof Error ? error.message : 'Không thể lưu ứng viên'); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.32)' }} onClick={close}>
      <div className="candidate-add-modal w-full max-w-lg rounded-3xl border border-line overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="candidate-add-heading" style={{ background: 'var(--card)' }} onChange={markDirty} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <h2 id="candidate-add-heading" className="text-base font-700 text-foreground">Thêm Ứng Viên</h2>
          <button onClick={close} disabled={saving} aria-label="Đóng thêm ứng viên" className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        <fieldset disabled={saving} className="p-6 space-y-3.5 max-h-[70vh] overflow-y-auto min-w-0">
          <label className="candidate-add-upload flex items-center gap-2.5 rounded-xl border border-dashed border-line px-3.5 py-3 cursor-pointer">
            <input aria-label="Tải tệp CV" type="file" multiple className="hidden" accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,.txt" disabled={saving || savedBatch.current.length > 0} onChange={(event) => { void onFilesChange(event.target.files); event.target.value = ''; }} />
            <FileText className="h-5 w-5 text-indigo-400 shrink-0" />
            <span className="text-sm text-muted-foreground truncate">{batchEntries.length ? `Đã chọn ${batchEntries.length} CV` : file ? file.name : 'Tải CV để tự điền thông tin và phân loại ngành nghề'}</span>
          </label>
          <p className="text-xs text-muted-foreground">PDF, DOCX, ảnh hoặc TXT · tối đa 20MB/tệp. Thông tin chỉ được lưu khi bấm Lưu ứng viên.</p>
          {extracting && <p role="status" className="flex items-center gap-2 text-xs text-foreground"><Loader2 className="h-4 w-4 animate-spin" />Đang đọc CV và điền thông tin…</p>}
          {report && <CandidateExtractionReport data={report} values={form} manualFields={[...manualFields.current]} />}
          {batchEntries.length > 0 ? <div className="space-y-3"><p className="text-xs text-muted-foreground">Mỗi tệp có thông tin và thư mục riêng, không dùng chung dữ liệu ứng viên.</p>
            {batchEntries.map((entry, index) => <details key={`${entry.file.name}-${entry.file.lastModified}-${index}`} className="cv-batch-entry" data-batch-file={entry.file.name}>
            <summary title={entry.file.name}>{entry.file.name}<span>{entry.values.candidate_name || 'Chưa nhận diện tên'} · {entry.values.position_applied || 'Cần xác nhận vị trí'} · {entry.values.industry || 'Chưa phân loại'}</span></summary>
              {entry.error && <p role="alert" className="text-xs text-red-600 mt-3">{entry.error}</p>}
              {entry.data && <CandidateExtractionReport data={entry.data} values={entry.values} manualFields={entry.manualFields} />}
              <div className="grid grid-cols-2 gap-3 mt-3">{(Object.entries(CV_IMPORT_FIELDS) as [CvImportField, string][]).map(([key, label]) => {
                const options = key === 'education_degree' ? CV_EDUCATION_LEVELS.map(value => [value, value]) : key === 'gender' ? CV_GENDERS : key === 'employment_type' ? CV_WORK_TYPES : key === 'job_search_status' ? CV_JOB_SEARCH_STATUSES : null;
                return <label key={key} className={key === 'education_level' || key === 'skills' ? 'col-span-2' : ''}><span className="block text-xs text-muted-foreground mb-1">{label}</span>
                  {options ? <select aria-label={label} className={inputCls} value={entry.values[key]} onChange={event => updateBatch(entry.file, key, event.target.value)}><option value="">Chưa có thông tin</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
                    : key === 'education_level' ? <textarea aria-label={label} className={`${inputCls} h-auto py-2`} rows={2} value={entry.values[key]} onChange={event => updateBatch(entry.file, key, event.target.value)} />
                    : key === 'years_experience' ? <div className="relative"><input aria-label={label} className={`${inputCls} pr-12`} type="number" min="0" step="0.1" value={entry.values[key]} onChange={event => updateBatch(entry.file, key, event.target.value)} /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-600 text-muted-foreground">Năm</span></div>
                    : <input aria-label={label} className={inputCls} type={key === 'date_of_birth' ? 'date' : key === 'expected_salary' ? 'number' : 'text'} min="0" step="1" value={entry.values[key]} onChange={event => updateBatch(entry.file, key, event.target.value)} />}
                </label>;
              })}</div>
            </details>)}
          </div> : <>
          <input className={inputCls} placeholder="Tên ứng viên *" value={form.candidate_name} onChange={set('candidate_name')} />
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Email" value={form.candidate_email} onChange={set('candidate_email')} />
            <input className={inputCls} placeholder="SĐT" value={form.candidate_phone} onChange={set('candidate_phone')} />
          </div>
          <div>
            <label className={labelCls}>Thư mục ngành nghề</label>
            <input className={`${inputCls} mt-1`} list="cv-industry-options" placeholder="Để trống để tự phân loại theo vị trí ứng tuyển" value={form.industry} onChange={set('industry')} />
            <datalist id="cv-industry-options">{DEFAULT_INDUSTRIES.map((item) => <option key={item} value={item} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Vị trí ứng tuyển" value={form.position_applied} onChange={set('position_applied')} />
            <input className={inputCls} placeholder="Chức danh hiện tại" value={form.current_title} onChange={set('current_title')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <input className={`${inputCls} pr-12`} type="number" min="0" step="0.5" placeholder="Số năm kinh nghiệm" value={form.years_experience} onChange={set('years_experience')} />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-600 text-muted-foreground">Năm</span>
            </div>
            <select aria-label="Nguồn CV" className={inputCls} value={form.source} onChange={event => setValue('source', event.target.value)}>
              {CV_SOURCES.map(source => <option key={source} value={source}>{source}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Kỹ năng (phân cách bằng dấu phẩy)</label>
            <input className={`${inputCls} mt-1`} placeholder="Excel, SQL, Kế toán giá thành..." value={form.skills} onChange={set('skills')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Ngoại ngữ (Tiếng Anh...)" value={form.languages} onChange={set('languages')} />
            <input className={inputCls} placeholder="Khu vực / nơi ở" value={form.location} onChange={set('location')} />
          </div>
          <CandidateCriteriaFields values={form} fieldClass={inputCls} onChange={setValue} />
          <div className="grid grid-cols-2 gap-3">
            <textarea className={`${inputCls} h-auto min-h-10 py-2 resize-y`} rows={2} placeholder="Học vấn / Trường đại học" value={form.education_level} onChange={set('education_level')} />
            <MoneyInput className={inputCls} placeholder="Lương mong muốn (VND)" value={form.expected_salary} onValueChange={value => setValue('expected_salary', value ? String(value) : '')} />
          </div>
          <CandidateEducationField value={form.education_degree} fieldClass={inputCls} onChange={value => setValue('education_degree', value)} />
          <input className={inputCls} placeholder="Tags (tự do, phân cách phẩy)" value={form.tags} onChange={set('tags')} />
          <textarea className="candidate-add-field w-full px-3 py-2 rounded-xl text-sm text-foreground border focus:outline-none resize-none" rows={2} placeholder="Ghi chú" value={form.note} onChange={set('note')} />

          </>}
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        </fieldset>

        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button onClick={close} disabled={saving} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={handleSave} disabled={saving || extracting || (batchEntries.length === 0 && !form.candidate_name.trim())} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {batchEntries.length ? `Lưu ${batchEntries.length} ứng viên` : 'Lưu ứng viên'}
          </button>
        </div>
      </div>
    </div>
  );
}
