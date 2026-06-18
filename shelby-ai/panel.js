// panel.js - Shelby AI Companion UI Management & Backend Integration
// Implements V2.2 Startup Diagnostics, Safe DOM initialization, and Health Pings.

console.log("[Shelby] Panel initialized");

let currentUrl = "";
let currentContext = "General";
let currentScanId = "";
let pageContextText = "";
let conversationContextText = "";
let pageSelectedText = null;
let currentDraftOptions = {};
let chatHistory = [];
let isVisionEnabled = true;

// Client-side local cache (URL -> {data, clientTimestamp})
const clientScanCache = {};

// 1. Safe DOM Initialization and ID Validation
const requiredElements = {
  // Main header
  featuresFound: 'shelby-features-found-id',
  privacyToggleBtn: 'shelby-privacy-toggle-btn',
  privacyText: 'shelby-privacy-text-id',
  closeBtn: 'close-panel-btn',
  scanningLine: 'shelby-scanning-line',
  scanTimeLabel: 'shelby-scan-time',
  visionOffWarning: 'shelby-vision-off-warning',
  // Memory
  memoryBox: 'shelby-memory-box',
  memLastVisit: 'shelby-memory-last-visit',
  memPrevAdvice: 'shelby-memory-prev-advice',
  memChanges: 'shelby-memory-changes',
  // Actions
  suggestedActions: 'shelby-suggested-actions',
  // Image Section
  imageSection: 'shelby-image-section',
  imagePreview: 'shelby-image-preview',
  imageVerdict: 'shelby-image-verdict',
  imageConfidence: 'shelby-image-confidence',
  imageExplanation: 'shelby-image-explanation-id',
  imageIndicators: 'shelby-image-indicators',
  // Context findings
  contextSection: 'shelby-context-section',
  contextVerdict: 'shelby-context-verdict',
  contextTrustScore: 'shelby-context-trust-score',
  contextConfidence: 'shelby-context-confidence',
  contextSummary: 'shelby-context-summary',
  whySection: 'shelby-why-section-id',
  whyList: 'shelby-why-list-id',
  modeDetails: 'shelby-mode-details',
  // Chat
  chatLog: 'shelby-chat-log',
  chatInput: 'shelby-chat-input',
  chatSubmitBtn: 'shelby-chat-submit-btn',
  // Debug Dashboard
  dbgScanSource: 'dbg-scan-source',
  dbgMode: 'dbg-mode',
  dbgCtxQuality: 'dbg-ctx-quality',
  dbgCtxLen: 'dbg-ctx-len',
  dbgEvidenceCount: 'dbg-evidence-count',
  dbgLastRequest: 'dbg-last-request',
  dbgBackend: 'dbg-backend',
  dbgOpenai: 'dbg-openai',
  dbgLastScan: 'dbg-last-scan',
  dbgCtxPreview: 'dbg-ctx-preview',
  // Startup Diagnostics UI
  diagExtensionLoaded: 'diag-extension-loaded',
  diagContentScript: 'diag-content-script',
  diagPanelInjected: 'diag-panel-injected',
  diagPanelVisible: 'diag-panel-visible',
  diagBackendConnected: 'diag-backend-connected',
  diagOpenaiStatus: 'diag-openai-status',
  diagUrl: 'diag-url',
  diagMode: 'diag-mode',
  diagErrorBox: 'shelby-diag-error-box',
  diagErrorsList: 'shelby-diag-errors-list'
};

const dom = {};
const missingElements = [];

// Validate DOM IDs
for (const [key, id] of Object.entries(requiredElements)) {
  const el = document.getElementById(id);
  if (el) {
    dom[key] = el;
  } else {
    missingElements.push(id);
    console.error(`[Shelby] Missing DOM element ID: ${id}`);
  }
}

// Render Startup DOM validation failures
if (missingElements.length > 0) {
  const errBox = document.getElementById('shelby-diag-error-box');
  const errList = document.getElementById('shelby-diag-errors-list');
  const panelLoaded = document.getElementById('diag-panel-loaded');
  if (panelLoaded) {
    panelLoaded.innerText = '❌ Failed';
    panelLoaded.className = 'status-label danger';
  }
  if (errBox && errList) {
    errBox.classList.remove('shelby-hidden');
    errList.innerHTML = missingElements.map(id => `<li>❌ Missing element: ${id}</li>`).join('');
  }
}

// 2. Safe Event Listeners Binding Wrapper
function safeBindEvent(element, eventType, callback) {
  if (element) {
    element.addEventListener(eventType, callback);
  } else {
    console.warn(`[Shelby] Cannot bind event '${eventType}' because element is null.`);
  }
}

// 3. Initialize Privacy Status Toggle
async function initPrivacyToggle() {
  const config = await chrome.storage.local.get('shelby_vision');
  isVisionEnabled = config.shelby_vision !== false;
  updatePrivacyUI(isVisionEnabled);
}

function updatePrivacyUI(enabled) {
  isVisionEnabled = enabled;
  if (enabled) {
    if (dom.privacyToggleBtn) dom.privacyToggleBtn.className = 'shelby-privacy-badge vision-on';
    if (dom.privacyText) dom.privacyText.innerText = 'Vision ON';
    if (dom.visionOffWarning) dom.visionOffWarning.classList.add('shelby-hidden');
  } else {
    if (dom.privacyToggleBtn) dom.privacyToggleBtn.className = 'shelby-privacy-badge vision-off';
    if (dom.privacyText) dom.privacyText.innerText = 'Vision OFF';
    if (dom.visionOffWarning) dom.visionOffWarning.classList.remove('shelby-hidden');
  }
}

// Verify backend connectivity before scans
async function verifyBackendHealth() {
  const healthUrl = "http://127.0.0.1:8000/health";
  try {
    const response = await fetch(healthUrl, { method: 'GET', cache: 'no-cache' });
    if (response.ok) {
      const data = await response.json();
      return {
        reachable: true,
        openai: data.openai_key_configured ? "✓ Available" : "❌ Key Missing"
      };
    }
  } catch (err) {
    // connection failure
  }
  return { reachable: false, openai: "❌ Offline" };
}

// Safe Bindings
safeBindEvent(dom.privacyToggleBtn, 'click', async () => {
  const config = await chrome.storage.local.get('shelby_vision');
  const nextState = config.shelby_vision === false;
  await chrome.storage.local.set({ 'shelby_vision': nextState });
  updatePrivacyUI(nextState);
  initializeScanSequence();
});

safeBindEvent(dom.closeBtn, 'click', () => {
  window.parent.postMessage({ type: 'SHELBY_CLOSE_PANEL' }, '*');
});

safeBindEvent(dom.chatSubmitBtn, 'click', handleChatSubmit);
safeBindEvent(dom.chatInput, 'keydown', (e) => {
  if (e.key === 'Enter') handleChatSubmit();
});

// Message listener from parent/content script
window.addEventListener('message', async (event) => {
  const msg = event.data;

  if (msg.type === 'SHELBY_PANEL_OPENED') {
    currentUrl = msg.payload.url;
    currentContext = msg.payload.mode;
    pageSelectedText = msg.payload.selectedText;
    
    // Set Content Script connection status to green
    if (dom.diagContentScript) {
      dom.diagContentScript.innerText = "✓ Injected";
      dom.diagContentScript.className = "status-label success";
    }

    // Set diagnostics current URL/Mode details
    if (dom.diagUrl) dom.diagUrl.innerText = currentUrl ? currentUrl.replace(/^(https?:\/\/)?(www\.)?/, '').slice(0, 32) + '...' : '--';
    if (dom.diagMode) dom.diagMode.innerText = currentContext;

    // Apply dynamic webpage theme variables
    if (msg.payload.theme) {
      applyDynamicTheme(msg.payload.theme);
    }
    
    if (msg.payload.focusInput && dom.chatInput) {
      setTimeout(() => dom.chatInput.focus(), 150);
    }

    if (msg.payload.analyzeImage) {
      handleImageAnalysis(msg.payload.analyzeImage);
    } else {
      initializeScanSequence();
    }
  } else if (msg.type === 'SHELBY_SEND_SCRAPED_DATA') {
    pageContextText = msg.payload.page_context || "";
    conversationContextText = msg.payload.conversation_context || "";
    verifyAndSendDataToBackend();
  }
});

function applyDynamicTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty('--theme-accent', theme.accentColor);
  root.style.setProperty('--theme-bg', theme.dominantBg);
  root.style.setProperty('--theme-text', theme.isDark ? '#F8F9FA' : '#2F3542');
  root.style.setProperty('--theme-text-sec', theme.isDark ? '#A4B0BE' : '#747D8C');
  root.style.setProperty('--theme-border', theme.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(108, 99, 255, 0.15)');
  root.style.setProperty('--theme-card-bg', theme.isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 249, 255, 0.65)');
  root.style.setProperty('--theme-glow', theme.isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(108, 99, 255, 0.15)');
}

async function initializeScanSequence() {
  if (missingElements.length > 0) return; // Prevent crashes if DOM is corrupted

  if (dom.scanningLine) dom.scanningLine.classList.add('active');
  if (dom.scanTimeLabel) dom.scanTimeLabel.classList.add('shelby-hidden');
  if (dom.imageSection) dom.imageSection.classList.add('shelby-hidden');
  if (dom.memoryBox) dom.memoryBox.classList.add('shelby-hidden');
  
  // Set UI features checklist headers
  setFeaturesChecklistHeader();
  populateSuggestedActions();

  // Reset context card details
  if (dom.contextSection) dom.contextSection.classList.remove('shelby-hidden');
  if (dom.contextVerdict) {
    dom.contextVerdict.innerText = 'Analyzing...';
    dom.contextVerdict.className = 'shelby-verdict-badge';
  }
  if (dom.contextTrustScore) dom.contextTrustScore.innerText = '--';
  if (dom.contextConfidence) dom.contextConfidence.innerText = '--';
  if (dom.contextSummary) dom.contextSummary.innerText = 'Shelby is analyzing the page content...';
  if (dom.whyList) dom.whyList.innerHTML = "";
  if (dom.modeDetails) dom.modeDetails.innerHTML = '';

  adaptChatLayoutHeight();

  // Reset debug diagnostics
  if (dom.dbgMode) dom.dbgMode.innerText = currentContext;
  if (dom.dbgCtxLen) dom.dbgCtxLen.innerText = "0";
  if (dom.dbgCtxQuality) dom.dbgCtxQuality.innerText = "--";
  if (dom.dbgCtxPreview) dom.dbgCtxPreview.innerText = "(No context preview available)";

  // If vision is disabled, skip scraping and backend scans entirely (Standalone Chat Mode)
  if (!isVisionEnabled) {
    if (dom.scanningLine) dom.scanningLine.classList.remove('active');
    if (dom.contextSection) dom.contextSection.classList.add('shelby-hidden');
    
    // Set Standalone Diagnostics
    if (dom.dbgScanSource) dom.dbgScanSource.innerText = "Standalone Mode";
    if (dom.dbgCtxLen) dom.dbgCtxLen.innerText = "0";
    if (dom.dbgCtxQuality) dom.dbgCtxQuality.innerText = "--";
    if (dom.dbgEvidenceCount) dom.dbgEvidenceCount.innerText = "--";
    updateRequestStatus('No Scrape / Halted', true);
    if (dom.dbgBackend) dom.dbgBackend.innerText = "Online";
    if (dom.dbgOpenai) dom.dbgOpenai.innerText = "Online";
    if (dom.dbgLastScan) dom.dbgLastScan.innerText = "0ms";
    if (dom.dbgCtxPreview) dom.dbgCtxPreview.innerText = "Shelby Vision is OFF. Reading page context is disabled.";
    
    // Update startup diagnostics status values
    const health = await verifyBackendHealth();
    updateStartupDiagnosticsUI(health);
    
    appendChatMessage('assistant', "I'm running in Standalone Mode because Vision is OFF. Ask me general questions! 🦊");
    return;
  }

  // Request scraped text
  window.parent.postMessage({ type: 'SHELBY_REQUEST_SCRAPE' }, '*');
  window.parent.postMessage({ type: 'SHELBY_UPDATE_MASCOT_VISUAL', payload: { state: 'scanning' } }, '*');
}

function updateStartupDiagnosticsUI(health) {
  if (dom.diagBackendConnected) {
    if (health.reachable) {
      dom.diagBackendConnected.innerText = "✓ Connected";
      dom.diagBackendConnected.className = "status-label success";
    } else {
      dom.diagBackendConnected.innerText = "❌ Offline";
      dom.diagBackendConnected.className = "status-label danger";
    }
  }
  if (dom.diagOpenaiStatus) {
    if (health.reachable && !health.openai.includes("❌")) {
      dom.diagOpenaiStatus.innerText = "✓ Available";
      dom.diagOpenaiStatus.className = "status-label success";
    } else {
      dom.diagOpenaiStatus.innerText = health.openai;
      dom.diagOpenaiStatus.className = "status-label danger";
    }
  }
}

function setFeaturesChecklistHeader() {
  if (!dom.featuresFound) return;
  switch (currentContext) {
    case 'Shopping':
      dom.featuresFound.innerText = 'I found:\n🛒 Product\n⭐ Reviews\n💰 Pricing';
      break;
    case 'Research':
    case 'News':
      dom.featuresFound.innerText = 'I found:\n📚 Article\n🔍 Sources\n📝 Summary';
      break;
    case 'Jobs':
      dom.featuresFound.innerText = 'I found:\n💼 Job details\n🛠️ Requirements\n💬 Tips';
      break;
    case 'Email':
    case 'Messaging':
      dom.featuresFound.innerText = 'I found:\n✉️ Message details\n📝 Suggested replies';
      break;
    default:
      dom.featuresFound.innerText = 'I found:\n🌐 Webpage details';
  }
}

function adaptChatLayoutHeight() {
  if (!dom.chatLog) return;
  if (currentContext === 'Research' || currentContext === 'News') {
    dom.chatLog.style.maxHeight = '360px';
    dom.chatLog.style.minHeight = '220px';
  } else {
    dom.chatLog.style.maxHeight = '180px';
    dom.chatLog.style.minHeight = '120px';
  }
}

function populateSuggestedActions() {
  if (!dom.suggestedActions) return;
  dom.suggestedActions.innerHTML = "";
  
  let actions = [];
  switch (currentContext) {
    case 'Shopping':
      actions = [
        { label: '🛒 Should I Buy?', prompt: 'Should I Buy This?' },
        { label: '💬 Summarize Reviews', prompt: 'Summarize the reviews on this page.' },
        { label: '⚖️ Compare Alternatives', prompt: 'Compare this product with main alternatives.' },
        { label: '💰 Explain Pricing', prompt: 'Analyze this pricing and check for inflated MRP.' }
      ];
      break;
    case 'Research':
    case 'News':
      actions = [
        { label: '📚 Summarize Page', prompt: 'Summarize the content of this page in 5 points.' },
        { label: '💡 Explain Simply', prompt: 'Explain the core concepts of this page simply.' },
        { label: '📝 Generate Notes', prompt: 'Generate study notes based on this article.' },
        { label: '🎓 Quiz Me', prompt: 'Ask me 3 multiple choice questions to test my understanding of this page.' }
      ];
      break;
    case 'Jobs':
      actions = [
        { label: '🎓 Am I Qualified?', prompt: 'Am I qualified for this role? What skills does it require?' },
        { label: '🛠️ Missing Skills', prompt: 'What skills are missing from this job description that I should learn?' },
        { label: '💼 Interview Qs', prompt: 'Generate 5 common interview questions for this role.' },
        { label: '📝 Cover Letter', prompt: 'Generate a short cover letter outline for this job.' }
      ];
      break;
    case 'Email':
      actions = [
        { label: '✉️ Draft Reply', prompt: 'Draft a reply for this email.' },
        { label: '👔 Make Formal', prompt: 'Rewrite the conversation in a formal tone.' },
        { label: '✂️ Make Shorter', prompt: 'Summarize the email and make it shorter.' }
      ];
      break;
    case 'Messaging':
      actions = [
        { label: '😊 Friendly Reply', prompt: 'Suggest a friendly reply for the last message.' },
        { label: '👔 Formal Reply', prompt: 'Suggest a formal reply for the last message.' },
        { label: '⚡ Gen Z Reply', prompt: 'Suggest a fun Gen Z reply.' }
      ];
      break;
    default:
      actions = [
        { label: '📝 Summarize', prompt: 'Summarize the key information of this page.' },
        { label: '💡 Explain simply', prompt: 'Explain what this website is about.' }
      ];
  }

  actions.forEach(act => {
    const chip = document.createElement('button');
    chip.className = 'shelby-action-chip';
    chip.innerText = act.label;
    chip.addEventListener('click', () => {
      if (dom.chatInput) dom.chatInput.value = act.prompt;
      handleChatSubmit();
    });
    dom.suggestedActions.appendChild(chip);
  });
}

function updateRequestStatus(text, success) {
  if (!dom.dbgLastRequest) return;
  dom.dbgLastRequest.innerText = text;
  if (success) {
    dom.dbgLastRequest.className = 'dbg-status-label success';
  } else {
    dom.dbgLastRequest.className = 'dbg-status-label danger';
  }
}

// Scrape length validation and transmission
async function verifyAndSendDataToBackend() {
  if (missingElements.length > 0) return;

  const combinedLen = pageContextText.length + conversationContextText.length;
  
  if (dom.dbgCtxLen) dom.dbgCtxLen.innerText = combinedLen;
  if (dom.dbgCtxPreview) dom.dbgCtxPreview.innerText = pageContextText ? pageContextText.slice(0, 300) : "(No context preview)";
  
  let quality = "Poor";
  if (combinedLen > 3000) quality = "Excellent";
  else if (combinedLen > 1500) quality = "Good";
  else if (combinedLen > 500) quality = "Fair";
  if (dom.dbgCtxQuality) dom.dbgCtxQuality.innerText = quality;

  // 1. Minimum context validation
  if (combinedLen < 200) {
    if (dom.scanningLine) dom.scanningLine.classList.remove('active');
    if (dom.contextVerdict) {
      dom.contextVerdict.innerText = 'INSUFFICIENT DATA';
      dom.contextVerdict.className = 'shelby-verdict-badge danger';
    }
    if (dom.contextTrustScore) dom.contextTrustScore.innerText = '0%';
    if (dom.contextConfidence) dom.contextConfidence.innerText = 'Low';
    if (dom.contextSummary) dom.contextSummary.innerText = "I couldn't read enough information from this page.";
    
    if (dom.whyList) dom.whyList.innerHTML = "<li class='shelby-why-item'>✗ Not enough page content was extracted (under 200 chars).</li>";
    updateRequestStatus('Context validation failed', false);
    if (dom.dbgScanSource) dom.dbgScanSource.innerText = "Halted";
    if (dom.dbgEvidenceCount) dom.dbgEvidenceCount.innerText = "1";
    
    window.parent.postMessage({ type: 'SHELBY_UPDATE_MASCOT_VISUAL', payload: { state: 'danger' } }, '*');
    
    const health = await verifyBackendHealth();
    updateStartupDiagnosticsUI(health);
    return;
  }

  // 2. Backend Health Verification before scanning
  const health = await verifyBackendHealth();
  updateStartupDiagnosticsUI(health);
  
  if (!health.reachable) {
    if (dom.scanningLine) dom.scanningLine.classList.remove('active');
    if (dom.contextVerdict) {
      dom.contextVerdict.innerText = 'Offline';
      dom.contextVerdict.className = 'shelby-verdict-badge danger';
    }
    if (dom.contextSummary) {
      dom.contextSummary.innerHTML = `<strong style="color:var(--danger)">Shelby backend offline.</strong><br/>Start backend by running:<br/><code style="font-family:monospace;background:rgba(0,0,0,0.05);padding:2px 4px;border-radius:4px;">uvicorn main:app --reload</code>`;
    }
    
    // Display error box in Diagnostics UI
    const errBox = document.getElementById('shelby-diag-error-box');
    const errList = document.getElementById('shelby-diag-errors-list');
    if (errBox && errList) {
      errBox.classList.remove('shelby-hidden');
      errList.innerHTML = `<li>❌ Backend unreachable: http://127.0.0.1:8000</li>`;
    }
    
    updateRequestStatus('Backend offline', false);
    if (dom.dbgScanSource) dom.dbgScanSource.innerText = "Offline Heuristics";
    window.parent.postMessage({ type: 'SHELBY_UPDATE_MASCOT_VISUAL', payload: { state: 'danger' } }, '*');
    return;
  }

  // Hide diagnostics error box if it was previously shown and backend is now online
  const errBox = document.getElementById('shelby-diag-error-box');
  if (errBox) errBox.classList.add('shelby-hidden');

  // 3. Client-side local cache validation
  const cached = clientScanCache[currentUrl];
  if (cached && (Date.now() - cached.clientTimestamp < 21600000)) {
    console.log("[Shelby] Client local Cache HIT for: " + currentUrl);
    renderScanResults(cached.data, "Cached Result (Client)");
    return;
  }

  // 4. Send to FastAPI scan endpoint
  sendDataToBackend();
}

async function sendDataToBackend() {
  const backendUrl = "http://127.0.0.1:8000/api/scan";
  const payload = {
    url: currentUrl,
    mode: currentContext,
    page_context: pageContextText,
    conversation_context: conversationContextText || null,
    selected_text: pageSelectedText
  };

  try {
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      updateRequestStatus(`/api/scan - ${response.status} Error`, false);
      throw new Error(`Status ${response.status}`);
    }
    
    const data = await response.json();
    updateRequestStatus('/api/scan - 200 OK', true);
    
    data.clientTimestamp = Date.now();
    clientScanCache[currentUrl] = { data, clientTimestamp: Date.now() };

    renderScanResults(data);
  } catch (error) {
    console.error('[Shelby] Scan API fetch error:', error);
    showErrorState('Backend server connection failure');
  }
}

function showErrorState(msg) {
  if (dom.scanningLine) dom.scanningLine.classList.remove('active');
  if (dom.contextVerdict) {
    dom.contextVerdict.innerText = 'Offline';
    dom.contextVerdict.className = 'shelby-verdict-badge danger';
  }
  if (dom.contextSummary) dom.contextSummary.innerText = `Shelby couldn't connect to the backend server. Make sure it is running. (${msg})`;
  if (dom.dbgBackend) dom.dbgBackend.innerText = "Offline";
  if (dom.dbgOpenai) dom.dbgOpenai.innerText = "Offline";
  if (dom.dbgScanSource) dom.dbgScanSource.innerText = "Local Heuristics";
  window.parent.postMessage({ type: 'SHELBY_UPDATE_MASCOT_VISUAL', payload: { state: 'danger' } }, '*');
}

// Render dynamic results
async function renderScanResults(data, customSource = null) {
  if (dom.scanningLine) dom.scanningLine.classList.remove('active');
  currentScanId = data.scan_id;
  
  if (dom.scanTimeLabel) {
    const durationSec = (data.scan_time_ms / 1000).toFixed(1);
    dom.scanTimeLabel.innerText = `${durationSec}s`;
    dom.scanTimeLabel.classList.remove('shelby-hidden');
  }

  // Render Verdict/Recommendation Badge
  const rec = data.recommendation;
  if (dom.contextVerdict) {
    dom.contextVerdict.innerText = rec;
    let verdictClass = 'warning';
    if (['buy signal', 'strong sources', 'qualified', 'low risk', 'buy'].includes(rec.toLowerCase())) verdictClass = 'safe';
    if (['avoid', 'weak sources', 'not recommended', 'high risk', 'insufficient data'].includes(rec.toLowerCase())) verdictClass = 'danger';
    dom.contextVerdict.className = `shelby-verdict-badge ${verdictClass}`;
    window.parent.postMessage({ type: 'SHELBY_UPDATE_MASCOT_VISUAL', payload: { state: verdictClass } }, '*');
  }

  if (dom.contextTrustScore) dom.contextTrustScore.innerText = `${data.trust_score}%`;
  if (dom.contextConfidence) dom.contextConfidence.innerText = data.confidence;
  if (dom.contextSummary) dom.contextSummary.innerText = data.shelby_says || '';

  // Render "Why?" evidence points
  if (dom.whyList) {
    dom.whyList.innerHTML = "";
    (data.why_explanation || []).forEach(point => {
      const li = document.createElement('li');
      li.className = 'shelby-why-item';
      
      let icon = '▪';
      if (point.startsWith('✓') || point.startsWith('👍') || point.toLowerCase().includes('secure') || point.toLowerCase().includes('rating >')) {
        icon = '✓';
        li.style.color = '#218c53';
      } else if (point.startsWith('⚠') || point.startsWith('👎') || point.toLowerCase().includes('anomaly') || point.toLowerCase().includes('average')) {
        icon = '⚠';
        li.style.color = '#c0392b';
      } else if (point.startsWith('✗')) {
        icon = '✗';
        li.style.color = '#c0392b';
      }
      
      const cleanPoint = point.replace(/^[✓⚠✗👍👎▪]\s*/, '');
      li.innerText = `${icon} ${cleanPoint}`;
      dom.whyList.appendChild(li);
    });
  }

  if (dom.modeDetails) {
    dom.modeDetails.innerHTML = '';
    renderModeDetails(data.details);
  }

  await checkAndRenderMemory(data);

  // Diagnostics Panel Updates
  if (dom.dbgScanSource) dom.dbgScanSource.innerText = customSource || data.scan_source || "AI";
  if (dom.dbgEvidenceCount) dom.dbgEvidenceCount.innerText = data.evidence_count || "0";
  if (dom.dbgBackend) dom.dbgBackend.innerText = "Online";
  if (dom.dbgOpenai) dom.dbgOpenai.innerText = data.openai_status || "Online";
  if (dom.dbgLastScan) dom.dbgLastScan.innerText = `${data.scan_time_ms}ms`;
}

function renderModeDetails(details) {
  if (currentContext === 'Shopping') {
    const grid = document.createElement('div');
    grid.className = 'shelby-pros-cons-grid';

    // Best For Card
    const bestFor = details.best_for || [];
    if (bestFor.length > 0) {
      const card = document.createElement('div');
      card.className = 'shelby-pro-card';
      card.innerHTML = `<h4>👍 Best For:</h4><ul class="shelby-detail-sublist">${bestFor.map(b => `<li class="shelby-detail-subitem">✓ ${b}</li>`).join('')}</ul>`;
      grid.appendChild(card);
    }

    // Red Flags Card
    const redFlags = details.red_flags || [];
    if (redFlags.length > 0) {
      const card = document.createElement('div');
      card.className = 'shelby-con-card';
      card.innerHTML = `<h4>⚠ Red Flags:</h4><ul class="shelby-detail-sublist">${redFlags.map(r => `<li class="shelby-detail-subitem">⚠ ${r}</li>`).join('')}</ul>`;
      grid.appendChild(card);
    }

    // Pricing Card
    const price = details.price_analysis;
    if (price) {
      const card = document.createElement('div');
      card.className = 'shelby-analysis-card';
      card.innerHTML = `
        <div class="shelby-analysis-title">💰 Price Analysis (${price.current_price || ''})</div>
        <p><strong>Discount:</strong> ${price.discount_analysis || 'N/A'}</p>
        <p style="margin-top:4px;">${price.explanation || ''}</p>
      `;
      grid.appendChild(card);
    }

    // Reviews Card
    const rev = details.review_analysis;
    if (rev) {
      const card = document.createElement('div');
      card.className = 'shelby-analysis-card';
      card.innerHTML = `
        <div class="shelby-analysis-title">⭐ Review Integrity (${rev.rating_quality || ''})</div>
        <p><strong>Total Scanned:</strong> ${rev.review_count || ''}</p>
        <p><strong>Sentiment:</strong> ${rev.sentiment || 'Mixed'}</p>
      `;
      grid.appendChild(card);
    }

    dom.modeDetails.appendChild(grid);

  } else if (currentContext === 'Research' || currentContext === 'News') {
    const list = document.createElement('div');
    list.className = 'shelby-pros-cons-grid';

    const summaryPoints = details.summary || [];
    if (summaryPoints.length > 0) {
      const card = document.createElement('div');
      card.className = 'shelby-analysis-card';
      card.innerHTML = `
        <div class="shelby-analysis-title">📝 Key Points</div>
        <ul class="shelby-detail-sublist">${summaryPoints.map(p => `<li class="shelby-detail-subitem">• ${p}</li>`).join('')}</ul>
      `;
      list.appendChild(card);
    }

    const cardCred = document.createElement('div');
    cardCred.className = 'shelby-analysis-card';
    cardCred.innerHTML = `
      <div class="shelby-analysis-title">🔍 Credibility Assessment</div>
      <p>Source Quality: ${details.source_quality || 'Good'}</p>
      <p>${details.credibility || ''}</p>
      ${details.bias_analysis ? `<p style="margin-top:4px"><strong>Bias Indicators:</strong> ${details.bias_analysis}</p>` : ''}
    `;
    list.appendChild(cardCred);

    dom.modeDetails.appendChild(list);

  } else if (currentContext === 'Jobs') {
    const grid = document.createElement('div');
    grid.className = 'shelby-pros-cons-grid';

    const req = details.required_skills || [];
    const mis = details.missing_skills || [];
    const cardSkills = document.createElement('div');
    cardSkills.className = 'shelby-pro-card';
    cardSkills.innerHTML = `
      <h4>🛠️ Skill Analysis</h4>
      <p><strong>Required:</strong> ${req.join(', ') || 'None'}</p>
      <p style="margin-top:4px"><strong>Suggested to Learn:</strong> ${mis.join(', ') || 'None'}</p>
    `;
    grid.appendChild(cardSkills);

    const tips = details.resume_tips || [];
    const qs = details.interview_questions || [];
    const cardTips = document.createElement('div');
    cardTips.className = 'shelby-analysis-card';
    cardTips.innerHTML = `
      <div class="shelby-analysis-title">📝 Interview & Resume Tips</div>
      <p><strong>Resume Tips:</strong> ${tips.join(' | ') || 'None'}</p>
      <p style="margin-top:6px"><strong>Practice Questions:</strong></p>
      <ul class="shelby-detail-sublist">${qs.map(q => `<li class="shelby-detail-subitem">? ${q}</li>`).join('')}</ul>
    `;
    grid.appendChild(cardTips);

    dom.modeDetails.appendChild(grid);

  } else if (currentContext === 'Email' || currentContext === 'Messaging') {
    const container = document.createElement('div');
    container.className = 'shelby-reply-generator';

    const header = document.createElement('div');
    header.className = 'shelby-suggested-label';
    header.innerText = '⚡ Contextual Suggested Replies:';
    container.appendChild(header);

    currentDraftOptions = details.draft_options || {};

    const styleSelector = document.createElement('div');
    styleSelector.className = 'shelby-style-selector';
    
    const draftBox = document.createElement('div');
    draftBox.className = 'shelby-draft-display-box';
    draftBox.innerText = 'Select a style to generate a reply draft...';

    const insertBtn = document.createElement('button');
    insertBtn.className = 'shelby-insert-btn shelby-hidden';
    insertBtn.innerText = '📥 Insert Reply';
    insertBtn.addEventListener('click', () => {
      const txt = draftBox.innerText;
      window.parent.postMessage({ type: 'SHELBY_INSERT_REPLY', payload: { text: txt } }, '*');
    });

    const styles = Object.keys(currentDraftOptions);
    styles.forEach((styleName, idx) => {
      const chip = document.createElement('button');
      chip.className = `shelby-style-chip ${idx === 0 ? 'active' : ''}`;
      chip.innerText = styleName;
      chip.addEventListener('click', () => {
        document.querySelectorAll('.shelby-style-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        draftBox.innerText = currentDraftOptions[styleName] || 'No draft available.';
        insertBtn.classList.remove('shelby-hidden');
      });
      styleSelector.appendChild(chip);
      
      if (idx === 0) {
        setTimeout(() => {
          draftBox.innerText = currentDraftOptions[styleName] || '';
          insertBtn.classList.remove('shelby-hidden');
        }, 50);
      }
    });

    container.appendChild(styleSelector);
    container.appendChild(draftBox);
    container.appendChild(insertBtn);
    dom.modeDetails.appendChild(container);
  }
}

// Memory logs comparison using chrome.storage.local
async function checkAndRenderMemory(data) {
  if (!dom.memoryBox) return;
  const urlKey = `shelby_log_v2_${currentUrl}`;
  const now = Date.now();
  const dateStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  
  const storageData = await chrome.storage.local.get(urlKey);
  const prevScan = storageData[urlKey];

  const currentRec = data.recommendation;
  let currentPrice = null;
  let currentReviews = null;

  if (currentContext === 'Shopping') {
    const priceStr = data.details.price_analysis?.current_price;
    const revStr = data.details.review_analysis?.review_count;
    if (priceStr) {
      const num = priceStr.replace(/[^\d]/g, '');
      currentPrice = num ? parseInt(num) : null;
    }
    if (revStr) {
      const num = revStr.replace(/[^\d]/g, '');
      currentReviews = num ? parseInt(num) : null;
    }
  }

  const newLog = {
    timestamp: now,
    date: dateStr,
    verdict: currentRec,
    price: currentPrice,
    reviews: currentReviews
  };
  await chrome.storage.local.set({ [urlKey]: newLog });

  if (!prevScan) {
    dom.memoryBox.classList.add('shelby-hidden');
    return;
  }

  if (dom.memLastVisit) dom.memLastVisit.innerText = `Last Visit: ${prevScan.date || 'unknown'}`;
  if (dom.memPrevAdvice) dom.memPrevAdvice.innerText = `Previous Advice: ${prevScan.verdict || 'none'}`;
  
  let changesList = [];
  if (currentPrice !== null && prevScan.price !== null) {
    const diff = currentPrice - prevScan.price;
    if (diff < 0) {
      changesList.push(`Price ↓ ₹${Math.abs(diff)}`);
    } else if (diff > 0) {
      changesList.push(`Price ↑ ₹${Math.abs(diff)}`);
    }
  }
  if (currentReviews !== null && prevScan.reviews !== null) {
    const diff = currentReviews - prevScan.reviews;
    if (diff > 0) {
      changesList.push(`Reviews ↑ ${diff}`);
    }
  }
  
  if (dom.memChanges) {
    if (changesList.length > 0) {
      dom.memChanges.innerText = `Changes: ${changesList.join(', ')}`;
    } else {
      dom.memChanges.innerText = `Changes: No updates detected.`;
    }
  }

  dom.memoryBox.classList.remove('shelby-hidden');
}

// Right-click Image Vision API handler
async function handleImageAnalysis(imageUrl) {
  if (dom.scanningLine) dom.scanningLine.classList.add('active');
  if (dom.contextSection) dom.contextSection.classList.add('shelby-hidden');
  if (dom.memoryBox) dom.memoryBox.classList.add('shelby-hidden');
  
  if (dom.imageSection) dom.imageSection.classList.remove('shelby-hidden');
  if (dom.imagePreview) dom.imagePreview.src = imageUrl;
  if (dom.imageVerdict) {
    dom.imageVerdict.innerText = 'Analyzing...';
    dom.imageVerdict.className = 'shelby-verdict-badge warning';
  }
  if (dom.imageConfidence) {
    dom.imageConfidence.innerText = 'Low';
    dom.imageConfidence.className = 'shelby-confidence-value low';
  }
  if (dom.imageExplanation) dom.imageExplanation.innerText = 'Shelby is analyzing the image authenticity context...';
  if (dom.imageIndicators) dom.imageIndicators.innerHTML = '';

  const backendUrl = "http://127.0.0.1:8000/api/analyze-image";
  
  try {
    const resBlob = await fetch(imageUrl);
    const blob = await resBlob.blob();
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    
    reader.onloadend = async () => {
      const base64data = reader.result;
      
      const response = await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data: base64data })
      });
      
      if (!response.ok) {
        updateRequestStatus(`/api/analyze-image - ${response.status} Error`, false);
        throw new Error(`Status ${response.status}`);
      }
      
      const data = await response.json();
      updateRequestStatus('/api/analyze-image - 200 OK', true);
      
      if (dom.imageVerdict) {
        dom.imageVerdict.innerText = data.verdict;
        let badgeClass = 'warning';
        if (data.verdict.toLowerCase().includes('likely real')) badgeClass = 'safe';
        if (data.verdict.toLowerCase().includes('likely ai generated')) badgeClass = 'danger';
        dom.imageVerdict.className = `shelby-verdict-badge ${badgeClass}`;
      }
      
      if (dom.imageConfidence) {
        dom.imageConfidence.innerText = data.confidence;
        dom.imageConfidence.className = `shelby-confidence-value ${data.confidence.toLowerCase()}`;
      }
      if (dom.imageExplanation) dom.imageExplanation.innerText = data.explanation;
      
      if (dom.imageIndicators) {
        dom.imageIndicators.innerHTML = '';
        (data.indicators || []).forEach(ind => {
          const li = document.createElement('li');
          li.className = 'shelby-indicators-item';
          li.innerText = ind;
          dom.imageIndicators.appendChild(li);
        });
      }
      
      if (dom.scanningLine) dom.scanningLine.classList.remove('active');
      appendChatMessage('assistant', `I finished analyzing this image. Verdict: ${data.verdict}. Confidence is ${data.confidence}. 🦊`);
    };
  } catch (error) {
    console.error('[Shelby] Image analysis fetch error:', error);
    if (dom.imageVerdict) {
      dom.imageVerdict.innerText = 'Error';
      dom.imageVerdict.className = 'shelby-verdict-badge danger';
    }
    if (dom.imageExplanation) dom.imageExplanation.innerText = `Shelby couldn't analyze the image. (${error.message})`;
    if (dom.scanningLine) dom.scanningLine.classList.remove('active');
  }
}

// Chat log message handlers
function appendChatMessage(role, text) {
  if (!dom.chatLog) return;
  const msg = document.createElement('div');
  msg.className = `shelby-chat-message ${role}`;
  msg.innerText = text;
  dom.chatLog.appendChild(msg);
  dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
  
  chatHistory.push({ role, content: text });
}

async function handleChatSubmit() {
  if (missingElements.length > 0 || !dom.chatInput) return;
  
  const query = dom.chatInput.value.trim();
  if (!query) return;

  appendChatMessage('user', query);
  dom.chatInput.value = '';
  
  dom.chatInput.disabled = true;
  if (dom.chatSubmitBtn) dom.chatSubmitBtn.disabled = true;

  const backendUrl = "http://127.0.0.1:8000/api/ask";
  
  const payload = {
    scan_id: isVisionEnabled ? (currentScanId || "unknown") : "standalone",
    question: query,
    history: chatHistory.map(h => ({ role: h.role, content: h.content }))
  };

  try {
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      updateRequestStatus(`/api/ask - ${response.status} Error`, false);
      throw new Error(`Status ${response.status}`);
    }
    
    const data = await response.json();
    const isStandalone = !isVisionEnabled;
    updateRequestStatus(`/api/ask - 200 OK${isStandalone ? ' (Standalone)' : ''}`, true);
    
    appendChatMessage('assistant', data.answer);
  } catch (error) {
    console.error('[Shelby] Chat question API error:', error);
    appendChatMessage('assistant', "Oh dear! My communication circuits went offline. Please check your backend. 💔");
  } finally {
    if (dom.chatInput) dom.chatInput.disabled = false;
    if (dom.chatSubmitBtn) dom.chatSubmitBtn.disabled = false;
    if (dom.chatInput) dom.chatInput.focus();
  }
}

// Startup Initialization Wrapper
try {
  initPrivacyToggle();
} catch (err) {
  console.error("[Shelby Startup Error]", err);
}
