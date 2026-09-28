import React from 'react';

/** Khung chung cho mini-site công bố văn bản (không dùng AppLayout — trang public). */
export function PublicShell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className={`mx-auto ${wide ? 'max-w-4xl' : 'max-w-2xl'} px-4 sm:px-6 py-8 sm:py-12`}>
        {children}
        <p className="mt-8 text-center text-2xs text-muted-foreground/60">© 2026 FADO Group — AssetFlow Pro</p>
      </div>
    </div>
  );
}

export function PublicStatus({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-3xl border border-line px-6 py-14 flex flex-col items-center text-center" style={{ background: 'var(--card)' }}>
      {icon}
      <h1 className="mt-4 text-xl font-700 text-foreground">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

export const DOC_TYPES: Record<string, string> = {
  document: 'Văn bản',
  decision: 'Quyết định',
  circular: 'Thông tư',
  notice: 'Thông báo',
  other: 'Khác',
};

export const DOC_TYPE_COLORS: Record<string, string> = {
  document: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  decision: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  circular: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  notice: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  other: 'bg-slate-500/15 text-muted-foreground border-slate-500/30',
};

export function formatDateVN(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
