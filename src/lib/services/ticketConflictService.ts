/**
 * Ticket Conflict Detection Service
 * Detects if a ticket assigned to a user conflicts with other tickets
 */

import { Ticket } from '@/lib/types/ticket';

export interface ConflictInfo {
  ticketId: string;
  conflictingWith: {
    id: string;
    title: string;
    assignedTo: string;
    priority: string;
  }[];
  conflictCount: number;
}

/**
 * Detect conflicts for a ticket
 * Currently checks if same user has multiple CRITICAL/HIGH priority tickets in similar timeframes
 * Future: Add deadline and time range overlap detection when those fields exist
 */
export function detectConflicts(tickets: Ticket[], ticketId: string): ConflictInfo | null {
  const targetTicket = tickets.find(t => t.id === ticketId);

  if (!targetTicket || !targetTicket.assigned_to) {
    return null;
  }

  // Only check for high-priority tickets
  if (!['critical', 'high'].includes(targetTicket.priority.toLowerCase())) {
    return null;
  }

  const assignedUserId = targetTicket.assigned_to;
  const createdDate = new Date(targetTicket.created_at);

  // Find other high-priority tickets assigned to same user created within 7 days
  const conflictingTickets = tickets.filter(t => {
    if (t.id === ticketId) return false; // Skip the target ticket
    if (t.assigned_to !== assignedUserId) return false; // Only same user
    if (t.status === 'closed' || t.status === 'resolved') return false; // Skip resolved

    const otherDate = new Date(t.created_at);
    const daysDiff = Math.abs(createdDate.getTime() - otherDate.getTime()) / (1000 * 60 * 60 * 24);

    // Check if within 7 days AND is high/critical priority
    return daysDiff <= 7 && ['critical', 'high'].includes(t.priority.toLowerCase());
  });

  if (conflictingTickets.length === 0) {
    return null;
  }

  return {
    ticketId,
    conflictingWith: conflictingTickets.map(t => ({
      id: t.id,
      title: t.title,
      assignedTo: t.assigned_to_name || t.assigned_to || 'Unknown',
      priority: t.priority,
    })),
    conflictCount: conflictingTickets.length,
  };
}

/**
 * Detect conflicts for multiple tickets
 */
export function detectAllConflicts(tickets: Ticket[]): ConflictInfo[] {
  return tickets
    .map(t => detectConflicts(tickets, t.id))
    .filter((conflict): conflict is ConflictInfo => conflict !== null);
}

/**
 * Check if a ticket has conflicts
 */
export function hasConflict(tickets: Ticket[], ticketId: string): boolean {
  return detectConflicts(tickets, ticketId) !== null;
}
