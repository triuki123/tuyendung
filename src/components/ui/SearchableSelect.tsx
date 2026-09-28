'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, X, Search } from 'lucide-react';
import { normalizeVN } from '@/lib/utils/searchVN';

export interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
  /** Badge nhỏ hiển thị cạnh label (vd "Trưởng", "Kiêm nhiệm") — tùy chọn */
  badges?: { text: string; className: string }[];
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Dropdown có ô tìm kiếm (combobox chỉ-chọn, không tạo mới).
 * Dropdown render qua portal vào document.body (position: fixed) để tránh bị
 * cắt bởi overflow: auto/hidden của container cha (form modal, card...).
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '— Chọn —',
  emptyText = 'Không có lựa chọn',
  disabled = false,
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = normalizeVN(search).trim();
    if (!q) return options;
    return options.filter(
      (o) => normalizeVN(o.label).includes(q) || normalizeVN(o.sublabel || '').includes(q),
    );
  }, [options, search]);

  // Tính vị trí dropdown dựa vào trigger button (viewport coords → fixed)
  const computePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropH = Math.min(300, window.innerHeight * 0.4);
    const top = spaceBelow > dropH ? rect.bottom + 4 : rect.top - dropH - 4;
    setDropdownStyle({
      position: 'fixed',
      top,
      left: rect.left,
      width: rect.width,
      zIndex: 99999,
    });
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!open) computePosition();
    setOpen((v) => !v);
  };

  // Đóng khi click ra ngoài
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
      setSearch('');
    };
    // Khi scroll NGOÀI dropdown (vd cuộn form/modal) → đặt lại vị trí dropdown
    // để khỏi lệch khỏi trigger. Scroll BÊN TRONG dropdown (cuộn danh sách)
    // không đóng và không đặt lại.
    const handleScroll = (e: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return;
      computePosition();
    };
    // Đóng khi resize cửa sổ (vị trí cũ không còn đúng)
    const handleResize = () => {
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  // Focus ô tìm kiếm khi mở
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const dropdownNode =
    open && typeof document !== 'undefined'
      ? ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-hidden"
          >
            <div className="p-2 border-b border-slate-700">
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
                  size={14}
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm kiếm..."
                  className="w-full bg-slate-700 border border-slate-600 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length > 0 ? (
                filtered.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onMouseDown={(e) => {
                      // preventDefault để tránh blur trigger → click-outside đóng trước khi select
                      e.preventDefault();
                      onChange(o.value);
                      setOpen(false);
                      setSearch('');
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-hover-strong transition-colors ${
                      value === o.value ? 'bg-blue-500/20 text-blue-300' : 'text-white'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{o.label}</span>
                      {o.badges?.map((b) => (
                        <span
                          key={b.text}
                          className={`flex-shrink-0 px-1.5 py-px rounded text-[10px] font-600 ${b.className}`}
                        >
                          {b.text}
                        </span>
                      ))}
                    </span>
                    {o.sublabel && (
                      <span className="block text-xs text-ink-muted truncate">{o.sublabel}</span>
                    )}
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-xs text-ink-muted text-center">{emptyText}</div>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-2 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={`truncate ${selected ? 'text-white' : 'text-ink-faint'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onChange(null);
              }}
              className="text-ink-muted hover:text-white transition-colors"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={16} className="text-ink-muted" />
        </span>
      </button>
      {dropdownNode}
    </div>
  );
}
