/* ==============================================
   ADMIN CRM - Suds Away Pro Wash
   JavaScript Application Logic
   ============================================== */

(function () {
  'use strict';

  // ================================================
  // CONFIGURATION
  // ================================================
  const API_BASE = 'https://api.github.com';
  const CONTENT_PATH = 'data/content.json';
  const IMAGES_DIR = 'images';
  const BRANCH = 'main';

  // ================================================
  // STATE
  // ================================================
  let contentData = null;      // parsed content.json
  let contentSha = null;       // SHA of content.json (needed for updates)
  let originalData = null;     // deep clone for cancel/revert
  let currentSection = 'dashboard';

  // ================================================
  // DOM REFERENCES
  // ================================================
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const loginScreen = $('#login-screen');
  const appShell = $('#app-shell');
  const sidebar = $('#sidebar');
  const sidebarOverlay = $('#sidebar-overlay');
  const mainContent = $('#main-content');
  const loadingOverlay = $('#loading-overlay');
  const loadingText = $('#loading-text');
  const toastContainer = $('#toast-container');

  // ================================================
  // HELPERS
  // ================================================

  /** Get the stored GitHub token */
  function getToken() {
    return sessionStorage.getItem('gh_token') || '';
  }

  /** Get repo owner */
  function getOwner() {
    return localStorage.getItem('crm_repo_owner') || 'colsonrice';
  }

  /** Get repo name */
  function getRepoName() {
    return localStorage.getItem('crm_repo_name') || 'mike-powerwash-site';
  }

  /** Build API URL */
  function apiUrl(path) {
    return `${API_BASE}/repos/${getOwner()}/${getRepoName()}/contents/${path}`;
  }

  /** Common fetch headers */
  function headers() {
    return {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  /** Deep clone an object */
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /** Encode string to base64 (supports unicode) */
  function toBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  /** Decode base64 to string */
  function fromBase64(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  /** Show loading overlay */
  function showLoading(text = 'Loading content...') {
    loadingText.textContent = text;
    loadingOverlay.style.display = 'flex';
  }

  /** Hide loading overlay */
  function hideLoading() {
    loadingOverlay.style.display = 'none';
  }

  /** Format a date for display */
  function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  // ================================================
  // TOAST NOTIFICATIONS
  // ================================================
  function showToast(message, type = 'info', duration = 4000) {
    const icons = {
      success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Close">&times;</button>
    `;

    toastContainer.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close');
    const remove = () => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 250);
    };
    closeBtn.addEventListener('click', remove);
    setTimeout(remove, duration);
  }

  /** Escape HTML to prevent XSS in toast messages */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ================================================
  // GITHUB API METHODS
  // ================================================

  /** Fetch a file from the repo */
  async function fetchFile(path) {
    const url = apiUrl(path) + `?ref=${BRANCH}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to fetch ${path} (${res.status})`);
    }
    return res.json();
  }

  /** Update or create a file in the repo.
   *  If isBase64 is true, content is already base64-encoded (e.g. images). */
  async function putFile(path, content, message, sha = null, isBase64 = false) {
    const body = {
      message,
      content: isBase64 ? content : toBase64(content),
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    const res = await fetch(apiUrl(path), {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to save ${path} (${res.status})`);
    }
    return res.json();
  }

  /** List contents of a directory */
  async function listDir(path) {
    const url = apiUrl(path) + `?ref=${BRANCH}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      if (res.status === 404) return [];
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to list ${path} (${res.status})`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  /** Validate the token works by calling /user */
  async function validateToken() {
    const res = await fetch(`${API_BASE}/user`, { headers: headers() });
    if (!res.ok) throw new Error('Invalid token or API error');
    return res.json();
  }

  // ================================================
  // AUTHENTICATION
  // ================================================
  function initAuth() {
    const form = $('#login-form');
    const tokenInput = $('#gh-token');
    const ownerInput = $('#repo-owner');
    const nameInput = $('#repo-name');
    const loginBtn = $('#login-btn');
    const toggleBtn = $('#toggle-token-vis');

    // Restore repo settings
    ownerInput.value = getOwner();
    nameInput.value = getRepoName();

    // Toggle password visibility
    toggleBtn.addEventListener('click', () => {
      const isPassword = tokenInput.type === 'password';
      tokenInput.type = isPassword ? 'text' : 'password';
      toggleBtn.querySelector('.eye-icon').style.display = isPassword ? 'none' : '';
      toggleBtn.querySelector('.eye-off-icon').style.display = isPassword ? '' : 'none';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = tokenInput.value.trim();
      const owner = ownerInput.value.trim();
      const repo = nameInput.value.trim();

      if (!token) return showToast('Please enter your GitHub token', 'error');
      if (!owner || !repo) return showToast('Please enter repo owner and name', 'error');

      // Save settings
      sessionStorage.setItem('gh_token', token);
      localStorage.setItem('crm_repo_owner', owner);
      localStorage.setItem('crm_repo_name', repo);

      // Show loading
      loginBtn.querySelector('.btn-text').style.display = 'none';
      loginBtn.querySelector('.btn-loader').style.display = '';
      loginBtn.disabled = true;

      try {
        await validateToken();
        showToast('Authenticated successfully', 'success');
        await enterApp();
      } catch (err) {
        showToast('Authentication failed: ' + err.message, 'error');
        sessionStorage.removeItem('gh_token');
      } finally {
        loginBtn.querySelector('.btn-text').style.display = '';
        loginBtn.querySelector('.btn-loader').style.display = 'none';
        loginBtn.disabled = false;
      }
    });

    // Auto-login if token exists
    if (getToken()) {
      enterApp();
    }
  }

  function logout() {
    sessionStorage.removeItem('gh_token');
    loginScreen.style.display = '';
    appShell.style.display = 'none';
    contentData = null;
    contentSha = null;
    originalData = null;
  }

  async function enterApp() {
    loginScreen.style.display = 'none';
    appShell.style.display = 'flex';
    updateRepoInfo();
    await loadContent();
  }

  function updateRepoInfo() {
    const repoText = `${getOwner()}/${getRepoName()}`;
    $('#sidebar-repo-info').textContent = repoText;
  }

  // ================================================
  // CONTENT LOADING
  // ================================================
  async function loadContent() {
    showLoading('Fetching content from GitHub...');
    try {
      const file = await fetchFile(CONTENT_PATH);
      const decoded = fromBase64(file.content.replace(/\n/g, ''));
      contentData = JSON.parse(decoded);
      contentSha = file.sha;
      originalData = deepClone(contentData);
      renderCurrentSection();
      renderDashboard();
      showToast('Content loaded successfully', 'success');
    } catch (err) {
      showToast('Failed to load content: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  }

  // ================================================
  // SAVE CONTENT
  // ================================================
  async function saveContent(sectionLabel) {
    showLoading(`Saving ${sectionLabel}...`);
    try {
      const jsonStr = JSON.stringify(contentData, null, 2) + '\n';
      const message = `Update ${sectionLabel} via CRM`;
      const result = await putFile(CONTENT_PATH, jsonStr, message, contentSha);
      contentSha = result.content.sha;
      originalData = deepClone(contentData);
      showToast(`${sectionLabel} saved and committed successfully`, 'success');
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  }

  function cancelChanges() {
    if (!originalData) return;
    contentData = deepClone(originalData);
    renderCurrentSection();
    showToast('Changes reverted', 'info');
  }

  // ================================================
  // NAVIGATION
  // ================================================
  function initNavigation() {
    // Sidebar nav links
    $$('.nav-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        navigateTo(section);
      });
    });

    // Dashboard stat cards
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.stat-card[data-link]');
      if (card) navigateTo(card.dataset.link);

      const navBtn = e.target.closest('[data-nav]');
      if (navBtn) navigateTo(navBtn.dataset.nav);
    });

    // Cancel buttons
    document.addEventListener('click', (e) => {
      if (e.target.closest('.cancel-btn')) {
        cancelChanges();
      }
    });

    // Save section buttons (for array sections)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.save-section-btn');
      if (btn) {
        const section = btn.dataset.section;
        saveContent(section);
      }
    });

    // Logout
    $('#logout-btn').addEventListener('click', logout);
    $('#mobile-logout-btn').addEventListener('click', logout);

    // Mobile sidebar
    $('#hamburger').addEventListener('click', () => {
      sidebar.classList.add('open');
      sidebarOverlay.classList.add('visible');
    });
    const closeSidebar = () => {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('visible');
    };
    $('#sidebar-close').addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);
  }

  function navigateTo(section) {
    currentSection = section;

    // Update nav active state
    $$('.nav-link').forEach((l) => l.classList.remove('active'));
    const activeLink = $(`.nav-link[data-section="${section}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Show the right page
    $$('.page').forEach((p) => (p.style.display = 'none'));
    const page = $(`#page-${section}`);
    if (page) page.style.display = '';

    // Update mobile header
    const titleMap = {
      dashboard: 'Dashboard',
      business: 'Business Info',
      hero: 'Hero Section',
      stats: 'Stats',
      services: 'Services',
      gallery: 'Gallery',
      testimonials: 'Testimonials',
      faq: 'FAQ',
      about: 'About',
      images: 'Image Manager',
    };
    $('#mobile-page-title').textContent = titleMap[section] || 'Dashboard';

    // Close mobile sidebar
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('visible');

    // Render section content
    renderCurrentSection();
  }

  function renderCurrentSection() {
    if (!contentData) return;
    switch (currentSection) {
      case 'dashboard':
        renderDashboard();
        break;
      case 'business':
        renderBusiness();
        break;
      case 'hero':
        renderHero();
        break;
      case 'stats':
        renderStats();
        break;
      case 'services':
        renderServices();
        break;
      case 'gallery':
        renderGallery();
        break;
      case 'testimonials':
        renderTestimonials();
        break;
      case 'faq':
        renderFaq();
        break;
      case 'about':
        renderAbout();
        break;
      case 'images':
        renderImages();
        break;
    }
  }

  // ================================================
  // DASHBOARD RENDERER
  // ================================================
  function renderDashboard() {
    if (!contentData) return;
    const d = contentData;

    $('#dash-services-count').textContent = d.services ? d.services.length : 0;
    $('#dash-testimonials-count').textContent = d.testimonials ? d.testimonials.length : 0;
    $('#dash-gallery-count').textContent = d.gallery ? d.gallery.length : 0;
    $('#dash-faq-count').textContent = d.faq ? d.faq.length : 0;

    $('#dash-biz-name').textContent = d.business?.name || '--';
    $('#dash-biz-phone').textContent = d.business?.phone || '--';
    $('#dash-biz-email').textContent = d.business?.email || '--';
    $('#dash-biz-year').textContent = d.business?.yearEstablished || '--';

    $('#sidebar-business-name').textContent = d.business?.name || 'CRM Panel';
    $('#dash-last-updated').textContent = formatDate(new Date());
  }

  // ================================================
  // BUSINESS INFO RENDERER
  // ================================================
  function renderBusiness() {
    if (!contentData) return;
    const b = contentData.business;
    $('#biz-name').value = b.name || '';
    $('#biz-tagline').value = b.tagline || '';
    $('#biz-phone').value = b.phone || '';
    $('#biz-email').value = b.email || '';
    $('#biz-address').value = b.address || '';
    $('#biz-hours').value = b.hours || '';
    $('#biz-year').value = b.yearEstablished || '';
    $('#biz-license').value = b.license || '';
  }

  function initBusinessForm() {
    $('#form-business').addEventListener('submit', async (e) => {
      e.preventDefault();
      contentData.business.name = $('#biz-name').value;
      contentData.business.tagline = $('#biz-tagline').value;
      contentData.business.phone = $('#biz-phone').value;
      contentData.business.email = $('#biz-email').value;
      contentData.business.address = $('#biz-address').value;
      contentData.business.hours = $('#biz-hours').value;
      contentData.business.yearEstablished = parseInt($('#biz-year').value) || 2020;
      contentData.business.license = $('#biz-license').value;
      await saveContent('business info');
      renderDashboard();
    });
  }

  // ================================================
  // HERO SECTION RENDERER
  // ================================================
  function renderHero() {
    if (!contentData) return;
    const h = contentData.hero;
    $('#hero-headline').value = h.headline || '';
    $('#hero-subheadline').value = h.subheadline || '';
    $('#hero-cta').value = h.cta || '';
    $('#hero-ctaphone').value = h.ctaPhone || '';
    renderTrustBadges();
  }

  function renderTrustBadges() {
    const list = $('#hero-badges-list');
    const badges = contentData.hero.trustBadges || [];
    list.innerHTML = badges
      .map(
        (badge, i) => `
      <span class="tag-item">
        ${escapeHtml(badge)}
        <button type="button" class="tag-remove" data-badge-index="${i}" aria-label="Remove">&times;</button>
      </span>
    `
      )
      .join('');
  }

  function initHeroForm() {
    $('#form-hero').addEventListener('submit', async (e) => {
      e.preventDefault();
      contentData.hero.headline = $('#hero-headline').value;
      contentData.hero.subheadline = $('#hero-subheadline').value;
      contentData.hero.cta = $('#hero-cta').value;
      contentData.hero.ctaPhone = $('#hero-ctaphone').value;
      await saveContent('hero section');
    });

    // Add badge
    $('#hero-add-badge').addEventListener('click', () => {
      const input = $('#hero-badge-input');
      const val = input.value.trim();
      if (!val) return;
      if (!contentData.hero.trustBadges) contentData.hero.trustBadges = [];
      contentData.hero.trustBadges.push(val);
      input.value = '';
      renderTrustBadges();
    });

    // Enter key to add badge
    $('#hero-badge-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#hero-add-badge').click();
      }
    });

    // Remove badge
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-badge-index]');
      if (btn) {
        const idx = parseInt(btn.dataset.badgeIndex);
        contentData.hero.trustBadges.splice(idx, 1);
        renderTrustBadges();
      }
    });
  }

  // ================================================
  // ARRAY ITEM CARD HELPERS
  // ================================================

  /** Create the HTML for a collapsible item card */
  function createItemCard(index, title, fieldsHtml, options = {}) {
    const { section, open } = options;
    return `
      <div class="item-card ${open ? 'open' : ''}" data-index="${index}">
        <div class="item-card-header">
          <span class="item-card-title">
            <span class="item-index">${index + 1}</span>
            ${escapeHtml(title || 'Untitled')}
          </span>
          <div class="item-card-actions">
            <button type="button" class="btn-icon danger delete-item-btn" data-section="${section}" data-index="${index}" title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
            <svg class="chevron-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
        <div class="item-card-body">
          <div class="form-grid">${fieldsHtml}</div>
        </div>
      </div>
    `;
  }

  /** Bind collapse/expand toggle on item card headers */
  function bindItemCardToggles(container) {
    container.querySelectorAll('.item-card-header').forEach((header) => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.btn-icon')) return;
        header.closest('.item-card').classList.toggle('open');
      });
    });
  }

  /** Generic input field generator */
  function field(label, value, attrs = '') {
    return `
      <div class="form-group">
        <label>${escapeHtml(label)}</label>
        <input type="text" value="${escapeAttr(value || '')}" ${attrs}>
      </div>
    `;
  }

  function textareaField(label, value, attrs = '', rows = 3) {
    return `
      <div class="form-group full-width">
        <label>${escapeHtml(label)}</label>
        <textarea rows="${rows}" ${attrs}>${escapeHtml(value || '')}</textarea>
      </div>
    `;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ================================================
  // STATS RENDERER
  // ================================================
  function renderStats() {
    if (!contentData) return;
    const list = $('#stats-list');
    const stats = contentData.stats || [];

    if (stats.length === 0) {
      list.innerHTML = '<div class="empty-state">No stats yet. Click "Add Stat" to create one.</div>';
      return;
    }

    list.innerHTML = stats
      .map((stat, i) => {
        const fields = `
          ${field('Number', stat.number, `data-key="number" data-index="${i}" data-type="number"`)}
          ${field('Suffix', stat.suffix, `data-key="suffix" data-index="${i}"`)}
          <div class="form-group full-width">
            <label>Label</label>
            <input type="text" value="${escapeAttr(stat.label || '')}" data-key="label" data-index="${i}">
          </div>
        `;
        return createItemCard(i, `${stat.number}${stat.suffix} ${stat.label}`, fields, { section: 'stats' });
      })
      .join('');

    bindItemCardToggles(list);
    bindItemInputs(list, 'stats');
  }

  function initStats() {
    $('#add-stat-btn').addEventListener('click', () => {
      if (!contentData.stats) contentData.stats = [];
      contentData.stats.push({ number: 0, suffix: '+', label: 'New Stat' });
      renderStats();
      // Open the last card
      const cards = $$('.item-card', $('#stats-list'));
      if (cards.length) cards[cards.length - 1].classList.add('open');
    });
  }

  // ================================================
  // SERVICES RENDERER
  // ================================================
  function renderServices() {
    if (!contentData) return;
    const list = $('#services-list');
    const services = contentData.services || [];

    if (services.length === 0) {
      list.innerHTML = '<div class="empty-state">No services yet. Click "Add Service" to create one.</div>';
      return;
    }

    list.innerHTML = services
      .map((svc, i) => {
        const fields = `
          ${field('ID (slug)', svc.id, `data-key="id" data-index="${i}"`)}
          ${field('Title', svc.title, `data-key="title" data-index="${i}"`)}
          ${field('Icon', svc.icon, `data-key="icon" data-index="${i}"`)}
          ${field('Image Path', svc.image, `data-key="image" data-index="${i}"`)}
          ${textareaField('Description', svc.description, `data-key="description" data-index="${i}"`)}
        `;
        return createItemCard(i, svc.title, fields, { section: 'services' });
      })
      .join('');

    bindItemCardToggles(list);
    bindItemInputs(list, 'services');
  }

  function initServices() {
    $('#add-service-btn').addEventListener('click', () => {
      if (!contentData.services) contentData.services = [];
      contentData.services.push({
        id: 'new-service',
        title: 'New Service',
        description: '',
        icon: 'star',
        image: 'images/placeholder.png',
      });
      renderServices();
      const cards = $$('.item-card', $('#services-list'));
      if (cards.length) cards[cards.length - 1].classList.add('open');
    });
  }

  // ================================================
  // GALLERY RENDERER
  // ================================================
  function renderGallery() {
    if (!contentData) return;
    const list = $('#gallery-list');
    const gallery = contentData.gallery || [];

    if (gallery.length === 0) {
      list.innerHTML = '<div class="empty-state">No gallery items yet. Click "Add Gallery Item" to create one.</div>';
      return;
    }

    list.innerHTML = gallery
      .map((item, i) => {
        const fields = `
          ${field('Before Image Path', item.before, `data-key="before" data-index="${i}"`)}
          ${field('After Image Path', item.after, `data-key="after" data-index="${i}"`)}
          ${field('Caption', item.caption, `data-key="caption" data-index="${i}"`)}
          ${field('Category', item.category, `data-key="category" data-index="${i}"`)}
        `;
        return createItemCard(i, item.caption, fields, { section: 'gallery' });
      })
      .join('');

    bindItemCardToggles(list);
    bindItemInputs(list, 'gallery');
  }

  function initGallery() {
    $('#add-gallery-btn').addEventListener('click', () => {
      if (!contentData.gallery) contentData.gallery = [];
      contentData.gallery.push({
        before: 'images/before.png',
        after: 'images/after.png',
        caption: 'New Project',
        category: 'general',
      });
      renderGallery();
      const cards = $$('.item-card', $('#gallery-list'));
      if (cards.length) cards[cards.length - 1].classList.add('open');
    });
  }

  // ================================================
  // TESTIMONIALS RENDERER
  // ================================================
  function renderTestimonials() {
    if (!contentData) return;
    const list = $('#testimonials-list');
    const testimonials = contentData.testimonials || [];

    if (testimonials.length === 0) {
      list.innerHTML = '<div class="empty-state">No testimonials yet. Click "Add Testimonial" to create one.</div>';
      return;
    }

    list.innerHTML = testimonials
      .map((t, i) => {
        const starsHtml = `
          <div class="form-group">
            <label>Rating</label>
            <div class="star-rating-input" data-index="${i}">
              ${[1, 2, 3, 4, 5]
                .map(
                  (n) =>
                    `<button type="button" class="star-btn ${n <= (t.rating || 5) ? 'active' : ''}" data-rating="${n}" data-index="${i}">&#9733;</button>`
                )
                .join('')}
            </div>
          </div>
        `;
        const fields = `
          ${field('Customer Name', t.name, `data-key="name" data-index="${i}"`)}
          ${starsHtml}
          ${field('Service', t.service, `data-key="service" data-index="${i}"`)}
          ${textareaField('Testimonial Text', t.text, `data-key="text" data-index="${i}"`, 4)}
        `;
        return createItemCard(i, t.name, fields, { section: 'testimonials' });
      })
      .join('');

    bindItemCardToggles(list);
    bindItemInputs(list, 'testimonials');

    // Star rating clicks
    list.querySelectorAll('.star-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const rating = parseInt(btn.dataset.rating);
        contentData.testimonials[idx].rating = rating;
        // Update UI
        const container = btn.closest('.star-rating-input');
        container.querySelectorAll('.star-btn').forEach((s) => {
          s.classList.toggle('active', parseInt(s.dataset.rating) <= rating);
        });
      });
    });
  }

  function initTestimonials() {
    $('#add-testimonial-btn').addEventListener('click', () => {
      if (!contentData.testimonials) contentData.testimonials = [];
      contentData.testimonials.push({
        name: 'New Customer',
        rating: 5,
        text: '',
        service: 'House Washing',
      });
      renderTestimonials();
      const cards = $$('.item-card', $('#testimonials-list'));
      if (cards.length) cards[cards.length - 1].classList.add('open');
    });
  }

  // ================================================
  // FAQ RENDERER
  // ================================================
  function renderFaq() {
    if (!contentData) return;
    const list = $('#faq-list');
    const faq = contentData.faq || [];

    if (faq.length === 0) {
      list.innerHTML = '<div class="empty-state">No FAQ items yet. Click "Add FAQ" to create one.</div>';
      return;
    }

    list.innerHTML = faq
      .map((item, i) => {
        const fields = `
          <div class="form-group full-width">
            <label>Question</label>
            <input type="text" value="${escapeAttr(item.question || '')}" data-key="question" data-index="${i}">
          </div>
          ${textareaField('Answer', item.answer, `data-key="answer" data-index="${i}"`, 4)}
        `;
        return createItemCard(i, item.question, fields, { section: 'faq' });
      })
      .join('');

    bindItemCardToggles(list);
    bindItemInputs(list, 'faq');
  }

  function initFaq() {
    $('#add-faq-btn').addEventListener('click', () => {
      if (!contentData.faq) contentData.faq = [];
      contentData.faq.push({
        question: 'New Question?',
        answer: '',
      });
      renderFaq();
      const cards = $$('.item-card', $('#faq-list'));
      if (cards.length) cards[cards.length - 1].classList.add('open');
    });
  }

  // ================================================
  // ABOUT RENDERER
  // ================================================
  function renderAbout() {
    if (!contentData) return;
    const about = contentData.about;
    $('#about-headline').value = about.headline || '';
    $('#about-description').value = about.description || '';
    renderValues();
  }

  function renderValues() {
    const list = $('#values-list');
    const values = contentData.about.values || [];

    if (values.length === 0) {
      list.innerHTML = '<div class="empty-state">No values yet. Click "Add Value" to create one.</div>';
      return;
    }

    list.innerHTML = values
      .map((v, i) => {
        const fields = `
          <div class="form-group full-width">
            <label>Title</label>
            <input type="text" value="${escapeAttr(v.title || '')}" data-key="title" data-index="${i}" data-subsection="values">
          </div>
          ${textareaField('Description', v.description, `data-key="description" data-index="${i}" data-subsection="values"`)}
        `;
        return createItemCard(i, v.title, fields, { section: 'values' });
      })
      .join('');

    bindItemCardToggles(list);

    // Bind value inputs
    list.querySelectorAll('input, textarea').forEach((input) => {
      input.addEventListener('input', () => {
        const idx = parseInt(input.dataset.index);
        const key = input.dataset.key;
        if (contentData.about.values[idx]) {
          contentData.about.values[idx][key] = input.value;
        }
      });
    });
  }

  function initAbout() {
    // About headline/description are saved via the save button
    // Bind live updates
    $('#about-headline').addEventListener('input', (e) => {
      contentData.about.headline = e.target.value;
    });
    $('#about-description').addEventListener('input', (e) => {
      contentData.about.description = e.target.value;
    });

    $('#add-value-btn').addEventListener('click', () => {
      if (!contentData.about.values) contentData.about.values = [];
      contentData.about.values.push({
        title: 'New Value',
        description: '',
      });
      renderValues();
      const cards = $$('.item-card', $('#values-list'));
      if (cards.length) cards[cards.length - 1].classList.add('open');
    });
  }

  // ================================================
  // GENERIC ITEM INPUT BINDINGS
  // ================================================
  function bindItemInputs(container, section) {
    container.querySelectorAll('input, textarea').forEach((input) => {
      if (input.dataset.subsection) return; // handled separately (about values)
      input.addEventListener('input', () => {
        const idx = parseInt(input.dataset.index);
        const key = input.dataset.key;
        if (key === undefined || isNaN(idx)) return;

        const arr = contentData[section];
        if (arr && arr[idx]) {
          let val = input.value;
          if (input.dataset.type === 'number') {
            val = parseFloat(val) || 0;
          }
          arr[idx][key] = val;
        }
      });
    });
  }

  // ================================================
  // DELETE ITEMS
  // ================================================
  function initDeleteHandler() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.delete-item-btn');
      if (!btn) return;
      e.stopPropagation();

      const section = btn.dataset.section;
      const index = parseInt(btn.dataset.index);

      if (section === 'values') {
        if (!confirm('Delete this value?')) return;
        contentData.about.values.splice(index, 1);
        renderValues();
        return;
      }

      const sectionData = contentData[section];
      if (!sectionData) return;

      if (!confirm(`Delete this ${section.slice(0, -1) || 'item'}?`)) return;
      sectionData.splice(index, 1);
      renderCurrentSection();
    });
  }

  // ================================================
  // IMAGE MANAGER
  // ================================================
  async function renderImages() {
    const grid = $('#images-grid');
    grid.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div><p>Loading images...</p></div>';

    try {
      const files = await listDir(IMAGES_DIR);
      const imageFiles = files.filter((f) =>
        f.type === 'file' && /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f.name)
      );

      if (imageFiles.length === 0) {
        grid.innerHTML = `
          <div class="empty-state images-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <p>No images found. Upload your first image!</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = imageFiles
        .map((file) => {
          const thumbUrl = file.download_url || '';
          return `
            <div class="image-card">
              <img class="image-card-thumb" src="${thumbUrl}" alt="${escapeAttr(file.name)}" loading="lazy" onerror="this.style.display='none'">
              <div class="image-card-info">
                <div class="image-card-name">${escapeHtml(file.name)}</div>
                <div class="image-card-path">${IMAGES_DIR}/${file.name}</div>
              </div>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      grid.innerHTML = `<div class="empty-state">Failed to load images: ${escapeHtml(err.message)}</div>`;
    }
  }

  function initImageUpload() {
    const input = $('#image-upload-input');
    const progress = $('#upload-progress');
    const progressFill = $('#upload-progress-fill');
    const progressText = $('#upload-progress-text');

    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;

      // Validate
      if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        input.value = '';
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showToast('Image must be smaller than 10MB', 'error');
        input.value = '';
        return;
      }

      // Read file as base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Full = reader.result;
        // Strip the data:image/...;base64, prefix
        const base64Content = base64Full.split(',')[1];
        const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${IMAGES_DIR}/${fileName}`;

        progress.style.display = 'block';
        progressFill.style.width = '30%';
        progressText.textContent = `Uploading ${fileName}...`;

        try {
          // Check if file already exists (get SHA)
          let existingSha = null;
          try {
            const existing = await fetchFile(filePath);
            existingSha = existing.sha;
          } catch {
            // File doesn't exist, that's fine
          }

          progressFill.style.width = '60%';

          await putFile(
            filePath,
            base64Content,
            `Upload image ${fileName} via CRM`,
            existingSha,
            true // content is already base64
          );

          progressFill.style.width = '100%';
          progressText.textContent = 'Upload complete!';
          showToast(`Image "${fileName}" uploaded successfully`, 'success');

          // Refresh images grid
          setTimeout(() => {
            progress.style.display = 'none';
            progressFill.style.width = '0%';
            renderImages();
          }, 1000);
        } catch (err) {
          showToast('Upload failed: ' + err.message, 'error');
          progress.style.display = 'none';
          progressFill.style.width = '0%';
        }
      };
      reader.readAsDataURL(file);
      input.value = '';
    });
  }

  // ================================================
  // INIT
  // ================================================
  function init() {
    initAuth();
    initNavigation();
    initBusinessForm();
    initHeroForm();
    initStats();
    initServices();
    initGallery();
    initTestimonials();
    initFaq();
    initAbout();
    initDeleteHandler();
    initImageUpload();
  }

  // Run when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
