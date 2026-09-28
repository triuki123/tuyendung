'use client';

import React from 'react';
import Comments from '../../Comments';

interface CommentsTabProps {
  ticketId: string;
  userId: string;
  userRole: string;
  currentUser?: any;
}

export default function CommentsTab({ ticketId, userId, userRole, currentUser }: CommentsTabProps) {
  return (
    <div className="p-6 space-y-4">
      <Comments
        ticket={{ id: ticketId } as any}
        currentUser={currentUser || { id: userId, role: userRole }}
      />
    </div>
  );
}
