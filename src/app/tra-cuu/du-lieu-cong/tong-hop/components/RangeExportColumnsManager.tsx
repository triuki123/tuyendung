'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarRange, Loader2, ChevronUp, ChevronDown, Eye, EyeOff,
  Trash2, Plus, RotateCcw, Save, GripVertical, X, Check, Layers,
} from 'lucide-react';
import {
  DEFAULT_RANGE_COLUMNS, RANGE_FIELDS, RANGE_FIELD_MAP, LEAVE_ALL, LEAVE_PREFIX,
  rangeColumnLabel, type RangeColumnConfig, type RangeFieldMeta,
} from '@/lib/rangeExportCatalog';
import { useConfirm } from '@/context/ConfirmContext';

interface Props { userRole: string; deptId?: string; }

let _uid = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now()}_${++_uid}`;

function sourceBadge(c: RangeColumnConfig): { text: string; cls: string } {
  if (c.source === LEAVE_ALL) return { text: 'Tự sinh', cls: 'bg-emerald-500/15 text-emerald-300' };
  if (c.source.startsWith(LEAVE_PREFIX)) return { text: 'Loại nghỉ', cls: 'bg-violet-500/15 text-violet-300' };
  if (c.source === 'manual') return { text: 'Thủ công', cls: 'bg-amber-500/15 text-amber-300' };
  if (c.source === 'spacer') return { text: 'Đệm', cls: 'bg-hover-strong text-muted-foreground' };
  const f = RANGE_FIELD_MAP.get(c.source);
  if (!f) return { text: 'Không rõ', cls: 'bg-rose-500/15 text-rose-300' };
  return { text: f.group, cls: 'bg-indigo-500/15 text-indigo-300' };
}

/**
 * Tab "Cấu Hình Xuất Dữ Liệu Công" — tùy chỉnh cột file Excel/CSV của nút
 * "Xuất Dữ Liệu Công" (bảng phẳng theo khoảng ngày).
 */
export default function RangeExportColumnsManager({ userRole, deptId }: Props) {
  const confirm = useConfirm();
  const [columns, setColumns] = useState<RangeColumnConfig[]>([]);
  const [leaveLabels, setLeaveLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/attendance/range-export-config', { cache: 'no-store' });
      const json = await res.json();
      setColumns(Array.isArray(json.columns) && json.columns.length ? json.columns : DEFAULT_RANGE_COLUMNS);
      setLeaveLabels(Array.isArray(json.leaveLabels) ? json.leaveLabels : []);
    } catch {
      setColumns(DEFAULT_RANGE_COLUMNS);
    } finally { setLoading(false); setDirty(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (next: RangeColumnConfig[]) => { setColumns(next); setDirty(true); setMsg(''); setErr(''); };

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

  const addField = (key: string) => {
    update([...columns, { id: nextId(key), source: key }]);
    setShowAdd(false); setAddQuery('');
  };
  const addLeave = (label: string) => {
    update([...columns, { id: nextId('leave'), source: LEAVE_PREFIX + label }]);
    setShowAdd(false); setAddQuery('');
  };
  const addLeaveAll = () => {
    if (columns.some((c) => c.source === LEAVE_ALL)) { setErr('Đã có cột "Tất cả loại nghỉ" rồi'); return; }
    update([...columns, { id: nextId(LEAVE_ALL), source: LEAVE_ALL }]);
    setShowAdd(false);
  };
  const addManual = () => update([...columns, { id: nextId('manual'), source: 'manual', header: 'Cột mới', width: 14, type: 'text' }]);
  const addSpacer = () => update([...columns, { id: nextId('spacer'), source: 'spacer', width: 3 }]);

  const reset = async () => {
    if (!(await confirm({ title: 'Khôi phục mặc định?', message: 'Khôi phục bố cục cột mặc định? Mọi tùy chỉnh hiện tại sẽ bị thay thế.', confirmLabel: 'Khôi phục', danger: true }))) return;
    update(DEFAULT_RANGE_COLUMNS.map((c) => ({ ...c })));
  };

  const save = async () => {
    setSaving(true); setMsg(''); setErr('');
    try {
      const res = await fetch('/api/attendance/range-export-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-current-user-role': userRole, 'x-current-user-dept': deptId ?? '' },
        body: JSON.stringify({ columns }),
      });
      const json = await res.json();
      if (json.success) { setDirty(false); setMsg('Đã lưu cấu hình'); }
      else setErr(json.error ?? 'Lỗi khi lưu');
    } catch {
      setErr('Lỗi kết nối khi lưu');
    } finally { setSaving(false); }
  };

  // Loại nghỉ đã được khai báo riêng → ẩn khỏi danh sách thêm để khỏi trùng cột.
  const usedLeave = useMemo(
    () => new Set(columns.filter((c) => c.source.startsWith(LEAVE_PREFIX)).map((c) => c.source.slice(LEAVE_PREFIX.length))),
    [columns]
  );
  const hasLeaveAll = columns.some((c) => c.source === LEAVE_ALL && c.enabled !== false);

  // Số cột thật sự ra file: cột thường + khối tự sinh bung ra.
  const visibleCount = useMemo(() => {
    const fixed = columns.filter((c) => c.enabled !== false && c.source !== 'spacer' && c.source !== LEAVE_ALL).length;
    const auto = hasLeaveAll ? leaveLabels.filter((l) => !usedLeave.has(l)).length : 0;
    return fixed + auto;
  }, [columns, hasLeaveAll, leaveLabels, usedLeave]);

  const q = addQuery.trim().toLowerCase();
  const filteredFields: RangeFieldMeta[] = useMemo(
    () => RANGE_FIELDS.filter((f) => !q || f.label.toLowerCase().includes(q) || f.group.toLowerCase().includes(q)),
    [q]
  );
  const filteredLeave = useMemo(
    () => leaveLabels.filter((l) => !usedLeave.has(l) && (!q || l.toLowerCase().includes(q))),
    [leaveLabels, usedLeave, q]
  );

  return (
    <div>
      <div className="mb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-indigo-400" /> Cấu Hình Xuất Dữ Liệu Công
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tùy chỉnh cột file xuất ra từ nút &ldquo;Xuất Dữ Liệu Công&rdquo;: bật/tắt, đổi thứ tự, đổi tên, thêm cột thủ công. Đổi xong, lần xuất sau áp dụng ngay.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={reset} className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm" title="Khôi phục bố cục mặc định">
            <RotateCcw className="h-4 w-4" /> Mặc định
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
      {err && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs text-rose-300">
          <X className="h-3.5 w-3.5" /> {err}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {columns.length} dòng cấu hình · <span className="text-indigo-300 font-600">{visibleCount}</span> cột ra file
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
                <Plus className="h-3.5 w-3.5" /> Thêm cột
              </button>
              {showAdd && (
                <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-xl border border-line shadow-xl" style={{ background: 'var(--card)' }}>
                  <div className="flex items-center justify-between border-b border-line-subtle px-3 py-2">
                    <span className="text-xs font-600 text-foreground">Nguồn dữ liệu có sẵn</span>
                    <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="p-2">
                    <input value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder="Tìm trường / loại nghỉ..."
                      className="h-8 w-full rounded-lg border border-line bg-surface-2 px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none" />
                  </div>
                  <div className="max-h-72 overflow-y-auto pb-1">
                    {filteredFields.length > 0 && (
                      <p className="px-3 pt-1 pb-1 text-[10px] font-600 uppercase tracking-wider text-muted-foreground">Cột dữ liệu</p>
                    )}
                    {filteredFields.map((f) => (
                      <button key={f.key} onClick={() => addField(f.key)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-hover transition-colors">
                        <span className="text-xs text-foreground truncate">{f.label}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{f.group}</span>
                      </button>
                    ))}

                    <p className="px-3 pt-2 pb-1 text-[10px] font-600 uppercase tracking-wider text-muted-foreground">Nghỉ / bù công</p>
                    {!columns.some((c) => c.source === LEAVE_ALL) && (
                      <button onClick={addLeaveAll}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-hover transition-colors">
                        <Layers className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                        <span className="text-xs text-foreground truncate">Tất cả loại nghỉ (tự sinh)</span>
                      </button>
                    )}
                    {filteredLeave.map((l) => (
                      <button key={l} onClick={() => addLeave(l)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-hover transition-colors">
                        <span className="text-xs text-foreground truncate">{l}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">riêng</span>
                      </button>
                    ))}
                    {filteredFields.length === 0 && filteredLeave.length === 0 && (
                      <p className="px-3 py-3 text-xs text-muted-foreground">Không tìm thấy trường</p>
                    )}
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
              const isAuto = c.source === LEAVE_ALL;
              return (
                <div key={c.id}
                  className={`flex items-center gap-2 border-b border-white/[0.04] last:border-0 px-3 py-2 transition-colors ${hidden ? 'opacity-40' : ''}`}>
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                  <span className="w-6 text-center text-[11px] text-muted-foreground flex-shrink-0">{i + 1}</span>

                  {/* Nhãn / đổi tên */}
                  {isSpacer ? (
                    <span className="flex-1 text-xs text-muted-foreground italic">— cột đệm (trống) —</span>
                  ) : isAuto ? (
                    <span className="flex-1 min-w-0 text-xs text-emerald-300 truncate">
                      Tất cả loại nghỉ / bù công — tự sinh {leaveLabels.filter((l) => !usedLeave.has(l)).length} cột
                    </span>
                  ) : (
                    <input
                      value={c.header ?? rangeColumnLabel({ ...c, header: undefined })}
                      onChange={(e) => rename(i, e.target.value)}
                      placeholder={rangeColumnLabel(c)}
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
            Cột &ldquo;Tự sinh&rdquo; tự bám danh mục loại nghỉ — thêm loại nghỉ mới trong hệ thống là file xuất có ngay, khỏi sửa lại đây.
            Muốn tự sắp thứ tự một loại cụ thể thì thêm nó thành cột riêng, khối tự sinh sẽ bỏ qua loại đó.
            Cột &ldquo;Thủ công&rdquo; xuất ra ô trống để HR tự điền.
          </p>
        </>
      )}
    </div>
  );
}
