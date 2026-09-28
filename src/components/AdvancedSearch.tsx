'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, X, History, Zap } from 'lucide-react';

interface SearchResult {
  id: string;
  title: string;
  category: string;
  preview?: string;
}

interface AdvancedSearchProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  onClear?: () => void;
  suggestions?: string[];
  recentSearches?: string[];
  maxRecentSearches?: number;
}

/**
 * Phase 2: Advanced Search Component
 * Provides full-text search with suggestions and history
 */
export default function AdvancedSearch({
  placeholder = 'Tìm kiếm...',
  onSearch,
  onClear,
  suggestions = ['Laptop Dell', 'Office Chair', 'Monitor LG', 'Keyboard Logitech'],
  recentSearches = [],
  maxRecentSearches = 5,
}: AdvancedSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [recentList, setRecentList] = useState<string[]>(recentSearches.slice(0, maxRecentSearches));
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on query
  useEffect(() => {
    if (query.trim().length === 0) {
      setFilteredSuggestions([]);
      return;
    }

    const filtered = suggestions.filter(s =>
      s.toLowerCase().includes(query.toLowerCase())
    );
    setFilteredSuggestions(filtered);
    setSelectedIndex(-1);
  }, [query, suggestions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    setIsOpen(true);
  };

  const handleSearch = (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (trimmed) {
      onSearch(trimmed);

      // Add to recent searches
      const updatedRecent = [trimmed, ...recentList.filter(s => s !== trimmed)].slice(0, maxRecentSearches);
      setRecentList(updatedRecent);

      // Store in localStorage
      try {
        localStorage.setItem('recentSearches', JSON.stringify(updatedRecent));
      } catch (e) {
        console.warn('Could not save recent searches', e);
      }
    }
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    setFilteredSuggestions([]);
    onClear?.();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allOptions = filteredSuggestions.length > 0
      ? filteredSuggestions
      : recentList;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < allOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSearch(allOptions[selectedIndex]);
        } else {
          handleSearch(query);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSearch(suggestion);
  };

  const handleRemoveRecent = (item: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentList.filter(s => s !== item);
    setRecentList(updated);
    try {
      localStorage.setItem('recentSearches', JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not update recent searches', e);
    }
  };

  const showDropdown = isOpen && (filteredSuggestions.length > 0 || recentList.length > 0 || query.trim().length === 0);
  const allOptions = filteredSuggestions.length > 0 ? filteredSuggestions : recentList;

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Search Input */}
      <div className="relative flex items-center">
        <Search size={18} className="absolute left-3 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full h-10 pl-9 pr-10 rounded-xl text-sm bg-white/02 border border-line text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-all"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
            title="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white/02 border border-line rounded-xl shadow-lg backdrop-blur-md z-50 overflow-hidden">
          {/* Suggestions */}
          {filteredSuggestions.length > 0 && (
            <>
              <div className="px-3 py-2 border-b border-white/05">
                <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Gợi ý</p>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filteredSuggestions.map((suggestion, idx) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                      selectedIndex === idx ? 'bg-hover-strong' : 'hover:bg-white/05'
                    }`}
                  >
                    <Zap size={14} className="text-amber-400" />
                    <span className="text-sm text-foreground">{suggestion}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Recent Searches */}
          {filteredSuggestions.length === 0 && recentList.length > 0 && (
            <>
              <div className="px-3 py-2 border-b border-white/05">
                <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Tìm kiếm gần đây</p>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {recentList.map((item, idx) => (
                  <button
                    key={item}
                    onClick={() => handleSuggestionClick(item)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                      selectedIndex === idx ? 'bg-hover-strong' : 'hover:bg-white/05'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <History size={14} className="text-ink-muted" />
                      <span className="text-sm text-foreground truncate">{item}</span>
                    </div>
                    <button
                      onClick={(e) => handleRemoveRecent(item, e)}
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                      title="Remove from history"
                    >
                      <X size={14} />
                    </button>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Empty State */}
          {filteredSuggestions.length === 0 && recentList.length === 0 && query.trim().length > 0 && (
            <div className="px-3 py-4 text-center">
              <p className="text-sm text-muted-foreground">Không tìm thấy kết quả cho "{query}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
