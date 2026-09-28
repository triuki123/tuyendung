'use client';

import { useEffect, useState } from 'react';
import { Loader2, Megaphone, Pin } from 'lucide-react';

/** Bảng tin kho */
export default function NewsView() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/warehouse/posts')
      .then((r) => r.json())
      .then((j) => setRows(j.data || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-700 text-foreground">Bảng tin</h2>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <Megaphone className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có thông báo nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <div key={p.id} className={`rounded-2xl border p-4 ${p.pinned ? 'border-indigo-500/30' : 'border-white/5'}`} style={{ background: 'var(--card)' }}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-600 text-foreground">{p.title}</h3>
                {p.pinned && <Pin className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />}
              </div>
              {p.content && <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">{p.content}</p>}
              <p className="text-[11px] text-muted-foreground/60 mt-2">
                {new Date(p.created_at).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' })}
                {p.author_name ? ` · ${p.author_name}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
