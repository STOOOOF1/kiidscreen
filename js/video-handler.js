/* ─── KiidScreen Video Handler ───
 * Detects video type and creates an appropriate player.
 * YouTube: direct iframe embed + postMessage for end detection (no YT.Player)
 * Vimeo:   embed iframe with postMessage
 * Direct:  HTML5 <video> element
 */

const VideoHandler = (() => {
  let currentPlayer = null;
  let currentType = null;
  let onEndCallback = null;
  let onErrorCallback = null;
  let playerCounter = 0;
  let messageHandler = null;

  /* ─── URL detection ─── */
  function detectType(url) {
    if (!url || typeof url !== 'string') return null;
    const u = url.trim();
    const ytMatch = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return { type: 'youtube', id: ytMatch[1] };
    const vimMatch = u.match(/vimeo\.com\/(?:channels\/\w+\/|player\/video\/)?(\d+)/);
    if (vimMatch) return { type: 'vimeo', id: vimMatch[1] };
    const ext = u.split('?')[0].toLowerCase();
    if (/\.(mp4|webm|ogg|mov)$/.test(ext)) return { type: 'direct', id: u };
    return { type: 'unknown', id: u };
  }

  /* ─── PostMessage handler (shared for YT + Vimeo) ─── */
  function setupMessageHandler() {
    if (messageHandler) return;
    messageHandler = (event) => {
      try {
        // YouTube ended event (both domains)
        if (event.origin === 'https://www.youtube.com' || event.origin === 'https://www.youtube-nocookie.com') {
          const data = JSON.parse(event.data);
          if (data.event === 'onStateChange' && data.info === 0) {
            if (onEndCallback) onEndCallback(false);
          }
        }
        // Vimeo ended event
        if (event.origin === 'https://player.vimeo.com' && event.data && event.data.event === 'ended') {
          if (onEndCallback) onEndCallback(false);
        }
      } catch {}
    };
    window.addEventListener('message', messageHandler);
  }

  /* ─── YouTube Player (iframe with fallback domains) ─── */
  function createYouTubePlayer(videoId, container, onEnd) {
    return new Promise((resolve) => {
      setupMessageHandler();
      playerCounter++;
      container.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.setAttribute('allow', 'autoplay; fullscreen');
      iframe.setAttribute('allowfullscreen', '');
      iframe.style.cssText = 'width:100%;height:100%;border:none;';
      iframe.style.background = '#000';
      container.appendChild(iframe);
      resolve(iframe);

      // Try youtube-nocookie.com first (privacy), fallback to youtube.com
      const srcs = [
        'https://www.youtube-nocookie.com/embed/' + videoId + '?autoplay=1',
        'https://www.youtube.com/embed/' + videoId + '?autoplay=1',
        'https://www.youtube-nocookie.com/embed/' + videoId,
        'https://www.youtube.com/embed/' + videoId
      ];
      iframe.src = srcs[0];
      let idx = 0;
      const fallback = setInterval(() => {
        idx++;
        if (idx >= srcs.length) { clearInterval(fallback); return; }
        // After 8s try next URL format
        iframe.src = srcs[idx];
      }, 8000);
    });
  }

  /* ─── Vimeo Player ─── */
  function createVimeoPlayer(videoId, container, onEnd) {
    return new Promise((resolve) => {
      setupMessageHandler();
      container.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.src = 'https://player.vimeo.com/video/' + videoId +
        '?autoplay=1&dnt=1&title=0&byline=0&portrait=0';
      iframe.allow = 'autoplay';
      iframe.style.cssText = 'width:100%;height:100%;border:none;';
      container.appendChild(iframe);
      resolve(iframe);
    });
  }

  /* ─── Direct URL Player ─── */
  function createDirectPlayer(url, container, onEnd) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = 'auto';
      video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
      container.innerHTML = '';
      container.appendChild(video);
      video.addEventListener('ended', () => { if (onEnd) onEnd(false); });
      video.addEventListener('error', () => { if (onEnd) onEnd(true); });
      resolve(video);
    });
  }

  /* ─── Diagnostic tool ─── */
  async function testYouTubeEmbed(videoId) {
    const results = { ok: false, status: 0, error: '', videoId, embedUrl: '' };
    results.embedUrl = 'https://www.youtube.com/embed/' + videoId;
    try {
      const resp = await fetch(results.embedUrl, { method: 'HEAD', mode: 'no-cors' });
      results.status = resp.status || 'unknown (opaque)';
      results.ok = true;
    } catch (e) {
      results.error = e.message;
      // Try fetch via image test
      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
          setTimeout(() => reject(new Error('timeout')), 5000);
        });
        results.thumbnailOk = true;
      } catch (e2) {
        results.thumbnailError = e2.message;
      }
    }
    return results;
  }

  /* ─── Public API ─── */
  return {
    detectType,
    testYouTubeEmbed,

    async play(info, container, onVideoEnd, onVideoError) {
      if (!container) return;
      this.stop();
      onEndCallback = onVideoEnd || null;
      onErrorCallback = onVideoError || null;
      currentType = info.type;

      try {
        switch (info.type) {
          case 'youtube':
            currentPlayer = await createYouTubePlayer(info.id, container, (isError) => {
              if (onEndCallback) onEndCallback(isError);
            });
            break;
          case 'vimeo':
            currentPlayer = await createVimeoPlayer(info.id, container, (isError) => {
              if (onEndCallback) onEndCallback(isError);
            });
            break;
          case 'direct':
            currentPlayer = await createDirectPlayer(info.id, container, (isError) => {
              if (onEndCallback) onEndCallback(isError);
            });
            break;
          default:
            container.innerHTML = '<div style="color:#666;text-align:center;padding:2rem;">' +
              '<p>⚠️ لا يمكن تشغيل هذا الرابط</p>' +
              '<p style="font-size:0.8rem;opacity:0.6;margin-top:0.5rem;word-break:break-all;">' + info.id + '</p></div>';
        }
      } catch (e) {
        container.innerHTML = '<div style="color:#ef5350;text-align:center;padding:2rem;direction:rtl;">' +
          '<p style="font-size:1.5rem;margin-bottom:0.5rem;">❌</p>' +
          '<p>خطأ في تشغيل الفيديو</p></div>';
        if (onEndCallback) onEndCallback(true);
      }
    },

    stop() {
      onEndCallback = null;
      currentPlayer = null;
      currentType = null;
    },

    pause() {
      try {
        if (currentType === 'youtube' && currentPlayer && currentPlayer.contentWindow) {
          currentPlayer.contentWindow.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:''}), '*');
        } else if (currentType === 'vimeo' && currentPlayer && currentPlayer.contentWindow) {
          currentPlayer.contentWindow.postMessage(JSON.stringify({method:'pause'}), '*');
        } else if (currentType === 'direct' && currentPlayer && currentPlayer.pause) {
          currentPlayer.pause();
        }
      } catch {}
    },

    resume() {
      try {
        if (currentType === 'youtube' && currentPlayer && currentPlayer.contentWindow) {
          currentPlayer.contentWindow.postMessage(JSON.stringify({event:'command',func:'playVideo',args:''}), '*');
        } else if (currentType === 'vimeo' && currentPlayer && currentPlayer.contentWindow) {
          currentPlayer.contentWindow.postMessage(JSON.stringify({method:'play'}), '*');
        } else if (currentType === 'direct' && currentPlayer && currentPlayer.play) {
          currentPlayer.play().catch(() => {});
        }
      } catch {}
    },

    getDisplayInfo(url) {
      const info = detectType(url);
      if (!info) return { type: 'unknown', title: url, short: url };
      switch (info.type) {
        case 'youtube':
          return { type: 'YouTube', title: `YouTube: ${info.id}`, short: `YouTube #${info.id}` };
        case 'vimeo':
          return { type: 'Vimeo', title: `Vimeo: ${info.id}`, short: `Vimeo #${info.id}` };
        case 'direct': {
          const parts = info.id.split('/');
          const name = parts[parts.length - 1].split('?')[0].substring(0, 40);
          return { type: 'رابط مباشر', title: name || info.id, short: name || info.id };
        }
        default:
          return { type: 'آخر', title: url, short: url.substring(0, 40) };
      }
    }
  };
})();
