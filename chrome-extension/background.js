const pendingTabs = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'assetflow-import-start') {
    chrome.storage.local.set({ [`import_${message.id}`]: message.payload }).then(() => {
      chrome.tabs.create({
        url: `https://assetflow.fadoai.com/nguon-nhan-luc/kho-ung-vien#import-extension=${message.id}`,
        active: true,
      }).then((tab) => {
        pendingTabs.set(message.id, { importTabId: tab.id, sourceTabId: sender.tab?.id });
        sendResponse({ ok: true });
      });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'assetflow-import-finish') {
    const pending = pendingTabs.get(message.id);
    chrome.storage.local.remove(`import_${message.id}`);
    if (pending?.sourceTabId) {
      chrome.tabs.sendMessage(pending.sourceTabId, {
        type: 'assetflow-import-result', id: message.id,
        ok: message.ok, error: message.error,
      }).catch(() => {});
    }
    if (message.ok && pending?.importTabId) {
      chrome.tabs.update(pending.importTabId, {
        url: `https://assetflow.fadoai.com/nguon-nhan-luc/kho-ung-vien?openCandidate=${encodeURIComponent(message.candidateId || '')}`,
        active: true,
      }).catch(() => {});
    }
    pendingTabs.delete(message.id);
    sendResponse({ ok: true });
  }
});
