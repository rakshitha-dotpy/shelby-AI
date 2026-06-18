// mascot.js - Shelby Mascot Button Injection and Management
// Implements V2.2 subtle floating notice bubbles and dragging boundaries.

window.ShelbyMascot = {
  element: null,
  badgeElement: null,
  noticeElement: null,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  elemStartX: 0,
  elemStartY: 0,
  hasMoved: false,

  create(modeDetails) {
    if (this.element) return;

    // Inject Mascot Styling
    const style = document.createElement('style');
    style.id = 'shelby-mascot-styles';
    style.textContent = `
      .shelby-mascot-container {
        position: fixed;
        bottom: 30px;
        right: 30px;
        width: 60px;
        height: 60px;
        z-index: 2147483640;
        cursor: grab;
        user-select: none;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .shelby-mascot-container:active {
        cursor: grabbing;
      }
      .shelby-mascot-circle {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: linear-gradient(135deg, #6C63FF 0%, #FF6584 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 15px rgba(108, 99, 255, 0.4);
        position: relative;
        animation: shelby-pulse 2s infinite ease-in-out;
        border: 2px solid #ffffff;
      }
      .shelby-mascot-icon {
        font-size: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
      }
      
      /* Dynamic Glows */
      .shelby-mascot-circle.shelby-safe {
        box-shadow: 0 0 20px #2ED573, 0 4px 15px rgba(46, 213, 115, 0.4);
      }
      .shelby-mascot-circle.shelby-warning {
        box-shadow: 0 0 20px #FFA502, 0 4px 15px rgba(255, 165, 2, 0.4);
      }
      .shelby-mascot-circle.shelby-danger {
        box-shadow: 0 0 20px #FF4757, 0 4px 15px rgba(255, 71, 87, 0.4);
      }
      .shelby-mascot-circle.shelby-scanning {
        animation: shelby-spin 1s infinite linear;
      }

      /* Subtle Notification Speech Bubble */
      .shelby-mascot-notice {
        position: absolute;
        bottom: 12px;
        right: 75px;
        background-color: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(12px);
        color: #2F3542;
        font-family: 'Inter', sans-serif;
        font-size: 11px;
        font-weight: 700;
        padding: 8px 14px;
        border-radius: 16px 16px 4px 16px;
        white-space: nowrap;
        box-shadow: 0 4px 15px rgba(0,0,0,0.12);
        border: 1.5px solid #EAEBFF;
        pointer-events: auto;
        cursor: pointer;
        opacity: 0;
        transform: translateX(15px);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      .shelby-mascot-notice.visible {
        opacity: 1;
        transform: translateX(0);
      }
      .shelby-mascot-notice:hover {
        transform: scale(1.05);
        background-color: #ffffff;
      }

      /* Animated indicator */
      .shelby-mascot-indicator {
        position: absolute;
        top: -2px;
        right: -2px;
        width: 12px;
        height: 12px;
        background-color: #FF4757;
        border: 2px solid white;
        border-radius: 50%;
        display: none;
        animation: shelby-indicator-pulse 1.5s infinite;
      }
      .shelby-mascot-indicator.active {
        display: block;
      }

      /* Animations */
      @keyframes shelby-pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      @keyframes shelby-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes shelby-indicator-pulse {
        0% { transform: scale(0.9); opacity: 1; }
        50% { transform: scale(1.2); opacity: 0.8; }
        100% { transform: scale(0.9); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    // Create Mascot element
    const container = document.createElement('div');
    container.className = 'shelby-mascot-container';
    container.id = 'shelby-mascot-btn';

    const circle = document.createElement('div');
    circle.className = 'shelby-mascot-circle';
    circle.id = 'shelby-mascot-circle-id';

    const icon = document.createElement('div');
    icon.className = 'shelby-mascot-icon';
    icon.innerHTML = '🛡️';

    const indicator = document.createElement('div');
    indicator.className = 'shelby-mascot-indicator';
    indicator.id = 'shelby-mascot-indicator-id';

    const notice = document.createElement('div');
    notice.className = 'shelby-mascot-notice';
    notice.id = 'shelby-mascot-notice-id';
    notice.innerText = '🦊 Shelby noticed something';

    circle.appendChild(icon);
    container.appendChild(circle);
    container.appendChild(indicator);
    container.appendChild(notice);
    document.body.appendChild(container);

    this.element = container;
    this.noticeElement = notice;

    this.setupDragging();
  },

  showNotice() {
    if (this.noticeElement) {
      this.noticeElement.classList.add('visible');
      const indicator = document.getElementById('shelby-mascot-indicator-id');
      if (indicator) indicator.classList.add('active');
    }
  },

  hideNotice() {
    if (this.noticeElement) {
      this.noticeElement.classList.remove('visible');
      const indicator = document.getElementById('shelby-mascot-indicator-id');
      if (indicator) indicator.classList.remove('active');
    }
  },

  setVisualState(state) {
    const circle = document.getElementById('shelby-mascot-circle-id');
    const icon = document.querySelector('.shelby-mascot-icon');
    if (!circle || !icon) return;

    circle.className = 'shelby-mascot-circle';

    if (state === 'scanning') {
      circle.classList.add('shelby-scanning');
      icon.innerHTML = '🌀';
    } else if (state === 'safe') {
      circle.classList.add('shelby-safe');
      icon.innerHTML = '🛡️';
    } else if (state === 'warning') {
      circle.classList.add('shelby-warning');
      icon.innerHTML = '⚠️';
    } else if (state === 'danger') {
      circle.classList.add('shelby-danger');
      icon.innerHTML = '🚨';
    } else {
      icon.innerHTML = '🛡️';
    }
  },

  setupDragging() {
    const container = this.element;

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      
      this.isDragging = true;
      this.hasMoved = false;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      
      const rect = container.getBoundingClientRect();
      this.elemStartX = rect.left;
      this.elemStartY = rect.top;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!this.isDragging) return;
      
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        this.hasMoved = true;
        this.hideNotice(); // Hide speech bubble when dragged
      }

      let newX = this.elemStartX + dx;
      let newY = this.elemStartY + dy;

      const padding = 10;
      const maxX = window.innerWidth - 70;
      const maxY = window.innerHeight - 70;

      newX = Math.max(padding, Math.min(newX, maxX));
      newY = Math.max(padding, Math.min(newY, maxY));

      container.style.left = `${newX}px`;
      container.style.top = `${newY}px`;
      container.style.bottom = 'auto';
      container.style.right = 'auto';
    };

    const onMouseUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    container.addEventListener('mousedown', onMouseDown);
  }
};
