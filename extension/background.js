/**
 * On install/update/reload, inject the content script into every already-open
 * tab — Chrome only auto-injects into pages loaded after installation, which
 * otherwise makes a freshly loaded extension look broken until a reload.
 */

'use strict';

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js'],
      });
    } catch {
      // Restricted pages (Web Store, chrome://, discarded tabs) — skip quietly.
    }
  }
});
