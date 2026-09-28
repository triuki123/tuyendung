'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, AlertCircle, Package, RefreshCw, ChevronRight, ChevronLeft } from 'lucide-react';
import {
  Asset, AssetStatus,
  generateAssetCode, DIVISIONS,
} from '@/lib/mockData';
import { fetchCompanies, fetchDepartmentsByCompany, fetchSubDepartmentsByDepartment, fetchUsers } from '@/lib/api-client';
import DateInputVN from '@/components/ui/DateInputVN';
import { WARRANTY_LIFETIME_MONTHS } from '@/lib/config/systemConfig';
import SearchableSelect, { SearchableOption } from '@/components/ui/SearchableSelect';
import { useToast } from '@/context/ToastContext';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

type AssetFormValues = {
  code: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  serialNumber: string;
  status: AssetStatus;
  assignedTo: string;
  company: string;
  division: string;
  department: string;
  purchaseDate: string;
  warrantyExpiry: string;
  warrantyStatus: 'active' | 'expired' | 'none' | null;
  warrantyMonths: number | null;
  value: number;
  condition: string;
  location: string;
  notes: string;
};

interface AssetModalProps {
  mode: 'create' | 'edit';
  asset?: Asset;
  onSave: (data: Omit<Asset, 'id' | 'history'> | Asset) => void;
  onClose: () => void;
  departments: string[];
  categories: string[];
}

const STATUS_OPTIONS: { value: AssetStatus; label: string }[] = [
  { value: 'available', label: 'Sẵn sàng' },
  { value: 'assigned', label: 'Đang dùng' },
  { value: 'maintenance', label: 'Đang bảo trì' },
  { value: 'broken', label: 'Hỏng' },
  { value: 'retired', label: 'Thanh lý' },
];

interface WarrantyPeriodOption { id: string; label: string; months: number }

/** Cộng thêm N tháng vào ngày YYYY-MM-DD → trả về YYYY-MM-DD. */
function addMonthsToDate(dateStr: string, months: number): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + months);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** YYYY-MM-DD → dd/mm/yyyy để hiển thị. */
function formatDateVN(iso: string): string {
  const p = (iso || '').slice(0, 10).split('-');
  return p.length === 3 && p[0] && p[1] && p[2] ? `${p[2]}/${p[1]}/${p[0]}` : '';
}

/** Dòng chữ tự tính: ngày hết hạn, hoặc "trọn đời" khi thời hạn = 0 tháng. */
function WarrantyExpiryHint({ isLifetime, expiry }: { isLifetime: boolean; expiry: string }) {
  if (isLifetime) {
    return (
      <p className="col-span-2 text-xs text-emerald-400 font-600">
        Bảo hành trọn đời — không có ngày hết hạn.
      </p>
    );
  }
  if (!expiry) return null;
  return (
    <p className="col-span-2 text-xs text-muted-foreground">
      Hết hạn bảo hành: <span className="text-foreground font-600">{formatDateVN(expiry)}</span>
    </p>
  );
}

const CONDITION_OPTIONS = [
  { value: 'Mới', label: 'Mới' },
  { value: 'Tốt', label: 'Tốt' },
  { value: 'Tạm được', label: 'Tạm được' },
  { value: 'Cần sửa', label: 'Cần sửa' },
];

export default function AssetModal({ mode, asset, onSave, onClose, departments, categories }: AssetModalProps) {
  const toast = useToast();
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState(1);

  // Reset to step 1 when modal opens
  useEffect(() => {
    setStep(1);
  }, [mode, asset?.id]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [subDepartmentsList, setSubDepartmentsList] = useState<any[]>([]);
  const [subDepartmentsLoading, setSubDepartmentsLoading] = useState(false);
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [categoryList, setCategoryList] = useState<{ id: string; name: string }[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const defaultCat = categories[0] || '';

  const { register, handleSubmit, setValue, watch, getValues, formState: { errors } } = useForm<AssetFormValues>({
    defaultValues: asset as any ?? {
          code: generateAssetCode(defaultCat, departments[0]),
          category: '' as any,
          status: 'available',
          company: '',
          division: '',
          assignedTo: '',
          department: '',
          purchaseDate: new Date().toISOString().split('T')[0],
          warrantyExpiry: new Date(Date.now() + 3 * 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
          warrantyStatus: 'active' as const,
          warrantyMonths: 36,
          value: 0,
          condition: 'Mới',
        },
  });

  // Register các field điều khiển bằng setValue (không dùng input spread {...register}).
  // company/division/department phải controlled: option nạp async, nếu dùng register thô
  // thì giá trị pre-fill (UUID) bị mất khi option chưa kịp render → lưu hỏng.
  useEffect(() => {
    register('category', { required: 'Loại tài sản là bắt buộc' });
    register('assignedTo');
    register('company', { required: 'Công ty là bắt buộc' });
    register('division');
    register('department');
    register('warrantyStatus');
    register('warrantyMonths');
  }, [register]);

  const companyValue = watch('company');
  const divisionValue = watch('division');

  // Danh sách thời hạn bảo hành — cấu hình ở /cau-hinh-he-thong (tab "Bảo Hành Tài Sản").
  const [warrantyPeriods, setWarrantyPeriods] = useState<WarrantyPeriodOption[]>([]);
  useEffect(() => {
    fetch('/api/system-config')
      .then((r) => r.json())
      .then((j) => { if (j?.success) setWarrantyPeriods(j.data?.assetWarranty?.periods || []); })
      .catch(() => {});
  }, []);

  // "Hết Bảo Hành" và "Không Bảo Hành" đều có 2 chế độ con: biết hay không biết ngày mua.
  // Chỉ điều hướng UI, không phải giá trị lưu trực tiếp. Suy từ dữ liệu có sẵn khi mở sửa.
  const [purchaseMode, setPurchaseMode] = useState<'unknown' | 'dated'>(() => (
    (asset as any)?.purchaseDate ? 'dated' : 'unknown'
  ));

  const warrantyStatus = watch('warrantyStatus');
  const warrantyMonths = watch('warrantyMonths');
  const watchPurchaseDate = watch('purchaseDate');

  // Suy trạng thái bảo hành mặc định cho tài sản CŨ (chưa từng có warrantyStatus) khi mở sửa.
  useEffect(() => {
    if (mode !== 'edit' || !asset) return;
    if ((asset as any).warrantyStatus) return; // đã có lựa chọn rõ ràng, giữ nguyên
    const exp = (asset as any).warrantyExpiry;
    if (exp && exp >= new Date().toISOString().slice(0, 10)) {
      setValue('warrantyStatus', 'active');
    } else if (exp) {
      setValue('warrantyStatus', 'expired');
      setPurchaseMode('dated');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, asset]);

  // Có nhập ngày mua + thời hạn hay không (quyết định hiện field & tự tính ngày hết hạn).
  const hasDuration = warrantyStatus === 'active' || (warrantyStatus === 'expired' && purchaseMode === 'dated');
  // months = 0 ⇒ bảo hành TRỌN ĐỜI: không có ngày hết hạn.
  const isLifetime = warrantyMonths === WARRANTY_LIFETIME_MONTHS;

  // Tự tính ngày hết hạn khi có đủ ngày mua + thời hạn (trọn đời thì để trống).
  useEffect(() => {
    if (!hasDuration || warrantyMonths == null) return;
    if (isLifetime) { setValue('warrantyExpiry', ''); return; }
    if (!watchPurchaseDate) return;
    setValue('warrantyExpiry', addMonthsToDate(watchPurchaseDate, warrantyMonths));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDuration, isLifetime, watchPurchaseDate, warrantyMonths]);

  const today = () => new Date().toISOString().split('T')[0];

  // Đổi trạng thái/chế độ con → dọn field không còn áp dụng.
  const selectWarrantyStatus = (s: 'active' | 'expired' | 'none') => {
    setValue('warrantyStatus', s);
    if (s === 'active') {
      if (!watch('purchaseDate')) setValue('purchaseDate', today());
      if (warrantyMonths == null) setValue('warrantyMonths', warrantyPeriods[0]?.months ?? null);
    } else {
      // expired / none: mặc định về "không xác định ngày mua", người dùng tự chọn tiếp.
      setPurchaseMode('unknown');
      setValue('warrantyMonths', null);
      setValue('warrantyExpiry', '');
      setValue('purchaseDate', '');
    }
  };

  const selectPurchaseMode = (m: 'unknown' | 'dated') => {
    setPurchaseMode(m);
    if (m === 'unknown') {
      setValue('purchaseDate', '');
      setValue('warrantyMonths', null);
      setValue('warrantyExpiry', '');
    } else {
      if (!watch('purchaseDate')) setValue('purchaseDate', today());
      // Chỉ "Hết Bảo Hành" mới cần thời hạn; "Không Bảo Hành" chỉ có ngày mua.
      if (warrantyStatus === 'expired' && warrantyMonths == null) setValue('warrantyMonths', warrantyPeriods[0]?.months ?? null);
    }
  };

  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const data = await fetchCompanies();
        setCompanies(data);
      } catch (error) {
        console.error('Error loading companies:', error);
        setCompanies([]);
      } finally {
        setCompaniesLoading(false);
      }
    };
    loadCompanies();
  }, []);

  // Fetch departments when company changes
  useEffect(() => {
    if (!companyValue) {
      setDepartmentsList([]);
      setSubDepartmentsList([]);
      return;
    }

    const loadDepartments = async () => {
      setDepartmentsLoading(true);
      try {
        const data = await fetchDepartmentsByCompany(companyValue);
        setDepartmentsList(data);
      } catch (error) {
        console.error('Error loading departments:', error);
        setDepartmentsList([]);
      } finally {
        setDepartmentsLoading(false);
      }
    };
    loadDepartments();
  }, [companyValue]);

  // Fetch sub-departments when division changes
  useEffect(() => {
    if (!divisionValue) {
      setSubDepartmentsList([]);
      return;
    }

    const loadSubDepartments = async () => {
      setSubDepartmentsLoading(true);
      try {
        const data = await fetchSubDepartmentsByDepartment(divisionValue);
        setSubDepartmentsList(data);
      } catch (error) {
        console.error('Error loading sub-departments:', error);
        setSubDepartmentsList([]);
      } finally {
        setSubDepartmentsLoading(false);
      }
    };
    loadSubDepartments();
  }, [divisionValue]);

  // Tải TOÀN BỘ nhân viên 1 lần (không phụ thuộc Công ty) — phân bổ tài sản cho bất kỳ ai
  useEffect(() => {
    const loadEmployees = async () => {
      setEmployeesLoading(true);
      try {
        const employeesData = await fetchUsers();
        setEmployeesList(Array.isArray(employeesData) ? employeesData : []);
      } catch (error) {
        console.error('Error loading employees:', error);
        setEmployeesList([]);
      } finally {
        setEmployeesLoading(false);
      }
    };
    loadEmployees();
  }, []);

  // Loại tài sản: chỉ chọn từ danh mục cấu hình (quản lý ở Cấu Hình Tài Sản)
  useEffect(() => {
    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const res = await fetch('/api/asset-categories');
        const json = await res.json();
        const list = json?.success && Array.isArray(json.data)
          ? json.data.map((c: any) => ({ id: c.id, name: c.name }))
          : [];
        setCategoryList(list);
      } catch {
        setCategoryList([]);
      } finally {
        setCategoriesLoading(false);
      }
    };
    loadCategories();
  }, []);

  const categoryOptions: SearchableOption[] = categoryList.map(c => ({ value: c.id, label: c.name }));

  const watchCategory = watch('category');
  const watchDepartment = watch('department');
  const watchStatus = watch('status');

  // Lọc nhân viên theo cấp đã chọn: Công Ty → Phòng Ban → Bộ Phận
  const employeeOptions: SearchableOption[] = employeesList
    .filter((e: any) => {
      if (!companyValue || e.company_id !== companyValue) return false;
      if (divisionValue && e.department_id !== divisionValue) return false;
      if (watchDepartment && e.sub_department_id !== watchDepartment) return false;
      return true;
    })
    .map((e: any) => ({
      value: e.id,
      label: e.name || e.email || e.id,
      sublabel: [e.position || e.job_title, e.email].filter(Boolean).join(' · ') || undefined,
    }));

  // Reset nhân viên đã chọn khi công ty / phòng ban / bộ phận thay đổi
  useEffect(() => {
    // Chưa tải xong danh sách nhân viên thì KHÔNG kiểm tra — tránh xoá nhầm
    // người đã gán khi mở form sửa (lúc đó employeesList còn rỗng).
    if (employeesLoading || employeesList.length === 0) return;
    const cur = getValues('assignedTo');
    if (!cur) return;
    const stillValid = employeesList.some((e: any) => {
      if (e.id !== cur) return false;
      if (e.company_id !== companyValue) return false;
      if (divisionValue && e.department_id !== divisionValue) return false;
      if (watchDepartment && e.sub_department_id !== watchDepartment) return false;
      return true;
    });
    if (!stillValid) setValue('assignedTo', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyValue, divisionValue, watchDepartment, employeesList, employeesLoading]);

  const regenerateCode = () => {
    setValue('code', generateAssetCode(watchCategory, watchDepartment));
  };

  const canProceedToStep2 = () => {
    const fieldsToValidate = ['code', 'category', 'name', 'brand', 'serialNumber', 'condition'];
    const hasErrors = fieldsToValidate.some(field => errors[field as keyof typeof errors]);
    return !hasErrors;
  };

  const canProceedToStep3 = () => {
    const fieldsToValidate = ['status', 'company'];
    const hasErrors = fieldsToValidate.some(field => errors[field as keyof typeof errors]);
    return !hasErrors;
  };

  // Validate all required fields
  const validateRequired = () => {
    const requiredFields = {
      code: 'Mã tài sản',
      category: 'Loại tài sản',
      name: 'Tên tài sản',
      status: 'Trạng thái',
      company: 'Công ty',
    };

    const values = getValues();
    const missingFields: string[] = [];

    for (const [field, label] of Object.entries(requiredFields)) {
      const value = values[field as keyof AssetFormValues];
      if (!value || value === '' || (typeof value === 'number' && value === 0 && field !== 'value')) {
        missingFields.push(label);
      }
    }

    // Bảo hành: bắt buộc chọn 1 trong 3 trạng thái + đủ field theo từng nhánh.
    // warrantyMonths = 0 nghĩa là TRỌN ĐỜI (hợp lệ) → phải so sánh với null, không dùng falsy.
    if (!values.warrantyStatus) {
      missingFields.push('Tình trạng bảo hành');
    } else if (values.warrantyStatus === 'active') {
      if (!values.purchaseDate) missingFields.push('Ngày mua');
      if (values.warrantyMonths == null) missingFields.push('Thời hạn bảo hành');
    } else if (values.warrantyStatus === 'expired' && purchaseMode === 'dated') {
      if (!values.purchaseDate) missingFields.push('Ngày mua');
      if (values.warrantyMonths == null) missingFields.push('Thời hạn bảo hành');
    } else if (values.warrantyStatus === 'none' && purchaseMode === 'dated') {
      if (!values.purchaseDate) missingFields.push('Ngày mua');
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
    };
  };

  const onSubmit = async (data: AssetFormValues) => {
    const validation = validateRequired();
    if (!validation.isValid) {
      toast.warning(`Vui lòng điền đầy đủ các trường bắt buộc: ${validation.missingFields.join(', ')}`);
      return;
    }

    setIsSaving(true);
    try {
      const emp = employeesList.find((e: any) => e.id === data.assignedTo);
      const payload = {
        ...data,
        assignedToName: emp?.name ?? null,
        assignedTo: data.assignedTo || null,
        imageUrl: asset?.imageUrl ?? '',
        history: asset?.history ?? [],
        id: asset?.id ?? '',
      };
      markClean();
      await (onSave(payload as Asset) as unknown as Promise<void> | void);
    } finally {
      setIsSaving(false);
    }
  };

  const FIELD_CLASS = `w-full h-10 px-3 rounded-xl text-sm bg-surface-2 border border-line text-foreground placeholder:text-ink-faint focus:outline-none focus:border-indigo/60 focus:ring-1 focus:ring-indigo/20 transition-all`;
  const LABEL_CLASS = `block text-xs font-600 text-muted-foreground mb-1.5 uppercase tracking-wide`;
  const ERROR_CLASS = `flex items-center gap-1 text-xs text-red-400 mt-1`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 pt-4 sm:pt-10 overflow-y-auto fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={guardedClose} />

      <div
        className="relative w-full max-w-2xl rounded-2xl sm:rounded-3xl border border-white/08 modal-entrance mb-6 sm:mb-10"
        style={{ background: 'var(--primary)', boxShadow: 'var(--shadow-modal)' }}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/08">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-indigo-500/15">
                <Package size={20} className="text-indigo-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-700 text-foreground">
                  {mode === 'create' ? 'Thêm Tài Sản Mới' : 'Chỉnh Sửa Tài Sản'}
                </h2>
                {!mode && <p className="text-xs text-muted-foreground">{asset?.code}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={guardedClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl btn-ghost text-muted-foreground"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tabs — hiện ở cả thêm mới lẫn chỉnh sửa để điều hướng theo trang */}
          <div className="flex gap-2">
            {[
              { step: 1, label: 'Thông tin cơ bản' },
              { step: 2, label: 'Phân bổ & Trạng thái' },
              { step: 3, label: 'Tài chính & Bảo hành' },
            ].map((tab) => (
              <button
                key={tab.step}
                type="button"
                onClick={() => setStep(tab.step)}
                className={`px-3 py-2 rounded-lg text-xs font-600 transition-all ${
                  step === tab.step
                    ? 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-300'
                    : 'bg-hover border border-line text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.step}. {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => {
            // Chỉ submit ở bước cuối — các bước trước chỉ điều hướng
            if (step !== 3) {
              e.preventDefault();
              return;
            }
            handleSubmit(onSubmit as any)(e);
          }}
          onChange={markDirty}
          className="px-4 sm:px-6 py-4 sm:py-5 space-y-5"
        >
          {/* STEP 1: Thông tin cơ bản & Phân bổ */}
          {step === 1 && (
            <>
              {/* Section: Thông tin cơ bản */}
              <div>
                <p className="text-xs font-700 uppercase tracking-widest text-indigo-400 mb-4 flex items-center gap-2">
                  <span className="w-4 h-px bg-indigo-400/50" />
                  Thông Tin Cơ Bản
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Code */}
              <div className="col-span-2 sm:col-span-1">
                <label className={LABEL_CLASS}>Mã Tài Sản *</label>
                <div className="relative">
                  <input
                    {...register('code', { required: 'Mã tài sản là bắt buộc' })}
                    className={`${FIELD_CLASS} pr-10 font-mono`}
                    placeholder="AF-IT-2026-001"
                  />
                  <button
                    type="button"
                    onClick={regenerateCode}
                    title="Tạo mã tự động"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-indigo-400 transition-colors"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                {errors.code && <p className={ERROR_CLASS}><AlertCircle size={12} />{errors.code.message}</p>}
              </div>

              {/* Category — chọn từ danh mục cấu hình (thêm/bớt tại Cấu Hình Tài Sản) */}
              <div>
                <label className={LABEL_CLASS}>Loại Tài Sản *</label>
                <SearchableSelect
                  options={categoryOptions}
                  value={(watch('category') as string) || null}
                  onChange={(val) => setValue('category', val || '')}
                  placeholder="— Chọn loại tài sản —"
                  emptyText={categoriesLoading ? 'Đang tải…' : 'Chưa có loại — thêm ở Cấu Hình Tài Sản'}
                  disabled={categoriesLoading}
                />
                {errors.category && <p className={ERROR_CLASS}><AlertCircle size={12} />{errors.category.message as string}</p>}
              </div>

              {/* Name */}
              <div className="col-span-2">
                <label className={LABEL_CLASS}>Tên Tài Sản *</label>
                <input
                  {...register('name', { required: 'Tên tài sản là bắt buộc' })}
                  className={FIELD_CLASS}
                  placeholder="Dell Latitude 5540"
                />
                {errors.name && <p className={ERROR_CLASS}><AlertCircle size={12} />{errors.name.message}</p>}
              </div>

              {/* Brand */}
              <div>
                <label className={LABEL_CLASS}>Hãng Sản Xuất</label>
                <input
                  {...register('brand')}
                  className={FIELD_CLASS}
                  placeholder="Dell, Apple, HP..."
                />
              </div>

              {/* Model */}
              <div>
                <label className={LABEL_CLASS}>Model</label>
                <input
                  {...register('model')}
                  className={FIELD_CLASS}
                  placeholder="Latitude 5540"
                />
              </div>

              {/* Serial */}
              <div className="col-span-2 sm:col-span-1">
                <label className={LABEL_CLASS}>Số Serial</label>
                <input
                  {...register('serialNumber')}
                  className={`${FIELD_CLASS} font-mono`}
                  placeholder="SN-XXXXX-2026"
                />
              </div>

              {/* Condition */}
              <div>
                <label className={LABEL_CLASS}>Tình Trạng</label>
                <select {...register('condition')} className={FIELD_CLASS}>
                  <option value="">— Chọn tình trạng —</option>
                  {CONDITION_OPTIONS.map(c => <option key={`cond-${c.value}`} value={c.value}>{c.label}</option>)}
                </select>
              </div>
                </div>
              </div>
            </>
          )}

          {/* STEP 2: Phân bổ & Trạng thái */}
          {step === 2 && (
            <>
              <div>
                <p className="text-xs font-700 uppercase tracking-widest text-indigo-400 mb-4 flex items-center gap-2">
                  <span className="w-4 h-px bg-indigo-400/50" />
                  Phân Bổ & Trạng Thái
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Status */}
                <div>
                  <label className={LABEL_CLASS}>Trạng Thái *</label>
                  <select {...register('status', { required: true })} className={FIELD_CLASS}>
                    {STATUS_OPTIONS.map(s => <option key={`modal-status-${s.value}`} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                {/* Company — controlled (option nạp async, không dùng register thô) */}
                <div>
                  <label className={LABEL_CLASS}>Công Ty *</label>
                  <select
                    value={watch('company') || ''}
                    onChange={(e) => {
                      setValue('company', e.target.value, { shouldValidate: true });
                      // Đổi công ty → reset phòng ban & bộ phận cho khớp cây tổ chức
                      setValue('division', '');
                      setValue('department', '');
                    }}
                    className={FIELD_CLASS}
                    disabled={companiesLoading}
                  >
                    <option value="">— Chọn công ty —</option>
                    {companies.map(c => <option key={`modal-company-${c.id}`} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {/* Division (Phòng Ban) — controlled */}
                <div>
                  <label className={LABEL_CLASS}>Phòng Ban</label>
                  <select
                    value={watch('division') || ''}
                    onChange={(e) => {
                      setValue('division', e.target.value);
                      setValue('department', '');
                    }}
                    className={FIELD_CLASS}
                    disabled={!companyValue || departmentsLoading}
                  >
                    <option value="">— Chọn phòng ban —</option>
                    {departmentsList.map(d => <option key={`modal-div-${d.id}`} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                {/* Department (Bộ Phận) — controlled */}
                <div>
                  <label className={LABEL_CLASS}>Bộ Phận</label>
                  <select
                    value={watch('department') || ''}
                    onChange={(e) => setValue('department', e.target.value)}
                    className={FIELD_CLASS}
                    disabled={!divisionValue || subDepartmentsLoading}
                  >
                    <option value="">— Chọn bộ phận —</option>
                    {subDepartmentsList.map(d => <option key={`modal-dept-${d.id}`} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                {/* Assigned To — picker tìm kiếm, toàn bộ nhân viên, không phụ thuộc Công ty */}
                <div className="col-span-2">
                  <label className={LABEL_CLASS}>Phân Bổ Cho Nhân Viên</label>
                  <p className="text-xs text-muted-foreground/70 mb-1.5">Chỉ nhân viên thuộc công ty đã chọn · để trống nếu chưa phân bổ</p>
                  <SearchableSelect
                    options={employeeOptions}
                    value={watch('assignedTo') || null}
                    onChange={(v) => setValue('assignedTo', v || '')}
                    placeholder={companyValue ? '— Chưa phân bổ —' : '— Chọn công ty trước —'}
                    emptyText={
                      employeesLoading ? 'Đang tải nhân viên…'
                      : !companyValue ? 'Hãy chọn công ty ở trên'
                      : 'Công ty này chưa có nhân viên'
                    }
                    disabled={employeesLoading || !companyValue}
                  />
                </div>

                {/* Location */}
                <div className="col-span-2">
                  <label className={LABEL_CLASS}>Vị Trí</label>
                  <input
                    {...register('location')}
                    className={FIELD_CLASS}
                    placeholder="Tầng 4 - Phòng IT, Kho IT..."
                  />
                </div>
                </div>
              </div>
            </>
          )}

          {/* STEP 3: Tài chính & Bảo hành */}
          {step === 3 && (
            <>
              {/* Section: Tài chính */}
              <div>
                <p className="text-xs font-700 uppercase tracking-widest text-indigo-400 mb-4 flex items-center gap-2">
                  <span className="w-4 h-px bg-indigo-400/50" />
                  Thông Tin Tài Chính & Bảo Hành
                </p>

                {/* Tình trạng bảo hành — 3 lựa chọn */}
                <div className="mb-4">
                  <label className={LABEL_CLASS}>Tình Trạng Bảo Hành</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['active', 'Còn Bảo Hành'],
                      ['expired', 'Hết Bảo Hành'],
                      ['none', 'Không Bảo Hành'],
                    ] as const).map(([val, label]) => (
                      <button key={val} type="button" onClick={() => selectWarrantyStatus(val)}
                        className={`h-10 rounded-xl text-xs font-600 border transition-colors ${
                          warrantyStatus === val ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {warrantyStatus === 'active' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className={LABEL_CLASS}>Ngày Mua</label>
                      <DateInputVN
                        value={watch('purchaseDate') || ''}
                        onChange={(e) => setValue('purchaseDate', e.target.value)}
                        className={FIELD_CLASS}
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Bảo Hành Trong</label>
                      <select
                        value={warrantyMonths ?? ''}
                        onChange={(e) => setValue('warrantyMonths', Number(e.target.value))}
                        className={FIELD_CLASS}
                      >
                        <option value="">— Chọn thời hạn —</option>
                        {warrantyPeriods.map((p) => <option key={p.id} value={p.months}>{p.label}</option>)}
                      </select>
                    </div>
                    <WarrantyExpiryHint isLifetime={isLifetime} expiry={watch('warrantyExpiry')} />
                  </div>
                )}

                {(warrantyStatus === 'expired' || warrantyStatus === 'none') && (
                  <div className="mb-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ['unknown', 'Không xác định ngày mua'],
                        ['dated', warrantyStatus === 'expired' ? 'Nhập ngày mua và thời hạn' : 'Nhập ngày mua'],
                      ] as const).map(([val, label]) => (
                        <button key={val} type="button" onClick={() => selectPurchaseMode(val)}
                          className={`h-10 rounded-xl text-xs font-600 border transition-colors ${
                            purchaseMode === val ? 'border-amber-500/60 bg-amber-500/15 text-amber-300' : 'border-line text-muted-foreground hover:bg-hover'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {purchaseMode === 'dated' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={LABEL_CLASS}>Ngày Mua</label>
                          <DateInputVN
                            value={watch('purchaseDate') || ''}
                            onChange={(e) => setValue('purchaseDate', e.target.value)}
                            className={FIELD_CLASS}
                          />
                        </div>
                        {warrantyStatus === 'expired' && (
                          <div>
                            <label className={LABEL_CLASS}>Thời Hạn Bảo Hành</label>
                            <select
                              value={warrantyMonths ?? ''}
                              onChange={(e) => setValue('warrantyMonths', Number(e.target.value))}
                              className={FIELD_CLASS}
                            >
                              <option value="">— Chọn thời hạn —</option>
                              {warrantyPeriods.map((p) => <option key={p.id} value={p.months}>{p.label}</option>)}
                            </select>
                          </div>
                        )}
                        {warrantyStatus === 'expired' && (
                          <WarrantyExpiryHint isLifetime={isLifetime} expiry={watch('warrantyExpiry')} />
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4">
                  {/* Value */}
                  <div>
                    <label className={LABEL_CLASS}>Giá Trị (VND)</label>
                    <p className="text-xs text-muted-foreground/70 mb-1.5">Nhập giá trị khai báo hoặc giá mua (để trống nếu chưa có)</p>
                    <input
                      type="number"
                      {...register('value', { min: { value: 0, message: 'Giá trị phải ≥ 0' } })}
                      className={`${FIELD_CLASS} tabular-nums`}
                      placeholder="28500000"
                    />
                    {errors.value && <p className={ERROR_CLASS}><AlertCircle size={12} />{errors.value.message}</p>}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={LABEL_CLASS}>Ghi Chú</label>
                <textarea
                  {...register('notes')}
                  rows={3}
                  className={`${FIELD_CLASS} h-auto py-2.5 resize-none`}
                  placeholder="Ghi chú thêm về tài sản..."
                />
              </div>
            </>
          )}

          {/* Actions — luồng theo trang (3 bước) cho cả thêm mới lẫn chỉnh sửa */}
          <div className="flex gap-3 pt-2 border-t border-white/08">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={isSaving}
                className="flex-1 h-11 rounded-xl btn-ghost text-sm font-600 flex items-center justify-center gap-2"
              >
                <ChevronLeft size={16} />
                Quay Lại
              </button>
            )}
            <button
              type="button"
              onClick={guardedClose}
              className={`${step > 1 ? '' : 'flex-1'} h-11 rounded-xl btn-ghost text-sm font-600`}
            >
              {mode === 'create' && step === 1 ? 'Hủy bỏ' : 'Đóng'}
            </button>
            {step < 3 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setStep(step + 1);
                }}
                disabled={(step === 1 && !canProceedToStep2()) || (step === 2 && !canProceedToStep3()) || isSaving}
                className="flex-1 h-11 rounded-xl btn-accent text-sm font-600 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                Tiếp Tục
                <ChevronRight size={16} />
              </button>
            ) : (() => {
              const validation = validateRequired();
              return (
                <button
                  type="submit"
                  disabled={isSaving || !validation.isValid}
                  className={`flex-1 h-11 rounded-xl text-sm font-600 flex items-center justify-center gap-2 transition-all ${
                    !validation.isValid
                      ? 'bg-gray-600/30 text-gray-400 border border-gray-600/30 cursor-not-allowed'
                      : 'btn-accent disabled:opacity-60'
                  }`}
                  title={!validation.isValid ? `Cần điền: ${validation.missingFields.join(', ')}` : ''}
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Đang lưu...
                    </>
                  ) : (
                    <>
                      {!validation.isValid && <AlertCircle size={16} />}
                      {mode === 'create' ? 'Thêm Tài Sản' : 'Lưu Thay Đổi'}
                    </>
                  )}
                </button>
              );
            })()}
          </div>
        </form>
      </div>
    </div>
  );
}
