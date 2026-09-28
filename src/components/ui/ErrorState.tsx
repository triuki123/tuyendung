'use client';

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorStateProps {
  /** Thông điệp lỗi hiển thị cho user (tiếng Việt). */
  message?: string;
  /** Hàm thử lại — nếu có sẽ hiện nút "Thử lại". */
  onRetry?: () => void;
  className?: string;
}

/**
 * ErrorState — trạng thái LỖI khi tải dữ liệu thất bại.
 * Chuẩn UX: fetch fail KHÔNG để màn trống / KHÔNG hiện "không có dữ liệu" gây hiểu nhầm —
 * phải báo lỗi rõ + cho nút thử lại.
 *
 * Dùng: {error ? <ErrorState onRetry={reload} /> : data.length === 0 ? <EmptyState .../> : <list/>}
 */
export default function ErrorState({ message = 'Không tải được dữ liệu. Vui lòng thử lại.', onRetry, className }: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 sm:py-20 text-center ${className ?? ''}`}>
      <div className="w-12 h-12 rounded-2xl bg-red-500/15 flex items-center justify-center mb-3">
        <AlertTriangle className="h-6 w-6 text-red-400" />
      </div>
      <p className="text-sm font-600 text-foreground">Đã xảy ra lỗi</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl btn-ghost px-4 py-2 text-sm font-600 text-foreground border border-white/10"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Thử lại
        </button>
      )}
    </div>
  );
}
