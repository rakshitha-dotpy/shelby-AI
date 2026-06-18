// panel.js - Shelby AI Companion UI Management & Backend Integration
// Implements V2.2 Command Palette, Dynamic Theming, Calculated Trust Scores, and diagnostics.

let currentUrl = "";
let currentContext = "General"; // Shopping, Research, Jobs, Email, Messaging, News, General
let currentScanId = "";
let pageContextText = "";
let conversationContextText = "";
let pageSelectedText = null;
let currentDraftOptions = {};
let chatHistory = [];
let isVisionEnabled = true;

// Client-side local cache (URL -> {data, clientTimestamp})
const clientScanCache = {};

// DOM Elements
const featuresFound = document.getElementById('shelby-features-found-id');
const privacyToggleBtn = document.getElementById('shelby-privacy-toggle-btn');
const privacyText = document.getElementById('shelby-privacy-text-id');
const closeBtn = document.getElementById('close-panel-btn');
const scanningLine = document.getElementById('shelby-scanning-line');
const scanTimeLabel = document.getElementById('shelby-scan-time');
const visionOffWarning = document.getElementById('shelby-vision-off-warning');

// Memory elements
const memoryBox = document.getElementById('shelby-memory-box');
const memLastVisit = document.getElementById('shelby-memory-last-visit');
const memPrevAdvice = document.getElementById('shelby-memory-prev-advice');
const memChanges = document.getElementById('shelby-memory-changes');

// Suggested Actions
const suggestedActions = document.getElementById('shelby-suggested-actions');

// Image section
const imageSection = document.getElementById('shelby-image-section');
const imagePreview = document.getElementById('shelby-image-preview');
const imageVerdict = document.getElementById('shelby-image-verdict');
const imageConfidence = document.getElementById('shelby-image-confidence');
const imageExplanation = document.getElementById('shelby-image-explanation-id');
const imageIndicators = document.getElementById('shelby-image-indicators');

// Context section
const contextSection = document.getElementById('shelby-context-section');
const contextVerdict = document.getElementById('shelby-context-verdict');
const contextTrustScore = document.getElementById('shelby-context-trust-score');
const contextConfidence = document.getElementById('shelby-context-confidence');
const contextSummary = document.getElementById('shelby-context-summary');
const whySection = document.getElementById('shelby-why-section-id');
const whyList = document.getElementById('shelby-why-list-id');
const modeDetails = document.getElementById('shelby-mode-details');

// Chat section
const chatLog = document.getElementById('shelby-chat-log');
const chatInput = document.getElementById('shelby-chat-input');
const chatSubmitBtn = document.getElementById('shelby-chat-submit-btn');

// Debug Panel Elements
const dbgScanSource = document.getElementById('dbg-scan-source');
const dbgMode = document.getElementById('dbg-mode');
const dbgCtxQuality = document.getElementById('dbg-ctx-quality');
const dbgCtxLen = document.getElementById('dbg-ctx-len');
const dbgEvidenceCount = document.getElementById('dbg-evidence-count');
const dbgLastRequest = document.getElementById('dbg-last-request');
const dbgBackend = document.getElementById('dbg-backend');
const dbgOpenai = document.getElementById('dbg-openai');
const dbgLastScan = document.getElementById('dbg-last-scan');
const dbgCtxPreview = document.getElementById('dbg-ctx-preview');

// Initialize Privacy Toggle Status
async function initPrivacyToggle() {
  const config = await chrome.storage.local.get('shelby_vision');
  isVisionEnabled = config.shelby_vision !== false;
  updatePrivacyUI(isVisionEnabled);
}

function updatePrivacyUI(enabled) {
  isVisionEnabled = enabled;
  if (enabled) {
    privacyToggleBtn.className = 'shelby-privacy-badge vision-on';
    privacyText.innerText = 'Vision ON';
    visionOffWarning.classList.add('shelby-hidden');
  } else {
    privacyToggleBtn.className = 'shelby-privacy-badge vision-off';
    privacyText.innerText = 'Vision OFF';
    visionOffWarning.classList.remove('shelby-hidden');
  }
}

privacyToggleBtn.addEventListener('click', async () => {
  const config = await chrome.storage.local.get('shelby_vision');
  const nextState = config.shelby_vision === false;
  await chrome.storage.local.set({ 'shelby_vision': nextState });
  updatePrivacyUI(nextState);
  
  // Re-trigger scan sequence when privacy is toggled
  initializeScanSequence();
});

// Close panel click
closeBtn.addEventListener('click', () => {
  window.parent.postMessage({ type: 'SHELBY_CLOSE_PANEL' }, '*');
});

// Chat handlers
chatSubmitBtn.addEventListener('click', handleChatSubmit);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleChatSubmit();
});

// Listen to parent events
window.addEventListener('message', async (event) => {
  const msg = event.data;

  if (msg.type === 'SHELBY_PANEL_OPENED') {
    currentUrl = msg.payload.url;
    currentContext = msg.payload.mode; // Context Auto-Detected
    pageSelectedText = msg.payload.selectedText;
    
    // Apply dynamic webpage theme variables
    if (msg.payload.theme) {
      applyDynamicTheme(msg.payload.theme);
    }
    
    // Check if Command Palette triggered focus
    if (msg.payload.focusInput) {
      setTimeout(() => chatInput.focus(), 150);
    }

    // Initialize or handle right-clicked image vision request
    if (msg.payload.analyzeImage) {
      handleImageAnalysis(msg.payload.analyzeImage);
    } else {
      initializeScanSequence();
    }
  } else if (msg.type === 'SHELBY_SEND_SCRAPED_DATA') {
    pageContextText = msg.payload.page_context || "";
    conversationContextText = msg.payload.conversation_context || "";
    
    // Proceed with scan payload verification
    verifyAndSendDataToBackend();
  }
});

// Apply dynamic style variables injected from host page
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

function initializeScanSequence() {
  scanningLine.classList.add('active');
  scanTimeLabel.classList.add('shelby-hidden');
  imageSection.classList.add('shelby-hidden');
  memoryBox.classList.add('shelby-hidden');
  
  // Set UI features text checklist based on context
  setFeaturesChecklistHeader();
  
  // Populate Quick Action buttons
  populateSuggestedActions();

  // Reset context card details
  contextSection.classList.remove('shelby-hidden');
  contextVerdict.innerText = 'Analyzing...';
  contextVerdict.className = 'shelby-verdict-badge';
  contextTrustScore.innerText = '--';
  contextConfidence.innerText = '--';
  contextSummary.innerText = 'Shelby is analyzing the page content...';
  whyList.innerHTML = "";
  modeDetails.innerHTML = '';

  // Adaptive chat heights based on context
  adaptChatLayoutHeight();

  // Reset debug fields
  dbgMode.innerText = currentContext;
  dbgCtxLen.innerText = "0";
  dbgCtxQuality.innerText = "--";
  dbgCtxPreview.innerText = "(No context preview available)";

  // If vision is disabled, skip scraping and backend scans entirely (Standalone Chat Mode)
  if (!isVisionEnabled) {
    scanningLine.classList.remove('active');
    contextSection.classList.add('shelby-hidden');
    
    // Set Standalone Diagnostics
    dbgScanSource.innerText = "Standalone Mode";
    dbgCtxLen.innerText = "0";
    dbgCtxQuality.innerText = "--";
    dbgEvidenceCount.innerText = "--";
    updateRequestStatus('No Scrape / Halted', true);
    dbgBackend.innerText = "Online";
    dbgOpenai.innerText = "Online";
    dbgLastScan.innerText = "0ms";
    dbgCtxPreview.innerText = "Shelby Vision is OFF. Reading page context is disabled.";
    
    appendChatMessage('assistant', "I'm running in Standalone Mode because Vision is OFF. Ask me general questions! 🦊");
    return;
  }

  // Request scraped text
  window.parent.postMessage({ type: 'SHELBY_REQUEST_SCRAPE' }, '*');
  window.parent.postMessage({ type: 'SHELBY_UPDATE_MASCOT_VISUAL', payload: { state: 'scanning' } }, '*');
}

function setFeaturesChecklistHeader() {
  const textEl = featuresFound;
  switch (currentContext) {
    case 'Shopping':
      textEl.innerText = 'I found:\n🛒 Product\n⭐ Reviews\n💰 Pricing';
      break;
    case 'Research':
    case 'News':
      textEl.innerText = 'I found:\n📚 Article\n🔍 Sources\n📝 Summary';
      break;
    case 'Jobs':
      textEl.innerText = 'I found:\n💼 Job details\n🛠️ Requirements\n💬 Tips';
      break;
    case 'Email':
    case 'Messaging':
      textEl.innerText = 'I found:\n✉️ Message details\n📝 Suggested replies';
      break;
    default:
      textEl.innerText = 'I found:\n🌐 Webpage details';
  }
}

function adaptChatLayoutHeight() {
  const chatLogEl = document.getElementById('shelby-chat-log');
  if (currentContext === 'Research' || currentContext === 'News') {
    chatLogEl.style.maxHeight = '360px';
    chatLogEl.style.minHeight = '220px';
  } else {
    chatLogEl.style.maxHeight = '180px';
    chatLogEl.style.minHeight = '120px';
  }
}

function populateSuggestedActions() {
  suggestedActions.innerHTML = "";
  
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
      chatInput.value = act.prompt;
      handleChatSubmit();
    });
    suggestedActions.appendChild(chip);
  });
}

// Update local request status badge
function updateRequestStatus(text, success) {
  dbgLastRequest.innerText = text;
  if (success) {
    dbgLastRequest.className = 'dbg-status-label success';
  } else {
    dbgLastRequest.className = 'dbg-status-label danger';
  }
}

// Scrape length validation and transmission
function verifyAndSendDataToBackend() {
  const combinedLen = pageContextText.length + conversationContextText.length;
  
  // 1. Diagnostics update
  dbgCtxLen.innerText = combinedLen;
  dbgCtxPreview.innerText = pageContextText ? pageContextText.slice(0, 300) : "(No context preview)";
  
  // Calculate Quality formula
  let quality = "Poor";
  if (combinedLen > 3000) quality = "Excellent";
  else if (combinedLen > 1500) quality = "Good";
  else if (combinedLen > 500) quality = "Fair";
  dbgCtxQuality.innerText = quality;

  // 2. Minimum context validation (200 characters limit)
  if (combinedLen < 200) {
    scanningLine.classList.remove('active');
    contextVerdict.innerText = 'INSUFFICIENT DATA';
    contextVerdict.className = 'shelby-verdict-badge danger';
    contextTrustScore.innerText = '0';
    contextConfidence.innerText = 'Low';
    contextSummary.innerText = "I couldn't read enough information from this page.";
    
    whyList.innerHTML = "<li class='shelby-why-item'>✗ Not enough page content was extracted (under 200 chars).</li>";
    updateRequestStatus('Context validation failed', false);
    dbgScanSource.innerText = "Halted";
    dbgEvidenceCount.innerText = "1";
    
    window.parent.postMessage({ type: 'SHELBY_UPDATE_MASCOT_VISUAL', payload: { state: 'danger' } }, '*');
    return;
  }

  // 3. Client-side local cache validation (expires in 6 hours)
  const cached = clientScanCache[currentUrl];
  if (cached && (Date.now() - cached.clientTimestamp < 21600000)) {
    console.log("Client local Cache HIT for: " + currentUrl);
    renderScanResults(cached.data, "Cached Result (Client)");
    return;
  }

  // 4. Send to FastAPI server
  sendDataToBackend();
}

// POST page data to `/api/scan`
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
    
    // Save to client cache
    data.clientTimestamp = Date.now();
    clientScanCache[currentUrl] = { data, clientTimestamp: Date.now() };

    renderScanResults(data);
  } catch (error) {
    console.error('Shelby scan API connection error:', error);
    showErrorState('Backend server offline');
  }
}

function showErrorState(msg) {
  scanningLine.classList.remove('active');
  contextVerdict.innerText = 'Offline';
  contextVerdict.className = 'shelby-verdict-badge danger';
  contextSummary.innerText = `Shelby couldn't connect to the backend server. Make sure it is running. (${msg})`;
  dbgBackend.innerText = "Offline";
  dbgOpenai.innerText = "Offline";
  dbgScanSource.innerText = "Local Heuristics";
  window.parent.postMessage({ type: 'SHELBY_UPDATE_MASCOT_VISUAL', payload: { state: 'danger' } }, '*');
}

// Render dynamic results
async function renderScanResults(data, customSource = null) {
  scanningLine.classList.remove('active');
  currentScanId = data.scan_id;
  
  // Display Scan Time
  const durationSec = (data.scan_time_ms / 1000).toFixed(1);
  scanTimeLabel.innerText = `${durationSec}s`;
  scanTimeLabel.classList.remove('shelby-hidden');

  // Render Verdict/Recommendation Badge
  const rec = data.recommendation;
  contextVerdict.innerText = rec;
  
  // Format verdict class based on risk/recommendation
  let verdictClass = 'warning';
  if (['buy signal', 'strong sources', 'qualified', 'low risk', 'buy'].includes(rec.toLowerCase())) verdictClass = 'safe';
  if (['avoid', 'weak sources', 'not recommended', 'high risk', 'insufficient data'].includes(rec.toLowerCase())) verdictClass = 'danger';
  contextVerdict.className = `shelby-verdict-badge ${verdictClass}`;

  // Update Mascot visual states
  window.parent.postMessage({ type: 'SHELBY_UPDATE_MASCOT_VISUAL', payload: { state: verdictClass } }, '*');

  // Calculated Score metrics
  contextTrustScore.innerText = `${data.trust_score}%`;
  contextConfidence.innerText = data.confidence;

  // Display Summary Text
  contextSummary.innerText = data.shelby_says || '';

  // Render "Why?" evidence points
  whyList.innerHTML = "";
  (data.why_explanation || []).forEach(point => {
    const li = document.createElement('li');
    li.className = 'shelby-why-item';
    
    // Choose bullet icon dynamically based on tone
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
    
    // Strip existing prefix if repeated
    const cleanPoint = point.replace(/^[✓⚠✗👍👎▪]\s*/, '');
    li.innerText = `${icon} ${cleanPoint}`;
    whyList.appendChild(li);
  });

  // Render V2.2 Context Detail Modules
  modeDetails.innerHTML = '';
  renderModeDetails(data.details);

  // Active Memory Logs Check & Comparison
  await checkAndRenderMemory(data);

  // Diagnostics Panel Updates
  dbgScanSource.innerText = customSource || data.scan_source || "AI";
  dbgEvidenceCount.innerText = data.evidence_count || "0";
  dbgBackend.innerText = "Online";
  dbgOpenai.innerText = data.openai_status || "Online";
  dbgLastScan.innerText = `${data.scan_time_ms}ms`;
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

    modeDetails.appendChild(grid);

  } else if (currentContext === 'Research' || currentContext === 'News') {
    const list = document.createElement('div');
    list.className = 'shelby-pros-cons-grid';

    // Summary bullet points card
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

    // Credibility Card
    const cardCred = document.createElement('div');
    cardCred.className = 'shelby-analysis-card';
    cardCred.innerHTML = `
      <div class="shelby-analysis-title">🔍 Credibility Assessment</div>
      <p>Source Quality: ${details.source_quality || 'Good'}</p>
      <p>${details.credibility || ''}</p>
      ${details.bias_analysis ? `<p style="margin-top:4px"><strong>Bias Indicators:</strong> ${details.bias_analysis}</p>` : ''}
    `;
    list.appendChild(cardCred);

    modeDetails.appendChild(list);

  } else if (currentContext === 'Jobs') {
    const grid = document.createElement('div');
    grid.className = 'shelby-pros-cons-grid';

    // Skills lists
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

    // Tips & Interview Questions
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

    modeDetails.appendChild(grid);

  } else if (currentContext === 'Email' || currentContext === 'Messaging') {
    const container = document.createElement('div');
    container.className = 'shelby-reply-generator';

    const header = document.createElement('div');
    header.className = 'shelby-suggested-label';
    header.innerText = '⚡ Contextual Suggested Replies:';
    container.appendChild(header);

    // Save draft choices locally
    currentDraftOptions = details.draft_options || {};

    const styleSelector = document.createElement('div');
    styleSelector.className = 'shelby-style-selector';
    
    // Display Draft Area
    const draftBox = document.createElement('div');
    draftBox.className = 'shelby-draft-display-box';
    draftBox.innerText = 'Select a style to generate a reply draft...';

    // Insert Reply button
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
      
      // Auto click first style
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
    modeDetails.appendChild(container);
  }
}

// Memory logs comparison using chrome.storage.local
async function checkAndRenderMemory(data) {
  const urlKey = `shelby_log_v2_${currentUrl}`;
  const now = Date.now();
  const dateStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  
  // Read previous record
  const storageData = await chrome.storage.local.get(urlKey);
  const prevScan = storageData[urlKey];

  // Current values
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

  // Update storage log
  const newLog = {
    timestamp: now,
    date: dateStr,
    verdict: currentRec,
    price: currentPrice,
    reviews: currentReviews
  };
  await chrome.storage.local.set({ [urlKey]: newLog });

  if (!prevScan) {
    memoryBox.classList.add('shelby-hidden');
    return;
  }

  // Render memory box
  memLastVisit.innerText = `Last Visit: ${prevScan.date || 'unknown'}`;
  memPrevAdvice.innerText = `Previous Advice: ${prevScan.verdict || 'none'}`;
  
  // Calculate differences
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
  
  if (changesList.length > 0) {
    memChanges.innerText = `Changes: ${changesList.join(', ')}`;
  } else {
    memChanges.innerText = `Changes: No updates detected.`;
  }

  memoryBox.classList.remove('shelby-hidden');
}

// Right-click Image Vision API handler
async function handleImageAnalysis(imageUrl) {
  scanningLine.classList.add('active');
  contextSection.classList.add('shelby-hidden');
  memoryBox.classList.add('shelby-hidden');
  
  imageSection.classList.remove('shelby-hidden');
  imagePreview.src = imageUrl;
  imageVerdict.innerText = 'Analyzing...';
  imageVerdict.className = 'shelby-verdict-badge warning';
  imageConfidence.innerText = 'Low';
  imageConfidence.className = 'shelby-confidence-value low';
  imageExplanation.innerText = 'Shelby is analyzing the image authenticity context...';
  imageIndicators.innerHTML = '';

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
      
      imageVerdict.innerText = data.verdict;
      
      let badgeClass = 'warning';
      if (data.verdict.toLowerCase().includes('likely real')) badgeClass = 'safe';
      if (data.verdict.toLowerCase().includes('likely ai generated')) badgeClass = 'danger';
      imageVerdict.className = `shelby-verdict-badge ${badgeClass}`;
      
      imageConfidence.innerText = data.confidence;
      imageConfidence.className = `shelby-confidence-value ${data.confidence.toLowerCase()}`;
      imageExplanation.innerText = data.explanation;
      
      imageIndicators.innerHTML = '';
      (data.indicators || []).forEach(ind => {
        const li = document.createElement('li');
        li.className = 'shelby-indicators-item';
        li.innerText = ind;
        imageIndicators.appendChild(li);
      });
      
      scanningLine.classList.remove('active');
      appendChatMessage('assistant', `I finished analyzing this image. Verdict: ${data.verdict}. Confidence is ${data.confidence}. 🦊`);
    };
  } catch (error) {
    console.error('Image analysis fetch failed:', error);
    imageVerdict.innerText = 'Error';
    imageVerdict.className = 'shelby-verdict-badge danger';
    imageExplanation.innerText = `Shelby couldn't analyze the image. (${error.message})`;
    scanningLine.classList.remove('active');
  }
}

// Chat log message handlers
function appendChatMessage(role, text) {
  const msg = document.createElement('div');
  msg.className = `shelby-chat-message ${role}`;
  msg.innerText = text;
  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
  
  // Track conversational history
  chatHistory.push({ role, content: text });
}

async function handleChatSubmit() {
  const query = chatInput.value.trim();
  if (!query) return;

  appendChatMessage('user', query);
  chatInput.value = '';
  
  chatInput.disabled = true;
  chatSubmitBtn.disabled = true;

  const backendUrl = "http://127.0.0.1:8000/api/ask";
  
  // If Vision is disabled, bypass scanning context caching IDs
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
    console.error('Shelby chat answer failed:', error);
    appendChatMessage('assistant', "Oh dear! My communication circuits went offline. Please check your backend. 💔");
  } finally {
    chatInput.disabled = false;
    chatSubmitBtn.disabled = false;
    chatInput.focus();
  }
}

// Bootstrap
initPrivacyToggle();
