/**
 * Central Ticket type definitions
 * Ensures consistency across all ticket-related components
 */

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'pending' | 'rejected';

export interface Ticket {
  id: string;
  code: string;
  title: string;
  description: string;
  asset_code?: string;
  asset_name?: string;
  priority: TicketPriority;
  status: TicketStatus;
  created_by: string;
  created_by_name: string;
  assigned_to?: string;
  assigned_to_name?: string;
  support_category?: string;
  created_at: string;
  updated_at: string;
  followers?: string[]; // Array of user IDs following this ticket
  rejection_reason?: string;
}
