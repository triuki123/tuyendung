'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Heading, List, ListOrdered, Link2, AlignLeft, AlignCenter,
  RemoveFormatting, Code2, Type,
} from 'lucide-react';

/**
 * Trình soạn HTML trực quan (WYSIWYG) không cần thư viện ngoài — dùng contentEditable.
 * Có nút chuyển "HTML thô" cho người muốn dán/sửa HTML trực tiếp.
 * value là HTML; onChange trả HTML mới. variables: chèn {{key}} tại con trỏ.
 */
export default function RichHtmlEditor({
  value, onChange, variables = [], minHeight = 220,
}: {
  value: string;
  onChange: (html: string) => void;
  variables?: { key: string; label: string }[];
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'wysiwyg' | 'html'>('wysiwyg');

  // Đồng bộ nội dung vào contentEditable khi mount & khi quay lại chế độ WYSIWYG
  // (không sync khi đang gõ → tránh nhảy con trỏ).
  useEffect(() => {
    if (mode === 'wysiwyg' && ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const emit = () => { if (ref.current) onChange(ref.current.innerHTML); };
  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };
  const insertVar = (key: string) => {
    if (mode === 'html') { onChange(`${value}{{${key}}}`); return; }
    ref.current?.focus();
    document.execCommand('insertText', false, `{{${key}}}`);
    emit();
  };
  const addLink = () => {
    const url = window.prompt('Nhập URL liên kết:');
    if (url) exec('createLink', url);
  };

  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title}
      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-indigo-300 hover:bg-hover">
      {children}
    </button>
  );

  return (
    <div className="rounded-lg border border-line overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-2 px-1.5 py-1">
        {mode === 'wysiwyg' && (
          <>
            <Btn onClick={() => exec('bold')} title="Đậm"><Bold className="h-3.5 w-3.5" /></Btn>
            <Btn onClick={() => exec('italic')} title="Nghiêng"><Italic className="h-3.5 w-3.5" /></Btn>
            <Btn onClick={() => exec('underline')} title="Gạch chân"><Underline className="h-3.5 w-3.5" /></Btn>
            <span className="mx-0.5 h-4 w-px bg-line" />
            <Btn onClick={() => exec('formatBlock', 'H2')} title="Tiêu đề"><Heading className="h-3.5 w-3.5" /></Btn>
            <Btn onClick={() => exec('formatBlock', 'P')} title="Đoạn thường"><Type className="h-3.5 w-3.5" /></Btn>
            <Btn onClick={() => exec('insertUnorderedList')} title="Danh sách chấm"><List className="h-3.5 w-3.5" /></Btn>
            <Btn onClick={() => exec('insertOrderedList')} title="Danh sách số"><ListOrdered className="h-3.5 w-3.5" /></Btn>
            <span className="mx-0.5 h-4 w-px bg-line" />
            <Btn onClick={addLink} title="Chèn link"><Link2 className="h-3.5 w-3.5" /></Btn>
            <Btn onClick={() => exec('justifyLeft')} title="Căn trái"><AlignLeft className="h-3.5 w-3.5" /></Btn>
            <Btn onClick={() => exec('justifyCenter')} title="Căn giữa"><AlignCenter className="h-3.5 w-3.5" /></Btn>
            <Btn onClick={() => exec('removeFormat')} title="Xoá định dạng"><RemoveFormatting className="h-3.5 w-3.5" /></Btn>
            <span className="mx-0.5 h-4 w-px bg-line" />
          </>
        )}
        {variables.length > 0 && variables.map((v) => (
          <button key={v.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(v.key)} title={v.label}
            className="rounded-md border border-line text-muted-foreground hover:text-indigo-300 hover:border-indigo-500/40 px-1.5 py-0.5 text-2xs font-600">{`{{${v.key}}}`}</button>
        ))}
        <button type="button" onClick={() => setMode((m) => (m === 'wysiwyg' ? 'html' : 'wysiwyg'))}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-2xs font-600 text-muted-foreground hover:text-indigo-300">
          <Code2 className="h-3.5 w-3.5" /> {mode === 'wysiwyg' ? 'HTML thô' : 'Trực quan'}
        </button>
      </div>

      {/* Vùng soạn */}
      {mode === 'wysiwyg' ? (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          className="prose-email px-3 py-2 text-sm text-foreground bg-[#0f1622] focus:outline-none overflow-y-auto"
          style={{ minHeight }}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 text-xs font-mono text-foreground bg-[#0f1622] focus:outline-none resize-y"
          style={{ minHeight }}
        />
      )}
    </div>
  );
}
