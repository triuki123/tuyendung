const url = document.getElementById('url');
const notice = document.getElementById('notice');
chrome.storage.sync.get({ assetFlowUrl: 'https://assetflow.fadoai.com' }, (data) => { url.value = data.assetFlowUrl; });
document.getElementById('form').addEventListener('submit', (event) => {
  event.preventDefault();
  chrome.storage.sync.set({ assetFlowUrl: url.value.replace(/\/$/, '') }, () => {
    notice.textContent = 'Đã lưu.'; notice.classList.remove('hidden');
  });
});
