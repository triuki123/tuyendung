'use client';

import React, { useEffect, useState } from 'react';
import { Tag, Plus, Trash2, Loader2, AlertCircle, X } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  is_active?: boolean;
}

const PRESET_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

/**
 * Quản lý danh mục Loại tài sản (master data) — thêm/xoá tại đây, form chỉ chọn.
 * Dùng API /api/asset-categories (GET/POST/DELETE soft-delete).
 */
export default function AssetCategoriesManager({ canEdit }: { canEdit: boolean }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/asset-categories');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Không tải được danh mục');
      setCategories(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      setError(e.message || 'Lỗi tải danh mục');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    const value = name.trim();
    if (!value) return;
    if (categories.some(c => c.name.toLowerCase() === value.toLowerCase())) {
      setError('Loại tài sản này đã tồn tại');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/asset-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value, color }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Không thêm được');
      setName('');
      setColor(PRESET_COLORS[0]);
      await load();
    } catch (e: any) {
      setError(e.message || 'Lỗi thêm loại tài sản');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/asset-categories?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Không xoá được');
      setConfirmId(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Lỗi xoá loại tài sản');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
          <Tag className="h-4.5 w-4.5 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-base font-700 text-foreground">Loại Tài Sản</h2>
          <p className="text-xs text-muted-foreground">Danh mục dùng chung — form thêm/sửa tài sản chỉ chọn từ đây</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* Thêm mới */}
        {canEdit && (
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex items-center gap-1.5 shrink-0">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-offset-[var(--card)] ring-white/60 scale-110' : ''}`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="Tên loại tài sản mới (VD: Laptop, Máy in…)"
              className="flex-1 h-10 px-3 rounded-xl text-sm bg-surface-2 border border-line text-foreground placeholder:text-ink-faint focus:outline-none focus:border-indigo/60"
            />
            <button
              onClick={handleAdd}
              disabled={saving || !name.trim()}
              className="h-10 px-4 rounded-xl btn-accent text-sm font-600 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Thêm
            </button>
          </div>
        )}

        {/* Danh sách */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <Tag className="h-9 w-9 mb-2 opacity-30" />
            <p className="text-sm">Chưa có loại tài sản nào</p>
            {canEdit && <p className="text-xs mt-1 opacity-60">Thêm loại đầu tiên ở ô phía trên</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {categories.map(cat => (
              <div
                key={cat.id}
                className="flex items-center gap-2.5 rounded-xl border border-white/5 px-3 py-2.5"
                style={{ background: 'var(--secondary)' }}
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color || '#6366f1' }} />
                <span className="text-sm text-foreground truncate flex-1">{cat.name}</span>
                {canEdit && (
                  confirmId === cat.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleDelete(cat.id)}
                        disabled={deletingId === cat.id}
                        className="text-2xs font-600 text-red-400 hover:text-red-300 px-2 py-1 rounded-lg bg-red-500/10"
                      >
                        {deletingId === cat.id ? '...' : 'Xoá'}
                      </button>
                      <button onClick={() => setConfirmId(null)} className="text-2xs text-muted-foreground px-1">Huỷ</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(cat.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                      title="Xoá loại tài sản"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
