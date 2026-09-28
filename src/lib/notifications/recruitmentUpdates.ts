import { NextRequest } from 'next/server';
import { notify } from './engine';
import { getHrNotifyUserIds } from '@/lib/services/hrSettingsService';

type Mutation = (request: NextRequest, ...args: any[]) => Promise<Response>;

/** Notify only after a successful, committed API mutation. Never serialize CVs,
 * attachments, credentials or email bodies into Telegram messages. */
export function withRecruitmentUpdate<T extends Mutation>(handler: T, feature: string, url: string): T {
  return (async (request: NextRequest, ...args: any[]) => {
    const response = await handler(request, ...args);
    if (!response.ok) return response;
    try {
      const result = await response.clone().json();
      if (result.success === false || result.error) return response;
      const recipients = await getHrNotifyUserIds();
      if (!recipients.length) return response;
      const data = result.data;
      const id = args[0]?.params?.id || data?.id || '';
      const actions: Record<string, string> = { POST: 'Đã lưu thông tin mới', PUT: 'Đã cập nhật', PATCH: 'Đã cập nhật', DELETE: 'Đã xoá / huỷ' };
      const action = actions[request.method] || 'Đã cập nhật';
      const time = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      // Status is an enum/code only; arbitrary user content must not become Markdown.
      const status = typeof data?.status === 'string' && /^[a-z_]{1,40}$/.test(data.status) ? `\nTrạng thái: ${data.status}` : '';
      await notify('recruitment.updated', {
        title: `${feature}: ${action}`,
        body: `${action} thành công.${status}\nThời gian: ${time}\nMở ứng dụng để xem chi tiết.`,
        url,
      }, { recipients, relatedId: id || null });
    } catch (error) {
      // Notification problems must never turn a committed mutation into an API error.
      console.error('[recruitment-update] notification failed:', error instanceof Error ? error.message : 'unknown');
    }
    return response;
  }) as T;
}
