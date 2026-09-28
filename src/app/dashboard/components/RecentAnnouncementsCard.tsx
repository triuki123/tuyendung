'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pin, ArrowRight, Loader2, Paperclip, ImageIcon, X, FileText, ExternalLink } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

interface Announcement {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  published_at: string | null;
  created_at: string;
  author_name: string | null;
  author_avatar: string | null;
  attachment_count?: number;
  image_count?: number;
  reactions?: Record<string, number> | null;
}

interface Attachment {
  id: string;
  file_name: string;
  mime_type: string | null;
  is_image: boolean;
}

const AVATAR_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444'];

function timeAgo(dateStr: string | null) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function initials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * Thẻ Dashboard hiển thị các thông báo ĐANG ĐƯỢC GHIM với ĐẦY ĐỦ nội dung.
 * Dùng chung cho mọi role. Dữ liệu service đã sort ghim trước → lọc pinned.
 */
export default function RecentAnnouncementsCard() {
  const [posts, setPosts] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Popup chi tiết thông báo khi click
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attLoading, setAttLoading] = useState(false);

  function openPost(p: Announcement) {
    setSelected(p);
    setAttachments([]);
    if ((p.attachment_count ?? 0) > 0 || (p.image_count ?? 0) > 0) {
      setAttLoading(true);
      fetch(`/api/announcements/${p.id}/attachments`)
        .then(r => r.json())
        .then(j => { if (j.success && Array.isArray(j.data)) setAttachments(j.data); })
        .catch(() => {})
        .finally(() => setAttLoading(false));
    }
  }

  const load = async () => {
    setLoading(true);
    setError(false);
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    let role = '', id = '', perms = '{}';
    if (stored) {
      try {
        const u = JSON.parse(stored);
        role = u.role ?? '';
        id = u.id ?? '';
        perms = JSON.stringify(u.module_permissions ?? {});
      } catch { /* empty */ }
    }
    try {
      const res = await fetch('/api/announcements', {
        headers: {
          'x-current-user-role': role,
          'x-current-user-id': id,
          'x-user-permissions': perms,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setPosts(json.data.filter((p: Announcement) => p.pinned));
      } else {
        throw new Error('Phản hồi không hợp lệ');
      }
    } catch (e) {
      console.error('Error loading announcements:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
    <div className="rounded-2xl border border-line-subtle overflow-hidden" style={{ background: 'var(--card)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-line-subtle">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-500/15 shrink-0">
            <Pin size={16} className="text-amber-400 fill-amber-400/30" />
          </div>
          <div>
            <h3 className="text-base font-600 text-foreground leading-tight">Thông Báo - Truyền Thông</h3>
            <p className="text-2xs text-muted-foreground">Thông báo đang được ghim</p>
          </div>
        </div>
        <Link
          href="/tra-cuu/thong-bao"
          className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors shrink-0"
        >
          Xem tất cả <ArrowRight size={13} />
        </Link>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <Pin className="h-9 w-9 mb-2.5 opacity-30" />
          <p className="text-sm">Chưa có thông báo nào được ghim</p>
          <p className="text-2xs mt-1 opacity-60">Ghim thông báo quan trọng để hiển thị đầy đủ tại đây</p>
        </div>
      ) : (
        <div className="divide-y divide-line-subtle">
          {posts.slice(0, 4).map(p => {
            const color = AVATAR_COLORS[(p.author_name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
            const reactionList = p.reactions
              ? Object.entries(p.reactions).filter(([, n]) => Number(n) > 0)
              : [];
            return (
              <article
                key={p.id}
                onClick={() => openPost(p)}
                className="px-4 sm:px-5 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors"
              >
                {/* Tác giả + thời gian + nhãn ghim */}
                <div className="flex items-center gap-2.5 mb-1.5">
                  {p.author_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.author_avatar} alt={p.author_name ?? ''} className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: color }}
                    >
                      {initials(p.author_name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-600 text-foreground truncate">{p.author_name ?? 'Hệ thống'}</p>
                    <p className="text-2xs text-muted-foreground">{timeAgo(p.published_at ?? p.created_at)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-2xs font-600 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 shrink-0">
                    <Pin size={11} className="fill-amber-400/40" /> Đã ghim
                  </span>
                </div>

                {/* Tiêu đề (nếu có) */}
                {p.title?.trim() && (
                  <h4 className="text-sm font-700 text-foreground mb-0.5 truncate">{p.title}</h4>
                )}

                {/* Nội dung — rút gọn 2 dòng (bấm "Xem tất cả" để đọc đầy đủ) */}
                <p className="text-xs text-foreground/80 break-words leading-relaxed line-clamp-2">
                  {p.content}
                </p>

                {/* Đính kèm + reactions */}
                {(reactionList.length > 0 || (p.attachment_count ?? 0) > 0 || (p.image_count ?? 0) > 0) && (
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 mt-2">
                    {(p.image_count ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
                        <ImageIcon size={12} /> {p.image_count} ảnh
                      </span>
                    )}
                    {(p.attachment_count ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
                        <Paperclip size={12} /> {p.attachment_count} tệp
                      </span>
                    )}
                    {reactionList.map(([emoji, n]) => (
                      <span key={emoji} className="inline-flex items-center gap-1 text-2xs text-muted-foreground bg-hover rounded-full px-2 py-0.5">
                        <span>{emoji}</span> {n}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>

    {/* Popup chi tiết thông báo */}
    {selected && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={() => setSelected(null)}
      >
        <div
          className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl border border-line overflow-hidden"
          style={{ background: 'var(--card)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header modal */}
          <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {selected.author_avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.author_avatar} alt={selected.author_name ?? ''} className="w-9 h-9 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: AVATAR_COLORS[(selected.author_name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length] }}>
                  {initials(selected.author_name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-600 text-foreground truncate">{selected.author_name ?? 'Hệ thống'}</p>
                <p className="text-2xs text-muted-foreground">{timeAgo(selected.published_at ?? selected.created_at)}</p>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="btn-ghost rounded-lg p-1.5 shrink-0" aria-label="Đóng">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Body modal — cuộn được */}
          <div className="overflow-y-auto px-5 py-4">
            {selected.pinned && (
              <span className="inline-flex items-center gap-1 text-2xs font-600 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 mb-2">
                <Pin size={11} className="fill-amber-400/40" /> Đã ghim
              </span>
            )}
            {selected.title?.trim() && (
              <h2 className="text-lg font-700 text-foreground mb-2">{selected.title}</h2>
            )}
            <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
              {selected.content}
            </p>

            {/* Ảnh + tệp đính kèm */}
            {attLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : attachments.length > 0 && (
              <div className="mt-4 space-y-3">
                {attachments.filter(a => a.is_image).length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {attachments.filter(a => a.is_image).map(a => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={a.id}
                        src={`/api/announcements/${selected.id}/attachments/${a.id}`}
                        alt={a.file_name}
                        className="w-full rounded-xl border border-line object-cover"
                        style={{ maxHeight: 220 }}
                      />
                    ))}
                  </div>
                )}
                {attachments.filter(a => !a.is_image).map(a => (
                  <a
                    key={a.id}
                    href={`/api/announcements/${selected.id}/attachments/${a.id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-xl border border-line bg-hover px-3 py-2 hover:bg-hover-strong transition-colors"
                  >
                    <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                    <span className="text-sm text-foreground truncate flex-1">{a.file_name}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Footer modal */}
          <div className="flex justify-end border-t border-line-subtle px-5 py-3 shrink-0">
            <Link href="/tra-cuu/thong-bao" className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
              Mở trang Thông Báo <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
