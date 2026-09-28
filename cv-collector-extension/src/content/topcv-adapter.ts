import type { CandidateDraft, CandidateExtraction } from "../lib/types";
import { cvFileName, isSupportedCvUrl } from "../lib/file-format";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?84|0)(?:[ .-]?\d){9,10}/;

function lines(scope: ParentNode): string[] {
  return ((scope as HTMLElement).innerText || "").split("\n").map((line) => line.trim()).filter(Boolean);
}

export function extractDraft(scope: HTMLElement, sourceUrl = location.href): CandidateDraft {
  const values = lines(scope);
  const text = values.join("\n");
  const email = text.match(EMAIL)?.[0] || "";
  const phone = text.match(PHONE)?.[0]?.replace(/[ .-]/g, "") || "";
  const emailIndex = values.findIndex((value) => value.includes(email));
  const ignored = /^(chưa xem|đã xem|chat với|ứng tuyển|tiếp nhận|ai đánh giá|sẵn sàng|phản hồi)/i;
  const name = values.slice(0, emailIndex > 0 ? emailIndex : 10).reverse()
    .find((value) => !ignored.test(value) && !value.includes("@") && value.length >= 3 && value.length <= 100) || "";
  const title = values.find((value) =>
    value !== name && /nhân viên|chuyên viên|trưởng|quản lý|developer|engineer|sales|marketing|kế toán/i.test(value)) || "";
  const locationText = text.match(/\(([^()]{2,60})\)/)?.[1] || "";
  const years = text.match(/(\d+(?:[.,]\d+)?)\s*năm\s*(?:kinh nghiệm|KN)/i)?.[1]?.replace(",", ".") || "";
  const education = text.match(/(?:Trình độ|Học vấn)\s*[:\n]\s*([^\n]{2,80})/i)?.[1]?.trim() || "";
  const skills = text.match(/(?:Kỹ năng|Kỹ năng chuyên môn)\s*[:\n]\s*([^\n]{2,240})/i)?.[1]?.trim() || "";
  const languages = text.match(/(?:Ngoại ngữ|Ngôn ngữ)\s*[:\n]\s*([^\n]{2,160})/i)?.[1]?.trim() || "";
  const expectedSalary = text.match(/(?:Mức lương mong muốn|Lương mong muốn)\s*[:\n]\s*([^\n]{2,80})/i)?.[1]?.trim() || "";

  return {
    candidate_name: name,
    candidate_email: email,
    candidate_phone: phone,
    position_applied: title.replace(/\s*#\d+.*$/, "").trim(),
    current_title: title.replace(/\s*#\d+.*$/, "").trim(),
    years_experience: years,
    education_level: education,
    expected_salary: expectedSalary,
    location: locationText,
    skills,
    languages,
    source: "TopCV",
    note: `Nguồn: TopCV\nHồ sơ gốc: ${sourceUrl}`,
  };
}

function candidateUrl(scope: HTMLElement): string | undefined {
  const current = new URL(location.href);
  const links = Array.from(scope.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .map((link) => link.href)
    .filter((href) => {
      if (!/^https?:/i.test(href)) return false;
      const url = new URL(href);
      return url.origin === current.origin && `${url.pathname}${url.search}` !== `${current.pathname}${current.search}`;
    });
  return links.find((href) => /\/cv\/|cv-detail|candidate-detail|ung-vien|profile/i.test(href))
    || links.find((href) => /cvs-management\/(?:detail\/)?\d+|candidate[_-]?id=|cv[_-]?id=/i.test(href));
}

export function detailUrlForCard(card: HTMLElement): string | undefined {
  return candidateUrl(card);
}

function cvUrl(scope: ParentNode): string | undefined {
  const elements = [scope, ...Array.from(scope.querySelectorAll("*"))];
  for (const element of elements) {
    for (const attribute of ["href", "src", "data", "data-url", "data-href", "data-download-url", "data-cv-url"]) {
      const value = (element as Element).getAttribute?.(attribute);
      if (!value) continue;
      const absolute = new URL(value, location.href).href;
      if (isSupportedCvUrl(absolute)) return absolute;
    }
  }
  return performance.getEntriesByType("resource").map((entry) => entry.name)
    .find(isSupportedCvUrl);
}

export async function captureDetail(fallback: CandidateDraft): Promise<CandidateExtraction> {
  const scope = (Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],.modal,.ant-modal,.modal-dialog'))
    .find((element) => element.getBoundingClientRect().width > 0) || document.body);
  const extracted = extractDraft(scope, location.href);
  const draft = {
    ...fallback,
    ...Object.fromEntries(Object.entries(extracted).filter(([, value]) => Boolean(value))),
    source: "TopCV",
    note: `Nguồn: TopCV\nHồ sơ gốc: ${location.href}`,
  } as CandidateDraft;
  if (!draft.candidate_name) draft.candidate_name = fallback.candidate_name;
  let url = cvUrl(scope);
  const detailHref = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/cvs-management/cvs/"]'))
    .map((link) => link.href).find((href) => /\/app\/cvs-management\/cvs\/\d+/i.test(href));
  const cvId = location.pathname.match(/\/app\/cvs-management\/cvs\/(\d+)/i)?.[1]
    || detailHref?.match(/\/app\/cvs-management\/cvs\/(\d+)/i)?.[1];
  if (cvId) {
    try {
      const response = await fetch(`https://tuyendung-api.topcv.vn/api/v1/cv-management/cvs/${cvId}`, {
        credentials: "include",
        headers: { accept: "application/json", "x-refer-url": location.href },
      });
      if (response.ok) {
        const payload = await response.json() as { cv?: { iframe_access_url?: string }; data?: { cv?: { iframe_access_url?: string }; iframe_access_url?: string } };
        const signedUrl = payload.cv?.iframe_access_url || payload.data?.cv?.iframe_access_url || payload.data?.iframe_access_url;
        if (typeof signedUrl === "string" && /^https:\/\/s3\.topcv\.vn\//i.test(signedUrl)) url = signedUrl;
      }
    } catch { /* Giữ URL tìm từ DOM nếu API chi tiết tạm thời không phản hồi. */ }
  }
  if (!url) throw new Error("Không tìm thấy URL tải PDF/DOCX trong hồ sơ TopCV");
  let name = cvFileName(draft.candidate_name, "TopCV", "", url);
  if (url.startsWith("blob:")) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Không đọc được file CV blob (${response.status})`);
    const blob = await response.blob();
    if (!blob.size) throw new Error("File CV blob rỗng");
    if (blob.size > 20 * 1024 * 1024) throw new Error("File CV vượt quá 20 MB");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    name = cvFileName(draft.candidate_name, "TopCV", blob.type, url);
    return { draft, file: { url, name, base64: btoa(binary), type: blob.type || "application/octet-stream" } };
  }
  return { draft, file: { url, name } };
}
