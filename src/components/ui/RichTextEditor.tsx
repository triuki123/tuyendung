'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Heading2, Heading3, Link2, Eraser } from 'lucide-react';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

/**
 * Trình soạn WYSIWYG nhẹ (contentEditable + execCommand) — không thêm thư viện. Xuất HTML đã
 * lọc an toàn. Dùng cho mô tả biểu mẫu + khối nội dung.
 */
export default function RichTextEditor({ value, onChange, placeholder, minHeight = 140 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  // Nạp value từ ngoài vào (chỉ khi khác nội dung hiện tại để không nhảy con trỏ khi gõ).
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== (value || '')) el.innerHTML = value || '';
  }, [value]);

  const emit = () => { if (ref.current) onChange(sanitizeHtml(ref.current.innerHTML)); };
  const cmd = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };
  const heading = (tag: 'h2' | 'h3') => cmd('formatBlock', tag);
  const link = () => {
    const url = window.prompt('Nhập đường dẫn (URL):', 'https://');
    if (url && !/^\s*(javascript|data):/i.test(url)) cmd('createLink', url);
  };

  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={onClick}
      className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-hover transition-colors">
      {children}
    </button>
  );

  const isEmpty = !value || value === '<br>' || value.replace(/<[^>]*>/g, '').trim() === '';

  return (
    <div className={`rounded-xl border ${focused ? 'border-indigo-500' : 'border-line'} overflow-hidden`} style={{ background: 'var(--surface-2, var(--input))' }}>
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-line-subtle flex-wrap">
        <Btn onClick={() => cmd('bold')} title="Đậm (Ctrl+B)"><Bold size={15} /></Btn>
        <Btn onClick={() => cmd('italic')} title="Nghiêng (Ctrl+I)"><Italic size={15} /></Btn>
        <Btn onClick={() => cmd('underline')} title="Gạch chân"><Underline size={15} /></Btn>
        <span className="w-px h-4 bg-line-subtle mx-1" />
        <Btn onClick={() => heading('h2')} title="Tiêu đề lớn"><Heading2 size={15} /></Btn>
        <Btn onClick={() => heading('h3')} title="Tiêu đề nhỏ"><Heading3 size={15} /></Btn>
        <span className="w-px h-4 bg-line-subtle mx-1" />
        <Btn onClick={() => cmd('insertUnorderedList')} title="Gạch đầu dòng"><List size={15} /></Btn>
        <Btn onClick={() => cmd('insertOrderedList')} title="Danh sách số"><ListOrdered size={15} /></Btn>
        <Btn onClick={link} title="Chèn liên kết"><Link2 size={15} /></Btn>
        <span className="w-px h-4 bg-line-subtle mx-1" />
        <Btn onClick={() => cmd('removeFormat')} title="Xoá định dạng"><Eraser size={15} /></Btn>
      </div>
      <div className="relative">
        {isEmpty && !focused && placeholder && (
          <div className="absolute left-3 top-2.5 text-sm text-muted-foreground/50 pointer-events-none">{placeholder}</div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={() => { setFocused(false); emit(); }}
          onFocus={() => setFocused(true)}
          className="rich-content px-3 py-2.5 text-sm text-foreground outline-none overflow-y-auto"
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}
