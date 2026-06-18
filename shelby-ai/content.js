// content.js - V2.2 Browser Native Integration Script for Shelby AI
console.log("[Shelby] Content script loaded");

(function() {
  if (document.getElementById('shelby-ai-panel')) return;

  // 1. Context Detection Based on URL hostname
  const url = window.location.href;
  const hostname = window.location.hostname.toLowerCase();
  
  let mode = 'General';
  const shoppingDomains = ['amazon.', 'flipkart.com', 'meesho.com', 'myntra.com', 'snapdeal.com', 'ajio.com', 'ebay.', 'walmart.com'];
  const newsDomains = ['nytimes.com', 'bbc.com', 'bbc.co.uk', 'cnn.com', 'reuters.com', 'bloomberg.com', 'theguardian.com', 'forbes.com', 'wsj.com', 'indiatimes.com'];

  if (shoppingDomains.some(domain => hostname.includes(domain))) {
    mode = 'Shopping';
  } else if (hostname.includes('mail.google.com') || hostname.includes('outlook.live') || hostname.includes('mail.yahoo')) {
    mode = 'Email';
  } else if (hostname.includes('web.whatsapp.com') || hostname.includes('instagram.com') || hostname.includes('linkedin.com/messaging')) {
    mode = 'Messaging';
  } else if (hostname.includes('linkedin.com/jobs') || hostname.includes('indeed.com') || hostname.includes('internshala.com')) {
    mode = 'Jobs';
  } else if (hostname.includes('wikipedia.org') || hostname.includes('britannica.com') || hostname.includes('medium.com') || hostname.includes('github.com')) {
    mode = 'Research';
  } else if (newsDomains.some(domain => hostname.includes(domain))) {
    mode = 'News';
  }

  // 2. Extract Accent Color and Brightness Level Dynamically
  function extractPageTheme() {
    let isDark = false;
    let accentColor = '#6C63FF';
    let dominantBg = 'rgba(255, 255, 255, 0.7)';
    
    try {
      const bodyBg = window.getComputedStyle(document.body).backgroundColor;
      if (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') {
        const rgb = bodyBg.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const r = parseInt(rgb[0]);
          const g = parseInt(rgb[1]);
          const b = parseInt(rgb[2]);
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          isDark = luminance < 128;
          dominantBg = isDark ? 'rgba(30, 41, 59, 0.75)' : 'rgba(255, 255, 255, 0.7)';
        }
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        isDark = true;
        dominantBg = 'rgba(30, 41, 59, 0.75)';
      }
      
      const targets = Array.from(document.querySelectorAll('button, a, h1, h2, input[type="submit"]'));
      for (const el of targets) {
        const style = window.getComputedStyle(el);
        const bg = style.backgroundColor;
        const col = style.color;
        
        const testColor = (c) => {
          if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return null;
          const rgb = c.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            const r = parseInt(rgb[0]);
            const g = parseInt(rgb[1]);
            const b = parseInt(rgb[2]);
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            if (max - min > 40 && max > 50 && max < 250) {
              return `rgb(${r}, ${g}, ${b})`;
            }
          }
          return null;
        };
        
        const match = testColor(bg) || testColor(col);
        if (match) {
          accentColor = match;
          break;
        }
      }
    } catch (e) {
      console.warn("[Shelby] Theme parsing error:", e);
    }
    
    return { isDark, accentColor, dominantBg };
  }

  // 3. Inject Iframe Container for Side Panel
  const iframe = document.createElement('iframe');
  iframe.id = 'shelby-ai-panel';
  iframe.src = chrome.runtime.getURL('panel.html');
  // Initialize with display: none to prevent click interference
  iframe.style.display = 'none';
  
  const iframeStyle = document.createElement('style');
  iframeStyle.textContent = `
    #shelby-ai-panel {
      position: fixed;
      top: 0;
      right: 0;
      width: 360px;
      height: 100vh;
      z-index: 2147483647;
      border: none;
      background: transparent;
      transform: translateX(100%);
      transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: auto;
    }
    #shelby-ai-panel.shelby-panel-open {
      transform: translateX(0);
      box-shadow: -10px 0 35px rgba(0, 0, 0, 0.15);
    }
  `;
  document.head.appendChild(iframeStyle);
  document.body.appendChild(iframe);

  let isPanelOpen = false;

  // early message listener registration
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SHELBY_ANALYZE_IMAGE') {
      togglePanel(true, false, msg.imageUrl);
    } else if (msg.type === 'SHELBY_TOGGLE_PANEL') {
      console.log("[Shelby] Toggle message received");
      togglePanel(!isPanelOpen);
    }
  });
  console.log("[Shelby] Message listener registered");

  // 4. Initialize Mascot inside storage check
  let visionOnCached = true;
  chrome.storage.local.get('shelby_vision', (config) => {
    visionOnCached = config.shelby_vision !== false;
    if (window.ShelbyMascot) {
      window.ShelbyMascot.create({ mode, badgeText: 'Shelby AI' });
      console.log("[Shelby] Mascot created");
      if (mode !== 'General' && visionOnCached) {
        setTimeout(() => {
          window.ShelbyMascot.showNotice();
        }, 1500);
      }
      
      // BIND mascot click listeners here now that elements are generated and exist in the DOM!
      bindMascotClickEvents();
    }
  });

  // Safe Mascot elements binding after injection
  function bindMascotClickEvents() {
    console.log(document.getElementById("shelby-mascot-btn"));
    const mascotBtn = document.getElementById('shelby-mascot-btn');
    const noticeEl = document.getElementById('shelby-mascot-notice-id');

    if (mascotBtn) {
      if (!mascotBtn.dataset.shelbyBound) {
        mascotBtn.addEventListener('click', () => {
          console.log("[Shelby] Mascot clicked");
          if (window.ShelbyMascot && window.ShelbyMascot.hasMoved) {
            console.log("[Shelby] Mascot dragging detected, skipping toggle");
            return;
          }
          togglePanel(!isPanelOpen);
        });
        mascotBtn.dataset.shelbyBound = "true";
        console.log("[Shelby] Mascot listener attached");
      }
    }

    if (noticeEl) {
      if (!noticeEl.dataset.shelbyBound) {
        noticeEl.addEventListener('click', (e) => {
          console.log("[Shelby] Notice bubble clicked");
          e.stopPropagation();
          togglePanel(true);
        });
        noticeEl.dataset.shelbyBound = "true";
        console.log("[Shelby] Notice bubble listener attached");
      }
    }

    // If elements are missing in DOM, retry binding with MutationObserver
    if (!mascotBtn || !noticeEl) {
      console.log("[Shelby] Mascot elements not in DOM yet. Initializing MutationObserver retry...");
      const observer = new MutationObserver((mutations, obs) => {
        const checkBtn = document.getElementById('shelby-mascot-btn');
        const checkNotice = document.getElementById('shelby-mascot-notice-id');
        if (checkBtn && checkNotice) {
          console.log("[Shelby] Mascot elements found in DOM via MutationObserver");
          obs.disconnect();
          bindMascotClickEvents();
        }
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  }

  // Toggle Panel open/close with detailed tracing logs
  function togglePanel(open, focusInput = false, analyzeImage = null) {
    console.log("[Shelby] togglePanel called");
    console.log("[Shelby] Current state:", isPanelOpen);
    console.log("[Shelby] Target state:", open);

    // Verify Panel DOM elements existence
    console.log("[Shelby] Panel element selector check (#shelby-ai-panel):", document.querySelector("#shelby-ai-panel"));
    console.log("[Shelby] Panel iframe element check (iframe):", document.querySelector("iframe"));

    isPanelOpen = open;
    if (open) {
      iframe.style.display = 'block';
      
      // Let display: block render, then slide panel open
      setTimeout(() => {
        iframe.classList.add('shelby-panel-open');
        console.log("[Shelby] Panel state: OPEN");
        
        // Log final computed visibility styles
        const styles = window.getComputedStyle(iframe);
        console.log("[Shelby] Final computed styles after open transition:", {
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          transform: styles.transform,
          pointerEvents: styles.pointerEvents
        });
      }, 20);
      
      if (window.ShelbyMascot) {
        window.ShelbyMascot.hideNotice();
      }
      
      const selectedText = window.getSelection().toString().trim();
      let activeMode = mode;
      
      if (selectedText.length > 0 && !analyzeImage) {
        activeMode = 'Scam';
      }

      setTimeout(() => {
        const theme = extractPageTheme();
        iframe.contentWindow.postMessage({
          type: 'SHELBY_PANEL_OPENED',
          payload: { 
            url: window.location.href, 
            mode: activeMode,
            selectedText: selectedText || null,
            focusInput,
            theme,
            analyzeImage
          }
        }, '*');
      }, 100);
    } else {
      iframe.classList.remove('shelby-panel-open');
      console.log("[Shelby] Panel state: CLOSED");
      
      if (window.ShelbyMascot) {
        window.ShelbyMascot.setVisualState('idle');
      }
      
      // Hide iframe after transition finishes to avoid intercepting clicks
      setTimeout(() => {
        if (!isPanelOpen) {
          iframe.style.display = 'none';
          
          const styles = window.getComputedStyle(iframe);
          console.log("[Shelby] Final computed styles after close transition:", {
            display: styles.display,
            visibility: styles.visibility,
            opacity: styles.opacity,
            transform: styles.transform,
            pointerEvents: styles.pointerEvents
          });
        }
      }, 300);
    }
  }

  // Keyboard shortcut Ctrl+Shift+Space (Command Palette Toggle)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'Space') {
      e.preventDefault();
      console.log("[Shelby] Keyboard shortcut triggered panel toggle");
      togglePanel(!isPanelOpen, true);
    }
  });

  // Cursor reply text injector
  function insertTextAtCursor(text) {
    const activeEl = document.activeElement;
    if (!activeEl) return false;
    
    if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
      const start = activeEl.selectionStart;
      const end = activeEl.selectionEnd;
      const val = activeEl.value;
      activeEl.value = val.substring(0, start) + text + val.substring(end);
      activeEl.selectionStart = activeEl.selectionEnd = start + text.length;
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } else if (activeEl.isContentEditable) {
      activeEl.focus();
      const selection = window.getSelection();
      if (!selection.rangeCount) return false;
      selection.deleteFromDocument();
      
      const range = selection.getRangeAt(0);
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
      
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  // 5. Scrape DOM Contents separately into page_context and conversation_context
  async function scrapePageContent() {
    const config = await chrome.storage.local.get('shelby_vision');
    const visionOn = config.shelby_vision !== false;
    
    if (!visionOn) {
      console.log("[Shelby] Vision is OFF: Scraping disabled.");
      return { page_context: "", conversation_context: "" };
    }

    let pageContext = "";
    let conversationContext = "";
    
    if (mode === 'Shopping') {
      const priceSelectors = ['.a-price-whole', '.selling-price', '.pdp-price', '.price', '[data-testid="price-display"]', '.a-offscreen'];
      let price = '';
      for (const s of priceSelectors) {
        const el = document.querySelector(s);
        if (el && el.innerText.trim()) {
          price = el.innerText.trim();
          break;
        }
      }
      if (!price) {
        const priceEl = document.querySelector('[class*="price"], [class*="Price"]');
        if (priceEl) price = priceEl.innerText.trim();
      }
      
      const descEl = document.getElementById('feature-bullets') || document.querySelector('[class*="description"]') || document.body;
      const details = descEl.innerText.slice(0, 3500);
      
      pageContext = `Product Title: ${document.title}\nExtracted Price: ${price}\nProduct Excerpts:\n${details}`;
      conversationContext = "";
      
    } else if (mode === 'Email') {
      const subject = document.querySelector('h1, h2.hP')?.innerText || document.title;
      const sender = document.querySelector('.gD')?.innerText || 'Unknown';
      const bodyEl = document.querySelector('.a3s') || document.body;
      const emails = bodyEl.innerText.slice(0, 3000);
      
      pageContext = `Email Thread Info:\nSubject: ${subject}\nActive Sender: ${sender}`;
      conversationContext = emails;
      
    } else if (mode === 'Messaging') {
      const contactEl = document.querySelector('header span[title], [class*="ChatHeader"] span, [class*="chat-header"]');
      const contactName = contactEl ? (contactEl.getAttribute('title') || contactEl.innerText.trim()) : 'Unknown Contact';
      
      pageContext = `Platform: ${window.location.hostname}\nActive Contact: ${contactName}`;
      
      let messages = [];
      const bubbleSelector = '.message-in, .message-out, [class*="message-in"], [class*="message-out"], [data-pre-plain-text]';
      const msgElements = Array.from(document.querySelectorAll(bubbleSelector));
      
      if (msgElements.length > 0) {
        const recentMsgs = msgElements.slice(-15);
        recentMsgs.forEach(el => {
          const textEl = el.querySelector('.copyable-text span, [class*="message-text"], span');
          const text = textEl ? textEl.innerText.trim() : el.innerText.trim();
          if (text) {
            const isMe = !(el.classList.contains('message-in') || el.className.includes('message-in'));
            const senderTag = isMe ? 'Me' : 'Them';
            messages.push(`${senderTag}: ${text}`);
          }
        });
      }
      
      if (messages.length === 0) {
        const chatPane = document.querySelector('[class*="chat-body"], [class*="conversation"], [role="application"]') || document.body;
        const lines = chatPane.innerText.split('\n').filter(l => l.trim().length > 0);
        messages = lines.slice(-15).map(l => `Line: ${l}`);
      }
      
      conversationContext = messages.join('\n').slice(0, 3000);
      
    } else if (mode === 'Jobs') {
      const jobDesc = document.querySelector('.job-description') || document.querySelector('[class*="description"]') || document.body;
      pageContext = `Job Posting: ${document.title}\nDetails:\n${jobDesc.innerText.slice(0, 3500)}`;
      conversationContext = "";
      
    } else {
      const title = document.querySelector('h1')?.innerText || document.title;
      const paragraphs = Array.from(document.querySelectorAll('p')).slice(0, 15).map(p => p.innerText).join('\n');
      pageContext = `Title: ${title}\nContent Excerpts:\n${paragraphs}`.slice(0, 4000);
      conversationContext = "";
    }

    console.log(`[Shelby] Extracted Context: pageContext length = ${pageContext.length}, conversationContext length = ${conversationContext.length}`);
    return { page_context: pageContext, conversation_context: conversationContext };
  }

  // Note: Message listener registered early at the top of content.js

  window.addEventListener('message', async (event) => {
    if (event.origin !== `chrome-extension://${chrome.runtime.id}`) return;

    const msg = event.data;
    if (msg.type === 'SHELBY_CLOSE_PANEL') {
      togglePanel(false);
    } else if (msg.type === 'SHELBY_REQUEST_SCRAPE') {
      const selectedText = window.getSelection().toString().trim();
      const { page_context, conversation_context } = await scrapePageContent();
      
      iframe.contentWindow.postMessage({
        type: 'SHELBY_SEND_SCRAPED_DATA',
        payload: {
          url: window.location.href,
          title: document.title,
          page_context,
          conversation_context: conversation_context || null,
          selectedText: selectedText || null
        }
      }, '*');
    } else if (msg.type === 'SHELBY_INSERT_REPLY') {
      insertTextAtCursor(msg.payload.text);
    } else if (msg.type === 'SHELBY_UPDATE_MASCOT_VISUAL') {
      if (window.ShelbyMascot) {
        window.ShelbyMascot.setVisualState(msg.payload.state);
      }
    }
  });

})();
