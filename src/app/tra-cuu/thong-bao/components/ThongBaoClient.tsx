'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Image, Send, Trash2, Loader2, Globe, Lock, Pin, PinOff, Pencil, X, Check, FileText } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

interface Announcement {
  id: string;
  title: string;
  content: string;
  status: string;
  pinned: boolean;
  telegram_sent: boolean;
  published_at: string | null;
  created_at: string;
  created_by: string | null;
  author_name: string | null;
  author_avatar: string | null;
  attachment_count: number;
  image_count: number;
  reactions?: Record<string, number> | null;
}

interface Attachment {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  is_image: boolean;
}

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function timeAgo(dateStr: string | null) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getInitials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
}

function Avatar({ name, avatar, size = 40 }: { name: string | null; avatar: string | null; size?: number }) {
  const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444'];
  const color = colors[(name?.charCodeAt(0) ?? 0) % colors.length];
  if (avatar) {
    return <img src={avatar} alt={name ?? ''} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold"
      style={{ width: size, height: size, background: color, fontSize: size * 0.35 }}
    >
      {getInitials(name)}
    </div>
  );
}

export default function ThongBaoClient() {
  const [posts, setPosts] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userPerms, setUserPerms] = useState<string>('{}');
  const [composing, setComposing] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [attachmentsMap, setAttachmentsMap] = useState<Record<string, Attachment[]>>({});
  const [myReactions, setMyReactions] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const canPost = (() => {
    if (userRole === 'super_admin' || userRole === 'admin') return true;
    try { const p = JSON.parse(userPerms); return Array.isArray(p?.announcements) && p.announcements.includes('create'); } catch { return false; }
  })();

  const canDelete = (() => {
    if (userRole === 'super_admin' || userRole === 'admin') return true;
    try { const p = JSON.parse(userPerms); return Array.isArray(p?.announcements) && p.announcements.includes('delete'); } catch { return false; }
  })();

  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setUserRole(u.role ?? '');
        setUserId(u.id ?? '');
        setUserName(u.name ?? '');
        setUserAvatar(u.avatar ?? null);
        setUserPerms(JSON.stringify(u.module_permissions ?? {}));
      } catch { /* empty */ }
    }
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/announcements', {
        headers: {
          'x-current-user-role': userRole,
          'x-current-user-id': userId,
          'x-user-permissions': userPerms,
        },
      });
      const json = await res.json();
      if (json.success) {
        setPosts(json.data);
        // Load my reactions for each post (lỗi reaction không làm hỏng feed)
        if (userId) {
          try {
            const reactionMap: Record<string, string> = {};
            await Promise.all(json.data.map(async (p: Announcement) => {
              const r = await fetch(`/api/announcements/${p.id}/reactions?user_id=${userId}`);
              const rj = await r.json();
              if (rj.success && rj.my_reaction) reactionMap[p.id] = rj.my_reaction;
            }));
            setMyReactions(reactionMap);
          } catch { /* reaction phụ — bỏ qua */ }
        }
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally { setLoading(false); }
  }, [userRole, userId, userPerms]);

  useEffect(() => { if (userRole !== undefined && userId) fetchPosts(); }, [fetchPosts, userRole, userId]);

  async function handlePost() {
    // Cho phép đăng nếu có nội dung HOẶC có ảnh/file (poster thuần).
    if ((!draftContent.trim() && draftFiles.length === 0) || posting) return;
    setPosting(true);
    try {
      const authHeaders = {
        'x-current-user-role': userRole,
        'x-current-user-id': userId,
        'x-user-permissions': userPerms,
      };
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ content: draftContent, title: '' }),
      });
      const json = await res.json();
      if (!json.success) return;
      const postId = json.data.id;

      // Upload ảnh/file (nếu có) TRƯỚC khi publish để broadcast Telegram kèm poster.
      if (draftFiles.length) {
        const fd = new FormData();
        for (const f of draftFiles) fd.append('files', f);
        await fetch(`/api/announcements/${postId}/attachments`, {
          method: 'POST', headers: authHeaders, body: fd,
        }).catch(() => {});
      }

      await fetch(`/api/announcements/${postId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ action: 'publish' }),
      });
      setDraftContent('');
      setDraftFiles([]);
      setComposing(false);
      fetchPosts();
    } finally { setPosting(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Xóa bài viết này?')) return;
    await fetch(`/api/announcements/${id}`, {
      method: 'DELETE',
      headers: { 'x-current-user-role': userRole, 'x-user-permissions': userPerms },
    });
    setPosts(prev => prev.filter(p => p.id !== id));
  }

  async function handlePin(id: string, pin: boolean) {
    await fetch(`/api/announcements/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-current-user-role': userRole,
        'x-user-permissions': userPerms,
      },
      body: JSON.stringify({ action: pin ? 'pin' : 'unpin' }),
    });
    setPosts(prev => prev.map(p => p.id === id ? { ...p, pinned: pin } : p)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)));
  }

  async function handleEdit(id: string, content: string) {
    const res = await fetch(`/api/announcements/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-current-user-role': userRole,
        'x-user-permissions': userPerms,
      },
      body: JSON.stringify({ action: 'edit', content }),
    });
    const json = await res.json();
    if (json.success) {
      setPosts(prev => prev.map(p => p.id === id ? { ...p, content } : p));
    }
  }

  async function handleReaction(postId: string, reaction: string) {
    if (!userId) return;
    const res = await fetch(`/api/announcements/${postId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-current-user-id': userId },
      body: JSON.stringify({ reaction }),
    });
    const json = await res.json();
    if (json.success) {
      setMyReactions(prev => ({ ...prev, [postId]: json.my_reaction ?? '' }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions: json.reactions } : p));
    }
  }

  async function loadAttachments(postId: string) {
    if (expandedPost === postId) { setExpandedPost(null); return; }
    if (!attachmentsMap[postId]) {
      const res = await fetch(`/api/announcements/${postId}/attachments`);
      const json = await res.json();
      if (json.success) setAttachmentsMap(prev => ({ ...prev, [postId]: json.data }));
    }
    setExpandedPost(postId);
  }

  return (
    <div className="animate-fadeIn max-w-2xl mx-auto">
      <Link href="/tra-cuu" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Tra Cứu
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Thông Báo - Truyền Thông</h1>
        <p className="mt-1 text-sm text-muted-foreground">Bảng thông tin nội bộ tổ chức</p>
      </div>

      {/* ─── COMPOSE BOX ─── */}
      {canPost && (
        <div className="mb-5 rounded-2xl border border-line p-4" style={{ background: 'var(--card)' }}>
          <div className="flex gap-3">
            <Avatar name={userName} avatar={userAvatar} size={40} />
            <div className="flex-1">
              {!composing ? (
                <button
                  onClick={() => setComposing(true)}
                  className="w-full text-left rounded-full border border-line bg-hover px-4 py-2.5 text-sm text-muted-foreground hover:bg-hover-strong transition-colors"
                >
                  {userName ? `Đăng thông báo, ${userName.split(' ').pop()}...` : 'Đăng thông báo...'}
                </button>
              ) : (
                <div className="space-y-3">
                  <textarea
                    autoFocus
                    value={draftContent}
                    onChange={e => setDraftContent(e.target.value)}
                    placeholder="Nội dung thông báo..."
                    rows={4}
                    className="w-full rounded-xl border border-line bg-hover p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/60 focus:outline-none resize-none"
                  />
                  {/* Ảnh/file đã chọn */}
                  {draftFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {draftFiles.map((f, i) => {
                        const isImg = f.type.startsWith('image/');
                        return (
                          <div key={i} className="relative group">
                            {isImg ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={URL.createObjectURL(f)} alt={f.name} className="h-20 w-20 rounded-lg object-cover border border-line" />
                            ) : (
                              <div className="h-20 w-20 rounded-lg border border-line bg-hover flex flex-col items-center justify-center p-1 text-center">
                                <FileText className="h-6 w-6 text-muted-foreground" />
                                <span className="text-[9px] text-muted-foreground truncate w-full mt-1">{f.name}</span>
                              </div>
                            )}
                            <button
                              onClick={() => setDraftFiles(prev => prev.filter((_, j) => j !== i))}
                              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                              title="Xóa"
                            ><X className="h-3 w-3" /></button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-hover-strong transition-colors"
                    >
                      <Image className="h-4 w-4" /> Ảnh/File
                    </button>
                    <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.docx,.xlsx" className="hidden"
                      onChange={e => {
                        const picked = Array.from(e.target.files || []);
                        if (picked.length) setDraftFiles(prev => [...prev, ...picked]);
                        e.target.value = ''; // cho phép chọn lại cùng file
                      }} />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setComposing(false); setDraftContent(''); setDraftFiles([]); }}
                        className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-hover-strong transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={handlePost}
                        disabled={(!draftContent.trim() && draftFiles.length === 0) || posting}
                        className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-600 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors"
                      >
                        {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        {posting ? 'Đang đăng...' : 'Đăng bài'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── FEED ─── */}
      {loading ? (
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : loadError ? (
        <ErrorState onRetry={fetchPosts} />
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-muted-foreground">
          <span className="text-5xl mb-4">📣</span>
          <p className="text-sm">Chưa có thông báo nào</p>
          {canPost && <p className="text-xs mt-1 opacity-60">Hãy đăng thông báo đầu tiên!</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              canPost={canPost}
              canDelete={canDelete || post.created_by === userId}
              myReaction={myReactions[post.id] ?? null}
              onDelete={() => handleDelete(post.id)}
              onPin={(pin) => handlePin(post.id, pin)}
              onEdit={(content) => handleEdit(post.id, content)}
              onReact={(r) => handleReaction(post.id, r)}
              expanded={expandedPost === post.id}
              attachments={attachmentsMap[post.id] ?? null}
              onToggleAttachments={() => (post.attachment_count + post.image_count) > 0 && loadAttachments(post.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({
  post, canPost, canDelete, myReaction,
  onDelete, onPin, onEdit, onReact,
  expanded, attachments, onToggleAttachments,
}: {
  post: Announcement;
  canPost: boolean;
  canDelete: boolean;
  myReaction: string | null;
  onDelete: () => void;
  onPin: (pin: boolean) => void;
  onEdit: (content: string) => void;
  onReact: (reaction: string) => void;
  expanded: boolean;
  attachments: Attachment[] | null;
  onToggleAttachments: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const isPublished = post.status === 'published';
  const displayDate = post.published_at ?? post.created_at;
  const images = (attachments ?? []).filter(a => a.is_image);
  const files = (attachments ?? []).filter(a => !a.is_image);
  const totalReactions = Object.values(post.reactions ?? {}).reduce((a, b) => a + b, 0);

  async function saveEdit() {
    if (!editContent.trim()) return;
    setSaving(true);
    await onEdit(editContent);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${post.pinned ? 'border-amber-500/30' : 'border-line'}`} style={{ background: 'var(--card)' }}>
      {/* Pin banner */}
      {post.pinned && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-amber-500/20" style={{ background: 'rgba(245,158,11,0.07)' }}>
          <Pin className="h-3 w-3 text-amber-400" />
          <span className="text-xs text-amber-400 font-500">Bài đã ghim</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <Avatar name={post.author_name} avatar={post.author_avatar} size={44} />
          <div>
            <p className="text-sm font-600 text-foreground leading-tight">{post.author_name ?? 'Admin'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-muted-foreground">{timeAgo(displayDate)}</span>
              <span className="text-muted-foreground opacity-40">·</span>
              {isPublished ? (
                <Globe className="h-3 w-3 text-muted-foreground opacity-60" />
              ) : (
                <div className="flex items-center gap-1">
                  <Lock className="h-3 w-3 text-amber-400" />
                  <span className="text-xs text-amber-400">Draft</span>
                </div>
              )}
              {post.telegram_sent && (
                <>
                  <span className="text-muted-foreground opacity-40">·</span>
                  <span className="text-xs text-sky-400">✈ Telegram</span>
                </>
              )}
            </div>
          </div>
        </div>

        {(canDelete || canPost) && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(p => !p)}
              className="rounded-full px-2 py-0.5 text-xl leading-none text-muted-foreground hover:bg-hover-strong transition-colors"
            >
              ···
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-line overflow-hidden shadow-xl z-10"
                style={{ background: 'var(--card)' }}
              >
                {canPost && (
                  <>
                    <button
                      onClick={() => { setShowMenu(false); setEditing(true); setEditContent(post.content); }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-hover transition-colors"
                    >
                      <Pencil className="h-4 w-4 text-indigo-400" /> Sửa bài
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); onPin(!post.pinned); }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-hover transition-colors"
                    >
                      {post.pinned
                        ? <><PinOff className="h-4 w-4 text-amber-400" /> Bỏ ghim</>
                        : <><Pin className="h-4 w-4 text-amber-400" /> Ghim bài</>
                      }
                    </button>
                  </>
                )}
                {canDelete && (
                  <button
                    onClick={() => { setShowMenu(false); onDelete(); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" /> Xóa bài
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        {post.title && <p className="text-base font-600 text-foreground mb-2">{post.title}</p>}

        {editing ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-indigo-500/40 bg-hover p-3 text-sm text-foreground focus:outline-none resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-hover-strong transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Hủy
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-600 transition-colors disabled:opacity-40"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Lưu
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {post.content.replace(/<[^>]*>/g, '')}
          </p>
        )}
      </div>

      {/* Reaction counts */}
      {totalReactions > 0 && (
        <div className="px-4 pb-2 flex items-center gap-1 flex-wrap">
          {Object.entries(post.reactions ?? {}).filter(([, c]) => c > 0).map(([r, c]) => (
            <span key={r} className="text-xs rounded-full px-2 py-0.5 border border-line bg-hover">
              {r} {c}
            </span>
          ))}
          <span className="text-xs text-muted-foreground ml-1">{totalReactions} lượt</span>
        </div>
      )}

      {/* Action bar */}
      <div className="border-t border-line-subtle px-4 py-2 flex items-center gap-2">
        {/* Reaction button */}
        <div className="relative">
          <button
            onClick={() => setShowReactionPicker(p => !p)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
              myReaction ? 'text-indigo-400 bg-indigo-500/10' : 'text-muted-foreground hover:bg-hover-strong'
            }`}
          >
            <span>{myReaction || '👍'}</span>
            <span>{myReaction ? 'Đã thích' : 'Thích'}</span>
          </button>

          {showReactionPicker && (
            <div
              className="absolute bottom-full left-0 mb-2 flex items-center gap-1 rounded-2xl border border-line px-2 py-1.5 shadow-xl z-20"
              style={{ background: 'var(--card)' }}
            >
              {REACTIONS.map(r => (
                <button
                  key={r}
                  onClick={() => { onReact(r); setShowReactionPicker(false); }}
                  className={`text-xl hover:scale-125 transition-transform p-1 rounded-lg ${myReaction === r ? 'bg-indigo-500/20' : ''}`}
                  title={r}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Attachments toggle */}
        {(post.image_count > 0 || post.attachment_count > 0) && (
          <button
            onClick={onToggleAttachments}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-hover-strong transition-colors ml-auto"
          >
            {post.image_count > 0 && `🖼 ${post.image_count}`}
            {post.image_count > 0 && post.attachment_count > 0 && ' · '}
            {post.attachment_count > 0 && `📎 ${post.attachment_count}`}
            <span className="ml-1 opacity-60">{expanded ? '▲' : '▼'}</span>
          </button>
        )}
      </div>

      {/* Expanded attachments */}
      {expanded && attachments && (
        <div className="border-t border-line-subtle px-4 pb-4 pt-3 space-y-3">
          {images.length > 0 && (
            <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {images.map(img => (
                <a key={img.id} href={`/api/announcements/${post.id}/attachments/${img.id}`} target="_blank" rel="noreferrer">
                  <img
                    src={`/api/announcements/${post.id}/attachments/${img.id}`}
                    alt={img.file_name}
                    className="w-full rounded-xl object-cover aspect-square hover:opacity-90 transition-opacity"
                  />
                </a>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <div className="space-y-1">
              {files.map(f => (
                <a
                  key={f.id}
                  href={`/api/announcements/${post.id}/attachments/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-xs text-foreground hover:bg-hover transition-colors"
                >
                  <span className="text-base">📎</span>
                  <span className="flex-1 truncate">{f.file_name}</span>
                  <span className="text-muted-foreground opacity-60">{(f.file_size / 1024).toFixed(0)} KB</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
