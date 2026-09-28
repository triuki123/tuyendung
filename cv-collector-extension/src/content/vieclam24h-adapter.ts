import type { CandidateDraft, CandidateExtraction } from "../lib/types";
import { cvFileName, isSupportedCvUrl } from "../lib/file-format";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?84|0)(?:[ .-]?\d){9,10}/;

function firstText(scope: ParentNode, selectors: string[]): string {
  for (const selector of selectors) {
    const value = scope.querySelector<HTMLElement>(selector)?.innerText?.trim();
    if (value) return value;
  }
  return "";
}

function labelledValue(body: string, labels: string): string {
  return body.match(new RegExp(`(?:${labels})\\s*[:\\n]\\s*([^\\n]{2,120})`, "i"))?.[1]?.trim() || "";
}

function fileUrl(scope: ParentNode = document): string | undefined {
  const elements = Array.from(scope.querySelectorAll<Element>("a[href],iframe[src],embed[src],object[data],[data-download-url],[data-cv-url]"));
  for (const element of elements) {
    const value = element.getAttribute("href") || element.getAttribute("src") || element.getAttribute("data")
      || element.getAttribute("data-download-url") || element.getAttribute("data-cv-url");
    if (!value) continue;
    const url = new URL(value, location.href).href;
    if (url.startsWith("blob:")) return url;
    if (isSupportedCvUrl(url)) return url;
  }
  const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
  return resources.find((url) => url.startsWith("blob:"))
    || resources.find((url) => {
      if (!isSupportedCvUrl(url)) return false;
      const path = url.split(/[?#]/, 1)[0];
      return !/\.(?:jpe?g|png|gif|webp)$/i.test(path)
        || /(?:cv|resume|attachment|download|ho-so|hoso)/i.test(url);
    });
}

export function extractVieclam24hDraft(scope: HTMLElement = document.body): CandidateDraft {
  const body = scope.innerText || "";
  const heading = firstText(scope, ["[class*=candidate][class*=name]", "[class*=profile][class*=name]", "h1", "h2"]);
  const position = labelledValue(body, "Vị trí ứng tuyển|Vị trí mong muốn|Chức danh|Công việc mong muốn");
  const currentTitle = labelledValue(body, "Chức danh hiện tại|Công việc hiện tại") || position;
  return {
    candidate_name: heading.replace(/\s*\([^)]*\)\s*$/, "").trim(),
    candidate_email: body.match(EMAIL)?.[0] || "",
    candidate_phone: body.match(PHONE)?.[0]?.replace(/[ .-]/g, "") || "",
    position_applied: position,
    current_title: currentTitle,
    years_experience: body.match(/(\d+(?:[.,]\d+)?)\s*năm\s*(?:kinh nghiệm|KN)/i)?.[1]?.replace(",", ".") || "",
    education_level: labelledValue(body, "Trình độ|Học vấn|Bằng cấp"),
    expected_salary: labelledValue(body, "Mức lương mong muốn|Lương mong muốn"),
    location: labelledValue(body, "Địa điểm|Nơi ở|Tỉnh\/Thành|Khu vực"),
    skills: labelledValue(body, "Kỹ năng|Kỹ năng chuyên môn"),
    languages: labelledValue(body, "Ngoại ngữ|Ngôn ngữ"),
    source: "Vieclam24h",
    note: `Nguồn: Vieclam24h\nHồ sơ gốc: ${location.href}`,
  };
}

export async function captureVieclam24hDetail(fallback: CandidateDraft): Promise<CandidateExtraction> {
  const extracted = extractVieclam24hDraft();
  const draft = {
    ...fallback,
    ...Object.fromEntries(Object.entries(extracted).filter(([, value]) => Boolean(value))),
    source: "Vieclam24h",
    note: `Nguồn: Vieclam24h\nHồ sơ gốc: ${location.href}`,
  } as CandidateDraft;
  let url = fileUrl();
  let download: HTMLElement | undefined;
  if (!url) {
    download = Array.from(document.querySelectorAll<HTMLElement>("a,button,[role=button],div.cursor-pointer"))
      .find((element) => /^tải xuống(?:\s+pdf)?$/i.test(element.innerText.trim()));
    download?.click();
    for (let attempt = 0; attempt < 15 && !url; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      url = fileUrl();
    }
  }
  // The main-world hook captures the generated Blob. A same-page placeholder
  // lets the service worker continue to the captured bytes when no stable URL exists.
  if (!url && download) url = location.href;
  if (!url) throw new Error("Không tìm thấy file CV/đính kèm trong hồ sơ Vieclam24h");
  return { draft, file: { url, name: cvFileName(draft.candidate_name, "Vieclam24h", "", url) } };
}
