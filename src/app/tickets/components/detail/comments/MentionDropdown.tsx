'use client';

import { useEffect, useState } from 'react';
import { includesVN } from '@/lib/utils/searchVN';

interface MentionDropdownProps {
  search: string;
  onSelect: (userId: string, userName: string) => void;
  onClose: () => void;
}

interface User {
  id: string;
  name: string;
}

const MOCK_USERS: User[] = [
  { id: '1', name: 'Nguyễn Văn A' },
  { id: '2', name: 'Trần Thị B' },
  { id: '3', name: 'Lê Văn C' },
  { id: '4', name: 'Phạm Thị D' },
  { id: '5', name: 'Hoàng Văn E' },
];

export default function MentionDropdown({ search, onSelect, onClose }: MentionDropdownProps) {
  const [filtered, setFiltered] = useState<User[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const results = search.length === 0
      ? MOCK_USERS
      : MOCK_USERS.filter(u => includesVN(u.name, search));
    setFiltered(results);
    setSelectedIndex(0);
  }, [search]);

  if (filtered.length === 0) {
    return (
      <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-modal z-20 p-3 text-sm text-muted-foreground">
        Không tìm thấy người dùng
      </div>
    );
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-modal z-20 overflow-hidden max-h-48 overflow-y-auto">
      {filtered.map((user, index) => (
        <button
          key={user.id}
          onClick={() => onSelect(user.id, user.name)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
            index === selectedIndex ? 'bg-indigo/15 text-indigo' : 'text-foreground hover:bg-secondary'
          }`}
        >
          <div className="w-6 h-6 rounded-full bg-indigo/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-indigo">{user.name.charAt(0)}</span>
          </div>
          <span className="font-semibold">{user.name}</span>
        </button>
      ))}
    </div>
  );
}
