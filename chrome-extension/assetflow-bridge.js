async function runAssetFlowImport() {
  if (!location.hash.startsWith('#import-extension=')) return;
  const id = location.hash.slice('#import-extension='.length);
  const key = `import_${id}`;
  const stored = await chrome.storage.local.get(key);
  const payload = stored[key];
  if (!payload) return;

  try {
    const form = new FormData();
    Object.entries(payload.draft).forEach(([name, value]) => {
      if (value !== undefined && value !== null && String(value).trim()) form.append(name, String(value));
    });
    if (payload.file?.base64) {
      const binary = atob(payload.file.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      form.append('file', new File([bytes], payload.file.name || 'topcv-candidate.pdf', {
        type: payload.file.type || 'application/pdf',
      }));
    }

    const response = await fetch('/api/hr/cv', { method: 'POST', body: form, credentials: 'include' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || `AssetFlow trả lỗi ${response.status}`);
    await chrome.runtime.sendMessage({ type: 'assetflow-import-finish', id, ok: true, candidateId: json.data?.id });
  } catch (error) {
    await chrome.runtime.sendMessage({
      type: 'assetflow-import-finish', id, ok: false,
      error: error instanceof Error ? error.message : 'Không lưu được CV',
    });
  }
}

runAssetFlowImport();
