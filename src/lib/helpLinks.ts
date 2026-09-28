// Trợ giúp theo ngữ cảnh: map route ứng dụng → trang tài liệu tương ứng trong /help.
// VitePress build với cleanUrls=false nên các trang có đuôi .html.
const HELP_BASE = '/help';

const ROUTE_MAP: Array<[RegExp, string]> = [
  [/^\/dashboard/, '/chuc-nang/dashboard'],
  [/^\/asset-management\/admin\/config/, '/quan-tri/cau-hinh-tai-san'],
  [/^\/asset-management/, '/chuc-nang/tai-san'],
  [/^\/organization/, '/chuc-nang/to-chuc'],
  [/^\/tickets\/admin\/config/, '/quan-tri/cau-hinh-ticket-nang-cao'],
  [/^\/tickets/, '/chuc-nang/tickets'],
  [/^\/tasks/, '/chuc-nang/cong-viec'],
  [/^\/room-bookings\/thong-ke/, '/chuc-nang/hieu-suat-phong-hop'],
  [/^\/room-bookings/, '/chuc-nang/dat-phong'],
  [/^\/tra-cuu\/dau-moi/, '/chuc-nang/dau-moi-lien-he'],
  [/^\/tra-cuu\/thong-bao/, '/chuc-nang/thong-bao-truyen-thong'],
  [/^\/tra-cuu\/van-ban/, '/chuc-nang/van-ban-quyet-dinh'],
  [/^\/tra-cuu\/du-lieu-cong/, '/chuc-nang/cham-cong'],
  [/^\/tra-cuu\/lich-su/, '/chuc-nang/lich-su'],
  [/^\/tra-cuu/, '/chuc-nang/tra-cuu'],
  [/^\/my-hr/, '/chuc-nang/ho-so-cua-toi'],
  [/^\/duyet-yeu-cau/, '/chuc-nang/duyet-yeu-cau'],
  [/^\/delete-requests/, '/chuc-nang/duyet-yeu-cau'],
  [/^\/nhan-su/, '/chuc-nang/nhan-su'],
  [/^\/nguon-nhan-luc/, '/chuc-nang/nguon-nhan-luc'],
  [/^\/yeu-cau-tuyen-dung/, '/chuc-nang/nguon-nhan-luc'],
  [/^\/users/, '/quan-tri/nguoi-dung'],
];

/**
 * Trả về URL tài liệu phù hợp nhất với trang hiện tại.
 * Không khớp route nào → về trang chủ Trung Tâm Trợ Giúp.
 */
export function getHelpUrl(pathname: string | null | undefined): string {
  if (pathname) {
    for (const [re, doc] of ROUTE_MAP) {
      if (re.test(pathname)) return `${HELP_BASE}${doc}.html`;
    }
  }
  return `${HELP_BASE}/`;
}
