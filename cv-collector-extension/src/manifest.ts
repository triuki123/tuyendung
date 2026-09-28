import { defineManifest } from "@crxjs/vite-plugin";

const TOPCV = ["https://tuyendung.topcv.vn/*"];
const JOBSGO = ["https://employer.jobsgo.vn/*"];
const VIECLAM24H = ["https://vieclam24h.vn/*", "https://*.vieclam24h.vn/*"];
const VIECLAM24H_FILES = ["https://tk-hub.nhanlucsieuviet.com/*"];
const VIECLAM24H_DETAIL = ["https://ntd.vieclam24h.vn/chi-tiet-nguoi-tim-viec*"];
const VIECLAM24H_APPLICATIONS = ["https://ntd.vieclam24h.vn/nha-tuyen-dung/quan-tri/ntd-trang-quan-tri-ho-so-ung-tuyen.html*"];
const ASSETFLOW = ["https://assetflow.fadoai.com/*"];

export default defineManifest({
  manifest_version: 3,
  name: "AssetFlow CV Collector",
  description: "Luu thong tin va file CV tu trang tuyen dung vao Kho Ung Vien AssetFlow.",
  version: "0.14.6",
  icons: { 16: "icon16.png", 48: "icon48.png", 128: "icon128.png" },
  action: {
    default_title: "AssetFlow CV Collector",
    default_popup: "src/popup/index.html",
    default_icon: { 16: "icon16.png", 48: "icon48.png", 128: "icon128.png" },
  },
  background: { service_worker: "src/background/service-worker.ts", type: "module" },
  content_scripts: [
    { matches: TOPCV, js: ["src/content/topcv.ts"], run_at: "document_idle" },
    { matches: JOBSGO, js: ["src/content/jobsgo.ts"], run_at: "document_idle" },
    { matches: VIECLAM24H, js: ["src/content/vieclam24h.ts"], run_at: "document_idle" },
    { matches: [...VIECLAM24H_APPLICATIONS, ...VIECLAM24H_DETAIL, ...VIECLAM24H_FILES], js: ["src/content/vieclam24h-blob-hook.ts"], run_at: "document_start", all_frames: true, world: "MAIN" },
    { matches: ASSETFLOW, js: ["src/content/assetflow-bridge.ts"], run_at: "document_idle" },
  ],
  permissions: ["storage", "tabs", "scripting", "unlimitedStorage"],
  // Content scripts chỉ chạy trong ba hệ sinh thái tuyển dụng và AssetFlow.
  // Wildcard subdomain cho phép tải file từ CDN/API cùng hệ sinh thái khi URL
  // chi tiết thực tế được xác nhận, không cấp quyền truy cập website ngoài luồng.
  host_permissions: [
    "https://topcv.vn/*", "https://*.topcv.vn/*",
    "https://jobsgo.vn/*", "https://*.jobsgo.vn/*",
    ...VIECLAM24H,
    ...VIECLAM24H_FILES,
    ...ASSETFLOW,
  ],
});
