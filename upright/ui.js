/* Upright UI: stage handles, timeline, panels. */
(function (root) {
  'use strict';
  const U = root.U, FX = U.FX, clamp = U.clamp, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + (s % 60).toFixed(1).padStart(4, '0'); };
  const UI = root.UI = { S: { clip: -1, ov: null, tab: 'clip', pps: 70, all: false } }, S = UI.S, ACT = {}, INP = {};
  UI.ACT = ACT; UI.INP = INP;
  const cs = () => U.P.clips[S.clip] || null;
  const os = () => U.P.overlays.find((o) => o.id === S.ov) || null;
  const say = (m, bad) => { const e = $('toast'); e.textContent = m; e.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(say.t); say.t = setTimeout(() => { e.className = 'toast'; }, bad ? 6500 : 3200); };
  UI.say = say;
  /* ---------------- files ---------------- */
  UI.addFiles = async (files) => {
    files = [...files]; if (!files.length) return; let n = 0, music = null; const L = U.layout();
    document.body.classList.add('edit');
    for (const f of files) {
      try {
        const isAud = (f.type || '').startsWith('audio') || /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(f.name);
        if (isAud) { music = f; continue; }
        if (!/^(video|image)\//.test(f.type) && !/\.(mp4|mov|m4v|webm|mkv|3gp|jpg|jpeg|png|webp|gif|heic)$/i.test(f.name)) { say('Skipped ' + f.name + ': not a video or photo.', true); continue; }
        const m = await U.addMedia(f); U.snap(); U.addClip(m); n++;
        if (S.clip < 0) S.clip = 0;
      } catch (e) { say('Could not open ' + f.name + '. ' + (e && e.message || ''), true); }
    }
    if (music) await U.setMusicFile(music);
    if (n) { S.clip = U.clipIndexAt(U.view.t); U.changed(true); U.fitPreview(); }
    if (n && U.P.clips.length === n) U.seek(0);
  };
  UI.sample = async () => {
    try { const fs = []; for (const n of ['friends-sunset', 'friends-field', 'friends-park']) { const r = await fetch('sample/' + n + '.jpg'); if (!r.ok) throw 0; fs.push(new File([await r.blob()], n + '.jpg', { type: 'image/jpeg' })); } await UI.addFiles(fs); }
    catch (e) { say('Could not load the sample photos. Check your connection.', true); }
  };
  /* ---------------- stage: handles & gestures ---------------- */
  const hud = () => $('hud');
  let drag = null;
  const pts = new Map();
  function cwRect() { return $('cv').getBoundingClientRect(); }
  function toCanvas(ev) { const r = cwRect(); return { x: (ev.clientX - r.left) / r.width * U.R.W, y: (ev.clientY - r.top) / r.height * U.R.H, k: U.R.W / r.width }; }
  function hit(o, p) { const b = U.ovBox(o); if (!b) return false; const a = -(b.rot || 0) * Math.PI / 180, dx = p.x - b.cx, dy = p.y - b.cy, x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a); const m = 12 * p.k; return Math.abs(x) <= b.w / 2 + m && Math.abs(y) <= b.h / 2 + m; }
  function activeOv(t) { return U.P.overlays.filter((o) => !o.hidden && t >= (o.start || 0) && t < (o.end == null ? 1e9 : o.end)); }
  function drawSel() {
    const bx = $('selbox'), o = os(); if (!o || !U.R) { bx.hidden = true; return; }
    const t = U.view.t, b = U.ovBox(o, t); if (!b || (t < (o.start || 0) || t >= (o.end == null ? 1e9 : o.end))) { bx.hidden = true; return; }
    const W = U.R.W, H = U.R.H; bx.hidden = false; bx.style.left = b.cx / W * 100 + '%'; bx.style.top = b.cy / H * 100 + '%'; bx.style.width = b.w / W * 100 + '%'; bx.style.height = b.h / H * 100 + '%'; bx.style.transform = 'translate(-50%,-50%) rotate(' + (b.rot || 0) + 'deg)';
  }
  UI.drawSel = drawSel;
  function bindStage() {
    const h = hud();
    h.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('.hnd')) return; h.setPointerCapture(ev.pointerId); pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const p = toCanvas(ev), t = U.view.t;
      if (pts.size === 2) { const o = os(), c = cs(); const a = [...pts.values()]; drag = { kind: 'pinch', d0: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), a0: Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x), size0: o ? o.size : (c ? c.zoom || 1 : 1), rot0: o ? o.rot || 0 : 0, o, c }; U.snap(); return; }
      const list = activeOv(t); let found = null; for (let i = list.length - 1; i >= 0; i--) if (hit(list[i], p)) { found = list[i]; break; }
      if (found) { S.ov = found.id; U.snap(); drag = { kind: 'move', o: found, sx: found.x, sy: found.y, p0: p }; UI.syncPanels(); drawSel(); return; }
      if (S.ov) { S.ov = null; UI.syncPanels(); drawSel(); }
      const L = U.layout(), i = U.clipIndexAt(t), c = U.P.clips[i]; if (c) { if (S.clip !== i) { S.clip = i; UI.syncPanels(); renderTL(); } U.snap(); drag = { kind: 'pan', c, px: c.panX || 0, py: c.panY || 0, p0: p }; }
    });
    h.addEventListener('pointermove', (ev) => {
      if (!pts.has(ev.pointerId)) return; pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); if (!drag) return;
      if (drag.kind === 'pinch' && pts.size >= 2) { const a = [...pts.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), an = Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x); const f = d / Math.max(1, drag.d0); if (drag.o) { drag.o.size = clamp(drag.size0 * f, .02, 1.2); drag.o.rot = drag.rot0 + (an - drag.a0) * 180 / Math.PI; } else if (drag.c) drag.c.zoom = clamp(drag.size0 * f, 1, 4); U.changed(); drawSel(); return; }
      const p = toCanvas(ev);
      if (drag.kind === 'move') { let x = drag.sx + (p.x - drag.p0.x) / U.R.W, y = drag.sy + (p.y - drag.p0.y) / U.R.H; const gx = $('gx'), gy = $('gy'); if (Math.abs(x - .5) < .018) { x = .5; gx.hidden = false; } else gx.hidden = true; if (Math.abs(y - .5) < .018) { y = .5; gy.hidden = false; } else gy.hidden = true; drag.o.x = clamp(x, -.2, 1.2); drag.o.y = clamp(y, -.2, 1.2); U.changed(); drawSel(); }
      else if (drag.kind === 'pan') { const c = drag.c, m = U.MEDIA[c.mid]; if (!m) return; const cover = Math.max(U.R.W / m.w, U.R.H / m.h), z = (c.fit === 'contain' ? Math.min(U.R.W / m.w, U.R.H / m.h) : cover) * (c.zoom || 1), ox = Math.max(1, (m.w * z - U.R.W) / 2), oy = Math.max(1, (m.h * z - U.R.H) / 2); c.panX = clamp(drag.px - (p.x - drag.p0.x) / ox, -1, 1); c.panY = clamp(drag.py - (p.y - drag.p0.y) / oy, -1, 1); U.changed(); }
    });
    const up = (ev) => { pts.delete(ev.pointerId); if (!pts.size) { drag = null; $('gx').hidden = true; $('gy').hidden = true; UI.syncPanels(true); } else if (pts.size < 2 && drag && drag.kind === 'pinch') drag = null; };
    h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    h.addEventListener('wheel', (ev) => { const o = os(); if (!o && !cs()) return; ev.preventDefault(); const f = Math.exp(-ev.deltaY * .0015); U.snap(); if (o) o.size = clamp(o.size * f, .02, 1.2); else { const c = cs(); c.zoom = clamp((c.zoom || 1) * f, 1, 4); } U.changed(); drawSel(); }, { passive: false });
    /* handles */
    const hd = (el, mode) => el.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation(); const o = os(); if (!o) return; el.setPointerCapture(ev.pointerId); U.snap(); const b = U.ovBox(o), p = toCanvas(ev);
      drag = { kind: mode, o, b, d0: Math.hypot(p.x - b.cx, p.y - b.cy), size0: o.size, a0: Math.atan2(p.y - b.cy, p.x - b.cx), rot0: o.rot || 0, id: ev.pointerId };
      const mv = (e) => { if (!drag || drag.kind !== mode) return; const q = toCanvas(e); if (mode === 'scale') { o.size = clamp(drag.size0 * Math.hypot(q.x - b.cx, q.y - b.cy) / Math.max(1, drag.d0), .02, 1.2); } else { let r = drag.rot0 + (Math.atan2(q.y - b.cy, q.x - b.cx) - drag.a0) * 180 / Math.PI; if (!e.shiftKey) { const s = Math.round(r / 45) * 45; if (Math.abs(r - s) < 4) r = s; } o.rot = r; } U.changed(); drawSel(); };
      const end = () => { drag = null; el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end); UI.syncPanels(true); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    });
    hd($('hScale'), 'scale'); hd($('hRot'), 'rot');
    $('hDel').addEventListener('click', (e) => { e.stopPropagation(); ACT.ovDel(); });
  }
  /* ---------------- timeline ---------------- */
  let tlRaf = 0;
  const tlSched = () => { if (!tlRaf) tlRaf = requestAnimationFrame(() => { tlRaf = 0; renderTL(); }); };
  UI.renderTL = tlSched;
  const bar = (cls, l, w, inner, extra) => `<div class="${cls}" style="left:${l}px;width:${Math.max(3, w)}px" ${extra || ''}>${inner || ''}</div>`;
  function renderTL() {
    const P = U.P, L = U.layout(), pps = S.pps, tot = L.total, wrap = $('tlin'); if (!wrap) return;
    const width = Math.max(tot * pps + 160, $('tls').clientWidth); wrap.style.width = width + 'px'; const tlc = $('tlc');
    const step = pps >= 140 ? 1 : pps >= 60 ? 2 : pps >= 30 ? 5 : 10; let ruler = '';
    for (let s = 0; s * pps < width; s += step) ruler += `<span style="left:${s * pps}px">${s % 60 === 0 && s ? Math.floor(s / 60) + 'm' : s + 's'}</span>`;
    let h = `<div class="ruler" id="ruler">${ruler}</div>`;
    h += `<div class="trk main" id="mainTrk">`;
    P.clips.forEach((c, i) => {
      const l = L.st[i] * pps, w = L.ln[i] * pps, m = U.MEDIA[c.mid], on = i === S.clip; let th = '';
      if (m && c.kind === 'video' && m.thumbs.length) { const tw = (m.thumbW || 32) * (48 / 56), n = Math.max(1, Math.ceil(w / tw)); for (let k = 0; k < n; k++) { const lt = (k + .5) * tw / pps, src = U.srcAt(c, Math.min(L.ln[i], lt)); let best = m.thumbs[0], bd = 1e9; for (const t of m.thumbs) { const d = Math.abs(t.t - src); if (d < bd) { bd = d; best = t; } } th += `<i style="background-image:url(${best.url});width:${tw}px"></i>`; } }
      else if (m && c.kind === 'image') { th = `<i class="im" style="background-image:url(${m.url});width:100%"></i>`; }
      const badge = (c.speed !== 1 ? c.speed + '×' : '') + (c.ramp && c.ramp !== 'none' ? ' ⌁' : '') + (c.rev ? ' ◂' : '');
      const tr = i > 0 && L.td[i] > 0 ? `<b class="tr" style="width:${L.td[i] * pps}px"></b>` : '';
      h += `<div class="blk ${on ? 'on' : ''}" data-i="${i}" style="left:${l}px;width:${w}px"><div class="th">${th}</div><canvas class="wv" data-i="${i}" width="${Math.max(2, Math.round(w))}" height="22"></canvas>${tr}<span class="lb">${esc(badge)}</span>${on ? '<u class="tH l" data-h="l"></u><u class="tH r" data-h="r"></u>' : ''}</div>`;
    });
    h += `</div>`;
    const rows = []; P.overlays.forEach((o) => rows.push(o));
    rows.forEach((o) => { const s = o.start || 0, e = o.end == null ? tot : o.end, ic = { text: 'T', sticker: '☺', image: '▣', video: '▶', caps: 'CC' }[o.type] || '•', nm = o.type === 'text' ? o.text : o.type === 'caps' ? 'Captions' : o.type === 'sticker' ? o.text : (U.MEDIA[o.mid] ? U.MEDIA[o.mid].name : o.type);
      h += `<div class="trk ov"><div class="obar ${o.id === S.ov ? 'on' : ''} ${o.type}" data-o="${o.id}" style="left:${s * pps}px;width:${Math.max(14, (e - s) * pps)}px"><u class="oH l" data-h="l"></u><span>${ic} ${esc(String(nm).slice(0, 40))}</span><u class="oH r" data-h="r"></u></div></div>`; });
    if (P.music) { const m = P.music, dur = (U.musicBuf ? U.musicBuf.duration : 60) - (m.off || 0), at = m.at || 0; let bt = ''; if (m.beats) U.musicBeatsAbs().forEach((b) => { if (b >= 0 && b <= at + dur && b * pps < width) bt += `<i style="left:${b * pps}px"></i>`; });
      h += `<div class="trk mus"><div class="mbar" id="mbar" style="left:${at * pps}px;width:${Math.max(20, Math.min(dur, Math.max(tot - at, 1) + 0) * pps)}px"><canvas id="mwv" width="${Math.max(2, Math.round(Math.min(dur, Math.max(tot - at, 1)) * pps))}" height="26"></canvas><span>♪ ${esc(m.name || 'Music')}</span></div><div class="beats">${bt}</div></div>`; }
    P.voice.forEach((v, i) => { h += `<div class="trk vo"><div class="vbar" data-v="${i}" style="left:${v.start * pps}px;width:${Math.max(10, v.dur * pps)}px"><span>🎙 Voice ${i + 1}</span></div></div>`; });
    h += `<div class="ph" id="ph" style="left:${U.view.t * pps}px"><i></i></div>`;
    tlc.innerHTML = h;
    tlc.querySelectorAll('canvas.wv').forEach((cv) => { const i = +cv.dataset.i, c = P.clips[i], m = U.MEDIA[c.mid]; if (!m || !m.peaks || c.kind !== 'video' || c.mute) { cv.style.display = 'none'; return; } const g = cv.getContext('2d'), w = cv.width; g.fillStyle = 'rgba(255,255,255,.75)'; const len = L.ln[i]; for (let x = 0; x < w; x += 2) { const s = U.srcAt(c, x / w * len), idx = clamp(Math.floor(s / m.dur * m.peaks.length), 0, m.peaks.length - 1), v = m.peaks[idx] * 20 + 1; g.fillRect(x, 11 - v / 2, 1.4, v); } });
    const mw = $('mwv'); if (mw && U._mpeaks) { const g = mw.getContext('2d'), pk = U._mpeaks, m = P.music, d = U.musicBuf ? U.musicBuf.duration : 60; g.fillStyle = 'rgba(255,255,255,.7)'; for (let x = 0; x < mw.width; x += 2) { const s = (m.off || 0) + x / pps, idx = clamp(Math.floor(s / d * pk.length), 0, pk.length - 1), v = pk[idx] * 22 + 1; g.fillRect(x, 13 - v / 2, 1.4, v); } }
    $('tm').textContent = fmt(U.view.t) + ' / ' + fmt(tot);
    $('sk').max = Math.max(1, Math.round(tot * 100)); $('sk').value = Math.round(U.view.t * 100);
  }
  function movePH() { const ph = $('ph'); if (ph) ph.style.left = U.view.t * S.pps + 'px'; $('tm').textContent = fmt(U.view.t) + ' / ' + fmt(U.total()); $('sk').value = Math.round(U.view.t * 100); const sc = $('tls'), x = U.view.t * S.pps; if (U.playing && (x < sc.scrollLeft + 20 || x > sc.scrollLeft + sc.clientWidth - 60)) sc.scrollLeft = x - 40; }
  function bindTL() {
    const sc = $('tls'); let st = null;
    const tAt = (ev) => { const r = $('tlin').getBoundingClientRect(); return clamp((ev.clientX - r.left) / S.pps, 0, Math.max(.01, U.total())); };
    sc.addEventListener('pointerdown', (ev) => {
      const t = ev.target, hdl = t.closest('.tH'), blk = t.closest('.blk'), ob = t.closest('.obar'), oh = t.closest('.oH'), vb = t.closest('.vbar'), mb = t.closest('#mbar'), ph = t.closest('.ph'), rl = t.closest('.ruler');
      const x0 = ev.clientX, pid = ev.pointerId;
      if (hdl && blk) { sc.setPointerCapture(pid); const i = +blk.dataset.i, c = U.P.clips[i], r0 = c.kind === 'image' ? 1 : (Math.max(.05, c.out - c.in) / U.clipLen(c)); U.snap(); st = { k: 'trim', side: hdl.dataset.h, i, c, in0: c.in, out0: c.out, dur0: c.dur, r: r0, x0, len0: U.clipLen(c) }; return; }
      if (oh && ob) { sc.setPointerCapture(pid); const o = U.P.overlays.find((q) => q.id === ob.dataset.o); S.ov = o.id; U.snap(); st = { k: 'oedge', side: oh.dataset.h, o, s0: o.start || 0, e0: o.end == null ? U.total() : o.end, x0 }; return; }
      if (ob) { sc.setPointerCapture(pid); const o = U.P.overlays.find((q) => q.id === ob.dataset.o); const was = S.ov === o.id; S.ov = o.id; if (o.type === 'caps' || true) { U.snap(); st = { k: 'omove', o, s0: o.start || 0, e0: o.end == null ? U.total() : o.end, x0, moved: false, was }; } UI.syncPanels(); renderTL(); return; }
      if (vb) { sc.setPointerCapture(pid); const v = U.P.voice[+vb.dataset.v]; U.snap(); st = { k: 'vmove', v, s0: v.start, x0 }; return; }
      if (mb) { sc.setPointerCapture(pid); const m = U.P.music; U.snap(); st = { k: 'mmove', m, a0: m.at || 0, x0 }; return; }
      if (blk) { const i = +blk.dataset.i; if (S.clip !== i) { S.clip = i; U.seek(tAt(ev)); S.clip = i; UI.syncPanels(); renderTL(); } else { U.seek(tAt(ev)); S.clip = i; sc.setPointerCapture(pid); st = { k: 'reorder', i, x0, pre: true, y0: ev.clientY }; } return; }
      if (ph || rl || t.closest('.trk') || t.id === 'tlin') { sc.setPointerCapture(pid); st = { k: 'scrub' }; U.seek(tAt(ev)); }
    });
    sc.addEventListener('pointermove', (ev) => {
      if (!st) return; const d = (ev.clientX - st.x0) / S.pps;
      if (st.k === 'scrub') { U.seek(tAt(ev)); return; }
      if (st.k === 'trim') { const c = st.c; let nd = d; if (c.kind === 'image') { if (st.side === 'r') c.dur = clamp(st.dur0 + nd, .3, 30); else c.dur = clamp(st.dur0 - nd, .3, 30); } else { const m = U.MEDIA[c.mid], dd = nd * st.r; if (st.side === 'l') { if (!c.rev) c.in = clamp(st.in0 + dd, 0, st.out0 - .2); else c.out = clamp(st.out0 - dd, st.in0 + .2, m.dur); } else { if (!c.rev) c.out = clamp(st.out0 + dd, st.in0 + .2, m.dur); else c.in = clamp(st.in0 - dd, 0, st.out0 - .2); } } c._k = null; U.changed(); return; }
      if (st.k === 'oedge') { if (st.side === 'l') st.o.start = clamp(st.s0 + d, 0, st.e0 - .2); else st.o.end = Math.max(st.s0 + .2, st.e0 + d); U.changed(); return; }
      if (st.k === 'omove') { if (Math.abs(ev.clientX - st.x0) > 3) st.moved = true; const len = st.e0 - st.s0; let s = Math.max(0, st.s0 + d); st.o.start = s; st.o.end = s + len; U.changed(); return; }
      if (st.k === 'vmove') { st.v.start = Math.max(0, st.s0 + d); U.changed(); return; }
      if (st.k === 'mmove') { st.m.at = Math.max(0, st.a0 + d); U._beatCache = null; U.changed(); return; }
      if (st.k === 'reorder') { if (st.pre && Math.abs(ev.clientX - st.x0) < 8) return; st.pre = false; const L = U.layout(), c = U.P.clips[st.i], mid = L.st[st.i] + L.ln[st.i] / 2 + d; let j = st.i; for (let q = 0; q < L.st.length; q++) { if (mid > L.st[q] + L.ln[q] / 2) j = q; } if (mid < L.st[0] + L.ln[0] / 2) j = 0; st.j = j; const el = sc.querySelector(`.blk[data-i="${st.i}"]`); if (el) { el.style.transform = `translateX(${d * S.pps}px)`; el.style.zIndex = 9; el.style.opacity = .8; } const ind = $('dropInd'); ind.hidden = false; const tgt = j > st.i ? L.st[j] + L.ln[j] : L.st[j]; ind.style.left = tgt * S.pps + 'px'; }
    });
    const end = (ev) => { if (!st) return; const s = st; st = null; $('dropInd').hidden = true; if (s.k === 'reorder' && !s.pre && s.j != null && s.j !== s.i) { U.moveClip(s.i, s.j); S.clip = s.j; UI.syncPanels(); } else if (s.k === 'reorder') renderTL(); if (s.k === 'trim' || s.k === 'oedge' || s.k === 'omove' || s.k === 'vmove' || s.k === 'mmove') { U.changed(s.k === 'trim'); UI.syncPanels(true); } };
    sc.addEventListener('pointerup', end); sc.addEventListener('pointercancel', end);
    sc.addEventListener('wheel', (ev) => { if (!ev.ctrlKey && !ev.metaKey) return; ev.preventDefault(); UI.zoomTL(ev.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  }
  UI.zoomTL = (f) => { const sc = $('tls'), c = (sc.scrollLeft + sc.clientWidth / 2) / S.pps; S.pps = clamp(S.pps * f, 10, 400); renderTL(); sc.scrollLeft = c * S.pps - sc.clientWidth / 2; };
  UI.fitTL = () => { const tot = U.total(); if (tot > 0) S.pps = clamp(($('tls').clientWidth - 90) / tot, 10, 400); renderTL(); $('tls').scrollLeft = 0; };
  /* ---------------- panels ---------------- */
  const TABS = [['clip', 'Clip'], ['looks', 'Looks'], ['text', 'Text'], ['caps', 'Captions'], ['audio', 'Audio'], ['auto', 'Auto'], ['out', 'Export']];
  const sl = (id, label, min, max, step, val, extra) => `<label class="sl">${label}<span class="v" id="v_${id}">${typeof val === 'number' ? +val.toFixed(2) : val}</span><input type="range" data-in="${id}" min="${min}" max="${max}" step="${step}" value="${val}" ${extra || ''}></label>`;
  const chk = (id, label, on) => `<label class="ck2"><input type="checkbox" data-in="${id}" ${on ? 'checked' : ''}> ${label}</label>`;
  const opt = (arr, cur) => arr.map((a) => { const v = Array.isArray(a) ? a[0] : a, n = Array.isArray(a) ? a[1] : a; return `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(n)}</option>`; }).join('');
  const sel2 = (id, label, arr, cur) => `<label class="sl">${label}<select data-in="${id}">${opt(arr, cur)}</select></label>`;
  const btn = (act, label, cls, extra) => `<button class="${cls || ''}" data-act="${act}" ${extra || ''}>${label}</button>`;
  function tabsBar() { $('tabs').innerHTML = TABS.map(([k, n]) => `<button role="tab" aria-selected="${S.tab === k}" data-act="tab" data-k="${k}">${n}</button>`).join(''); }
  UI.syncPanels = (soft) => { tabsBar(); if (soft && !UI._force) { /* keep focus in inputs */ } buildPanel(); drawSel(); };
  function buildPanel() {
    const P = U.P, el = $('panel'), f = { clip: pClip, looks: pLooks, text: pText, caps: pCaps, audio: pAudio, auto: pAuto, out: pOut }[S.tab];
    const ae = document.activeElement; if (ae && el.contains(ae) && UI._busy && (ae.tagName === 'TEXTAREA' || ['range', 'text', 'color', 'number'].includes(ae.type))) return;
    const keepT = UI._lastTab === S.tab, op = keepT ? [...el.querySelectorAll('details.sub')].map((d) => d.open) : null; UI._lastTab = S.tab;
    el.innerHTML = f(); if (op) el.querySelectorAll('details.sub').forEach((d, i) => { if (op[i] != null) d.open = op[i]; });
    if (S.tab === 'looks') UI.lookThumbs(); if (S.tab === 'audio') renderLib(); if (S.tab === 'caps') {} if (S.tab === 'out') outBusy();
  }
  function noClip() { return '<p class="m">Add a video or photo, then select it on the timeline.</p>'; }
  function pClip() {
    const c = cs(); if (!c) return noClip(); const L = U.layout(), len = U.clipLen(c), m = U.MEDIA[c.mid];
    let h = `<div class="row">${btn('split', '✂ Split', 'p')}${btn('dup', 'Duplicate')}${btn('del', 'Delete')}${c.kind === 'video' ? btn('freeze', '❄ Freeze frame') : ''}</div>`;
    h += `<div class="row m">Clip ${S.clip + 1} of ${U.P.clips.length} · ${len.toFixed(1)} s${m ? ' · ' + esc(m.name) : ''}</div>`;
    if (c.kind === 'video') {
      h += `<div class="mo">Speed</div><div class="chips">${[.25, .5, 1, 1.5, 2, 3].map((s) => `<button class="${c.speed === s ? 'on' : ''}" data-act="speed" data-v="${s}">${s}×</button>`).join('')}</div>`;
      h += sl('speed', 'Custom speed', .1, 4, .05, c.speed) + sel2('ramp', 'Speed curve', [['none', 'None (constant)'], ['rampup', 'Ramp up: slow to fast'], ['rampdown', 'Ramp down: fast to slow'], ['pulse', 'Pulse: dip in the middle'], ['flash', 'Flash: fast, slow, fast']], c.ramp || 'none');
      h += `<div class="row">${chk('rev', 'Reverse', c.rev)}${chk('mute', 'Mute clip audio', c.mute)}</div>` + sl('vol', 'Clip volume', 0, 1.5, .05, c.vol == null ? 1 : c.vol);
    } else { h += sl('dur', 'Photo duration (s)', .5, 12, .1, c.dur) + chk('kbOn', 'Slow zoom (Ken Burns)', !!c.kb); }
    h += `<div class="mo">Frame</div>` + sel2('fit', 'Fit', [['cover', 'Fill the frame (crop)'], ['contain', 'Show whole picture (blurred edges)']], c.fit) + sl('zoom', 'Zoom', 1, 4, .02, c.zoom || 1) + `<div class="m">Drag on the preview to pan, pinch or scroll to zoom.</div><div class="row">${btn('resetpan', 'Centre')}${btn('flip', c.flip ? '⇋ Unflip' : '⇋ Flip')}${btn('rot90', '⟳ Rotate 90°')}</div>`;
    h += `<div class="mo">Transition into this clip</div><div class="row">` + sel2('tr', '', [['', 'Project default']].concat(U.TRANS.map((t) => [t, t])), c.tr || '') + `${btn('trall', 'Use for all')}</div>`;
    return h;
  }
  const ADJ = [['exp', 'Exposure', -1, 1, .02, 0], ['con', 'Contrast', .6, 1.6, .02, 1], ['sat', 'Saturation', 0, 2, .02, 1], ['warm', 'Warmth', -1, 1, .02, 0], ['tint', 'Tint', -1, 1, .02, 0], ['hue', 'Hue', -180, 180, 1, 0], ['hi', 'Highlights', -1, 1, .02, 0], ['sh', 'Shadows', -1, 1, .02, 0], ['fade', 'Fade', 0, 1, .02, 0], ['vig', 'Vignette', 0, 1, .02, 0], ['grain', 'Grain', 0, 1, .02, 0], ['sharp', 'Sharpen', 0, 1, .02, 0], ['blur', 'Blur', 0, 8, .1, 0]];
  const EFX = [['glow', 'Glow', 1], ['rgb', 'RGB split', 1], ['glitch', 'Glitch', 1], ['vhs', 'VHS', 1], ['pix', 'Pixelate', 40], ['duo', 'Duotone', 1], ['shake', 'Shake', 3]];
  function pLooks() {
    const c = cs(); if (!c) return noClip(); const P = U.P;
    let h = `${chk('all', 'Edit all clips at once', S.all)}<div class="looks" id="lookRow">${Object.keys(FX.LOOKS).map((k) => `<button class="lk ${c.look === k ? 'on' : ''}" data-act="look" data-k="${k}"><img alt="" id="lk_${k}" width="54" height="96"><span>${FX.LOOKS[k].n}</span></button>`).join('')}</div>`;
    h += sl('lookAmt', 'Look strength', 0, 1, .02, c.lookAmt == null ? 1 : c.lookAmt) + `<div class="row">${btn('lookall', 'Apply this look to all clips')}${btn('adjreset', 'Reset adjustments')}</div>`;
    h += `<details class="sub" open><summary>Adjust</summary><div class="g2">${ADJ.map(([k, n, a, b, s, d]) => sl('adj_' + k, n, a, b, s, (c.adj && c.adj[k] != null) ? c.adj[k] : d)).join('')}</div></details>`;
    h += `<details class="sub"><summary>Effects</summary><div class="chips">${EFX.map(([k, n]) => `<button class="${(c.fx && c.fx[k]) ? 'on' : ''}" data-act="fx" data-k="${k}">${n}</button>`).join('')}</div>`;
    EFX.forEach(([k, n, mx]) => { if (c.fx && c.fx[k]) h += sl('fx_' + k, n + ' amount', k === 'pix' ? 6 : .05, mx, k === 'pix' ? 1 : .05, c.fx[k]); }); if (c.fx && c.fx.duo) h += `<div class="row"><label class="sl">Shadows<input type="color" data-in="duoA" value="${c.fx.duoA || '#101030'}"></label><label class="sl">Highlights<input type="color" data-in="duoB" value="${c.fx.duoB || '#ffd0a0'}"></label></div>`; h += `</details>`;
    const luts = Object.entries(P.luts || {});
    h += `<details class="sub"><summary>Colour LUT (.cube)</summary><div class="row"><label class="btn">Import .cube file<input type="file" accept=".cube" data-in="lutfile" hidden></label>${c.lutId ? btn('lutoff', 'Remove LUT') : ''}</div>${luts.length ? `<div class="chips">${luts.map(([id, l]) => `<button class="${c.lutId === id ? 'on' : ''}" data-act="lut" data-k="${id}">${esc(l.name)}</button>`).join('')}</div>` : '<div class="m">LUTs are colour presets from editors like DaVinci Resolve or Lightroom.</div>'}${c.lutId ? sl('lutAmt', 'LUT strength', 0, 1, .02, c.lutAmt == null ? 1 : c.lutAmt) : ''}</details>`;
    h += `<details class="sub"><summary>Beat zoom</summary>` + sl('beatZoom', 'Zoom pulse on every beat', 0, .15, .005, P.beatZoom) + `<div class="m">${P.music ? 'Pulses on the beats of your song.' : 'Add music first (Audio tab) to give it beats.'}</div></details>`;
    return h;
  }
  const lkSrc = { c: null, tex: null, key: '' };
  let thumbR = null, thumbCv = null, lkTimer = 0;
  UI.lookThumbs = () => {
    clearTimeout(lkTimer); lkTimer = setTimeout(() => {
      const c = cs(); if (!c || S.tab !== 'looks') return; const m = U.MEDIA[c.mid]; if (!m) return;
      try {
        if (!thumbR) { thumbCv = document.createElement('canvas'); thumbCv.width = 108; thumbCv.height = 192; thumbR = new FX.Renderer(thumbCv); lkSrc.tex = thumbR.newTex(); }
        const sc = document.createElement('canvas'); sc.width = 216; sc.height = 384; const g = sc.getContext('2d'); let src = null, w = 0, h = 0;
        if (c.kind === 'image') { src = m.img; w = m.w; h = m.h; } else { const e = U.getPoolEl && U.getPoolEl(c.id); const v = e || m.meta; if (v && v.readyState >= 2) { src = v; w = m.w; h = m.h; } else if (m.thumbs.length) { /* fall back to a stored thumbnail */ } }
        if (!src) { setTimeout(UI.lookThumbs, 600); return; }
        const k = Math.max(216 / w, 384 / h); g.drawImage(src, (216 - w * k) / 2, (384 - h * k) / 2, w * k, h * k); thumbR.upload(lkSrc.tex, sc, 216, 384);
        for (const k2 of Object.keys(FX.LOOKS)) { const im = $('lk_' + k2); if (!im) continue; thumbR.clip(lkSrc.tex, { fit: 'cover', params: FX.effective({ look: k2, lookAmt: 1 }), time: 0 }, thumbR.fb.A); thumbR.present(thumbR.fb.A); im.src = thumbCv.toDataURL('image/jpeg', .7); }
      } catch (e) { }
    }, 120);
  };
  function pText() {
    const P = U.P, o = os(); let h = `<div class="row">${btn('addText', '+ Text', 'p')}${btn('addSticker', '☺ Sticker')}<label class="btn">▣ Image / logo<input type="file" accept="image/*" data-in="imgfile" hidden></label><label class="btn">▶ Video overlay<input type="file" accept="video/*" data-in="pipfile" hidden></label></div>`;
    h += `<div class="emo" id="emo" hidden>${['😀', '😂', '😍', '🔥', '✨', '💖', '🎉', '👍', '🙌', '😎', '🤩', '🥳', '🌈', '⭐', '❤️', '💯', '🎵', '📍', '✅', '👀', '🍕', '🌴', '🚀', '💥'].map((e) => `<button data-act="emoji" data-k="${e}">${e}</button>`).join('')}</div>`;
    h += `<div class="olist">${P.overlays.map((q) => `<button class="ol ${q.id === S.ov ? 'on' : ''}" data-act="ovsel" data-k="${q.id}">${{ text: 'T', sticker: q.text, image: '▣', video: '▶', caps: 'CC' }[q.type]} ${esc(q.type === 'text' ? q.text : q.type === 'caps' ? 'Captions' : q.type === 'video' ? 'Video overlay' : q.type === 'image' ? 'Image' : 'Sticker').slice(0, 22)}</button>`).join('') || '<span class="m">Nothing added yet. Drag items on the preview to place them.</span>'}</div>`;
    if (!o) return h; const isT = o.type === 'text';
    h += `<div class="mo">Selected: ${o.type}</div>`;
    if (isT) {
      h += `<textarea data-in="text" rows="2">${esc(o.text)}</textarea><div class="g2">${sel2('font', 'Font', [['sans', 'Clean'], ['bold', 'Heavy'], ['serif', 'Serif'], ['mono', 'Mono']], o.font || 'sans')}${sel2('align', 'Align', ['left', 'center', 'right'], o.align || 'center')}</div>`;
      h += `<div class="row"><label class="sl">Colour<input type="color" data-in="color" value="${o.color || '#ffffff'}"></label><label class="sl">Box<input type="color" data-in="bg" value="${o.bg || '#000000'}"></label>${chk('bgOn', 'Box', !!o.bg)}${chk('strokeOn', 'Outline', !!o.strokeW)}${chk('shadow', 'Shadow', !!o.shadow)}${chk('upper', 'CAPS', !!o.upper)}</div>`;
    }
    if (o.type !== 'caps') h += sl('size', 'Size', .02, o.type === 'text' ? .4 : 1.2, .005, o.size || .07);
    h += sl('alpha', 'Opacity', .1, 1, .02, o.alpha == null ? 1 : o.alpha) + sl('rot', 'Rotation', -180, 180, 1, o.rot || 0) + sel2('anim', 'Entrance', [['none', 'None'], ['fade', 'Fade'], ['pop', 'Pop'], ['slide', 'Slide up'], ['bounce', 'Bounce'], ['spin', 'Spin in']], o.anim || 'none');
    h += `<div class="g2"><label class="sl">Starts (s)<input type="number" step=".1" min="0" data-in="start" value="${(o.start || 0).toFixed(1)}"></label><label class="sl">Ends (s)<input type="number" step=".1" min="0" data-in="end" value="${o.end == null ? '' : o.end.toFixed(1)}" placeholder="end of reel"></label></div><div class="row">${btn('setStart', 'Start here')}${btn('setEnd', 'End here')}${btn('ovDup', 'Duplicate')}${btn('ovDel', 'Delete')}${btn('ovUp', 'Bring forward')}</div>`;
    if (o.type === 'video') {
      h += sl('ovvol', 'Overlay volume', 0, 1, .05, o.vol == null ? 0 : o.vol) + sl('radius', 'Rounded corners', 0, 1, .02, o.radius || 0) + chk('keyOn', 'Remove background (chroma key)', !!(o.key && o.key.on));
      if (o.key && o.key.on) h += `<div class="row">${['#00ff00', '#0000ff', '#ffffff'].map((c) => `<button class="sw" style="background:${c}" data-act="keyc" data-k="${c}" aria-label="Key colour ${c}"></button>`).join('')}<input type="color" data-in="keyc" value="${o.key.color || '#00ff00'}"></div>` + sl('keytol', 'Colour range', .02, .5, .01, o.key.tol == null ? .12 : o.key.tol) + sl('keysoft', 'Edge softness', .01, .3, .01, o.key.soft == null ? .08 : o.key.soft);
    }
    return h;
  }
  /* captions panel */
  function pCaps() {
    const P = U.P, cp = P.caps, hasV = P.clips.some((c) => c.kind === 'video') || P.voice.length;
    let h = `<div class="m">Turns the speech in your clips and voiceover into captions, on this device. The first run downloads a speech model (about 40 to 80 MB), then it is kept for next time. Accuracy is best for English and weaker for some languages, so check the text.</div>`;
    h += `<div class="g2"><label class="sl">Language<select data-in="capLang"><option value="-1">Auto-detect</option>${root.UprightWhisper.LANGS.map((l, i) => `<option value="${i}" ${String(UI._cl) === String(i) ? 'selected' : ''}>${l[1]}</option>`).join('')}</select></label>${sel2('capModel', 'Model', [['tiny', 'Fast (smaller)'], ['base', 'Better (larger)']], UI._cm || 'tiny')}</div>`;
    h += `<div class="row">${btn('capGo', cp ? 'Generate again' : 'Generate captions', 'p', hasV ? '' : 'disabled')}${btn('capStop', 'Stop', '', 'id="capStop" hidden')}<label class="btn">Import .srt<input type="file" accept=".srt,.vtt,.txt" data-in="srtfile" hidden></label></div><div class="m" id="capSt"></div><progress id="capPg" value="0" max="1" hidden></progress>`;
    if (cp) {
      h += `<div class="mo">Style</div><div class="chips">${Object.entries(U.CAPSTYLES).map(([k, s]) => `<button class="${cp.style === k ? 'on' : ''}" data-act="capStyle" data-k="${k}">${s.n}</button>`).join('')}</div>`;
      h += `<div class="g2">${sl('capSize', 'Size', .03, .12, .002, cp.size || .06)}<label class="sl">Text colour<input type="color" data-in="capColor" value="${cp.color || '#ffffff'}"></label><label class="sl">Highlight colour<input type="color" data-in="capHl" value="${cp.hl || '#ffe14a'}"></label></div><div class="m">Drag the captions on the preview to move them.</div>`;
      h += `<div class="mo">Text (${cp.segs.length} lines)</div><div class="segs">${cp.segs.map((s, i) => `<div class="seg"><button data-act="segGo" data-k="${i}" title="Jump here">${fmt(s.s)}</button><input data-in="seg_${i}" value="${esc(s.t)}"><button data-act="segDel" data-k="${i}" aria-label="Delete line">×</button></div>`).join('')}</div>${btn('capClear', 'Remove captions')}`;
    }
    return h;
  }
  /* audio panel */
  let libTab = 'All', pvA = null, pvI = -1;
  function renderLib() { const el = $('mlist'); if (!el) return; const LIB = root.LIB, cur = U.P.music && U.P.music.src === 'lib' ? U.P.music.file : null; $('mtabs').innerHTML = ['All', ...new Set(LIB.map((t) => t.mood))].map((m) => `<button role="tab" aria-selected="${m == libTab}" data-act="libTab" data-k="${m}">${m}</button>`).join(''); el.innerHTML = LIB.map((t, i) => ({ t, i })).filter((x) => libTab == 'All' || x.t.mood == libTab).map(({ t, i }) => { const on = t.file === cur; return `<div class="mrow ${on ? 'on' : ''}"><button class="pv" data-act="libPv" data-k="${i}" aria-label="${pvI == i ? 'Stop preview' : 'Preview'} ${esc(t.name)}">${pvI == i ? '❚❚' : '▶'}</button><div><b>${esc(t.name)}</b><span class="d">${t.mood} · ${t.bpm} BPM · ${esc(t.desc)}</span></div>${on ? btn('musicOff', 'Remove') : btn('libUse', 'Use', 'p', 'data-k="' + i + '"')}</div>`; }).join(''); }
  function pAudio() {
    const P = U.P, m = P.music;
    let h = `<div class="mo">Music library · original tracks made for Upright</div><div class="mtabs" id="mtabs" role="tablist"></div><div id="mlist" class="mlist"></div>`;
    h += `<div class="row" style="margin-top:10px"><label class="btn">♪ Add music from device<input type="file" accept="audio/*" data-in="musicfile" hidden></label>${m ? btn('musicOff', 'Remove music') : ''}${btn('offline', '⇩ Save music for offline')}</div><div class="m" id="musSt">${m ? esc(m.name) + (m.bpm ? ' · ' + m.bpm + ' BPM' : '') + (m.beats ? ' · ' + m.beats.length + ' beats found' : '') : ''}</div>`;
    h += `<div class="g2">${sl('clipVol', 'Clip audio', 0, 1.5, .05, P.clipVol)}${sl('musicVol', 'Music volume', 0, 1, .05, P.musicVol)}</div>`;
    if (m) h += `<div class="g2"><label class="sl">Start song at (s)<input type="number" step=".1" min="0" data-in="musOff" value="${(m.off || 0).toFixed(1)}"></label><label class="sl">Song begins at (s)<input type="number" step=".1" min="0" data-in="musAt" value="${(m.at || 0).toFixed(1)}"></label></div><div class="row">${btn('syncCuts', 'Snap photo cuts to the beat')}</div>`;
    h += sel2('duck', 'Lower the music under', [['voice', 'My voiceover'], ['clips', 'Voiceover and speech in clips'], ['off', 'Nothing (no ducking)']], P.duck);
    h += `<div class="mo">Voiceover</div><div class="row">${btn('rec', UI.recording ? '■ Stop recording' : '● Record from playhead', UI.recording ? 'rec' : 'p')}<span class="m" id="recSt">${UI.recording ? 'Recording… the preview plays so you can talk over it.' : 'Uses your microphone. Audio stays on this device.'}</span></div>`;
    h += P.voice.map((v, i) => `<div class="mrow"><div></div><div><b>Voiceover ${i + 1}</b><span class="d">${v.start.toFixed(1)} s · ${v.dur.toFixed(1)} s long</span></div>${btn('voiceDel', 'Delete', '', 'data-k="' + i + '"')}</div>`).join('');
    return h;
  }
  function pAuto() {
    const P = U.P, moods = [...new Set(root.LIB.map((t) => t.mood))], n = Object.values(U.MEDIA).filter((m) => m.kind !== 'audio').length;
    return `<div class="m">One tap: Upright arranges your ${n} clip${n === 1 ? '' : 's'} into a reel with cuts on the beat, transitions, a look and a fade-out. You can still edit everything afterwards.</div>
    ${sel2('aSong', 'Song', [['cur', P.music ? 'Keep current: ' + P.music.name : 'Pick one for me']].concat(moods.map((m) => ['mood:' + m, 'Pick a ' + m + ' track'])), UI._as || 'cur')}
    <div class="g2">${sel2('aLen', 'Length', [[15, '15 seconds'], [30, '30 seconds'], [45, '45 seconds'], [60, '60 seconds']], UI._al || 30)}${sel2('aPace', 'Cut every', [[1, '1 beat (fast)'], [2, '2 beats'], [4, '4 beats (calm)']], UI._ap || 2)}${sel2('aTrans', 'Transitions', [['mix', 'Mix it up'], ['cut', 'Hard cuts'], ['fade', 'Fade'], ['zoom', 'Zoom'], ['slide', 'Slide'], ['glitch', 'Glitch']], UI._at || 'mix')}${sel2('aLook', 'Look', [['none', 'None']].concat(Object.keys(FX.LOOKS).filter((k) => k !== 'none').map((k) => [k, FX.LOOKS[k].n])), UI._ak || 'punchy')}</div>
    <div class="row">${chk('aZoom', 'Zoom pulse on the beat', UI._az !== false)}${chk('aShuf', 'Shuffle order', !!UI._ash)}</div>
    <div class="row">${btn('autoGo', '✦ Make my reel', 'p', n ? '' : 'disabled')}<span class="m" id="autoSt"></span></div>`;
  }
  function pOut() {
    const P = U.P, caps = U.exportCaps(), [w, h] = U.dims();
    return `<div class="g2">${sel2('ar', 'Format', ['9:16', '4:5', '1:1', '16:9'], P.ar)}${sel2('q', 'Quality', [[540, '540p'], [720, '720p'], [1080, '1080p']], P.q)}${sel2('fps', 'Frame rate', [[24, '24'], [30, '30'], [60, '60']], P.fps)}${sel2('trType', 'Transitions', U.TRANS, P.tr.type)}${sl('trDur', 'Transition length (s)', 0, 1.5, .05, P.tr.dur)}</div><div class="row">${chk('fade', 'Fade in and out', P.fade)}</div>
    <div class="mo">Cover frame</div><div class="row"><div class="cover" id="coverBox"></div><div>${btn('coverSet', 'Use current frame')}<div class="m">${P.cover.toFixed(1)} s${''}</div>${btn('coverSave', 'Save cover image')}</div></div>
    <div class="mo">Export</div><div class="row">${btn('exportGo', 'Export reel (' + w + '×' + h + ')', 'p', 'id="eb"')}${btn('exportStop', 'Cancel', '', 'id="xb" disabled')}</div><div class="m" id="st">${caps.webcodecs ? 'Fast export on this browser: it renders faster than real time.' : 'This browser has no fast encoder, so Upright records in real time. Keep this tab open.'}</div><progress id="pg" value="0" max="1"></progress><div id="out"></div>
    <div class="mo">Project</div><div class="row">${btn('startOver', 'Start over')}<span class="m" id="saveSt">Autosaved on this device.</span></div>`;
  }
  const outBusy = () => { if (UI.exp) { $('eb').disabled = true; $('xb').disabled = false; } if (UI.lastOut) showOut(UI.lastOut); };
  function showOut(r) { const el = $('out'); if (!el) return; const u = r.url; el.innerHTML = `<video src="${u}" controls playsinline poster="${r.poster || ''}"></video><div class="row"><a class="btn p" href="${u}" download="upright-reel.${r.ext}">Download .${r.ext}</a>${r.canShare ? btn('shareVid', 'Share…') : ''}</div><div class="m">${(r.blob.size / 1048576).toFixed(1)} MB · ${r.seconds.toFixed(1)} s · ${esc(r.info)} · made in ${r.took.toFixed(0)} s</div>`; }
  UI.showOut = showOut;
  root.addEventListener('DOMContentLoaded', () => { });
  /* ---------------- actions & inputs ---------------- */
  const each = (fn) => { if (S.all) U.P.clips.forEach(fn); else { const c = cs(); if (c) fn(c); } };
  const chg = (st) => { U.changed(!!st); };
  ACT.tab = (el) => { S.tab = el.dataset.k; UI.syncPanels(); };
  ACT.split = () => { if (!U.splitAt(U.view.t)) say('Move the playhead inside a clip to split it.', true); else S.clip = U.clipIndexAt(U.view.t); UI.syncPanels(); };
  ACT.dup = () => { if (S.clip >= 0) { U.duplicateClip(S.clip); S.clip++; UI.syncPanels(); } };
  ACT.del = () => { if (S.clip >= 0) { U.removeClip(S.clip); S.clip = Math.min(S.clip, U.P.clips.length - 1); if (!U.P.clips.length) document.body.classList.remove('edit'); UI.syncPanels(); U.seek(U.view.t); } };
  ACT.freeze = async () => { try { await U.captureFrame(S.clip); say('Froze this frame for 2 seconds.'); UI.syncPanels(); } catch (e) { say('Could not capture that frame.', true); } };
  ACT.speed = (el) => { U.snap(); const c = cs(); c.speed = +el.dataset.v; c._k = null; chg(1); UI.syncPanels(); };
  ACT.resetpan = () => { U.snap(); const c = cs(); c.panX = c.panY = 0; chg(); };
  ACT.flip = () => { U.snap(); const c = cs(); c.flip = !c.flip; chg(); UI.syncPanels(); };
  ACT.rot90 = () => { U.snap(); const c = cs(); c.rot = ((c.rot || 0) + 90) % 360; chg(); };
  ACT.trall = () => { U.snap(); const t = cs().tr || U.P.tr.type; U.P.tr.type = t; U.P.clips.forEach((c) => { c.tr = null; }); chg(1); UI.syncPanels(); };
  ACT.look = (el) => { U.snap(); each((c) => { c.look = el.dataset.k; if (c.lookAmt == null) c.lookAmt = 1; }); chg(); document.querySelectorAll('.lk').forEach((b) => b.classList.toggle('on', b === el)); };
  ACT.lookall = () => { U.snap(); const c = cs(); U.P.clips.forEach((q) => { q.look = c.look; q.lookAmt = c.lookAmt; }); chg(); say('Look applied to every clip.'); };
  ACT.adjreset = () => { U.snap(); each((c) => { c.adj = {}; c.fx = {}; c.look = 'none'; c.lutId = null; }); chg(1); UI.syncPanels(); };
  ACT.fx = (el) => { U.snap(); const k = el.dataset.k, def = EFX.find((e) => e[0] === k); each((c) => { c.fx = c.fx || {}; c.fx[k] = c.fx[k] ? 0 : (k === 'pix' ? 8 : k === 'shake' ? 1 : .6); }); chg(1); UI.syncPanels(); };
  ACT.lut = (el) => { U.snap(); each((c) => { c.lutId = el.dataset.k; c.lutAmt = 1; }); chg(1); UI.syncPanels(); };
  ACT.lutoff = () => { U.snap(); each((c) => { c.lutId = null; }); chg(1); UI.syncPanels(); };
  const addOv = (o) => { U.snap(); const t = U.view.t; const d = { id: U.uid(), start: +t.toFixed(2), end: null, x: .5, y: .5, rot: 0, alpha: 1, anim: 'pop' }; for (const k in d) if (o[k] === undefined) o[k] = d[k]; U.P.overlays.push(o); S.ov = o.id; S.tab = 'text'; U.changed(true); UI.syncPanels(); return o; };
  ACT.addText = () => addOv({ type: 'text', text: 'Your text', size: .09, font: 'bold', color: '#ffffff', stroke: '#000000', strokeW: 1, shadow: 1, align: 'center', y: .35 });
  ACT.addSticker = () => { $('emo').hidden = !$('emo').hidden; };
  ACT.emoji = (el) => { addOv({ type: 'sticker', text: el.dataset.k, size: .2, y: .5 }); };
  ACT.ovsel = (el) => { S.ov = el.dataset.k; UI.syncPanels(); renderTL(); };
  ACT.ovDel = () => { const o = os(); if (!o) return; U.snap(); U.P.overlays = U.P.overlays.filter((q) => q.id !== o.id); if (o.type === 'caps') U.P.caps = null; S.ov = null; U.changed(true); UI.syncPanels(); };
  ACT.ovDup = () => { const o = os(); if (!o || o.type === 'caps') return; U.snap(); const c = JSON.parse(JSON.stringify(o)); c.id = U.uid(); c.x = Math.min(1, c.x + .06); c.y = Math.min(1, c.y + .06); U.P.overlays.push(c); S.ov = c.id; U.changed(true); UI.syncPanels(); };
  ACT.ovUp = () => { const o = os(), a = U.P.overlays, i = a.indexOf(o); if (!o || i >= a.length - 1) return; U.snap(); a.splice(i, 1); a.splice(i + 1, 0, o); U.changed(true); };
  ACT.setStart = () => { const o = os(); if (!o) return; U.snap(); o.start = +U.view.t.toFixed(2); chg(1); UI.syncPanels(); };
  ACT.setEnd = () => { const o = os(); if (!o) return; U.snap(); o.end = +U.view.t.toFixed(2); chg(1); UI.syncPanels(); };
  ACT.keyc = (el) => { const o = os(); U.snap(); o.key.color = el.dataset.k; chg(); UI.syncPanels(); };
  ACT.libTab = (el) => { libTab = el.dataset.k; renderLib(); };
  ACT.libPv = (el) => { const i = +el.dataset.k; if (pvI === i) { stopPv(); renderLib(); return; } stopPv(); U.pause(); pvA = new Audio(root.LIB[i].file); pvI = i; pvA.addEventListener('ended', () => { stopPv(); renderLib(); }); pvA.play().catch(() => { stopPv(); say('Preview could not start. Check your connection.', true); renderLib(); }); renderLib(); };
  const stopPv = () => { if (pvA) { pvA.pause(); pvA = null; } pvI = -1; };
  UI.stopPv = stopPv;
  ACT.libUse = async (el) => { stopPv(); $('musSt').textContent = 'Loading…'; try { await U.setMusicLib(+el.dataset.k); UI.syncPanels(); } catch (e) { say('Could not load that track. Check your connection.', true); } };
  ACT.musicOff = () => { stopPv(); U.clearMusic(); UI.syncPanels(); };
  ACT.offline = async (el) => { el.disabled = true; let n = 0; try { for (const t of root.LIB) { const r = await fetch(t.file); await r.blob(); n++; el.textContent = '⇩ Saved ' + n + ' of ' + root.LIB.length; } say('Music is saved for offline use on this device.'); } catch (e) { say('Could not save all tracks. Check your connection.', true); } el.disabled = false; };
  ACT.syncCuts = () => { const b = U.musicBeatsAbs(); if (!b.length) return say('Add music first.', true); U.snap(); let a = 0; const L = U.layout(); U.P.clips.forEach((c, i) => { if (c.kind === 'image') { const nb = b.find((x) => x >= L.st[i] + .9); if (nb) c.dur = +(nb - L.st[i]).toFixed(2); } }); chg(1); say('Photo cuts snapped to the beat.'); };
  ACT.voiceDel = (el) => { U.snap(); U.P.voice.splice(+el.dataset.k, 1); chg(1); UI.syncPanels(); };
  ACT.segGo = (el) => { U.seek(U.P.caps.segs[+el.dataset.k].s + .01); };
  ACT.segDel = (el) => { U.snap(); U.P.caps.segs.splice(+el.dataset.k, 1); U.invalidateTex(); chg(1); UI.syncPanels(); };
  ACT.capStyle = (el) => { U.snap(); U.P.caps.style = el.dataset.k; U.invalidateTex(); chg(1); UI.syncPanels(); };
  ACT.capClear = () => { U.snap(); U.P.caps = null; U.P.overlays = U.P.overlays.filter((o) => o.type !== 'caps'); S.ov = null; U.changed(true); UI.syncPanels(); };
  ACT.startOver = async () => { if (!confirm('Remove everything and start a new reel? This also clears the autosaved project.')) return; await U.store.clear(); U.reset(); S.clip = -1; S.ov = null; document.body.classList.remove('edit'); UI.syncPanels(); };
  ACT.coverSet = () => { U.P.cover = +U.view.t.toFixed(2); chg(); UI.syncPanels(); coverPrev(); };
  const coverPrev = async () => { const box = $('coverBox'); if (!box || !U.total()) return; const cv = document.createElement('canvas'); cv.width = 90; cv.height = Math.round(90 * U.R.H / U.R.W); cv.getContext('2d').drawImage(U.R.canvas, 0, 0, cv.width, cv.height); box.innerHTML = ''; box.appendChild(cv); };
  UI.coverPrev = coverPrev;
  ACT.coverSave = async () => { try { const b = await U.coverBlob(U.P.cover); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'upright-cover.jpg'; a.click(); } catch (e) { say('Could not make the cover.', true); } };
  ACT.exportStop = () => { if (UI.exp) UI.exp.abort(); };
  ACT.shareVid = async () => { const r = UI.lastOut; try { await navigator.share({ files: [new File([r.blob], 'upright-reel.' + r.ext, { type: r.blob.type })], title: 'My reel' }); } catch (e) { if (e && e.name !== 'AbortError') say('Sharing was not possible. Use Download instead.', true); } };
  ACT.exportGo = async () => {
    if (UI.exp) return; if (!U.total()) return say('Add a clip first.', true); UI.stopPv(); const ctl = new AbortController(); UI.exp = ctl; setChip('loading', 'Exporting…'); $('eb').disabled = true; $('xb').disabled = false; $('out').innerHTML = ''; const t0 = performance.now();
    const st = $('st'), pg = $('pg'); st.textContent = 'Starting…';
    try {
      const r = await U.exportVideo({ signal: ctl.signal, onProgress: (p, i) => { const s = $('st'), g = $('pg'); if (!s) return; g.value = p; s.textContent = i.stage ? i.stage + '…' : i.done ? 'Finishing…' : Math.round(p * 100) + '%' + (i.eta ? ' · about ' + Math.max(1, Math.round(i.eta)) + ' s left' : '') + (i.fps ? ' · ' + i.fps.toFixed(0) + ' frames/s' : ''); } });
      const took = (performance.now() - t0) / 1000; let poster = ''; try { const b = await U.coverBlob(U.P.cover); poster = URL.createObjectURL(b); } catch (e) { }
      const file = new File([r.blob], 'upright-reel.' + r.ext, { type: r.blob.type }); const out = Object.assign(r, { url: URL.createObjectURL(r.blob), poster, took, canShare: !!(navigator.canShare && navigator.canShare({ files: [file] })) }); if (UI.lastOut) URL.revokeObjectURL(UI.lastOut.url); UI.lastOut = out;
      if ($('st')) { $('st').textContent = 'Done.'; showOut(out); }
    } catch (e) { if ($('st')) $('st').textContent = e && e.name === 'AbortError' ? 'Cancelled.' : 'Export failed: ' + ((e && e.message) || e); console.error(e); }
    UI.exp = null; setChip('ready', 'Ready on your device'); if ($('eb')) { $('eb').disabled = false; $('xb').disabled = true; }
  };
  ACT.rec = async () => {
    if (UI.recording) { UI.recStop && UI.recStop(); return; }
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser cannot record from a microphone here.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }), chunks = [], mr = new MediaRecorder(stream), start = U.view.t; UI.recording = true;
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      UI.recStop = () => { try { mr.stop(); } catch (e) { } };
      mr.onstop = async () => { UI.recording = false; UI.recStop = null; stream.getTracks().forEach((t) => t.stop()); U.pause(); const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' }); if (blob.size < 500) { UI.syncPanels(); return; } try { const m = await U.addMedia(new File([blob], 'voiceover.' + (/mp4/.test(blob.type) ? 'm4a' : 'webm'), { type: blob.type })); await U.decodeAudio(m); const dur = m.abuf ? m.abuf.duration : Math.max(.5, U.view.t - start); U.snap(); U.P.voice.push({ id: U.uid(), mid: m.id, start: +start.toFixed(2), dur: +dur.toFixed(2) }); U.changed(true); say('Voiceover added. Music lowers under it automatically.'); } catch (e) { say('Could not use that recording.', true); } UI.syncPanels(); };
      mr.start(); U.play(); UI.syncPanels(); const stopAtEnd = () => { if (!UI.recording) return; if (!U.playing) UI.recStop && UI.recStop(); else setTimeout(stopAtEnd, 300); }; setTimeout(stopAtEnd, 600);
    } catch (e) { UI.recording = false; say((e && e.name === 'NotAllowedError') ? 'Microphone access was blocked. Allow it in your browser settings.' : (e.message || 'Could not start recording.'), true); UI.syncPanels(); }
  };
  ACT.capGo = async () => {
    const P = U.P; if (UI.capBusy) return; UI.capBusy = true; setChip('loading', 'Making captions…'); const st = $('capSt'), pg = $('capPg'), stop = $('capStop'); stop.hidden = false; pg.hidden = false; pg.removeAttribute('value'); const set = (m) => { const e = $('capSt'); if (e) e.textContent = m; };
    try {
      U.pause(); set('Preparing the audio…'); const total = U.total(), OC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
      for (const c of P.clips) { const m = U.MEDIA[c.mid]; if (m && m.kind === 'video') await U.decodeAudio(m); }
      for (const v of P.voice) { const m = U.MEDIA[v.mid]; if (m) await U.decodeAudio(m); }
      U._skipMusic = true; const ctx = new OC(1, Math.max(1, Math.ceil(total * 16000)), 16000); U.scheduleAudio(ctx, ctx.destination, 0, 0, total); U._skipMusic = false; const buf = await ctx.startRendering(), audio = new Float32Array(buf.getChannelData(0)); let mx = 0; for (let i = 0; i < audio.length; i += 50) mx = Math.max(mx, Math.abs(audio[i]));
      if (mx < .005) throw new Error('No speech found: the clips have no audible sound.');
      const r = await root.UprightWhisper.transcribe(audio, { model: UI._cm || 'tiny', lang: +(UI._cl == null ? -1 : UI._cl), onStage: set, onDownload: (d) => { const e = $('capPg'); if (e) { e.max = d.total; e.value = d.loaded; } set('Downloading the speech model: ' + Math.round(d.loaded / 1048576) + ' of ' + Math.round(d.total / 1048576) + ' MB (kept after this)'); }, onProgress: (a, b) => { const e = $('capPg'); if (e) { e.max = b; e.value = a; } set('Listening… ' + Math.round(a / b * 100) + '%'); } });
      if (!r.segs.length) throw new Error('No speech was recognised.');
      U.snap(); const segs = []; const WH = root.UprightWhisper;
      r.segs.forEach((s) => { const ws = WH.words(s); if (!ws.length) return; let cur = []; const flush = () => { if (!cur.length) return; segs.push({ s: +cur[0].s.toFixed(2), e: +cur[cur.length - 1].e.toFixed(2), t: cur.map((w) => w.w).join(' '), w: cur.map((w) => ({ w: w.w, s: +w.s.toFixed(2), e: +w.e.toFixed(2) })) }); cur = []; }; ws.forEach((w, i) => { cur.push(w); if (cur.length >= 6 || (/[.!?,;:]$/.test(w.w) && cur.length >= 3)) flush(); }); flush(); });
      for (let i = 0; i < segs.length - 1; i++) if (segs[i].e > segs[i + 1].s) segs[i].e = segs[i + 1].s;
      P.caps = Object.assign({ style: 'hormozi', size: .065, color: '#ffffff', hl: '#ffe14a' }, P.caps || {}, { segs }); if (!P.overlays.some((o) => o.type === 'caps')) P.overlays.push({ id: U.uid(), type: 'caps', start: 0, end: null, x: .5, y: .72, rot: 0, alpha: 1 }); U.invalidateTex(); U.changed(true); say(segs.length + ' caption lines ready. Check the text for mistakes.');
    } catch (e) { U._skipMusic = false; if (e && e.message !== 'cancelled') say(e.message || 'Captions failed.', true); set(e && e.message === 'cancelled' ? 'Stopped.' : ''); }
    UI.capBusy = false; setChip('ready', 'Ready on your device'); UI.syncPanels();
  };
  ACT.capStop = () => { root.UprightWhisper.cancel(); };
  ACT.autoGo = async (el) => {
    const st = $('autoSt'); el.disabled = true; st.textContent = 'Working…';
    try {
      const so = UI._as || 'cur'; if (so.startsWith('mood:') || !U.P.music) { const mood = so.startsWith('mood:') ? so.slice(5) : 'Upbeat', cands = root.LIB.map((t, i) => [t, i]).filter(([t]) => t.mood === mood); const [, i] = cands[Math.floor(Math.random() * cands.length)]; st.textContent = 'Loading the song…'; await U.setMusicLib(i); }
      const r = await U.autoReel({ dur: +(UI._al || 30), pace: +(UI._ap || 2), trans: UI._at || 'mix', look: UI._ak || 'punchy', zoom: UI._az !== false, shuffle: !!UI._ash });
      S.clip = 0; U.fitTL && UI.fitTL(); say('Made a ' + r.seconds + ' s reel with ' + r.clips + ' cuts at ' + r.bpm + ' BPM.'); UI.syncPanels(); U.seek(0); U.play();
    } catch (e) { st.textContent = e.message || 'Could not make the reel.'; say(e.message || 'Could not make the reel.', true); el.disabled = false; }
  };
  /* inputs */
  const setAdj = (k, v) => each((c) => { c.adj = c.adj || {}; c.adj[k] = v; });
  const num = (v) => parseFloat(v);
  const ovset = (fn) => { const o = os(); if (!o) return; fn(o); U.invalidateTex && 0; chg(); drawSel(); };
  const vtxt = (id, v) => { const e = $('v_' + id); if (e) e.textContent = typeof v === 'number' ? +v.toFixed(2) : v; };
  const snapOnce = (() => { let last = 0; return () => { const n = performance.now(); if (n - last > 700) U.snap(); last = n; }; })();
  const IN = INP;
  IN.all = (v, el) => { S.all = el.checked; };
  IN.speed = (v) => { snapOnce(); const c = cs(); c.speed = clamp(num(v), .1, 4); c._k = null; vtxt('speed', c.speed); chg(1); };
  IN.ramp = (v) => { U.snap(); const c = cs(); c.ramp = v; c._k = null; chg(1); };
  IN.rev = (v, el) => { U.snap(); const c = cs(); c.rev = el.checked; chg(1); };
  IN.mute = (v, el) => { U.snap(); cs().mute = el.checked; chg(1); };
  IN.vol = (v) => { snapOnce(); cs().vol = num(v); vtxt('vol', num(v)); chg(); };
  IN.dur = (v) => { snapOnce(); const c = cs(); c.dur = num(v); vtxt('dur', num(v)); chg(1); };
  IN.kbOn = (v, el) => { U.snap(); cs().kb = el.checked ? .12 : 0; chg(); };
  IN.fit = (v) => { U.snap(); cs().fit = v; chg(); };
  IN.zoom = (v) => { snapOnce(); cs().zoom = num(v); vtxt('zoom', num(v)); chg(); };
  IN.tr = (v) => { U.snap(); cs().tr = v || null; chg(1); };
  IN.lookAmt = (v) => { snapOnce(); each((c) => { c.lookAmt = num(v); }); vtxt('lookAmt', num(v)); chg(); };
  ADJ.forEach(([k]) => { IN['adj_' + k] = (v) => { snapOnce(); setAdj(k, num(v)); vtxt('adj_' + k, num(v)); chg(); }; });
  EFX.forEach(([k]) => { IN['fx_' + k] = (v) => { snapOnce(); each((c) => { c.fx = c.fx || {}; if (c.fx[k]) c.fx[k] = num(v); }); vtxt('fx_' + k, num(v)); chg(); }; });
  IN.duoA = (v) => each((c) => { c.fx.duoA = v; chg(); }); IN.duoB = (v) => each((c) => { c.fx.duoB = v; chg(); });
  IN.lutAmt = (v) => { each((c) => { c.lutAmt = num(v); }); vtxt('lutAmt', num(v)); chg(); };
  IN.lutfile = async (v, el) => { const f = el.files[0]; el.value = ''; if (!f) return; try { U.snap(); const id = await U.addLut(f); each((c) => { c.lutId = id; c.lutAmt = 1; }); chg(1); UI.syncPanels(); } catch (e) { say(e.message || 'Could not read that LUT.', true); } };
  IN.beatZoom = (v) => { snapOnce(); U.P.beatZoom = num(v); vtxt('beatZoom', num(v)); chg(); };
  IN.imgfile = async (v, el) => { const f = el.files[0]; el.value = ''; if (!f) return; try { const m = await U.addMedia(f); const o = addOv({ type: 'image', mid: m.id, size: .3, y: .5 }); } catch (e) { say('Could not open that image.', true); } };
  IN.pipfile = async (v, el) => { const f = el.files[0]; el.value = ''; if (!f) return; try { const m = await U.addMedia(f); if (m.kind !== 'video') return say('Choose a video file.', true); addOv({ type: 'video', mid: m.id, size: .4, x: .75, y: .75, in: 0, vol: 0, radius: .12, key: { on: false, color: '#00ff00', tol: .12, soft: .08 }, end: +(U.view.t + Math.min(m.dur, 30)).toFixed(2) }); } catch (e) { say('Could not open that video.', true); } };
  IN.text = (v) => { snapOnce(); ovset((o) => { o.text = v; }); }; IN.font = (v) => { U.snap(); ovset((o) => { o.font = v; }); }; IN.align = (v) => { U.snap(); ovset((o) => { o.align = v; }); };
  IN.color = (v) => ovset((o) => { o.color = v; }); IN.bg = (v) => ovset((o) => { if (o.bg) o.bg = v; });
  IN.bgOn = (v, el) => { U.snap(); ovset((o) => { o.bg = el.checked ? ($('panel').querySelector('[data-in=bg]').value || '#000000') : ''; }); };
  IN.strokeOn = (v, el) => { U.snap(); ovset((o) => { o.strokeW = el.checked ? 1 : 0; }); }; IN.shadow = (v, el) => { U.snap(); ovset((o) => { o.shadow = el.checked ? 1 : 0; }); }; IN.upper = (v, el) => { U.snap(); ovset((o) => { o.upper = el.checked; }); };
  IN.size = (v) => { snapOnce(); ovset((o) => { o.size = num(v); }); vtxt('size', num(v)); }; IN.alpha = (v) => { snapOnce(); ovset((o) => { o.alpha = num(v); }); vtxt('alpha', num(v)); }; IN.rot = (v) => { snapOnce(); ovset((o) => { o.rot = num(v); }); vtxt('rot', num(v)); };
  IN.anim = (v) => { U.snap(); ovset((o) => { o.anim = v; }); };
  IN.start = (v) => { U.snap(); ovset((o) => { o.start = Math.max(0, num(v) || 0); }); chg(1); }; IN.end = (v) => { U.snap(); ovset((o) => { o.end = v === '' ? null : Math.max((o.start || 0) + .2, num(v)); }); chg(1); };
  IN.ovvol = (v) => { snapOnce(); ovset((o) => { o.vol = num(v); }); vtxt('ovvol', num(v)); }; IN.radius = (v) => { snapOnce(); ovset((o) => { o.radius = num(v); }); vtxt('radius', num(v)); };
  IN.keyOn = (v, el) => { U.snap(); ovset((o) => { o.key = o.key || { color: '#00ff00', tol: .12, soft: .08 }; o.key.on = el.checked; }); UI.syncPanels(); };
  IN.keyc = (v) => ovset((o) => { o.key.color = v; }); IN.keytol = (v) => { ovset((o) => { o.key.tol = num(v); }); vtxt('keytol', num(v)); }; IN.keysoft = (v) => { ovset((o) => { o.key.soft = num(v); }); vtxt('keysoft', num(v)); };
  IN.capLang = (v) => { UI._cl = v; }; IN.capModel = (v) => { UI._cm = v; };
  IN.capSize = (v) => { snapOnce(); U.P.caps.size = num(v); U.invalidateTex(); vtxt('capSize', num(v)); chg(); }; IN.capColor = (v) => { U.P.caps.color = v; U.invalidateTex(); chg(); }; IN.capHl = (v) => { U.P.caps.hl = v; U.invalidateTex(); chg(); };
  IN.srtfile = async (v, el) => { const f = el.files[0]; el.value = ''; if (!f) return; const segs = parseSrt(await f.text()); if (!segs.length) return say('No captions found in that file.', true); U.snap(); U.P.caps = Object.assign({ style: 'hormozi', size: .065, color: '#ffffff', hl: '#ffe14a' }, U.P.caps || {}, { segs }); if (!U.P.overlays.some((o) => o.type === 'caps')) U.P.overlays.push({ id: U.uid(), type: 'caps', start: 0, end: null, x: .5, y: .72, rot: 0, alpha: 1 }); U.invalidateTex(); U.changed(true); UI.syncPanels(); };
  function parseSrt(txt) { const out = [], tm = (s) => { const m = s.match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/); return m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+('0.' + m[4])) : 0; }; txt.replace(/\r/g, '').split(/\n\s*\n/).forEach((b) => { const ls = b.trim().split('\n'), i = ls.findIndex((l) => /-->/.test(l)); if (i < 0) return; const [a, c] = ls[i].split('-->'), t = ls.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim(); if (t) { const s = { s: +tm(a).toFixed(2), e: +tm(c).toFixed(2), t }; s.w = root.UprightWhisper.words({ text: t, start: s.s, end: s.e }).map((w) => ({ w: w.w, s: +w.s.toFixed(2), e: +w.e.toFixed(2) })); out.push(s); } }); return out; }
  IN.musicfile = async (v, el) => { const f = el.files[0]; el.value = ''; if (!f) return; $('musSt').textContent = 'Reading the song…'; try { await U.setMusicFile(f); UI.syncPanels(); } catch (e) { say('Could not read that audio file.', true); } };
  IN.clipVol = (v) => { snapOnce(); U.P.clipVol = num(v); vtxt('clipVol', num(v)); chg(); }; IN.musicVol = (v) => { snapOnce(); U.P.musicVol = num(v); vtxt('musicVol', num(v)); chg(); };
  IN.musOff = (v) => { U.snap(); U.P.music.off = Math.max(0, num(v) || 0); U._beatCache = null; chg(); }; IN.musAt = (v) => { U.snap(); U.P.music.at = Math.max(0, num(v) || 0); U._beatCache = null; chg(); };
  IN.duck = (v) => { U.snap(); U.P.duck = v; chg(); };
  IN.aSong = (v) => { UI._as = v; }; IN.aLen = (v) => { UI._al = v; }; IN.aPace = (v) => { UI._ap = v; }; IN.aTrans = (v) => { UI._at = v; }; IN.aLook = (v) => { UI._ak = v; }; IN.aZoom = (v, el) => { UI._az = el.checked; }; IN.aShuf = (v, el) => { UI._ash = el.checked; };
  IN.ar = (v) => { U.snap(); U.P.ar = v; U.fitPreview(); setAspect(); chg(1); UI.syncPanels(); }; IN.q = (v) => { U.P.q = +v; U.fitPreview(); chg(); UI.syncPanels(); }; IN.fps = (v) => { U.P.fps = +v; };
  IN.trType = (v) => { U.snap(); U.P.tr.type = v; chg(1); }; IN.trDur = (v) => { snapOnce(); U.P.tr.dur = num(v); vtxt('trDur', num(v)); chg(1); }; IN.fade = (v, el) => { U.P.fade = el.checked; chg(); };
  IN.pickaudio = () => { };
  for (const k of Object.keys(IN)) if (/^seg_/.test(k)) delete IN[k];
  const setAspect = () => { const [w, h] = U.dims(); const cw = $('cw'); cw.style.setProperty('--ar', w + '/' + h); cw.style.setProperty('--arn', w / h); };
  UI.setAspect = setAspect;
  function bindPanel() {
    const p = $('panel');
    const clk = (ev) => { const b = ev.target.closest('[data-act]'); if (b && ACT[b.dataset.act]) { ev.preventDefault(); ACT[b.dataset.act](b, ev); } };
    p.addEventListener('click', clk); $('tabs').addEventListener('click', clk);
    const onIn = (ev) => { const el = ev.target.closest('[data-in]'); if (!el) return; const k = el.dataset.in, type = el.type, live = type === 'range' || type === 'color' || type === 'text' || el.tagName === 'TEXTAREA';
      if (live !== (ev.type === 'input')) return;
      if (/^seg_/.test(k)) { const s = U.P.caps.segs[+k.slice(4)]; if (!s) return; snapOnce(); s.t = el.value; s.w = root.UprightWhisper.words({ text: s.t, start: s.s, end: s.e }).map((w) => ({ w: w.w, s: +w.s.toFixed(2), e: +w.e.toFixed(2) })); U.invalidateTex(); chg(); return; }
      const f = IN[k]; if (!f) return; UI._busy = true; try { f(el.value, el, ev); } finally { UI._busy = false; } };
    p.addEventListener('input', onIn); p.addEventListener('change', onIn);
  }
  /* ---------------- chrome ---------------- */
  UI.init = () => {
    const cv = $('cv'); U.initRenderer(cv); setAspect(); U.fitPreview(); bindStage(); bindTL(); bindPanel(); tabsBar();
    U.on('change', (d) => { if (d.structural) { if (S.clip >= U.P.clips.length) S.clip = U.P.clips.length - 1; if (S.clip < 0 && U.P.clips.length) S.clip = 0; } tlSched(); drawSel(); if (d.structural) { UI.syncPanels(); } });
    U.on('time', () => { movePH(); drawSel(); if (!U.P.clips.length) return; const i = U.clipIndexAt(U.view.t); if (i !== S.clip) { S.clip = i; if (!drag) { UI.syncPanels(); tlSched(); } } });
    U.on('frame', () => { drawSel(); });
    U.on('play', (p) => { $('pb').textContent = p ? '❚❚' : '▶'; $('pb').setAttribute('aria-label', p ? 'Pause' : 'Play'); if (p) UI.stopPv(); });
    U.on('media', () => tlSched()); U.on('thumbs', () => tlSched()); U.on('music', () => { tlSched(); if (S.tab === 'audio' && !UI._busy) UI.syncPanels(); });
    U.on('saved', () => { const e = $('saveSt'); if (e) e.textContent = 'Autosaved on this device at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.'; });
    U.on('savefail', () => { const e = $('saveSt'); if (e) e.textContent = 'Autosave is unavailable here (storage is full or blocked).'; });
    U.on('reset', () => { S.clip = -1; S.ov = null; });
    $('pb').onclick = () => U.toggle(); $('sk').oninput = (e) => U.seek(e.target.value / 100);
    $('undo').onclick = () => { U.undo(); UI.syncPanels(); }; $('redo').onclick = () => { U.redo(); UI.syncPanels(); };
    $('zin').onclick = () => UI.zoomTL(1.3); $('zout').onclick = () => UI.zoomTL(1 / 1.3); $('zfit').onclick = () => UI.fitTL();
    $('safeChk').onchange = (e) => { $('sz').style.display = e.target.checked ? 'block' : 'none'; };
    addEventListener('keydown', (e) => { if (/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')) && !(e.target.type === 'range')) return; const k = e.key.toLowerCase();
      if (e.key === ' ') { e.preventDefault(); U.toggle(); } else if (k === 'arrowleft') U.seek(U.view.t - (e.shiftKey ? 1 : 1 / 30)); else if (k === 'arrowright') U.seek(U.view.t + (e.shiftKey ? 1 : 1 / 30)); else if (k === 's' && !e.ctrlKey && !e.metaKey) ACT.split(); else if (k === 'delete' || k === 'backspace') { if (S.ov) ACT.ovDel(); else ACT.del(); } else if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? $('redo').click() : $('undo').click(); } else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); $('redo').click(); } });
    const drop = $('drop'); ['dragenter', 'dragover'].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.add('on'); })); ['dragleave', 'drop'].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.remove('on'); })); drop.addEventListener('drop', (e) => UI.addFiles(e.dataTransfer.files));
    addEventListener('dragover', (e) => e.preventDefault()); addEventListener('drop', (e) => { if (e.target.closest && e.target.closest('#drop')) return; e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) UI.addFiles(e.dataTransfer.files); });
    addEventListener('paste', (e) => { const fs = [...(e.clipboardData ? e.clipboardData.files : [])]; if (fs.length) UI.addFiles(fs); });
    addEventListener('resize', () => { tlSched(); drawSel(); });
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop.querySelector('input').click(); } });
    UI.syncPanels(); renderTL();
  };
  })(window);
