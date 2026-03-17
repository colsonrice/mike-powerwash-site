/* ==============================================
   ADMIN CRM - Content Manager
   JavaScript Application Logic
   GitHub API Mode (one-time setup)
   ============================================== */

(function () {
  'use strict';

  // ================================================
  // CONFIG
  // ================================================
  const REPO_OWNER = 'colsonrice';
  const REPO_NAME = 'mike-powerwash-site';
  const BRANCH = 'main';
  const CONTENT_PATH = 'data/content.json';
  const API_BASE = 'https://api.github.com';

  // ================================================
  // STATE
  // ================================================
  let contentData = null;
  let originalData = null;
  let contentSha = null;      // SHA of content.json for GitHub API updates
  let currentSection = 'dashboard';
  let hasUnsavedChanges = false;

  // ================================================
  // DOM HELPERS
  // ================================================
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const sidebar = $('#sidebar');
  const sidebarOverlay = $('#sidebar-overlay');
  const loadingOverlay = $('#loading-overlay');
  const loadingText = $('#loading-text');
  const toastContainer = $('#toast-container');
  const unsavedBar = $('#unsaved-bar');

  // ================================================
  // ADMIN CONFIG PATH (encrypted token stored in repo)
  // ================================================
  const ADMIN_CONFIG_PATH = 'data/admin-config.json';
  let adminConfigSha = null; // SHA for admin-config.json updates

  // ================================================
  // SESSION TOKEN (decrypted, in-memory only)
  // ================================================
  let sessionToken = null;

  function getToken() {
    return sessionToken || sessionStorage.getItem('sudsaway_session_token');
  }

  function setSessionToken(token) {
    sessionToken = token;
    sessionStorage.setItem('sudsaway_session_token', token);
  }

  function clearSessionToken() {
    sessionToken = null;
    sessionStorage.removeItem('sudsaway_session_token');
  }

  function isConnected() {
    return !!getToken();
  }

  function apiHeaders() {
    return {
      Authorization: 'Bearer ' + getToken(),
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  // ================================================
  // WEB CRYPTO: ENCRYPT / DECRYPT TOKEN
  // ================================================

  /** Derive an AES-GCM key from a password + salt */
  async function deriveKey(password, salt) {
    var enc = new TextEncoder();
    var keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /** Encrypt a string with a password → returns { salt, iv, ciphertext } as hex */
  async function encryptToken(token, password) {
    var enc = new TextEncoder();
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(password, salt);
    var encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      enc.encode(token)
    );
    return {
      salt: bufToHex(salt),
      iv: bufToHex(iv),
      ciphertext: bufToHex(new Uint8Array(encrypted)),
    };
  }

  /** Decrypt a token using { salt, iv, ciphertext } and a password */
  async function decryptToken(encData, password) {
    var salt = hexToBuf(encData.salt);
    var iv = hexToBuf(encData.iv);
    var ciphertext = hexToBuf(encData.ciphertext);
    var key = await deriveKey(password, salt);
    var decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  }

  /** Uint8Array → hex string */
  function bufToHex(buf) {
    return Array.from(buf).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  /** hex string → Uint8Array */
  function hexToBuf(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /** Fetch admin-config.json from GitHub (public, no auth needed) */
  async function fetchAdminConfig() {
    try {
      var url = 'https://raw.githubusercontent.com/' + REPO_OWNER + '/' + REPO_NAME + '/' + BRANCH + '/' + ADMIN_CONFIG_PATH + '?t=' + Date.now();
      var resp = await fetch(url);
      if (!resp.ok) return null;
      return resp.json();
    } catch (e) {
      return null;
    }
  }

  /** Save admin-config.json to the repo (requires valid token) */
  async function saveAdminConfig(config) {
    // Get current SHA first
    var checkUrl = API_BASE + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + ADMIN_CONFIG_PATH + '?ref=' + BRANCH;
    var checkResp = await fetch(checkUrl, { headers: apiHeaders() });
    var sha = null;
    if (checkResp.ok) {
      var existing = await checkResp.json();
      sha = existing.sha;
    }

    var jsonStr = JSON.stringify(config, null, 2) + '\n';
    var encoded = btoa(unescape(encodeURIComponent(jsonStr)));

    var body = {
      message: 'Update admin config',
      content: encoded,
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    var url = API_BASE + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + ADMIN_CONFIG_PATH;
    var resp = await fetch(url, {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      var errData = await resp.json().catch(function () { return {}; });
      throw new Error(errData.message || 'Failed to save config');
    }
    return true;
  }

  // ================================================
  // UTILITY FUNCTIONS
  // ================================================

  /** Deep clone an object */
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /** Escape HTML to prevent XSS */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /** Escape for use in HTML attributes */
  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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

  /** Show loading overlay */
  function showLoading(text) {
    loadingText.textContent = text || 'Loading content...';
    loadingOverlay.classList.remove('hidden');
    loadingOverlay.style.display = '';
  }

  /** Hide loading overlay */
  function hideLoading() {
    loadingOverlay.classList.add('hidden');
  }

  /** Mark content as changed */
  function markDirty() {
    hasUnsavedChanges = true;
    updateUnsavedUI();
  }

  /** Check if data actually differs from original */
  function checkIfDirty() {
    if (!contentData || !originalData) {
      hasUnsavedChanges = false;
    } else {
      hasUnsavedChanges =
        JSON.stringify(contentData) !== JSON.stringify(originalData);
    }
    updateUnsavedUI();
  }

  /** Update all unsaved change indicators */
  function updateUnsavedUI() {
    // Unsaved bar on dashboard
    if (unsavedBar) {
      unsavedBar.style.display = hasUnsavedChanges ? '' : 'none';
    }
    // Mobile indicator
    const mobileIndicator = $('#mobile-save-indicator');
    if (mobileIndicator) {
      mobileIndicator.style.display = hasUnsavedChanges ? '' : 'none';
    }
  }

  // ================================================
  // TOAST NOTIFICATIONS
  // ================================================
  function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;

    const icons = {
      success:
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error:
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info:
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML =
      '<span class="toast-icon">' +
      (icons[type] || icons.info) +
      '</span>' +
      '<span class="toast-message">' +
      escapeHtml(message) +
      '</span>' +
      '<button class="toast-close" aria-label="Close">&times;</button>';

    toastContainer.appendChild(toast);

    var closeBtn = toast.querySelector('.toast-close');
    var remove = function () {
      toast.classList.add('removing');
      setTimeout(function () {
        toast.remove();
      }, 250);
    };
    closeBtn.addEventListener('click', remove);
    setTimeout(remove, duration);
  }

  // ================================================
  // SETUP FLOW
  // ================================================
  function showSetup() {
    var setup = $('#setup-screen');
    var app = $('#app-shell');
    if (setup) setup.style.display = '';
    if (app) app.style.display = 'none';
    // Default to team login view
    showLoginCard();
  }

  function showLoginCard() {
    var login = $('#login-card');
    var owner = $('#owner-setup-card');
    if (login) login.style.display = '';
    if (owner) owner.style.display = 'none';
  }

  function showOwnerCard() {
    var login = $('#login-card');
    var owner = $('#owner-setup-card');
    if (login) login.style.display = 'none';
    if (owner) owner.style.display = '';
  }

  function showApp() {
    var setup = $('#setup-screen');
    var app = $('#app-shell');
    if (setup) setup.style.display = 'none';
    if (app) app.style.display = '';
    updateConnectionStatus();
  }

  function updateConnectionStatus() {
    var dot = $('#settings-status-dot');
    var text = $('#settings-status-text');
    if (dot) dot.style.background = isConnected() ? 'var(--success)' : 'var(--gray-400)';
    if (text) text.textContent = isConnected() ? 'Connected' : 'Not connected';
  }

  /** Validate a GitHub token by checking /user endpoint */
  async function validateGitHubToken(token) {
    var resp = await fetch(API_BASE + '/user', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github.v3+json' },
    });
    if (!resp.ok) throw new Error('Invalid token');
    return resp.json();
  }

  function initSetup() {
    // ---- Toggle between login and owner setup views ----
    var showOwnerBtn = $('#show-owner-setup');
    var showTeamBtn = $('#show-team-login');
    if (showOwnerBtn) showOwnerBtn.addEventListener('click', showOwnerCard);
    if (showTeamBtn) showTeamBtn.addEventListener('click', showLoginCard);

    // ---- TEAM LOGIN FORM ----
    var loginForm = $('#login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var passwordInput = $('#login-password');
        var btn = $('#login-btn');
        var errorEl = $('#login-error');
        var password = passwordInput.value.trim();
        if (!password) return;

        btn.disabled = true;
        btn.textContent = 'Signing in...';
        if (errorEl) errorEl.style.display = 'none';

        try {
          // Fetch the encrypted config from the repo
          var config = await fetchAdminConfig();
          if (!config || !config.encryptedToken) {
            throw new Error('NO_CONFIG');
          }

          // Decrypt the token with the entered password
          var token = await decryptToken(config.encryptedToken, password);

          // Validate the token works with GitHub
          var user = await validateGitHubToken(token);

          // Success! Store in session and enter app
          setSessionToken(token);
          showApp();
          loadContent();
          showToast('Welcome back!', 'success');
        } catch (err) {
          if (err.message === 'NO_CONFIG') {
            // No config exists yet — need owner setup
            if (errorEl) {
              errorEl.textContent = 'No team password has been set up yet. Click "Owner Setup" below to get started.';
              errorEl.style.display = '';
            }
          } else {
            if (errorEl) {
              errorEl.textContent = 'Incorrect password. Please try again.';
              errorEl.style.display = '';
            }
          }
          passwordInput.focus();
        }

        btn.disabled = false;
        btn.textContent = 'Sign In';
      });
    }

    // ---- OWNER SETUP FORM ----
    var ownerForm = $('#owner-setup-form');
    if (ownerForm) {
      ownerForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var tokenInput = $('#setup-token');
        var passwordInput = $('#setup-password');
        var confirmInput = $('#setup-password-confirm');
        var btn = $('#owner-setup-btn');

        var token = tokenInput.value.trim();
        var password = passwordInput.value;
        var confirm = confirmInput.value;

        if (!token || !password || !confirm) return;

        if (password !== confirm) {
          showToast('Passwords do not match', 'error');
          confirmInput.focus();
          return;
        }

        if (password.length < 4) {
          showToast('Password must be at least 4 characters', 'error');
          passwordInput.focus();
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block;margin-right:8px;vertical-align:middle"></span> Setting up...';

        try {
          // Validate the GitHub token first
          var user = await validateGitHubToken(token);

          // Encrypt the token with the password
          var encData = await encryptToken(token, password);

          // Store token in session so we can save the config
          setSessionToken(token);

          // Save encrypted config to GitHub repo
          await saveAdminConfig({
            encryptedToken: encData,
            createdBy: user.login,
            createdAt: new Date().toISOString(),
          });

          // Enter the app
          showApp();
          loadContent();
          showToast('Setup complete! Share the team password with your team.', 'success', 6000);
        } catch (err) {
          clearSessionToken();
          showToast('Setup failed: ' + err.message, 'error');
          tokenInput.focus();
        }

        btn.disabled = false;
        btn.innerHTML = 'Save &amp; Connect';
      });
    }

    // Toggle token visibility
    var toggleBtn = $('#toggle-token-vis');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var input = $('#setup-token');
        var isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        toggleBtn.textContent = isPassword ? 'Hide' : 'Show';
      });
    }
  }

  // ================================================
  // CONTENT LOADING (GitHub API)
  // ================================================
  async function loadContent() {
    showLoading('Loading content from GitHub...');
    try {
      var url = API_BASE + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + CONTENT_PATH + '?ref=' + BRANCH;
      var resp = await fetch(url, { headers: apiHeaders() });

      if (resp.status === 401) {
        hideLoading();
        clearSessionToken();
        showSetup();
        showToast('Token expired or invalid. Please reconnect.', 'error');
        return;
      }

      if (!resp.ok) throw new Error('Failed to load content (HTTP ' + resp.status + ')');

      var data = await resp.json();
      contentSha = data.sha;
      var binary = atob(data.content.replace(/\n/g, ''));
      var decoded = decodeURIComponent(escape(binary));
      contentData = JSON.parse(decoded);
      originalData = deepClone(contentData);
      hasUnsavedChanges = false;
      updateUnsavedUI();
      renderCurrentSection();
      renderDashboard();
      hideLoading();
    } catch (err) {
      hideLoading();
      showToast('Failed to load content: ' + err.message, 'error', 8000);
      var main = $('#main-content');
      if (main) {
        $$('.page').forEach(function (p) { p.style.display = 'none'; });
        var errorDiv = document.createElement('div');
        errorDiv.innerHTML =
          '<div class="error-state">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
          '<h3>Could not load content</h3>' +
          '<p>' + escapeHtml(err.message) + '</p>' +
          '<button class="btn btn-primary" onclick="location.reload()">Retry</button>' +
          '</div>';
        main.appendChild(errorDiv);
      }
    }
  }

  // ================================================
  // SAVE TO GITHUB
  // ================================================
  async function saveToGitHub() {
    if (!contentData) {
      showToast('No content to save', 'error');
      return;
    }

    showLoading('Saving changes...');
    try {
      var jsonStr = JSON.stringify(contentData, null, 2) + '\n';
      var encoded = btoa(unescape(encodeURIComponent(jsonStr)));

      var url = API_BASE + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + CONTENT_PATH;
      var resp = await fetch(url, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({
          message: 'Update content via CRM',
          content: encoded,
          sha: contentSha,
          branch: BRANCH,
        }),
      });

      if (resp.status === 401) {
        hideLoading();
        clearSessionToken();
        showSetup();
        showToast('Token expired. Please reconnect.', 'error');
        return;
      }

      if (!resp.ok) {
        var errData = await resp.json().catch(function () { return {}; });
        throw new Error(errData.message || 'HTTP ' + resp.status);
      }

      var result = await resp.json();
      contentSha = result.content.sha;
      originalData = deepClone(contentData);
      hasUnsavedChanges = false;
      updateUnsavedUI();
      hideLoading();
      showToast('Changes saved! Your website will update in about 30 seconds.', 'success', 5000);
    } catch (err) {
      hideLoading();
      showToast('Save failed: ' + err.message, 'error', 6000);
    }
  }

  /** Reset content to the originally loaded data */
  function resetContent() {
    if (!originalData) return;
    contentData = deepClone(originalData);
    hasUnsavedChanges = false;
    updateUnsavedUI();
    renderCurrentSection();
    showToast('Changes reverted to last saved state', 'info');
  }

  // ================================================
  // IMAGE UPLOAD (GitHub API)
  // ================================================
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

  /** Read a File as a Base64 string (without data: prefix) */
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /** Generate a unique image path for uploads */
  function generateImagePath(file, section, index) {
    var ext = file.name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].indexOf(ext) === -1) ext = 'jpg';
    return 'images/' + section + '-' + index + '-' + Date.now() + '.' + ext;
  }

  /** Upload an image file to the GitHub repo */
  async function uploadImageToGitHub(file, targetPath) {
    // Validate
    if (ALLOWED_IMAGE_TYPES.indexOf(file.type) === -1) {
      showToast('Invalid file type. Use JPG, PNG, WebP, or GIF.', 'error');
      return null;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      showToast('Image too large. Maximum size is 5 MB.', 'error');
      return null;
    }

    var base64 = await fileToBase64(file);

    // Check if file exists (need SHA for overwrite)
    var sha = null;
    try {
      var checkUrl = API_BASE + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + targetPath + '?ref=' + BRANCH;
      var checkResp = await fetch(checkUrl, { headers: apiHeaders() });
      if (checkResp.ok) {
        var existing = await checkResp.json();
        sha = existing.sha;
      }
    } catch (e) { /* file doesn't exist, that's fine */ }

    // Upload via PUT
    var url = API_BASE + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + targetPath;
    var body = {
      message: 'Upload image: ' + targetPath,
      content: base64,
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    var resp = await fetch(url, {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify(body),
    });

    if (resp.status === 401) {
      clearSessionToken();
      showSetup();
      showToast('Token expired. Please reconnect.', 'error');
      return null;
    }
    if (!resp.ok) {
      var errData = await resp.json().catch(function () { return {}; });
      throw new Error(errData.message || 'Upload failed (HTTP ' + resp.status + ')');
    }

    return targetPath;
  }

  // ================================================
  // DROP ZONE COMPONENT
  // ================================================

  /** Generate drop zone HTML for an image field */
  function dropZoneHtml(currentImagePath, section, index, fieldKey) {
    var hasImage = currentImagePath && currentImagePath !== '';
    var previewSrc = hasImage ? ('../' + currentImagePath) : '';
    var dataAttrs = 'data-section="' + section + '" data-index="' + index + '" data-field="' + fieldKey + '"';

    return (
      '<div class="form-group full-width">' +
      '<label>Image</label>' +
      '<div class="drop-zone" ' + dataAttrs + '>' +
        (hasImage
          ? '<div class="drop-zone-preview">' +
            '<img src="' + escapeAttr(previewSrc) + '" alt="Current image">' +
            '<div class="drop-zone-overlay">' +
              '<span class="drop-zone-replace-text">Drop new image or click to replace</span>' +
            '</div>' +
            '</div>'
          : '<div class="drop-zone-empty">' +
            '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' +
            '<span class="drop-zone-text">Drag &amp; drop an image here</span>' +
            '<span class="drop-zone-or">or</span>' +
            '<span class="drop-zone-browse btn btn-outline btn-sm">Browse Files</span>' +
            '</div>'
        ) +
        '<div class="drop-zone-uploading dz-hidden">' +
          '<div class="spinner" style="width:24px;height:24px;border-width:2px;"></div>' +
          '<span>Uploading...</span>' +
        '</div>' +
        '<input type="file" class="drop-zone-input sr-only" accept="image/jpeg,image/png,image/webp,image/gif">' +
      '</div>' +
      '<div class="drop-zone-path">' +
        '<small>' + escapeHtml(currentImagePath || 'No image') + '</small>' +
      '</div>' +
      '</div>'
    );
  }

  /** Bind drag-and-drop + click events on all .drop-zone elements inside a container */
  function bindDropZones(container) {
    container.querySelectorAll('.drop-zone').forEach(function (zone) {
      var fileInput = zone.querySelector('.drop-zone-input');

      // Click to browse
      zone.addEventListener('click', function (e) {
        if (e.target.closest('.drop-zone-input')) return;
        fileInput.click();
      });

      // File input change
      fileInput.addEventListener('change', function () {
        if (fileInput.files.length) {
          handleDropZoneFile(zone, fileInput.files[0]);
        }
      });

      // Drag events
      zone.addEventListener('dragover', function (e) {
        e.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
      });
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
          handleDropZoneFile(zone, e.dataTransfer.files[0]);
        }
      });
    });
  }

  /** Handle a dropped/selected file for a drop zone */
  async function handleDropZoneFile(zone, file) {
    var section = zone.dataset.section;
    var index = parseInt(zone.dataset.index);
    var fieldKey = zone.dataset.field;

    // Show uploading state
    var uploading = zone.querySelector('.drop-zone-uploading');
    var preview = zone.querySelector('.drop-zone-preview') || zone.querySelector('.drop-zone-empty');
    if (preview) preview.classList.add('dz-hidden');
    uploading.classList.remove('dz-hidden');

    try {
      var targetPath = generateImagePath(file, section, index);
      var result = await uploadImageToGitHub(file, targetPath);

      if (result) {
        // Update contentData — handle object sections (hero) vs array sections
        if (section === 'hero') {
          contentData.hero[fieldKey] = result;
        } else {
          var arr = contentData[section];
          if (arr && arr[index]) {
            arr[index][fieldKey] = result;
          }
        }
        markDirty();
        showToast('Image uploaded! Remember to save.', 'success');
        // Re-render section to show new preview
        renderCurrentSection();
      } else {
        // Validation failed — restore previous state
        uploading.classList.add('dz-hidden');
        if (preview) preview.classList.remove('dz-hidden');
      }
    } catch (err) {
      showToast('Upload failed: ' + err.message, 'error', 6000);
      uploading.classList.add('dz-hidden');
      if (preview) preview.classList.remove('dz-hidden');
    }
  }

  // ================================================
  // NAVIGATION
  // ================================================
  function initNavigation() {
    // Sidebar nav links
    $$('.nav-link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        navigateTo(link.dataset.section);
      });
    });

    // Dashboard stat cards and quick action buttons
    document.addEventListener('click', function (e) {
      var card = e.target.closest('.stat-card[data-link]');
      if (card) navigateTo(card.dataset.link);

      var navBtn = e.target.closest('[data-nav]');
      if (navBtn) navigateTo(navBtn.dataset.nav);
    });

    // Save & Download buttons (global, per-section, unsaved bar)
    document.addEventListener('click', function (e) {
      if (
        e.target.closest('#global-save-btn') ||
        e.target.closest('.save-btn') ||
        e.target.closest('#unsaved-save-btn')
      ) {
        saveToGitHub();
      }
    });

    // Reset buttons
    document.addEventListener('click', function (e) {
      if (
        e.target.closest('.reset-section-btn') ||
        e.target.closest('#unsaved-reset-btn')
      ) {
        resetContent();
      }
    });

    // Info banner dismiss
    var bannerClose = $('#info-banner-close');
    if (bannerClose) {
      bannerClose.addEventListener('click', function () {
        var banner = $('#info-banner');
        if (banner) banner.classList.add('hidden');
      });
    }

    // Mobile sidebar
    $('#hamburger').addEventListener('click', function () {
      sidebar.classList.add('open');
      sidebarOverlay.classList.add('visible');
    });
    var closeSidebar = function () {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('visible');
    };
    $('#sidebar-close').addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);

    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', function (e) {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  function navigateTo(section) {
    currentSection = section;

    // Update nav active state
    $$('.nav-link').forEach(function (l) {
      l.classList.remove('active');
    });
    var activeLink = $('[data-section="' + section + '"].nav-link');
    if (activeLink) activeLink.classList.add('active');

    // Show the right page
    $$('.page').forEach(function (p) {
      p.style.display = 'none';
    });
    var page = $('#page-' + section);
    if (page) page.style.display = '';

    // Update mobile header
    var titleMap = {
      dashboard: 'Dashboard',
      business: 'Business Info',
      hero: 'Hero Section',
      stats: 'Stats',
      services: 'Services',
      gallery: 'Gallery',
      testimonials: 'Testimonials',
      faq: 'FAQ',
      about: 'About',
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
    }
  }

  // ================================================
  // DASHBOARD RENDERER
  // ================================================
  function renderDashboard() {
    if (!contentData) return;
    var d = contentData;

    $('#dash-services-count').textContent = d.services ? d.services.length : 0;
    $('#dash-testimonials-count').textContent = d.testimonials
      ? d.testimonials.length
      : 0;
    $('#dash-gallery-count').textContent = d.gallery ? d.gallery.length : 0;
    $('#dash-faq-count').textContent = d.faq ? d.faq.length : 0;

    $('#dash-biz-name').textContent = (d.business && d.business.name) || '--';
    $('#dash-biz-phone').textContent = (d.business && d.business.phone) || '--';
    $('#dash-biz-email').textContent = (d.business && d.business.email) || '--';
    $('#dash-biz-year').textContent =
      (d.business && d.business.yearEstablished) || '--';

    var sidebarName = $('#sidebar-business-name');
    if (sidebarName) {
      sidebarName.textContent = (d.business && d.business.name) || 'CRM Panel';
    }

    $('#dash-last-loaded').textContent = formatDate(new Date());
  }

  // ================================================
  // BUSINESS INFO RENDERER
  // ================================================
  function renderBusiness() {
    if (!contentData) return;
    var b = contentData.business;
    $('#biz-name').value = b.name || '';
    $('#biz-tagline').value = b.tagline || '';
    $('#biz-phone').value = b.phone || '';
    $('#biz-email').value = b.email || '';
    $('#biz-address').value = b.address || '';
    $('#biz-hours').value = b.hours || '';
    $('#biz-year').value = b.yearEstablished || '';
    $('#biz-license').value = b.license || '';
  }

  function initBusinessBindings() {
    var fields = {
      'biz-name': 'name',
      'biz-tagline': 'tagline',
      'biz-phone': 'phone',
      'biz-email': 'email',
      'biz-address': 'address',
      'biz-hours': 'hours',
      'biz-license': 'license',
    };

    Object.keys(fields).forEach(function (id) {
      var el = $('#' + id);
      if (el) {
        el.addEventListener('input', function () {
          contentData.business[fields[id]] = el.value;
          markDirty();
        });
      }
    });

    var yearEl = $('#biz-year');
    if (yearEl) {
      yearEl.addEventListener('input', function () {
        contentData.business.yearEstablished = parseInt(yearEl.value) || 0;
        markDirty();
      });
    }
  }

  // ================================================
  // HERO SECTION RENDERER
  // ================================================
  function renderHero() {
    if (!contentData) return;
    var h = contentData.hero;
    $('#hero-headline').value = h.headline || '';
    $('#hero-subheadline').value = h.subheadline || '';
    $('#hero-cta').value = h.cta || '';
    $('#hero-ctaphone').value = h.ctaPhone || '';
    renderTrustBadges();

    // Hero background image drop zone
    var zoneContainer = $('#hero-image-zone');
    if (zoneContainer) {
      zoneContainer.innerHTML =
        '<div class="form-group full-width">' +
          '<label>Hero Background Image</label>' +
          '<p class="drop-zone-hint">Recommended: <strong>1920 &times; 1080 px</strong> (landscape). JPG or PNG, under 5 MB.</p>' +
        '</div>' +
        dropZoneHtml(h.heroImage || '', 'hero', 0, 'heroImage');
      bindDropZones(zoneContainer);
    }
  }

  function renderTrustBadges() {
    var list = $('#hero-badges-list');
    var badges = contentData.hero.trustBadges || [];
    list.innerHTML = badges
      .map(function (badge, i) {
        return (
          '<span class="tag-item">' +
          escapeHtml(badge) +
          '<button type="button" class="tag-remove" data-badge-index="' +
          i +
          '" aria-label="Remove">&times;</button>' +
          '</span>'
        );
      })
      .join('');
  }

  function initHeroBindings() {
    var heroFields = {
      'hero-headline': 'headline',
      'hero-subheadline': 'subheadline',
      'hero-cta': 'cta',
      'hero-ctaphone': 'ctaPhone',
    };

    Object.keys(heroFields).forEach(function (id) {
      var el = $('#' + id);
      if (el) {
        el.addEventListener('input', function () {
          contentData.hero[heroFields[id]] = el.value;
          markDirty();
        });
      }
    });

    // Add badge
    $('#hero-add-badge').addEventListener('click', function () {
      var input = $('#hero-badge-input');
      var val = input.value.trim();
      if (!val) return;
      if (!contentData.hero.trustBadges) contentData.hero.trustBadges = [];
      contentData.hero.trustBadges.push(val);
      input.value = '';
      renderTrustBadges();
      markDirty();
    });

    // Enter key to add badge
    $('#hero-badge-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('#hero-add-badge').click();
      }
    });

    // Remove badge (delegated)
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-badge-index]');
      if (btn) {
        var idx = parseInt(btn.dataset.badgeIndex);
        contentData.hero.trustBadges.splice(idx, 1);
        renderTrustBadges();
        markDirty();
      }
    });
  }

  // ================================================
  // ARRAY ITEM CARD HELPERS
  // ================================================

  /** Create the HTML for a collapsible item card */
  function createItemCard(index, title, fieldsHtml, options) {
    options = options || {};
    var section = options.section || '';
    var isOpen = options.open ? ' open' : '';
    return (
      '<div class="item-card' +
      isOpen +
      '" data-index="' +
      index +
      '">' +
      '<div class="item-card-header">' +
      '<span class="item-card-title">' +
      '<span class="item-index">' +
      (index + 1) +
      '</span>' +
      escapeHtml(title || 'Untitled') +
      '</span>' +
      '<div class="item-card-actions">' +
      '<button type="button" class="btn-icon danger delete-item-btn" data-section="' +
      section +
      '" data-index="' +
      index +
      '" title="Delete">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
      '</button>' +
      '<svg class="chevron-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</div>' +
      '</div>' +
      '<div class="item-card-body">' +
      '<div class="form-grid">' +
      fieldsHtml +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  /** Bind collapse/expand toggle on item card headers */
  function bindItemCardToggles(container) {
    container.querySelectorAll('.item-card-header').forEach(function (header) {
      header.addEventListener('click', function (e) {
        if (e.target.closest('.btn-icon')) return;
        header.closest('.item-card').classList.toggle('open');
      });
    });
  }

  /** Generic text input field */
  function field(label, value, attrs) {
    attrs = attrs || '';
    return (
      '<div class="form-group">' +
      '<label>' +
      escapeHtml(label) +
      '</label>' +
      '<input type="text" value="' +
      escapeAttr(value || '') +
      '" ' +
      attrs +
      '>' +
      '</div>'
    );
  }

  /** Generic textarea field */
  function textareaField(label, value, attrs, rows) {
    attrs = attrs || '';
    rows = rows || 3;
    return (
      '<div class="form-group full-width">' +
      '<label>' +
      escapeHtml(label) +
      '</label>' +
      '<textarea rows="' +
      rows +
      '" ' +
      attrs +
      '>' +
      escapeHtml(value || '') +
      '</textarea>' +
      '</div>'
    );
  }

  /** Bind inputs in an item list container to update contentData[section][index][key] */
  function bindItemInputs(container, section) {
    container.querySelectorAll('input, textarea').forEach(function (input) {
      if (input.dataset.subsection) return; // handled separately
      input.addEventListener('input', function () {
        var idx = parseInt(input.dataset.index);
        var key = input.dataset.key;
        if (key === undefined || isNaN(idx)) return;

        var arr = contentData[section];
        if (arr && arr[idx]) {
          var val = input.value;
          if (input.dataset.type === 'number') {
            val = parseFloat(val) || 0;
          }
          arr[idx][key] = val;
          markDirty();
        }
      });
    });
  }

  // ================================================
  // STATS RENDERER
  // ================================================
  function renderStats() {
    if (!contentData) return;
    var list = $('#stats-list');
    var stats = contentData.stats || [];

    if (stats.length === 0) {
      list.innerHTML =
        '<div class="empty-state">No stats yet. Click "Add Stat" to create one.</div>';
      return;
    }

    list.innerHTML = stats
      .map(function (stat, i) {
        var fields =
          field('Number', stat.number, 'data-key="number" data-index="' + i + '" data-type="number"') +
          field('Suffix', stat.suffix, 'data-key="suffix" data-index="' + i + '"') +
          '<div class="form-group full-width">' +
          '<label>Label</label>' +
          '<input type="text" value="' +
          escapeAttr(stat.label || '') +
          '" data-key="label" data-index="' +
          i +
          '">' +
          '</div>';
        return createItemCard(
          i,
          stat.number + (stat.suffix || '') + ' ' + (stat.label || ''),
          fields,
          { section: 'stats' }
        );
      })
      .join('');

    bindItemCardToggles(list);
    bindItemInputs(list, 'stats');
  }

  function initStats() {
    $('#add-stat-btn').addEventListener('click', function () {
      if (!contentData.stats) contentData.stats = [];
      contentData.stats.push({ number: 0, suffix: '+', label: 'New Stat' });
      renderStats();
      markDirty();
      // Open the last card
      var cards = $$('.item-card', $('#stats-list'));
      if (cards.length) cards[cards.length - 1].classList.add('open');
    });
  }

  // ================================================
  // SERVICES RENDERER
  // ================================================
  function renderServices() {
    if (!contentData) return;
    var list = $('#services-list');
    var services = contentData.services || [];

    if (services.length === 0) {
      list.innerHTML =
        '<div class="empty-state">No services yet. Click "Add Service" to create one.</div>';
      return;
    }

    list.innerHTML = services
      .map(function (svc, i) {
        var fields =
          field('ID (slug)', svc.id, 'data-key="id" data-index="' + i + '"') +
          field('Title', svc.title, 'data-key="title" data-index="' + i + '"') +
          field('Icon', svc.icon, 'data-key="icon" data-index="' + i + '"') +
          dropZoneHtml(svc.image, 'services', i, 'image') +
          textareaField(
            'Description',
            svc.description,
            'data-key="description" data-index="' + i + '"'
          );
        return createItemCard(i, svc.title, fields, { section: 'services' });
      })
      .join('');

    bindItemCardToggles(list);
    bindItemInputs(list, 'services');
    bindDropZones(list);
  }

  function initServices() {
    $('#add-service-btn').addEventListener('click', function () {
      if (!contentData.services) contentData.services = [];
      contentData.services.push({
        id: 'new-service',
        title: 'New Service',
        description: '',
        icon: 'star',
        image: 'images/placeholder.png',
      });
      renderServices();
      markDirty();
      var cards = $$('.item-card', $('#services-list'));
      if (cards.length) cards[cards.length - 1].classList.add('open');
    });
  }

  // ================================================
  // GALLERY RENDERER
  // ================================================
  function renderGallery() {
    if (!contentData) return;
    var list = $('#gallery-list');
    var gallery = contentData.gallery || [];

    if (gallery.length === 0) {
      list.innerHTML =
        '<div class="empty-state">No gallery items yet. Click "Add Gallery Item" to create one.</div>';
      return;
    }

    list.innerHTML = gallery
      .map(function (item, i) {
        var fields =
          dropZoneHtml(item.image, 'gallery', i, 'image') +
          field('Caption', item.caption, 'data-key="caption" data-index="' + i + '"') +
          field('Category', item.category, 'data-key="category" data-index="' + i + '"');
        return createItemCard(i, item.caption, fields, { section: 'gallery' });
      })
      .join('');

    bindItemCardToggles(list);
    bindItemInputs(list, 'gallery');
    bindDropZones(list);
  }

  function initGallery() {
    $('#add-gallery-btn').addEventListener('click', function () {
      if (!contentData.gallery) contentData.gallery = [];
      contentData.gallery.push({
        image: '',
        caption: 'New Project',
        category: 'general',
      });
      renderGallery();
      markDirty();
      var cards = $$('.item-card', $('#gallery-list'));
      if (cards.length) cards[cards.length - 1].classList.add('open');
    });
  }

  // ================================================
  // TESTIMONIALS RENDERER
  // ================================================
  function renderTestimonials() {
    if (!contentData) return;
    var list = $('#testimonials-list');
    var testimonials = contentData.testimonials || [];

    if (testimonials.length === 0) {
      list.innerHTML =
        '<div class="empty-state">No testimonials yet. Click "Add Testimonial" to create one.</div>';
      return;
    }

    list.innerHTML = testimonials
      .map(function (t, i) {
        var starsHtml =
          '<div class="form-group">' +
          '<label>Rating</label>' +
          '<div class="star-rating-input" data-index="' +
          i +
          '">' +
          [1, 2, 3, 4, 5]
            .map(function (n) {
              return (
                '<button type="button" class="star-btn ' +
                (n <= (t.rating || 5) ? 'active' : '') +
                '" data-rating="' +
                n +
                '" data-index="' +
                i +
                '">&#9733;</button>'
              );
            })
            .join('') +
          '</div>' +
          '</div>';

        var fields =
          field('Customer Name', t.name, 'data-key="name" data-index="' + i + '"') +
          starsHtml +
          field('Service', t.service, 'data-key="service" data-index="' + i + '"') +
          textareaField(
            'Testimonial Text',
            t.text,
            'data-key="text" data-index="' + i + '"',
            4
          );
        return createItemCard(i, t.name, fields, { section: 'testimonials' });
      })
      .join('');

    bindItemCardToggles(list);
    bindItemInputs(list, 'testimonials');

    // Star rating clicks
    list.querySelectorAll('.star-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.dataset.index);
        var rating = parseInt(btn.dataset.rating);
        contentData.testimonials[idx].rating = rating;
        markDirty();
        // Update UI
        var container = btn.closest('.star-rating-input');
        container.querySelectorAll('.star-btn').forEach(function (s) {
          s.classList.toggle('active', parseInt(s.dataset.rating) <= rating);
        });
      });
    });
  }

  function initTestimonials() {
    $('#add-testimonial-btn').addEventListener('click', function () {
      if (!contentData.testimonials) contentData.testimonials = [];
      contentData.testimonials.push({
        name: 'New Customer',
        rating: 5,
        text: '',
        service: 'House Washing',
      });
      renderTestimonials();
      markDirty();
      var cards = $$('.item-card', $('#testimonials-list'));
      if (cards.length) cards[cards.length - 1].classList.add('open');
    });
  }

  // ================================================
  // FAQ RENDERER
  // ================================================
  function renderFaq() {
    if (!contentData) return;
    var list = $('#faq-list');
    var faq = contentData.faq || [];

    if (faq.length === 0) {
      list.innerHTML =
        '<div class="empty-state">No FAQ items yet. Click "Add FAQ" to create one.</div>';
      return;
    }

    list.innerHTML = faq
      .map(function (item, i) {
        var fields =
          '<div class="form-group full-width">' +
          '<label>Question</label>' +
          '<input type="text" value="' +
          escapeAttr(item.question || '') +
          '" data-key="question" data-index="' +
          i +
          '">' +
          '</div>' +
          textareaField(
            'Answer',
            item.answer,
            'data-key="answer" data-index="' + i + '"',
            4
          );
        return createItemCard(i, item.question, fields, { section: 'faq' });
      })
      .join('');

    bindItemCardToggles(list);
    bindItemInputs(list, 'faq');
  }

  function initFaq() {
    $('#add-faq-btn').addEventListener('click', function () {
      if (!contentData.faq) contentData.faq = [];
      contentData.faq.push({
        question: 'New Question?',
        answer: '',
      });
      renderFaq();
      markDirty();
      var cards = $$('.item-card', $('#faq-list'));
      if (cards.length) cards[cards.length - 1].classList.add('open');
    });
  }

  // ================================================
  // ABOUT RENDERER
  // ================================================
  function renderAbout() {
    if (!contentData) return;
    var about = contentData.about;
    $('#about-headline').value = about.headline || '';
    $('#about-description').value = about.description || '';
    renderValues();
  }

  function renderValues() {
    var list = $('#values-list');
    var values = contentData.about.values || [];

    if (values.length === 0) {
      list.innerHTML =
        '<div class="empty-state">No values yet. Click "Add Value" to create one.</div>';
      return;
    }

    list.innerHTML = values
      .map(function (v, i) {
        var fields =
          '<div class="form-group full-width">' +
          '<label>Title</label>' +
          '<input type="text" value="' +
          escapeAttr(v.title || '') +
          '" data-key="title" data-index="' +
          i +
          '" data-subsection="values">' +
          '</div>' +
          textareaField(
            'Description',
            v.description,
            'data-key="description" data-index="' + i + '" data-subsection="values"'
          );
        return createItemCard(i, v.title, fields, { section: 'values' });
      })
      .join('');

    bindItemCardToggles(list);

    // Bind value inputs
    list.querySelectorAll('input, textarea').forEach(function (input) {
      input.addEventListener('input', function () {
        var idx = parseInt(input.dataset.index);
        var key = input.dataset.key;
        if (contentData.about.values[idx]) {
          contentData.about.values[idx][key] = input.value;
          markDirty();
        }
      });
    });
  }

  function initAbout() {
    // Bind live updates for about headline/description
    $('#about-headline').addEventListener('input', function (e) {
      contentData.about.headline = e.target.value;
      markDirty();
    });
    $('#about-description').addEventListener('input', function (e) {
      contentData.about.description = e.target.value;
      markDirty();
    });

    $('#add-value-btn').addEventListener('click', function () {
      if (!contentData.about.values) contentData.about.values = [];
      contentData.about.values.push({
        title: 'New Value',
        description: '',
      });
      renderValues();
      markDirty();
      var cards = $$('.item-card', $('#values-list'));
      if (cards.length) cards[cards.length - 1].classList.add('open');
    });
  }

  // ================================================
  // DELETE ITEMS
  // ================================================
  function initDeleteHandler() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.delete-item-btn');
      if (!btn) return;
      e.stopPropagation();

      var section = btn.dataset.section;
      var index = parseInt(btn.dataset.index);

      // Values (nested under about)
      if (section === 'values') {
        if (!confirm('Delete this value?')) return;
        contentData.about.values.splice(index, 1);
        renderValues();
        markDirty();
        return;
      }

      // Top-level arrays
      var sectionData = contentData[section];
      if (!sectionData) return;

      var singularNames = {
        stats: 'stat',
        services: 'service',
        gallery: 'gallery item',
        testimonials: 'testimonial',
        faq: 'FAQ item',
      };
      var itemName = singularNames[section] || 'item';

      if (!confirm('Delete this ' + itemName + '?')) return;
      sectionData.splice(index, 1);
      renderCurrentSection();
      markDirty();
    });
  }

  // ================================================
  // SETTINGS (disconnect)
  // ================================================
  function initSettings() {
    var disconnectBtn = $('#settings-disconnect-btn');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', function () {
        if (!confirm('Log out? You will need to enter your password again.')) return;
        clearSessionToken();
        contentData = null;
        originalData = null;
        contentSha = null;
        hasUnsavedChanges = false;
        showSetup();
        showToast('Logged out', 'info');
      });
    }
  }

  // ================================================
  // INIT
  // ================================================
  function init() {
    initSetup();
    initNavigation();
    initBusinessBindings();
    initHeroBindings();
    initStats();
    initServices();
    initGallery();
    initTestimonials();
    initFaq();
    initAbout();
    initDeleteHandler();
    initSettings();

    // Prevent browser from opening dropped files outside drop zones
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) { e.preventDefault(); });

    // Migration: if old localStorage token exists, use it for this session
    var legacyToken = localStorage.getItem('sudsaway_gh_token');
    if (legacyToken && !isConnected()) {
      setSessionToken(legacyToken);
      localStorage.removeItem('sudsaway_gh_token');
    }

    // Check if already connected (session token exists)
    if (isConnected()) {
      showApp();
      loadContent();
    } else {
      showSetup();
    }
  }

  // Run when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
