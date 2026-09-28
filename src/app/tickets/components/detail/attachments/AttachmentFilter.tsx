'use client';

interface AttachmentFilterProps {
  onFilterChange: (showInternal: boolean) => void;
  showInternal: boolean;
}

export default function AttachmentFilter({
  onFilterChange,
  showInternal,
}: AttachmentFilterProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={showInternal}
          onChange={(e) => onFilterChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300"
        />
        <span className="text-gray-700">Chỉ hiển thị nội bộ</span>
      </label>
    </div>
  );
}
