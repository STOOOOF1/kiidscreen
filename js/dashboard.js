/* ─── KiidScreen Parent Dashboard ───
 * Full dashboard UI: manage categories/videos, settings, preview.
 */

const Dashboard = (() => {
  let categories = [];
  let selectedCatId = null;
  let settings = {};
  let dragIndex = null;
  let dragCatId = null;
  let _initialized = false;

  /* ─── Load data from storage ─── */
  async function loadData() {
    categories = await Storage.getCategories();
    settings = await Storage.getSettings();
    if (categories.length > 0) {
      if (!selectedCatId || !categories.find(c => c.id === selectedCatId)) {
        selectedCatId = categories[0].id;
      }
    }
  }

  /* ─── Render ─── */
  function renderCatTabs() {
    const container = document.getElementById('dash-cat-tabs');
    const selected = document.getElementById('dash-cat-selected');
    const addVideoBar = document.getElementById('dash-cat-add-video');

    if (!categories.length) {
      container.innerHTML = '<div class="empty-msg" style="padding:1rem 0;">لا توجد أقسام بعد. أضف قسماً جديداً للبدء.</div>';
      selected.textContent = '';
      addVideoBar.style.display = 'none';
      document.getElementById('dash-video-list').innerHTML = '<div class="empty-msg">أضف قسماً أولاً</div>';
      return;
    }

    if (!selectedCatId || !categories.find(c => c.id === selectedCatId)) {
      selectedCatId = categories[0].id;
    }

    addVideoBar.style.display = 'flex';

    container.innerHTML = categories.map((c, idx) => {
      const isActive = c.id === selectedCatId;
      return `<div class="cat-tab ${isActive ? 'active' : ''}" data-cat-id="${c.id}">
        <span>${c.icon || '📁'} ${c.name}</span>
        <span style="font-size:0.7rem;opacity:0.5;margin:0 4px;">(${(c.videos||[]).length})</span>
        <button class="cat-del" data-cat-id="${c.id}" title="حذف القسم">✕</button>
      </div>`;
    }).join('');

    const cat = categories.find(c => c.id === selectedCatId);
    selected.textContent = cat ? `📁 ${cat.icon || ''} ${cat.name} · ${(cat.videos||[]).length} فيديو` : '';
  }

  function renderVideoList() {
    const list = document.getElementById('dash-video-list');
    const cat = categories.find(c => c.id === selectedCatId);
    const videos = cat ? cat.videos : [];

    if (!videos.length) {
      list.innerHTML = `<div class="empty-state">
        <div class="icon">📹</div>
        <p>لا توجد فيديوهات في هذا القسم. أضف فيديو من الأعلى.</p>
      </div>`;
      return;
    }

    list.innerHTML = videos.map((v, i) => {
      const info = VideoHandler.getDisplayInfo(v.url);
      return `<div class="video-item" data-index="${i}" data-video-id="${v.id}" draggable="true">
        <div class="reorder-handle" data-index="${i}">
          <svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
        </div>
        <div class="video-thumb">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <div class="video-info">
          <div class="title" title="${v.title || info.short}">${v.title || info.short}</div>
          <div class="url" title="${v.url}">${v.url}</div>
          <span class="type-badge">${info.type}</span>
        </div>
        <button class="video-delete" data-video-id="${v.id}" title="حذف">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>`;
    }).join('');
  }

  function renderSettings() {
    document.getElementById('dash-back-count').value = settings.backPressCount || 3;
    document.getElementById('dash-hours').value = settings.timeLimitHours || 0;
    document.getElementById('dash-minutes').value = settings.timeLimitMinutes || 0;
    document.getElementById('dash-fullscreen').checked = settings.fullscreen !== false;
  }

  function renderFirebaseConfig() {
    const cfg = Storage.getFirebaseConfig();
    if (cfg) {
      document.getElementById('dash-fb-apikey').value = cfg.apiKey || '';
      document.getElementById('dash-fb-project').value = cfg.projectId || '';
      document.getElementById('dash-fb-auth').value = cfg.authDomain || '';
    }
  }

  function showMsg(text, type = 'success') {
    const el = document.getElementById('dash-msg');
    el.textContent = text;
    el.className = `msg msg-${type}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  function renderExitAttempts() {
    const container = document.getElementById('dash-attempts');
    if (!container) return;
    try {
      const data = JSON.parse(localStorage.getItem('kiidscreen_exit_attempts') || '{"count":0}');
      if (data.count > 0) {
        const time = data.lastTs ? new Date(data.lastTs).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '';
        container.style.display = 'block';
        container.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;padding:0.7rem 1rem;background:rgba(255,167,38,0.12);border:1px solid rgba(255,167,38,0.3);border-radius:var(--radius-sm);">
            <span style="font-size:1.2rem;">⚠️</span>
            <span style="flex:1;font-size:0.9rem;">
              الطفل حاول الخروج <strong>${data.count}</strong> مرة
              ${time ? '· آخرها الساعة ' + time : ''}
            </span>
            <button class="btn btn-sm btn-secondary" id="dash-clear-attempts" style="font-size:0.8rem;">مسح</button>
          </div>
        `;
        document.getElementById('dash-clear-attempts')?.addEventListener('click', () => {
          localStorage.setItem('kiidscreen_exit_attempts', '{"count":0,"firstTs":0,"lastTs":0}');
          container.style.display = 'none';
          showMsg('تم مسح محاولات الخروج', 'success');
        });
      } else {
        container.style.display = 'none';
      }
    } catch { container.style.display = 'none'; }
  }

  function switchTab(name) {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
    const tab = document.querySelector(`.dash-tab[data-tab="${name}"]`);
    const panel = document.getElementById(`dash-panel-${name}`);
    if (tab) tab.classList.add('active');
    if (panel) panel.classList.add('active');
  }

  /* ─── Event delegation for dynamic content ─── */
  function setupDelegation() {
    const videoPanel = document.getElementById('dash-panel-videos');
    if (!videoPanel) return;

    // Remove old listener to prevent accumulation, then add once
    videoPanel.removeEventListener('click', delegationHandler);
    videoPanel.addEventListener('click', delegationHandler);
  }

  function delegationHandler(e) {
    const target = e.target;

    // Category tab click
    const catTab = target.closest('.cat-tab');
    if (catTab && !target.closest('.cat-del')) {
      const id = catTab.dataset.catId;
      if (id && id !== selectedCatId) {
        selectedCatId = id;
        renderCatTabs();
        renderVideoList();
      }
      return;
    }

    // Category delete
    if (target.closest('.cat-del')) {
      const id = target.closest('.cat-del').dataset.catId;
      const cat = categories.find(c => c.id === id);
      if (cat && cat.videos && cat.videos.length > 0) {
        if (!confirm(`هذا القسم يحتوي على ${cat.videos.length} فيديو. هل تريد حذفه؟`)) return;
      }
      Storage.deleteCategory(id).then(newCats => {
        categories = newCats;
        renderCatTabs();
        renderVideoList();
        showMsg('تم حذف القسم', 'success');
      });
      return;
    }

    // Video delete
    if (target.closest('.video-delete')) {
      const btn = target.closest('.video-delete');
      const vid = btn.dataset.videoId;
      const cid = selectedCatId;
      Storage.deleteVideoFromCategory(cid, vid).then(newCats => {
        categories = newCats;
        renderVideoList();
        renderCatTabs();
        showMsg('تم حذف الفيديو', 'success');
      });
      return;
    }
  }

  /* ─── One-time init (listeners only) ─── */
  async function init() {
    if (_initialized) return;
    _initialized = true;

    await loadData();

    renderExitAttempts();
    renderCatTabs();
    renderVideoList();
    renderSettings();
    renderFirebaseConfig();

    // Tab buttons (static)
    document.querySelectorAll('.dash-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Add category (static)
    document.getElementById('dash-cat-add-btn').addEventListener('click', async () => {
      const name = prompt('اسم القسم الجديد:');
      if (!name || !name.trim()) return;
      categories = await Storage.addCategory(name.trim());
      selectedCatId = categories[categories.length - 1].id;
      renderCatTabs();
      renderVideoList();
      showMsg('تم إضافة القسم الجديد', 'success');
    });

    // Add video (static)
    document.getElementById('dash-add-video-btn').addEventListener('click', async () => {
      if (!selectedCatId) { showMsg('الرجاء اختيار قسم أولاً', 'error'); return; }
      const urlInput = document.getElementById('dash-video-url');
      const titleInput = document.getElementById('dash-video-title');
      const url = urlInput.value.trim();
      if (!url) { showMsg('الرجاء إدخال رابط الفيديو', 'error'); return; }
      const info = VideoHandler.detectType(url);
      if (!info || info.type === 'unknown') {
        showMsg('رابط غير مدعوم. استخدم YouTube, Vimeo, أو رابط مباشر', 'error');
        return;
      }
      categories = await Storage.addVideoToCategory(selectedCatId, {
        url,
        title: titleInput.value.trim() || ''
      });
      renderCatTabs();
      renderVideoList();
      urlInput.value = '';
      titleInput.value = '';
      showMsg('تمت إضافة الفيديو بنجاح', 'success');
    });

    // Enter on URL
    document.getElementById('dash-video-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('dash-add-video-btn').click();
    });

    // Save settings (static)
    document.getElementById('dash-save-settings').addEventListener('click', async () => {
      const backCount = parseInt(document.getElementById('dash-back-count').value) || 3;
      const hours = parseInt(document.getElementById('dash-hours').value) || 0;
      const minutes = parseInt(document.getElementById('dash-minutes').value) || 0;
      const fullscreen = document.getElementById('dash-fullscreen').checked;
      settings.backPressCount = Math.max(1, Math.min(10, backCount));
      settings.timeLimitHours = Math.max(0, Math.min(12, hours));
      settings.timeLimitMinutes = Math.max(0, Math.min(59, minutes));
      settings.fullscreen = fullscreen;
      await Storage.saveSettings(settings);
      showMsg('تم حفظ الإعدادات بنجاح', 'success');
      if (window.KiidApp && window.KiidApp.onSettingsChanged) {
        window.KiidApp.onSettingsChanged(settings);
      }
    });

    // Change PIN (static)
    document.getElementById('dash-change-pin').addEventListener('click', async () => {
      const newPin = document.getElementById('dash-new-pin').value;
      const confirmPin = document.getElementById('dash-confirm-pin').value;
      if (!newPin || newPin.length < 4 || newPin.length > 6) {
        showMsg('ال PIN يجب أن يكون 4-6 أرقام', 'error');
        return;
      }
      if (newPin !== confirmPin) {
        showMsg('ال PIN غير متطابق', 'error');
        return;
      }
      await Storage.setPIN(newPin);
      document.getElementById('dash-new-pin').value = '';
      document.getElementById('dash-confirm-pin').value = '';
      showMsg('تم تغيير PIN بنجاح', 'success');
    });

    // Firebase save (static)
    document.getElementById('dash-save-firebase').addEventListener('click', async () => {
      const config = {
        apiKey: document.getElementById('dash-fb-apikey').value.trim(),
        projectId: document.getElementById('dash-fb-project').value.trim(),
        authDomain: document.getElementById('dash-fb-auth').value.trim()
      };
      if (!config.apiKey || !config.projectId) {
        showMsg('الرجاء إدخال API Key و Project ID', 'error');
        return;
      }
      const ok = await Storage.setFirebaseConfig(config);
      if (ok) showMsg('تم حفظ إعدادات Firebase بنجاح', 'success');
      else showMsg('تم حفظ الإعدادات لكن تعذر الاتصال بـ Firebase', 'error');
    });

    // Firebase clear (static)
    document.getElementById('dash-clear-firebase').addEventListener('click', async () => {
      await Storage.setFirebaseConfig(null);
      document.getElementById('dash-fb-apikey').value = '';
      document.getElementById('dash-fb-project').value = '';
      document.getElementById('dash-fb-auth').value = '';
      showMsg('تم إزالة إعدادات Firebase', 'success');
    });

    // YouTube diagnostic (static)
    document.getElementById('dash-diagnose-btn').addEventListener('click', async () => {
      const vid = document.getElementById('dash-diagnose-url').value.trim();
      const out = document.getElementById('dash-diagnose-result');
      if (!vid) { out.textContent = 'الرجاء إدخال YouTube Video ID'; return; }
      out.textContent = 'جارٍ الفحص...';
      try {
        const r = await VideoHandler.testYouTubeEmbed(vid);
        out.textContent = JSON.stringify(r, null, 2);
      } catch (e) {
        out.textContent = 'خطأ: ' + e.message;
      }
    });

    // Preview (static)
    document.getElementById('dash-preview-btn').addEventListener('click', () => {
      const url = document.getElementById('dash-preview-url').value.trim();
      const container = document.getElementById('dash-preview');
      if (!url) { container.innerHTML = ''; return; }
      const info = VideoHandler.detectType(url);
      if (!info || info.type === 'unknown') {
        container.innerHTML = '<p style="color:#ef5350;">رابط غير مدعوم</p>';
        return;
      }
      VideoHandler.play(info, container);
    });

    // Logout (static)
    document.getElementById('dash-logout-btn').addEventListener('click', () => {
      if (window.KiidApp) window.KiidApp.goToKidMode();
    });

    // Event delegation for dynamic category/video content
    setupDelegation();

    switchTab('videos');
  }

  /* ─── Public: refresh data and UI (safe to call repeatedly) ─── */
  async function refresh() {
    if (!_initialized) {
      await init();
      return;
    }
    await loadData();
    renderExitAttempts();
    renderCatTabs();
    renderVideoList();
    setupDelegation();
  }

  return { init, refresh };
})();
