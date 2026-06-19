// background.js - Shelby AI Background Worker
// In the current architecture, all scanning and AI logic is handled directly by the FastAPI backend.
// This service worker exists to satisfy the extension environment requirements.

chrome.runtime.onInstalled.addListener(() => {
  console.log("Shelby AI Trust Companion loaded successfully.");
});
