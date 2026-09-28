import { supabaseAdmin } from '@/lib/supabase';

export interface SystemConfig {
  id?: string;
  type: 'role' | 'department' | 'company';
  name: string;
  created_at?: string;
  created_by?: string;
}

export async function getSystemConfigs(type: 'role' | 'department' | 'company'): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('system_configs')
    .select('name')
    .eq('type', type)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data?.map((item) => item.name) || [];
}

export async function addSystemConfig(
  type: 'role' | 'department' | 'company',
  name: string,
  createdBy: string = 'system'
): Promise<SystemConfig> {
  if (!name || name.trim() === '') {
    throw new Error('Name cannot be empty');
  }

  const now = new Date().toISOString();
  const newConfig: SystemConfig = {
    type,
    name: name.trim(),
    created_at: now,
    created_by: createdBy,
  };

  const { data, error } = await supabaseAdmin
    .from('system_configs')
    .insert([newConfig])
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate')) {
      throw new Error(`${name} already exists`);
    }
    throw new Error(error.message);
  }

  return data;
}

export async function getAllSystemConfigs(): Promise<{
  roles: string[];
  departments: string[];
  companies: string[];
}> {
  const [roles, departments, companies] = await Promise.all([
    getSystemConfigs('role'),
    getSystemConfigs('department'),
    getSystemConfigs('company'),
  ]);

  return { roles, departments, companies };
}

export async function updateSystemConfig(
  adminEmail: string,
  type: 'role' | 'department' | 'company',
  oldName: string,
  newName: string
): Promise<SystemConfig> {
  if (adminEmail !== 'admin@fadogroup.com.au') {
    throw new Error('Chỉ Admin Master mới có quyền đổi tên cấu hình hệ thống');
  }

  if (!newName || newName.trim() === '') {
    throw new Error('Tên không được để trống');
  }

  const { data, error } = await supabaseAdmin
    .from('system_configs')
    .update({
      name: newName.trim(),
    })
    .eq('type', type)
    .eq('name', oldName)
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate')) {
      throw new Error(`${newName} đã tồn tại`);
    }
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Cấu hình không tồn tại');
  }

  return data;
}
