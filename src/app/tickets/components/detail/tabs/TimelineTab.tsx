'use client';

import UnifiedTimeline from '../timeline/UnifiedTimeline';
import CommentEditor from '../comments/CommentEditor';

interface TimelineTabProps {
  ticketId: string;
  userId: string;
}

export default function TimelineTab({ ticketId, userId }: TimelineTabProps) {
  return (
    <div className="p-6 space-y-5">
      <div className="bg-secondary rounded-xl border border-border p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Thêm bình luận</h3>
        <CommentEditor ticketId={ticketId} userId={userId} />
      </div>

      <UnifiedTimeline ticketId={ticketId} userId={userId} />
    </div>
  );
}
