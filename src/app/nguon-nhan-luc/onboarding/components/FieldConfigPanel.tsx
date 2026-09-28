'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, ToggleLeft, ToggleRight, Asterisk, Link2, Check, ExternalLink, Info, Paperclip, Plus, Files } from 'lucide-react';
import {
  listOnbFields, updateOnbFields, OnbFormField,
  listDocTypes, createDocType, updateDocType, OnbDocType,
} from '@/lib/api/onboardingApi';
import { isRecruiterOnlyField } from '@/lib/onboardingFieldRules';
import { useToast } from '@/context/ToastContext';

const SECTION_TITLES: Record<string, string> = {
  personal: 'Thông Tin Cá Nhân', work: 'Thông Tin Công Việc', identity: 'Giấy Tờ Tùy Thân',
  bank: 'Tài Khoản Ngân Hàng', other: 'Thông Tin Khác',
  emergency: 'Người Thân Liên Hệ 1', emergency2: 'Người Thân Liên Hệ 2',
  attachments: 'Đính Kèm Hồ Sơ',
};
const SECTION_ORDER = ['personal', 'work', 'identity', 'bank', 'other', 'emergency', 'emergency2', 'attachments'];

const PUBLIC_PATH = '/onboarding/thong-tin-nhan-su-dau-vao';

/** Tab cấu hình biểu mẫu thông tin nhận việc + link public cố định. */
export default function FieldConfigPanel() {
  const toast = useToast();
  const [fields, setFields] = useState<OnbFormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Record<string, { enabled?: boolean; required?: boolean }>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try { setFields(await listOnbFields()); } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, []);

  const sections = useMemo(() => {
    const by: Record<string, OnbFormField[]> = {};
    for (const f of fields) (by[f.section] ||= []).push(f);
    return SECTION_ORDER.filter(k => by[k]?.length).map(k => ({ key: k, items: by[k] }));
  }, [fields]);

  const toggle = (id: string, key: 'enabled' | 'required') => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, [key]: !f[key] } : f));
    setDirty(prev => {
      const f = fields.find(x => x.id === id)!;
      return { ...prev, [id]: { ...(prev[id] || {}), [key]: !f[key] } };
    });
  };

  const save = async () => {
    const updates = Object.entries(dirty).map(([id, ch]) => ({ id, ...ch }));
    if (!updates.length) return;
    setSaving(true);
    try { setFields(await updateOnbFields(updates as any)); setDirty({}); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
    finally { setSaving(false); }
  };

  const publicLink = typeof window !== 'undefined' ? `${window.location.origin}${PUBLIC_PATH}` : PUBLIC_PATH;
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(publicLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ }
  };

  const dirtyCount = Object.keys(dirty).length;

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {/* Link public cố định */}
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="h-4 w-4 text-indigo-400" />
          <p className="text-sm font-600 text-foreground">Link biểu mẫu công khai</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Gửi link này cho nhân sự mới. Họ điền và gửi mà <b>không cần tài khoản</b>. Bài nộp sẽ xuất hiện ở tab &quot;Nhân Sự Mới&quot;.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input readOnly value={publicLink} className="flex-1 h-9 px-3 rounded-lg text-xs text-indigo-300 bg-surface-2 border border-line focus:outline-none" />
          <div className="flex gap-2">
            <button onClick={copyLink} className="btn-ghost rounded-lg border border-line px-3 py-2 text-xs flex items-center gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Link2 className="h-3.5 w-3.5" />} Copy
            </button>
            <a href={PUBLIC_PATH} target="_blank" rel="noreferrer" className="btn-ghost rounded-lg border border-line px-3 py-2 text-xs flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Xem thử
            </a>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" /> Bật/tắt trường hiển thị và đặt bắt buộc cho biểu mẫu
        </p>
        {dirtyCount > 0 && (
          <button onClick={save} disabled={saving} className="btn-indigo rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu {dirtyCount} thay đổi
          </button>
        )}
      </div>

      {sections.map(({ key, items }) => (
        <div key={key} className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
          <div className="border-b border-line-subtle px-5 py-3.5">
            <h3 className="text-sm font-600 text-foreground">{SECTION_TITLES[key]}</h3>
          </div>
          <ul className="divide-y divide-line-subtle">
            {items.map(f => (
              <li key={f.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-500 truncate flex items-center gap-1.5 ${f.enabled ? 'text-foreground' : 'text-muted-foreground/50 line-through'}`}>
                    {f.label}
                    {isRecruiterOnlyField(f.field_key) && (
                      <span className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-600 text-amber-300 normal-case">
                        Chỉ Tuyển dụng
                      </span>
                    )}
                  </p>
                  {f.help_text && <p className="text-2xs text-muted-foreground truncate">{f.help_text}</p>}
                </div>
                <button onClick={() => toggle(f.id, 'required')} disabled={!f.enabled}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-2xs font-600 border disabled:opacity-30 ${f.required ? 'border-red-500/40 bg-red-500/15 text-red-300' : 'border-line text-muted-foreground'}`}>
                  <Asterisk className="h-3 w-3" /> Bắt buộc
                </button>
                <button onClick={() => toggle(f.id, 'enabled')} title={f.enabled ? 'Đang bật' : 'Đang tắt'}>
                  {f.enabled ? <ToggleRight className="h-6 w-6 text-emerald-400" /> : <ToggleLeft className="h-6 w-6 text-muted-foreground/40" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Cấu hình loại giấy tờ đính kèm */}
      <DocTypeConfigSection />
    </div>
  );
}

/** Cấu hình loại giấy tờ đính kèm cho biểu mẫu onboarding (hr_document_types). */
function DocTypeConfigSection() {
  const toast = useToast();
  const [types, setTypes] = useState<OnbDocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      try { setTypes(await listDocTypes()); } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, []);

  const toggle = async (t: OnbDocType, key: 'onboarding_visible' | 'onboarding_required' | 'onboarding_multiple') => {
    const next = !t[key];
    setTypes(prev => prev.map(x => x.id === t.id ? { ...x, [key]: next } : x));
    setBusyId(t.id);
    try { await updateDocType(t.id, { [key]: next }); }
    catch (e) { setTypes(prev => prev.map(x => x.id === t.id ? { ...x, [key]: !next } : x)); toast.error(e instanceof Error ? e.message : 'Lỗi'); }
    finally { setBusyId(null); }
  };

  const addType = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const created = await createDocType({ name, onboarding_visible: true });
      setTypes(prev => [...prev, created]);
      setNewName('');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
    finally { setAdding(false); }
  };

  return (
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
      <div className="border-b border-line-subtle px-5 py-3.5">
        <h3 className="text-sm font-600 text-foreground flex items-center gap-1.5">
          <Paperclip className="h-4 w-4 text-indigo-400" /> Loại Giấy Tờ Đính Kèm
        </h3>
        <p className="text-2xs text-muted-foreground mt-0.5">
          Mỗi loại là 1 ô đính kèm trên form. Bật <b>Hiện</b> để hiển thị, <b>Bắt buộc</b> để ứng viên phải nộp. Khi duyệt, hồ sơ tự vào đúng loại trong Quản Lý Hồ Sơ.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {types.map(t => (
            <li key={t.id} className="flex items-center gap-2 px-5 py-3">
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-500 truncate ${t.onboarding_visible ? 'text-foreground' : 'text-muted-foreground/50'}`}>{t.name}</p>
                {!t.is_active && <p className="text-2xs text-amber-400/70">Đã ẩn khỏi danh mục</p>}
              </div>
              <button onClick={() => toggle(t, 'onboarding_required')} disabled={!t.onboarding_visible || busyId === t.id}
                title="Bắt buộc đính kèm"
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-2xs font-600 border disabled:opacity-30 ${t.onboarding_required ? 'border-red-500/40 bg-red-500/15 text-red-300' : 'border-line text-muted-foreground'}`}>
                <Asterisk className="h-3 w-3" /> Bắt buộc
              </button>
              <button onClick={() => toggle(t, 'onboarding_multiple')} disabled={!t.onboarding_visible || busyId === t.id}
                title="Cho phép nhiều tệp"
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-2xs font-600 border disabled:opacity-30 ${t.onboarding_multiple ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300' : 'border-line text-muted-foreground'}`}>
                <Files className="h-3 w-3" /> Nhiều tệp
              </button>
              <button onClick={() => toggle(t, 'onboarding_visible')} disabled={busyId === t.id} title={t.onboarding_visible ? 'Đang hiện trên form' : 'Đang ẩn'}>
                {t.onboarding_visible ? <ToggleRight className="h-6 w-6 text-emerald-400" /> : <ToggleLeft className="h-6 w-6 text-muted-foreground/40" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Thêm loại mới */}
      <div className="flex items-center gap-2 border-t border-line-subtle px-5 py-3">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addType(); }}
          placeholder="Tên loại giấy tờ mới (vd: CCCD mặt trước)"
          className="flex-1 h-9 px-3 rounded-lg text-sm bg-surface-2 border border-line text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none"
        />
        <button onClick={addType} disabled={adding || !newName.trim()} className="btn-indigo rounded-lg px-3 py-2 text-sm font-600 flex items-center gap-1.5 disabled:opacity-40">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Thêm
        </button>
      </div>
    </div>
  );
}
