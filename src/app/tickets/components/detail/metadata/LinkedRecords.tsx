'use client';

import { Link2, ExternalLink } from 'lucide-react';

interface LinkedRecordsProps {
  ticket: any;
}

export default function LinkedRecords({ ticket }: LinkedRecordsProps) {
  const linkedRecords = [
    { id: '1', type: 'Tài sản', name: ticket.asset_name, code: ticket.asset_code },
  ].filter(r => r.name);

  if (linkedRecords.length === 0) return null;

  return (
    <div className="bg-secondary rounded-xl border border-border p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Link2 className="w-3.5 h-3.5" />
        Tài sản liên quan
      </h3>
      <div className="space-y-2">
        {linkedRecords.map((record) => (
          <a
            key={record.id}
            href={`/assets/${record.id}`}
            className="flex items-center justify-between p-3 bg-card rounded-lg border border-border hover:border-indigo/30 hover:bg-indigo/5 transition-colors group"
          >
            <div>
              <p className="text-xs text-muted-foreground">{record.type}</p>
              <p className="text-sm font-semibold text-indigo mt-0.5">{record.name}</p>
              {record.code && <p className="text-xs text-muted-foreground">{record.code}</p>}
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-indigo transition-colors" />
          </a>
        ))}
      </div>
    </div>
  );
}
