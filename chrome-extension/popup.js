const ids = ['name', 'email', 'phone', 'title', 'industry', 'skills', 'note'];
const $ = (id) => document.getElementById(id);

async function getSettings() {
  return chrome.storage.sync.get({ assetFlowUrl: 'https://assetflow.fadoai.com' });
}

async function readPage() {
  $('notice').classList.add('hidden');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || '')) return showError('Trang hiện tại không thể đọc.');
  $('source').textContent = new URL(tab.url).hostname;
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractCandidate });
    for (const id of ids) $(id).value = result[id] || '';
    $('note').value = [`Nguồn: ${result.sourceSite}`, `Hồ sơ gốc: ${result.sourceUrl}`].join('\n');
  } catch (error) { showError('Không đọc được trang. Hãy tải lại trang rồi thử lại.'); }
}

async function beginImport() {
  await chrome.storage.local.set({ pageReadConsent: true });
  $('consent-panel').classList.add('hidden');
  $('candidate-form').classList.remove('hidden');
  $('refresh').classList.remove('hidden');
  await readPage();
}

function showError(message) { $('notice').textContent = message; $('notice').classList.remove('hidden'); }

function extractCandidate() {
  const text = document.body.innerText.replace(/\u00a0/g, ' ');
  const meta = (selector, attr = 'content') => document.querySelector(selector)?.getAttribute(attr)?.trim() || '';
  const firstText = (selectors) => {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.textContent?.trim();
      if (value && value.length < 120) return value;
    }
    return '';
  };
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const phone = text.match(/(?:\+?84|0)(?:[ .-]?\d){9,10}/)?.[0]?.replace(/[ .-]/g, '') || '';
  const name = firstText(['h1', '[class*="candidate-name"]', '[class*="profile-name"]', '[data-testid*="name"]']) || meta('meta[property="og:title"]');
  const title = firstText(['[class*="job-title"]', '[class*="position"]', '[class*="headline"]', 'h2']);
  const skillNodes = [...document.querySelectorAll('[class*="skill"], [data-testid*="skill"]')]
    .map((node) => node.textContent?.trim()).filter((value) => value && value.length < 60).slice(0, 15);
  return {
    name: name.replace(/\s*[|\-–].*$/, '').trim(), email, phone, title,
    industry: '', skills: [...new Set(skillNodes)].join(', '), note: '',
    sourceSite: location.hostname, sourceUrl: location.href,
  };
}

$('candidate-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!$('name').value.trim()) return showError('Cần nhập họ tên ứng viên.');
  const draft = Object.fromEntries(ids.map((id) => [id, $(id).value.trim()]));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  draft.source_site = tab?.url ? new URL(tab.url).hostname : '';
  draft.source_url = tab?.url || '';
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(draft))));
  const { assetFlowUrl } = await getSettings();
  chrome.tabs.create({ url: `${assetFlowUrl.replace(/\/$/, '')}/nguon-nhan-luc/kho-ung-vien#import=${encodeURIComponent(payload)}` });
  window.close();
});

$('refresh').addEventListener('click', readPage);
$('allow-read').addEventListener('click', beginImport);
$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.storage.local.get({ pageReadConsent: false }).then(({ pageReadConsent }) => {
  if (pageReadConsent) beginImport();
  else $('source').textContent = 'Chỉ đọc trang khi bạn đồng ý';
});
