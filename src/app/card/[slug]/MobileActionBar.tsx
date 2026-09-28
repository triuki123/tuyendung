'use client';

import { useEffect, useState } from 'react';
import { Phone, Mail, UserPlus } from 'lucide-react';
import { generateVCard } from '@/lib/vcard';

interface Props {
  name: string;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  company?: string | null;
  department?: string | null;
  accent: string;
  grad: string;
  surface: string;
  text: string;
  border: string;
}

/**
 * Thanh hành động nổi cố định đáy màn hình (chỉ mobile). Hiện dần sau khi cuộn
 * qua hero → luôn có nút Gọi · Email · Lưu danh bạ trong tầm ngón cái.
 */
export default function MobileActionBar({ name, email, phone, position, company, department, accent, grad, surface, text, border }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const saveContact = () => {
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
    <div
      className={`fixed inset-x-0 bottom-0 z-40 sm:hidden transition-all duration-300 ${show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        className="mx-3 mb-3 flex items-center gap-2 rounded-2xl p-2 shadow-2xl"
        style={{ background: `${surface}f2`, border: `1px solid ${border}`, backdropFilter: 'blur(12px)' }}
      >
        {phone && (
          <a href={`tel:${phone.replace(/\s/g, '')}`} aria-label="Gọi"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:scale-95 transition"
            style={{ background: `${accent}14`, color: accent }}>
            <Phone size={18} />
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} aria-label="Email"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:scale-95 transition"
            style={{ background: `${accent}14`, color: accent }}>
            <Mail size={18} />
          </a>
        )}
        <button onClick={saveContact}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-700 text-white active:scale-[.98] transition"
          style={{ background: grad, boxShadow: `0 8px 20px ${accent}55` }}>
          <UserPlus size={17} /> Lưu danh bạ
        </button>
      </div>
    </div>
  );
}
