'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';

const PAGE_SIZE = 25;

interface Domain {
  id: string;
  name: string;
}

interface Props {
  isActive: boolean;
  isAdmin: boolean;
  getHeaders: () => Record<string, string>;
}

export default function DomainsTab({ isActive, getHeaders }: Props) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (isActive && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchDomains();
    }
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchDomains() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/zimbra/domains', { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDomains(data.domains ?? []);
      setVisibleCount(PAGE_SIZE);
    } catch (err) {
      console.error('Zimbra domains fetch error:', err);
      setError('Không thể kết nối đến Zimbra. Vui lòng kiểm tra cấu hình máy chủ.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-ink-muted">
        <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Đang tải danh sách domain...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-4 text-red-300">
        <AlertCircle size={18} className="flex-shrink-0" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  const visibleDomains = domains.slice(0, visibleCount);
  const hasMore = visibleCount < domains.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-lg">Danh sách Domain</h2>
        <span className="text-xs text-ink-muted bg-hover px-2 py-1 rounded">
          Hiển thị {visibleDomains.length} / {domains.length} domain
        </span>
      </div>

      {domains.length === 0 ? (
        <p className="text-center text-ink-muted py-10 text-sm">Không có domain nào.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-bright uppercase tracking-wide">Tên Domain</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-bright uppercase tracking-wide">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {visibleDomains.map((d) => (
                  <tr key={d.id} className="hover:bg-hover transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-ink-muted font-mono text-xs">{d.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="mt-4 w-full py-2 text-sm text-cyan-400 hover:text-cyan-300 bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700 rounded-lg transition"
            >
              Tải thêm ({domains.length - visibleCount} domain còn lại)
            </button>
          )}
        </>
      )}
    </div>
  );
}
