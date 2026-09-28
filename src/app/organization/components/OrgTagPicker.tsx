'use client';

import React from 'react';
import { Check } from 'lucide-react';

export interface OrgTagOption {
  id: string;
  name: string;
  color: string;
}

interface OrgTagPickerProps {
  tags: OrgTagOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

export default function OrgTagPicker({ tags, selected, onChange }: OrgTagPickerProps) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  if (tags.length === 0) {
    return (
      <p className="text-2xs text-muted-foreground/60">
        Chưa có tag tổ chức nào. Tạo ở Tổ Chức &gt;&gt; Tags &gt;&gt; Tags Tổ Chức.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const active = selected.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-2xs font-600 border transition-all ${
              active ? 'border-white/60 text-foreground' : 'border-line text-muted-foreground hover:border-white/30'
            }`}
            style={active ? { backgroundColor: `${tag.color}33` } : undefined}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
            <span>{tag.name}</span>
            {active && <Check size={12} />}
          </button>
        );
      })}
    </div>
  );
}
