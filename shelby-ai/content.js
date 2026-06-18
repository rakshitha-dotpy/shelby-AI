// content.js - V2.2 Browser Native Integration Script for Shelby AI

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
      // Background brightness check
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
      
      // Look for a colorful accent button/link color
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
            // Saturated color filter (skips grayscale)
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
      console.warn("Theme parsing error:", e);
    }
    
    return { isDark, accentColor, dominantBg };
  }

  // 3. Inject Iframe Container for Side Panel
  const iframe = document.createElement('iframe');
  iframe.id = 'shelby-ai-panel';
  iframe.src = chrome.runtime.getURL('panel.html');
  
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
      box-shadow: none;
      pointer-events: auto;
    }
    #shelby-ai-panel.shelby-panel-open {
      transform: translateX(0);
      box-shadow: -10px 0 35px rgba(0, 0, 0, 0.15);
    }
  `;
  document.head.appendChild(iframeStyle);
  document.body.appendChild(iframe);

  // 4. Initialize Mascot
  if (window.ShelbyMascot) {
    window.ShelbyMascot.create({ mode, badgeText: 'Shelby AI' });
    
    // Subtle float notice after 1.5 seconds for recognized pages
    if (mode !== 'General') {
      setTimeout(() => {
        window.ShelbyMascot.showNotice();
      }, 1500);
    }
  }

  let isPanelOpen = false;

  // Toggle Panel open/close
  function togglePanel(open, focusInput = false, analyzeImage = null) {
    isPanelOpen = open;
    if (open) {
      iframe.classList.add('shelby-panel-open');
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
      if (window.ShelbyMascot) {
        window.ShelbyMascot.setVisualState('idle');
      }
    }
  }

  // Click mascot button behavior
  const mascotBtn = document.getElementById('shelby-mascot-btn');
  if (mascotBtn) {
    mascotBtn.addEventListener('click', () => {
      if (window.ShelbyMascot && window.ShelbyMascot.hasMoved) return;
      togglePanel(!isPanelOpen);
    });
  }

  // Notice bubble click
  const noticeEl = document.getElementById('shelby-mascot-notice-id');
  if (noticeEl) {
    noticeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel(true);
    });
  }

  // Keyboard shortcut Ctrl+Shift+Space (Command Palette Toggle)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'Space') {
      e.preventDefault();
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

  // 5. Scrape DOM Contents (Respected by Privacy Flag)
  async function scrapePageContent() {
    // Check global privacy flag first
    const config = await chrome.storage.local.get('shelby_vision');
    const visionOn = config.shelby_vision !== false;
    
    if (!visionOn) {
      console.log("Shelby Vision is OFF: Scraping disabled.");
      return "Shelby Vision is currently disabled. Shelby cannot read the page content until enabled.";
    }

    let scrapedText = "";
    
    if (mode === 'Shopping') {
      const priceSelectors = ['.a-price-whole', '.selling-price', '.pdp-price', '.price', '[data-testid="price-display"]'];
      let price = '';
      for (const s of priceSelectors) {
        const el = document.querySelector(s);
        if (el && el.innerText.trim()) {
          price = el.innerText.trim();
          break;
        }
      }
      const reviewText = document.body.innerText.slice(0, 4000);
      scrapedText = `Product: ${document.title}\nPrice: ${price}\nReview Excerpts:\n${reviewText}`;
    } else if (mode === 'Email') {
      const subject = document.querySelector('h2.hP')?.innerText || 'Unknown Subject';
      const body = document.querySelector('.a3s')?.innerText || document.body.innerText.slice(0, 4000);
      scrapedText = `Subject: ${subject}\nEmail Details:\n${body}`;
    } else if (mode === 'Messaging') {
      const chatPane = document.querySelector('[data-tab="8"]') || document.body;
      const visibleMsg = chatPane.innerText.slice(-3000);
      scrapedText = `Conversation Log:\n${visibleMsg}`;
    } else if (mode === 'Jobs') {
      const jobDesc = document.querySelector('.job-description') || document.querySelector('[class*="description"]') || document.body;
      scrapedText = `Job Posting: ${document.title}\nDescription details:\n${jobDesc.innerText.slice(0, 4000)}`;
    } else {
      // General/Research/News
      const title = document.querySelector('h1')?.innerText || document.title;
      const paragraphs = Array.from(document.querySelectorAll('p')).slice(0, 15).map(p => p.innerText).join('\n');
      scrapedText = `Title: ${title}\nContent Paragraphs:\n${paragraphs}`;
    }

    return scrapedText.slice(0, 4500);
  }

  // 6. Listen for messages from background/panel
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SHELBY_ANALYZE_IMAGE') {
      // Open panel and load image vision analysis
      togglePanel(true, false, msg.imageUrl);
    }
  });

  window.addEventListener('message', async (event) => {
    if (event.origin !== `chrome-extension://${chrome.runtime.id}`) return;

    const msg = event.data;
    if (msg.type === 'SHELBY_CLOSE_PANEL') {
      togglePanel(false);
    } else if (msg.type === 'SHELBY_REQUEST_SCRAPE') {
      const selectedText = window.getSelection().toString().trim();
      const scrapedText = await scrapePageContent();
      iframe.contentWindow.postMessage({
        type: 'SHELBY_SEND_SCRAPED_DATA',
        payload: {
          url: window.location.href,
          title: document.title,
          scrapedText,
          selectedText: selectedText || null
        }
      }, '*');
    } else if (msg.type === 'SHELBY_INSERT_REPLY') {
      // Insert reply text at cursor
      insertTextAtCursor(msg.payload.text);
    } else if (msg.type === 'SHELBY_UPDATE_MASCOT_VISUAL') {
      if (window.ShelbyMascot) {
        window.ShelbyMascot.setVisualState(msg.payload.state);
      }
    }
  });

})();
