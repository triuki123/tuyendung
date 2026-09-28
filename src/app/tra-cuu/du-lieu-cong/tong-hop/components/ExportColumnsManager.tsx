'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet, Loader2, ChevronUp, ChevronDown, Eye, EyeOff,
  Trash2, Plus, RotateCcw, Save, GripVertical, X, Check,
} from 'lucide-react';
import {
  DEFAULT_COLUMNS, catalogMeta, type ColumnConfig, type FieldMeta,
} from '@/lib/attendanceExportCatalog';
import { useConfirm } from '@/context/ConfirmContext';

interface Props { userRole: string; deptId?: string; }

let _uid = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now()}_${++_uid}`;

const CATALOG: FieldMeta[] = catalogMeta();
const CATALOG_LABEL = new Map(CATALOG.map((f) => [f.key, f]));

/** Nhãn hiển thị của 1 cột (header tự đặt, hoặc nhãn gốc trong catalog). */
function colLabel(c: ColumnConfig): string {
  if (c.header) return c.header.replace(/\n/g, ' ');
  if (c.source === 'manual') return 'Cột thủ công';
  if (c.source === 'spacer') return 'Cột đệm';
  return CATALOG_LABEL.get(c.source)?.label ?? c.source;
}

function sourceBadge(c: ColumnConfig): { text: string; cls: string } {
  if (c.source === 'manual') return { text: 'Thủ công', cls: 'bg-amber-500/15 text-amber-300' };
  if (c.source === 'spacer') return { text: 'Đệm', cls: 'bg-hover-strong text-muted-foreground' };
  const f = CATALOG_LABEL.get(c.source);
  if (!f) return { text: 'Không rõ', cls: 'bg-rose-500/15 text-rose-300' };
  return { text: f.group || 'Dữ liệu', cls: 'bg-indigo-500/15 text-indigo-300' };
}

export default function ExportColumnsManager({ userRole, deptId }: Props) {
  const confirm = useConfirm();
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/attendance/export-config', { cache: 'no-store' });
      const json = await res.json();
      setColumns(Array.isArray(json.columns) && json.columns.length ? json.columns : DEFAULT_COLUMNS);
    } catch {
      setColumns(DEFAULT_COLUMNS);
    } finally { setLoading(false); setDirty(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (next: ColumnConfig[]) => { setColumns(next); setDirty(true); setMsg(''); };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= columns.length) return;
    const next = [...columns];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };
  const toggle = (i: number) => {
    const next = [...columns];
    next[i] = { ...next[i], enabled: next[i].enabled === false };
    update(next);
  };
  const rename = (i: number, header: string) => {
    const next = [...columns];
    next[i] = { ...next[i], header: header || undefined };
    update(next);
  };
  const remove = (i: number) => update(columns.filter((_, k) => k !== i));

  const addCatalog = (key: string) => {
    update([...columns, { id: nextId(key), source: key }]);
    setShowAdd(false); setAddQuery('');
  };
  const addManual = () => update([...columns, { id: nextId('manual'), source: 'manual', header: 'Cột mới', width: 14, type: 'text' }]);
  const addSpacer = () => update([...columns, { id: nextId('spacer'), source: 'spacer', width: 3 }]);

  const reset = async () => {
    if (!(await confirm({ title: 'Khôi phục mẫu gốc?', message: 'Khôi phục về mẫu gốc DETAIL_fill? Mọi tùy chỉnh cột hiện tại sẽ bị thay thế.', confirmLabel: 'Khôi phục', danger: true }))) return;
    update(DEFAULT_COLUMNS.map((c) => ({ ...c })));
  };

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/attendance/export-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-current-user-role': userRole, 'x-current-user-dept': deptId ?? '' },
        body: JSON.stringify({ columns }),
      });
      const json = await res.json();
      if (json.success) { setDirty(false); setMsg('Đã lưu cấu hình'); }
      else setMsg(json.error ?? 'Lỗi khi lưu');
    } catch {
      setMsg('Lỗi kết nối khi lưu');
    } finally { setSaving(false); }
  };

  const visibleCount = useMemo(() => columns.filter((c) => c.enabled !== false && c.source !== 'spacer').length, [columns]);
  const filteredCatalog = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    return CATALOG.filter((f) => !q || f.label.toLowerCase().includes(q) || (f.group ?? '').toLowerCase().includes(q));
  }, [addQuery]);

  return (
    <div>
      <div className="mb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-indigo-400" /> Cấu Hình Xuất Bảng Công
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tùy chỉnh cột file Excel xuất ra: bật/tắt, đổi thứ tự, đổi tên, thêm cột thủ công. Đổi xong, lần xuất sau áp dụng ngay.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={reset} className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm" title="Khôi phục mẫu gốc">
            <RotateCcw className="h-4 w-4" /> Mẫu gốc
          </button>
          <button onClick={save} disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu
          </button>
        </div>
      </div>

      {msg && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-300">
          <Check className="h-3.5 w-3.5" /> {msg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {columns.length} cột · <span className="text-indigo-300 font-600">{visibleCount}</span> cột dữ liệu hiển thị
              {dirty && <span className="ml-2 text-amber-400">• chưa lưu</span>}
            </p>
            <div className="relative flex items-center gap-2">
              <button onClick={addManual} className="btn-ghost inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Cột thủ công
              </button>
              <button onClick={addSpacer} className="btn-ghost inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Cột đệm
              </button>
              <button onClick={() => setShowAdd((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/15 px-2.5 py-1.5 text-xs font-600 text-indigo-300 hover:bg-indigo-500/25 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Thêm từ catalog
              </button>
              {showAdd && (
                <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-line shadow-xl" style={{ background: 'var(--card)' }}>
                  <div className="flex items-center justify-between border-b border-line-subtle px-3 py-2">
                    <span className="text-xs font-600 text-foreground">Nguồn dữ liệu có sẵn</span>
                    <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="p-2">
                    <input value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder="Tìm trường..."
                      className="h-8 w-full rounded-lg border border-line bg-surface-2 px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none" />
                  </div>
                  <div className="max-h-64 overflow-y-auto pb-1">
                    {filteredCatalog.map((f) => (
                      <button key={f.key} onClick={() => addCatalog(f.key)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-hover transition-colors">
                        <span className="text-xs text-foreground truncate">{f.label}</span>
                        {f.group && <span className="text-[10px] text-muted-foreground flex-shrink-0">{f.group}</span>}
                      </button>
                    ))}
                    {filteredCatalog.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Không tìm thấy trường</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
            {columns.map((c, i) => {
              const hidden = c.enabled === false;
              const badge = sourceBadge(c);
              const isSpacer = c.source === 'spacer';
              return (
                <div key={c.id}
                  className={`flex items-center gap-2 border-b border-white/[0.04] last:border-0 px-3 py-2 transition-colors ${hidden ? 'opacity-40' : ''}`}>
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                  <span className="w-6 text-center text-[11px] text-muted-foreground flex-shrink-0">{i + 1}</span>

                  {/* Nhãn / đổi tên */}
                  {isSpacer ? (
                    <span className="flex-1 text-xs text-muted-foreground italic">— cột đệm (trống) —</span>
                  ) : (
                    <input
                      value={c.header ?? CATALOG_LABEL.get(c.source)?.label ?? ''}
                      onChange={(e) => rename(i, e.target.value)}
                      placeholder={colLabel(c)}
                      className="flex-1 min-w-0 h-8 rounded-lg border border-line bg-surface-2 px-2.5 text-xs text-foreground focus:border-indigo-500/60 focus:outline-none"
                    />
                  )}

                  <span className={`hidden sm:inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-600 flex-shrink-0 ${badge.cls}`}>{badge.text}</span>

                  {/* Điều khiển */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => move(i, -1)} disabled={i === 0}
                      className="rounded p-1 text-muted-foreground hover:bg-hover-strong hover:text-foreground disabled:opacity-20 transition-colors" title="Lên"><ChevronUp className="h-4 w-4" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === columns.length - 1}
                      className="rounded p-1 text-muted-foreground hover:bg-hover-strong hover:text-foreground disabled:opacity-20 transition-colors" title="Xuống"><ChevronDown className="h-4 w-4" /></button>
                    <button onClick={() => toggle(i)}
                      className="rounded p-1 text-muted-foreground hover:bg-hover-strong hover:text-foreground transition-colors" title={hidden ? 'Hiện cột' : 'Ẩn cột'}>
                      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button onClick={() => remove(i)}
                      className="rounded p-1 text-muted-foreground hover:bg-hover-strong hover:text-rose-400 transition-colors" title="Xóa cột"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground/70">
            Cột "Thủ công" xuất ra ô trống để HR tự điền. Cột "Dữ liệu" tự lấy số từ hệ thống. Muốn thêm nguồn dữ liệu mới chưa có trong catalog cần lập trình bổ sung.
          </p>
        </>
      )}
    </div>
  );
}
