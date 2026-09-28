import { imageHosts } from './image-hosts.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle for the Docker runtime image.
  output: 'standalone',

  // Cho phép instrumentation.ts (khởi động ZKTeco poller khi server start)
  experimental: {
    instrumentationHook: true,
    optimizePackageImports: ['lucide-react', 'recharts'],
    // Trích xuất CV (pdf-parse kéo pdfjs-dist, mammoth) chạy server-side —
    // để Next require runtime thay vì bundle (tránh lỗi webpack pdfjs-dist).
    // sharp: native module (xử lý avatar) — phải external để standalone build
    // copy đủ binary @img/sharp-* vào node_modules, nếu không deploy lỗi
    // "Could not load the sharp module" khi đổi ảnh đại diện.
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist', 'mammoth', 'sharp'],
  },
  // Browser source maps are large; enable them explicitly only for production debugging.
  productionBrowserSourceMaps: process.env.PRODUCTION_BROWSER_SOURCE_MAPS === 'true',
  distDir: process.env.DIST_DIR || '.next',
  onDemandEntries: {
    maxInactiveAge: 30 * 60 * 1000,
    pagesBufferLength: process.env.NEXT_PUBLIC_RECRUITMENT_FOCUS === 'true' ? 6 : 2,
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
  },

  // Allow requests from local network.
  // Access-Control-Allow-Credentials is omitted intentionally: the app uses
  // header-based identification, not cookies, so the header is not needed and
  // would be invalid when paired with a wildcard origin.
  // Map /iclock/cdata → /api/attendance/adms (ZKTeco firmware cũ dùng path này)
  rewrites: async () => [
    // Trung Tâm Trợ Giúp: /help/ và /help → serve index.html (standalone không tự resolve directory)
    { source: '/help', destination: '/help/index.html' },
    { source: '/help/', destination: '/help/index.html' },
    { source: '/preview', destination: '/preview/index.html' },
    { source: '/preview/', destination: '/preview/index.html' },
    { source: '/iclock/cdata', destination: '/api/attendance/adms' },
    { source: '/iclock/cdata/:path*', destination: '/api/attendance/adms/:path*' },
    // Các endpoint phụ của giao thức push (getrequest, devicecmd, ping...)
    // → passthrough trả "OK" để máy không báo lỗi kết nối
    { source: '/iclock/:path*', destination: '/api/attendance/adms/passthrough' },
  ],

  headers: async () => {
    return [
      // General API routes — open CORS for local network access
      {
        source: '/api/((?!zimbra).*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.CORS_ALLOW_ORIGIN || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
        ],
      },
      // Zimbra admin routes — restrict to app origin; no Credentials header (header-based id, not cookies)
      {
        source: '/api/zimbra/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_APP_URL || '' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization,x-current-user-id' },
        ],
      },
    ];
  },
};
export default nextConfig;
