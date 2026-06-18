// mascot.js - Shelby Mascot Button Injection and Management

window.ShelbyMascot = {
  element: null,
  badgeElement: null,
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
        z-index: 9999990;
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

      /* Badge style */
      .shelby-mascot-badge {
        position: absolute;
        bottom: 50px;
        right: 50%;
        transform: translateX(50%);
        background-color: #2ED573;
        color: white;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        font-size: 11px;
        font-weight: bold;
        padding: 4px 8px;
        border-radius: 12px;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        border: 1.5px solid white;
        pointer-events: none;
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
    icon.innerHTML = '🛡️'; // Default Shelby shield representation

    const badge = document.createElement('div');
    badge.className = 'shelby-mascot-badge';
    badge.id = 'shelby-mascot-badge-id';
    badge.innerText = modeDetails.badgeText;

    circle.appendChild(icon);
    container.appendChild(circle);
    container.appendChild(badge);
    document.body.appendChild(container);

    this.element = container;
    this.badgeElement = badge;

    this.setupDragging();
  },

  updateBadge(text) {
    if (this.badgeElement) {
      this.badgeElement.innerText = text;
    }
  },

  setVisualState(state) {
    const circle = document.getElementById('shelby-mascot-circle-id');
    if (!circle) return;

    // Reset classes
    circle.className = 'shelby-mascot-circle';

    if (state === 'scanning') {
      circle.classList.add('shelby-scanning');
      document.querySelector('.shelby-mascot-icon').innerHTML = '🌀';
    } else if (state === 'safe') {
      circle.classList.add('shelby-safe');
      document.querySelector('.shelby-mascot-icon').innerHTML = '🛡️';
    } else if (state === 'warning') {
      circle.classList.add('shelby-warning');
      document.querySelector('.shelby-mascot-icon').innerHTML = '⚠️';
    } else if (state === 'danger') {
      circle.classList.add('shelby-danger');
      document.querySelector('.shelby-mascot-icon').innerHTML = '🚨';
    } else {
      document.querySelector('.shelby-mascot-icon').innerHTML = '🛡️';
    }
  },

  setupDragging() {
    const container = this.element;

    const onMouseDown = (e) => {
      // Ignore right clicks
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
      }

      let newX = this.elemStartX + dx;
      let newY = this.elemStartY + dy;

      // Keep inside boundaries
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
