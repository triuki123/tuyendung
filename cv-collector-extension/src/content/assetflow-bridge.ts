async function importCandidate() {
  if (!location.hash.startsWith("#assetflow-import=")) return;
  const id = location.hash.slice("#assetflow-import=".length);
  const key = `assetflow_import_${id}`;
  const stored = await chrome.storage.local.get(key);
  const capture = stored[key];
  if (!capture) return;
  try {
    const form = new FormData();
    Object.entries(capture.draft as Record<string, unknown>).forEach(([name, value]) => {
      if (value != null && String(value).trim()) form.append(name, String(value));
    });
    const binary = atob(capture.file.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    form.append("file", new File([bytes], capture.file.name, { type: capture.file.type }));
    const response = await fetch("/api/hr/cv", { method: "POST", body: form, credentials: "include" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || `AssetFlow trả lỗi ${response.status}`);
    await chrome.storage.local.remove(key);
    location.replace(`/nguon-nhan-luc/kho-ung-vien?openCandidate=${encodeURIComponent(json.data.id)}`);
  } catch (error) {
    document.body.insertAdjacentHTML("beforeend", `<div style="position:fixed;right:24px;bottom:24px;z-index:99999;background:#b42318;color:white;padding:12px 16px">${error instanceof Error ? error.message : "Không lưu được CV"}</div>`);
  }
}

void importCandidate();
