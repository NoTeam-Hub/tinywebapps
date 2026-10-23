/* Upright autosave: project JSON and media blobs in IndexedDB (this browser only). */
(function (root) {
  'use strict';
  const U = root.U; let dbp = null, timer = 0, failed = false;
  const open = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('upright', 1); r.onupgradeneeded = () => { r.result.createObjectStore('proj'); r.result.createObjectStore('media'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
  const tx = async (store, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(store, mode), s = t.objectStore(store), r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  const refs = () => { const P = U.P, s = new Set(); P.clips.forEach((c) => s.add(c.mid)); P.overlays.forEach((o) => o.mid && s.add(o.mid)); P.voice.forEach((v) => s.add(v.mid)); if (P.music && P.music.mid) s.add(P.music.mid); return [...s].filter((x) => U.MEDIA[x]); };
  async function save() {
    if (failed) return; const P = U.P; if (!P.clips.length && !P.overlays.length) return;
    try {
      for (const id of refs()) { const m = U.MEDIA[id]; if (!m._saved) { await tx('media', 'readwrite', (s) => s.put({ name: m.name, type: m.blob.type, blob: m.blob }, id)); m._saved = true; } }
      await tx('proj', 'readwrite', (s) => s.put({ ts: Date.now(), json: U.serialize() }, 'cur')); U.emit('saved', Date.now());
    } catch (e) { failed = true; U.emit('savefail', e); }
  }
  U.store = {
    schedule() { clearTimeout(timer); timer = setTimeout(save, 1500); }, save,
    async peek() { try { const r = await tx('proj', 'readonly', (s) => s.get('cur')); if (!r) return null; const p = JSON.parse(r.json); return p.clips && p.clips.length ? { ts: r.ts, clips: p.clips.length } : null; } catch (e) { return null; } },
    async restore() {
      const r = await tx('proj', 'readonly', (s) => s.get('cur')); if (!r) return false; const p = JSON.parse(r.json), need = new Set();
      p.clips.forEach((c) => need.add(c.mid)); (p.overlays || []).forEach((o) => o.mid && need.add(o.mid)); (p.voice || []).forEach((v) => need.add(v.mid)); if (p.music && p.music.mid) need.add(p.music.mid);
      for (const id of need) { const d = await tx('media', 'readonly', (s) => s.get(id)); if (d) { const m = await U.addMedia(new File([d.blob], d.name, { type: d.type }), { id }); m._saved = true; } }
      p.clips = p.clips.filter((c) => U.MEDIA[c.mid]); p.overlays = (p.overlays || []).filter((o) => !o.mid || U.MEDIA[o.mid]); p.voice = (p.voice || []).filter((v) => U.MEDIA[v.mid]);
      U.loadProject(p); U.restoreLuts(); return true;
    },
    async clear() { try { await tx('proj', 'readwrite', (s) => s.clear()); await tx('media', 'readwrite', (s) => s.clear()); } catch (e) {} }
  };
  U.on('change', () => U.store.schedule());
})(window);
