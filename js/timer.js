/* ─── KiidScreen Timer ───
 * Countdown timer with sessionStorage persistence.
 * Survives page refreshes.
 */

const Timer = (() => {
  const SESSION_KEY = 'kiidscreen_timer';
  const TICK_INTERVAL = 1000;

  let totalSeconds = 0;
  let startTime = null;
  let isRunning = false;
  let isExpired = false;
  let tickInterval = null;
  let tickCallbacks = [];
  let expireCallbacks = [];

  /* ─── Internal ─── */
  function getElapsed() {
    if (!startTime) return 0;
    return Math.floor((Date.now() - startTime) / 1000);
  }

  function getRemaining() {
    const elapsed = getElapsed();
    const remaining = totalSeconds - elapsed;
    return Math.max(0, remaining);
  }

  function saveState() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        totalSeconds,
        startTime,
        isRunning,
        isExpired
      }));
    } catch {}
  }

  function loadState() {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (!saved) return false;
      const data = JSON.parse(saved);
      totalSeconds = data.totalSeconds || 0;
      startTime = data.startTime;
      isRunning = data.isRunning || false;
      isExpired = data.isExpired || false;
      if (isRunning && startTime && totalSeconds > 0) {
        const remaining = getRemaining();
        if (remaining <= 0) {
          isExpired = true;
          isRunning = false;
        }
        return true;
      }
      return isRunning;
    } catch {
      return false;
    }
  }

  function tick() {
    if (!isRunning) return;
    const remaining = getRemaining();
    if (remaining <= 0) {
      isRunning = false;
      isExpired = true;
      saveState();
      expireCallbacks.forEach(cb => cb());
      if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
      return;
    }
    tickCallbacks.forEach(cb => cb(remaining, totalSeconds));
    saveState();
  }

  /* ─── Public API ─── */
  return {
    init() {
      loadState();
      if (isRunning && !isExpired && totalSeconds > 0) {
        this.start();
        return true;
      }
      return isRunning;
    },

    /* Start/resume timer. hours=0, minutes=0 means no limit */
    start(hours, minutes) {
      this.stop();

      // If already expired, don't restart unless new time is given
      if (isExpired && hours === undefined && minutes === undefined) return;

      if (hours !== undefined && minutes !== undefined) {
        totalSeconds = (hours * 3600) + (minutes * 60);
        if (totalSeconds <= 0) {
          // No time limit — run indefinitely
          return;
        }
        startTime = Date.now();
        isExpired = false;
      } else if (!startTime) {
        // Resuming without new time
        const saved = loadState();
        if (!saved) return;
      }

      isRunning = true;
      saveState();

      tickInterval = setInterval(tick, TICK_INTERVAL);
      // Immediate tick
      tick();
    },

    stop() {
      isRunning = false;
      if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
    },

    reset() {
      this.stop();
      totalSeconds = 0;
      startTime = null;
      isExpired = false;
      try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    },

    pause() {
      if (!isRunning) return;
      // Record elapsed time and convert to expired leftover
      const elapsed = getElapsed();
      totalSeconds -= elapsed;
      if (totalSeconds <= 0) {
        totalSeconds = 0;
        isExpired = true;
        isRunning = false;
        expireCallbacks.forEach(cb => cb());
      }
      startTime = Date.now();
      isRunning = false;
      saveState();
      if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
    },

    getRemaining() {
      if (totalSeconds <= 0) return Infinity; // No limit
      return getRemaining();
    },

    getTotal() {
      return totalSeconds;
    },

    isTimerExpired() {
      return isExpired;
    },

    isTimerRunning() {
      return isRunning;
    },

    onTick(cb) {
      tickCallbacks.push(cb);
    },

    onExpire(cb) {
      expireCallbacks.push(cb);
    },

    /* For dashboard: set total without starting */
    setTotal(hours, minutes) {
      totalSeconds = (hours * 3600) + (minutes * 60);
      isExpired = false;
    },

    getTimeForDisplay() {
      const remaining = this.getRemaining();
      if (remaining === Infinity) return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      return { hours: h, minutes: m, seconds: s, totalSeconds: remaining };
    },

    formatTime() {
      const t = this.getTimeForDisplay();
      if (t.totalSeconds === 0) return 'متبقي 0:00';
      const mm = String(t.minutes).padStart(2, '0');
      const ss = String(t.seconds).padStart(2, '0');
      if (t.hours > 0) return `${t.hours}:${mm}:${ss}`;
      return `${mm}:${ss}`;
    }
  };
})();
