'use client';

import React, { useState, useEffect, useRef } from 'react';
import { UserMinus } from 'lucide-react';

const PAGE_SIZE = 25;

interface Props {
  dlId: string;
  groupName: string;
  isAdmin: boolean;
  getHeaders: () => Record<string, string>;
  onToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  /** Called after add/remove so parent can refresh memberCount */
  onMembersChanged?: () => void;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return (data && typeof data.error === 'string' && data.error) || fallback;
  } catch {
    return fallback;
  }
}

export default function GroupMembersList({
  dlId,
  groupName,
  isAdmin,
  getHeaders,
  onToast,
  onMembersChanged,
}: Props) {
  const [members, setMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadMembers();
  }, [dlId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll: reveal next page when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= members.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: '100px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleCount, members.length]);

  async function loadMembers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/zimbra/groups/members?dlId=${encodeURIComponent(dlId)}`, {
        headers: getHeaders(),
      });
      if (!res.ok) {
        const msg = await readError(res, 'Không thể tải danh sách thành viên');
        onToast(msg, 'error');
        return;
      }
      const data = await res.json();
      setMembers(data.members ?? []);
      setVisibleCount(PAGE_SIZE);
    } catch (err) {
      console.error('Zimbra fetch members error:', err);
      onToast('Không thể tải danh sách thành viên', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(email: string) {
    setRemovingEmail(email);
    try {
      const res = await fetch('/api/zimbra/groups/members', {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ dlId, email }),
      });
      if (!res.ok) {
        const msg = await readError(res, 'Không thể xóa thành viên');
        onToast(msg, 'error');
        return;
      }
      onToast(`Đã xóa ${email} khỏi ${groupName}`, 'success');
      await loadMembers();
      onMembersChanged?.();
    } catch (err) {
      console.error('Zimbra remove member error:', err);
      onToast('Không thể xóa thành viên', 'error');
    } finally {
      setRemovingEmail(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-ink-muted text-xs">
        <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span>Đang tải thành viên...</span>
      </div>
    );
  }

  const visible = members.slice(0, visibleCount);
  const hasMore = visibleCount < members.length;

  return (
    <div className="mt-3">
      <p className="text-xs text-ink-muted font-medium mb-2">
        Thành viên ({members.length})
      </p>

      {members.length === 0 ? (
        <p className="text-xs text-ink-faint italic py-2">Chưa có thành viên</p>
      ) : (
        <>
          <div className="space-y-1">
            {visible.map((email) => (
              <div
                key={email}
                className="flex items-center justify-between gap-2 bg-slate-700/40 rounded px-2.5 py-1.5"
              >
                <span className="text-xs text-slate-200 truncate">{email}</span>
                {isAdmin && (
                  <button
                    onClick={() => handleRemove(email)}
                    disabled={removingEmail === email}
                    title="Xóa thành viên"
                    className="flex-shrink-0 p-1 rounded text-red-400 hover:bg-red-900/30 hover:text-red-300 transition disabled:opacity-40"
                  >
                    <UserMinus size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {hasMore && (
            <div ref={sentinelRef}>
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 transition"
              >
                Tải thêm ({members.length - visibleCount} còn lại)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
