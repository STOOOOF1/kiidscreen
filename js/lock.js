/* ─── KiidScreen Lock System ───
 * Exit protection: back press counting + PIN + fullscreen lock.
 */

const Lock = (() => {
  const RESET_TIMEOUT = 3000; // 3s without back press → reset counter
  const HISTORY_FRAGMENT = '#kiid';

  let backPressCount = 3; // Required presses before PIN
  let currentPresses = 0;
  let lastPressTime = 0;
  let resetTimer = null;
  let onPinRequiredCallback = null;
  let onBackPressAttemptCallback = null;
  let isLocked = false;

  /* ─── History Manipulation (prevent back navigation) ─── */
  function pushHistory() {
    try {
      if (window.location.hash !== HISTORY_FRAGMENT) {
        window.location.hash = HISTORY_FRAGMENT;
      } else {
        window.history.pushState({ kiidLock: true }, '', HISTORY_FRAGMENT);
      }
    } catch {}
  }

  function handlePopState(e) {
    if (!isLocked) return;
    onBackPress();
    pushHistory();
  }

  /* ─── Back Press ─── */
  function onBackPress() {
    const now = Date.now();
    // Reset if too much time passed since last press
    if (now - lastPressTime > RESET_TIMEOUT) {
      currentPresses = 0;
    }
    lastPressTime = now;
    currentPresses++;

    // Fire attempt callback on every press
    if (onBackPressAttemptCallback) onBackPressAttemptCallback(currentPresses, backPressCount);

    // Reset timer
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      currentPresses = 0;
    }, RESET_TIMEOUT);

    if (currentPresses >= backPressCount) {
      currentPresses = 0;
      if (onPinRequiredCallback) onPinRequiredCallback('exit');
    }
  }

  /* ─── Fullscreen ─── */
  const el = () => document.documentElement;

  function requestFS() {
    try {
      if (el().requestFullscreen) {
        el().requestFullscreen().catch(() => {});
      } else if (el().webkitRequestFullscreen) {
        el().webkitRequestFullscreen();
      } else if (el().msRequestFullscreen) {
        el().msRequestFullscreen();
      }
    } catch {}
  }

  function exitFS() {
    try {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    } catch {}
  }

  function handleFSChange() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
      // User exited fullscreen — re-request
      if (isLocked) {
        setTimeout(requestFS, 200);
      }
    }
  }

  /* ─── Public API ─── */
  return {
    init(config) {
      backPressCount = config.backPressCount || 3;
      isLocked = true;

      // History & back button
      pushHistory();
      window.addEventListener('popstate', handlePopState);

      // Fullscreen
      document.addEventListener('fullscreenchange', handleFSChange);
      document.addEventListener('webkitfullscreenchange', handleFSChange);
      document.addEventListener('msfullscreenchange', handleFSChange);

      // Request fullscreen on user interaction
      const firstInteraction = () => {
        requestFS();
        document.removeEventListener('click', firstInteraction);
        document.removeEventListener('touchstart', firstInteraction);
        document.removeEventListener('keydown', firstInteraction);
      };
      document.addEventListener('click', firstInteraction);
      document.addEventListener('touchstart', firstInteraction);
      document.addEventListener('keydown', firstInteraction);
    },

    unlock() {
      isLocked = false;
    },

    relock() {
      isLocked = true;
      pushHistory();
    },

    setBackPressCount(count) {
      backPressCount = Math.max(1, Math.min(10, count));
    },

    getBackPressCount() {
      return backPressCount;
    },

    onPinRequired(cb) {
      onPinRequiredCallback = cb;
    },

    onBackPressAttempt(cb) {
      onBackPressAttemptCallback = cb;
    },

    requestFullscreen() {
      requestFS();
    },

    exitFullscreen() {
      isLocked = false;
      exitFS();
    },

    /* Called when entering dashboard */
    disableForDashboard() {
      isLocked = false;
      if (resetTimer) clearTimeout(resetTimer);
      currentPresses = 0;
    },

    /* Clean up */
    destroy() {
      isLocked = false;
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('fullscreenchange', handleFSChange);
      document.removeEventListener('webkitfullscreenchange', handleFSChange);
      document.removeEventListener('msfullscreenchange', handleFSChange);
      if (resetTimer) clearTimeout(resetTimer);
    }
  };
})();
