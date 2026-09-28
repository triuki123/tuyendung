const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.oasis.opendocument.text": ".odt",
  "application/vnd.oasis.opendocument.spreadsheet": ".ods",
  "application/rtf": ".rtf",
  "text/rtf": ".rtf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const SUPPORTED_EXTENSION = /\.(?:pdf|docx?|xlsx?|odt|ods|rtf|txt|md|markdown|csv|pptx?|jpe?g|png|gif|webp)$/i;

export function isSupportedCvUrl(url: string): boolean {
  return SUPPORTED_EXTENSION.test(url.split(/[?#]/, 1)[0])
    || /download.*(?:cv|attachment)|cv.*download|candidate.*file/i.test(url);
}

export function isSupportedCvMime(mime = ""): boolean {
  return Boolean(mime) && !/text\/html|javascript/i.test(mime);
}

export function extensionFor(mime = "", url = ""): string {
  const path = (() => { try { return new URL(url).pathname; } catch { return url.split(/[?#]/, 1)[0]; } })();
  const fromPath = path.match(SUPPORTED_EXTENSION)?.[0].toLowerCase();
  return fromPath || MIME_EXTENSIONS[mime.split(";", 1)[0].toLowerCase()] || ".bin";
}

export function cvFileName(candidate: string, source: string, mime = "", url = ""): string {
  return `${candidate || "ung-vien"}-${source}${extensionFor(mime, url)}`;
}
