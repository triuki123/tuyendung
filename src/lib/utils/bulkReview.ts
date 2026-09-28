/**
 * Tiện ích duyệt hàng loạt phía client.
 * Lặp tuần tự qua từng id, gọi đúng API PUT per-item sẵn có (tái dụng 100%
 * logic quyền + thông báo của từng loại), trả về số thành công/thất bại.
 *
 * Cố ý lặp TUẦN TỰ (không Promise.all) để tránh dồn tải DB và tránh đua khi
 * nhiều thông báo cùng phát một lúc. Số mục mỗi lần duyệt thường nhỏ.
 */

export interface BulkReviewResult {
  ok: number;
  fail: number;
  failedIds: string[];
}

export async function bulkReview(opts: {
  ids: string[];
  endpoint: (id: string) => string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}): Promise<BulkReviewResult> {
  let ok = 0;
  const failedIds: string[] = [];

  for (const id of opts.ids) {
    try {
      const res = await fetch(opts.endpoint(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        body: JSON.stringify(opts.body),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) ok++;
      else failedIds.push(id);
    } catch {
      failedIds.push(id);
    }
  }

  return { ok, fail: failedIds.length, failedIds };
}
