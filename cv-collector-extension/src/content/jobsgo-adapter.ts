import type { CandidateDraft, CandidateExtraction } from "../lib/types";
import { cvFileName, isSupportedCvUrl } from "../lib/file-format";

function text(selector: string): string {
  return document.querySelector<HTMLElement>(selector)?.innerText?.trim() || "";
}

function fileUrl(): string | undefined {
  const selectors = [
    'a[href$=".pdf"]', 'a[href*=".pdf?"]', 'a[href$=".doc"]', 'a[href$=".docx"]',
    'a[href$=".xls"]', 'a[href$=".xlsx"]', 'a[href$=".odt"]', 'a[href$=".ods"]', 'a[href$=".rtf"]',
    'a[href$=".txt"]', 'a[href$=".md"]', 'a[href$=".csv"]', 'a[href$=".ppt"]', 'a[href$=".pptx"]',
    'a[href*="download"]', 'a[href*="attachment"]', '[data-download-url]', '[data-cv-url]',
    'iframe[src*="pdf"]', 'embed[src]', 'object[data]',
  ];
  for (const selector of selectors) {
    const element = document.querySelector<Element>(selector);
    const value = element?.getAttribute("href") || element?.getAttribute("src") || element?.getAttribute("data")
      || element?.getAttribute("data-download-url") || element?.getAttribute("data-cv-url");
    if (value) {
      const resolved = new URL(value, location.href);
      if (/docs\.google\.com$/i.test(resolved.hostname) && /\/gview/i.test(resolved.pathname)) {
        const original = resolved.searchParams.get("url");
        if (original) return new URL(original, location.href).href;
      }
      return resolved.href;
    }
  }
  return performance.getEntriesByType("resource").map((entry) => entry.name)
    .find(isSupportedCvUrl);
}

export function extractJobsGoDraft(scope: HTMLElement = document.body): CandidateDraft {
  const body = scope.innerText || "";
  const name = text("h1") || text("h2") || text(".candidate-name") || text("[class*=candidate][class*=name]");
  const email = body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = body.match(/(?:\+?84|0)(?:[ .-]?\d){9,10}/)?.[0]?.replace(/[ .-]/g, "") || "";
  const locationText = body.match(/(?:Địa điểm|Nơi ở|Tỉnh\/Thành)\s*[:\n]\s*([^\n]{2,80})/i)?.[1]?.trim() || "";
  const years = body.match(/(\d+(?:[.,]\d+)?)\s*năm\s*(?:kinh nghiệm|KN)/i)?.[1]?.replace(",", ".") || "";
  const education = body.match(/(?:Trình độ|Học vấn)\s*[:\n]\s*([^\n]{2,100})/i)?.[1]?.trim() || "";
  const title = body.match(/(?:Vị trí mong muốn|Chức danh|Vị trí ứng tuyển)\s*[:\n]\s*([^\n]{2,120})/i)?.[1]?.trim() || "";
  const skills = body.match(/(?:Kỹ năng|Kỹ năng chuyên môn)\s*[:\n]\s*([^\n]{2,240})/i)?.[1]?.trim() || "";
  const languages = body.match(/(?:Ngoại ngữ|Ngôn ngữ)\s*[:\n]\s*([^\n]{2,160})/i)?.[1]?.trim() || "";
  const expectedSalary = body.match(/(?:Mức lương mong muốn|Lương mong muốn)\s*[:\n]\s*([^\n]{2,80})/i)?.[1]?.trim() || "";
  return {
    candidate_name: name.replace(/\s*\([^)]*\)\s*$/, "").trim(),
    candidate_email: email,
    candidate_phone: phone,
    position_applied: title,
    current_title: title,
    years_experience: years,
    education_level: education,
    expected_salary: expectedSalary,
    location: locationText,
    skills,
    languages,
    source: "JobsGO",
    note: `Nguồn: JobsGO\nHồ sơ gốc: ${location.href}`,
  };
}

export async function captureJobsGoDetail(fallback: CandidateDraft): Promise<CandidateExtraction> {
  const extracted = extractJobsGoDraft();
  const draft = {
    ...fallback,
    ...Object.fromEntries(Object.entries(extracted).filter(([, value]) => Boolean(value))),
    source: "JobsGO",
    note: `Nguồn: JobsGO\nHồ sơ gốc: ${location.href}`,
  } as CandidateDraft;
  const url = fileUrl();
  if (!url) throw new Error("Không tìm thấy file CV/đính kèm trong hồ sơ JobsGO");
  return { draft, file: { url, name: cvFileName(draft.candidate_name, "JobsGO", "", url) } };
}
