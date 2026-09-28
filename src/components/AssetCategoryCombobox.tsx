'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, X, AlertCircle } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

interface AssetCategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
}

export default function AssetCategoryCombobox({
  value,
  onChange,
  onBlur,
  error,
  disabled = false
}: AssetCategoryComboboxProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/asset-categories');
      const result = await res.json();
      if (result.success) {
        setCategories(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Update input value when selected value changes
  useEffect(() => {
    if (value) {
      const selected = categories.find(c => c.id === value);
      if (selected) {
        setInputValue(selected.name);
      }
    } else {
      setInputValue('');
    }
  }, [value, categories]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const canCreateNew = inputValue.trim().length > 0 &&
    !categories.some(c => c.name.toLowerCase() === inputValue.toLowerCase().trim());

  const handleCreateNew = async () => {
    if (!canCreateNew) return;

    try {
      setIsCreating(true);
      setCreateError('');
      const res = await fetch('/api/asset-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inputValue.trim(),
          description: '',
          color: '#6366f1'
        })
      });

      const result = await res.json();
      if (result.success && result.data) {
        setCategories([...categories, result.data].sort((a, b) => a.name.localeCompare(b.name)));
        onChange(result.data.id);
        setInputValue(result.data.name);
        setIsOpen(false);
      } else {
        setCreateError(result.error || 'Failed to create category');
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelect = (categoryId: string) => {
    onChange(categoryId);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setInputValue('');
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={onBlur}
          placeholder="— Chọn hoặc gõ để tạo loại mới —"
          disabled={disabled}
          className={`w-full px-3 py-2 pr-10 border border-white/12 rounded-lg bg-hover text-foreground placeholder-muted-foreground transition-colors ${
            error ? 'border-red-500/50' : 'focus:border-indigo-400/50'
          } focus:outline-none focus:bg-hover-strong disabled:opacity-50 disabled:cursor-not-allowed`}
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
          <AlertCircle size={12} />
          {error}
        </p>
      )}

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-slate-900 border border-white/12 rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 text-sm text-muted-foreground text-center">Loading...</div>
            ) : filtered.length > 0 ? (
              filtered.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelect(cat.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-hover-strong transition-colors ${
                    value === cat.id ? 'bg-indigo-500/20 text-indigo-300' : 'text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {cat.color && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                    )}
                    <span>{cat.name}</span>
                  </div>
                  {cat.description && (
                    <p className="text-xs text-muted-foreground ml-5">{cat.description}</p>
                  )}
                </button>
              ))
            ) : inputValue.trim() === '' ? (
              <div className="p-3 text-sm text-muted-foreground text-center">No categories found</div>
            ) : null}

            {canCreateNew && (
              <button
                type="button"
                onClick={handleCreateNew}
                disabled={isCreating}
                className="w-full text-left px-3 py-2.5 text-sm border-t border-white/12 text-indigo-400 hover:bg-indigo-500/10 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Plus size={16} />
                <span>
                  {isCreating ? 'Tạo...' : `Tạo loại mới: "${inputValue.trim()}"`}
                </span>
              </button>
            )}
          </div>

          {createError && (
            <div className="px-3 py-2 bg-red-500/10 border-t border-red-500/30 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle size={12} />
              {createError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
