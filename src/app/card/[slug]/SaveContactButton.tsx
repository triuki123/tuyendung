'use client';

import { UserPlus } from 'lucide-react';
import { generateVCard } from '@/lib/vcard';

interface Props {
  name: string;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  company?: string | null;
  department?: string | null;
  accent: string;
}

/** Nút "Lưu danh bạ" — sinh .vcf phía client rồi tải xuống. */
export default function SaveContactButton({ name, email, phone, position, company, department, accent }: Props) {
  const save = () => {
    const vcard = generateVCard({
      name,
      email: email || undefined,
      phone: phone || undefined,
      position: position || undefined,
      company: company || undefined,
      department: department || undefined,
    });
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.vcf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <button
      onClick={save}
      className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-600 text-white shadow-sm transition-transform active:scale-95"
      style={{ background: accent }}
    >
      <UserPlus size={16} /> Lưu danh bạ
    </button>
  );
}
