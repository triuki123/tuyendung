'use client';

import { useCallback, useState } from 'react';
import { useConfirm } from '@/context/ConfirmContext';

/**
 * useUnsavedGuard — theo dõi "có thay đổi chưa lưu" + chặn đóng modal khi còn dirty.
 * Chuẩn UX: form sửa phải cảnh báo trước khi mất dữ liệu chưa lưu.
 *
 * Cách dùng tối giản (bắt mọi input qua onChange bubble ở div gốc modal):
 *   const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
 *   ...
 *   <div onChange={markDirty}> ... </div>     // div gốc modal: mọi input đổi → dirty
 *   <button onClick={guardedClose}>Đóng</button>   // nút X / Hủy / backdrop / ESC
 *   // sau khi lưu thành công: markClean(); onClose();
 *
 * @param onClose  hàm đóng modal thật (chạy khi không còn thay đổi hoặc user xác nhận thoát)
 * @returns isDirty, markDirty, markClean, setDirty, guardedClose
 */
export function useUnsavedGuard(onClose: () => void) {
  const confirm = useConfirm();
  const [isDirty, setDirty] = useState(false);

  const markDirty = useCallback(() => setDirty(true), []);
  const markClean = useCallback(() => setDirty(false), []);

  const guardedClose = useCallback(async () => {
    if (!isDirty) { onClose(); return; }
    const ok = await confirm({
      title: 'Có thay đổi chưa lưu',
      message: 'Bạn có chắc muốn thoát không? Mọi thay đổi chưa lưu sẽ bị mất.',
      confirmLabel: 'Thoát không lưu',
      cancelLabel: 'Tiếp tục chỉnh sửa',
      danger: false,
    });
    if (ok) { setDirty(false); onClose(); }
  }, [isDirty, confirm, onClose]);

  return { isDirty, markDirty, markClean, setDirty, guardedClose };
}
