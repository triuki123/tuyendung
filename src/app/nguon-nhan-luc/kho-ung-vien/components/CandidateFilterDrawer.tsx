'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Info, Loader2, Plus, X } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { getCvFilterOptions } from '@/lib/api/onboardingApi';
import { CV_EDUCATION_LEVELS, CV_TIME_RANGES, CV_GENDERS, CV_JOB_SEARCH_STATUSES, CV_WORK_TYPES, countCvFilters, parseCvAdvancedFilter } from '@/lib/cvFilters';
import type { CvAdvancedFilter, CvFilterOptions } from '@/lib/cvFilters';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const sections = [
  ['experience', 'Kinh nghiệm'], ['work', 'Hình thức làm việc'], ['gender', 'Giới tính'],
  ['languages', 'Ngôn ngữ'], ['salary', 'Mức lương'], ['age', 'Giới hạn tuổi'],
  ['job', 'Trạng thái tìm việc'],
] as const;
type Section = typeof sections[number][0];

export default function CandidateFilterDrawer({ applied, industry, industries, requisitions, onApply, onClose }: {
  applied: CvAdvancedFilter; industry: string; industries: string[];
  requisitions: { id: string; title: string }[];
  onApply: (filter: CvAdvancedFilter, industry: string) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<CvAdvancedFilter>({ sortBy: 'uploaded', ...applied });
  const [draftIndustry, setDraftIndustry] = useState(industry);
  const [open, setOpen] = useState<Section | null>(null);
  const [options, setOptions] = useState<CvFilterOptions>({ industries, skills: [], languages: [], educationLevels: [] });
  const [loading, setLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ filter: CvAdvancedFilter; industry: string } | null>(null);
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const savedKey = `recruitment-cv-filter:${getCurrentUser()?.id || 'local'}`;
  useEscapeKey(onClose);

  async function loadOptions() {
    setLoading(true); setOptionsError('');
    try { setOptions(await getCvFilterOptions()); }
    catch { setOptionsError('Không tải được tiêu chí từ Kho CV.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void loadOptions();
    try {
      const value = JSON.parse(localStorage.getItem(savedKey) || 'null');
      if (value && typeof value.industry === 'string') setSaved({ filter: parseCvAdvancedFilter(value.filter), industry: value.industry });
    } catch { /* An invalid preset must not affect actual CV results. */ }
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof CvAdvancedFilter>(key: K, value: CvAdvancedFilter[K]) => {
    setDraft(current => ({ ...current, [key]: value })); setError(''); setNotice('');
  };
  const toggle = (key: 'employmentTypes' | 'languages' | 'educationLevels' | 'jobSearchStatuses' | 'skills', value: string) =>
    set(key, draft[key]?.includes(value) ? draft[key]!.filter(item => item !== value) : [...(draft[key] || []), value]);
  const choices = (key: 'employmentTypes' | 'languages' | 'educationLevels' | 'jobSearchStatuses' | 'skills', values: ReadonlyArray<readonly [string, string]>) =>
    values.length ? <div className={`cv-filter-choices ${key === 'educationLevels' ? 'cv-filter-education-choices' : ''}`}>{values.map(([value, label]) => <label key={value}>
      <input type="checkbox" checked={draft[key]?.includes(value) || false} onChange={() => toggle(key, value)} />{label}
    </label>)}</div> : <p className="cv-filter-help">{loading ? 'Đang lấy tiêu chí từ Kho CV…' : 'Kho CV chưa có thông tin cho tiêu chí này.'}</p>;
  const range = (min: 'minExperience' | 'minSalary' | 'minAge', max: 'maxExperience' | 'maxSalary' | 'maxAge', label: string, unit: string) =>
    <div><p className="cv-filter-help">{unit}</p><div className="cv-filter-range">
      <input aria-label={`${label} từ`} type="number" min="0" max={min === 'minAge' ? 100 : min === 'minExperience' ? 80 : 1e12}
        step={min === 'minExperience' ? '0.5' : '1'} placeholder="Từ" value={draft[min] ?? ''}
        onChange={event => set(min, event.target.value === '' ? undefined : Number(event.target.value))} />
      <span>–</span>
      <input aria-label={`${label} đến`} type="number" min="0" max={max === 'maxAge' ? 100 : max === 'maxExperience' ? 80 : 1e12}
        step={max === 'maxExperience' ? '0.5' : '1'} placeholder="Đến" value={draft[max] ?? ''}
        onChange={event => set(max, event.target.value === '' ? undefined : Number(event.target.value))} />
    </div></div>;
  function validate() {
    try { const filter = parseCvAdvancedFilter(draft); setError(''); return filter; }
    catch (error) { setError(error instanceof Error ? error.message : 'Bộ lọc không hợp lệ'); return null; }
  }
  function save() {
    const filter = validate(); if (!filter) return;
    try { const preset = { filter, industry: draftIndustry }; localStorage.setItem(savedKey, JSON.stringify(preset)); setSaved(preset); setNotice('Đã lưu bộ lọc trên máy này.'); }
    catch { setError('Không lưu được bộ lọc trên trình duyệt này.'); }
  }

  return <div className="cv-filter-overlay" onClick={onClose}>
    <aside ref={dialog} role="dialog" aria-modal="true" aria-labelledby="cv-filter-heading" className="cv-filter-drawer" onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]')).filter(element => element.getClientRects().length);
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <header><h2 id="cv-filter-heading">Bộ lọc</h2><button type="button" aria-label="Đóng bộ lọc" onClick={onClose}><X size={24} /></button></header>
      <div className="cv-filter-body">
        <div className="cv-filter-select-wrap"><select aria-label="Ngành nghề" value={draftIndustry} onChange={event => setDraftIndustry(event.target.value)}>
          <option value="*">Tất cả ngành nghề</option><option value="">Chưa phân loại</option>
          {[...new Set([...industries, ...options.industries, ...(draftIndustry && draftIndustry !== '*' ? [draftIndustry] : [])])].sort((a, b) => a.localeCompare(b, 'vi')).map(value => <option key={value}>{value}</option>)}
        </select><ChevronDown size={16} /></div>
        <fieldset className="cv-filter-time"><legend>Lọc danh sách theo <span title="Tải CV lên: thời điểm hồ sơ được đưa vào Kho CV, không đổi khi sửa thông tin. Cập nhật CV: lần chỉnh sửa thông tin CV." aria-label="Giải thích thời gian lọc"><Info size={15} /></span></legend>
          {(['uploaded', 'updated'] as const).map(value => {
            const selected = value === 'updated' ? draft.sortBy === value : draft.sortBy !== 'updated';
            return <div className="cv-filter-time-option" key={value} data-time-option={value}>
              <label><input type="radio" name="cv-time" checked={selected} aria-controls={selected ? 'cv-filter-time-range' : undefined}
                onChange={() => set('sortBy', value)} />{value === 'uploaded' ? 'Thời gian tải CV lên' : 'Thời gian cập nhật CV'}</label>
              {selected && <div id="cv-filter-time-range" className="cv-filter-select-wrap cv-filter-time-range"><select aria-label="Khoảng thời gian" value={draft.updatedWithinDays ?? ''}
                onChange={event => set('updatedWithinDays', event.target.value ? Number(event.target.value) : undefined)}>
                {CV_TIME_RANGES.map(([days, label]) => <option key={days} value={days}>{label}</option>)}
              </select><ChevronDown size={16} /></div>}
            </div>;
          })}
        </fieldset>
        <section className="cv-filter-advanced"><h3>Các yêu cầu nâng cao</h3><div className="cv-filter-links">
          {[[0, 1], [2, 3, 4], [5, 6]].map((group, row) => <div className="cv-filter-group" key={row}>
          <div className="cv-filter-link-row">{group.map(index => {
            const [key, label] = sections[index];
            return <button type="button" key={key} id={`cv-filter-trigger-${key}`} aria-expanded={open === key} aria-controls={`cv-filter-${key}`}
            onClick={() => setOpen(current => current === key ? null : key)}>
            <Plus size={16} />{label}{key === 'job' && <span className="cv-filter-new">Mới</span>}
          </button>;
          })}</div>
        {group.map(index => sections[index]).filter(([key]) => open === key).map(([key, label]) => <div className="cv-filter-section" id={`cv-filter-${key}`} key={key} role="region" aria-labelledby={`cv-filter-trigger-${key}`}>
          <div className="cv-filter-section-heading"><h4>{label}</h4><button type="button" aria-label={`Đóng tiêu chí ${label}`} onClick={() => {
            setOpen(null); dialog.current?.querySelector<HTMLButtonElement>(`#cv-filter-trigger-${key}`)?.focus();
          }}><X size={16} /></button></div>
          {key === 'experience' && range('minExperience', 'maxExperience', 'Kinh nghiệm', 'Số năm kinh nghiệm')}
          {key === 'salary' && range('minSalary', 'maxSalary', 'Mức lương', 'Lương mong muốn / tháng (VNĐ)')}
          {key === 'age' && range('minAge', 'maxAge', 'Độ tuổi', 'Tuổi được tính từ ngày sinh đã nhập')}
          {key === 'work' && choices('employmentTypes', CV_WORK_TYPES)}
          {key === 'gender' && <div className="cv-filter-select-wrap"><select aria-label="Giới tính" value={draft.gender || ''} onChange={event => set('gender', event.target.value || undefined)}>
            <option value="">Không yêu cầu</option>{CV_GENDERS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select><ChevronDown size={16} /></div>}
          {key === 'languages' && choices('languages', options.languages.map(value => [value, value]))}
          {key === 'job' && choices('jobSearchStatuses', CV_JOB_SEARCH_STATUSES)}
        </div>)}
          </div>)}
        </div>
        </section>
        <label className="cv-filter-unviewed"><input type="checkbox" checked={draft.onlyUnviewed || false} onChange={event => set('onlyUnviewed', event.target.checked)} />Chỉ hiện hồ sơ chưa xem</label>
        <details className="cv-filter-extra"><summary>Thông tin bổ sung</summary>
          <h4>Bằng cấp</h4>{choices('educationLevels', CV_EDUCATION_LEVELS.map(value => [value, value]))}
          <h4>Kỹ năng (cần có tất cả)</h4>{choices('skills', options.skills.map(value => [value, value]))}
          <label>Đánh giá tối thiểu<div className="cv-filter-select-wrap"><select aria-label="Đánh giá tối thiểu" value={draft.minRating || ''} onChange={event => set('minRating', event.target.value ? Number(event.target.value) : undefined)}>
            <option value="">Không yêu cầu</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} / 5</option>)}
          </select><ChevronDown size={16} /></div></label>
          <label>Theo yêu cầu tuyển dụng<div className="cv-filter-select-wrap"><select aria-label="Theo yêu cầu tuyển dụng" value={draft.requisitionId || ''} onChange={event => set('requisitionId', event.target.value || undefined)}>
            <option value="">Tất cả yêu cầu</option>{requisitions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select><ChevronDown size={16} /></div></label>
        </details>
        {loading && <p className="cv-filter-help cv-filter-loading"><Loader2 size={14} className="animate-spin" />Đang lấy tiêu chí từ Kho CV…</p>}
        {optionsError && <p role="alert" className="cv-filter-error">{optionsError} <button onClick={loadOptions}>Thử lại</button></p>}
        {saved && <button className="cv-filter-load" onClick={() => { setDraft(saved.filter); setDraftIndustry(saved.industry); setNotice('Đã nạp bộ lọc đã lưu. Bấm Áp dụng để lọc danh sách.'); }}>Dùng bộ lọc đã lưu</button>}
        {(countCvFilters(draft) > 0 || draftIndustry !== industry) && <button className="cv-filter-reset" onClick={() => { setDraft({ sortBy: 'uploaded' }); setDraftIndustry(industry); setError(''); }}>Xóa tiêu chí</button>}
        {error && <p role="alert" className="cv-filter-error">{error}</p>}
        {notice && <p role="status" className="cv-filter-help">{notice}</p>}
      </div>
      <footer><button className="cv-filter-save" disabled={!countCvFilters(draft) && draftIndustry === industry} onClick={save}>Lưu bộ lọc</button>
        <button className="cv-filter-apply" onClick={() => { const filter = validate(); if (filter) onApply(filter, draftIndustry); }}>Áp dụng</button></footer>
    </aside>
  </div>;
}
