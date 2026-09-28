import type { CandidateDraft } from "../lib/types";
import { captureDetail, detailUrlForCard, extractDraft } from "./topcv-adapter";

const MOUNTED = "data-assetflow-cv-mounted";

function cards(): HTMLElement[] {
  const found = new Set<HTMLElement>();
  const detailLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/cvs-management/cvs/"],a[href*="cv-detail"],a[href*="candidate-detail"],a[href*="ung-vien"],a[href*="profile"]',
  ));
  for (const link of detailLinks) {
    const card = link.closest<HTMLElement>("article,li,.card,[class*=candidate],[class*=profile],[class*=item]") || link.parentElement;
    if (card) found.add(card);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(node.nodeValue || "")) continue;
    let card = (node.parentElement || null) as HTMLElement | null;
    while (card && card !== document.body) {
      const rect = card.getBoundingClientRect();
      if (rect.width > 420 && rect.height >= 70 && rect.height <= 360
        && (/(?:\+?84|0)(?:[ .-]?\d){9,10}/.test(card.innerText) || card.querySelector('a[href*="cv"],a[href*="candidate"]'))) {
        found.add(card); break;
      }
      card = card.parentElement;
    }
  }
  return [...found];
}

function notice(message: string, success = false) {
  document.querySelector(".assetflow-cv-notice")?.remove();
  const element = document.createElement("div");
  element.className = "assetflow-cv-notice";
  element.textContent = message;
  element.style.cssText = `position:fixed;right:24px;bottom:24px;z-index:2147483647;max-width:420px;padding:12px 16px;border-radius:6px;background:${success ? "#087f5b" : "#b42318"};color:#fff;font:600 13px/1.4 Arial,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.3)`;
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 6000);
}

function mount(card: HTMLElement) {
  if (card.hasAttribute(MOUNTED)) return;
  card.setAttribute(MOUNTED, "1");
  if (getComputedStyle(card).position === "static") card.style.position = "relative";
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;right:58px;bottom:12px;z-index:999";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>.btn{width:32px;height:32px;border:0;border-radius:50%;background:#5b4bd8;color:#fff;font:700 11px Arial;cursor:pointer;box-shadow:0 2px 7px #0003}.btn:disabled{opacity:.7;cursor:wait}.btn[data-state=success]{background:#087f5b}.btn[data-state=error]{background:#b42318}</style><button class="btn" title="Lưu CV vào Kho Ứng Viên AssetFlow">AF</button>`;
  card.appendChild(host);
  const button = shadow.querySelector<HTMLButtonElement>("button")!;
  button.addEventListener("click", async (event) => {
    event.preventDefault(); event.stopPropagation();
    button.disabled = true; button.textContent = "...";
    const fallback = extractDraft(card);
    const detailUrl = detailUrlForCard(card);
    const response = await chrome.runtime.sendMessage({
      type: "AF_IMPORT_CANDIDATE",
      source: "topcv",
      targetUrl: detailUrl || location.href,
      directDetail: Boolean(detailUrl),
      fallback,
    }) as { ok: boolean; error?: string };
    if (!response?.ok) {
      button.disabled = false; button.textContent = "!"; button.dataset.state = "error";
      notice(response?.error || "Không thể nhập CV");
    } else {
      button.textContent = "✓"; button.dataset.state = "success";
      notice("Đã lưu CV vào Kho Ứng Viên AssetFlow", true);
    }
  });
}

function scan() { cards().forEach(mount); }
scan();
new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "AF_OPEN_AND_EXTRACT_TOPCV") return undefined;
  const fallback = message.fallback as CandidateDraft;
  const run = async () => {
    const deadline = Date.now() + 15_000;

    if (message.directDetail) {
      let lastError = "TopCV chưa tải xong file CV";
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try { return await captureDetail(fallback); }
        catch (error) { lastError = error instanceof Error ? error.message : lastError; }
      }
      throw new Error(lastError);
    }

    let targetCard: HTMLElement | undefined;
    while (Date.now() < deadline && !targetCard) {
      targetCard = cards().find((card) => {
        const text = card.innerText;
        return Boolean(fallback.candidate_email && text.includes(fallback.candidate_email))
          || Boolean(fallback.candidate_phone && text.replace(/[ .-]/g, "").includes(fallback.candidate_phone));
      });
      if (!targetCard) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (!targetCard) throw new Error("Không tìm thấy ứng viên trong tab TopCV nền");

    const nameElements = Array.from(targetCard.querySelectorAll<HTMLElement>("a,button,[role=button],[tabindex],div,span"));
    const nameElement = nameElements.find((element) =>
      element.children.length === 0 && element.innerText?.trim() === fallback.candidate_name);
    const trigger = nameElement?.closest<HTMLElement>("a,button,[role=button],[tabindex]") || nameElement;
    if (!trigger) throw new Error("Không tìm thấy nút mở CV của ứng viên");
    trigger.click();

    let lastError = "TopCV chưa tải xong file CV";
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try { return await captureDetail(fallback); }
      catch (error) { lastError = error instanceof Error ? error.message : lastError; }
    }
    throw new Error(lastError);
  };
  run()
    .then((capture) => sendResponse({ ok: true, capture }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Không đọc được CV" }));
  return true;
});
