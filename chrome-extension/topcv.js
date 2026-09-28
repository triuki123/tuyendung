const BUTTON_CLASS = 'assetflow-import-button';

function findCandidateCards() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const emails = [];
  let textNode;
  while ((textNode = walker.nextNode())) {
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(textNode.nodeValue || '')) {
      emails.push(textNode.parentElement);
    }
  }

  const cards = new Set();
  for (const emailNode of emails) {
    let card = emailNode.parentElement;
    while (card && card !== document.body) {
      const text = card.innerText || '';
      const hasPhone = /(?:\+?84|0)(?:[ .-]?\d){9,10}/.test(text);
      const size = card.getBoundingClientRect();
      if (hasPhone && size.width > 650 && size.height >= 90 && size.height <= 280) {
        cards.add(card);
        break;
      }
      card = card.parentElement;
    }
  }
  return [...cards];
}

function cleanLines(card) {
  return (card.innerText || '').split('\n').map((line) => line.trim()).filter(Boolean);
}

function candidateFromCard(card) {
  const lines = cleanLines(card);
  const text = lines.join('\n');
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const phone = text.match(/(?:\+?84|0)(?:[ .-]?\d){9,10}/)?.[0]?.replace(/[ .-]/g, '') || '';
  const emailIndex = lines.findIndex((line) => line.includes(email));
  const ignored = /^(chưa xem|đã xem|chat với|ứng tuyển|tiếp nhận|ai đánh giá|sẵn sàng|phản hồi)/i;
  const name = lines.slice(0, emailIndex > 0 ? emailIndex : 6)
    .reverse().find((line) => !ignored.test(line) && !line.includes('@') && line.length >= 3 && line.length <= 80) || '';
  const campaign = lines.find((line) => /nhân viên|chuyên viên|trưởng|quản lý|developer|engineer|sales|marketing|kế toán/i.test(line) && line !== name) || '';
  const candidateLocation = text.match(/\(([^()]{2,60})\)/)?.[1] || '';
  const profileLink = [...card.querySelectorAll('a[href]')].map((a) => a.href)
    .find((href) => /cv|candidate|ung-vien|profile/i.test(href)) || window.location.href;

  return {
    candidate_name: name,
    candidate_email: email,
    candidate_phone: phone,
    position_applied: campaign.replace(/\s*#\d+.*$/, '').trim(),
    current_title: campaign.replace(/\s*#\d+.*$/, '').trim(),
    industry: '',
    skills: '',
    location: candidateLocation,
    note: `Nguồn: TopCV\nHồ sơ gốc: ${profileLink}`,
    source: 'TopCV',
    source_url: profileLink,
  };
}

function findCvUrl(card) {
  const elements = [card, ...card.querySelectorAll('*')];
  for (const element of elements) {
    for (const attribute of ['href', 'data-href', 'data-url', 'data-download-url', 'data-cv-url']) {
      const value = element.getAttribute?.(attribute);
      if (!value) continue;
      const absolute = new URL(value, window.location.href).href;
      if (/\.pdf(?:$|\?)|\.docx?(?:$|\?)|download.*cv|cv.*download/i.test(absolute)) return absolute;
    }
  }
  return '';
}

function visible(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

function candidateDetailTrigger(card, draft) {
  const candidates = [...card.querySelectorAll('a,button,[role="button"],[tabindex]')].filter(visible);
  const nameNode = [...card.querySelectorAll('*')].find((element) =>
    visible(element) && element.children.length === 0 && element.textContent?.trim() === draft.candidate_name);
  return candidates.find((element) => element.textContent?.trim() === draft.candidate_name)
    || nameNode?.closest('a,button,[role="button"],[tabindex]')
    || nameNode
    || candidates.find((element) => /^(chưa xem|đã xem|xem cv|xem hồ sơ)$/i.test(element.textContent?.trim() || ''))
    || candidates.find((element) => /candidate|ung-vien|profile|detail|cv\//i.test(element.getAttribute('href') || ''));
}

function urlsFromValue(value, output = new Set()) {
  if (typeof value === 'string') {
    const matches = value.match(/(?:https?:\/\/|\/)[^\s"'<>]+/g) || [];
    for (const match of matches) {
      try {
        const url = new URL(match.replace(/\\u0026/g, '&').replace(/\\\//g, '/'), location.href).href;
        if (/\.pdf(?:$|[?#])|\.docx?(?:$|[?#])|download.*cv|cv.*download|candidate.*file|file.*candidate/i.test(url)) output.add(url);
      } catch {}
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => urlsFromValue(item, output));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => urlsFromValue(item, output));
  }
  return output;
}

function scanCvUrls(scope = document) {
  const urls = new Set();
  const elements = [scope, ...scope.querySelectorAll('a,iframe,embed,object,[data-url],[data-href],[data-cv-url],[data-download-url]')];
  for (const element of elements) {
    for (const attribute of ['href', 'src', 'data', 'data-url', 'data-href', 'data-cv-url', 'data-download-url']) {
      const value = element.getAttribute?.(attribute);
      if (value) urlsFromValue(value, urls);
    }
  }
  for (const entry of performance.getEntriesByType('resource')) urlsFromValue(entry.name, urls);
  return [...urls];
}

async function waitForCandidateDetail(card, draft) {
  let url = findCvUrl(card);
  if (url) return { scope: card, url };
  const trigger = candidateDetailTrigger(card, draft);
  if (!trigger) throw new Error('Không tìm thấy nút mở hồ sơ TopCV');

  const detailHref = trigger.getAttribute?.('href');
  if (detailHref) {
    const detailResponse = await fetch(new URL(detailHref, location.href).href, { credentials: 'include' });
    if (detailResponse.ok) {
      const html = await detailResponse.text();
      const urlFromHtml = [...urlsFromValue(html)][0];
      if (urlFromHtml) return { scope: card, url: urlFromHtml };
    }
  }

  document.documentElement.classList.add('assetflow-background-scan');
  trigger.click();
  const started = Date.now();
  while (Date.now() - started < 12000) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const dialog = [...document.querySelectorAll('[role="dialog"],.modal,.ant-modal,.modal-dialog')]
      .filter(visible).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    const scope = dialog || document;
    url = scanCvUrls(scope)[0] || '';
    if (url) {
      document.documentElement.classList.remove('assetflow-background-scan');
      return { scope, url };
    }
  }
  document.documentElement.classList.remove('assetflow-background-scan');
  throw new Error('TopCV đã mở hồ sơ nhưng chưa tìm thấy nguồn file CV');
}

function enrichDraftFromDetail(draft, scope) {
  const text = scope.innerText || '';
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(/(?:\+?84|0)(?:[ .-]?\d){9,10}/)?.[0]?.replace(/[ .-]/g, '');
  const years = text.match(/(\d+(?:[.,]\d+)?)\s*năm\s*(?:kinh nghiệm|KN)/i)?.[1]?.replace(',', '.');
  const education = text.match(/(?:Trình độ|Học vấn)\s*[:\n]\s*([^\n]{2,80})/i)?.[1]?.trim();
  return {
    ...draft,
    candidate_email: email || draft.candidate_email,
    candidate_phone: phone || draft.candidate_phone,
    years_experience: years || '',
    education_level: education || '',
  };
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function readCvFile(url, draft, depth = 0) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`TopCV không cho tải file (${response.status})`);
  const contentType = response.headers.get('content-type') || '';
  if (/json/i.test(contentType) && depth < 2) {
    const json = await response.json();
    const nestedUrl = [...urlsFromValue(json)].find((value) => value !== url);
    if (!nestedUrl) throw new Error('TopCV không trả về URL file CV trong dữ liệu hồ sơ');
    return readCvFile(nestedUrl, draft, depth + 1);
  }
  const blob = await response.blob();
  if (/text\/html/i.test(blob.type)) throw new Error('TopCV trả về trang HTML thay vì file CV');
  if (blob.size > 20 * 1024 * 1024) throw new Error('File CV lớn hơn giới hạn 20 MB');
  const disposition = response.headers.get('content-disposition') || '';
  const fileName = disposition.match(/filename\*?=(?:UTF-8''|\")?([^";]+)/i)?.[1];
  return {
    base64: await blobToBase64(blob),
    name: fileName ? decodeURIComponent(fileName.replace(/"/g, '')) : `${draft.candidate_name || 'ung-vien'}-TopCV.pdf`,
    type: blob.type || 'application/pdf',
  };
}

function showImportNotice(message, state = 'error') {
  document.querySelector('.assetflow-import-notice')?.remove();
  const notice = document.createElement('div');
  notice.className = 'assetflow-import-notice';
  notice.dataset.state = state;
  notice.textContent = message;
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 6000);
}

async function sendToAssetFlow(card, button) {
  const draft = candidateFromCard(card);
  if (!draft.candidate_name) {
    button.textContent = '!';
    button.title = 'Không đọc được tên ứng viên';
    button.dataset.state = 'error';
    return;
  }

  button.disabled = true;
  button.textContent = '...';
  button.title = 'Đang chuyển CV vào AssetFlow';
  try {
    const detail = await waitForCandidateDetail(card, draft);
    const enrichedDraft = enrichDraftFromDetail(draft, detail.scope);
    const file = await readCvFile(detail.url, enrichedDraft);
    const id = crypto.randomUUID();
    button.dataset.importId = id;
    const result = await chrome.runtime.sendMessage({ type: 'assetflow-import-start', id, payload: { draft: enrichedDraft, file } });
    if (!result?.ok) throw new Error(result?.error || 'Không mở được AssetFlow');
  } catch (error) {
    document.documentElement.classList.remove('assetflow-background-scan');
    button.disabled = false;
    button.textContent = '!';
    button.title = error instanceof Error ? error.message : 'Không chuyển được CV';
    button.dataset.state = 'error';
    showImportNotice(button.title);
  }
}

function addButtons() {
  for (const card of findCandidateCards()) {
    if (card.querySelector(`.${BUTTON_CLASS}`)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.textContent = 'AF';
    button.title = 'Điền thông tin ứng viên vào Kho Ứng Viên AssetFlow';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      sendToAssetFlow(card, button);
    });
    card.appendChild(button);
    card.classList.add('assetflow-candidate-card');
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'assetflow-import-result') return;
  const button = document.querySelector(`.${BUTTON_CLASS}[data-import-id="${CSS.escape(message.id)}"]`);
  if (!button) return;
  button.disabled = false;
  button.textContent = message.ok ? '✓' : '!';
  button.title = message.ok ? 'Đã lưu vào Kho CV AssetFlow' : (message.error || 'Không lưu được CV');
  button.dataset.state = message.ok ? 'success' : 'error';
  showImportNotice(button.title, message.ok ? 'success' : 'error');
});

let scheduled = false;
const schedule = () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    addButtons();
  });
};

new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
schedule();
