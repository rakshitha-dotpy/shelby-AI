// panel.js - Side Panel UI Management & Backend V3 Communication

let currentUrl = "";
let currentMode = "";
let isDemoMode = false;
let selectedText = null;
let currentScanId = "";

// DOM Elements
const modeBadge = document.getElementById('shelby-panel-mode-badge');
const closeBtn = document.getElementById('close-panel-btn');
const scanningLine = document.getElementById('shelby-scanning-line');
const scoreValue = document.getElementById('shelby-score-value');
const scoreFraction = document.getElementById('shelby-score-fraction');
const scoreRing = document.getElementById('shelby-progress-ring-bar');
const riskCategoryBadge = document.getElementById('shelby-risk-category');
const scanAgainBtn = document.getElementById('shelby-scan-again-btn');
const shelbySaysText = document.getElementById('shelby-says-text');
const fallbackWarning = document.getElementById('shelby-fallback-warning');
const confidenceRating = document.getElementById('shelby-confidence-rating');
const confidenceValue = document.getElementById('shelby-confidence-value');
const scanTimeLabel = document.getElementById('shelby-scan-time');

// Evidence Section DOM
const evidenceSection = document.getElementById('shelby-evidence-section');
const evidenceList = document.getElementById('shelby-evidence-list');

// Why Shelby Thinks This DOM
const detailsContent = document.getElementById('shelby-details-content');

// Image Authenticity Analysis DOM
const imageAuthSection = document.getElementById('shelby-image-authenticity-section');
const imageVerdictVal = document.getElementById('image-verdict-val');
const imageConfidenceVal = document.getElementById('image-confidence-val');
const imageIndicatorsList = document.getElementById('image-indicators-list');

// Tab Switching DOM
const tabScan = document.getElementById('tab-scan');
const tabHistory = document.getElementById('tab-history');
const viewScan = document.getElementById('view-scan');
const viewHistory = document.getElementById('view-history');
const clearHistoryBtn = document.getElementById('shelby-clear-history-btn');
const historyList = document.getElementById('shelby-history-list');

// Developer Debug Panel DOM
const debugSection = document.getElementById('shelby-debug-section');
const debugToggleBtn = document.getElementById('shelby-debug-toggle-btn');
const debugContent = document.getElementById('shelby-debug-content');
const debugScanSource = document.getElementById('debug-scan-source');
const debugVTResult = document.getElementById('debug-vt-result');
const debugDomainAge = document.getElementById('debug-domain-age');
const debugRedirectCount = document.getElementById('debug-redirect-count');
const debugLoginForm = document.getElementById('debug-login-form');

// Subscores Debug DOM
const debugSecurity = document.getElementById('debug-breakdown-security');
const debugReputation = document.getElementById('debug-breakdown-reputation');
const debugDomain = document.getElementById('debug-breakdown-domain');
const debugContentScore = document.getElementById('debug-breakdown-content');
const debugTotal = document.getElementById('debug-breakdown-total');

// Setup messaging listeners
window.addEventListener('message', (event) => {
  const msg = event.data;

  if (msg.type === 'SHELBY_PANEL_OPENED') {
    currentUrl = msg.payload.url;
    currentMode = msg.payload.mode;
    isDemoMode = msg.payload.isDemo;
    selectedText = msg.payload.selectedText;

    // Reset panel view and trigger scan
    initializeScanSequence();
  } else if (msg.type === 'SHELBY_SEND_SCRAPED_DATA') {
    // We received the scraped DOM text and imageUrl, now call backend to audit
    sendDataToBackend(msg.payload.scrapedText, msg.payload.selectedText, msg.payload.imageUrl);
  }
});

// Close button logic
closeBtn.addEventListener('click', () => {
  window.parent.postMessage({ type: 'SHELBY_CLOSE_PANEL' }, '*');
});

// Scan Again button logic
scanAgainBtn.addEventListener('click', () => {
  initializeScanSequence();
});

// Tab Switching Event Listeners
tabScan.addEventListener('click', () => {
  tabScan.classList.add('active');
  tabHistory.classList.remove('active');
  viewScan.classList.remove('shelby-hidden');
  viewHistory.classList.add('shelby-hidden');
});

tabHistory.addEventListener('click', () => {
  tabScan.classList.remove('active');
  tabHistory.classList.add('active');
  viewScan.classList.add('shelby-hidden');
  viewHistory.classList.remove('shelby-hidden');
  loadRecentHistoryList();
});

// Clear history action
clearHistoryBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove('shelby_history');
  loadRecentHistoryList();
});

// Collapsible Developer Debug Panel
debugToggleBtn.addEventListener('click', () => {
  debugSection.classList.toggle('expanded');
  debugContent.classList.toggle('shelby-hidden');
});

function initializeScanSequence() {
  // 1. Reset state displays
  scanningLine.classList.add('active');
  scoreValue.innerText = '0';
  scoreFraction.innerText = '0 / 100';
  setProgressRing(0, '#6C63FF');
  riskCategoryBadge.innerText = 'Auditing...';
  riskCategoryBadge.className = 'shelby-risk-badge';
  
  confidenceRating.classList.add('shelby-hidden');
  scanTimeLabel.classList.add('shelby-hidden');
  fallbackWarning.classList.add('shelby-hidden');
  
  shelbySaysText.innerText = "Shelby is auditing this page's cybersecurity metrics... Hold on! 💖";
  
  evidenceSection.classList.add('shelby-hidden');
  evidenceList.innerHTML = "";
  
  imageAuthSection.classList.add('shelby-hidden');
  imageIndicatorsList.innerHTML = "";

  detailsContent.innerHTML = `
    <div class="shelby-scanning-placeholder">
      <div class="shelby-pulse-dot"></div>
      <span>Waiting for audit scan...</span>
    </div>
  `;
  
  scanAgainBtn.disabled = true;

  // Set mode badge
  modeBadge.innerText = getModeBadgeText(currentMode);

  // Load and display scan history
  loadRecentHistoryList();

  // Request parent content script to scrape the DOM
  window.parent.postMessage({ type: 'SHELBY_REQUEST_SCRAPE' }, '*');

  // Update Mascot visual to scanning
  window.parent.postMessage({
    type: 'SHELBY_UPDATE_MASCOT_VISUAL',
    payload: { state: 'scanning' }
  }, '*');
}

function getModeBadgeText(mode) {
  switch(mode) {
    case 'Shopping Mode': return 'Shop Mode 🛒';
    case 'Scam Mode': return 'Scam Mode 📧';
    case 'Content Intelligence Mode': return 'Content AI 🤖';
    default: return 'Trust Mode 🛡️';
  }
}

// Communicate directly with local FastAPI backend
async function sendDataToBackend(scrapedText, highlightedText, imageUrl) {
  const backendUrl = "http://127.0.0.1:8000/api/scan";
  
  const payload = {
    url: currentUrl,
    mode: currentMode,
    scraped_text: scrapedText,
    selected_text: highlightedText || selectedText || null,
    image_url: imageUrl || null
  };

  try {
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`FastAPI responded with status ${response.status}`);
    }

    const data = await response.json();
    renderScanResults(data);
  } catch (error) {
    console.error('Shelby scan API connection error:', error);
    showErrorState('Backend server offline');
  }
}

function showErrorState(errMsg) {
  scanningLine.classList.remove('active');
  scoreValue.innerText = '0';
  scoreFraction.innerText = '0 / 100';
  setProgressRing(0, '#FF4757');
  riskCategoryBadge.innerText = 'OFFLINE';
  riskCategoryBadge.style.color = 'var(--danger)';
  
  shelbySaysText.innerText = `Oh dear, my cybersecurity engines are offline! Please verify the backend uvicorn server is running on port 8000. 💔`;
  detailsContent.innerHTML = `<div class="shelby-scanning-placeholder"><span>Backend connection failed. (${errMsg})</span></div>`;
  scanAgainBtn.disabled = false;
  
  window.parent.postMessage({
    type: 'SHELBY_UPDATE_MASCOT_VISUAL',
    payload: { state: 'danger' }
  }, '*');
}

// Animate visual scores sequentially
async function renderScanResults(data) {
  currentScanId = data.scan_id;
  const trustScore = data.trust_score;

  // Determine colors based on risk category
  const color = getScoreColor(trustScore);
  const categoryName = data.risk_category;

  // 1. Fill Overall trust gauge
  animateCountUp(trustScore, scoreValue);
  setProgressRing(trustScore, color);
  
  scoreFraction.innerText = `${trustScore} / 100`;
  riskCategoryBadge.innerText = categoryName;
  
  // Style risk category text
  riskCategoryBadge.style.color = color;

  // Display Confidence score
  confidenceValue.innerText = data.confidence || "High";
  confidenceValue.className = "";
  confidenceValue.classList.add(data.confidence ? data.confidence.toLowerCase() : "high");
  confidenceRating.classList.remove('shelby-hidden');

  // Display Scan Time
  const durationSec = (data.scan_time_ms / 1000).toFixed(1);
  scanTimeLabel.innerText = `Analyzed in ${durationSec}s`;
  scanTimeLabel.classList.remove('shelby-hidden');

  // Update Mascot visual based on risk levels
  window.parent.postMessage({
    type: 'SHELBY_UPDATE_MASCOT_VISUAL',
    payload: { state: getScoreClass(trustScore) }
  }, '*');

  // 2. Render AI Fallback header alert if OpenAI fails
  if (!data.ai_analyzed && data.scan_source === "Fallback") {
    fallbackWarning.classList.remove('shelby-hidden');
  } else {
    fallbackWarning.classList.add('shelby-hidden');
  }

  // 3. Render Evidence Checklist
  renderEvidenceChecklist(data.reasons_why);

  // 4. Render Why Shelby Thinks This (Findings)
  renderWhyShelbyThinksThis(data.findings);

  // 5. Render Image Authenticity Analysis Card (Gemini Vision)
  renderImageAuthenticity(data.deepfake_results);

  // 6. Update Developer Debug Panel
  renderDebugPanel(data);

  // 7. Log scan to Recent Audits History list (chrome.storage.local)
  const friendlyName = getFriendlyName(currentUrl);
  await addScanToHistory(currentUrl, friendlyName, trustScore, categoryName, data.scan_source);

  // 8. Turn off scanning line
  scanningLine.classList.remove('active');
  scanAgainBtn.disabled = false;

  // 9. Typewriter effect for Shelby Says advice bubble
  await sleep(200);
  typewriterEffect(data.shelby_says, shelbySaysText);
}

function getScoreColor(score) {
  if (score >= 80) return '#2ED573'; // Green
  if (score >= 60) return '#FFA502'; // Yellow
  if (score >= 40) return '#FF7F50'; // Orange
  return '#FF4757'; // Red
}

function getScoreClass(score) {
  if (score >= 80) return 'safe';
  if (score >= 60) return 'warning';
  if (score >= 40) return 'risky';
  return 'danger';
}

function setProgressRing(percent, color) {
  // Radius of the SVG circle is 32, circumference is 2 * PI * 32 = 201.06
  const circumference = 201.06;
  const offset = circumference - (percent / 100) * circumference;
  scoreRing.style.strokeDashoffset = offset;
  scoreRing.style.stroke = color;
}

function animateCountUp(target, element) {
  let current = 0;
  const step = Math.ceil(target / 20) || 1;
  const timer = setInterval(() => {
    current += step;
    if (current >= target) {
      element.innerText = target;
      clearInterval(timer);
    } else {
      element.innerText = current;
    }
  }, 25);
}

function renderEvidenceChecklist(reasons) {
  evidenceList.innerHTML = "";
  if (!reasons || reasons.length === 0) {
    evidenceSection.classList.add('shelby-hidden');
    return;
  }

  reasons.forEach(reason => {
    const li = document.createElement('li');
    li.innerText = reason;
    evidenceList.appendChild(li);
  });

  evidenceSection.classList.remove('shelby-hidden');
}

function renderWhyShelbyThinksThis(findings) {
  detailsContent.innerHTML = "";
  
  if (!findings || findings.length === 0) {
    detailsContent.innerHTML = `<div class="shelby-scanning-placeholder"><span>No explanation points generated.</span></div>`;
    return;
  }

  const ul = document.createElement('ul');
  findings.forEach(finding => {
    const li = document.createElement('li');
    li.innerText = finding;
    ul.appendChild(li);
  });
  detailsContent.appendChild(ul);
}

function renderImageAuthenticity(deepfake) {
  imageIndicatorsList.innerHTML = "";
  
  if (!deepfake) {
    imageAuthSection.classList.add('shelby-hidden');
    return;
  }

  imageVerdictVal.innerText = deepfake.verdict || "Likely Real";
  imageConfidenceVal.innerText = deepfake.confidence || "Medium";
  
  // Style confidence color
  imageConfidenceVal.className = "shelby-analysis-val";
  if (deepfake.confidence) {
    const conf = deepfake.confidence.toLowerCase();
    if (conf === 'high') imageConfidenceVal.style.color = 'var(--success)';
    if (conf === 'medium') imageConfidenceVal.style.color = 'var(--warning)';
    if (conf === 'low') imageConfidenceVal.style.color = 'var(--danger)';
  }

  const indicators = deepfake.indicators || [];
  if (indicators.length === 0) {
    const li = document.createElement('li');
    li.innerText = "✓ No abnormalities detected in this visual element.";
    imageIndicatorsList.appendChild(li);
  } else {
    indicators.forEach(ind => {
      const li = document.createElement('li');
      li.innerText = ind;
      imageIndicatorsList.appendChild(li);
    });
  }

  imageAuthSection.classList.remove('shelby-hidden');
}

function renderDebugPanel(data) {
  debugScanSource.innerText = data.scan_source || "AI";
  debugVTResult.innerText = data.debug_info.vt_result || "-";
  debugDomainAge.innerText = data.debug_info.domain_age || "-";
  debugRedirectCount.innerText = data.debug_info.redirect_count !== undefined ? data.debug_info.redirect_count : "-";
  debugLoginForm.innerText = data.debug_info.login_form || "-";

  // Score breakdowns
  debugSecurity.innerText = data.debug_info.security_score || "0/30";
  debugReputation.innerText = data.debug_info.reputation_score || "0/35";
  debugDomain.innerText = data.debug_info.domain_score || "0/20";
  debugContentScore.innerText = data.debug_info.content_score || "0/15";
  debugTotal.innerText = `${data.trust_score}/100`;
}

// Storage for Scan History (Last 10 audits)
async function addScanToHistory(url, domain, score, category, source) {
  const data = await chrome.storage.local.get('shelby_history');
  let history = data.shelby_history || [];

  // Filter out duplicates of identical urls
  history = history.filter(item => item.url !== url);

  // Add new scan details to the top of history
  history.unshift({
    url,
    domain,
    score,
    category: getHistoryCategoryClass(category),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    scan_source: source
  });

  // Limit list to last 10 scans
  if (history.length > 10) {
    history = history.slice(0, 10);
  }

  await chrome.storage.local.set({ 'shelby_history': history });
}

function getHistoryCategoryClass(category) {
  if (category.includes("TRUST") || category.includes("SAFE")) return "safe";
  if (category.includes("CAUTION")) return "caution";
  if (category.includes("RISKY")) return "risky";
  return "dangerous";
}

async function loadRecentHistoryList() {
  const data = await chrome.storage.local.get('shelby_history');
  const history = data.shelby_history || [];

  historyList.innerHTML = "";

  if (history.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'shelby-history-empty';
    emptyLi.style.textAlign = 'center';
    emptyLi.style.padding = '30px 20px';
    emptyLi.style.fontSize = '11px';
    emptyLi.style.color = 'var(--text-secondary)';
    emptyLi.innerText = 'No scan history yet. Try scanning a website! 🛡️';
    historyList.appendChild(emptyLi);
    return;
  }

  history.forEach(item => {
    const li = document.createElement('li');
    li.className = 'shelby-history-item';
    li.innerHTML = `
      <div class="shelby-history-site-box">
        <span class="shelby-history-site">${item.domain}</span>
        <span class="shelby-history-source">Source: ${item.scan_source || "AI"} | ${item.timestamp}</span>
      </div>
      <span class="shelby-history-badge ${item.category}">${item.score}%</span>
    `;
    historyList.appendChild(li);
  });
}

function getFriendlyName(urlStr) {
  try {
    const url = new URL(urlStr);
    let host = url.hostname;
    if (host.startsWith('www.')) {
      host = host.substring(4);
    }
    
    // Explicit clean mapping for demo/test sites
    if (host.includes('amazon.')) return 'Amazon';
    if (host.includes('flipkart.')) return 'Flipkart';
    if (host.includes('meesho.')) return 'Meesho';
    if (host.includes('myntra.')) return 'Myntra';
    if (host.includes('snapdeal.')) return 'Snapdeal';
    if (host.includes('ajio.')) return 'Ajio';
    if (host.includes('wikipedia.')) return 'Wikipedia';
    if (host.includes('linkedin.')) return 'LinkedIn';
    if (host.includes('google.')) return 'Google';
    
    const parts = host.split('.');
    if (parts.length > 0) {
      let name = parts[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return host;
  } catch (e) {
    return "Unknown Site";
  }
}

// Typewriter effect logic
function typewriterEffect(text, element) {
  element.innerText = "";
  let i = 0;
  const speed = 20;

  function type() {
    if (i < text.length) {
      element.innerHTML += text.charAt(i);
      i++;
      setTimeout(type, speed);
    }
  }
  type();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
