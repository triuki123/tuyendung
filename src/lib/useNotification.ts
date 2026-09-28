import { useToast } from '@/context/ToastContext';

/**
 * useNotification — API tương thích ngược cho toast.
 * showNotification(message, type) → hiện toast nổi (góc phải-trên, tự tắt).
 * Đây là cách CHUẨN thay cho alert(). Xem docs/ux-standards.md.
 */
export function useNotification() {
  const toast = useToast();

  return {
    showNotification: (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      toast.show(message, type);
    },
  };
}
