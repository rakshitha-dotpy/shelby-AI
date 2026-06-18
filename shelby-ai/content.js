// content.js - Injects Mascot & Side Panel, and performs page text scraping

(function() {
  // Prevent duplicate injections
  if (document.getElementById('shelby-ai-panel')) return;

  // 1. Detect Mode Based on URL
  const url = window.location.href;
  const hostname = window.location.hostname.toLowerCase();
  
  let mode = 'General Trust Mode';
  let badgeText = 'Safety Scan 🛡️';

  const shoppingDomains = ['amazon.in', 'flipkart.com', 'meesho.com', 'myntra.com', 'snapdeal.com', 'ajio.com'];
  const newsDomains = ['nytimes.com', 'bbc.com', 'bbc.co.uk', 'cnn.com', 'reuters.com', 'bloomberg.com', 'theguardian.com', 'forbes.com', 'wsj.com', 'indiatimes.com'];

  if (shoppingDomains.some(domain => hostname.includes(domain))) {
    mode = 'Shopping Mode';
    badgeText = 'Shop Mode 🛒';
  } else if (hostname.includes('mail.google.com')) {
    mode = 'Scam Mode';
    badgeText = 'Scam Mode 📧';
  } else if (hostname.includes('linkedin.com')) {
    mode = 'LinkedIn Trust Mode';
    badgeText = 'Trust Mode 💼';
  } else if (hostname.includes('wikipedia.org') || newsDomains.some(domain => hostname.includes(domain))) {
    // Both Wikipedia and News Sites map to Content Intelligence Mode
    mode = 'Content Intelligence Mode';
    badgeText = 'Content AI 🤖';
  }

  // 2. Inject Iframe Container for Side Panel
  const iframe = document.createElement('iframe');
  iframe.id = 'shelby-ai-panel';
  iframe.src = chrome.runtime.getURL('panel.html');
  
  // Style the iframe container
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

  // 3. Initialize Mascot
  if (window.ShelbyMascot) {
    window.ShelbyMascot.create({ mode, badgeText });
  }

  let isPanelOpen = false;

  // Toggle Panel open/close
  function togglePanel(open, isDemo = false) {
    isPanelOpen = open;
    if (open) {
      iframe.classList.add('shelby-panel-open');
      
      // Check for highlighted text selection
      const selectedText = window.getSelection().toString().trim();
      let activeMode = mode;
      let activeBadge = badgeText;
      
      // Override mode to Scam Mode if text is highlighted
      if (selectedText.length > 0 && !isDemo) {
        activeMode = 'Scam Mode';
        activeBadge = 'Scam Mode 📧';
      }

      if (window.ShelbyMascot) {
        window.ShelbyMascot.updateBadge(activeBadge);
      }

      // Let the iframe know it is open and what mode it should initialize
      setTimeout(() => {
        iframe.contentWindow.postMessage({
          type: 'SHELBY_PANEL_OPENED',
          payload: { 
            url: window.location.href, 
            mode: activeMode, 
            isDemo,
            selectedText: selectedText || null
          }
        }, '*');
      }, 100);
    } else {
      iframe.classList.remove('shelby-panel-open');
      if (window.ShelbyMascot) {
        window.ShelbyMascot.setVisualState('idle');
        window.ShelbyMascot.updateBadge(badgeText);
      }
    }
  }

  // Click mascot button behavior
  const mascotBtn = document.getElementById('shelby-mascot-btn');
  if (mascotBtn) {
    mascotBtn.addEventListener('click', (e) => {
      // If the mascot was dragged rather than clicked, ignore click
      if (window.ShelbyMascot && window.ShelbyMascot.hasMoved) {
        return;
      }
      togglePanel(!isPanelOpen);
    });
  }

  // Keyboard shortcut Ctrl+Shift+S globally (Demo Mode)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
      e.preventDefault();
      togglePanel(true, true); // Open in Demo Mode
    }
  });

  // 4. Scrape DOM Contents
  function scrapePageContent() {
    let scrapedText = "";
    
    if (mode === 'Shopping Mode') {
      const title = document.title;
      // Scrape potential prices
      const priceSelectors = [
        '.a-price-whole', '#priceblock_ourprice', '#priceblock_dealprice',
        '.price-sales', '.selling-price', '.pdp-price', '.price',
        '[data-testid="price-display"]'
      ];
      let price = '';
      for (const selector of priceSelectors) {
        const el = document.querySelector(selector);
        if (el && el.innerText.trim()) {
          price = el.innerText.trim();
          break;
        }
      }
      
      // Look for reviews
      const reviewText = document.body.innerText.slice(0, 5000);
      scrapedText = `Product Title: ${title}\nPrice: ${price}\nBody details:\n${reviewText}`;

    } else if (mode === 'Scam Mode') {
      // Gmail Scrape
      const subjectEl = document.querySelector('h2.hP');
      const senderEl = document.querySelector('.gD');
      const emailBodyEl = document.querySelector('.a3s');

      const subject = subjectEl ? subjectEl.innerText : 'Unknown Subject';
      const sender = senderEl ? `${senderEl.innerText} <${senderEl.getAttribute('email') || ''}>` : 'Unknown Sender';
      const body = emailBodyEl ? emailBodyEl.innerText : document.body.innerText.slice(0, 4000);

      scrapedText = `Subject: ${subject}\nSender: ${sender}\nEmail Body:\n${body}`;

    } else if (mode === 'LinkedIn Trust Mode') {
      const profileName = document.querySelector('.text-heading-xlarge')?.innerText || '';
      const tagline = document.querySelector('.text-body-medium')?.innerText || '';
      const bodyText = document.body.innerText.slice(0, 5000);
      scrapedText = `Profile Name: ${profileName}\nTagline: ${tagline}\nContent Details:\n${bodyText}`;

    } else {
      const title = document.querySelector('h1')?.innerText || document.title;
      const paragraphs = Array.from(document.querySelectorAll('p'))
        .slice(0, 10)
        .map(p => p.innerText)
        .join('\n');
      
      scrapedText = `Title: ${title}\nContent:\n${paragraphs}`;
    }

    // Strictly limit to 5000 characters to conserve API tokens
    return scrapedText.slice(0, 5000);
  }

  // 5. Secure message channel between host page and side panel iframe
  window.addEventListener('message', (event) => {
    // Only accept messages from our own extension files
    if (event.origin !== `chrome-extension://${chrome.runtime.id}`) return;

    const msg = event.data;
    if (msg.type === 'SHELBY_CLOSE_PANEL') {
      togglePanel(false);
    } else if (msg.type === 'SHELBY_REQUEST_SCRAPE') {
      const selectedText = window.getSelection().toString().trim();
      const scrapedText = scrapePageContent();
      iframe.contentWindow.postMessage({
        type: 'SHELBY_SEND_SCRAPED_DATA',
        payload: {
          url: window.location.href,
          title: document.title,
          scrapedText,
          selectedText: selectedText || null
        }
      }, '*');
    } else if (msg.type === 'SHELBY_UPDATE_MASCOT_VISUAL') {
      // Update mascot visual glows based on score
      if (window.ShelbyMascot) {
        window.ShelbyMascot.setVisualState(msg.payload.state);
      }
    }
  });

})();
