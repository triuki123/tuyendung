import type { CandidateDraft } from "../lib/types";
import { extractVieclam24hDraft, captureVieclam24hDetail } from "./vieclam24h-adapter";

const MOUNTED = "data-assetflow-vieclam24h-mounted";
const normalized = (value = "") => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");

function applicationRows(): HTMLElement[] {
  const markers = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((element) => {
    const text = normalized(element.innerText);
    return element.children.length === 0 && (text === "chưa xem" || text === "hồ sơ mới");
  });
  const rows = markers.flatMap((marker) => {
    let current = marker.parentElement;
    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect();
      const text = normalized(current.innerText);
      if (rect.width > 700 && rect.height >= 70 && rect.height <= 180
        && /chưa xem|hồ sơ mới/.test(text) && /\d{1,2}:\d{2}/.test(text)) return [current];
      current = current.parentElement;
    }
    return [];
  });
  return rows.filter((row, index, all) => all.indexOf(row) === index);
}

function candidateName(card: HTMLElement): string {
  const lines = card.innerText.split("\n").map((line) => line.trim()).filter(Boolean);
  const first = lines.find((line) => /\p{L}/u.test(line)
    && !/chưa xem|hồ sơ mới|tiêu chí phù hợp|nhân viên|thời gian|trạng thái/i.test(line));
  return (first || "Ứng viên Vieclam24h").replace(/\s*\(\d+\s*,?\s*(?:Nam|Nữ)\)\s*$/i, "").trim();
}

function candidateLabel(card: HTMLElement, name: string): HTMLElement | undefined {
  const expected = normalized(name);
  return Array.from(card.querySelectorAll<HTMLElement>("a,button,[role=button],strong,b,span,div"))
    .filter((element) => element.children.length === 0)
    .find((element) => normalized(element.innerText).startsWith(expected));
}

function detailUrl(card: HTMLElement): string | undefined {
  const direct = card.querySelector<HTMLAnchorElement>('a[href*="/chi-tiet-nguoi-tim-viec"]')?.href;
  if (direct) return direct;
  for (const element of Array.from(card.querySelectorAll<HTMLElement>("[data-href],[data-url],[data-link]"))) {
    const value = element.dataset.href || element.dataset.url || element.dataset.link;
    if (value?.includes("chi-tiet-nguoi-tim-viec")) return new URL(value, location.href).href;
  }
  return undefined;
}

function fallbackFromCard(card: HTMLElement): CandidateDraft {
  return {
    ...extractVieclam24hDraft(card), candidate_name: candidateName(card), source: "Vieclam24h",
    note: `Nguồn: Vieclam24h\nHồ sơ gốc: ${location.href}`,
  };
}

function notice(message: string, success = false) {
  document.querySelector(".assetflow-vieclam24h-notice")?.remove();
  const element = document.createElement("div");
  element.className = "assetflow-vieclam24h-notice";
  element.textContent = message;
  element.style.cssText = `position:fixed;right:24px;bottom:24px;z-index:2147483647;max-width:420px;padding:12px 16px;border-radius:6px;background:${success ? "#087f5b" : "#b42318"};color:#fff;font:600 13px/1.4 Arial,sans-serif;box-shadow:0 8px 28px #0004`;
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 6000);
}

function mount(card: HTMLElement) {
  if (card.hasAttribute(MOUNTED)) return;
  card.setAttribute(MOUNTED, "1");
  const name = candidateName(card);
  const label = candidateLabel(card, name);
  const host = document.createElement("div");
  host.style.cssText = "display:inline-flex;margin-left:10px;vertical-align:middle;position:relative;z-index:999";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = '<style>button{width:32px;height:32px;border:0;border-radius:50%;background:#5b4bd8;color:white;font:700 11px Arial;cursor:pointer;box-shadow:0 2px 7px #0003}button:disabled{opacity:.85}button[data-state=success]{background:#087f5b}button[data-state=error]{background:#b42318}</style><button title="Lưu CV vào Kho Ứng Viên AssetFlow">AF</button>';
  (label || card).appendChild(host);
  const button = shadow.querySelector<HTMLButtonElement>("button")!;
  button.addEventListener("click", async (event) => {
    event.preventDefault(); event.stopPropagation();
    button.disabled = true; button.textContent = "...";
    const targetUrl = detailUrl(card) || location.href;
    const response = await chrome.runtime.sendMessage({
      type: "AF_IMPORT_CANDIDATE", source: "vieclam24h", targetUrl,
      directDetail: targetUrl === location.href, fallback: fallbackFromCard(card),
    }) as { ok: boolean; error?: string };
    if (!response?.ok) {
      button.disabled = false; button.textContent = "!"; button.dataset.state = "error";
      notice(response?.error || "Không nhập được CV Vieclam24h");
    } else {
      button.textContent = "✓"; button.dataset.state = "success";
      notice("Đã lưu CV vào Kho Ứng Viên AssetFlow", true);
    }
  });
}

function clickCandidate(name: string): boolean {
  const expected = normalized(name);
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("a,button,[role=button],td,div,span"));
  const label = candidates.find((element) => normalized(element.innerText).startsWith(expected)
    && normalized(element.innerText).length <= expected.length + 20);
  if (!label) return false;
  (label.closest<HTMLElement>("a,button,[role=button]") || label).click();
  return true;
}

const scan = () => applicationRows().forEach(mount);
scan();
new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "AF_NAVIGATE_VIECLAM24H_DETAIL") {
    const name = (message.fallback as CandidateDraft)?.candidate_name || "";
    const found = Boolean(name) && Array.from(document.querySelectorAll<HTMLElement>("a,button,[role=button],td,div,span"))
      .some((element) => normalized(element.innerText).startsWith(normalized(name))
        && normalized(element.innerText).length <= normalized(name).length + 20);
    sendResponse(found ? { ok: true } : { ok: false, error: "Không tìm thấy dòng ứng viên Vieclam24h" });
    if (found) setTimeout(() => clickCandidate(name), 0);
    return undefined;
  }
  if (message?.type !== "AF_EXTRACT_VIECLAM24H_DETAIL") return undefined;
  void (async () => {
    if (message.directDetail) {
      try { return await captureVieclam24hDetail(message.fallback as CandidateDraft); } catch {
        if (!clickCandidate((message.fallback as CandidateDraft).candidate_name)) throw new Error("Không tìm thấy dòng ứng viên Vieclam24h");
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    return captureVieclam24hDetail(message.fallback as CandidateDraft);
  })().then((capture) => sendResponse({ ok: true, capture }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Không đọc được Vieclam24h" }));
  return true;
});
