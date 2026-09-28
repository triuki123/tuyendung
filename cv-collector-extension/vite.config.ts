import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";

// Vite + @crxjs/vite-plugin: build MV3 extension (content script, service
// worker, popup) từ một cấu hình duy nhất, thay vì tự viết webpack config
// riêng cho từng entry point.
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    modulePreload: false,
  },
});
