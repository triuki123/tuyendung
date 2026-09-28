/**
 * Quy ước payload QR dùng chung — URL lưỡng dụng.
 *
 * Tem QR mã hoá URL: `${APP_URL}/q/{type}/{code}` (vd .../q/room/ROOM-001).
 * - Quét bằng camera điện thoại thường → mở URL → app điều hướng tới hành động đúng.
 * - Quét trong app → handler trung tâm parse URL, xử lý ngay không rời app.
 * Vẫn hiểu định dạng cũ: token `room:CODE` / `asset:CODE` và JSON tài sản `{code,...}`.
 */

export type QrKind = 'room' | 'asset' | 'unknown';

export interface ParsedQr {
  kind: QrKind;
  code: string | null;
  raw: string;
}

/** Dựng URL QR cho 1 thực thể (nhúng vào tem in). */
export function buildQrUrl(type: 'room' | 'asset', code: string, baseUrl?: string): string {
  const base = (baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  return `${base}/q/${type}/${encodeURIComponent(code)}`;
}

/** Phân tích nội dung QR vừa quét thành {kind, code}. */
export function parseQrPayload(raw: string): ParsedQr {
  const text = (raw || '').trim();
  if (!text) return { kind: 'unknown', code: null, raw };

  // 1) URL dạng .../q/{type}/{code}
  const urlMatch = text.match(/\/q\/(room|asset)\/([^/?#\s]+)/i);
  if (urlMatch) {
    return { kind: urlMatch[1].toLowerCase() as QrKind, code: safeDecode(urlMatch[2]), raw };
  }

  // 2) Token ngắn type:code
  const tokenMatch = text.match(/^(room|asset):(.+)$/i);
  if (tokenMatch) {
    return { kind: tokenMatch[1].toLowerCase() as QrKind, code: tokenMatch[2].trim(), raw };
  }

  // 3) JSON tài sản cũ (AssetQRModal) { code, name, ... }
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj.code === 'string') return { kind: 'asset', code: obj.code, raw };
    } catch { /* không phải JSON hợp lệ */ }
  }

  // 4) Mã tài sản trần (AF-... / FDG-...)
  if (/^(AF|FDG)[-A-Z0-9]+$/i.test(text)) return { kind: 'asset', code: text, raw };

  // 5) Mã phòng trần (ROOM-... )
  if (/^ROOM[-A-Z0-9]+$/i.test(text)) return { kind: 'room', code: text, raw };

  return { kind: 'unknown', code: null, raw };
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}
