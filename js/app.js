/* ─── KiidScreen App Controller ───
 * Main controller: state management, mode switching, initialization.
 */

const KiidApp = (() => {
  let categories = [];
  let currentKidCatId = null;
  let settings = {};
  let currentVideoIndex = 0;
  let currentMode = 'kid';

  const $ = id => document.getElementById(id);

  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = $(screenId);
    if (el) el.classList.add('active');
  }

  function showOverlay(overlayId) {
    document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active'));
    const el = $(overlayId);
    if (el) el.classList.add('active');
  }

  function hideOverlay(id) {
    const el = $(id);
    if (el) el.classList.remove('active');
  }

  function getActiveVideos() {
    const cat = categories.find(c => c.id === currentKidCatId);
    return cat ? cat.videos || [] : [];
  }

  /* ─── Kid Mode Category Bar ─── */
  function renderKidCatBar() {
    const bar = $('kid-cat-bar');
    if (!categories.length) {
      bar.innerHTML = '';
      return;
    }
    if (!currentKidCatId || !categories.find(c => c.id === currentKidCatId)) {
      currentKidCatId = categories[0].id;
    }
    bar.innerHTML = categories.map(c => {
      const active = c.id === currentKidCatId;
      const color = c.color || '#4fc3f7';
      return `<button class="kid-cat-btn ${active ? 'active' : ''}" data-cat-id="${c.id}" style="${active ? `background:${color};border-color:${color};` : ''}">
        ${c.icon || '📁'} ${c.name}
      </button>`;
    }).join('');

    bar.querySelectorAll('.kid-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.catId;
        if (id !== currentKidCatId) {
          currentKidCatId = id;
          currentVideoIndex = 0;
          renderKidCatBar();
          playCurrentVideo();
        }
      });
    });
  }

  /* ─── Kid Mode ─── */
  async function enterKidMode() {
    currentMode = 'kid';
    showScreen('screen-kid');
    hideOverlay('pin-overlay');
    hideOverlay('blackout-overlay');

    categories = await Storage.getCategories();
    settings = await Storage.getSettings();

    Lock.destroy();
    Lock.init({
      backPressCount: settings.backPressCount || 3
    });
    Lock.onPinRequired(showPinOverlay);
    Lock.onBackPressAttempt((current, required) => {
      try {
        const data = JSON.parse(localStorage.getItem('kiidscreen_exit_attempts') || '{"count":0,"firstTs":0,"lastTs":0}');
        const now = Date.now();
        if (data.count === 0) data.firstTs = now;
        data.count++;
        data.lastTs = now;
        localStorage.setItem('kiidscreen_exit_attempts', JSON.stringify(data));
      } catch {}
    });

    if (settings.fullscreen !== false) {
      Lock.requestFullscreen();
    }

    const restored = Timer.init();
    if (!restored && !Timer.isTimerExpired()) {
      if (settings.timeLimitHours > 0 || settings.timeLimitMinutes > 0) {
        Timer.start(settings.timeLimitHours || 0, settings.timeLimitMinutes || 0);
      } else {
        Timer.reset();
      }
    }
    updateTimerDisplay();

    if (Timer.isTimerExpired()) {
      onTimerExpired();
      return;
    }

    renderKidCatBar();

    currentVideoIndex = 0;
    playCurrentVideo();

    if (window._timerInterval) clearInterval(window._timerInterval);
    window._timerInterval = setInterval(updateTimerDisplay, 1000);
  }

  function playCurrentVideo() {
    const container = $('kid-video-container');
    const noVideos = $('kid-no-videos');
    const videos = getActiveVideos();

    if (!videos || videos.length === 0) {
      container.innerHTML = '';
      noVideos.style.display = '';
      return;
    }
    noVideos.style.display = 'none';

    if (currentVideoIndex >= videos.length) currentVideoIndex = 0;
    const video = videos[currentVideoIndex];
    const info = VideoHandler.detectType(video.url);

    VideoHandler.play(info, container, (isError) => {
      currentVideoIndex++;
      if (currentVideoIndex >= videos.length) currentVideoIndex = 0;
      playCurrentVideo();
    }, (type, code) => {
      if (currentVideoIndex < videos.length - 1) {
        currentVideoIndex++;
      } else {
        currentVideoIndex = 0;
      }
      playCurrentVideo();
    });
  }

  function updateTimerDisplay() {
    const ring = $('kid-timer-ring');
    const text = $('kid-timer-text');
    const total = Timer.getTotal();
    const remaining = Timer.getRemaining();

    if (total <= 0 || remaining === Infinity) {
      ring.style.display = 'none';
      return;
    }
    ring.style.display = 'block';

    const progress = ring.querySelector('.progress');
    const circumference = 2 * Math.PI * 22;
    const offset = circumference * (1 - remaining / total);
    progress.style.strokeDasharray = circumference;
    progress.style.strokeDashoffset = offset;

    const pct = remaining / total;
    progress.classList.toggle('warning', pct > 0 && pct <= 0.25);
    progress.classList.toggle('danger', pct > 0 && pct <= 0.1);

    text.textContent = Timer.formatTime();
  }

  /* ─── PIN Overlay ─── */
  let pinContext = null;
  let pinValue = '';

  function showPinOverlay(context) {
    pinContext = context;
    pinValue = '';
    updatePinDots();
    $('pin-error').textContent = '';
    $('pin-extra-btn').style.display = context === 'blackout' ? 'none' : 'block';

    if (context === 'dashboard') {
      $('pin-title').textContent = 'دخول للوحة التحكم';
      $('pin-subtitle').textContent = 'أدخل رمز PIN للوصول للإعدادات';
      $('pin-extra-btn').textContent = 'العودة لوضع الطفل';
    } else if (context === 'exit') {
      $('pin-title').textContent = 'الخروج من التطبيق';
      $('pin-subtitle').textContent = 'أدخل رمز PIN لتأكيد الخروج';
      $('pin-extra-btn').textContent = 'دخول للوحة التحكم';
    } else {
      $('pin-title').textContent = 'انتهى وقت المشاهدة';
      $('pin-subtitle').textContent = 'أدخل رمز PIN من الوالدين للعودة';
    }

    showOverlay('pin-overlay');
  }

  function updatePinDots() {
    const container = $('pin-dots');
    container.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const dot = document.createElement('div');
      dot.className = `pin-dot${i < pinValue.length ? ' filled' : ''}`;
      container.appendChild(dot);
    }
  }

  async function handlePinSubmit() {
    if (pinValue.length < 4) return;
    const valid = await Storage.verifyPIN(pinValue);
    if (valid) {
      hideOverlay('pin-overlay');
      if (pinContext === 'dashboard') {
        enterDashboard();
      } else if (pinContext === 'exit') {
        Lock.destroy();
        Timer.reset();
        try { document.body.style.display = 'none'; } catch {}
      } else {
        Timer.reset();
        Timer.start(settings.timeLimitHours || 0, settings.timeLimitMinutes || 0);
        enterKidMode();
      }
    } else {
      $('pin-error').textContent = 'رمز PIN غير صحيح';
      pinValue = '';
      updatePinDots();
      setTimeout(() => {
        document.querySelectorAll('.pin-dot').forEach(d => d.classList.add('error'));
      }, 50);
    }
  }

  /* ─── Dashboard ─── */
  async function enterDashboard() {
    currentMode = 'dashboard';
    Lock.disableForDashboard();
    Timer.pause();
    VideoHandler.stop();
    showScreen('screen-dashboard');
    await Dashboard.refresh();
    categories = await Storage.getCategories();
    settings = await Storage.getSettings();
  }

  /* ─── Blackout ─── */
  function onTimerExpired() {
    if (currentMode === 'dashboard') return;
    currentMode = 'blackout';
    VideoHandler.pause();
    Lock.relock();
    $('blackout-overlay').classList.add('active');
  }

  function onSettingsChanged(newSettings) {
    settings = newSettings;
  }

  /* ─── Init ─── */
  async function init() {
    if (location.protocol === 'file:') {
      console.warn('KiidScreen: opened via file:// — YouTube may not work. Use http://localhost instead.');
    }

    await Storage.init();

    const hasPin = await Storage.hasPIN();

    // ─── PIN keypad ───
    document.querySelectorAll('.pin-key').forEach(key => {
      key.addEventListener('click', () => {
        if (key.dataset.value) {
          if (pinValue.length < 6) {
            pinValue += key.dataset.value;
            updatePinDots();
          }
        } else if (key.dataset.action === 'backspace') {
          pinValue = pinValue.slice(0, -1);
          updatePinDots();
        }
      });
    });

    $('pin-submit').addEventListener('click', handlePinSubmit);

    $('pin-extra-btn').addEventListener('click', () => {
      hideOverlay('pin-overlay');
      if (pinContext === 'exit') {
        enterDashboard();
      } else {
        showPinOverlay('dashboard');
      }
    });

    $('blackout-pin-btn').addEventListener('click', () => {
      showPinOverlay('blackout');
    });

    $('kid-exit-trigger').addEventListener('click', () => {
      showPinOverlay('exit');
    });

    $('kid-timer-ring').addEventListener('click', () => {
      showPinOverlay('dashboard');
    });

    Timer.onExpire(onTimerExpired);

    window.KiidApp = {
      goToKidMode: enterKidMode,
      onSettingsChanged
    };

    if (!hasPin) {
      showScreen('screen-setup');
    } else {
      enterKidMode();
    }

    // ─── Setup form ───
    $('setup-save').addEventListener('click', async () => {
      const pin = $('setup-pin').value;
      const confirmPin = $('setup-pin-confirm').value;
      if (!pin || pin.length < 4 || pin.length > 6) {
        $('setup-error').textContent = 'PIN يجب أن يكون 4-6 أرقام';
        return;
      }
      if (pin !== confirmPin) {
        $('setup-error').textContent = 'PIN غير متطابق';
        return;
      }
      await Storage.setPIN(pin);
      settings = await Storage.getSettings();
      settings.backPressCount = 3;
      settings.timeLimitHours = 1;
      settings.timeLimitMinutes = 0;
      settings.fullscreen = true;
      await Storage.saveSettings(settings);
      enterKidMode();
    });

    // ─── Keyboard PIN ───
    document.addEventListener('keydown', (e) => {
      if (!$('pin-overlay').classList.contains('active')) return;
      if (e.key >= '0' && e.key <= '9') {
        if (pinValue.length < 6) {
          pinValue += e.key;
          updatePinDots();
        }
      } else if (e.key === 'Backspace') {
        pinValue = pinValue.slice(0, -1);
        updatePinDots();
      } else if (e.key === 'Enter') {
        handlePinSubmit();
      }
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => KiidApp.init());
