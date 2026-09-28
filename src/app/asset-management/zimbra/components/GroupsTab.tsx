'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, UserPlus, Users, Plus, X } from 'lucide-react';
import GroupMembersList from './GroupMembersList';

const PAGE_SIZE = 25;

interface ZimbraGroup {
  id: string;
  name: string;
  memberCount?: number;
}

interface Props {
  isActive: boolean;
  isAdmin: boolean;
  getHeaders: () => Record<string, string>;
  onToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return (data && typeof data.error === 'string' && data.error) || fallback;
  } catch {
    return fallback;
  }
}

export default function GroupsTab({ isActive, isAdmin, getHeaders, onToast }: Props) {
  const [groups, setGroups] = useState<ZimbraGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addEmail, setAddEmail] = useState<Record<string, string>>({});
  const [addLoading, setAddLoading] = useState<string | null>(null);
  // membersKey bumps to force GroupMembersList remount/reload after add
  const [membersKey, setMembersKey] = useState<Record<string, number>>({});
  const fetchedRef = useRef(false);

  // Create group state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', displayName: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isActive && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchGroups();
    }
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchGroups() {
    setLoading(true);
    try {
      const res = await fetch('/api/zimbra/groups', { headers: getHeaders() });
      if (!res.ok) {
        const msg = await readError(res, 'Không thể tải danh sách nhóm Zimbra');
        onToast(msg, 'error');
        return;
      }
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch (err) {
      console.error('Zimbra groups fetch error:', err);
      onToast('Không thể tải danh sách nhóm Zimbra', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMember(group: ZimbraGroup) {
    const email = (addEmail[group.id] || '').trim();
    if (!email) { onToast('Vui lòng nhập email thành viên', 'warning'); return; }
    setAddLoading(group.id);
    try {
      const res = await fetch('/api/zimbra/groups/members', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ dlId: group.id, email }),
      });
      if (!res.ok) {
        const msg = await readError(res, 'Không thể thêm thành viên');
        onToast(msg, 'error');
        return;
      }
      onToast(`Đã thêm ${email} vào ${group.name}`, 'success');
      setAddEmail((prev) => ({ ...prev, [group.id]: '' }));
      // Bump key to reload members list for this group
      setMembersKey((prev) => ({ ...prev, [group.id]: (prev[group.id] ?? 0) + 1 }));
    } catch (err) {
      console.error('Zimbra add member error:', err);
      onToast('Không thể thêm thành viên', 'error');
    } finally {
      setAddLoading(null);
    }
  }

  async function handleCreateGroup() {
    if (!createForm.email.trim()) { onToast('Vui lòng nhập email nhóm', 'warning'); return; }
    setCreating(true);
    try {
      const body: Record<string, string> = { email: createForm.email.trim() };
      if (createForm.displayName.trim()) body.displayName = createForm.displayName.trim();
      const res = await fetch('/api/zimbra/groups', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await readError(
          res,
          res.status === 409 ? 'Nhóm đã tồn tại' : 'Không thể tạo nhóm'
        );
        onToast(msg, 'error');
        return;
      }
      onToast('Tạo nhóm thành công', 'success');
      setShowCreate(false);
      setCreateForm({ email: '', displayName: '' });
      // Directly call fetchGroups — fetchedRef guard only blocks initial auto-fetch
      fetchGroups();
    } catch (err) {
      console.error('Zimbra create group error:', err);
      onToast('Không thể tạo nhóm', 'error');
    } finally {
      setCreating(false);
    }
  }

  function handleMembersChanged(groupId: string) {
    // Bump key so the list reloads fresh after a remove
    setMembersKey((prev) => ({ ...prev, [groupId]: (prev[groupId] ?? 0) + 1 }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-ink-muted">
        <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Đang tải danh sách nhóm...</span>
      </div>
    );
  }

  const visibleGroups = groups.slice(0, visibleCount);
  const hasMoreGroups = visibleCount < groups.length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-lg">Danh sách Distribution List</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted bg-hover px-2 py-1 rounded">{groups.length} nhóm</span>
          {isAdmin && (
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm transition"
            >
              <Plus size={14} />
              Tạo nhóm
            </button>
          )}
        </div>
      </div>

      {/* Create group form (inline) */}
      {isAdmin && showCreate && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm">Tạo nhóm mới</h3>
            <button
              onClick={() => { setShowCreate(false); setCreateForm({ email: '', displayName: '' }); }}
              className="text-ink-muted hover:text-white transition"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="email"
              placeholder="Email nhóm * (vd: team@example.com)"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <input
              type="text"
              placeholder="Tên hiển thị (tùy chọn)"
              value={createForm.displayName}
              onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowCreate(false); setCreateForm({ email: '', displayName: '' }); }}
              className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition"
            >
              Hủy
            </button>
            <button
              onClick={handleCreateGroup}
              disabled={creating}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm transition disabled:opacity-50"
            >
              {creating ? 'Đang tạo...' : 'Tạo'}
            </button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-center text-ink-muted py-10 text-sm">Không có nhóm nào.</p>
      ) : (
        <>
          <div className="space-y-2">
            {visibleGroups.map((group) => {
              const isExpanded = expandedId === group.id;
              const isAddingMember = addLoading === group.id;

              return (
                <div key={group.id} className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
                  {/* Group header row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : group.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-hover transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-cyan-900/40 border border-cyan-700/30 flex items-center justify-center flex-shrink-0">
                      <Users size={15} className="text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{group.name}</p>
                      {group.memberCount !== undefined && (
                        <p className="text-ink-muted text-xs">{group.memberCount} thành viên</p>
                      )}
                    </div>
                    {isExpanded
                      ? <ChevronDown size={16} className="text-ink-muted flex-shrink-0" />
                      : <ChevronRight size={16} className="text-ink-muted flex-shrink-0" />
                    }
                  </button>

                  {/* Expanded panel */}
                  {isExpanded && (
                    <div className="border-t border-slate-700 px-4 py-4 space-y-3">
                      {/* Member list */}
                      <GroupMembersList
                        key={`${group.id}-${membersKey[group.id] ?? 0}`}
                        dlId={group.id}
                        groupName={group.name}
                        isAdmin={isAdmin}
                        getHeaders={getHeaders}
                        onToast={onToast}
                        onMembersChanged={() => handleMembersChanged(group.id)}
                      />

                      {/* Add member — admin only */}
                      {isAdmin && (
                        <div>
                          <p className="text-xs text-ink-muted mb-1.5 font-medium">Thêm thành viên</p>
                          <div className="flex gap-2">
                            <input
                              type="email"
                              placeholder="email@example.com"
                              value={addEmail[group.id] || ''}
                              onChange={(e) =>
                                setAddEmail((prev) => ({ ...prev, [group.id]: e.target.value }))
                              }
                              onKeyDown={(e) => e.key === 'Enter' && handleAddMember(group)}
                              className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                            />
                            <button
                              onClick={() => handleAddMember(group)}
                              disabled={isAddingMember}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700/40 hover:bg-emerald-700/60 border border-emerald-600/30 text-emerald-300 rounded text-xs transition disabled:opacity-50"
                            >
                              <UserPlus size={13} />
                              {isAddingMember ? '...' : 'Thêm'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Non-admin: show group ID */}
                      {!isAdmin && (
                        <p className="text-ink-muted text-xs">
                          ID: <span className="font-mono text-ink-bright">{group.id}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasMoreGroups && (
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="mt-4 w-full py-2 text-sm text-cyan-400 hover:text-cyan-300 bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700 rounded-lg transition"
            >
              Tải thêm ({groups.length - visibleCount} nhóm còn lại)
            </button>
          )}
        </>
      )}
    </div>
  );
}
