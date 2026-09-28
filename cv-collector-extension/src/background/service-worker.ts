import type { CandidateExtraction, ImportRequest } from "../lib/types";
import { auth } from "../lib/auth";
import { cvFileName } from "../lib/file-format";

const TIMEOUT = 20_000;

function log(stage: string, detail?: unknown) {
  console.info(`[AssetFlow CV] ${stage}`, detail ?? "");
}

async function recordFailure(stage: string, error: unknown, context?: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostic = { stage, message, context, at: new Date().toISOString() };
  console.error(`[AssetFlow CV] ${stage}: ${message}`, context ?? "");
  await chrome.storage.local.set({ assetflow_last_error: diagnostic });
}

function waitComplete(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("Trang hồ sơ tải quá lâu")); }, TIMEOUT);
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id !== tabId || info.status !== "complete") return;
      clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function triggerVieclam24hDownload(tabId: number, candidateName: string): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const root = window as typeof window & {
        __assetFlowInterceptNextDownload?: boolean;
        __assetFlowCvCapture?: { base64: string; type: string; size: number; url: string };
      };
      root.__assetFlowCvCapture = undefined;
      root.__assetFlowInterceptNextDownload = true;
      performance.clearResourceTimings();
    },
  });
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    args: [candidateName],
    func: async (name: string) => {
      const normalize = (value = "") => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
      const expected = normalize(name);
      const names = Array.from(document.querySelectorAll<HTMLElement>("span.cursor-pointer"));
      const label = names.find((element) => normalize(element.innerText) === expected);
      const row = label?.closest<HTMLElement>("tr,[role=row]");
      if (!row) return false;
      const clickables = Array.from(row.querySelectorAll<HTMLElement>("button,[role=button],.cursor-pointer"))
        .filter((element) => element !== label);
      const menu = row.querySelector<HTMLElement>('[class*="popupActionMenu"]')
        || clickables.find((element) => /menu|more|ellipsis/i.test(`${element.getAttribute("aria-label") || ""} ${element.className}`));
      if (!menu) return false;
      menu.click();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const item = Array.from(document.querySelectorAll<HTMLElement>("div.cursor-pointer,button,[role=button]"))
          .find((element) => normalize(element.innerText) === "tải cv");
        if (item) {
          (item.closest<HTMLElement>("button,[role=button],.cursor-pointer") || item).click();
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return false;
    },
  });
  if (!results[0]?.result) throw new Error("Không bấm được menu Tải CV của Vieclam24h");
  log("vieclam24h:download-triggered", { candidateName });
}

async function installTopCvResponseCapture(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const root = window as typeof window & {
        __assetFlowCvCapture?: { base64: string; type: string; size: number; url: string };
        __assetFlowCvSignedUrl?: string;
        __assetFlowCvHooked?: boolean;
      };
      if (root.__assetFlowCvHooked) return;
      root.__assetFlowCvHooked = true;
      const relevant = (url: string, type: string) =>
        /pdf|msword|officedocument|ms-excel|spreadsheet|opendocument|rtf|text\/plain/i.test(type)
        || /download.*cv|cv.*download|candidate.*file|\.(?:pdf|docx?|xlsx?|odt|ods|rtf|txt)(?:$|[?#])/i.test(url);
      const save = async (blob: Blob, url: string) => {
        if (!relevant(url, blob.type) || !blob.size || blob.size > 20 * 1024 * 1024) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        root.__assetFlowCvCapture = { base64: btoa(binary), type: blob.type || "application/octet-stream", size: blob.size, url };
      };
      const saveSignedUrl = (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const value = payload as { cv?: { iframe_access_url?: string }; data?: { cv?: { iframe_access_url?: string }; iframe_access_url?: string } };
        const signedUrl = value.cv?.iframe_access_url || value.data?.cv?.iframe_access_url || value.data?.iframe_access_url;
        if (typeof signedUrl === "string" && /^https:\/\/s3\.topcv\.vn\//i.test(signedUrl)) root.__assetFlowCvSignedUrl = signedUrl;
      };

      const originalFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const url = response.url || String(args[0]);
        const type = response.headers.get("content-type") || "";
        if (/\/api\/v1\/cv-management\/cvs\/\d+/i.test(url)) {
          void response.clone().json().then(saveSignedUrl).catch(() => undefined);
        }
        if (relevant(url, type)) void response.clone().blob().then((blob) => save(blob, url)).catch(() => undefined);
        return response;
      };

      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
        (this as XMLHttpRequest & { __assetFlowUrl?: string }).__assetFlowUrl = String(url);
        return Reflect.apply(originalOpen, this, [method, url, ...rest]);
      };
      const originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener("load", () => {
          const xhr = this as XMLHttpRequest & { __assetFlowUrl?: string };
          const url = xhr.responseURL || xhr.__assetFlowUrl || "";
          const type = xhr.getResponseHeader("content-type") || "";
          if (/\/api\/v1\/cv-management\/cvs\/\d+/i.test(url)) {
            try { saveSignedUrl(typeof xhr.response === "string" ? JSON.parse(xhr.response) : xhr.response); } catch { /* ignore malformed API payload */ }
          }
          if (!relevant(url, type)) return;
          if (xhr.response instanceof Blob) void save(xhr.response, url).catch(() => undefined);
          else if (xhr.response instanceof ArrayBuffer) void save(new Blob([xhr.response], { type }), url).catch(() => undefined);
        });
        return originalSend.apply(this, args);
      };
    },
  });
}

async function topCvSignedUrl(tabId: number): Promise<string | undefined> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async () => {
      const root = window as typeof window & { __assetFlowCvSignedUrl?: string };
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (root.__assetFlowCvSignedUrl) return root.__assetFlowCvSignedUrl;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const cvId = location.pathname.match(/\/app\/cvs-management\/cvs\/(\d+)/i)?.[1];
      if (cvId) {
        try {
          const response = await fetch(`https://tuyendung-api.topcv.vn/api/v1/cv-management/cvs/${cvId}`, {
            credentials: "include",
            headers: { accept: "application/json", "x-refer-url": location.href },
          });
          if (response.ok) {
            const payload = await response.json() as { cv?: { iframe_access_url?: string }; data?: { cv?: { iframe_access_url?: string }; iframe_access_url?: string } };
            const signedUrl = payload.cv?.iframe_access_url || payload.data?.cv?.iframe_access_url || payload.data?.iframe_access_url;
            if (typeof signedUrl === "string" && /^https:\/\/s3\.topcv\.vn\//i.test(signedUrl)) return signedUrl;
          }
        } catch { /* fall through to the existing file URL */ }
      }
      return undefined;
    },
  });
  return results[0]?.result;
}

async function extract(tabId: number, source: ImportRequest["source"], fallback: ImportRequest["fallback"], directDetail = false): Promise<CandidateExtraction> {
  log("extract:start", { tabId, source, email: fallback.candidate_email });
  const deadline = Date.now() + TIMEOUT;
  let lastError = "Không đọc được hồ sơ ứng viên";
  while (Date.now() < deadline) {
    try {
      const type = source === "topcv"
        ? "AF_OPEN_AND_EXTRACT_TOPCV"
        : source === "jobsgo" ? "AF_EXTRACT_JOBSGO_DETAIL" : "AF_EXTRACT_VIECLAM24H_DETAIL";
      const result = await Promise.race([
        chrome.tabs.sendMessage(tabId, { type, fallback, directDetail }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Content script không phản hồi sau khi chuyển trang")), 8_000)),
      ]) as { ok: boolean; capture?: CandidateExtraction; error?: string };
      if (result.ok && result.capture) {
        log("extract:success", { source, fileHost: new URL(result.capture.file.url).hostname });
        return result.capture;
      }
      if (result.error) {
        lastError = result.error;
        log("extract:retry", { source, error: result.error });
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      log("extract:message-retry", lastError);
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw new Error(lastError);
}

async function downloadCv(file: CandidateExtraction["file"]): Promise<{ name: string; blob: Blob }> {
  if (file.base64) {
    const binary = atob(file.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: file.type || "application/octet-stream" });
    log("download:blob-success", { type: blob.type, size: blob.size });
    return { name: file.name, blob };
  }
  log("download:start", { host: new URL(file.url).hostname, url: file.url.split("?")[0] });
  let response: Response;
  try {
    response = await fetch(file.url, { credentials: "include", redirect: "follow" });
  } catch (error) {
    const host = (() => { try { return new URL(file.url).hostname; } catch { return "không xác định"; } })();
    throw new Error(`Không tải được CV từ ${host}: ${error instanceof Error ? error.message : "lỗi mạng"}`);
  }
  if (!response.ok) throw new Error(`Máy chủ file CV trả lỗi ${response.status}`);
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (error) {
    throw new Error(`Không đọc được nội dung CV đã tải: ${error instanceof Error ? error.message : "lỗi mạng"}`);
  }
  if (/text\/html/i.test(blob.type)) throw new Error("Máy chủ trả về HTML thay vì file CV");
  if (blob.size === 0) throw new Error("File CV tải về rỗng");
  if (blob.size > 20 * 1024 * 1024) throw new Error("File CV vượt quá 20 MB");
  log("download:success", { type: blob.type, size: blob.size });
  const disposition = response.headers.get("content-disposition") || "";
  const dispositionName = disposition.match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i)?.[1];
  return {
    name: dispositionName ? decodeURIComponent(dispositionName.replace(/"/g, "")) : file.name,
    blob,
  };
}

async function downloadCvInCandidateTab(tabId: number, file: CandidateExtraction["file"], sourceName: string, inspectFrames = false): Promise<{ name: string; blob: Blob }> {
  if (file.base64) return downloadCv(file);
  try {
    const results = await chrome.scripting.executeScript({
      target: inspectFrames ? { tabId, allFrames: true } : { tabId },
      world: "MAIN",
      args: [file.url, inspectFrames],
      func: async (url: string, inspectEmbedded: boolean) => {
        const root = window as typeof window & { __assetFlowCvCapture?: { base64: string; type: string; size: number; url: string } };
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (root.__assetFlowCvCapture?.base64) return root.__assetFlowCvCapture;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        const performanceBlob = inspectEmbedded
          ? performance.getEntriesByType("resource").map((entry) => entry.name).find((value) => value.startsWith("blob:"))
          : undefined;
        const embedded = performanceBlob || (inspectEmbedded ? Array.from(document.querySelectorAll<Element>("embed[src],object[data],iframe[src],a[download]"))
          .map((element) => element.getAttribute("src") || element.getAttribute("data") || element.getAttribute("href"))
          .filter((value): value is string => Boolean(value))
          .map((value) => new URL(value, location.href).href)
          .find((value) => value !== location.href && !/\/(?:hub|viewer)\.html?(?:$|[?#])/i.test(value)) : undefined);
        const fetchUrl = embedded || (/\/(?:hub|viewer)\.html?(?:$|[?#])/i.test(url) ? "" : url);
        if (!fetchUrl) return undefined;
        let response: Response;
        try { response = await fetch(fetchUrl, { credentials: "include", redirect: "follow" }); }
        catch { return undefined; }
        if (!response.ok) return undefined;
        const blob = await response.blob();
        if (/text\/html|javascript/i.test(blob.type) || !blob.size || blob.size > 20 * 1024 * 1024) return undefined;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        const disposition = response.headers.get("content-disposition") || "";
        const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
        let name = encodedName || plainName || "";
        try { name = decodeURIComponent(name); } catch { /* Keep the server-provided name. */ }
        return { base64: btoa(binary), type: blob.type || "application/octet-stream", size: blob.size, name, url: response.url || url };
      },
    });
    const captured = results.map((result) => result.result).find((result) => result?.base64);
    if (!captured?.base64) throw new Error(`Tab ${sourceName} không trả về dữ liệu file`);
    const binary = atob(captured.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: captured.type });
    log("download:tab-success", { type: blob.type, size: captured.size });
    const capturedName = 'name' in captured ? captured.name : '';
    const name = capturedName?.split(/[\\/]/).pop()
      || cvFileName(file.name.replace(/\.[^.]+$/, ''), "", captured.type, captured.url || file.url).replace(/-\./, '.');
    return { name, blob };
  } catch (error) {
    throw new Error(`Không tải được CV trong phiên đăng nhập ${sourceName}: ${error instanceof Error ? error.message : "lỗi không xác định"}`);
  }
}

async function runImport(message: ImportRequest, senderTabId?: number): Promise<void> {
  const connection = await auth();
  if (!connection) throw new Error("Extension chưa ghép nối với AssetFlow");
  log("import:start", { source: message.source, targetUrl: message.targetUrl, email: message.fallback.candidate_email });
  const reuseCurrentTab = message.source === "vieclam24h" && senderTabId != null;
  const detail = reuseCurrentTab ? undefined : await chrome.tabs.create({ url: message.targetUrl, active: false });
  const candidateTabId = reuseCurrentTab ? senderTabId : detail?.id;
  if (candidateTabId == null) throw new Error("Không mở được trang hồ sơ ứng viên");
  try {
    if (!reuseCurrentTab) await waitComplete(candidateTabId);
    log(reuseCurrentTab ? "tab:reuse" : "tab:complete", { tabId: candidateTabId, source: message.source });
    if (message.source === "topcv") await installTopCvResponseCapture(candidateTabId);
    let extraction: CandidateExtraction;
    if (message.source === "vieclam24h" && message.directDetail) {
      await triggerVieclam24hDownload(candidateTabId, message.fallback.candidate_name);
      extraction = {
        draft: { ...message.fallback, source: "Vieclam24h" },
        file: { url: message.targetUrl, name: cvFileName(message.fallback.candidate_name, "Vieclam24h") },
      };
    } else {
      extraction = await extract(candidateTabId, message.source, message.fallback, false);
    }
    if (!extraction.draft.candidate_name?.trim()) {
      const sourceName = message.source === "topcv" ? "TopCV" : message.source === "jobsgo" ? "JobsGO" : "Vieclam24h";
      const fromFile = extraction.file.name.replace(/\.[^.]+$/, "").replace(/[-_]+(?:TopCV|JobsGO|Vieclam24h)$/i, "").trim();
      extraction.draft.candidate_name = fromFile || `Ứng viên ${sourceName}`;
    }
    if (message.source === "topcv") {
      const signedUrl = await topCvSignedUrl(candidateTabId);
      if (signedUrl) {
        extraction.file.url = signedUrl;
        log("extract:signed-url", { host: "s3.topcv.vn" });
      }
    }
    const form = new FormData();
    Object.entries(extraction.draft).forEach(([key, value]) => value && form.append(key, String(value)));
    const serverCanFetch = message.source === "topcv" && /^https:\/\/s3\.topcv\.vn\//i.test(extraction.file.url);
    if (serverCanFetch) {
      form.append("source_file_url", extraction.file.url);
      form.append("file_name", extraction.file.name);
      log("assetflow:remote-upload:start", { host: "s3.topcv.vn", name: extraction.file.name });
    } else {
      let downloaded: { name: string; blob: Blob };
      if (message.source === "topcv") {
        downloaded = await downloadCvInCandidateTab(candidateTabId, extraction.file, "TopCV");
      } else if (message.source === "jobsgo") {
        downloaded = await downloadCvInCandidateTab(candidateTabId, extraction.file, "JobsGO");
      } else {
        downloaded = await downloadCv(extraction.file)
          .catch(() => downloadCvInCandidateTab(candidateTabId, extraction.file, "Vieclam24h", true));
      }
      form.append("file", downloaded.blob, downloaded.name);
      log("assetflow:upload:start", { name: downloaded.name, size: downloaded.blob.size });
    }
    let response: Response;
    try {
      response = await fetch("https://assetflow.fadoai.com/api/extension/cv", {
        method: "POST",
        headers: { Authorization: `Bearer ${connection.token}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      throw new Error(`Không gửi được CV sang AssetFlow: ${error instanceof Error ? error.message : "lỗi mạng"}`);
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || `AssetFlow trả lỗi ${response.status}`);
    log("assetflow:saved", { candidateId: json.data.id });
  } finally {
    if (detail?.id != null) await chrome.tabs.remove(detail.id).catch(() => undefined);
  }
}

let queue: Promise<void> = Promise.resolve();
chrome.runtime.onMessage.addListener((message: ImportRequest, sender, sendResponse) => {
  if (message?.type !== "AF_IMPORT_CANDIDATE") return undefined;
  const task = queue.then(() => runImport(message, sender.tab?.id));
  queue = task.catch(() => undefined);
  task.then(() => sendResponse({ ok: true })).catch(async (error) => {
    await recordFailure("import:failed", error, { source: message.source, targetUrl: message.targetUrl });
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "Không nhập được CV" });
  });
  return true;
});
