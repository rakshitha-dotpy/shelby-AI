// panel.js - Side Panel UI Management & Backend Communication

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
const scoreTitle = document.getElementById('shelby-score-title');
const scoreRing = document.getElementById('shelby-progress-ring-bar');
const scoreVerdict = document.getElementById('shelby-score-verdict');
const scanAgainBtn = document.getElementById('shelby-scan-again-btn');
const shelbySaysText = document.getElementById('shelby-says-text');
const memoryBox = document.getElementById('shelby-memory-box');
const memoryMsg = document.getElementById('shelby-memory-msg');
const detailsContent = document.getElementById('shelby-details-content');
const whySection = document.getElementById('shelby-why-section');
const whyList = document.getElementById('shelby-why-list');
const confidenceRating = document.getElementById('shelby-confidence-rating');
const confidenceValue = document.getElementById('shelby-confidence-value');
const scanTimeLabel = document.getElementById('shelby-scan-time');
const fallbackWarning = document.getElementById('shelby-fallback-warning');

// Tab Switching Elements
const tabScan = document.getElementById('tab-scan');
const tabHistory = document.getElementById('tab-history');
const viewScan = document.getElementById('view-scan');
const viewHistory = document.getElementById('view-history');
const clearHistoryBtn = document.getElementById('shelby-clear-history-btn');

// Source checklist DOM elements
const sourcesSection = document.getElementById('shelby-sources-section');
const srcLocal = document.getElementById('source-local');
const srcVt = document.getElementById('source-vt');
const srcGemini = document.getElementById('source-gemini');

// History List DOM elements
const historyList = document.getElementById('shelby-history-list');

// Ask Shelby DOM elements
const askContainer = document.getElementById('shelby-ask-container');
const askInput = document.getElementById('shelby-ask-input');
const askSubmitBtn = document.getElementById('shelby-ask-submit-btn');

// Sub-Score Rows
const subLabel1 = document.getElementById('sub-label-1');
const subLabel2 = document.getElementById('sub-label-2');
const subLabel3 = document.getElementById('sub-label-3');
const subLabel4 = document.getElementById('sub-label-4');
const subVal1 = document.getElementById('sub-val-1');
const subVal2 = document.getElementById('sub-val-2');
const subVal3 = document.getElementById('sub-val-3');
const subVal4 = document.getElementById('sub-val-4');
const subBar1 = document.getElementById('sub-bar-1');
const subBar2 = document.getElementById('sub-bar-2');
const subBar3 = document.getElementById('sub-bar-3');
const subBar4 = document.getElementById('sub-bar-4');

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
    // We received the scraped DOM text, now call backend to audit
    sendDataToBackend(msg.payload.scrapedText, msg.payload.selectedText);
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

// Ask Shelby Submit handler
askSubmitBtn.addEventListener('click', submitAskQuestion);
askInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    submitAskQuestion();
  }
});

// Tab Switching Event Listeners
tabScan.addEventListener('click', () => {
  tabScan.classList.add('active');
  tabHistory.classList.remove('active');
  viewScan.classList.remove('shelby-hidden');
  viewHistory.classList.add('shelby-hidden');
  
  // Toggle Ask Shelby container visibility depending on API fallback status
  if (!fallbackWarning.classList.contains('shelby-hidden')) {
    askContainer.classList.add('shelby-hidden');
  } else if (currentScanId) {
    askContainer.classList.remove('shelby-hidden');
  }
});

tabHistory.addEventListener('click', () => {
  tabScan.classList.remove('active');
  tabHistory.classList.add('active');
  viewScan.classList.add('shelby-hidden');
  viewHistory.classList.remove('shelby-hidden');
  askContainer.classList.add('shelby-hidden');
  loadRecentHistoryList();
});

// Clear history action
clearHistoryBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove('shelby_history');
  loadRecentHistoryList();
});

function initializeScanSequence() {
  // 1. Reset state displays
  scanningLine.classList.add('active');
  scoreValue.innerText = '0';
  setProgressRing(0, '#6C63FF');
  scoreVerdict.innerText = 'Analyzing...';
  scoreVerdict.className = 'shelby-score-verdict';
  confidenceRating.classList.add('shelby-hidden');
  scanTimeLabel.classList.add('shelby-hidden');
  fallbackWarning.classList.add('shelby-hidden');
  sourcesSection.classList.add('shelby-hidden');
  askContainer.classList.add('shelby-hidden');
  shelbySaysText.innerText = "Shelby is analyzing this page... Hold on! 💖";
  memoryBox.classList.add('shelby-hidden');
  whySection.classList.add('shelby-hidden');
  whyList.innerHTML = "";
  scanAgainBtn.disabled = true;

  // Adapt subscore labels to current mode
  adaptSubscoreLabels();

  // Reset progress bars
  resetProgressBars();

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

// Map subscores dynamically based on mode
function adaptSubscoreLabels() {
  modeBadge.innerText = getModeBadgeText(currentMode);

  if (currentMode === 'Shopping Mode') {
    scoreTitle.innerText = 'Trust Score';
    subLabel1.innerText = '🛡️ Security';
    subLabel2.innerText = '⭐ Reputation';
    subLabel3.innerText = '📄 Content Quality';
    subLabel4.innerText = '🔒 Privacy';
  } else if (currentMode === 'Scam Mode') {
    scoreTitle.innerText = 'Scam Probability';
    subLabel1.innerText = '🛡️ Security';
    subLabel2.innerText = '👤 Reputation';
    subLabel3.innerText = '✉️ Content Quality';
    subLabel4.innerText = '🚨 Privacy';
  } else if (currentMode === 'Content Intelligence Mode') {
    scoreTitle.innerText = 'Credibility Score';
    subLabel1.innerText = '🛡️ Security';
    subLabel2.innerText = '👤 Reputation';
    subLabel3.innerText = '🤖 Content Quality';
    subLabel4.innerText = '🔒 Privacy';
  } else {
    scoreTitle.innerText = 'Trust Score';
    subLabel1.innerText = '🛡️ Security';
    subLabel2.innerText = '👤 Reputation';
    subLabel3.innerText = '📄 Content Quality';
    subLabel4.innerText = '🔒 Privacy';
  }
}

function getModeBadgeText(mode) {
  switch(mode) {
    case 'Shopping Mode': return 'Shop Mode 🛒';
    case 'Scam Mode': return 'Scam Mode 📧';
    case 'Content Intelligence Mode': return 'Content AI 🤖';
    default: return 'Trust Mode 🛡️';
  }
}

function resetProgressBars() {
  [subBar1, subBar2, subBar3, subBar4].forEach(bar => {
    bar.style.width = '0%';
    bar.style.backgroundColor = '#6C63FF';
    bar.classList.remove('disabled');
  });
  [subVal1, subVal2, subVal3, subVal4].forEach(val => val.innerText = '0%');
}

// Communicate directly with local FastAPI backend
async function sendDataToBackend(scrapedText, highlightedText) {
  const backendUrl = "http://127.0.0.1:8000/api/scan";
  
  const payload = {
    url: currentUrl,
    mode: currentMode,
    scraped_text: scrapedText,
    selected_text: highlightedText || selectedText || null
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
  setProgressRing(0, '#FF4757');
  scoreVerdict.innerText = 'Offline';
  scoreVerdict.className = 'shelby-score-verdict danger';
  shelbySaysText.innerText = `Shelby is trying to think, but the backend server is offline! Please run 'python -m uvicorn main:app --reload' in the backend directory. 💔`;
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
  
  // Dynamic Score Display logic:
  // Scam Mode display Scam Probability = 100 - trustScore
  let displayScore = trustScore;
  if (currentMode === 'Scam Mode') {
    displayScore = 100 - trustScore;
  }

  // Determine colors based on category
  const color = getScoreColor(displayScore, currentMode);
  const verdict = getVerdictLabel(trustScore, currentMode);

  // 1. Fill Overall trust gauge
  animateCountUp(displayScore, scoreValue);
  setProgressRing(displayScore, color);
  scoreVerdict.innerText = verdict;
  scoreVerdict.className = `shelby-score-verdict ${getScoreClass(trustScore)}`;

  // Display Confidence score
  confidenceValue.innerText = data.confidence || "High";
  confidenceValue.className = "";
  confidenceValue.classList.add(data.confidence ? data.confidence.toLowerCase() : "high");
  confidenceRating.classList.remove('shelby-hidden');

  // Display Scan Time
  const durationSec = (data.scan_time_ms / 1000).toFixed(1);
  scanTimeLabel.innerText = `Analyzed in ${durationSec} seconds`;
  scanTimeLabel.classList.remove('shelby-hidden');

  // Update Mascot visual
  window.parent.postMessage({
    type: 'SHELBY_UPDATE_MASCOT_VISUAL',
    payload: { state: getScoreClass(trustScore) }
  }, '*');

  // 2. Animate Subscores sequentially (400ms gaps)
  const subscores = [
    data.subscores.security,
    data.subscores.reputation,
    data.subscores.content_quality,
    data.subscores.privacy
  ];

  const subBars = [subBar1, subBar2, subBar3, subBar4];
  const subVals = [subVal1, subVal2, subVal3, subVal4];

  for (let i = 0; i < 4; i++) {
    await sleep(400);
    const val = subscores[i];
    
    // Grey out sub-scores if Gemini offline fallback is active
    if (!data.ai_analyzed && i >= 2) {
      subBars[i].style.width = '0%';
      subBars[i].classList.add('disabled');
      subVals[i].innerText = 'N/A';
    } else {
      subBars[i].style.width = `${val}%`;
      subBars[i].style.backgroundColor = getScoreColor(val, 'Subscore');
      subVals[i].innerText = `${val}%`;
    }
  }

  // 3. Render AI Fallback header alert if Gemini fails
  if (!data.ai_analyzed) {
    fallbackWarning.classList.remove('shelby-hidden');
    askContainer.classList.add('shelby-hidden');
  } else {
    fallbackWarning.classList.add('shelby-hidden');
    askContainer.classList.remove('shelby-hidden'); // Show interactive Ask Shelby
  }

  // 4. Render Sources checklist
  renderSourcesAudited(data);

  // 5. Render "Why this score?" reasons list
  renderWhyThisScore(data.reasons_why);

  // 6. Render findings details
  renderFindingsDetails(data);

  // 7. Handle memory comparison (chrome.storage.local)
  const memoryLog = await checkAndUpdateMemory(currentUrl, trustScore, data.sparkline_data);
  handleMemoryDisplay(memoryLog);

  // 8. Log scan to Recent Audits History list (chrome.storage.local)
  const friendlyName = getFriendlyName(currentUrl);
  await addScanToHistory(currentUrl, friendlyName, displayScore, data.risk_category);
  loadRecentHistoryList();

  // 9. Turn off scanning line
  scanningLine.classList.remove('active');
  scanAgainBtn.disabled = false;

  // 10. Typewriter effect for Shelby Says advice bubble
  await sleep(200);
  typewriterEffect(data.shelby_says, shelbySaysText);
}

function getScoreColor(score, mode) {
  if (mode === 'Scam Mode') {
    // High scam probability means RED warning
    if (score >= 60) return '#FF4757'; // Red
    if (score >= 40) return '#FFA502'; // Yellow
    return '#2ED573'; // Green
  }
  
  if (score <= 40) return '#FF4757'; // Red
  if (score <= 70) return '#FFA502'; // Yellow
  return '#2ED573'; // Green
}

function getScoreClass(score) {
  if (score >= 80) return 'safe';
  if (score >= 60) return 'warning';
  if (score >= 40) return 'risky';
  return 'danger';
}

function getVerdictLabel(score, mode) {
  if (mode === 'Scam Mode') {
    const prob = 100 - score;
    if (prob >= 80) return '🔴 Dangerous (80-100)';
    if (prob >= 60) return '🟠 Risky (60-79)';
    if (prob >= 40) return '🟡 Caution (40-59)';
    return '🟢 Safe (0-39)';
  }
  
  if (score >= 80) return '🟢 Safe (80-100)';
  if (score >= 60) return '🟡 Caution (60-79)';
  if (score >= 40) return '🟠 Risky (40-59)';
  return '🔴 Dangerous (0-39)';
}

function setProgressRing(percent, color) {
  const radius = scoreRing.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  scoreRing.style.strokeDashoffset = offset;
  scoreRing.style.stroke = color;
}

function animateCountUp(target, element) {
  let current = 0;
  const step = Math.ceil(target / 30) || 1; // finish in roughly 30 frames
  const timer = setInterval(() => {
    current += step;
    if (current >= target) {
      element.innerText = target;
      clearInterval(timer);
    } else {
      element.innerText = current;
    }
  }, 30);
}

function renderSourcesAudited(data) {
  // Local rules are always processed
  srcLocal.className = "shelby-source-item active";
  
  // VirusTotal status
  if (data.subscores.reputation > 0 || data.subscores.security > 0) {
    srcVt.className = "shelby-source-item active";
  } else {
    srcVt.className = "shelby-source-item inactive";
  }

  // Gemini AI status
  if (data.ai_analyzed) {
    srcGemini.className = "shelby-source-item active";
  } else {
    srcGemini.className = "shelby-source-item inactive";
  }

  sourcesSection.classList.remove('shelby-hidden');
}

function renderWhyThisScore(reasons) {
  whyList.innerHTML = "";
  if (!reasons || reasons.length === 0) {
    whySection.classList.add('shelby-hidden');
    return;
  }

  reasons.forEach(reason => {
    const li = document.createElement('li');
    li.className = 'shelby-why-item';
    
    if (reason.startsWith('+')) {
      li.classList.add('positive');
      li.innerText = reason.substring(1).trim();
    } else if (reason.startsWith('-')) {
      li.classList.add('negative');
      li.innerText = reason.substring(1).trim();
    } else {
      li.innerText = reason;
    }
    
    whyList.appendChild(li);
  });

  whySection.classList.remove('shelby-hidden');
}

function renderFindingsDetails(data) {
  detailsContent.innerHTML = ""; // Clear loader

  if (currentMode === 'Shopping Mode') {
    const detailDiv = document.createElement('div');
    detailDiv.className = 'shelby-shopping-details';

    // RATING COMPARISON
    const ratingRow = document.createElement('div');
    ratingRow.className = 'shelby-rating-row';
    ratingRow.innerHTML = `
      <span>Review Integrity:</span>
      <div class="shelby-ratings-box">
        <span class="shelby-original-rating">★ 4.6</span>
        <span class="shelby-real-rating">★ 3.1 real</span>
      </div>
    `;
    detailDiv.appendChild(ratingRow);

    // PRICE SPARKLINE CANVAS
    if (data.sparkline_data && data.sparkline_data.length > 0) {
      const sparklineContainer = document.createElement('div');
      sparklineContainer.className = 'shelby-sparkline-container';
      
      const sparkTitle = document.createElement('span');
      sparkTitle.className = 'shelby-sparkline-title';
      sparkTitle.innerText = '6-Month Price History (Sparkline):';
      
      const canvas = document.createElement('canvas');
      canvas.className = 'shelby-sparkline-canvas';
      canvas.width = 300;
      canvas.height = 50;

      sparklineContainer.appendChild(sparkTitle);
      sparklineContainer.appendChild(canvas);
      detailDiv.appendChild(sparklineContainer);

      // Render Sparkline
      setTimeout(() => {
        drawSparkline(canvas, data.sparkline_data);
      }, 50);
    }

    // FINDINGS / PATTERNS
    if (data.findings && data.findings.length > 0) {
      const patternList = document.createElement('ul');
      patternList.className = 'shelby-indicator-list';
      data.findings.forEach(pattern => {
        const item = document.createElement('li');
        item.className = 'shelby-indicator-item scam-warning';
        item.innerText = pattern;
        patternList.appendChild(item);
      });
      detailDiv.appendChild(patternList);
    }

    detailsContent.appendChild(detailDiv);

  } else {
    // Standard text indicators list for other modes
    const list = document.createElement('ul');
    list.className = 'shelby-indicator-list';

    const findings = data.findings || [];
    const itemClass = (currentMode === 'Scam Mode') ? 'scam-warning' : 'trust-check';

    findings.forEach(ind => {
      const li = document.createElement('li');
      li.className = `shelby-indicator-item ${itemClass}`;
      li.innerText = ind;
      list.appendChild(li);
    });

    detailsContent.appendChild(list);
  }
}

function drawSparkline(canvas, prices) {
  if (!canvas || !prices || prices.length === 0) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const min = Math.min(...prices) * 0.95;
  const max = Math.max(...prices) * 1.05;
  const range = max - min || 1;

  const points = [];
  const paddingX = 20;
  const paddingY = 10;
  const chartW = w - paddingX * 2;
  const chartH = h - paddingY * 2;

  for (let i = 0; i < prices.length; i++) {
    const x = paddingX + (i / (prices.length - 1)) * chartW;
    const y = paddingY + chartH - ((prices[i] - min) / range) * chartH;
    points.push({ x, y });
  }

  // Draw gradient shadow
  ctx.beginPath();
  ctx.moveTo(points[0].x, h);
  points.forEach(pt => ctx.lineTo(pt.x, pt.y));
  ctx.lineTo(points[points.length - 1].x, h);
  ctx.closePath();
  
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, 'rgba(108, 99, 255, 0.2)');
  gradient.addColorStop(1, 'rgba(108, 99, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw sparkline path
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach(pt => ctx.lineTo(pt.x, pt.y));
  ctx.strokeStyle = '#6C63FF';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw points
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
  points.forEach((pt, idx) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#FF6584';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '9px Inter';
    ctx.fillStyle = '#747D8C';
    ctx.textAlign = 'center';
    const label = months[idx] || `M${idx+1}`;
    ctx.fillText(label, pt.x, h - 2);
  });
}

// Ask Shelby Interactive Chat Query Submission
async function submitAskQuestion() {
  const question = askInput.value.trim();
  if (!question || !currentScanId) return;

  // Disable inputs during processing
  askInput.disabled = true;
  askSubmitBtn.disabled = true;
  shelbySaysText.innerText = "Shelby is writing a response... 💖";

  const askUrl = "http://127.0.0.1:8000/api/ask";
  try {
    const response = await fetch(askUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scan_id: currentScanId,
        question: question
      })
    });

    if (!response.ok) {
      throw new Error(`Ask API failed with status ${response.status}`);
    }

    const data = await response.json();
    typewriterEffect(data.answer, shelbySaysText);
  } catch (error) {
    console.error('Ask Shelby failed:', error);
    shelbySaysText.innerText = "Oh no, my conversational circuits are offline. Try scanning the page again! 💔";
  } finally {
    askInput.value = "";
    askInput.disabled = false;
    askSubmitBtn.disabled = false;
  }
}

// Storage for Scan History (Last 10 audits)
async function addScanToHistory(url, domain, score, category) {
  const data = await chrome.storage.local.get('shelby_history');
  let history = data.shelby_history || [];

  // Filter out duplicates of identical urls
  history = history.filter(item => item.url !== url);

  // Add new scan details to the top of history
  history.unshift({
    url,
    domain,
    score,
    category: category.toLowerCase(),
    timestamp: Date.now()
  });

  // Limit list to last 10 scans
  if (history.length > 10) {
    history = history.slice(0, 10);
  }

  await chrome.storage.local.set({ 'shelby_history': history });
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
    emptyLi.style.fontSize = '12px';
    emptyLi.style.color = 'var(--text-secondary)';
    emptyLi.innerText = 'No scan history yet. Try scanning a website! 🛡️';
    historyList.appendChild(emptyLi);
    return;
  }

  history.forEach(item => {
    const li = document.createElement('li');
    li.className = 'shelby-history-item';
    li.innerHTML = `
      <span class="shelby-history-site">${item.domain}</span>
      <div class="shelby-history-meta">
        <span class="shelby-history-badge ${item.category}">${item.score}%</span>
      </div>
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
    
    // Explicit clean mapping for demo sites
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

// Memory logs comparison using chrome.storage.local
async function checkAndUpdateMemory(url, score, sparklineData) {
  const storageKey = `shelby_log_${url}`;
  const data = await chrome.storage.local.get(storageKey);
  const prevScan = data[storageKey];
  const now = Date.now();

  const newLog = {
    timestamp: now,
    score: score,
    price: sparklineData && sparklineData.length > 0 ? sparklineData[sparklineData.length - 1] : null
  };

  await chrome.storage.local.set({ [storageKey]: newLog });

  if (prevScan) {
    const minutesAgo = Math.round((now - prevScan.timestamp) / 60000);
    const scoreDiff = score - prevScan.score;
    let priceDiff = null;

    if (newLog.price && prevScan.price) {
      priceDiff = newLog.price - prevScan.price;
    }

    return {
      hasHistory: true,
      minutesAgo,
      scoreDiff,
      priceDiff,
      prevScore: prevScan.score
    };
  }

  return { hasHistory: false };
}

function handleMemoryDisplay(memoryLog) {
  if (!memoryLog || !memoryLog.hasHistory) {
    memoryBox.classList.add('shelby-hidden');
    return;
  }

  memoryBox.classList.remove('shelby-hidden');
  
  let msg = `Shelby remembers: scanned ${memoryLog.minutesAgo} mins ago. `;
  
  if (memoryLog.scoreDiff !== 0) {
    msg += `Trust score changed from ${memoryLog.prevScore} to ${memoryLog.prevScore + memoryLog.scoreDiff}. `;
  } else {
    msg += `Trust score unchanged at ${memoryLog.prevScore}. `;
  }

  if (memoryLog.priceDiff !== null && memoryLog.priceDiff !== 0) {
    const sign = memoryLog.priceDiff > 0 ? '+' : '';
    msg += `Price changed by ${sign}₹${Math.abs(memoryLog.priceDiff)}! `;
  }

  memoryMsg.innerText = msg;
}

// Typewriter effect logic
function typewriterEffect(text, element) {
  element.innerText = "";
  let i = 0;
  const speed = 20; // ms per character

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
