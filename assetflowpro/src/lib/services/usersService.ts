import { supabaseAdmin } from '@/lib/supabase';
import * as bcryptjs from 'bcryptjs';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string;
  company: string;
  position?: string;
  phone?: string;
  created_at?: string;
}

export async function createUser(userData: {
  email: string;
  name: string;
  password: string;
  role: string;
  department: string;
  company: string;
  position?: string;
  phone?: string;
}): Promise<User> {
  const hashedPassword = await bcryptjs.hash(userData.password, 10);

  const { data, error } = await supabaseAdmin
    .from('users')
    .insert({
      email: userData.email,
      name: userData.name,
      password_hash: hashedPassword,
      role: userData.role,
      department: userData.department,
      company: userData.company,
      position: userData.position || '',
      phone: userData.phone || '',
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate')) {
      throw new Error('Email đã tồn tại');
    }
    throw new Error(error.message);
  }

  return data;
}

export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(error.message);
  }

  return data;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(error.message);
  }

  return data;
}

export async function getAllUsers(): Promise<User[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, role, department, company, position, phone, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function adminChangeUserPassword(
  adminId: string,
  targetUserId: string,
  newPassword: string
): Promise<void> {
  const admin = await getUserById(adminId);
  if (!admin || admin.role !== 'super_admin') {
    throw new Error('Chỉ Super Admin mới có quyền thay đổi mật khẩu người dùng khác');
  }

  const targetUser = await getUserById(targetUserId);
  if (!targetUser) {
    throw new Error('Người dùng không tồn tại');
  }

  if (targetUser.email === 'admin@fadogroup.com.au') {
    throw new Error('Không thể thay đổi mật khẩu của Admin Master');
  }

  if (newPassword.length < 8) {
    throw new Error('Mật khẩu phải có ít nhất 8 ký tự');
  }

  const hashedPassword = await bcryptjs.hash(newPassword, 10);

  const { error } = await supabaseAdmin
    .from('users')
    .update({ password_hash: hashedPassword })
    .eq('id', targetUserId);

  if (error) throw new Error(error.message);

  // Log the action
  try {
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        admin_id: adminId,
        target_user_id: targetUserId,
        action: 'ADMIN_CHANGE_PASSWORD',
        details: `Admin changed password for user ${targetUser.email}`,
      });
  } catch (err) {
    console.error('Failed to log action:', err);
  }
}
