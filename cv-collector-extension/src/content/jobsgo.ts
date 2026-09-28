import { captureJobsGoDetail } from "./jobsgo-adapter";
import type { CandidateDraft } from "../lib/types";

const MOUNTED = "data-assetflow-jobsgo-mounted";

function showNotice(message: string, success = false) {
  document.querySelector(".assetflow-jobsgo-notice")?.remove();
  const notice = document.createElement("div");
  notice.className = "assetflow-jobsgo-notice";
  notice.textContent = message;
  notice.style.cssText = `position:fixed;right:24px;bottom:24px;z-index:2147483647;max-width:420px;padding:12px 16px;border-radius:6px;background:${success ? "#087f5b" : "#b42318"};color:#fff;font:600 13px/1.4 Arial,sans-serif;box-shadow:0 8px 28px #0004`;
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 6000);
}

function candidateLinks(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/site/candidate/"],a[href*="/candidate/"],a[href*="candidate/detail"],a[href*="candidate_id"]',
  ))
    .filter((link) => !/\.(?:pdf|docx?|xlsx?|odt|ods|rtf|txt)(?:$|[?#])/i.test(link.href))
    .filter((link, index, all) => all.findIndex((item) => item.href === link.href) === index);
}

function cardFor(link: HTMLAnchorElement): HTMLElement {
  return link.closest<HTMLElement>('tr,[role="row"],article,li,[class*=candidate-row],[class*=candidate_item],[class*=candidate-item],.card')
    || link.closest<HTMLElement>('[class*=candidate],[class*=item]')
    || link.parentElement || link;
}

function fallbackFromCard(card: HTMLElement, link: HTMLAnchorElement): CandidateDraft {
  const content = card.innerText;
  const name = link.innerText.trim() || content.split("\n").map((line) => line.trim()).find(Boolean) || "Ứng viên JobsGO";
  return {
    candidate_name: name.replace(/\s*\([^)]*\)\s*$/, "").trim(),
    candidate_email: content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "",
    candidate_phone: content.match(/(?:\+?84|0)(?:[ .-]?\d){9,10}/)?.[0]?.replace(/[ .-]/g, "") || "",
    source: "JobsGO",
    note: `Nguồn: JobsGO\nHồ sơ gốc: ${link.href}`,
  };
}

function mount(link: HTMLAnchorElement) {
  const card = cardFor(link);
  if (card.hasAttribute(MOUNTED)) return;
  card.setAttribute(MOUNTED, "1");
  if (getComputedStyle(card).position === "static") card.style.position = "relative";
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;right:12px;bottom:12px;z-index:999";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = '<style>button{width:32px;height:32px;border:0;border-radius:50%;background:#5b4bd8;color:white;font:700 11px Arial;cursor:pointer;box-shadow:0 2px 7px #0003}button:disabled{opacity:.85}button[data-state=success]{background:#087f5b}button[data-state=error]{background:#b42318}</style><button title="Lưu CV vào Kho Ứng Viên AssetFlow">AF</button>';
  card.appendChild(host);
  const button = shadow.querySelector<HTMLButtonElement>("button")!;
  button.addEventListener("click", async (event) => {
    event.preventDefault(); event.stopPropagation();
    button.disabled = true; button.textContent = "...";
    const response = await chrome.runtime.sendMessage({
      type: "AF_IMPORT_CANDIDATE", source: "jobsgo", targetUrl: link.href,
      fallback: fallbackFromCard(card, link),
    }) as { ok: boolean; error?: string };
    if (!response?.ok) {
      button.disabled = false; button.textContent = "!"; button.dataset.state = "error";
      showNotice(response?.error || "Không nhập được CV JobsGO");
    } else {
      button.textContent = "✓"; button.dataset.state = "success";
      showNotice("Đã lưu CV vào Kho Ứng Viên AssetFlow", true);
    }
  });
}

const scan = () => candidateLinks().forEach(mount);
scan();
new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "AF_EXTRACT_JOBSGO_DETAIL") return undefined;
  captureJobsGoDetail(message.fallback as CandidateDraft)
    .then((capture) => sendResponse({ ok: true, capture }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Không đọc được JobsGO" }));
  return true;
});
