'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Megaphone, Plus, Pin, Trash2, X } from 'lucide-react';

/** Bảng tin kho — quản lý đăng thông báo */
export default function PostsTab({ warehouseId }: { warehouseId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/admin/posts?warehouseId=${warehouseId}`);
      const json = await res.json();
      setRows(json.data || []);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    await fetch(`/api/warehouse/admin/posts?warehouseId=${warehouseId}&id=${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-700 text-foreground">Bảng tin</h2>
        <button onClick={() => setShowCreate(true)} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-600 text-white flex items-center gap-2">
          <Plus className="h-4 w-4" /> Đăng tin
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Megaphone className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có tin nào</p>
          <p className="text-xs mt-1 opacity-60">Đăng thông báo nghỉ lễ, tăng ca, đổi ca... công nhân sẽ thấy trên app</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <div key={p.id} className={`rounded-2xl border p-4 ${p.pinned ? 'border-indigo-500/30' : 'border-white/5'}`} style={{ background: 'var(--card)' }}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-600 text-foreground flex items-center gap-2">
                  {p.pinned && <Pin className="h-3.5 w-3.5 text-indigo-400" />} {p.title}
                </h3>
                <button onClick={() => remove(p.id)} className="btn-ghost rounded-lg p-1.5" title="Xóa">
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </button>
              </div>
              {p.content && <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">{p.content}</p>}
              <p className="text-[11px] text-muted-foreground/60 mt-2">
                {new Date(p.created_at).toLocaleDateString('vi-VN')} {p.author_name ? `· ${p.author_name}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreatePostModal warehouseId={warehouseId} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreatePostModal({ warehouseId, onClose, onSaved }: { warehouseId: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await fetch('/api/warehouse/admin/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouseId, title, content, pinned }),
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Đăng tin mới</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Tiêu đề *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Nghỉ lễ 2/9"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground" />
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Nội dung</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#162033] px-3 py-2.5 text-sm text-foreground resize-none" />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="rounded" />
            Ghim lên đầu bảng tin
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Hủy</button>
          <button onClick={submit} disabled={busy || !title}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Đăng
          </button>
        </div>
      </div>
    </div>
  );
}
