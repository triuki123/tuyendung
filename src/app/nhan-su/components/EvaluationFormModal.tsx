'use client';

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { EmploymentType, UserOption, createEvaluationApi, EmploymentTransition, listEmploymentTransitions } from './hrApi';
import EmployeePicker from './EmployeePicker';
import DateInputVN from '@/components/ui/DateInputVN';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useToast } from '@/context/ToastContext';

interface Props {
  empTypes: EmploymentType[];
  onClose: () => void;
  onSaved: () => void;
}

export default function EvaluationFormModal({ empTypes, onClose, onSaved }: Props) {
  const toast = useToast();
  const [employee, setEmployee] = useState<UserOption | null>(null);
  const [empTypeId, setEmpTypeId] = useState('');
  const [postEmpTypeId, setPostEmpTypeId] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [probationEndDate, setProbationEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [transitions, setTransitions] = useState<EmploymentTransition[]>([]);

  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);

  useEffect(() => { listEmploymentTransitions().then(setTransitions).catch(() => toast.error('Không tải được luồng chuyển tiếp, vui lòng thử lại')); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const evalTypes = empTypes.filter((t) => t.requires_evaluation && t.is_active);
  const allActiveTypes = empTypes.filter((t) => t.is_active);
  const selectedType = evalTypes.find((t) => t.id === empTypeId);
  const selectedPostType = allActiveTypes.find((t) => t.id === postEmpTypeId);
  // Luồng chuyển tiếp đã cấu hình cho hình thức thử việc đang chọn (from = empTypeId).
  const configuredTargets = transitions.filter((t) => t.from_employment_type_id === empTypeId && t.is_active);

  // Tự tính probation_end_date khi đổi hireDate hoặc empType
  function recalcEndDate(hd: string, typeId: string) {
    const t = evalTypes.find((e) => e.id === typeId);
    if (hd && t?.default_duration_days) {
      const d = new Date(hd);
      d.setDate(d.getDate() + t.default_duration_days);
      setProbationEndDate(d.toISOString().slice(0, 10));
    } else {
      setProbationEndDate('');
    }
  }

  function handleHireDateChange(val: string) {
    setHireDate(val);
    recalcEndDate(val, empTypeId);
  }

  function handleTypeChange(val: string) {
    setEmpTypeId(val);
    recalcEndDate(hireDate, val);
    // Điền sẵn hình thức sau đánh giá theo luồng chuyển tiếp đã cấu hình (nếu có).
    const t = transitions.find((x) => x.from_employment_type_id === val && x.is_active);
    setPostEmpTypeId(t ? t.to_employment_type_id : '');
  }

  async function handleSubmit() {
    if (!employee) { setError('Vui lòng chọn nhân viên'); return; }
    if (!empTypeId) { setError('Vui lòng chọn hình thức'); return; }
    if (!probationEndDate) { setError('Vui lòng nhập ngày kết thúc đánh giá'); return; }

    setSaving(true);
    setError('');
    try {
      await createEvaluationApi({
        employee_id: employee.id,
        employment_type_id: empTypeId,
        employment_type_name: selectedType?.name ?? null,
        post_evaluation_employment_type_id: postEmpTypeId || null,
        post_evaluation_employment_type_name: selectedPostType?.name ?? null,
        hire_date: hireDate || null,
        probation_end_date: probationEndDate,
        status: 'pending_signing',
      });
      markClean();
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tạo đánh giá');
    } finally {
      setSaving(false);
    }
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
          <h2 className="text-base font-600 text-foreground">Tạo thẻ đánh giá</h2>
          <button onClick={guardedClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Nhân viên */}
          <div className="space-y-1.5">
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">
              Nhân viên <span className="text-red-400">*</span>
            </label>
            <EmployeePicker value={employee} onChange={setEmployee} />
          </div>

          {/* Hình thức */}
          <div className="space-y-1.5">
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">
              Hình thức làm việc <span className="text-red-400">*</span>
            </label>
            <select value={empTypeId} onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              style={{ background: 'var(--input)' }}>
              <option value="">— Chọn hình thức —</option>
              {evalTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.default_duration_days ? ` (${t.default_duration_days} ngày)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Hình thức sau đánh giá */}
          <div className="space-y-1.5">
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">
              Hình thức sau đánh giá
            </label>
            {configuredTargets.length > 0 ? (
              <>
                <select value={postEmpTypeId} onChange={(e) => setPostEmpTypeId(e.target.value)}
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
                  style={{ background: 'var(--input)' }}>
                  {configuredTargets.map((t) => (
                    <option key={t.id} value={t.to_employment_type_id}>{t.to_employment_type_name}</option>
                  ))}
                </select>
                <p className="text-2xs text-indigo-400">
                  Theo luồng chuyển tiếp đã cấu hình{(() => {
                    const ct = configuredTargets.find((t) => t.to_employment_type_id === postEmpTypeId)?.contract_types ?? [];
                    return ct.length ? ` · tự sinh: ${ct.map((c) => c.name).join(', ')}` : '';
                  })()}.
                </p>
              </>
            ) : (
              <>
                <select value={postEmpTypeId} onChange={(e) => setPostEmpTypeId(e.target.value)}
                  className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
                  style={{ background: 'var(--input)' }}>
                  <option value="">— Chưa xác định (mặc định: Chính thức) —</option>
                  {allActiveTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="text-2xs text-muted-foreground">Hình thức nhân viên sẽ được chuyển sang khi đánh giá ĐẠT. (Chưa cấu hình luồng chuyển tiếp cho hình thức này.)</p>
              </>
            )}
          </div>

          {/* Ngày bắt đầu */}
          <div className="space-y-1.5">
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Ngày bắt đầu làm việc</label>
            <DateInputVN value={hireDate} onChange={(e) => handleHireDateChange(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              style={{ background: 'var(--input)' }} />
          </div>

          {/* Ngày kết thúc */}
          <div className="space-y-1.5">
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">
              Ngày kết thúc đánh giá <span className="text-red-400">*</span>
            </label>
            <DateInputVN value={probationEndDate} onChange={(e) => setProbationEndDate(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              style={{ background: 'var(--input)' }} />
            {selectedType?.default_duration_days && hireDate && (
              <p className="text-2xs text-muted-foreground">
                Mặc định: {selectedType.default_duration_days} ngày. Có thể chỉnh sửa lại ngày.
              </p>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button onClick={guardedClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={handleSubmit} disabled={saving}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white flex items-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Tạo đánh giá
          </button>
        </div>
      </div>
    </div>
  );
}
