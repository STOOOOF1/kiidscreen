/* ─── KiidScreen Storage Layer ───
 * Supports localStorage (default) and Firebase (optional).
 * Videos organized into categories/tabs.
 */

const Storage = (() => {
  const LS_KEYS = {
    categories: 'kiidscreen_categories',
    settings: 'kiidscreen_settings',
    firebase: 'kiidscreen_firebase_config'
  };

  let firebaseApp = null;
  let firestore = null;
  let useFirebase = false;

  async function hashPIN(pin) {
    const enc = new TextEncoder().encode(pin);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex;
  }

  function lsGet(key, def = null) {
    try { const v = localStorage.getItem(LS_KEYS[key]); return v ? JSON.parse(v) : def; }
    catch { return def; }
  }
  function lsSet(key, val) {
    localStorage.setItem(LS_KEYS[key], JSON.stringify(val));
  }

  async function initFirebase(config) {
    if (!config || !config.apiKey || !config.projectId) return false;
    try {
      if (typeof firebase === 'undefined') { return false; }
      if (!firebase.apps.length) {
        firebaseApp = firebase.initializeApp(config);
      } else {
        firebaseApp = firebase.app();
      }
      firestore = firebase.firestore();
      if (config.authDomain) {
        await firebase.auth().signInAnonymously().catch(() => {});
      }
      useFirebase = true;
      return true;
    } catch (e) {
      useFirebase = false;
      return false;
    }
  }

  /* ─── Migration from old flat videos ─── */
  function migrateOldData() {
    try {
      const old = localStorage.getItem('kiidscreen_videos');
      if (old) {
        const videos = JSON.parse(old);
        if (Array.isArray(videos) && videos.length > 0) {
          const cats = lsGet('categories', []);
          // Only migrate if no categories exist yet
          if (cats.length === 0) {
            cats.push({
              id: 'cat_default',
              name: 'عام',
              color: '#4fc3f7',
              icon: '🎬',
              order: 0,
              videos: videos.map((v, i) => ({ ...v, id: v.id || 'v_' + Date.now() + '_' + i, order: i }))
            });
            lsSet('categories', cats);
          }
        }
        localStorage.removeItem('kiidscreen_videos');
      }
    } catch {}
  }

  /* ─── Categories API ─── */
  return {
    /* Settings */
    async getSettings() {
      return lsGet('settings', { pin: '', backPressCount: 3, timeLimitHours: 1, timeLimitMinutes: 0, fullscreen: true });
    },
    async saveSettings(settings) {
      lsSet('settings', settings);
      if (useFirebase && firestore) {
        try { await firestore.collection('settings').doc('parent').set(settings, { merge: true }); } catch {}
      }
    },

    /* ─── Categories ─── */
    async getCategories() {
      if (useFirebase && firestore) {
        try {
          const snap = await firestore.collection('categories').orderBy('order', 'asc').get();
          if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch {}
      }
      let cats = lsGet('categories', []);
      // Ensure each video has an id
      cats.forEach(c => {
        if (c.videos) c.videos.forEach((v, i) => { if (!v.id) v.id = 'v_' + Date.now() + '_' + i; });
      });
      return cats;
    },

    async saveCategories(cats) {
      // Ensure all videos have IDs
      cats.forEach(c => {
        if (c.videos) c.videos.forEach((v, i) => { if (!v.id) v.id = 'v_' + Date.now() + '_' + i; });
      });
      lsSet('categories', cats);
      if (useFirebase && firestore) {
        try {
          const batch = firestore.batch();
          const existing = await firestore.collection('categories').get();
          existing.docs.forEach(d => batch.delete(d.ref));
          cats.forEach(c => {
            const ref = firestore.collection('categories').doc(c.id);
            batch.set(ref, c);
          });
          await batch.commit();
        } catch {}
      }
    },

    async addCategory(name, icon) {
      const cats = await this.getCategories();
      cats.push({
        id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: name || 'قسم جديد',
        icon: icon || '📁',
        color: '#4fc3f7',
        order: cats.length,
        videos: []
      });
      await this.saveCategories(cats);
      return cats;
    },

    async deleteCategory(id) {
      let cats = await this.getCategories();
      cats = cats.filter(c => c.id !== id);
      await this.saveCategories(cats);
      return cats;
    },

    async renameCategory(id, name) {
      const cats = await this.getCategories();
      const c = cats.find(c => c.id === id);
      if (c) { c.name = name; await this.saveCategories(cats); }
      return cats;
    },

    async addVideoToCategory(catId, video) {
      const cats = await this.getCategories();
      const c = cats.find(c => c.id === catId);
      if (c) {
        if (!c.videos) c.videos = [];
        video.id = video.id || 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        video.order = c.videos.length;
        c.videos.push(video);
        await this.saveCategories(cats);
      }
      return cats;
    },

    async deleteVideoFromCategory(catId, videoId) {
      const cats = await this.getCategories();
      const c = cats.find(c => c.id === catId);
      if (c && c.videos) {
        c.videos = c.videos.filter(v => v.id !== videoId);
        await this.saveCategories(cats);
      }
      return cats;
    },

    async reorderVideosInCategory(catId, orderedIds) {
      const cats = await this.getCategories();
      const c = cats.find(c => c.id === catId);
      if (c && c.videos) {
        const map = {};
        c.videos.forEach(v => { map[v.id] = v; });
        c.videos = orderedIds.map((id, i) => {
          const v = map[id];
          if (v) v.order = i;
          return v;
        }).filter(Boolean);
        await this.saveCategories(cats);
      }
      return cats;
    },

    /* PIN */
    async setPIN(pin) {
      const hashed = await hashPIN(pin);
      const s = await this.getSettings();
      s.pin = hashed;
      await this.saveSettings(s);
      return true;
    },
    async verifyPIN(pin) {
      const s = await this.getSettings();
      if (!s.pin) return pin === '';
      const hashed = await hashPIN(pin);
      return hashed === s.pin;
    },
    async hasPIN() {
      const s = await this.getSettings();
      return !!s.pin;
    },

    /* Firebase config */
    getFirebaseConfig() {
      return lsGet('firebase', null);
    },
    async setFirebaseConfig(config) {
      lsSet('firebase', config);
      if (config && config.apiKey) return await initFirebase(config);
      useFirebase = false; firestore = null; return true;
    },
    isUsingFirebase() { return useFirebase; },

    /* Init */
    async init() {
      migrateOldData();
      const fbConfig = this.getFirebaseConfig();
      if (fbConfig && fbConfig.apiKey) await initFirebase(fbConfig);
    }
  };
})();
