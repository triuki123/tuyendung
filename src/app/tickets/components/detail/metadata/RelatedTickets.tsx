'use client';

import { Ticket, ExternalLink } from 'lucide-react';

interface RelatedTicketsProps {
  ticketId: string;
}

export default function RelatedTickets({ ticketId }: RelatedTicketsProps) {
  const relatedTickets: any[] = [];

  if (relatedTickets.length === 0) return null;

  return (
    <div className="bg-secondary rounded-xl border border-border p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Ticket className="w-3.5 h-3.5" />
        Ticket liên quan
      </h3>
      <div className="space-y-2">
        {relatedTickets.map((ticket) => (
          <a
            key={ticket.id}
            href={`/tickets/${ticket.id}`}
            className="flex items-center justify-between p-3 bg-card rounded-lg border border-border hover:border-indigo/30 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">{ticket.code}</p>
              <p className="text-sm font-semibold text-indigo truncate mt-0.5">{ticket.title}</p>
            </div>
            <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-md flex-shrink-0 ml-2">
              {ticket.status}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
