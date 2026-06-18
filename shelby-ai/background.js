// background.js - Shelby AI Background service worker for V2.2
console.log("[Shelby] Background worker active");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "analyze-image-authenticity",
    title: "Analyze image with Shelby",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyze-image-authenticity" && info.srcUrl && tab) {
    // Send message to active tab to open Shelby panel and start vision analysis
    chrome.tabs.sendMessage(tab.id, {
      type: "SHELBY_ANALYZE_IMAGE",
      imageUrl: info.srcUrl
    }).catch(err => {
      console.warn("[Shelby] Content script not loaded or listening on this page yet:", err);
    });
  }
});

// Listener for extension toolbar icon clicks
chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "SHELBY_TOGGLE_PANEL"
  }).catch(err => {
    console.warn("[Shelby] Could not toggle panel on active tab (script might not be injected):", err);
  });
});
