/* Upright engine: project model, timing, media, rendering, audio mixing, playback. */
(function (root) {
  'use strict';
  const FX = root.UprightFX, clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const U = root.U = { FX, uid, clamp, ev: new EventTarget(), MEDIA: {}, view: { t: 0 } };
  const emit = (n, d) => U.ev.dispatchEvent(new CustomEvent(n, { detail: d }));
  U.on = (n, f) => U.ev.addEventListener(n, (e) => f(e.detail));
  U.emit = emit;

  /* ---------------- project ---------------- */
  const newProject = () => ({ v: 2, ar: '9:16', q: 720, fps: 30, fade: true, tr: { type: 'fade', dur: .4 }, clips: [], overlays: [], music: null, musicVol: .8, clipVol: 1, duck: 'voice', voice: [], beatZoom: 0, cover: 0, luts: {}, caps: null });
  U.P = newProject();
  const ARS = { '9:16': [9, 16], '4:5': [4, 5], '1:1': [1, 1], '16:9': [16, 9] };
  U.dims = (short) => { const a = ARS[U.P.ar] || ARS['9:16'], s = short || U.P.q; let w, h; if (a[0] <= a[1]) { w = s; h = Math.round(s * a[1] / a[0]); } else { h = s; w = Math.round(s * a[0] / a[1]); } return [w & ~1, h & ~1]; };

  /* ---------------- speed curves & clip length ---------------- */
  const SHAPES = {
    none: () => 1,
    rampup: (u) => .35 + 1.3 * u,
    rampdown: (u) => 1.65 - 1.3 * u,
    pulse: (u) => 1 - .72 * Math.sin(Math.PI * u),
    flash: (u) => 1.7 - 1.4 * Math.sin(Math.PI * u)
  };
  U.SHAPES = Object.keys(SHAPES);
  function tab(c) {
    const span = Math.max(.05, c.out - c.in), key = span + '|' + c.speed + '|' + c.ramp;
    if (c._k === key) return c._T;
    const N = 48, T = new Float32Array(N + 1), f = SHAPES[c.ramp || 'none'] || SHAPES.none;
    for (let i = 0; i < N; i++) { const um = (i + .5) / N; T[i + 1] = T[i] + (span / N) / Math.max(.05, c.speed * f(um)); }
    c._k = key; c._T = T; return T;
  }
  U.clipLen = (c) => c.kind === 'image' ? c.dur : tab(c)[48];
  U.srcAt = (c, lt) => {
    if (c.kind === 'image') return 0;
    const T = tab(c), tot = T[48], span = Math.max(.05, c.out - c.in); lt = clamp(lt, 0, tot);
    let lo = 0, hi = 48; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= lt) lo = m; else hi = m; }
    const u = (lo + (T[hi] > T[lo] ? (lt - T[lo]) / (T[hi] - T[lo]) : 0)) / 48;
    return c.rev ? c.out - u * span : c.in + u * span;
  };
  U.constSpeed = (c) => !c.rev && (!c.ramp || c.ramp === 'none');
  const TRN = { none: -1, fade: 0, dip: 1, white: 2, zoom: 3, slide: 4, slideup: 5, wipe: 6, glitch: 7 };
  U.TRANS = Object.keys(TRN);
  U.layout = () => {
    const P = U.P, st = [], td = [], ln = P.clips.map(U.clipLen); let acc = 0;
    P.clips.forEach((c, i) => {
      let d = 0;
      if (i > 0) { const type = c.tr || P.tr.type; d = type === 'none' ? 0 : Math.min(c.trd == null ? P.tr.dur : c.trd, ln[i - 1] * .5, ln[i] * .5); }
      td.push(d); acc = i ? acc - d : 0; st.push(acc); acc += ln[i];
    });
    return { st, td, ln, total: acc };
  };
  U.total = () => { const L = U.layout().total; return Math.max(L, 0); };

  /* ---------------- history ---------------- */
  const hist = { u: [], r: [] };
  const ser = () => JSON.stringify(U.P, (k, v) => k[0] === '_' ? undefined : v);
  U.snap = () => { const s = ser(); if (hist.u[hist.u.length - 1] !== s) { hist.u.push(s); if (hist.u.length > 80) hist.u.shift(); hist.r = []; } };
  U.undo = () => { if (!hist.u.length) return; hist.r.push(ser()); U.P = JSON.parse(hist.u.pop()); U.changed(true); };
  U.redo = () => { if (!hist.r.length) return; hist.u.push(ser()); U.P = JSON.parse(hist.r.pop()); U.changed(true); };
  U.changed = (structural) => { emit('change', { structural: !!structural }); U.renderNow(); };
  U.serialize = ser;
  U.loadProject = (p) => { U.P = Object.assign(newProject(), p); hist.u = []; hist.r = []; U.view.t = 0; musicReady(); U.changed(true); };
  U.reset = () => { stop(); for (const k in elPool) dropEl(k); U.P = newProject(); U.MEDIA = {}; hist.u = []; hist.r = []; U.view.t = 0; U.musicBuf = null; emit('reset'); U.changed(true); };

  /* ---------------- media ---------------- */
  const MEDIA = () => U.MEDIA;
  const loadVideoMeta = (url) => new Promise((res, rej) => { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.onloadeddata = () => res(v); v.onerror = () => rej(new Error('This browser cannot play that video.')); v.src = url; });
  U.addMedia = async (file, opts) => {
    opts = opts || {};
    const id = opts.id || uid(), url = URL.createObjectURL(file), isVid = (file.type || '').startsWith('video') || /\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(file.name || '');
    const isAud = (file.type || '').startsWith('audio') && !isVid, m = { id, blob: file, name: file.name || 'clip', url, kind: isAud ? 'audio' : isVid ? 'video' : 'image', thumbs: [] };
    if (m.kind === 'video') {
      const v = await loadVideoMeta(url); m.dur = v.duration || 1; m.w = v.videoWidth; m.h = v.videoHeight; m.meta = v;
    } else if (m.kind === 'image') {
      const img = new Image(); img.src = url; await img.decode(); m.img = img; m.w = img.naturalWidth; m.h = img.naturalHeight;
    } else { m.dur = 0; }
    U.MEDIA[id] = m;
    if (m.kind !== 'image') decodeAudio(m).catch(() => {});
    if (m.kind === 'video') thumbsFor(m).catch(() => {});
    emit('media', m); return m;
  };
  async function decodeAudio(m) {
    if (m.abuf !== undefined) return m.abuf;
    m.abuf = null;
    try {
      const AC = root.AudioContext || root.webkitAudioContext, ctx = new (root.OfflineAudioContext || root.webkitOfflineAudioContext)(2, 1, 44100);
      const ab = await m.blob.arrayBuffer();
      m.abuf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
      m.hasAudio = m.abuf.length > 0; m.peaks = peaks(m.abuf, 800); if (m.kind === 'audio') m.dur = m.abuf.duration;
      emit('media', m);
    } catch (e) { m.abuf = null; m.hasAudio = false; }
    return m.abuf;
  }
  U.decodeAudio = decodeAudio;
  function peaks(ab, n) {
    const ch = ab.getChannelData(0), out = new Float32Array(n), step = ch.length / n;
    for (let i = 0; i < n; i++) { let mx = 0; const s = Math.floor(i * step), e = Math.min(ch.length, Math.floor((i + 1) * step)), k = Math.max(1, Math.floor((e - s) / 24)); for (let j = s; j < e; j += k) { const v = Math.abs(ch[j]); if (v > mx) mx = v; } out[i] = mx; }
    let g = 0; for (let i = 0; i < n; i++) if (out[i] > g) g = out[i]; if (g > 0) for (let i = 0; i < n; i++) out[i] = out[i] / g;
    return out;
  }
  async function thumbsFor(m) {
    const n = clamp(Math.ceil(m.dur / 1.5), 4, 24), v = await loadVideoMeta(m.url), cv = document.createElement('canvas'), h = 56, w = Math.max(24, Math.round(h * m.w / m.h)); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); m.thumbW = w;
    for (let i = 0; i < n; i++) {
      const t = (i + .5) * m.dur / n; await seekEl(v, Math.min(m.dur - .05, t));
      g.drawImage(v, 0, 0, w, h); m.thumbs.push({ t, url: cv.toDataURL('image/jpeg', .6) });
      if (i % 4 === 3 || i === n - 1) emit('thumbs', m);
    }
    v.removeAttribute('src'); v.load();
  }
  const seekEl = (el, t) => new Promise((res) => {
    if (Math.abs(el.currentTime - t) < .001 && el.readyState >= 2) return res();
    let done = false; const fin = () => { if (!done) { done = true; el.removeEventListener('seeked', fin); clearTimeout(to); res(); } };
    const to = setTimeout(fin, 2500); el.addEventListener('seeked', fin); el.currentTime = t;
  });
  U.seekEl = seekEl;

  /* ---------------- per-clip video elements (pooled) ---------------- */
  const elPool = {}, order = [];
  const dropEl = (k) => { const e = elPool[k]; if (e) { try { e.el.pause(); e.el.removeAttribute('src'); e.el.load(); } catch (x) {} if (R) R.freeTex(e.tex); delete elPool[k]; const i = order.indexOf(k); if (i >= 0) order.splice(i, 1); } };
  function getEl(key, mid, keep) {
    let e = elPool[key]; const m = U.MEDIA[mid]; if (!m || m.kind !== 'video') return null;
    if (!e) {
      const el = document.createElement('video'); el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = m.url; e = elPool[key] = { el, tex: R ? R.newTex() : null, mid, ready: false, up: -1 };
      el.addEventListener('loadeddata', () => { e.ready = true; if (!U.playing) U.renderNow(); }); el.addEventListener('seeked', () => { if (!U.playing) U.renderNow(); });
      el.load();
    }
    const i = order.indexOf(key); if (i >= 0) order.splice(i, 1); order.push(key);
    while (order.length > 7) { const k = order.find((x) => !keep || !keep.has(x)); if (!k) break; dropEl(k); }
    return e;
  }
  U.dropClipEl = (id) => dropEl(id);
  U.getPoolEl = (id) => elPool[id] && elPool[id].el;

  /* ---------------- renderer ---------------- */
  let R = null, canvas = null, black = null;
  const texCache = new Map(); // overlay raster textures
  U.initRenderer = (cv) => {
    canvas = cv; const [w, h] = U.dims(540); cv.width = w; cv.height = h; R = new FX.Renderer(cv); U.R = R;
    black = R.newTex(); const bc = document.createElement('canvas'); bc.width = bc.height = 2; const g = bc.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 2, 2); R.upload(black, bc);
    for (const k in elPool) elPool[k].tex = R.newTex();
    for (const id in (U.P.luts || {})) installLut(id);
    return R;
  };
  U.setRes = (short) => { const [w, h] = U.dims(short); if (R.W !== w || R.H !== h) { R.resize(w, h); } };
  U.fitPreview = () => U.setRes(Math.min(540, U.P.q));
  const REF = 160;
  const FONTS = { sans: '"Instrument Sans",system-ui,sans-serif', serif: '"Fraunces",Georgia,serif', mono: '"JetBrains Mono",ui-monospace,monospace', bold: '"Instrument Sans",system-ui,sans-serif', emoji: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' };
  U.FONTS = Object.keys(FONTS);
  function wrapLines(g, text, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      const words = para.split(/\s+/); let line = '';
      for (const w of words) { const t = line ? line + ' ' + w : w; if (line && g.measureText(t).width > maxW) { out.push(line); line = w; } else line = t; }
      out.push(line);
    }
    return out;
  }
  /* rasterise text (or a caption frame) into a canvas; returns {cv,w,h} */
  U.rasterText = (o, active) => {
    const cv = document.createElement('canvas'), g = cv.getContext('2d'), size = Math.max(.01, o.size || .07);
    const fam = FONTS[o.font || 'sans'] || FONTS.sans, wgt = o.weight || (o.font === 'bold' ? 800 : 600), it = o.italic ? 'italic ' : '';
    const font = `${it}${wgt} ${REF}px ${fam}`; g.font = font;
    let text = o.upper ? String(o.text || '').toUpperCase() : String(o.text || '');
    const maxW = (.9 / size) * REF * (o.maxw || 1);
    const lines = wrapLines(g, text || ' ', maxW), lh = REF * (o.lh || 1.18), pad = (o.bg ? REF * .22 : 0) + (o.strokeW || 0) * REF * .1 + REF * .12;
    let w = 0; lines.forEach((l) => { w = Math.max(w, g.measureText(l).width); });
    let cw = Math.ceil(w + pad * 2), ch = Math.ceil(lines.length * lh + pad * 2), sc = 1; if (cw > 4096) { sc = 4096 / cw; }
    cv.width = Math.max(4, Math.ceil(cw * sc)); cv.height = Math.max(4, Math.ceil(ch * sc)); g.scale(sc, sc); g.font = font; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const al = o.align || 'center'; g.textAlign = al;
    if (o.bg) { const r = REF * .2; g.fillStyle = o.bg; g.globalAlpha = o.bgAlpha == null ? .85 : o.bgAlpha; g.beginPath(); g.roundRect ? g.roundRect(REF * .04, REF * .04, cw - REF * .08, ch - REF * .08, r) : g.rect(REF * .04, REF * .04, cw - REF * .08, ch - REF * .08); g.fill(); g.globalAlpha = 1; }
    lines.forEach((l, i) => {
      const y = pad + lh * i + lh / 2, x = al === 'left' ? pad : al === 'right' ? cw - pad : cw / 2;
      if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = REF * .35; }
      else if (o.shadow) { g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = REF * .12; g.shadowOffsetY = REF * .04; }
      if (o.strokeW) { g.strokeStyle = o.stroke || '#000'; g.lineWidth = REF * .1 * o.strokeW; g.strokeText(l, x, y); }
      g.fillStyle = o.color || '#fff'; g.fillText(l, x, y); g.shadowBlur = 0; g.shadowOffsetY = 0;
    });
    return { cv, w: cv.width, h: cv.height };
  };
  /* caption styles: fraction-based like text */
  const CAPSTYLES = {
    classic: { n: 'Classic', font: 'bold', color: '#fff', stroke: '#000', strokeW: 1.2, upper: false, words: 0 },
    boxed: { n: 'Boxed', font: 'sans', weight: 700, color: '#fff', bg: '#000', bgAlpha: .72, words: 0 },
    hormozi: { n: 'Bold pop', font: 'bold', weight: 900, color: '#fff', hl: '#ffe14a', stroke: '#000', strokeW: 1.6, upper: true, words: 3, pop: 1 },
    karaoke: { n: 'Karaoke', font: 'sans', weight: 800, color: '#fff', hl: '#ff5ca8', stroke: '#000', strokeW: .8, words: 4, hlMode: 'color' },
    box: { n: 'Highlight box', font: 'sans', weight: 800, color: '#fff', hl: '#ff5ca8', hlbox: 1, stroke: '#000', strokeW: .6, words: 4 },
    minimal: { n: 'Minimal', font: 'sans', weight: 500, color: '#fff', shadow: 1, words: 0 },
    neon: { n: 'Neon', font: 'sans', weight: 800, color: '#fff', glow: '#25f4ee', hl: '#fe2c55', words: 3, hlMode: 'color' },
    serif: { n: 'Editorial', font: 'serif', weight: 600, italic: 1, color: '#fff', shadow: 1, words: 0 }
  };
  U.CAPSTYLES = CAPSTYLES;
  const capCache = new Map();
  function capFrame(o, t) {
    const caps = U.P.caps; if (!caps || !caps.segs.length) return null;
    const idx = caps.segs.findIndex((s) => t >= s.s && t < s.e); if (idx < 0) return null;
    const seg = caps.segs[idx], st = Object.assign({}, CAPSTYLES[caps.style] || CAPSTYLES.classic), size = caps.size || .06;
    let key, text, wi = -1;
    if (st.words && seg.w && seg.w.length) {
      wi = Math.max(0, seg.w.findIndex((w) => t >= w.s && t < w.e)); if (wi < 0) wi = 0;
      const gi = Math.floor(wi / st.words), grp = seg.w.slice(gi * st.words, gi * st.words + st.words), act = wi - gi * st.words;
      key = [caps.style, size, idx, gi, act, caps.color, caps.hl].join('|');
      const hit = capCache.get(key); if (hit) return hit;
      const r = rasterCapGroup(grp, act, st, size, caps); capCache.set(key, r); if (capCache.size > 60) capCache.delete(capCache.keys().next().value); return r;
    }
    key = [caps.style, size, idx, seg.t, caps.color].join('|'); const hit = capCache.get(key); if (hit) return hit;
    const oo = Object.assign({}, st, { text: seg.t, size: size, color: caps.color || st.color }), r = U.rasterText(oo); r.pop = 1; capCache.set(key, r); if (capCache.size > 60) capCache.delete(capCache.keys().next().value); return r;
  }
  function rasterCapGroup(grp, act, st, size, caps) {
    const cv = document.createElement('canvas'), g = cv.getContext('2d'), fam = FONTS[st.font] || FONTS.sans, font = `${st.italic ? 'italic ' : ''}${st.weight || 800} ${REF}px ${fam}`; g.font = font;
    const up = st.upper ? (s) => s.toUpperCase() : (s) => s, gap = REF * .28, words = grp.map((w) => up(w.w)), ws = words.map((w) => g.measureText(w).width);
    const tot = ws.reduce((a, b) => a + b, 0) + gap * (words.length - 1), pad = REF * .3, hh = REF * 1.3;
    let cw = Math.ceil(tot + pad * 2), sc = 1; if (cw > 4096) sc = 4096 / cw; cv.width = Math.max(4, Math.ceil(cw * sc)); cv.height = Math.ceil(hh * sc); g.scale(sc, sc); g.font = font; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.textAlign = 'left';
    let x = pad; const y = hh / 2, base = caps.color || st.color, hl = caps.hl || st.hl || base;
    words.forEach((w, i) => {
      const on = i === act, wd = ws[i];
      if (on && st.hlbox) { g.fillStyle = hl; g.beginPath(); g.roundRect ? g.roundRect(x - REF * .12, y - REF * .58, wd + REF * .24, REF * 1.16, REF * .2) : g.rect(x - REF * .12, y - REF * .58, wd + REF * .24, REF * 1.16); g.fill(); }
      if (st.glow) { g.shadowColor = on ? hl : st.glow; g.shadowBlur = REF * .35; }
      if (st.strokeW && !st.hlbox) { g.strokeStyle = st.stroke || '#000'; g.lineWidth = REF * .1 * st.strokeW; g.strokeText(w, x, y); }
      g.fillStyle = on && !st.hlbox ? hl : base; if (st.pop && on) { g.save(); g.translate(x + wd / 2, y); g.scale(1.14, 1.14); g.translate(-(x + wd / 2), -y); g.fillText(w, x, y); g.restore(); } else g.fillText(w, x, y);
      g.shadowBlur = 0; x += wd + gap;
    });
    return { cv, w: cv.width, h: cv.height };
  }
  function ovTexture(o, t) {
    const E = U.MEDIA;
    if (o.type === 'image') { const m = E[o.mid]; if (!m || !m.img) return null; let c = texCache.get(o.mid); if (!c) { c = { tex: R.newTex(), w: m.w, h: m.h }; R.upload(c.tex, m.img); texCache.set(o.mid, c); } return c; }
    if (o.type === 'text' || o.type === 'sticker') {
      const key = 'T' + JSON.stringify([o.text, o.font, o.weight, o.color, o.bg, o.bgAlpha, o.stroke, o.strokeW, o.shadow, o.glow, o.align, o.italic, o.upper, o.size, o.maxw, o.lh]);
      let c = texCache.get(key); if (!c) { const r = U.rasterText(o.type === 'sticker' ? Object.assign({}, o, { font: 'emoji', shadow: 0 }) : o); c = { tex: R.newTex(), w: r.w, h: r.h }; R.upload(c.tex, r.cv); texCache.set(key, c); if (texCache.size > 80) { const k = texCache.keys().next().value, v = texCache.get(k); R.freeTex(v.tex); texCache.delete(k); } }
      return c;
    }
    if (o.type === 'caps') {
      const f = capFrame(o, t); if (!f) return null; let c = f.gl; if (!c) { c = f.gl = { tex: R.newTex(), w: f.w, h: f.h }; R.upload(c.tex, f.cv); } return c;
    }
    return null;
  }
  U.invalidateTex = () => { for (const v of texCache.values()) R.freeTex(v.tex); texCache.clear(); capCache.clear(); };
  /* overlay box in canvas px (also used by the stage to draw handles) */
  U.ovBox = (o, t) => {
    const W = R ? R.W : 1, H = R ? R.H : 1; let w, h;
    if (o.type === 'image' || o.type === 'video') {
      const m = U.MEDIA[o.mid]; if (!m) return null; w = (o.size || .3) * W; h = w * (m.h / m.w);
    } else if (o.type === 'caps') {
      const caps = U.P.caps; if (!caps) return null; const f = capFrame(o, t == null ? U.view.t : t); const sc = ((caps.size || .06) * W) / REF; if (!f) { w = W * .5; h = REF * 1.3 * sc; return { cx: o.x * W, cy: o.y * H, w, h, rot: 0, empty: true }; } w = f.w * sc; h = f.h * sc;
    } else {
      const c = ovTexture(o, t == null ? U.view.t : t); if (!c) return null; const sc = ((o.size || .07) * W) / REF; w = c.w * sc; h = c.h * sc;
    }
    return { cx: o.x * W, cy: o.y * H, w, h, rot: o.rot || 0 };
  };
  const ease = { out: (p) => 1 - Math.pow(1 - p, 3), back: (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); } };
  function drawOverlays(t, dst, forExport) {
    const P = U.P, W = R.W, H = R.H;
    for (const o of P.overlays) {
      if (o.hidden) continue; const s0 = o.start || 0, e0 = o.end == null ? 1e9 : o.end; if (t < s0 || t >= e0) continue;
      let tex = null, box = null;
      if (o.type === 'video') {
        const m = U.MEDIA[o.mid]; if (!m) continue; const e = getEl('ov' + o.id, o.mid); if (!e) continue; prepEl(e, (o.in || 0) + (t - s0) * (o.speed || 1), U.playing && !forExport, o.speed || 1);
        if (e.el.readyState >= 2) { R.upload(e.tex, e.el); } else continue; tex = e.tex; box = U.ovBox(o, t);
      } else { const c = ovTexture(o, t); if (!c) continue; tex = c.tex; box = U.ovBox(o, t); }
      if (!box) continue;
      const lt = t - s0; let a = o.alpha == null ? 1 : o.alpha, sc = 1, dx = 0, dy = 0, rot = box.rot;
      const A = o.anim || 'none', ip = clamp(lt / .35, 0, 1);
      if (o.type !== 'caps') {
        if (A === 'fade') a *= ip; else if (A === 'pop') { sc = .5 + .5 * ease.back(ip); a *= clamp(ip * 3, 0, 1); } else if (A === 'slide') { dy = (1 - ease.out(ip)) * H * .08; a *= ip; } else if (A === 'bounce') { sc = ip < 1 ? .3 + .7 * ease.back(ip) : 1 + .04 * Math.sin(lt * 7); } else if (A === 'spin') { rot += (1 - ease.out(ip)) * 180; sc = .3 + .7 * ease.out(ip); a *= ip; }
        if (o.end != null) a *= clamp((e0 - t) / .2, 0, 1);
      } else { const f = capFrame(o, t); if (f && f.pop) { const segS = (P.caps.segs.find((s) => t >= s.s && t < s.e) || {}).s || t; sc = .88 + .12 * ease.back(clamp((t - segS) / .18, 0, 1)); } }
      R.overlay(tex, { cx: box.cx + dx, cy: box.cy + dy, w: box.w * sc, h: box.h * sc, rot: rot, alpha: a, key: o.key, radius: (o.radius || 0) * .5, flip: o.flip }, dst);
    }
  }
  function prepEl(e, target, playing, rate) {
    const el = e.el; if (el.readyState < 1) return; target = clamp(target, 0, (el.duration || 1e9) - .02);
    if (playing && rate >= .0625 && rate <= 4) {
      if (el.playbackRate !== rate) el.playbackRate = rate;
      if (el.paused) { el.currentTime = target; el.play().catch(() => {}); } else if (Math.abs(el.currentTime - target) > .35) el.currentTime = target;
    } else { if (!el.paused) el.pause(); if (Math.abs(el.currentTime - target) > .002 && !el.seeking) el.currentTime = target; }
  }
  U.prepEl = prepEl;
  /* ---------------- frame composition ---------------- */
  U.musicBeatsAbs = () => { const m = U.P.music; if (!m || !m.beats) return []; return m.beats.map((b) => b - (m.off || 0) + (m.at || 0)); };
  function pulseAt(t) {
    const amt = U.P.beatZoom; if (!amt) return 1; const b = U._beatCache && U._beatCache.k === U.P.music ? U._beatCache.v : (U._beatCache = { k: U.P.music, v: U.musicBeatsAbs() }).v; if (!b.length) return 1;
    let lo = 0, hi = b.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (b[m] <= t) lo = m; else hi = m - 1; } const d = t - b[lo]; if (d < 0) return 1;
    return 1 + amt * Math.exp(-d * 9);
  }
  function clipState(c, t, lt, e, time) {
    const p = FX.effective(c), pl = pulseAt(t);
    let shx = 0, shy = 0; if (c.shake) { shx = Math.sin(time * 31) * R.W * .004 * c.shake; shy = Math.cos(time * 27) * R.H * .004 * c.shake; }
    return { fit: c.fit || 'cover', zoom: (c.zoom || 1) * (1 + (c.kb ? c.kb * (lt / Math.max(.1, U.clipLen(c))) : 0)), panX: c.panX, panY: c.panY, flip: c.flip, rot: c.rot, params: p, time: time, lutId: c.lutId, pulse: pl, shx, shy };
  }
  function clipTex(c, lt, playing, forExport, keep) {
    if (c.kind === 'image') { const m = U.MEDIA[c.mid]; if (!m || !m.img) return null; let x = texCache.get(c.mid); if (!x) { x = { tex: R.newTex(), w: m.w, h: m.h }; R.upload(x.tex, m.img); texCache.set(c.mid, x); } return x.tex; }
    const m = U.MEDIA[c.mid]; if (!m) return null; const e = getEl(c.id, c.mid, keep); if (!e) return null;
    const tgt = U.srcAt(c, lt); if (!forExport) prepEl(e, tgt, playing && U.constSpeed(c), c.speed);
    if (e.el.readyState >= 2) { R.upload(e.tex, e.el, m.w, m.h); e.tex.w = m.w; e.tex.h = m.h; return e.tex; } return e.tex.w ? e.tex : null;
  }
  /* Draws frame at project time t onto the canvas (or into the export canvas). */
  U.draw = (t, forExport) => {
    if (!R) return; const P = U.P, L = U.layout(), W = R.W, H = R.H, time = t;
    const playing = U.playing && !forExport;
    const act = []; P.clips.forEach((c, i) => { if (t >= L.st[i] - 1e-6 && t < L.st[i] + L.ln[i] - 1e-6) act.push(i); });
    if (!act.length && P.clips.length && t >= L.total) act.push(P.clips.length - 1);
    const keep = new Set(act.map((i) => P.clips[i].id));
    if (!forExport) { /* warm up the next clip */ P.clips.forEach((c, i) => { if (!act.includes(i) && c.kind === 'video' && L.st[i] > t && L.st[i] - t < 1.2) { const e = getEl(c.id, c.mid, keep); keep.add(c.id); if (e && e.el.readyState >= 1 && !playing) { } else if (e && e.el.readyState >= 1 && Math.abs(e.el.currentTime - c.in) > .05 && e.el.paused) e.el.currentTime = c.in; } }); }
    let F = R.fb.A;
    if (!act.length) R.clear(F, 0, 0, 0);
    else {
      const i0 = act[0], c0 = P.clips[i0], lt0 = t - L.st[i0], x0 = clipTex(c0, lt0, playing, forExport, keep);
      if (x0) R.clip(x0, clipState(c0, t, lt0, null, time), R.fb.A); else R.clear(R.fb.A, 0, 0, 0);
      if (act.length > 1) {
        const i1 = act[1], c1 = P.clips[i1], lt1 = t - L.st[i1], x1 = clipTex(c1, lt1, playing, forExport, keep);
        if (x1) R.clip(x1, clipState(c1, t, lt1, null, time), R.fb.B); else R.clear(R.fb.B, 0, 0, 0);
        const td = L.td[i1] || .3, p = clamp((t - L.st[i1]) / td, 0, 1), type = TRN[c1.tr || P.tr.type]; R.transition(R.fb.A, R.fb.B, p, type < 0 ? 0 : type, time, R.fb.comp); F = R.fb.comp;
      }
    }
    drawOverlays(t, F, forExport);
    if (P.fade && L.total > 1 && (playing || forExport) && !U._nofade) { const a = Math.max(clamp(1 - t / .35, 0, 1), clamp((t - (L.total - .5)) / .5, 0, 1)); if (a > .001) R.overlay(black, { cx: W / 2, cy: H / 2, w: W * 1.01, h: H * 1.01, alpha: a }, F); }
    R.present(F); U.lastFrame = F; return F;
  };
  let raf = 0, pending = false;
  U.renderNow = () => { if (!R || U.playing || pending) return; pending = true; requestAnimationFrame(() => { pending = false; if (!U.playing && R && !U.exporting) { U.draw(U.view.t); emit('frame', U.view.t); } }); };
  U.seek = (t) => { U.view.t = clamp(t, 0, Math.max(0, U.total())); if (U.playing) { stop(); } emit('time', U.view.t); U.renderNow(); };

  /* ---------------- LUTs ---------------- */
  const lutData = {};
  function installLut(id) { const d = lutData[id]; if (d && R) R.setLut(id, d.N, d.data); }
  U.addLut = async (file) => { const txt = await file.text(), c = FX.parseCube(txt), id = uid(); lutData[id] = c; U.P.luts[id] = { name: file.name.replace(/\.cube$/i, ''), txt }; installLut(id); return id; };
  U.restoreLuts = () => { for (const id in U.P.luts) { if (!lutData[id]) { try { lutData[id] = FX.parseCube(U.P.luts[id].txt); } catch (e) {} } installLut(id); } };

  /* ---------------- music & beats ---------------- */
  async function musicReady() {
    const m = U.P.music; U.musicBuf = null; if (!m) { emit('music'); return; }
    try {
      let blob;
      if (m.src === 'lib') { const r = await fetch(m.file); if (!r.ok) throw 0; blob = await r.blob(); } else { const md = U.MEDIA[m.mid]; if (!md) return; blob = md.blob; }
      const ab = await blob.arrayBuffer(), ctx = new (root.OfflineAudioContext || root.webkitOfflineAudioContext)(2, 1, 44100);
      U.musicBuf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
      m.dur = U.musicBuf.duration; m.peaks = Array.from(peaks(U.musicBuf, 600), (x) => +x.toFixed(2)); U._mpeaks = m.peaks;
      if (!m.beats) m.beats = m.bpm ? gridBeats(m.bpm, 0, m.dur) : detectBeats(U.musicBuf);
      U._beatCache = null;
    } catch (e) { U.musicBuf = null; }
    emit('music'); U.renderNow();
  }
  U.musicReady = musicReady;
  const gridBeats = (bpm, ph, dur) => { const p = 60 / bpm, out = []; for (let t = ph; t < dur; t += p) out.push(+t.toFixed(3)); return out; };
  function detectBeats(ab) {
    const x = ab.getChannelData(0), sr = ab.sampleRate, hop = Math.round(sr / 100), n = Math.floor(x.length / hop), e = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = i * hop + 1; j < (i + 1) * hop; j += 2) s += Math.abs(x[j] - x[j - 1]); e[i] = s; }
    const o = new Float32Array(n); for (let i = 1; i < n; i++) { let a = 0, k = 0; for (let j = Math.max(0, i - 30); j < i; j++) { a += e[j]; k++; } o[i] = Math.max(0, e[i] - 1.1 * a / Math.max(1, k)); }
    let best = 0, bl = 50; for (let lag = 30; lag <= 100; lag++) { let s = 0; for (let i = lag; i < n; i++) s += o[i] * o[i - lag]; s *= 1 + (lag > 45 && lag < 75 ? .15 : 0); if (s > best) { best = s; bl = lag; } }
    let bp = 0, bs = -1; for (let p = 0; p < bl; p++) { let s = 0; for (let i = p; i < n; i += bl) s += o[i]; if (s > bs) { bs = s; bp = p; } }
    const out = []; for (let i = bp; i < n; i += bl) out.push(+(i / 100).toFixed(3)); U.P.music && (U.P.music.bpm = Math.round(6000 / bl)); return out;
  }
  U.setMusicLib = async (i) => { const t = root.LIB[i]; U.snap(); U.P.music = { src: 'lib', file: t.file, name: t.name, bpm: t.bpm, at: 0, off: 0 }; await musicReady(); U.changed(); };
  U.setMusicFile = async (file) => { const m = await U.addMedia(file); U.snap(); U.P.music = { src: 'dev', mid: m.id, name: file.name, at: 0, off: 0 }; await musicReady(); U.changed(); };
  U.clearMusic = () => { U.snap(); U.P.music = null; U.musicBuf = null; emit('music'); U.changed(); };

  /* ---------------- audio mixing (shared by preview and export) ---------------- */
  const rev = (ab) => { const o = new root.AudioBuffer({ length: ab.length, numberOfChannels: ab.numberOfChannels, sampleRate: ab.sampleRate }); for (let c = 0; c < ab.numberOfChannels; c++) { const s = ab.getChannelData(c), d = o.getChannelData(c); for (let i = 0, n = s.length; i < n; i++) d[i] = s[n - 1 - i]; } return o; };
  function duckSpans() {
    const P = U.P, sp = []; if (P.duck === 'off') return sp;
    for (const v of P.voice) sp.push([v.start, v.start + v.dur]);
    if (P.duck === 'clips') {
      const L = U.layout(); P.clips.forEach((c, i) => { const m = U.MEDIA[c.mid]; if (c.kind !== 'video' || c.mute || !m || !m.abuf) return; const ch = m.abuf.getChannelData(0), sr = m.abuf.sampleRate, step = Math.round(sr * .1); let start = -1;
        for (let t = 0; t < U.clipLen(c); t += .1) { const s = U.srcAt(c, t), a = Math.floor(s * sr); let r = 0, k = 0; for (let j = a; j < a + step && j < ch.length; j += 8) { r += ch[j] * ch[j]; k++; } r = Math.sqrt(r / Math.max(1, k)); const on = r > .03; if (on && start < 0) start = t; if ((!on || t + .1 >= U.clipLen(c)) && start >= 0) { sp.push([L.st[i] + start, L.st[i] + t]); start = -1; } } });
    }
    sp.sort((a, b) => a[0] - b[0]); const m = []; for (const s of sp) { const l = m[m.length - 1]; if (l && s[0] - l[1] < .5) l[1] = Math.max(l[1], s[1]); else m.push(s.slice()); } return m;
  }
  /* Builds the whole mix in `ctx`, starting at ctx time `when` for project time `from`. Returns nodes to stop. */
  U.scheduleAudio = (ctx, dest, when, from, total) => {
    const P = U.P, L = U.layout(), nodes = [], rel = (t) => when + (t - from); total = total == null ? L.total : total;
    const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(dest);
    const clipBus = ctx.createGain(); clipBus.gain.value = P.clipVol; clipBus.connect(bus);
    const add = (buf, tStart, tEnd, off, rate, g, fin, fout) => {
      if (tEnd <= from) return; let s = tStart, o = off; if (s < from) { const d = from - s; o += d * rate; s = from; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate; const gn = ctx.createGain(); src.connect(gn); gn.connect(g.out || clipBus);
      const w = rel(s), dur = tEnd - s; if (o < 0 || o >= buf.duration || dur <= 0) return;
      gn.gain.setValueAtTime(0, w); gn.gain.linearRampToValueAtTime(g.v, w + Math.min(fin, dur / 2)); gn.gain.setValueAtTime(g.v, Math.max(w, rel(tEnd) - fout)); gn.gain.linearRampToValueAtTime(0, rel(tEnd));
      src.start(w, o); src.stop(rel(tEnd) + .02); nodes.push(src);
    };
    P.clips.forEach((c, i) => {
      if (c.kind !== 'video' || c.mute) return; const m = U.MEDIA[c.mid]; if (!m || !m.abuf) return;
      const S = L.st[i], len = L.ln[i], fin = i > 0 ? Math.max(.01, L.td[i]) : .01, fout = i < P.clips.length - 1 ? Math.max(.01, L.td[i + 1]) : .01, g = { v: c.vol == null ? 1 : c.vol };
      const buf = c.rev ? (m._rev || (m._rev = rev(m.abuf))) : m.abuf;
      if (U.constSpeed(c)) { const off = c.rev ? m.abuf.duration - c.out : c.in; add(buf, S, S + len, off, c.speed, g, fin, fout); }
      else { const step = .25; for (let t = 0; t < len - 1e-6; t += step) { const t1 = Math.min(len, t + step), s0 = U.srcAt(c, t), s1 = U.srcAt(c, t1), rate = Math.max(.1, Math.abs(s1 - s0) / (t1 - t)), o = c.rev ? m.abuf.duration - s0 : s0; add(buf, S + t, S + t1, o, rate, g, t === 0 ? fin : .004, t1 >= len ? fout : .004); } }
    });
    if (U.musicBuf && P.music && !U._skipMusic) {
      const m = P.music, mb = ctx.createGain(); mb.connect(bus); const v = P.musicVol, tEnd = Math.min(total, (m.at || 0) + U.musicBuf.duration - (m.off || 0)), fo = Math.min(1.8, Math.max(.3, (tEnd - (m.at || 0)) * .25));
      mb.gain.setValueAtTime(v, rel(Math.max(from, 0)));
      const spans = duckSpans(), low = v * .22;
      for (const [a, b] of spans) { if (b <= from) continue; mb.gain.setTargetAtTime(low, rel(Math.max(a - .15, from)), .08); mb.gain.setTargetAtTime(v, rel(Math.max(b, from)), .25); }
      const src = ctx.createBufferSource(), env = ctx.createGain(); src.buffer = U.musicBuf; src.connect(env); env.connect(mb);
      let st = m.at || 0, off = m.off || 0; if (st < from) { off += from - st; st = from; }
      if (off < U.musicBuf.duration && tEnd > st) {
        env.gain.setValueAtTime(P.fade || true ? Math.min(1, st === (m.at || 0) ? 0 : 1) : 1, rel(st)); if (st === (m.at || 0)) env.gain.linearRampToValueAtTime(1, rel(st) + .25);
        env.gain.setValueAtTime(1, Math.max(rel(st), rel(tEnd) - fo)); env.gain.linearRampToValueAtTime(0, rel(tEnd)); src.start(rel(st), off); src.stop(rel(tEnd) + .02); nodes.push(src);
      }
    }
    const vb = ctx.createGain(); vb.gain.value = 1.15; vb.connect(bus);
    for (const v of P.voice) { const m = U.MEDIA[v.mid]; if (!m || !m.abuf) continue; const end = v.start + v.dur; if (end <= from) continue; const src = ctx.createBufferSource(); src.buffer = m.abuf; src.connect(vb); let st = v.start, off = 0; if (st < from) { off = from - st; st = from; } src.start(rel(st), off); src.stop(rel(end) + .02); nodes.push(src); }
    return { stop: () => { for (const n of nodes) try { n.stop(); } catch (e) {} try { bus.disconnect(); } catch (e) {} } };
  };
  U.renderMix = async (total, sr) => {
    const OC = root.OfflineAudioContext || root.webkitOfflineAudioContext, ctx = new OC(2, Math.max(1, Math.ceil(total * sr)), sr);
    for (const c of U.P.clips) { const m = U.MEDIA[c.mid]; if (m && m.kind === 'video') await decodeAudio(m); }
    for (const v of U.P.voice) { const m = U.MEDIA[v.mid]; if (m) await decodeAudio(m); }
    U.scheduleAudio(ctx, ctx.destination, 0, 0, total); return ctx.startRendering();
  };
  U.hasAnyAudio = () => !!(U.P.music && U.musicBuf) || U.P.voice.length > 0 || U.P.clips.some((c) => c.kind === 'video' && !c.mute && U.MEDIA[c.mid] && U.MEDIA[c.mid].abuf);

  /* ---------------- playback ---------------- */
  let AC = null, graph = null, base = 0, t0 = 0;
  U.playing = false;
  U.audioCtx = () => { if (!AC) { const C = root.AudioContext || root.webkitAudioContext; AC = new C(); } return AC; };
  async function play() {
    if (U.playing || U.exporting) return; const tot = U.total(); if (!tot) return; if (U.view.t >= tot - .02) U.view.t = 0;
    const ac = U.audioCtx(); try { await ac.resume(); } catch (e) {}
    for (const c of U.P.clips) { const m = U.MEDIA[c.mid]; if (m && m.kind === 'video' && m.abuf === undefined) await decodeAudio(m); }
    t0 = U.view.t; base = ac.currentTime + .08; graph = U.scheduleAudio(ac, ac.destination, base, t0); U.playing = true; emit('play', true);
    const tick = () => { if (!U.playing) return; const now = U.audioCtx().currentTime; let t = t0 + Math.max(0, now - base); if (t >= tot) { U.view.t = tot; stop(); U.view.t = tot; U.draw(tot); emit('time', tot); return; } U.view.t = t; U.draw(t); emit('time', t); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  }
  function stop() { if (!U.playing) return; U.playing = false; cancelAnimationFrame(raf); if (graph) { graph.stop(); graph = null; } for (const k in elPool) { try { elPool[k].el.pause(); } catch (e) {} } emit('play', false); U.renderNow(); }
  U.play = play; U.pause = stop; U.toggle = () => U.playing ? stop() : play();
  U.stopAudio = () => { if (graph) { graph.stop(); graph = null; } };

  /* ---------------- clip operations ---------------- */
  U.newClip = (m) => {
    const base = { id: uid(), mid: m.id, kind: m.kind === 'image' ? 'image' : 'video', speed: 1, ramp: 'none', rev: false, fit: 'cover', zoom: 1, panX: 0, panY: 0, flip: false, rot: 0, look: 'none', lookAmt: 1, adj: {}, fx: {}, vol: 1 };
    if (base.kind === 'image') base.dur = 3; else { base.in = 0; base.out = m.dur; }
    return base;
  };
  U.addClip = (m, at) => { const c = U.newClip(m); const a = at == null ? U.P.clips.length : at; U.P.clips.splice(a, 0, c); return c; };
  U.clipIndexAt = (t) => { const L = U.layout(); for (let i = L.st.length - 1; i >= 0; i--) if (t >= L.st[i] - 1e-6) return i; return 0; };
  U.splitAt = (t) => {
    const L = U.layout(), i = U.clipIndexAt(t), c = U.P.clips[i]; if (!c) return false; const lt = t - L.st[i]; if (lt < .15 || L.ln[i] - lt < .15) return false;
    U.snap(); const b = JSON.parse(JSON.stringify(c, (k, v) => k[0] === '_' ? undefined : v)); b.id = uid(); b.tr = null;
    if (c.kind === 'image') { c.dur = +lt.toFixed(3); b.dur = +(L.ln[i] - lt).toFixed(3); } else { const s = U.srcAt(c, lt); if (c.rev) { b.in = c.in; b.out = s; c.in = s; } else { b.in = s; c.out = s; } }
    U.P.clips.splice(i + 1, 0, b); U.changed(true); return true;
  };
  U.removeClip = (i) => { U.snap(); const [c] = U.P.clips.splice(i, 1); if (c) dropEl(c.id); U.changed(true); };
  U.duplicateClip = (i) => { U.snap(); const c = JSON.parse(JSON.stringify(U.P.clips[i], (k, v) => k[0] === '_' ? undefined : v)); c.id = uid(); U.P.clips.splice(i + 1, 0, c); U.changed(true); };
  U.moveClip = (i, j) => { if (i === j || j < 0 || j >= U.P.clips.length) return; U.snap(); const [c] = U.P.clips.splice(i, 1); U.P.clips.splice(j, 0, c); U.changed(true); };
  U.captureFrame = async (i) => { /* freeze frame at the playhead inside clip i */
    const L = U.layout(), c = U.P.clips[i]; if (!c || c.kind !== 'video') return false; const lt = clamp(U.view.t - L.st[i], 0, L.ln[i]), src = U.srcAt(c, lt), m = U.MEDIA[c.mid];
    const v = await loadVideoMeta(m.url); await seekEl(v, src); const cv = document.createElement('canvas'); cv.width = m.w; cv.height = m.h; cv.getContext('2d').drawImage(v, 0, 0); v.removeAttribute('src'); v.load();
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', .92)); const fm = await U.addMedia(new File([blob], 'freeze.jpg', { type: 'image/jpeg' }));
    let at; if (lt < .15) at = i; else if (L.ln[i] - lt < .15) at = i + 1; else { U.splitAt(U.view.t); at = i + 1; }
    U.snap(); const fc = U.newClip(fm); fc.dur = 2; fc.look = c.look; fc.lookAmt = c.lookAmt; fc.adj = Object.assign({}, c.adj); fc.zoom = c.zoom; fc.panX = c.panX; fc.panY = c.panY; fc.fit = c.fit; fc.flip = c.flip; fc.rot = c.rot; U.P.clips.splice(at, 0, fc); U.changed(true); return true;
  };
  U.coverBlob = async (t) => { const keep = U.view.t; U.view.t = t; U.setRes(U.P.q); await U.prepareAt(t); U._nofade = true; U.draw(t, true); U._nofade = false; const b = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', .92)); U.fitPreview(); U.view.t = keep; U.renderNow(); return b; };
  /* make element frames exact for time t (used by export and cover) */
  U.prepareAt = async (t) => {
    const L = U.layout(), P = U.P, jobs = [];
    P.clips.forEach((c, i) => { if (c.kind === 'video' && t >= L.st[i] - 1e-6 && t < L.st[i] + L.ln[i] + 1e-6) { const e = getEl(c.id, c.mid, new Set([c.id])); if (e) jobs.push(waitReady(e).then(() => seekEl(e.el, clamp(U.srcAt(c, t - L.st[i]), 0, Math.max(0, (U.MEDIA[c.mid].dur || 1) - .02))))); } });
    for (const o of P.overlays) { if (o.type === 'video' && !o.hidden && t >= (o.start || 0) && t < (o.end == null ? 1e9 : o.end)) { const e = getEl('ov' + o.id, o.mid); if (e) jobs.push(waitReady(e).then(() => seekEl(e.el, (o.in || 0) + (t - (o.start || 0)) * (o.speed || 1)))); } }
    await Promise.all(jobs);
  };
  const waitReady = (e) => new Promise((res) => { if (e.el.readyState >= 2) return res(); const f = () => res(); e.el.addEventListener('loadeddata', f, { once: true }); setTimeout(res, 4000); });
  U.releaseAll = () => { for (const k in elPool) dropEl(k); };
})(window);
