/**
 * nav.js — PitchIQ shared navigation
 * Includes: top nav bar + grouped "All Tools" slide-out panel
 * To add a new tool: add an entry to NAV_LINKS below.
 */
(function () {

  const NAV_LINKS = [
    { href: 'index.html',                label: 'Home',              icon: '⚽', group: null },
    { href: 'fixture-ticker.html',       label: 'Fixture Ticker',    icon: '📊', group: 'Fixtures & Planning' },
    { href: 'captain-picker.html',       label: 'Captain Picker',    icon: '⚡', group: 'Picks & Transfers' },
    { href: 'player-scout.html',         label: 'Player Scout',      icon: '🔍', group: 'Picks & Transfers' },
    { href: 'differential-finder.html',  label: 'Differentials',     icon: '💎', group: 'Picks & Transfers' },
    { href: 'value-tracker.html',        label: 'Transfer Planner',  icon: '💰', group: 'Picks & Transfers' },
    { href: 'hit-calculator.html',       label: 'Hit Calculator',    icon: '🎯', group: 'Picks & Transfers' },
    { href: 'gw-live.html',              label: 'GW Live',           icon: '🔴', group: 'My Team' },
    { href: 'my-team.html',              label: 'My Team',           icon: '👕', group: 'My Team' },
    { href: 'chip-advisor.html',         label: 'Chip Advisor',      icon: '🃏', group: 'My Team' },
    { href: 'template-trap.html',        label: 'Template Trap',     icon: '🧬', group: 'My Team' },
    { href: 'methodology.html',          label: 'How it works',      icon: '📖', group: null },
  ];

  const currentFile = window.location.pathname.split('/').pop() || 'index.html';

  // ── Styles ───────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* ── TOP NAV ── */
    #pitchiq-nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 500;
      height: 56px; display: flex; align-items: center;
      justify-content: space-between; padding: 0 24px;
      background: rgba(13,17,23,0.93); backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(255,255,255,0.07);
      font-family: 'DM Sans', sans-serif; box-sizing: border-box;
    }
    #pitchiq-nav * { box-sizing: border-box; }

    .piq-logo { display:flex; align-items:center; gap:8px; text-decoration:none; flex-shrink:0; }
    .piq-logo:hover .piq-logo-mark { background:#2ecc71; }
    .piq-logo-mark {
      width:28px; height:28px; background:#27ae60; border-radius:7px;
      display:flex; align-items:center; justify-content:center;
      font-family:'Bebas Neue',sans-serif; font-size:16px; color:#0d1117;
      transition:background 0.15s;
    }
    .piq-logo-text { font-family:'Bebas Neue',sans-serif; font-size:20px; letter-spacing:2px; color:#f0ece3; }
    .piq-logo-text span { color:#27ae60; }

    .piq-nav-links {
      display:flex; align-items:center; gap:2px; list-style:none; margin:0; padding:0;
    }
    .piq-nav-links a {
      display:flex; align-items:center; gap:5px; padding:5px 12px; border-radius:8px;
      text-decoration:none; font-size:12px; font-weight:500;
      color:rgba(240,236,227,0.5); transition:color 0.15s,background 0.15s;
      white-space:nowrap;
    }
    .piq-nav-links a:hover { color:#f0ece3; background:rgba(255,255,255,0.05); }
    .piq-nav-links a.active { color:#f0ece3; background:rgba(255,255,255,0.07); }
    .piq-nav-links .ni { font-size:13px; line-height:1; }

    /* ── ALL TOOLS BUTTON in nav ── */
    .piq-tools-btn {
      display:flex; align-items:center; gap:6px;
      padding:6px 14px; border-radius:8px;
      background:rgba(39,174,96,0.12); border:1px solid rgba(39,174,96,0.22);
      color:#2ecc71; font-size:12px; font-weight:600; cursor:pointer;
      font-family:'DM Sans',sans-serif; transition:all 0.15s;
      white-space:nowrap; letter-spacing:0.2px;
    }
    .piq-tools-btn:hover, .piq-tools-btn.open {
      background:rgba(39,174,96,0.2); border-color:rgba(39,174,96,0.4); color:#fff;
    }

    /* ── HOME BUTTON (mobile only) ── */
    .piq-home-btn {
      display:none; align-items:center; gap:5px;
      padding:5px 10px; border-radius:8px;
      background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08);
      color:rgba(240,236,227,0.6); font-size:11px; font-weight:500;
      text-decoration:none; font-family:'DM Sans',sans-serif;
      transition:all 0.15s; white-space:nowrap;
    }
    .piq-home-btn:hover { color:#f0ece3; background:rgba(255,255,255,0.09); }

    /* ── HAMBURGER (mobile) ── */
    .piq-hamburger {
      display:none; background:none; border:none;
      color:rgba(240,236,227,0.7); cursor:pointer; padding:6px;
      flex-direction:column; gap:5px; align-items:center; justify-content:center;
      width:36px; height:36px; border-radius:8px;
      transition:background 0.15s;
    }
    .piq-hamburger:hover { background:rgba(255,255,255,0.07); }
    .piq-hamburger span {
      display:block; width:18px; height:2px;
      background:currentColor; border-radius:2px;
      transition:transform 0.2s, opacity 0.2s;
    }

    /* ── MOBILE DRAWER ── */
    .piq-mobile-drawer {
      display:none; position:fixed;
      top:56px; left:0; right:0; bottom:0;
      background:rgba(13,17,23,0.99);
      z-index:498; flex-direction:column;
      overflow-y:auto; padding:12px 16px 24px;
    }
    .piq-mobile-drawer.open { display:flex; }
    .piq-mobile-drawer a {
      display:flex; align-items:center; gap:10px;
      padding:10px 14px; border-radius:8px;
      text-decoration:none; font-size:14px; font-weight:500;
      color:rgba(240,236,227,0.6); transition:color 0.15s,background 0.15s;
      font-family:'DM Sans',sans-serif;
    }
    .piq-mobile-drawer a:hover, .piq-mobile-drawer a.active {
      color:#f0ece3; background:rgba(255,255,255,0.06);
    }
    .piq-mobile-drawer .piq-drawer-group {
      font-family:'DM Mono',monospace; font-size:9px; letter-spacing:1.8px;
      text-transform:uppercase; color:#6b7280;
      padding:14px 14px 4px; margin-top:4px;
    }

    /* ── TOOLS PANEL (slide-out) ── */
    #piq-tools-overlay {
      display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45);
      z-index:550; backdrop-filter:blur(2px);
    }
    #piq-tools-overlay.open { display:block; }

    #piq-tools-panel {
      position:fixed; top:0; right:-340px; bottom:0; width:320px;
      background:#161b22; border-left:1px solid rgba(255,255,255,0.08);
      z-index:551; transition:right 0.28s cubic-bezier(0.4,0,0.2,1);
      display:flex; flex-direction:column; font-family:'DM Sans',sans-serif;
      overflow:hidden;
    }
    #piq-tools-panel.open { right:0; }

    .piq-panel-head {
      display:flex; align-items:center; justify-content:space-between;
      padding:0 20px; height:56px; flex-shrink:0;
      border-bottom:1px solid rgba(255,255,255,0.07);
      background:rgba(13,17,23,0.6);
    }
    .piq-panel-title {
      font-family:'Bebas Neue',sans-serif; font-size:18px;
      letter-spacing:2px; color:#f0ece3;
    }
    .piq-panel-title span { color:#27ae60; }
    .piq-panel-close {
      width:28px; height:28px; border-radius:6px; border:none;
      background:rgba(255,255,255,0.06); color:rgba(240,236,227,0.6);
      font-size:14px; cursor:pointer; display:flex; align-items:center;
      justify-content:center; transition:all 0.15s;
    }
    .piq-panel-close:hover { background:rgba(255,255,255,0.12); color:#f0ece3; }

    .piq-panel-body { overflow-y:auto; flex:1; padding:12px 12px 24px; }

    .piq-panel-group {
      font-family:'DM Mono',monospace; font-size:9px; letter-spacing:1.8px;
      text-transform:uppercase; color:#6b7280;
      padding:14px 8px 6px;
    }

    .piq-panel-link {
      display:flex; align-items:center; gap:10px;
      padding:10px 12px; border-radius:10px; text-decoration:none;
      font-size:13px; font-weight:500; color:rgba(240,236,227,0.6);
      transition:color 0.15s,background 0.15s; margin-bottom:2px;
    }
    .piq-panel-link:hover { color:#f0ece3; background:rgba(255,255,255,0.06); }
    .piq-panel-link.active {
      color:#f0ece3; background:rgba(39,174,96,0.1);
      border:1px solid rgba(39,174,96,0.18);
    }
    .piq-panel-link .pi { font-size:16px; flex-shrink:0; }
    .piq-panel-link .pl { flex:1; }
    .piq-panel-link .pa {
      font-size:9px; font-family:'DM Mono',monospace;
      padding:2px 6px; border-radius:3px;
      background:rgba(39,174,96,0.15); color:#2ecc71; letter-spacing:0.3px;
    }

    .piq-panel-footer {
      padding:16px 20px; border-top:1px solid rgba(255,255,255,0.07);
      flex-shrink:0;
    }
    .piq-panel-footer a {
      display:block; text-align:center; padding:10px;
      background:rgba(39,174,96,0.1); border:1px solid rgba(39,174,96,0.2);
      border-radius:8px; text-decoration:none;
      font-size:12px; font-weight:600; color:#2ecc71;
      transition:all 0.15s;
    }
    .piq-panel-footer a:hover { background:rgba(39,174,96,0.2); color:#fff; }

    body { padding-top:56px !important; }

    @media (max-width:760px) {
      #pitchiq-nav { padding:0 14px; }
      .piq-nav-links { display:none; }
      .piq-home-btn { display:flex; }
      .piq-hamburger { display:flex; }
      .piq-tools-btn { display:none; }
      #piq-tools-panel { width:100%; right:-100%; }
    }
  `;
  document.head.appendChild(style);

  // ── Group tools for panel ────────────────────────────────────────────────────
  const TOOLS_ONLY = NAV_LINKS.filter(l => l.group !== null && l.href !== 'index.html' && l.href !== 'methodology.html');
  const groups = {};
  TOOLS_ONLY.forEach(l => {
    if (!groups[l.group]) groups[l.group] = [];
    groups[l.group].push(l);
  });

  // Panel body HTML
  const panelBodyHtml = Object.entries(groups).map(([gname, links]) => {
    const linksHtml = links.map(l => {
      const isActive = l.href.split('/').pop() === currentFile;
      return `<a href="${l.href}" class="piq-panel-link${isActive ? ' active' : ''}">
        <span class="pi">${l.icon}</span>
        <span class="pl">${l.label}</span>
        ${isActive ? '<span class="pa">Current</span>' : ''}
      </a>`;
    }).join('');
    return `<div class="piq-panel-group">${gname}</div>${linksHtml}`;
  }).join('');

  // Primary nav links (top bar desktop)
  const PRIMARY = ['index.html','fixture-ticker.html','captain-picker.html','player-scout.html','gw-live.html','my-team.html'];
  const primaryHtml = NAV_LINKS
    .filter(l => PRIMARY.includes(l.href))
    .map(l => {
      const isActive = l.href.split('/').pop() === currentFile;
      return `<li><a href="${l.href}"${isActive ? ' class="active"' : ''}>
        <span class="ni">${l.icon}</span>${l.label}
      </a></li>`;
    }).join('');

  // Mobile drawer HTML (all links grouped)
  const mobileDrawerHtml = (() => {
    const home = NAV_LINKS.filter(l => l.href === 'index.html');
    const about = NAV_LINKS.filter(l => l.href === 'methodology.html');
    const grouped = Object.entries(groups).map(([gname, links]) => {
      const ls = links.map(l => {
        const isActive = l.href.split('/').pop() === currentFile;
        return `<a href="${l.href}"${isActive ? ' class="active"' : ''}>
          <span>${l.icon}</span>${l.label}
        </a>`;
      }).join('');
      return `<div class="piq-drawer-group">${gname}</div>${ls}`;
    }).join('');
    const homeHtml = home.map(l => `<a href="${l.href}"${l.href.split('/').pop()===currentFile?' class="active"':''}><span>${l.icon}</span>${l.label}</a>`).join('');
    const aboutHtml = about.map(l => `<a href="${l.href}"${l.href.split('/').pop()===currentFile?' class="active"':''}><span>${l.icon}</span>${l.label}</a>`).join('');
    return homeHtml + grouped + `<div class="piq-drawer-group">Info</div>` + aboutHtml;
  })();

  // ── Build & mount DOM ────────────────────────────────────────────────────────
  // Top nav
  const nav = document.createElement('nav');
  nav.id = 'pitchiq-nav';
  nav.innerHTML = `
    <a href="index.html" class="piq-logo">
      <div class="piq-logo-mark">P</div>
      <span class="piq-logo-text">PITCH<span>IQ</span></span>
    </a>
    <ul class="piq-nav-links">${primaryHtml}</ul>
    <div style="display:flex;align-items:center;gap:8px">
      <a href="index.html" class="piq-home-btn">⚽ Home</a>
      <button class="piq-tools-btn" id="piqToolsBtn" aria-label="All tools">
        ⚡ All Tools
      </button>
      <button class="piq-hamburger" id="piqHamburger" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  `;

  // Tools panel overlay
  const overlay = document.createElement('div');
  overlay.id = 'piq-tools-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  // Tools panel
  const panel = document.createElement('div');
  panel.id = 'piq-tools-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'All tools');
  panel.innerHTML = `
    <div class="piq-panel-head">
      <span class="piq-panel-title">ALL <span>TOOLS</span></span>
      <button class="piq-panel-close" id="piqPanelClose" aria-label="Close">✕</button>
    </div>
    <div class="piq-panel-body">${panelBodyHtml}</div>
    <div class="piq-panel-footer">
      <a href="index.html">← Back to homepage</a>
    </div>
  `;

  // Mobile drawer
  const drawer = document.createElement('div');
  drawer.className = 'piq-mobile-drawer';
  drawer.id = 'piqMobileDrawer';
  drawer.innerHTML = mobileDrawerHtml;

  // Insert all into DOM
  document.body.insertBefore(drawer,  document.body.firstChild);
  document.body.insertBefore(overlay, document.body.firstChild);
  document.body.insertBefore(panel,   document.body.firstChild);
  document.body.insertBefore(nav,     document.body.firstChild);

  // ── Event handling ───────────────────────────────────────────────────────────
  const toolsBtn   = document.getElementById('piqToolsBtn');
  const panelClose = document.getElementById('piqPanelClose');
  const hamburger  = document.getElementById('piqHamburger');

  function openPanel() {
    panel.classList.add('open');
    overlay.classList.add('open');
    toolsBtn.classList.add('open');
    toolsBtn.innerHTML = '✕ Close';
    document.body.style.overflow = 'hidden';
    // Close mobile drawer if open
    drawer.classList.remove('open');
    closeDrawer();
  }
  function closePanel() {
    panel.classList.remove('open');
    overlay.classList.remove('open');
    toolsBtn.classList.remove('open');
    toolsBtn.innerHTML = '⚡ All Tools';
    document.body.style.overflow = '';
  }
  function openDrawer() {
    drawer.classList.add('open');
    // Animate to X
    const spans = hamburger.querySelectorAll('span');
    if (spans.length === 3) {
      spans[0].style.transform = 'translateY(7px) rotate(45deg)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'translateY(-7px) rotate(-45deg)';
    }
    document.body.style.overflow = 'hidden';
    closePanel();
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    // Reset hamburger
    const spans = hamburger.querySelectorAll('span');
    if (spans.length === 3) {
      spans[0].style.transform = '';
      spans[1].style.opacity = '';
      spans[2].style.transform = '';
    }
    document.body.style.overflow = '';
  }

  toolsBtn.addEventListener('click', () => {
    if (panel.classList.contains('open')) { closePanel(); }
    else { openPanel(); }
  });
  panelClose.addEventListener('click', closePanel);
  overlay.addEventListener('click', () => { closePanel(); closeDrawer(); });

  hamburger.addEventListener('click', () => {
    if (drawer.classList.contains('open')) { closeDrawer(); }
    else { openDrawer(); }
  });

  // Close everything on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePanel(); closeDrawer(); }
  });

  // Close drawer when a link is clicked
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', closeDrawer));
  panel.querySelectorAll('a').forEach(a => a.addEventListener('click', closePanel));

})();

// ── DEADLINE BAR + TEAM ID PERSISTENCE ──────────────────────────────────────
(function() {

  // ── 1. Team ID persistence across all tools ─────────────────────────────────
  // Pages that use a team ID input
  const TEAM_ID_KEY = 'piq_team_id';

  function saveTeamId(id) {
    try { localStorage.setItem(TEAM_ID_KEY, id); } catch(e) {}
  }

  function getSavedTeamId() {
    try { return localStorage.getItem(TEAM_ID_KEY) || ''; } catch(e) { return ''; }
  }

  // Auto-fill any team ID input on the page, and save whenever it changes
  function wireTeamIdInputs() {
    const saved = getSavedTeamId();
    const inputs = document.querySelectorAll(
      '#teamIdInput, #managerTeamId, #teamId, input[placeholder*="Team ID"], input[placeholder*="team ID"], input[placeholder*="1234567"]'
    );
    inputs.forEach(input => {
      // Pre-fill if empty and we have a saved value
      if (saved && !input.value) input.value = saved;
      // Save on change
      input.addEventListener('change', () => {
        if (input.value && !isNaN(+input.value)) saveTeamId(input.value.trim());
      });
      input.addEventListener('blur', () => {
        if (input.value && !isNaN(+input.value)) saveTeamId(input.value.trim());
      });
    });
  }

  // Wire on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireTeamIdInputs);
  } else {
    wireTeamIdInputs();
    // Also wire after a short delay in case inputs are rendered by JS
    setTimeout(wireTeamIdInputs, 800);
  }

  // ── 2. Deadline bar ──────────────────────────────────────────────────────────
  // Skip on homepage — it has its own GW bar
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  if (currentPage === 'index.html' || currentPage === '') return;

  // Fetch deadline from FPL API
  async function fetchDeadline() {
    try {
      const res = await fetch('api/fpl-bootstrap');
      if (!res.ok) throw new Error('proxy');
      const data = await res.json();
      return parseDeadline(data);
    } catch(e) {}
    return null;
  }

  function parseDeadline(data) {
    const next = data.events?.find(e => e.is_next) || data.events?.find(e => e.is_current);
    if (!next) return null;
    return { gw: next.id, deadline: new Date(next.deadline_time) };
  }

  function buildBar(gw, deadline) {
    const bar = document.createElement('div');
    bar.id = 'piq-deadline-bar';

    const barStyle = document.createElement('style');
    barStyle.textContent = `
      #piq-deadline-bar {
        position: fixed; top: 56px; left: 0; right: 0; z-index: 490;
        background: rgba(22,27,34,0.97);
        border-bottom: 1px solid rgba(255,255,255,0.07);
        display: flex; align-items: center; justify-content: center;
        gap: 20px; padding: 0 20px; height: 36px;
        font-family: 'DM Mono', monospace; font-size: 11px;
        backdrop-filter: blur(12px); transition: background 0.3s;
      }
      #piq-deadline-bar.urgent { background: rgba(120,20,20,0.97); border-bottom-color: rgba(230,57,70,0.3); }
      #piq-deadline-bar.soon   { background: rgba(100,70,0,0.97); border-bottom-color: rgba(240,180,41,0.3); }
      .piq-db-gw   { color: #2ecc71; font-weight: 600; letter-spacing: 0.5px; }
      .piq-db-sep  { color: rgba(255,255,255,0.15); }
      .piq-db-lbl  { color: rgba(255,255,255,0.4); }
      .piq-db-time { color: #f0ece3; font-weight: 600; letter-spacing: 0.5px; min-width: 90px; }
      .piq-db-time.urgent { color: #f87171; }
      .piq-db-time.soon   { color: #f0b429; }
      .piq-db-link {
        color: rgba(255,255,255,0.35); text-decoration: none; font-size: 10px;
        padding: 3px 8px; border: 1px solid rgba(255,255,255,0.1);
        border-radius: 4px; transition: all 0.15s; white-space: nowrap;
      }
      .piq-db-link:hover { color: #f0ece3; border-color: rgba(255,255,255,0.25); }
      .piq-db-dismiss {
        position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
        background: none; border: none; color: rgba(255,255,255,0.2);
        cursor: pointer; font-size: 14px; padding: 4px; line-height: 1;
        transition: color 0.15s;
      }
      .piq-db-dismiss:hover { color: rgba(255,255,255,0.5); }
      body { padding-top: 92px !important; }
      @media (max-width: 600px) {
        #piq-deadline-bar { gap: 10px; font-size: 10px; }
        .piq-db-link { display: none; }
        body { padding-top: 92px !important; }
      }
    `;
    document.head.appendChild(barStyle);

    bar.innerHTML = `
      <span class="piq-db-gw">GW${gw}</span>
      <span class="piq-db-sep">|</span>
      <span class="piq-db-lbl">Deadline</span>
      <span class="piq-db-time" id="piqDbTime">...</span>
      <span class="piq-db-sep">|</span>
      <a href="captain-picker.html" class="piq-db-link">Captain Picker</a>
      <a href="fixture-ticker.html" class="piq-db-link">Fixture Ticker</a>
      <a href="hit-calculator.html" class="piq-db-link">Hit Calculator</a>
      <button class="piq-db-dismiss" id="piqDbDismiss" aria-label="Dismiss">&#x2715;</button>
    `;

    document.body.insertBefore(bar, document.body.children[4] || null);

    // Dismiss — hides for this session only
    document.getElementById('piqDbDismiss').addEventListener('click', () => {
      bar.style.display = 'none';
      document.body.style.paddingTop = '56px';
      try { sessionStorage.setItem('piq_bar_dismissed', '1'); } catch(e) {}
    });

    // Check if dismissed this session
    try {
      if (sessionStorage.getItem('piq_bar_dismissed') === '1') {
        bar.style.display = 'none';
        document.body.style.paddingTop = '56px';
        return;
      }
    } catch(e) {}

    // Live countdown
    function tick() {
      const diff = deadline - Date.now();
      const el   = document.getElementById('piqDbTime');
      if (!el) return;

      if (diff <= 0) {
        el.textContent = 'Deadline passed';
        el.className = 'piq-db-time urgent';
        bar.classList.add('urgent');
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hrs  = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      let txt, cls = '';
      if (days > 1) {
        txt = `${days}d ${hrs}h ${mins}m`;
      } else if (diff > 3600000) {
        txt = `${hrs}h ${mins}m`;
        if (days === 0 && hrs < 6) { cls = 'soon'; bar.classList.add('soon'); }
      } else {
        txt = `${mins}m ${secs}s`;
        cls = 'urgent';
        bar.classList.remove('soon');
        bar.classList.add('urgent');
      }

      el.textContent = txt;
      el.className = 'piq-db-time' + (cls ? ' ' + cls : '');
    }

    tick();
    setInterval(tick, 1000);
  }

  // Fetch and build
  fetchDeadline().then(result => {
    if (result) buildBar(result.gw, result.deadline);
  });

})();
