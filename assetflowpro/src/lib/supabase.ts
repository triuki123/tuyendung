import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ulsxqlsgkgfhuahscars.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          role: 'super_admin' | 'admin' | 'user';
          department: string;
          avatar: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['users']['Row']>;
      };
      assets: {
        Row: {
          id: string;
          code: string;
          name: string;
          category: string;
          brand: string;
          model: string;
          serial_number: string;
          status: 'available' | 'assigned' | 'maintenance' | 'broken' | 'retired';
          assigned_to: string | null;
          assigned_to_name: string | null;
          department: string;
          purchase_date: string;
          warranty_expiry: string;
          value: number;
          condition: string;
          location: string;
          notes: string;
          image_url: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['assets']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['assets']['Row']>;
      };
      asset_history: {
        Row: {
          id: string;
          asset_id: string;
          date: string;
          action: string;
          performed_by: string;
          note: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['asset_history']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['asset_history']['Row']>;
      };
      tickets: {
        Row: {
          id: string;
          code: string;
          title: string;
          description: string;
          asset_code: string;
          asset_name: string;
          priority: 'low' | 'medium' | 'high' | 'critical';
          status: 'open' | 'in_progress' | 'resolved' | 'closed';
          created_by: string;
          created_by_name: string;
          assigned_to: string;
          assigned_to_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['tickets']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['tickets']['Row']>;
      };
      tasks: {
        Row: {
          id: string;
          code: string;
          title: string;
          description: string;
          priority: 'low' | 'medium' | 'high';
          status: 'todo' | 'in_progress' | 'done' | 'cancelled';
          assigned_to: string;
          assigned_to_name: string;
          created_by: string;
          due_date: string;
          created_at: string;
          updated_at: string;
          related_asset?: string;
        };
        Insert: Omit<Database['public']['Tables']['tasks']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['tasks']['Row']>;
      };
      delete_requests: {
        Row: {
          id: string;
          asset_id: string;
          asset_code: string;
          asset_name: string;
          requested_by: string;
          requested_by_name: string;
          requested_at: string;
          reason: string;
          status: 'pending' | 'approved' | 'rejected';
          reviewed_by?: string;
          reviewed_at?: string;
          review_note?: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['delete_requests']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['delete_requests']['Row']>;
      };
    };
  };
};
