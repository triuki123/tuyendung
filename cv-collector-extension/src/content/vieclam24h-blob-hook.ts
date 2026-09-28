type CapturedCv = { base64: string; type: string; size: number; url: string };

const root = window as typeof window & {
  __assetFlowCvCapture?: CapturedCv;
  __assetFlowVieclam24hBlobHooked?: boolean;
  __assetFlowInterceptNextDownload?: boolean;
};

const DOWNLOAD_ENDPOINT = /\/employer\/resume-applied-history\/\d+\/download-file(?:$|[?#])/i;
const CV_MIME = /pdf|msword|officedocument|ms-excel|spreadsheet|opendocument|rtf|text\/(?:plain|markdown|csv)/i;

async function capture(blob: Blob, url: string): Promise<void> {
  if (!blob.size || blob.size > 20 * 1024 * 1024 || !CV_MIME.test(blob.type)) return;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  root.__assetFlowCvCapture = {
    base64: btoa(binary), type: blob.type || "application/octet-stream", size: blob.size, url,
  };
}

if (!root.__assetFlowVieclam24hBlobHooked) {
  root.__assetFlowVieclam24hBlobHooked = true;
  const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (object: Blob | MediaSource): string {
    const url = originalCreateObjectUrl(object);
    const attachmentPage = location.hostname === "tk-hub.nhanlucsieuviet.com"
      || location.pathname === "/chi-tiet-nguoi-tim-viec";
    if (attachmentPage && object instanceof Blob && object.size > 0 && object.size <= 20 * 1024 * 1024
      && CV_MIME.test(object.type)) {
      void capture(object, url).catch(() => undefined);
    }
    return url;
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = response.url || String(args[0]);
    if (DOWNLOAD_ENDPOINT.test(url)) void response.clone().blob().then((blob) => capture(blob, url)).catch(() => undefined);
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    (this as XMLHttpRequest & { __assetFlowDownloadUrl?: string }).__assetFlowDownloadUrl = String(url);
    return Reflect.apply(originalOpen, this, [method, url, ...rest]);
  };
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", () => {
      const xhr = this as XMLHttpRequest & { __assetFlowDownloadUrl?: string };
      const url = xhr.responseURL || xhr.__assetFlowDownloadUrl || "";
      if (!DOWNLOAD_ENDPOINT.test(url)) return;
      if (xhr.response instanceof Blob) void capture(xhr.response, url).catch(() => undefined);
      else if (xhr.response instanceof ArrayBuffer) {
        const type = xhr.getResponseHeader("content-type") || "application/octet-stream";
        void capture(new Blob([xhr.response], { type }), url).catch(() => undefined);
      }
    });
    return originalSend.apply(this, args);
  };

  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (root.__assetFlowInterceptNextDownload && this.href.startsWith("blob:")) {
      root.__assetFlowInterceptNextDownload = false;
      void fetch(this.href).then((response) => response.blob())
        .then((blob) => capture(blob, this.href)).catch(() => undefined);
      return;
    }
    return originalAnchorClick.call(this);
  };
}
