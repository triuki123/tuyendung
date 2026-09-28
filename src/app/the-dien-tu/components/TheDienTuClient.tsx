'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Save, ExternalLink, Plus, X, Eye, EyeOff, QrCode, Copy, Check,
  Sparkles, Award, Briefcase, GraduationCap, BadgeCheck, FolderGit2, IdCard, Contact,
  ImagePlus, GripVertical, ListOrdered, ImageIcon, TrendingUp, Layers, Users2, Quote,
  Search, ChevronDown, MapPin,
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { generateQRCodeDataUrl } from '@/lib/vcard';
import { useToast } from '@/context/ToastContext';
import { getCurrentUser } from '@/lib/authStore';
import { hasModuleAccess } from '@/lib/permissions';

type Row = Record<string, any>;
interface Ecard {
  slug: string;
  qr_mode: 'contact' | 'profile';
  is_public: boolean;
  headline: string;
  bio: string;
  theme: string;
  template: string;
  cover_url: string;
  cover_position: number;
  skills: string[];
  experiences: Row[];
  education: Row[];
  certifications: Row[];
  projects: Row[];
  highlights: Row[];
  expertise: Row[];
  clients: Row[];
  testimonials: Row[];
  locations: Row[];
  socials: Record<string, string>;
  visibility: Record<string, boolean>;
  section_order: string[];
  view_count: number;
  // Chỉ dùng cho hồ sơ DOANH NGHIỆP (ghi đè tên/logo hiển thị; null = lấy từ công ty).
  display_name?: string;
  logo_url?: string;
}

interface Person { id: string; name: string; email?: string; avatar?: string; position?: string }
interface CompanyRow { company_id: string; company_name: string; company_logo?: string | null; variant_count: number }

const THEMES = [
  { id: 'indigo', hex: '#4f46e5' }, { id: 'sky', hex: '#0ea5e9' }, { id: 'emerald', hex: '#10b981' },
  { id: 'teal', hex: '#14b8a6' }, { id: 'rose', hex: '#f43f5e' }, { id: 'amber', hex: '#f59e0b' },
  { id: 'orange', hex: '#f97316' }, { id: 'violet', hex: '#8b5cf6' }, { id: 'fuchsia', hex: '#d946ef' },
  { id: 'slate', hex: '#334155' },
];
const TEMPLATES = [
  { id: 'aurora', name: 'Aurora', desc: 'Gradient hero, thẻ kính — hiện đại, năng động' },
  { id: 'executive', name: 'Executive', desc: 'Nền tối, nhấn vàng — sang trọng, lãnh đạo' },
  { id: 'editorial', name: 'Editorial', desc: 'Nền trắng, chữ lớn — thanh lịch, tối giản' },
  { id: 'bento', name: 'Bento', desc: 'Lưới thẻ nhiều màu — trẻ trung, sinh động' },
];
const SOCIAL_FIELDS = ['website', 'linkedin', 'facebook', 'twitter', 'instagram', 'youtube', 'zalo', 'telegram'];
const SECTION_LABELS: Record<string, string> = {
  bio: 'Giới thiệu', highlights: 'Điểm nổi bật', expertise: 'Lĩnh vực chuyên môn',
  projects: 'Dự án tiêu biểu', clients: 'Khách hàng / Đối tác', locations: 'Trụ sở & Chi nhánh',
  testimonials: 'Cảm nhận khách hàng',
  experiences: 'Kinh nghiệm', education: 'Học vấn', certifications: 'Chứng chỉ',
};
const DEFAULT_ORDER = ['bio', 'highlights', 'expertise', 'projects', 'clients', 'locations', 'testimonials', 'experiences', 'education', 'certifications'];
const HIDDEN_BY_DEFAULT = ['experiences', 'education', 'certifications'];

const INPUT = 'w-full rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500';
const LABEL = 'block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5';

function normalize(d: any): Ecard {
  const vis = d.visibility && typeof d.visibility === 'object' ? { ...d.visibility } : {};
  // Lần đầu (chưa có cấu hình): ẩn mặc định các mục kiểu CV
  if (!d.visibility || Object.keys(d.visibility).length === 0) {
    for (const k of HIDDEN_BY_DEFAULT) vis[k] = false;
  }
  const arr = (x: any) => (Array.isArray(x) ? x : []);
  const ord: string[] = Array.isArray(d.section_order) && d.section_order.length
    ? DEFAULT_ORDER.filter((s) => d.section_order.includes(s)).concat(DEFAULT_ORDER.filter((s) => !d.section_order.includes(s)))
    : DEFAULT_ORDER;
  return {
    slug: d.slug, qr_mode: d.qr_mode === 'profile' ? 'profile' : 'contact', is_public: d.is_public !== false,
    headline: d.headline || '', bio: d.bio || '', theme: d.theme || 'indigo', template: d.template || 'aurora',
    cover_url: d.cover_url || '',
    cover_position: typeof d.cover_position === 'number' ? Math.min(100, Math.max(0, d.cover_position)) : 50,
    skills: arr(d.skills), experiences: arr(d.experiences), education: arr(d.education), certifications: arr(d.certifications),
    projects: arr(d.projects), highlights: arr(d.highlights), expertise: arr(d.expertise), clients: arr(d.clients), testimonials: arr(d.testimonials),
    locations: arr(d.locations),
    socials: d.socials && typeof d.socials === 'object' ? d.socials : {},
    visibility: vis, section_order: ord, view_count: d.view_count || 0,
    display_name: d.display_name ?? undefined, logo_url: d.logo_url ?? undefined,
  };
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/5 p-4 sm:p-5" style={{ background: 'var(--card)' }}>{children}</div>;
}
function SortableRow({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-foreground cursor-grab active:cursor-grabbing select-none">
      <GripVertical size={14} className="text-muted-foreground" /> {SECTION_LABELS[id] || id}
    </div>
  );
}
function SectionHead({ icon, title, visKey, e, set }: { icon: React.ReactNode; title: string; visKey: string; e: Ecard; set: (p: Partial<Ecard>) => void }) {
  const on = e.visibility[visKey] !== false;
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="flex items-center gap-2 text-sm font-700 text-foreground">{icon} {title}</h3>
      <button type="button" onClick={() => set({ visibility: { ...e.visibility, [visKey]: !on } })}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-600 ${on ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-muted-foreground'}`}>
        {on ? <Eye size={12} /> : <EyeOff size={12} />} {on ? 'Hiện' : 'Ẩn'}
      </button>
    </div>
  );
}

interface VariantSummary { id: string; scope: 'personal' | 'company'; company_id: string | null; company_name: string | null; slug: string; title: string; is_public: boolean }

export default function TheDienTuClient() {
  const toast = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [selId, setSelId] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const [variants, setVariants] = useState<VariantSummary[]>([]);
  const [selVariantId, setSelVariantId] = useState<string>('');
  const [e, setE] = useState<Ecard | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [loadingCard, setLoadingCard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addScope, setAddScope] = useState<'personal' | 'company'>('personal');
  const [addCompanies, setAddCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [addCompanyId, setAddCompanyId] = useState('');
  const [addSlug, setAddSlug] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Tab chính: Cá Nhân / Doanh Nghiệp ──
  const [mainTab, setMainTab] = useState<'personal' | 'company'>('personal');
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [selCompanyId, setSelCompanyId] = useState<string>('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companyQ, setCompanyQ] = useState('');
  const [companyVariants, setCompanyVariants] = useState<Array<{ id: string; slug: string; title: string; is_public: boolean }>>([]);
  const [loadingCompanyVariants, setLoadingCompanyVariants] = useState(false);
  const [selCompanyVariantId, setSelCompanyVariantId] = useState<string>('');
  const [addCompanyVarOpen, setAddCompanyVarOpen] = useState(false);
  const [addCompanyVarTitle, setAddCompanyVarTitle] = useState('');
  const [addCompanyVarSlug, setAddCompanyVarSlug] = useState('');
  const [creatingCompanyVar, setCreatingCompanyVar] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const u = getCurrentUser() as any;
    setAllowed(u?.role === 'super_admin' || hasModuleAccess(u?.module_permissions, 'ho-so-nang-luc'));
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch('/api/users').then((r) => r.json()).then((arr) => {
      const list: Person[] = (Array.isArray(arr) ? arr : []).map((u: any) => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatar, position: u.position }));
      setPeople(list);
    }).catch(() => toast.error('Không tải được danh sách nhân sự')).finally(() => setLoadingList(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Khi chọn nhân sự → load danh sách biến thể của họ (không auto-tạo).
  useEffect(() => {
    setE(null);
    setSelVariantId('');
    setVariants([]);
    if (!selId) return;
    setLoadingVariants(true);
    fetch(`/api/ecard/${selId}`).then((r) => r.json()).then((j) => {
      const list: VariantSummary[] = Array.isArray(j?.data) ? j.data : [];
      setVariants(list);
      if (list.length > 0) setSelVariantId(list[0].id); // chọn biến thể đầu tiên
    }).catch(() => toast.error('Không tải được danh sách hồ sơ')).finally(() => setLoadingVariants(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  // Khi chọn biến thể → tải nội dung đầy đủ.
  useEffect(() => {
    if (!selVariantId) { setE(null); return; }
    setLoadingCard(true);
    fetch(`/api/ecard/variant/${selVariantId}`).then((r) => r.json()).then((j) => { if (j?.data) setE(normalize(j.data)); })
      .catch(() => toast.error('Không tải được hồ sơ')).finally(() => setLoadingCard(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selVariantId]);

  // Tải danh sách công ty khi vào tab Doanh Nghiệp.
  useEffect(() => {
    if (mainTab !== 'company' || companies.length > 0) return;
    setLoadingCompanies(true);
    fetch('/api/company-ecard').then((r) => r.json()).then((j) => { if (Array.isArray(j?.data)) setCompanies(j.data); })
      .catch(() => toast.error('Không tải được danh sách công ty')).finally(() => setLoadingCompanies(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab]);

  // Chọn công ty → tải danh sách biến thể của công ty đó.
  useEffect(() => {
    if (mainTab !== 'company') return;
    setSelCompanyVariantId(''); setE(null);
    if (!selCompanyId) { setCompanyVariants([]); return; }
    setLoadingCompanyVariants(true);
    fetch(`/api/company-ecard/${selCompanyId}`).then((r) => r.json()).then((j) => {
      const list = Array.isArray(j?.data) ? j.data : [];
      setCompanyVariants(list);
      if (list.length > 0) setSelCompanyVariantId(list[0].id);
    }).catch(() => toast.error('Không tải được biến thể')).finally(() => setLoadingCompanyVariants(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selCompanyId, mainTab]);

  // Chọn biến thể công ty → tải nội dung.
  useEffect(() => {
    if (mainTab !== 'company' || !selCompanyVariantId) { if (mainTab === 'company') setE(null); return; }
    setLoadingCard(true);
    fetch(`/api/company-ecard/variant/${selCompanyVariantId}`).then((r) => r.json()).then((j) => { if (j?.data) setE(normalize(j.data)); })
      .catch(() => toast.error('Không tải được hồ sơ công ty')).finally(() => setLoadingCard(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selCompanyVariantId, mainTab]);

  // Đổi tab chính → reset lựa chọn + form.
  const switchTab = (t: 'personal' | 'company') => {
    if (t === mainTab) return;
    setMainTab(t); setE(null); setSelId(''); setSelVariantId(''); setVariants([]);
    setSelCompanyId(''); setCompanyVariants([]); setSelCompanyVariantId('');
  };

  // Tạo biến thể mới cho công ty.
  const doCreateCompanyVariant = async () => {
    if (!selCompanyId) return;
    setCreatingCompanyVar(true);
    try {
      const r = await fetch(`/api/company-ecard/${selCompanyId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: addCompanyVarTitle.trim() || null, slug: addCompanyVarSlug.trim() || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Lỗi');
      toast.success('Đã tạo biến thể');
      setAddCompanyVarOpen(false); setAddCompanyVarTitle(''); setAddCompanyVarSlug('');
      const rl = await fetch(`/api/company-ecard/${selCompanyId}`);
      const jl = await rl.json();
      if (Array.isArray(jl?.data)) { setCompanyVariants(jl.data); setSelCompanyVariantId(j.data.id); }
      // cập nhật số đếm biến thể ở picker
      setCompanies((cs) => cs.map((c) => c.company_id === selCompanyId ? { ...c, variant_count: (c.variant_count || 0) + 1 } : c));
    } catch (err: any) { toast.error(err?.message || 'Tạo thất bại'); } finally { setCreatingCompanyVar(false); }
  };

  const deleteCurrentCompanyVariant = async () => {
    if (!selCompanyVariantId) return;
    if (!confirm('Xóa biến thể này? Không thể hoàn tác.')) return;
    try {
      const r = await fetch(`/api/company-ecard/variant/${selCompanyVariantId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      toast.success('Đã xóa');
      const remaining = companyVariants.filter((v) => v.id !== selCompanyVariantId);
      setCompanyVariants(remaining);
      setSelCompanyVariantId(remaining[0]?.id || '');
      setCompanies((cs) => cs.map((c) => c.company_id === selCompanyId ? { ...c, variant_count: Math.max(0, (c.variant_count || 1) - 1) } : c));
    } catch { toast.error('Xóa thất bại'); }
  };

  const set = (patch: Partial<Ecard>) => setE((cur) => (cur ? { ...cur, ...patch } : cur));
  const selPerson = people.find((p) => p.id === selId);
  const selCompany = companies.find((c) => c.company_id === selCompanyId);
  const filteredCompanies = companies.filter((c) => !companyQ || (c.company_name || '').toLowerCase().includes(companyQ.toLowerCase()));
  const filteredPeople = people.filter((p) => !pickerQ || (p.name || '').toLowerCase().includes(pickerQ.toLowerCase()) || (p.email || '').toLowerCase().includes(pickerQ.toLowerCase()));

  const uploadImage = async (file: File): Promise<string | null> => {
    const fd = new FormData(); fd.append('file', file);
    const r = await fetch('/api/ecard/image', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) { toast.error(j.error || 'Tải ảnh thất bại'); return null; }
    return j.url as string;
  };
  const doUpload = async (key: string, file: File | null, apply: (url: string) => void) => {
    if (!file) return; setUploading(key);
    const url = await uploadImage(file); if (url) apply(url); setUploading(null);
  };

  const profileUrl = useMemo(() => (origin && e ? `${origin}/card/${e.slug}` : ''), [origin, e]);
  const qr = useMemo(() => (profileUrl ? generateQRCodeDataUrl(profileUrl) : ''), [profileUrl]);

  const save = async () => {
    if (!e) return;
    const url = mainTab === 'company'
      ? (selCompanyVariantId ? `/api/company-ecard/variant/${selCompanyVariantId}` : '')
      : (selVariantId ? `/api/ecard/variant/${selVariantId}` : '');
    if (!url) return;
    setSaving(true);
    try {
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) });
      if (!r.ok) throw new Error();
      toast.success('Đã lưu hồ sơ');
    } catch { toast.error('Lưu thất bại'); } finally { setSaving(false); }
  };

  // Mở modal thêm biến thể — tải danh sách công ty user được gán.
  const openAdd = async () => {
    if (!selId) return;
    setAddOpen(true);
    setAddScope(variants.some(v => v.scope === 'personal') ? 'company' : 'personal');
    setAddCompanyId('');
    setAddSlug('');
    setAddTitle('');
    try {
      const r = await fetch(`/api/ecard/${selId}/companies`);
      const j = await r.json();
      setAddCompanies(Array.isArray(j?.data) ? j.data : []);
    } catch {
      setAddCompanies([]);
    }
  };

  const doCreateVariant = async () => {
    if (!selId) return;
    if (!addSlug.trim()) { toast.error('Nhập slug'); return; }
    if (addScope === 'company' && !addCompanyId) { toast.error('Chọn công ty'); return; }
    setCreating(true);
    try {
      const r = await fetch(`/api/ecard/${selId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: addScope, company_id: addCompanyId || null, slug: addSlug.trim(), title: addTitle.trim() || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Lỗi');
      toast.success('Đã tạo biến thể');
      setAddOpen(false);
      // Refresh list + chọn biến thể mới.
      const rl = await fetch(`/api/ecard/${selId}`);
      const jl = await rl.json();
      if (Array.isArray(jl?.data)) {
        setVariants(jl.data);
        setSelVariantId(j.data.id);
      }
    } catch (err: any) { toast.error(err?.message || 'Tạo thất bại'); } finally { setCreating(false); }
  };

  const deleteCurrentVariant = async () => {
    if (!selVariantId) return;
    if (!confirm('Xóa biến thể này? Không thể hoàn tác.')) return;
    try {
      const r = await fetch(`/api/ecard/variant/${selVariantId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      toast.success('Đã xóa');
      const remaining = variants.filter(v => v.id !== selVariantId);
      setVariants(remaining);
      setSelVariantId(remaining[0]?.id || '');
    } catch { toast.error('Xóa thất bại'); }
  };

  const addSkill = () => { const v = skillInput.trim(); if (!v || !e) return; if (!e.skills.includes(v)) set({ skills: [...e.skills, v] }); setSkillInput(''); };
  const onDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev; if (!over || active.id === over.id || !e) return;
    const oi = e.section_order.indexOf(active.id as string), ni = e.section_order.indexOf(over.id as string);
    if (oi < 0 || ni < 0) return; set({ section_order: arrayMove(e.section_order, oi, ni) });
  };

  // Helpers cho list thêm-bớt
  const upd = (key: keyof Ecard, i: number, patch: Row) => { if (!e) return; const a = [...(e[key] as Row[])]; a[i] = { ...a[i], ...patch }; set({ [key]: a } as any); };
  const del = (key: keyof Ecard, i: number) => { if (!e) return; set({ [key]: (e[key] as Row[]).filter((_, j) => j !== i) } as any); };
  const add = (key: keyof Ecard) => { if (!e) return; set({ [key]: [...(e[key] as Row[]), {}] } as any); };

  if (allowed === false) {
    return (
      <div className="flex flex-col items-center py-24 text-muted-foreground">
        <IdCard className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Bạn không có quyền truy cập trình biên soạn Hồ Sơ Năng Lực.</p>
        <p className="text-xs mt-1 opacity-60">Liên hệ quản trị để được cấp quyền.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground flex items-center gap-2"><IdCard className="h-6 w-6 text-indigo-400" /> Hồ Sơ Năng Lực</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Biên soạn hồ sơ landing chào khách hàng, gán cho từng nhân sự.</p>
        </div>
        {e && (
          <div className="flex items-center gap-2">
            {profileUrl && (
              <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5"><ExternalLink size={15} /> Xem trang</a>
            )}
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-600 text-white">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Lưu
            </button>
          </div>
        )}
      </div>

      {/* 2 Tab Card View: Cá Nhân / Doanh Nghiệp */}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => switchTab('personal')}
          className={`rounded-2xl border p-4 text-left transition-colors ${mainTab === 'personal' ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 hover:bg-white/5'}`}>
          <div className="flex items-center gap-2 text-sm font-700 text-foreground"><IdCard size={16} className="text-indigo-400" /> Hồ Sơ Năng Lực - Cá Nhân</div>
          <p className="mt-1 text-2xs text-muted-foreground">Hồ sơ landing riêng của từng nhân sự.</p>
        </button>
        <button type="button" onClick={() => switchTab('company')}
          className={`rounded-2xl border p-4 text-left transition-colors ${mainTab === 'company' ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 hover:bg-white/5'}`}>
          <div className="flex items-center gap-2 text-sm font-700 text-foreground"><Users2 size={16} className="text-indigo-400" /> Hồ Sơ Năng Lực - Doanh Nghiệp</div>
          <p className="mt-1 text-2xs text-muted-foreground">Mỗi công ty 1 hồ sơ dùng chung; nhân viên trỏ QR tới đây.</p>
        </button>
      </div>

      {/* Chọn nhân sự (tab Cá Nhân) */}
      {mainTab === 'personal' && (
      <Card>
        <label className={LABEL}>Chọn nhân sự để biên soạn hồ sơ</label>
        <div className="relative">
          <button type="button" onClick={() => setPickerOpen((v) => !v)} disabled={loadingList}
            className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground">
            <span className="flex items-center gap-2">
              {loadingList ? <Loader2 size={15} className="animate-spin" /> : <Users2 size={15} className="text-indigo-400" />}
              {selPerson ? selPerson.name : 'Chọn nhân sự…'}
            </span>
            <ChevronDown size={16} className="text-muted-foreground" />
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
              <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-white/10 shadow-xl overflow-hidden" style={{ background: 'var(--card)' }}>
                <div className="p-2 border-b border-white/5">
                  <div className="flex items-center gap-2 rounded-lg bg-[#162033] px-2.5">
                    <Search size={14} className="text-muted-foreground" />
                    <input autoFocus value={pickerQ} onChange={(ev) => setPickerQ(ev.target.value)} placeholder="Tìm tên / email…" className="w-full bg-transparent py-2 text-sm text-foreground outline-none" />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {filteredPeople.slice(0, 100).map((p) => (
                    <button key={p.id} type="button" onClick={() => { setSelId(p.id); setPickerOpen(false); setPickerQ(''); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-white/5">
                      <span className="truncate">{p.name}</span>
                      {p.email && <span className="ml-auto truncate text-2xs text-muted-foreground">{p.email}</span>}
                    </button>
                  ))}
                  {filteredPeople.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Không tìm thấy.</p>}
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
      )}

      {/* Chọn công ty (tab Doanh Nghiệp) */}
      {mainTab === 'company' && (
      <Card>
        <label className={LABEL}>Chọn công ty để biên soạn hồ sơ năng lực</label>
        <div className="relative">
          <button type="button" onClick={() => setCompanyPickerOpen((v) => !v)} disabled={loadingCompanies}
            className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground">
            <span className="flex items-center gap-2">
              {loadingCompanies ? <Loader2 size={15} className="animate-spin" /> : <Users2 size={15} className="text-indigo-400" />}
              {selCompany ? selCompany.company_name : 'Chọn công ty…'}
            </span>
            <ChevronDown size={16} className="text-muted-foreground" />
          </button>
          {companyPickerOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setCompanyPickerOpen(false)} />
              <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-white/10 shadow-xl overflow-hidden" style={{ background: 'var(--card)' }}>
                <div className="p-2 border-b border-white/5">
                  <div className="flex items-center gap-2 rounded-lg bg-[#162033] px-2.5">
                    <Search size={14} className="text-muted-foreground" />
                    <input autoFocus value={companyQ} onChange={(ev) => setCompanyQ(ev.target.value)} placeholder="Tìm công ty…" className="w-full bg-transparent py-2 text-sm text-foreground outline-none" />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {filteredCompanies.map((c) => (
                    <button key={c.company_id} type="button" onClick={() => { setSelCompanyId(c.company_id); setCompanyPickerOpen(false); setCompanyQ(''); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-white/5">
                      <span className="truncate">{c.company_name}</span>
                      {c.variant_count > 0 && <span className="ml-auto text-2xs text-emerald-400">{c.variant_count} biến thể</span>}
                    </button>
                  ))}
                  {filteredCompanies.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Không tìm thấy.</p>}
                </div>
              </div>
            </>
          )}
        </div>
        {selCompany && e && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Tên hiển thị (để trống = tên công ty)</label>
              <input className={INPUT} value={e.display_name || ''} onChange={(ev) => set({ display_name: ev.target.value })} placeholder={selCompany.company_name} />
            </div>
            <div>
              <label className={LABEL}>Logo landing</label>
              <div className="flex items-center gap-2">
                {(e.logo_url || selCompany.company_logo) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.logo_url || selCompany.company_logo || ''} alt="" className="h-9 w-9 rounded-lg object-contain bg-white/5 border border-white/10" />
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-hover px-3 py-1.5 text-2xs font-600 text-foreground hover:bg-hover-strong">
                  {uploading === 'clogo' ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} className="text-indigo-400" />}
                  {e.logo_url ? 'Đổi logo' : 'Tải logo riêng'}
                  <input type="file" accept="image/*" className="hidden" onChange={(ev) => doUpload('clogo', ev.target.files?.[0] ?? null, (u) => set({ logo_url: u }))} />
                </label>
                {e.logo_url && <button type="button" onClick={() => set({ logo_url: '' })} className="text-2xs text-red-400 hover:text-red-300">Gỡ (dùng logo công ty)</button>}
              </div>
            </div>
          </div>
        )}
      </Card>
      )}

      {/* Biến thể hồ sơ CÔNG TY */}
      {mainTab === 'company' && selCompanyId && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="flex items-center gap-2 text-sm font-700 text-foreground"><Layers size={15} className="text-indigo-400" /> Biến thể hồ sơ (vd Tiếng Anh, Tiếng Trung…)</h3>
            <button type="button" onClick={() => { setAddCompanyVarTitle(''); setAddCompanyVarSlug(''); setAddCompanyVarOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-600 text-white">
              <Plus size={14} /> Thêm biến thể
            </button>
          </div>
          {loadingCompanyVariants ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : companyVariants.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Công ty này chưa có hồ sơ nào. Bấm <b>Thêm biến thể</b> để tạo (vd bản Tiếng Việt).</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {companyVariants.map((v) => (
                <button key={v.id} onClick={() => setSelCompanyVariantId(v.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-600 border transition-colors ${selCompanyVariantId === v.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-hover border-white/10 text-foreground hover:bg-hover-strong'}`}>
                  {v.title}{!v.is_public && <span className="ml-1.5 opacity-70">(ẩn)</span>}
                </button>
              ))}
            </div>
          )}
          {selCompanyVariantId && (
            <div className="mt-3 flex items-center justify-end">
              <button type="button" onClick={deleteCurrentCompanyVariant} className="text-2xs text-red-400 hover:text-red-300 inline-flex items-center gap-1">
                <X size={12} /> Xóa biến thể đang chọn
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Biến thể hồ sơ */}
      {mainTab === 'personal' && selId && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="flex items-center gap-2 text-sm font-700 text-foreground"><Layers size={15} className="text-indigo-400" /> Biến thể hồ sơ</h3>
            <button type="button" onClick={openAdd} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-600 text-white">
              <Plus size={14} /> Thêm biến thể
            </button>
          </div>
          {loadingVariants ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : variants.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nhân sự này chưa có hồ sơ nào. Bấm <b>Thêm biến thể</b> để tạo.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelVariantId(v.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-600 border transition-colors ${
                    selVariantId === v.id
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-hover border-white/10 text-foreground hover:bg-hover-strong'
                  }`}
                >
                  {v.scope === 'personal' ? 'HSNL - Cá Nhân' : `HSNL - ${v.company_name || 'Công Ty'}`}
                  {!v.is_public && <span className="ml-1.5 opacity-70">(ẩn)</span>}
                </button>
              ))}
            </div>
          )}
          {selVariantId && (
            <div className="mt-3 flex items-center justify-end">
              <button type="button" onClick={deleteCurrentVariant} className="text-2xs text-red-400 hover:text-red-300 inline-flex items-center gap-1">
                <X size={12} /> Xóa biến thể đang chọn
              </button>
            </div>
          )}
        </Card>
      )}

      {loadingCard && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {!loadingCard && !e && mainTab === 'personal' && !selId && (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <IdCard className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chọn một nhân sự để bắt đầu biên soạn hồ sơ năng lực.</p>
        </div>
      )}
      {!loadingCard && !e && mainTab === 'company' && !selCompanyId && (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <Users2 className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chọn một công ty để biên soạn hồ sơ năng lực doanh nghiệp.</p>
        </div>
      )}

      {/* Modal thêm biến thể CÔNG TY */}
      {addCompanyVarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Thêm biến thể hồ sơ công ty</h2>
              <button onClick={() => setAddCompanyVarOpen(false)} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground">Tạo 1 biến thể cho <b className="text-foreground">{selCompany?.company_name}</b> — vd bản Tiếng Anh, Tiếng Trung.</p>
              <div>
                <label className={LABEL}>Tên biến thể</label>
                <input className={INPUT} value={addCompanyVarTitle} onChange={(ev) => setAddCompanyVarTitle(ev.target.value)} placeholder="vd: Tiếng Anh / English" />
              </div>
              <div>
                <label className={LABEL}>Slug (URL công khai — để trống sẽ tự sinh)</label>
                <input className={INPUT} value={addCompanyVarSlug} onChange={(ev) => setAddCompanyVarSlug(ev.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="vd: proship-en" />
                <p className="text-2xs text-muted-foreground mt-1">URL: <code>/card/{addCompanyVarSlug || 'slug'}</code></p>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
              <button onClick={() => setAddCompanyVarOpen(false)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={doCreateCompanyVariant} disabled={creatingCompanyVar} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 inline-flex items-center gap-2 disabled:opacity-50">
                {creatingCompanyVar && <Loader2 size={14} className="animate-spin" />} Tạo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal thêm biến thể */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="text-base font-700 text-foreground">Thêm biến thể hồ sơ</h2>
              <button onClick={() => setAddOpen(false)} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={LABEL}>Loại hồ sơ</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAddScope('personal')} disabled={variants.some(v => v.scope === 'personal')}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-600 transition-colors disabled:opacity-40 ${
                      addScope === 'personal' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-hover border-white/10 text-foreground'
                    }`}>Cá Nhân</button>
                  <button type="button" onClick={() => setAddScope('company')}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-600 transition-colors ${
                      addScope === 'company' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-hover border-white/10 text-foreground'
                    }`}>Công Ty</button>
                </div>
                {variants.some(v => v.scope === 'personal') && addScope === 'personal' && (
                  <p className="text-2xs text-amber-400 mt-1">Đã có hồ sơ Cá Nhân — chọn Công Ty.</p>
                )}
              </div>
              {addScope === 'company' && (
                <div>
                  <label className={LABEL}>Công ty</label>
                  <select className={INPUT} value={addCompanyId} onChange={(ev) => setAddCompanyId(ev.target.value)}>
                    <option value="">— Chọn công ty —</option>
                    {addCompanies
                      .filter(c => !variants.some(v => v.scope === 'company' && v.company_id === c.id))
                      .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {addCompanies.length === 0 && <p className="text-2xs text-muted-foreground mt-1">Nhân sự này chưa được gán công ty nào.</p>}
                </div>
              )}
              <div>
                <label className={LABEL}>Slug (URL công khai)</label>
                <input className={INPUT} value={addSlug} onChange={(ev) => setAddSlug(ev.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="vd: nguyen-duy-toan-proship" />
                <p className="text-2xs text-muted-foreground mt-1">Chỉ chữ thường/số/gạch, 2-60 ký tự. URL: <code>/card/{addSlug || 'slug'}</code></p>
              </div>
              <div>
                <label className={LABEL}>Tiêu đề chip (tùy chọn)</label>
                <input className={INPUT} value={addTitle} onChange={(ev) => setAddTitle(ev.target.value)} placeholder="Để trống dùng mặc định" />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
              <button onClick={() => setAddOpen(false)} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
              <button onClick={doCreateVariant} disabled={creating} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 inline-flex items-center gap-2 disabled:opacity-50">
                {creating && <Loader2 size={14} className="animate-spin" />} Tạo
              </button>
            </div>
          </div>
        </div>
      )}

      {e && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          {/* LEFT */}
          <div className="space-y-5 order-2 lg:order-1">
            {/* Ảnh bìa */}
            <Card>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-700 text-foreground"><ImageIcon size={15} className="text-indigo-400" /> Ảnh bìa</h3>
              <div
                className={`relative h-32 rounded-xl overflow-hidden border border-white/10 bg-black/20 ${e.cover_url ? 'cursor-ns-resize select-none' : ''}`}
                onPointerDown={(ev) => {
                  if (!e.cover_url) return;
                  const box = ev.currentTarget;
                  box.setPointerCapture(ev.pointerId);
                  const move = (cy: number) => {
                    const r = box.getBoundingClientRect();
                    const pct = Math.min(100, Math.max(0, ((cy - r.top) / r.height) * 100));
                    set({ cover_position: Math.round(pct) });
                  };
                  move(ev.clientY);
                  const onMove = (m: PointerEvent) => move(m.clientY);
                  const onUp = () => { box.removeEventListener('pointermove', onMove); box.removeEventListener('pointerup', onUp); };
                  box.addEventListener('pointermove', onMove);
                  box.addEventListener('pointerup', onUp);
                }}
              >
                {e.cover_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.cover_url} alt="bìa" className="h-full w-full object-cover pointer-events-none" style={{ objectPosition: `center ${e.cover_position}%` }} />
                    <div className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-2xs font-600 text-white/90">Kéo lên/xuống để căn chỉnh</div>
                  </>
                ) : <div className="flex h-full items-center justify-center text-xs text-muted-foreground/60">Chưa có ảnh bìa</div>}
              </div>
              {e.cover_url && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-2xs font-600 text-muted-foreground w-14 shrink-0">Vị trí bìa</span>
                  <input type="range" min={0} max={100} value={e.cover_position} onChange={(ev) => set({ cover_position: Number(ev.target.value) })} className="flex-1 accent-indigo-500" />
                  <span className="text-2xs tabular-nums text-muted-foreground w-9 text-right">{e.cover_position}%</span>
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-hover px-3 py-1.5 text-2xs font-600 text-foreground hover:bg-hover-strong">
                  {uploading === 'cover' ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} className="text-indigo-400" />}
                  {e.cover_url ? 'Đổi ảnh bìa' : 'Tải ảnh bìa'}
                  <input type="file" accept="image/*" className="hidden" onChange={(ev) => doUpload('cover', ev.target.files?.[0] ?? null, (u) => set({ cover_url: u, cover_position: 50 }))} />
                </label>
                {e.cover_url && <button type="button" onClick={() => set({ cover_url: '' })} className="inline-flex items-center gap-1 text-2xs text-red-400 hover:text-red-300"><X size={12} /> Gỡ</button>}
              </div>
            </Card>

            {/* Giới thiệu */}
            <Card>
              <SectionHead icon={<Sparkles size={15} className="text-indigo-400" />} title="Giới thiệu" visKey="bio" e={e} set={set} />
              <div className="space-y-3">
                <div><label className={LABEL}>Tuyên ngôn giá trị (headline)</label>
                  <input className={INPUT} value={e.headline} onChange={(ev) => set({ headline: ev.target.value })} placeholder="VD: Giúp doanh nghiệp tăng trưởng bằng giải pháp số" /></div>
                <div><label className={LABEL}>Giới thiệu</label>
                  <textarea className={`${INPUT} min-h-[110px]`} value={e.bio} onChange={(ev) => set({ bio: ev.target.value })} placeholder="Bạn/đội bạn giúp khách hàng điều gì, thế mạnh khác biệt…" /></div>
              </div>
            </Card>

            {/* Điểm nổi bật */}
            <Card>
              <SectionHead icon={<TrendingUp size={15} className="text-indigo-400" />} title="Điểm nổi bật (con số)" visKey="highlights" e={e} set={set} />
              <div className="space-y-2">
                {e.highlights.map((it, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={`${INPUT} max-w-[130px]`} value={it.value || ''} onChange={(ev) => upd('highlights', i, { value: ev.target.value })} placeholder="200+" />
                    <input className={INPUT} value={it.label || ''} onChange={(ev) => upd('highlights', i, { label: ev.target.value })} placeholder="Dự án đã triển khai" />
                    <button type="button" onClick={() => del('highlights', i)} className="shrink-0 rounded-lg px-2 text-red-400 hover:bg-red-500/10"><X size={16} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => add('highlights')} className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"><Plus size={15} /> Thêm con số</button>
              </div>
            </Card>

            {/* Lĩnh vực chuyên môn */}
            <Card>
              <SectionHead icon={<Layers size={15} className="text-indigo-400" />} title="Lĩnh vực chuyên môn / Dịch vụ" visKey="expertise" e={e} set={set} />
              <div className="space-y-3">
                {e.expertise.map((it, i) => (
                  <div key={i} className="rounded-xl border border-white/5 p-3 space-y-2 bg-black/10">
                    <div className="flex gap-2">
                      <input className={INPUT} value={it.name || ''} onChange={(ev) => upd('expertise', i, { name: ev.target.value })} placeholder="Tên lĩnh vực / dịch vụ" />
                      <button type="button" onClick={() => del('expertise', i)} className="shrink-0 rounded-lg px-2 text-red-400 hover:bg-red-500/10"><X size={16} /></button>
                    </div>
                    <textarea className={`${INPUT} min-h-[54px]`} value={it.desc || ''} onChange={(ev) => upd('expertise', i, { desc: ev.target.value })} placeholder="Mô tả ngắn giá trị mang lại (tùy chọn)" />
                  </div>
                ))}
                <button type="button" onClick={() => add('expertise')} className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"><Plus size={15} /> Thêm lĩnh vực</button>
              </div>
            </Card>

            {/* Dự án tiêu biểu */}
            <Card>
              <SectionHead icon={<FolderGit2 size={15} className="text-indigo-400" />} title="Dự án tiêu biểu" visKey="projects" e={e} set={set} />
              <div className="space-y-3">
                {e.projects.map((it, i) => (
                  <div key={i} className="rounded-xl border border-white/5 p-3 space-y-2 bg-black/10">
                    <div className="flex gap-2">
                      <input className={INPUT} value={it.name || ''} onChange={(ev) => upd('projects', i, { name: ev.target.value })} placeholder="Tên dự án / thành tích" />
                      <button type="button" onClick={() => del('projects', i)} className="shrink-0 rounded-lg px-2 text-red-400 hover:bg-red-500/10"><X size={16} /></button>
                    </div>
                    <input className={INPUT} value={it.url || ''} onChange={(ev) => upd('projects', i, { url: ev.target.value })} placeholder="Link (tùy chọn)" />
                    {it.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image} alt="" className="h-28 w-full rounded-lg object-cover border border-white/10" />
                    )}
                    <div className="flex items-center gap-2">
                      <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-hover px-2.5 py-1.5 text-2xs font-600 text-foreground hover:bg-hover-strong">
                        {uploading === `proj${i}` ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} className="text-indigo-400" />}
                        {it.image ? 'Đổi ảnh' : 'Thêm ảnh'}
                        <input type="file" accept="image/*" className="hidden" onChange={(ev) => doUpload(`proj${i}`, ev.target.files?.[0] ?? null, (u) => upd('projects', i, { image: u }))} />
                      </label>
                      {it.image && <button type="button" onClick={() => upd('projects', i, { image: '' })} className="inline-flex items-center gap-1 text-2xs text-red-400 hover:text-red-300"><X size={12} /> Gỡ ảnh</button>}
                    </div>
                    <textarea className={`${INPUT} min-h-[54px]`} value={it.desc || ''} onChange={(ev) => upd('projects', i, { desc: ev.target.value })} placeholder="Mô tả ngắn" />
                  </div>
                ))}
                <button type="button" onClick={() => add('projects')} className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"><Plus size={15} /> Thêm dự án</button>
              </div>
            </Card>

            {/* Khách hàng / Đối tác */}
            <Card>
              <SectionHead icon={<Users2 size={15} className="text-indigo-400" />} title="Khách hàng / Đối tác" visKey="clients" e={e} set={set} />
              <div className="space-y-2">
                {e.clients.map((it, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <label
                      title={it.logo ? 'Bấm để đổi logo' : 'Tải logo'}
                      className="group relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
                    >
                      {it.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.logo} alt="" className="h-full w-full object-contain" />
                      )}
                      <span className={`absolute inset-0 flex items-center justify-center ${it.logo ? 'bg-black/50 opacity-0 group-hover:opacity-100' : ''}`}>
                        {uploading === `cli${i}` ? <Loader2 size={13} className="animate-spin text-white" /> : <ImagePlus size={13} className={it.logo ? 'text-white' : ''} />}
                      </span>
                      <input type="file" accept="image/*" className="hidden" onChange={(ev) => doUpload(`cli${i}`, ev.target.files?.[0] ?? null, (u) => upd('clients', i, { logo: u }))} />
                    </label>
                    {it.logo && (
                      <button type="button" title="Gỡ logo" onClick={() => upd('clients', i, { logo: '' })} className="shrink-0 rounded-lg px-1.5 py-1 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"><ImageIcon size={14} /></button>
                    )}
                    <input className={INPUT} value={it.name || ''} onChange={(ev) => upd('clients', i, { name: ev.target.value })} placeholder="Tên khách hàng / đối tác" />
                    <button type="button" title="Xóa dòng" onClick={() => del('clients', i)} className="shrink-0 rounded-lg px-2 text-red-400 hover:bg-red-500/10"><X size={16} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => add('clients')} className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"><Plus size={15} /> Thêm khách hàng</button>
              </div>
            </Card>

            {/* Trụ sở & Chi nhánh */}
            <Card>
              <SectionHead icon={<MapPin size={15} className="text-indigo-400" />} title="Trụ sở & Chi nhánh" visKey="locations" e={e} set={set} />
              <div className="space-y-3">
                {e.locations.map((it, i) => (
                  <div key={i} className="rounded-xl border border-white/10 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input className={INPUT} value={it.label || ''} onChange={(ev) => upd('locations', i, { label: ev.target.value })} placeholder="Tên cơ sở (VD: Trụ sở chính, CN Hà Nội)" />
                      <button type="button" title="Xóa dòng" onClick={() => del('locations', i)} className="shrink-0 rounded-lg px-2 text-red-400 hover:bg-red-500/10"><X size={16} /></button>
                    </div>
                    <input className={INPUT} value={it.address || ''} onChange={(ev) => upd('locations', i, { address: ev.target.value })} placeholder="Địa chỉ đầy đủ" />
                    <input className={INPUT} value={it.phone || ''} onChange={(ev) => upd('locations', i, { phone: ev.target.value })} placeholder="Điện thoại / Hotline (tùy chọn)" />
                  </div>
                ))}
                <button type="button" onClick={() => add('locations')} className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"><Plus size={15} /> Thêm cơ sở</button>
              </div>
            </Card>

            {/* Cảm nhận khách hàng */}
            <Card>
              <SectionHead icon={<Quote size={15} className="text-indigo-400" />} title="Cảm nhận khách hàng" visKey="testimonials" e={e} set={set} />
              <div className="space-y-3">
                {e.testimonials.map((it, i) => (
                  <div key={i} className="rounded-xl border border-white/5 p-3 space-y-2 bg-black/10">
                    <textarea className={`${INPUT} min-h-[60px]`} value={it.quote || ''} onChange={(ev) => upd('testimonials', i, { quote: ev.target.value })} placeholder="Trích dẫn nhận xét của khách hàng" />
                    <div className="flex gap-2">
                      <input className={INPUT} value={it.author || ''} onChange={(ev) => upd('testimonials', i, { author: ev.target.value })} placeholder="Người nhận xét" />
                      <input className={INPUT} value={it.role || ''} onChange={(ev) => upd('testimonials', i, { role: ev.target.value })} placeholder="Chức vụ / công ty" />
                      <button type="button" onClick={() => del('testimonials', i)} className="shrink-0 rounded-lg px-2 text-red-400 hover:bg-red-500/10"><X size={16} /></button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => add('testimonials')} className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"><Plus size={15} /> Thêm cảm nhận</button>
              </div>
            </Card>

            {/* Kinh nghiệm (mặc định ẩn) */}
            <Card>
              <SectionHead icon={<Briefcase size={15} className="text-indigo-400" />} title="Kinh nghiệm" visKey="experiences" e={e} set={set} />
              <div className="space-y-3">
                {e.experiences.map((it, i) => (
                  <div key={i} className="rounded-xl border border-white/5 p-3 space-y-2 bg-black/10">
                    <div className="flex gap-2">
                      <input className={INPUT} value={it.title || ''} onChange={(ev) => upd('experiences', i, { title: ev.target.value })} placeholder="Chức danh / vai trò" />
                      <button type="button" onClick={() => del('experiences', i)} className="shrink-0 rounded-lg px-2 text-red-400 hover:bg-red-500/10"><X size={16} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className={INPUT} value={it.org || ''} onChange={(ev) => upd('experiences', i, { org: ev.target.value })} placeholder="Tổ chức" />
                      <input className={INPUT} value={it.period || ''} onChange={(ev) => upd('experiences', i, { period: ev.target.value })} placeholder="Thời gian" />
                    </div>
                    <textarea className={`${INPUT} min-h-[54px]`} value={it.desc || ''} onChange={(ev) => upd('experiences', i, { desc: ev.target.value })} placeholder="Mô tả (tùy chọn)" />
                  </div>
                ))}
                <button type="button" onClick={() => add('experiences')} className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"><Plus size={15} /> Thêm kinh nghiệm</button>
              </div>
            </Card>

            {/* Học vấn (ẩn) */}
            <Card>
              <SectionHead icon={<GraduationCap size={15} className="text-indigo-400" />} title="Học vấn" visKey="education" e={e} set={set} />
              <div className="space-y-2">
                {e.education.map((it, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={INPUT} value={it.degree || ''} onChange={(ev) => upd('education', i, { degree: ev.target.value })} placeholder="Bằng cấp / chuyên ngành" />
                    <input className={INPUT} value={it.school || ''} onChange={(ev) => upd('education', i, { school: ev.target.value })} placeholder="Trường" />
                    <input className={`${INPUT} max-w-[120px]`} value={it.period || ''} onChange={(ev) => upd('education', i, { period: ev.target.value })} placeholder="Năm" />
                    <button type="button" onClick={() => del('education', i)} className="shrink-0 rounded-lg px-2 text-red-400 hover:bg-red-500/10"><X size={16} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => add('education')} className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"><Plus size={15} /> Thêm học vấn</button>
              </div>
            </Card>

            {/* Chứng chỉ (ẩn) */}
            <Card>
              <SectionHead icon={<BadgeCheck size={15} className="text-indigo-400" />} title="Chứng chỉ" visKey="certifications" e={e} set={set} />
              <div className="space-y-2">
                {e.certifications.map((it, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={INPUT} value={it.name || ''} onChange={(ev) => upd('certifications', i, { name: ev.target.value })} placeholder="Tên chứng chỉ" />
                    <input className={INPUT} value={it.issuer || ''} onChange={(ev) => upd('certifications', i, { issuer: ev.target.value })} placeholder="Cấp bởi" />
                    <input className={`${INPUT} max-w-[100px]`} value={it.year || ''} onChange={(ev) => upd('certifications', i, { year: ev.target.value })} placeholder="Năm" />
                    <button type="button" onClick={() => del('certifications', i)} className="shrink-0 rounded-lg px-2 text-red-400 hover:bg-red-500/10"><X size={16} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => add('certifications')} className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"><Plus size={15} /> Thêm chứng chỉ</button>
              </div>
            </Card>

            {/* Mạng xã hội */}
            <Card>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-700 text-foreground"><Contact size={15} className="text-indigo-400" /> Mạng xã hội</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SOCIAL_FIELDS.map((k) => (
                  <div key={k}><label className={LABEL}>{k === 'website' ? 'Website' : k}</label>
                    <input className={INPUT} value={e.socials[k] || ''} onChange={(ev) => set({ socials: { ...e.socials, [k]: ev.target.value } })} placeholder={k === 'website' ? 'https://congty.com' : `${k}...`} /></div>
                ))}
              </div>
            </Card>
          </div>

          {/* RIGHT */}
          <div className="space-y-5 order-1 lg:order-2 lg:sticky lg:top-4 self-start">
            <Card>
              <h3 className="mb-3 text-sm font-700 text-foreground">Mẫu trang (template)</h3>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map((t) => (
                  <button key={t.id} type="button" onClick={() => set({ template: t.id })}
                    className={`rounded-lg border p-2.5 text-left ${e.template === t.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 hover:bg-white/5'}`}>
                    <p className="text-xs font-700 text-foreground">{t.name}</p>
                    <p className="text-2xs text-muted-foreground/70 leading-snug">{t.desc}</p>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-700 text-foreground"><QrCode size={15} className="text-indigo-400" /> Mã QR hồ sơ</h3>
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" style={{ imageRendering: 'pixelated' }} />
              ) : <div className="mx-auto h-44 w-44 rounded-xl bg-white/5 flex items-center justify-center"><QrCode size={40} className="text-muted-foreground/40" /></div>}
              <div className="mt-3 flex items-center gap-2">
                <input readOnly value={profileUrl} className={`${INPUT} text-xs`} />
                <button type="button" onClick={() => { navigator.clipboard.writeText(profileUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="shrink-0 rounded-lg border border-white/10 px-2.5 py-2 text-muted-foreground hover:text-foreground hover:bg-white/5">
                  {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                </button>
              </div>
              <p className="mt-2 flex items-center gap-1 text-2xs text-muted-foreground/70"><Eye size={12} /> {e.view_count} lượt xem</p>
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-700 text-foreground">Cài đặt</h3>
              <div className="space-y-4">
                <div><label className={LABEL}>QR trên e-card quét ra</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([['contact', 'Danh bạ'], ['profile', 'Hồ sơ']] as const).map(([val, lbl]) => (
                      <button key={val} type="button" onClick={() => set({ qr_mode: val })}
                        className={`rounded-lg px-3 py-2 text-sm font-600 border ${e.qr_mode === val ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-white/10 text-muted-foreground'}`}>{lbl}</button>
                    ))}
                  </div>
                </div>
                <div><label className={LABEL}>Trạng thái trang</label>
                  <button type="button" onClick={() => set({ is_public: !e.is_public })}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-600 border ${e.is_public ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-white/10 text-muted-foreground'}`}>
                    {e.is_public ? <><Eye size={15} /> Công khai</> : <><EyeOff size={15} /> Đang ẩn</>}
                  </button>
                </div>
                <div><label className={LABEL}>Màu chủ đạo</label>
                  <div className="flex flex-wrap gap-2">
                    {THEMES.map((t) => (
                      <button key={t.id} type="button" onClick={() => set({ theme: t.id })}
                        className={`h-7 w-7 rounded-full border-2 transition-transform ${e.theme === t.id ? 'border-white scale-110' : 'border-white/20'}`} style={{ background: t.hex }} title={t.id} />
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-700 text-foreground"><ListOrdered size={15} className="text-indigo-400" /> Thứ tự các mục</h3>
              <p className="mb-3 text-2xs text-muted-foreground/60">Kéo để sắp xếp thứ tự trên trang.</p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={e.section_order} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">{e.section_order.map((id) => <SortableRow key={id} id={id} />)}</div>
                </SortableContext>
              </DndContext>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
