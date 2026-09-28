'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Users } from 'lucide-react';
import {
  ContractWatcher, listContractWatchers, removeContractWatcher, addContractWatcher,
} from './hrApi';
import MultiUserPicker from './MultiUserPicker';

interface Props {
  contractId: string;
  canEdit: boolean;
}

export default function ContractWatchersSection({ contractId, canEdit }: Props) {
  const [watchers, setWatchers] = useState<ContractWatcher[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await listContractWatchers(contractId);
      setWatchers(data);
    } catch { /* noop */ } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [contractId]);

  async function handleAddWatcher(users: { id: string; name: string }[]) {
    if (!users.length) return;
    setBusy(true);
    try {
      for (const u of users) {
        await addContractWatcher(contractId, u.id);
      }
      await load();
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function handleRemoveWatcher(userId: string) {
    await removeContractWatcher(contractId, userId);
    setWatchers((prev) => prev.filter((w) => w.user_id !== userId));
  }

  if (loading) return <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      {canEdit && (
        <div>
          <p className="text-2xs font-600 uppercase tracking-wider text-muted-foreground mb-2">Thêm người theo dõi</p>
          <MultiUserPicker
            value={[]}
            onChange={(users) => handleAddWatcher(users)}
            excludeIds={watchers.map(w => w.user_id)}
            placeholder="Tìm nhân viên để thêm…"
          />
        </div>
      )}

      {watchers.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Chưa có người theo dõi</p>
      ) : (
        <div className="space-y-2">
          {watchers.map((w) => (
            <div key={w.user_id} className="flex items-center justify-between rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-foreground">{w.name}</p>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleRemoveWatcher(w.user_id)}
                  disabled={busy}
                  className="btn-ghost rounded p-1 text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
