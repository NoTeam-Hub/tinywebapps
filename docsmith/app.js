/* Docsmith: PDF and image toolkit with a plain-language command bar. Everything runs in this browser tab. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const S = { tab: 'pdf', started: false, files: {}, pages: [], images: [], hist: [], fut: [], busy: false,
    o: { imgPage: 'a4', num: null, wm: null, comp: null, name: 'docsmith' },
    img: { fmt: 'jpg', w: 0, h: 0, pct: 0, kb: 0, q: 0.9, gray: false, rot: 0, flip: false } };
  let uid = 0; const nid = () => 'f' + (++uid);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtB = (n) => n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  let toastT = 0;
  function toast(m, ms) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms || 3200); }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  const isImg = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name);
  const baseName = (n) => n.replace(/\.[^.]+$/, '');

  /* ---------- pdf.js (thumbnails, compress, pdf to images). Optional: pdf-lib does the editing. ---------- */
  let pdfjs = null, pdfjsFail = false;
  async function getPdfjs() {
    if (pdfjs || pdfjsFail) return pdfjs;
    try {
      pdfjs = await import('./vendor/pdf.min.js');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.js', location.href).href;
    } catch (e) { pdfjsFail = true; console.warn('pdf.js unavailable:', e.message); }
    return pdfjs;
  }

  /* ---------- history ---------- */
  const snapshot = () => JSON.stringify({ pages: S.pages.map((p) => Object.assign({}, p, { sel: false })), o: S.o });
  function snap() { S.hist.push(snapshot()); if (S.hist.length > 60) S.hist.shift(); S.fut = []; }
  function restore(js) { const d = JSON.parse(js); S.pages = d.pages; S.o = d.o; renderAll(); }
  function undo() { if (!S.hist.length) return say('Nothing to undo.'); S.fut.push(snapshot()); restore(S.hist.pop()); say('Undone.'); }
  function redo() { if (!S.fut.length) return say('Nothing to redo.'); S.hist.push(snapshot()); restore(S.fut.pop()); say('Redone.'); }

  /* ---------- loading files ---------- */
  async function decodeImage(blob) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch (e) {
      return await new Promise((res, rej) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('decode')); im.src = u; });
    }
  }
  async function addPdf(file) {
    const bytes = await file.arrayBuffer(); let lib;
    try { lib = await PDFLib.PDFDocument.load(bytes); }
    catch (e) { toast(file.name + ': this PDF is password protected or damaged, so it can not be opened.', 5000); return 0; }
    const f = { id: nid(), name: file.name, kind: 'pdf', bytes, lib, n: lib.getPageCount(), doc: null, size: file.size };
    S.files[f.id] = f;
    const pj = await getPdfjs();
    if (pj) { try { f.doc = await pj.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise; } catch (e) { f.doc = null; } }
    for (let i = 0; i < f.n; i++) S.pages.push({ fid: f.id, idx: i, rot: 0, sel: false });
    return f.n;
  }
  async function addImgPage(file) {
    let bmp; try { bmp = await decodeImage(file); } catch (e) { toast(file.name + ': this browser can not open that image.', 4500); return 0; }
    const f = { id: nid(), name: file.name, kind: 'img', blob: file, bmp, w: bmp.width, h: bmp.height, size: file.size };
    S.files[f.id] = f; S.pages.push({ fid: f.id, idx: 0, rot: 0, sel: false }); return 1;
  }
  async function addImgItems(list) {
    let n = 0;
    for (const file of list) {
      let bmp, err = '';
      try { bmp = await decodeImage(file); } catch (e) { err = /heic|heif/i.test(file.name + file.type) ? 'HEIC photos can not be opened in this browser. Safari and iPhones can; others need a converter.' : 'This browser can not open that image.'; }
      S.images.push({ id: nid(), name: file.name, blob: file, bmp, w: bmp ? bmp.width : 0, h: bmp ? bmp.height : 0, size: file.size, err, out: null }); n++;
    }
    return n;
  }
  async function addFiles(list, after) {
    list = [...list]; if (!list.length) return;
    const pdfs = list.filter(isPdf), imgs = list.filter((f) => !isPdf(f) && isImg(f));
    if (!pdfs.length && !imgs.length) { toast('Docsmith opens PDF files and images (JPG, PNG, WebP, GIF, BMP, AVIF).'); return; }
    if (!S.started) { S.started = true; document.body.classList.add('edit'); if (!pdfs.length && !(after && after.mode === 'pdf')) setTab('img', true); }
    setBusy(true, 'Opening files…');
    let added = 0;
    for (const f of pdfs) added += await addPdf(f);
    if (imgs.length) { if (S.tab === 'img') added += await addImgItems(imgs); else for (const f of imgs) added += await addImgPage(f); }
    setBusy(false); renderAll();
    if (added && S.tab === 'img') processImages();
    if (after && after.cmd) run(after.cmd); else if (after && after.fill) { $('#cmd').value = after.fill; $('#cmd').focus(); $('#cmd').select(); say('Files added. Press Do it to run "' + after.fill + '", or type something else.'); }
  }

  /* ---------- thumbnails ---------- */
  const thumbs = new Map(); let thumbQ = Promise.resolve();
  function thumbFor(p, canvas) {
    const key = p.fid + ':' + p.idx, f = S.files[p.fid];
    const paint = (src) => { canvas.width = src.width; canvas.height = src.height; canvas.getContext('2d').drawImage(src, 0, 0); canvas.dataset.w = src.width; canvas.dataset.h = src.height; fitThumb(canvas, p.rot); };
    if (thumbs.has(key)) { paint(thumbs.get(key)); return; }
    thumbQ = thumbQ.then(async () => {
      if (thumbs.has(key)) return paint(thumbs.get(key));
      const c = document.createElement('canvas');
      if (f.kind === 'img') { const s = 220 / Math.max(f.w, f.h); c.width = Math.max(1, Math.round(f.w * s)); c.height = Math.max(1, Math.round(f.h * s)); c.getContext('2d').drawImage(f.bmp, 0, 0, c.width, c.height); }
      else if (f.doc) {
        try { const pg = await f.doc.getPage(p.idx + 1), v0 = pg.getViewport({ scale: 1 }), s = 220 / Math.max(v0.width, v0.height), v = pg.getViewport({ scale: s });
          c.width = Math.round(v.width); c.height = Math.round(v.height); await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise; }
        catch (e) { c.width = 160; c.height = 220; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 160, 220); }
      } else { c.width = 160; c.height = 220; const x = c.getContext('2d'); x.fillStyle = '#e8e6e0'; x.fillRect(0, 0, 160, 220); x.fillStyle = '#555'; x.font = '16px sans-serif'; x.textAlign = 'center'; x.fillText('Page ' + (p.idx + 1), 80, 114); }
      thumbs.set(key, c); if (canvas.isConnected) paint(c);
    });
  }
  function fitThumb(c, rot) {
    const W = 128, H = 150, w = +c.dataset.w, h = +c.dataset.h; if (!w) return;
    const odd = rot % 180 !== 0, rw = odd ? h : w, rh = odd ? w : h, s = Math.min(W / rw, H / rh);
    const dw = rw * s, dh = rh * s; c.style.width = (odd ? dh : dw) + 'px'; c.style.height = (odd ? dw : dh) + 'px'; c.style.transform = 'rotate(' + rot + 'deg)';
  }

  /* ---------- rendering ---------- */
  function setTab(t, silent) {
    S.tab = t; document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === t)));
    $('#pdfPane').hidden = t !== 'pdf'; $('#imgPane').hidden = t !== 'img';
    $('#cmd').placeholder = t === 'pdf' ? 'Type what to do: delete pages 2-4, rotate all right, add page numbers, compress to 500 KB…' : 'Type what to do: convert to png, resize to 1080 px wide, compress to 100 KB, grayscale…';
    renderChips(); if (!silent) renderAll();
  }
  function renderChips() {
    const L = S.tab === 'pdf' ? ['delete pages 2-4', 'keep pages 1-3', 'rotate all right', 'reverse', 'move page 3 to start', 'add page numbers', 'watermark CONFIDENTIAL', 'compress to 500 KB', 'split every 2 pages', 'convert pages to jpg', 'download']
      : ['convert to png', 'convert to webp', 'resize to 1080 px wide', 'resize to 50%', 'compress to 100 KB', 'grayscale', 'rotate right', 'flip', 'make pdf'];
    $('#ex').innerHTML = L.map((x) => '<button type="button" class="eg">' + esc(x) + '</button>').join('');
  }
  function renderAll() { renderPdf(); renderImgs(); }
  function renderPdf() {
    const g = $('#grid'), n = S.pages.length, nFiles = new Set(S.pages.filter((p) => !p.blank).map((p) => p.fid)).size;
    $('#pcount').textContent = n ? n + (n === 1 ? ' page' : ' pages') + ' from ' + nFiles + (nFiles === 1 ? ' file' : ' files') : '';
    $('#pdfEmpty').hidden = n > 0; $('#pdfOut').hidden = n === 0;
    g.innerHTML = S.pages.map((p, i) => '<div class="pg' + (p.sel ? ' sel' : '') + '" draggable="true" data-i="' + i + '"><div class="th">' + (p.blank ? '<div class="blank">Blank</div>' : '<canvas></canvas>') + '</div><span class="no">' + (i + 1) + '</span><div class="pb"><button type="button" data-a="l" aria-label="Move earlier">◀</button><button type="button" data-a="rot" aria-label="Rotate">↻</button><button type="button" data-a="del" aria-label="Delete page">×</button><button type="button" data-a="r" aria-label="Move later">▶</button></div></div>').join('');
    [...g.children].forEach((el, i) => { const p = S.pages[i], c = el.querySelector('canvas'); if (c) thumbFor(p, c); });
    const o = S.o; $('#oNum').checked = !!o.num; $('#oNumPos').value = o.num ? o.num.pos : 'bc'; $('#oNumFmt').value = o.num ? o.num.fmt : 'n';
    $('#oWm').value = o.wm ? o.wm.text : ''; $('#oComp').value = o.comp ? (o.comp.kb ? 'kb' : o.comp.level) : 'none'; $('#oKb').value = o.comp && o.comp.kb ? o.comp.kb : ''; $('#oKb').parentElement.hidden = !(o.comp && o.comp.kb);
    $('#oImg').value = o.imgPage; $('#oName').value = o.name;
  }
  function renderImgs() {
    const L = $('#imgList'), n = S.images.length;
    $('#icount').textContent = n ? n + (n === 1 ? ' image' : ' images') : ''; $('#imgEmpty').hidden = n > 0; $('#imgOut').hidden = n === 0;
    L.innerHTML = S.images.map((it, i) => {
      const o = it.out; const sub = it.err ? esc(it.err) : it.w + ' × ' + it.h + ' · ' + fmtB(it.size) + (o ? ' &rarr; ' + o.w + ' × ' + o.h + ' · <b>' + fmtB(o.blob.size) + '</b>' : ' · working…');
      return '<div class="ir" data-i="' + i + '"><div class="it">' + (o ? '<img alt="" src="' + o.url + '">' : '') + '</div><div class="im"><b>' + esc(it.name) + '</b><span>' + sub + '</span></div><div class="ia">' + (o ? '<button type="button" data-a="dl">Download</button>' : '') + '<button type="button" data-a="rm" aria-label="Remove">×</button></div></div>';
    }).join('');
    const s = S.img; $('#iFmt').value = s.fmt; $('#iW').value = s.w || ''; $('#iH').value = s.h || ''; $('#iPct').value = s.pct || ''; $('#iKb').value = s.kb || ''; $('#iQ').value = Math.round(s.q * 100); $('#iQo').textContent = Math.round(s.q * 100) + '%'; $('#iQ').disabled = !!s.kb || s.fmt === 'png'; $('#iGray').checked = s.gray;
  }
  function say(t, bad) { const e = $('#fb'); e.textContent = t; e.className = 'fb' + (bad ? ' bad' : ''); }
  function setBusy(b, t) { S.busy = b; $('#busy').hidden = !b; if (t) $('#busyT').textContent = t; }
  function prog(f, t) { $('#busyBar').style.width = Math.round(f * 100) + '%'; if (t) $('#busyT').textContent = t; }

  /* ---------- building the PDF ---------- */
  const A4 = [595.28, 841.89], LET = [612, 792];
  function canvasBlob(c, type, q) { return new Promise((res) => c.toBlob(res, type, q)); }
  async function imgBytes(f, rot) {
    const t = f.blob.type;
    if (rot === 0 && (t === 'image/jpeg' || t === 'image/png')) return { bytes: new Uint8Array(await f.blob.arrayBuffer()), jpg: t === 'image/jpeg' };
    const odd = rot % 180 !== 0, c = document.createElement('canvas'); c.width = odd ? f.h : f.w; c.height = odd ? f.w : f.h;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 180); x.drawImage(f.bmp, -f.w / 2, -f.h / 2);
    const jpg = t !== 'image/png' && t !== 'image/gif'; const b = await canvasBlob(c, jpg ? 'image/jpeg' : 'image/png', 0.92);
    return { bytes: new Uint8Array(await b.arrayBuffer()), jpg };
  }
  async function buildPdf(pages, onp) {
    const { PDFDocument, degrees, StandardFonts, rgb } = PDFLib, out = await PDFDocument.create(), o = S.o;
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i], f = S.files[p.fid]; if (onp) onp(i / pages.length * 0.5);
      if (p.blank) { out.addPage(A4.slice()); continue; }
      if (f.kind === 'pdf') {
        const [cp] = await out.copyPages(f.lib, [p.idx]), base = f.lib.getPage(p.idx).getRotation().angle;
        cp.setRotation(degrees(((base + p.rot) % 360 + 360) % 360)); out.addPage(cp);
      } else {
        const { bytes, jpg } = await imgBytes(f, p.rot), im = jpg ? await out.embedJpg(bytes) : await out.embedPng(bytes);
        if (o.imgPage === 'original') { const pg = out.addPage([im.width * 0.75, im.height * 0.75]); pg.drawImage(im, { x: 0, y: 0, width: im.width * 0.75, height: im.height * 0.75 }); }
        else {
          const base = o.imgPage === 'letter' ? LET : A4, land = im.width > im.height, pw = land ? base[1] : base[0], ph = land ? base[0] : base[1], m = 24;
          const s = Math.min((pw - 2 * m) / im.width, (ph - 2 * m) / im.height), w = im.width * s, h = im.height * s, pg = out.addPage([pw, ph]);
          pg.drawImage(im, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
        }
      }
      if (i % 4 === 3) await tick();
    }
    if (o.num || o.wm) {
      const font = await out.embedFont(StandardFonts.Helvetica), tot = out.getPageCount();
      out.getPages().forEach((pg, i) => {
        const sz = pg.getSize(), rot = ((pg.getRotation().angle % 360) + 360) % 360, W = sz.width, H = sz.height, vw = rot % 180 ? H : W, vh = rot % 180 ? W : H;
        const map = (vx, vy) => rot === 0 ? { x: vx, y: vy } : rot === 90 ? { x: W - vy, y: vx } : rot === 180 ? { x: W - vx, y: H - vy } : { x: vy, y: H - vx };
        if (o.num) {
          const txt = o.num.fmt === 'pageof' ? 'Page ' + (i + 1) + ' of ' + tot : o.num.fmt === 'nofm' ? (i + 1) + ' / ' + tot : String(i + 1), size = 10, tw = font.widthOfTextAtSize(txt, size), pos = o.num.pos;
          const vx = pos[1] === 'l' ? 36 : pos[1] === 'r' ? vw - 36 - tw : (vw - tw) / 2, vy = pos[0] === 't' ? vh - 30 : 24, pt = map(vx, vy);
          pg.drawText(txt, { x: pt.x, y: pt.y, size, font, color: rgb(0.25, 0.25, 0.25), rotate: degrees(rot) });
        }
        if (o.wm) {
          const size = Math.max(24, Math.min(vw, vh) / Math.max(6, o.wm.text.length * 0.55)), tw = font.widthOfTextAtSize(o.wm.text, size), a = Math.PI / 4;
          const vx = vw / 2 - (tw / 2) * Math.cos(a) + (size * 0.3) * Math.sin(a), vy = vh / 2 - (tw / 2) * Math.sin(a) - (size * 0.3) * Math.cos(a), pt = map(vx, vy);
          pg.drawText(o.wm.text, { x: pt.x, y: pt.y, size, font, color: rgb(0.5, 0.5, 0.5), opacity: o.wm.opacity, rotate: degrees(45 + rot) });
        }
      });
    }
    return await out.save();
  }
  // rasterise a built PDF into a smaller, image-only PDF
  async function compressPdf(bytes, comp, onp) {
    const pj = await getPdfjs(); if (!pj) throw new Error('Compression needs a newer browser (recent Chrome, Edge, Firefox or Safari).');
    const doc = await pj.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise, n = doc.numPages;
    const levels = { low: [[1.7, 0.82]], medium: [[1.3, 0.62]], high: [[1.0, 0.45]], extreme: [[0.8, 0.32]] };
    let tries = comp.kb ? [[1.6, 0.8], [1.6, 0.6], [1.3, 0.55], [1.2, 0.42], [1.0, 0.38], [0.85, 0.3], [0.7, 0.25], [0.55, 0.2], [0.45, 0.15], [0.35, 0.12]] : levels[comp.level] || levels.medium;
    if (n > 80) tries = tries.map((t) => [Math.min(t[0], 1.2), t[1]]);
    const target = comp.kb ? comp.kb * 1024 : 0; let best = null, rendered = new Map();
    for (let ti = 0; ti < tries.length; ti++) {
      const [sc, q] = tries[ti]; let total = 0; const parts = [];
      for (let i = 1; i <= n; i++) {
        const pg = await doc.getPage(i), v1 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: sc }), c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: x, viewport: v }).promise;
        const b = await canvasBlob(c, 'image/jpeg', q); total += b.size; parts.push({ b, w: v1.width, h: v1.height });
        if (onp) onp(0.5 + 0.5 * ((ti + (i / n)) / tries.length));
        if (target && total > target * 1.6 && ti < tries.length - 1) break;
      }
      best = parts.length === n ? parts : best;
      if (!target || total <= target * 0.97 || ti === tries.length - 1) { if (parts.length === n) best = parts; break; }
    }
    const { PDFDocument } = PDFLib, out = await PDFDocument.create();
    for (const p of best) { const im = await out.embedJpg(new Uint8Array(await p.b.arrayBuffer())), pg = out.addPage([p.w, p.h]); pg.drawImage(im, { x: 0, y: 0, width: p.w, height: p.h }); }
    return await out.save();
  }
  function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2500); }
  const fileName = () => (S.o.name || 'docsmith').replace(/[\\/:*?"<>|]+/g, '').trim() || 'docsmith';

  async function doDownload() {
    if (!S.pages.length) return say('Add a PDF or some images first.', true);
    if (S.busy) return;
    setBusy(true, 'Building your PDF…'); prog(0.02);
    try {
      const orig = S.pages.reduce((a, p) => a + (S.files[p.fid] ? (S.files[p.fid].size / (S.files[p.fid].n || 1)) : 0), 0);
      let bytes = await buildPdf(S.pages, (f) => prog(f));
      if (S.o.comp) { prog(0.5, 'Compressing…'); bytes = await compressPdf(bytes, S.o.comp, (f) => prog(f)); }
      const blob = new Blob([bytes], { type: 'application/pdf' }); saveBlob(blob, fileName() + '.pdf');
      const miss = S.o.comp && S.o.comp.kb && blob.size > S.o.comp.kb * 1024 * 1.05;
      say('Saved ' + fileName() + '.pdf · ' + S.pages.length + ' pages · ' + fmtB(blob.size) + (miss ? '. The ' + S.o.comp.kb + ' KB target could not be reached without making pages unreadable.' : orig && !S.o.comp ? ' (inputs ≈ ' + fmtB(orig) + ')' : '') + '.');
    } catch (e) { console.error(e); say('Could not build the PDF: ' + e.message, true); }
    setBusy(false);
  }
  async function doSplit(groups) {
    if (!S.pages.length) return say('Add a PDF first.', true);
    if (groups.length < 2) return say('That would give only one file. Try "split every 2 pages".', true);
    setBusy(true, 'Splitting…'); const files = {};
    try {
      for (let g = 0; g < groups.length; g++) { prog(g / groups.length); let bytes = await buildPdf(groups[g].map((i) => S.pages[i])); if (S.o.comp) bytes = await compressPdf(bytes, S.o.comp); files[fileName() + '-part' + String(g + 1).padStart(2, '0') + '.pdf'] = bytes; await tick(); }
      saveBlob(new Blob([fflate.zipSync(files, { level: 0 })], { type: 'application/zip' }), fileName() + '-split.zip'); say('Saved ' + groups.length + ' PDFs in ' + fileName() + '-split.zip.');
    } catch (e) { console.error(e); say('Could not split: ' + e.message, true); }
    setBusy(false);
  }
  async function pagesToImages(fmt) {
    if (!S.pages.length) return say('Add a PDF first.', true);
    const pj = S.pages.some((p) => S.files[p.fid] && S.files[p.fid].kind === 'pdf') ? await getPdfjs() : true;
    if (!pj) return say('Converting PDF pages needs a newer browser.', true);
    const mime = fmt === 'png' ? 'image/png' : fmt === 'webp' ? 'image/webp' : 'image/jpeg', ext = fmt === 'jpeg' ? 'jpg' : fmt;
    setBusy(true, 'Converting pages…'); const files = {};
    try {
      for (let i = 0; i < S.pages.length; i++) {
        prog(i / S.pages.length); const p = S.pages[i], f = S.files[p.fid] || {}, c = document.createElement('canvas'), x = c.getContext('2d');
        if (p.blank) { c.width = 1240; c.height = 1754; x.fillStyle = '#fff'; x.fillRect(0, 0, 1240, 1754); }
        else if (f.kind === 'img') { const odd = p.rot % 180 !== 0; c.width = odd ? f.h : f.w; c.height = odd ? f.w : f.h; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.translate(c.width / 2, c.height / 2); x.rotate(p.rot * Math.PI / 180); x.drawImage(f.bmp, -f.w / 2, -f.h / 2); }
        else { const pg = await f.doc.getPage(p.idx + 1), v = pg.getViewport({ scale: 2, rotation: (pg.rotate + p.rot) % 360 }); c.width = Math.round(v.width); c.height = Math.round(v.height); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: x, viewport: v }).promise; }
        const b = await canvasBlob(c, mime, 0.92); files[fileName() + '-page' + String(i + 1).padStart(3, '0') + '.' + ext] = new Uint8Array(await b.arrayBuffer()); await tick();
      }
      saveBlob(new Blob([fflate.zipSync(files, { level: 0 })], { type: 'application/zip' }), fileName() + '-images.zip'); say('Saved ' + S.pages.length + ' ' + ext.toUpperCase() + ' images in ' + fileName() + '-images.zip.');
    } catch (e) { console.error(e); say('Could not convert: ' + e.message, true); }
    setBusy(false);
  }

  /* ---------- images tab ---------- */
  let procTok = 0;
  async function processOne(it) {
    const s = S.img; if (!it.bmp) return;
    let w = it.w, h = it.h; const odd = s.rot % 180 !== 0, sw = odd ? it.h : it.w, sh = odd ? it.w : it.h; w = sw; h = sh;
    if (s.w && s.h) { w = s.w; h = s.h; } else if (s.w) { w = s.w; h = Math.round(sh * s.w / sw); } else if (s.h) { h = s.h; w = Math.round(sw * s.h / sh); } else if (s.pct) { w = Math.round(sw * s.pct / 100); h = Math.round(sh * s.pct / 100); }
    w = Math.max(1, Math.min(w, 12000)); h = Math.max(1, Math.min(h, 12000));
    const mime = s.fmt === 'png' ? 'image/png' : s.fmt === 'webp' ? 'image/webp' : 'image/jpeg';
    const draw = (k) => {
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k)); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
      if (mime === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
      x.save(); x.translate(c.width / 2, c.height / 2); x.rotate(s.rot * Math.PI / 180); if (s.flip) x.scale(-1, 1);
      const dw = (odd ? c.height : c.width), dh = (odd ? c.width : c.height); x.drawImage(it.bmp, -dw / 2, -dh / 2, dw, dh); x.restore();
      if (s.gray) { const d = x.getImageData(0, 0, c.width, c.height), a = d.data; for (let i = 0; i < a.length; i += 4) { const y = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]; a[i] = a[i + 1] = a[i + 2] = y; } x.putImageData(d, 0, 0); }
      return c;
    };
    let k = 1, c = draw(1), blob;
    if (!s.kb) blob = await canvasBlob(c, mime, s.q);
    else {
      const target = s.kb * 1024;
      for (let step = 0; step < 10; step++) {
        c = draw(k);
        if (mime === 'image/png') { blob = await canvasBlob(c, mime); if (blob.size <= target) break; k *= 0.85; continue; }
        let lo = 0.04, hi = 0.95, best = null;
        for (let j = 0; j < 7; j++) { const q = (lo + hi) / 2, b = await canvasBlob(c, mime, q); if (b.size <= target) { best = b; lo = q; } else hi = q; }
        if (best) { blob = best; break; } blob = await canvasBlob(c, mime, 0.04); k *= 0.85;
      }
    }
    if (blob && mime === 'image/webp' && blob.type !== 'image/webp') { it.warn = 'This browser can not save WebP, so a PNG was made instead.'; }
    if (it.out) URL.revokeObjectURL(it.out.url);
    it.out = { blob, w: c.width, h: c.height, url: URL.createObjectURL(blob), ext: blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg' };
  }
  let procTimer = 0;
  function processImages() { clearTimeout(procTimer); procTimer = setTimeout(async () => {
    const tok = ++procTok; S.images.forEach((it) => { if (!it.err) it.out = it.out; });
    for (const it of S.images) { if (tok !== procTok) return; if (it.err) continue; try { await processOne(it); } catch (e) { it.err = 'Could not convert: ' + e.message; } renderImgs(); await tick(); }
    const m = S.images.find((i) => i.warn); if (m) say(m.warn);
  }, 120); }
  function dlImg(it) { if (it.out) saveBlob(it.out.blob, baseName(it.name) + '.' + it.out.ext); }
  function dlAllImgs() {
    const ok = S.images.filter((i) => i.out); if (!ok.length) return say('Nothing to download yet.', true);
    if (ok.length === 1) return dlImg(ok[0]);
    const files = {}, used = {}; ok.forEach((i) => { let n = baseName(i.name) + '.' + i.out.ext; if (used[n]) n = baseName(i.name) + '-' + used[n]++ + '.' + i.out.ext; else used[n] = 2; files[n] = null; i._n = n; });
    Promise.all(ok.map(async (i) => { files[i._n] = new Uint8Array(await i.out.blob.arrayBuffer()); })).then(() => { saveBlob(new Blob([fflate.zipSync(files, { level: 0 })], { type: 'application/zip' }), 'docsmith-images.zip'); say('Saved ' + ok.length + ' images in docsmith-images.zip.'); });
  }
  async function imagesToPdf() {
    const ok = S.images.filter((i) => i.bmp); if (!ok.length) return say('Add some images first.', true);
    ok.forEach((it) => { const f = { id: nid(), name: it.name, kind: 'img', blob: it.blob, bmp: it.bmp, w: it.w, h: it.h, size: it.size }; S.files[f.id] = f; S.pages.push({ fid: f.id, idx: 0, rot: 0, sel: false }); });
    setTab('pdf'); say('Added ' + ok.length + ' images as pages. Type "download" or press Download PDF.');
  }

  /* ---------- the command bar ---------- */
  const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  function pageSpec(t, n) {
    // returns a sorted array of 0-based indices, or null when the text names no pages
    const set = new Set(); let found = false;
    t = t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (m) => NUMW[m]);
    if (/\ball( the)?( pages)?\b/.test(t) && !/\b(rotate|number)\b.*\ball\b.*\bpages?\b.*\bexcept\b/.test(t)) { for (let i = 0; i < n; i++) set.add(i); found = true; }
    if (/\bodd\b/.test(t)) { for (let i = 0; i < n; i += 2) set.add(i); found = true; }
    if (/\beven\b/.test(t)) { for (let i = 1; i < n; i += 2) set.add(i); found = true; }
    if (/\bselected\b/.test(t)) { S.pages.forEach((p, i) => { if (p.sel) set.add(i); }); found = true; }
    let m; const rf = /\bfirst (\d+)\b/g; while ((m = rf.exec(t))) { for (let i = 0; i < Math.min(n, +m[1]); i++) set.add(i); found = true; }
    const rl = /\blast (\d+)\b/g; while ((m = rl.exec(t))) { for (let i = Math.max(0, n - +m[1]); i < n; i++) set.add(i); found = true; }
    if (/\b(first|1st) page\b|\bpage (1|one)\b(?!\d)/.test(t) && !/\bfirst \d/.test(t)) { /* handled by numeric scan below */ }
    if (/\bfirst page\b/.test(t) && !/\bfirst \d/.test(t)) { set.add(0); found = true; }
    if (/\blast page\b/.test(t)) { set.add(n - 1); found = true; }
    const t2 = t.replace(/\b(first|last) \d+\b/g, ' ').replace(/\b\d+ ?(kb|mb|px|%|dpi|x \d+)\b/g, ' ').replace(/\bevery \d+\b/g, ' ').replace(/\bto (start|end|position|page) ?\d*/g, ' ');
    const rr = /(\d+)\s*(?:-|–|to|through|thru)\s*(\d+)/g; let t3 = t2;
    while ((m = rr.exec(t2))) { let a = +m[1], b = +m[2]; if (a > b) [a, b] = [b, a]; for (let i = a; i <= b; i++) if (i >= 1 && i <= n) set.add(i - 1); found = true; }
    t3 = t2.replace(rr, ' ');
    if (/\bpages?\b|\bpgs?\b|\bp\./.test(t3) || found) { const rn = /\b(\d+)\b/g; while ((m = rn.exec(t3))) { const v = +m[1]; if (v >= 1 && v <= n) { set.add(v - 1); found = true; } else if (v > n && /\bpages?\b/.test(t3)) { throw new Error('This document has only ' + n + ' pages, so page ' + v + ' does not exist.'); } } }
    return found ? [...set].sort((a, b) => a - b) : null;
  }
  const rangesText = (a) => { const o = []; let s = a[0], p = a[0]; for (let i = 1; i <= a.length; i++) { if (a[i] === p + 1) { p = a[i]; continue; } o.push(s === p ? '' + (s + 1) : (s + 1) + '–' + (p + 1)); s = a[i]; p = a[i]; } return o.join(', '); };

  async function run(raw) {
    const cmd = String(raw || '').trim(); if (!cmd) return;
    $('#cmd').value = '';
    try { S.tab === 'pdf' ? await runPdf(cmd) : await runImg(cmd); } catch (e) { say(e.message, true); }
  }
  async function runPdf(cmd) {
    const t = ' ' + cmd.toLowerCase().replace(/[.!?,;]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ') + ' ', n = S.pages.length;
    if (/^ (undo|back) $/.test(t)) return undo();
    if (/^ redo $/.test(t)) return redo();
    if (/^ (help|\?) $/.test(t)) return say('Try: delete pages 2-4 · keep pages 1-3 · rotate all right · rotate page 2 left · reverse · move page 3 to start · duplicate page 1 · add blank page after 2 · add page numbers · watermark DRAFT · compress to 500 KB · split every 2 pages · convert pages to png · download.');
    if (/^ (download|save|export|done|finish|make pdf|save pdf|download pdf|merge|combine|merge( all)?( the)?( files| pdfs)?|join) $/.test(t)) return doDownload();
    if (!n && !/\b(compress|page numbers|watermark|a4|letter|name)\b/.test(t)) return say('Add a PDF or some images first.', true);
    // output settings (do not change the pages)
    let m;
    if (/\b(no|remove|without|stop|disable|turn off|off)\b.*\bpage numbers?\b|\bpage numbers?\b.*\b(off|remove)\b/.test(t)) { snap(); S.o.num = null; renderPdf(); return say('Page numbers off.'); }
    if (/\bpage numbers?\b|\bnumber (the |my )?pages\b|\bpaginate\b/.test(t)) {
      snap(); const pos = (/\btop\b/.test(t) ? 't' : 'b') + (/\bleft\b/.test(t) ? 'l' : /\bright\b/.test(t) ? 'r' : 'c'), fmt = /\bpage x of y|page \d+ of|of y|x of y|page n of\b/.test(t) ? 'pageof' : /\bx ?\/ ?y|1 ?\/ ?n\b/.test(t) ? 'nofm' : 'n';
      S.o.num = { pos, fmt }; renderPdf(); return say('Page numbers on: ' + (pos[0] === 't' ? 'top ' : 'bottom ') + ({ l: 'left', c: 'centre', r: 'right' }[pos[1]]) + '. They appear in the downloaded PDF.');
    }
    if (/\b(remove|delete|clear|no|without)\b.*\bwatermark\b/.test(t)) { snap(); S.o.wm = null; renderPdf(); return say('Watermark removed.'); }
    if ((m = /\bwatermark\b\s*(?:with|saying|says|text|as|:)?\s*["“']?(.+?)["”']?\s*$/i.exec(cmd.trim().replace(/[.!]+$/, '')))) {
      let txt = m[1].replace(/^(with|saying|says|text|as)\s+/i, '').replace(/\s+(?:at|with)?\s*(?:opacity\s*)?\d+\s*%(?:\s*opacity)?\s*$/i, '').trim(); const op = /(\d+)\s*%/.exec(cmd); if (!txt) return say('Tell me the text, for example: watermark CONFIDENTIAL.', true);
      snap(); S.o.wm = { text: txt.slice(0, 40), opacity: op ? Math.min(1, Math.max(0.05, +op[1] / 100)) : 0.25 }; renderPdf(); return say('Watermark "' + S.o.wm.text + '" on. It appears in the downloaded PDF (Latin letters only).');
    }
    if (/\b(compress|compression|shrink|reduce (the )?size|make (it |the file )?smaller|smaller file|optimi[sz]e)\b/.test(t)) {
      if (/\b(no|none|without|off|undo|remove|stop)\b.*\bcompress|\bcompress(ion)?\b.*\b(none|off)\b/.test(t)) { snap(); S.o.comp = null; renderPdf(); return say('Compression off.'); }
      snap(); const kb = /(\d+(?:\.\d+)?)\s*(kb|mb|k|m)\b/.exec(t);
      if (kb) { const v = Math.round(+kb[1] * (kb[2][0] === 'm' ? 1024 : 1)); S.o.comp = { kb: v }; renderPdf(); return say('Will compress to about ' + v + ' KB. Pages become images, so text can no longer be selected. Press Download PDF.'); }
      const level = /\b(extreme|maximum|max|smallest|tiny)\b/.test(t) ? 'extreme' : /\b(high|strong|heavy|more)\b/.test(t) ? 'high' : /\b(low|light|gentle|little|best quality)\b/.test(t) ? 'low' : 'medium';
      S.o.comp = { level }; renderPdf(); return say('Compression: ' + level + '. Pages become images, so text can no longer be selected. Press Download PDF.');
    }
    if ((m = /\b(?:image|photo|picture)s?\b.*\b(a4|letter|original|full size|actual size)\b|\b(?:fit|use|set|make)\b.*\b(a4|letter)\b/.exec(t))) { snap(); const v = m[1] || m[2]; S.o.imgPage = v === 'letter' ? 'letter' : v === 'a4' ? 'a4' : 'original'; renderPdf(); return say('Images will use ' + (S.o.imgPage === 'original' ? 'their original size' : S.o.imgPage.toUpperCase() + ' pages') + '.'); }
    if ((m = /\b(?:rename|filename|file name|name it|call it|save as|name)\b\s*(?:to|as|:)?\s*["“']?([\w .\-()]+?)["”']?\s*$/i.exec(cmd.trim()))) { snap(); S.o.name = m[1].replace(/\.pdf$/i, '').trim(); renderPdf(); return say('File name: ' + S.o.name + '.pdf'); }
    if (/\b(clear|reset|start over|remove everything|empty)\b/.test(t) && !/\bpage/.test(t)) { snap(); S.pages = []; S.o = { imgPage: 'a4', num: null, wm: null, comp: null, name: 'docsmith' }; renderAll(); return say('Cleared.'); }
    if (/\b(deselect|unselect|clear selection)\b/.test(t)) { S.pages.forEach((p) => { p.sel = false; }); renderPdf(); return say('Selection cleared.'); }
    if (/\bselect\b/.test(t)) { const a = pageSpec(t.replace(/\bselect\b/, ''), n); if (!a) return say('Which pages? For example: select pages 2-4.', true); S.pages.forEach((p, i) => { p.sel = a.includes(i); }); renderPdf(); return say('Selected pages ' + rangesText(a) + '.'); }
    // split
    if (/\bsplit\b|\bseparate\b|\bbreak (it )?(up|apart)\b|\bone (file|pdf) per page\b|\beach page (as|into) (a )?(separate )?(file|pdf)/.test(t)) {
      let groups = [];
      if ((m = /\bevery (\d+)\b/.exec(t)) || (m = /\b(\d+) pages? (each|per|at a time)\b/.exec(t))) { const k = Math.max(1, +m[1]); for (let i = 0; i < n; i += k) groups.push(range(i, Math.min(n, i + k))); }
      else if (/\b(single|individual|each|every|one) pages?\b|\binto pages\b|\bone per page\b|\bpage by page\b/.test(t)) groups = S.pages.map((_, i) => [i]);
      else if ((m = /\b(?:at|after)\s+(?:page\s+)?(\d+)\b/.exec(t))) { const k = +m[1]; if (k < 1 || k >= n) return say('The document has ' + n + ' pages, so split at a page from 1 to ' + (n - 1) + '.', true); groups = [range(0, k), range(k, n)]; }
      else if ((m = /\binto (\d+)\b/.exec(t))) { const parts = Math.max(1, +m[1]), per = Math.ceil(n / parts); for (let i = 0; i < n; i += per) groups.push(range(i, Math.min(n, i + per))); }
      else if (/\d\s*[-–]\s*\d/.test(t)) { const rg = t.replace(/[^\d,\- –and]/g, ' ').split(/\s*(?:,|and)\s*|\s{2,}/).map((s) => s.trim()).filter(Boolean); rg.forEach((s) => { const a = pageSpec('pages ' + s, n); if (a && a.length) groups.push(a); }); }
      if (!groups.length) return say('How should I split it? For example: split every 2 pages · split into single pages · split at page 5 · split into 3 files.', true);
      return doSplit(groups);
    }
    if (/\b(to|into|as)\b.*\b(jpe?g|png|webp|images?|pictures?|photos?)\b|\b(jpe?g|png|webp)s?\b.*\b(pages?|pdf)\b|\bconvert\b.*\bimages?\b/.test(t) && !/\b(add|insert)\b.*\bimage/.test(t)) {
      return pagesToImages(/\bpng\b/.test(t) ? 'png' : /\bwebp\b/.test(t) ? 'webp' : 'jpg');
    }
    if (/\b(reverse|flip the order|backwards|last to first)\b/.test(t)) { snap(); S.pages.reverse(); renderPdf(); return say('Reversed the page order.'); }
    if ((m = /\bmove\b\s*(?:page\s*)?(\d+|first|last)\b.*\bto\b\s*(?:the\s*)?(start|beginning|front|top|end|back|last|(?:page\s*|position\s*)?(\d+))/.exec(t)) || (m = /\bmove\b\s*(?:page\s*)?(\d+|first|last)\b.*\b(after|before)\b\s*(?:page\s*)?(\d+)/.exec(t))) {
      const from = m[1] === 'first' ? 0 : m[1] === 'last' ? n - 1 : +m[1] - 1; if (!(from >= 0 && from < n)) return say('Page ' + m[1] + ' does not exist (1–' + n + ').', true);
      let to; if (m[2] === 'after' || m[2] === 'before') { const r = +m[3] - 1; if (!(r >= 0 && r < n)) return say('Page ' + m[3] + ' does not exist (1–' + n + ').', true); to = m[2] === 'after' ? r + 1 : r; if (from < to) to--; }
      else if (/^(start|beginning|front|top)$/.test(m[2])) to = 0; else if (/^(end|back|last)$/.test(m[2])) to = n - 1; else { to = +m[3] - 1; if (!(to >= 0 && to < n)) return say('Position ' + m[3] + ' is outside 1–' + n + '.', true); }
      snap(); const [p] = S.pages.splice(from, 1); S.pages.splice(to, 0, p); renderPdf(); return say('Moved page ' + (from + 1) + ' to position ' + (to + 1) + '.');
    }
    if (/\b(duplicate|copy|repeat)\b/.test(t)) { const a = pageSpec(t, n); if (!a) return say('Which page? For example: duplicate page 2.', true); if (!a.length) return say('Nothing is selected. Tap pages to select them first.', true); snap(); [...a].reverse().forEach((i) => S.pages.splice(i + 1, 0, Object.assign({}, S.pages[i], { sel: false }))); renderPdf(); return say('Duplicated page' + (a.length > 1 ? 's ' : ' ') + rangesText(a) + '.'); }
    if (/\b(blank|empty)\b.*\bpage\b|\b(add|insert)\b.*\bblank\b/.test(t)) {
      snap(); const a = /\b(after|behind)\b\s*(?:page\s*)?(\d+)/.exec(t), b = /\bbefore\b\s*(?:page\s*)?(\d+)/.exec(t); let at = n;
      if (a) at = Math.min(n, +a[2]); else if (b) at = Math.max(0, +b[1] - 1); else if (/\b(start|beginning|front)\b/.test(t)) at = 0;
      S.pages.splice(at, 0, { fid: null, blank: true, idx: 0, rot: 0, sel: false }); renderPdf(); return say('Added a blank page at position ' + (at + 1) + '.');
    }
    if (/\b(rotate|turn|spin|flip|upside)\b/.test(t)) {
      const deg = /\b(180|upside)\b/.test(t) ? 180 : /\b(left|counter|anti|270)\b/.test(t) ? 270 : 90;
      let a = pageSpec(t.replace(/\b(90|180|270|360)\b\s*(degrees?|deg|°)?/g, ' '), n); if (a && !a.length) return say('Nothing is selected. Tap pages to select them first.', true); if (!a) a = S.pages.some((p) => p.sel) ? S.pages.map((p, i) => (p.sel ? i : -1)).filter((i) => i >= 0) : S.pages.map((_, i) => i);
      snap(); a.forEach((i) => { S.pages[i].rot = (S.pages[i].rot + deg) % 360; }); renderPdf(); return say('Rotated ' + (a.length === n ? 'all pages' : 'page' + (a.length > 1 ? 's ' : ' ') + rangesText(a)) + ' ' + (deg === 180 ? '180°' : deg === 90 ? 'right' : 'left') + '.');
    }
    if (/\b(delete|remove|drop|discard|cut|erase|get rid of|trash)\b/.test(t)) {
      const a = pageSpec(t, n); if (!a) return say('Which pages? For example: delete pages 2-4.', true); if (!a.length) return say('Nothing is selected. Tap pages to select them first.', true); if (a.length >= n) return say('That would delete every page. Use "clear" to start over.', true);
      snap(); const dead = new Set(a); S.pages = S.pages.filter((_, i) => !dead.has(i)); renderPdf(); return say('Deleted page' + (a.length > 1 ? 's ' : ' ') + rangesText(a) + '. ' + S.pages.length + ' left.');
    }
    if (/\b(keep|extract|only|just|retain|take|pull out|save only)\b/.test(t)) {
      const a = pageSpec(t, n); if (!a) return say('Which pages? For example: keep pages 1-3.', true); if (!a.length) return say('Nothing is selected. Tap pages to select them first.', true);
      snap(); S.pages = a.map((i) => S.pages[i]); renderPdf(); return say('Kept page' + (a.length > 1 ? 's ' : ' ') + rangesText(a) + '. ' + S.pages.length + ' left.');
    }
    say('I did not understand "' + cmd + '". Type "help" for examples, or tap one of the suggestions below.', true);
  }
  const range = (a, b) => { const r = []; for (let i = a; i < b; i++) r.push(i); return r; };

  async function runImg(cmd) {
    const t = ' ' + cmd.toLowerCase().replace(/[.!?,;]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ') + ' '; let m, changed = false; const s = S.img;
    if (/^ (help|\?) $/.test(t)) return say('Try: convert to png · convert to webp · resize to 1080 px wide · resize to 50% · resize to 800x600 · compress to 100 KB · quality 70% · grayscale · rotate right · flip · make pdf · download.');
    if (/^ (download|save|export|done|get them|download all|zip) $/.test(t)) return dlAllImgs();
    if (/\b(make|create|convert|turn|put)\b.*\bpdf\b|\bto pdf\b|\bas pdf\b/.test(t)) return imagesToPdf();
    if (/^ (reset|clear settings|default|original) $/.test(t)) { Object.assign(S.img, { fmt: 'jpg', w: 0, h: 0, pct: 0, kb: 0, q: 0.9, gray: false, rot: 0, flip: false }); renderImgs(); processImages(); return say('Settings reset.'); }
    if (/^ (clear|remove all|empty|start over) $/.test(t)) { S.images.forEach((i) => i.out && URL.revokeObjectURL(i.out.url)); S.images = []; renderImgs(); return say('Cleared.'); }
    if ((m = /\b(jpe?g|png|webp)\b/.exec(t)) && /\b(to|as|into|convert|make|save|format|in)\b/.test(t)) { s.fmt = m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg'; changed = true; }
    if ((m = /(\d{2,5})\s*(?:x|×|by)\s*(\d{2,5})/.exec(t))) { s.w = +m[1]; s.h = +m[2]; s.pct = 0; changed = true; }
    else if ((m = /(\d{2,5})\s*(?:px|pixels?)?\s*(wide|width|across)|\bwidth\s*(?:of|to|=|:)?\s*(\d{2,5})/.exec(t))) { s.w = +(m[1] || m[3]); s.h = 0; s.pct = 0; changed = true; }
    else if ((m = /(\d{2,5})\s*(?:px|pixels?)?\s*(tall|high|height)|\bheight\s*(?:of|to|=|:)?\s*(\d{2,5})/.exec(t))) { s.h = +(m[1] || m[3]); s.w = 0; s.pct = 0; changed = true; }
    else if ((m = /(\d{1,3})\s*%/.exec(t)) && !/quality/.test(t)) { s.pct = Math.min(400, Math.max(1, +m[1])); s.w = s.h = 0; changed = true; }
    else if (/\bhalf\b/.test(t)) { s.pct = 50; s.w = s.h = 0; changed = true; }
    else if (/\b(resize|scale)\b.*?(\d{2,5})\b/.test(t) && (m = /\b(\d{2,5})\b/.exec(t)) && !/\b(kb|mb)\b/.test(t)) { s.w = +m[1]; s.h = 0; s.pct = 0; changed = true; }
    if ((m = /(\d+(?:\.\d+)?)\s*(kb|mb|k|m)\b/.exec(t))) { s.kb = Math.round(+m[1] * (m[2][0] === 'm' ? 1024 : 1)); changed = true; }
    else if (/\b(no|without)\b.*\b(size )?limit\b/.test(t)) { s.kb = 0; changed = true; }
    if ((m = /\bquality\s*(?:of|to|=|:)?\s*(\d{1,3})/.exec(t))) { s.q = Math.min(1, Math.max(0.05, +m[1] / 100)); s.kb = 0; changed = true; }
    else if (/\b(compress|smaller|shrink|reduce)\b/.test(t) && !s.kb) { s.q = /\b(high|more|strong|heavy)\b/.test(t) ? 0.5 : /\b(light|little)\b/.test(t) ? 0.8 : 0.65; changed = true; }
    if (/\b(grayscale|greyscale|black and white|black & white|b&w|monochrome)\b/.test(t)) { s.gray = !/\b(no|remove|off|color|colour)\b/.test(t); changed = true; }
    if (/\b(rotate|turn)\b/.test(t)) { s.rot = (s.rot + (/\b180\b/.test(t) ? 180 : /\b(left|counter|anti|270)\b/.test(t) ? 270 : 90)) % 360; changed = true; }
    if (/\b(flip|mirror)\b/.test(t)) { s.flip = !s.flip; changed = true; }
    if (!changed) return say('I did not understand "' + cmd + '". Type "help" for examples, or tap one of the suggestions below.', true);
    if (!S.images.length) { renderImgs(); return say('Settings noted. Add some images and they will be converted.'); }
    renderImgs(); processImages();
    const parts = [s.fmt.toUpperCase()]; if (s.w && s.h) parts.push(s.w + '×' + s.h); else if (s.w) parts.push(s.w + ' px wide'); else if (s.h) parts.push(s.h + ' px tall'); else if (s.pct) parts.push(s.pct + '%'); if (s.kb) parts.push('under ' + s.kb + ' KB'); else if (s.fmt !== 'png') parts.push('quality ' + Math.round(s.q * 100) + '%'); if (s.gray) parts.push('grayscale'); if (s.rot) parts.push('rotated ' + s.rot + '°'); if (s.flip) parts.push('flipped');
    say('Applied: ' + parts.join(' · ') + '.');
  }

  /* ---------- wiring ---------- */
  function wire() {
    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTab(b.dataset.t); });
    const form = $('#cmdForm'); form.addEventListener('submit', (e) => { e.preventDefault(); run($('#cmd').value); });
    $('#ex').addEventListener('click', (e) => { const b = e.target.closest('.eg'); if (b) run(b.textContent); });
    // file inputs
    ['#f1', '#f2', '#f3'].forEach((id) => $(id).addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; }));
    const d = $('#drop'); ['dragenter', 'dragover'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.add('on'); }));
    ['dragleave', 'drop'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.remove('on'); }));
    d.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
    document.addEventListener('dragover', (e) => { if (S.started) e.preventDefault(); });
    $('#app').addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
    document.addEventListener('paste', (e) => { const fs = [...(e.clipboardData ? e.clipboardData.files : [])]; if (fs.length) addFiles(fs); });
    $('#tools').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const T = TOOLS[+b.dataset.i], inp = $('#f4'); inp.accept = T.accept; inp.onchange = (ev) => { const fs = [...ev.target.files]; ev.target.value = ''; inp.onchange = null; if (fs.length) addFiles(fs, T.after); }; inp.click(); });
    // pdf grid
    const g = $('#grid');
    g.addEventListener('click', (e) => {
      const el = e.target.closest('.pg'); if (!el) return; const i = +el.dataset.i, b = e.target.closest('button');
      if (!b) { S.pages[i].sel = !S.pages[i].sel; el.classList.toggle('sel', S.pages[i].sel); return; }
      const a = b.dataset.a; snap();
      if (a === 'rot') S.pages[i].rot = (S.pages[i].rot + 90) % 360;
      else if (a === 'del') { if (S.pages.length === 1) { S.hist.pop(); return say('That is the last page. Use Clear to start over.', true); } S.pages.splice(i, 1); }
      else if (a === 'l' && i > 0) { [S.pages[i - 1], S.pages[i]] = [S.pages[i], S.pages[i - 1]]; }
      else if (a === 'r' && i < S.pages.length - 1) { [S.pages[i + 1], S.pages[i]] = [S.pages[i], S.pages[i + 1]]; }
      renderPdf();
    });
    let drag = -1;
    g.addEventListener('dragstart', (e) => { const el = e.target.closest('.pg'); if (!el) return; drag = +el.dataset.i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'p'); } catch (x) { /* */ } });
    g.addEventListener('dragover', (e) => { if (drag >= 0) { e.preventDefault(); e.stopPropagation(); } });
    g.addEventListener('drop', (e) => { if (drag < 0) return; e.preventDefault(); e.stopPropagation(); const el = e.target.closest('.pg'); if (!el) { drag = -1; return; } const to = +el.dataset.i; if (to !== drag) { snap(); const [p] = S.pages.splice(drag, 1); S.pages.splice(to, 0, p); renderPdf(); } drag = -1; });
    g.addEventListener('dragend', () => { drag = -1; });
    $('#bUndo').onclick = undo; $('#bRedo').onclick = redo; $('#bAll').onclick = () => { const all = S.pages.some((p) => !p.sel); S.pages.forEach((p) => { p.sel = all; }); renderPdf(); };
    $('#bDelSel').onclick = () => run('delete selected'); $('#bRotSel').onclick = () => run('rotate selected right');
    $('#bClear').onclick = () => { snap(); S.pages = []; renderAll(); say('Cleared.'); };
    $('#bDl').onclick = doDownload; $('#bToImg').onclick = () => run('convert pages to jpg');
    // options
    $('#oNum').onchange = (e) => { snap(); S.o.num = e.target.checked ? { pos: $('#oNumPos').value, fmt: $('#oNumFmt').value } : null; };
    ['#oNumPos', '#oNumFmt'].forEach((id) => $(id).onchange = () => { if (S.o.num) S.o.num = { pos: $('#oNumPos').value, fmt: $('#oNumFmt').value }; });
    $('#oWm').oninput = (e) => { const v = e.target.value.trim(); S.o.wm = v ? { text: v.slice(0, 40), opacity: S.o.wm ? S.o.wm.opacity : 0.25 } : null; };
    $('#oComp').onchange = (e) => { const v = e.target.value; snap(); S.o.comp = v === 'none' ? null : v === 'kb' ? { kb: +$('#oKb').value || 500 } : { level: v }; $('#oKb').parentElement.hidden = v !== 'kb'; if (v === 'kb' && !$('#oKb').value) $('#oKb').value = 500; };
    $('#oKb').oninput = (e) => { if (S.o.comp && S.o.comp.kb !== undefined) S.o.comp = { kb: Math.max(20, +e.target.value || 500) }; };
    $('#oImg').onchange = (e) => { S.o.imgPage = e.target.value; };
    $('#oName').oninput = (e) => { S.o.name = e.target.value; };
    // images
    const si = S.img, ch = (fn) => (e) => { fn(e); renderImgs(); processImages(); };
    $('#iFmt').onchange = ch((e) => { si.fmt = e.target.value; });
    $('#iW').oninput = ch((e) => { si.w = +e.target.value || 0; si.pct = 0; }); $('#iH').oninput = ch((e) => { si.h = +e.target.value || 0; si.pct = 0; });
    $('#iPct').oninput = ch((e) => { si.pct = +e.target.value || 0; if (si.pct) si.w = si.h = 0; });
    $('#iKb').oninput = ch((e) => { si.kb = +e.target.value || 0; });
    $('#iQ').oninput = (e) => { si.q = +e.target.value / 100; $('#iQo').textContent = e.target.value + '%'; processImages(); };
    $('#iGray').onchange = ch((e) => { si.gray = e.target.checked; });
    $('#iRot').onclick = ch(() => { si.rot = (si.rot + 90) % 360; }); $('#iFlip').onclick = ch(() => { si.flip = !si.flip; });
    $('#iAll').onclick = dlAllImgs; $('#iPdf').onclick = imagesToPdf; $('#iClear').onclick = () => { S.images.forEach((i) => i.out && URL.revokeObjectURL(i.out.url)); S.images = []; renderImgs(); };
    $('#imgList').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const i = +b.closest('.ir').dataset.i; if (b.dataset.a === 'dl') dlImg(S.images[i]); else if (b.dataset.a === 'rm') { const [it] = S.images.splice(i, 1); if (it.out) URL.revokeObjectURL(it.out.url); renderImgs(); } });
    document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'z' && S.started && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); e.shiftKey ? redo() : undo(); } });
    $('#shareYr') && ($('#shareYr').textContent = new Date().getFullYear());
  }
  const TOOLS = [
    { t: 'Merge PDFs', d: 'Combine several PDFs into one', accept: 'application/pdf,.pdf', after: { fill: 'download' } },
    { t: 'Compress PDF', d: 'Make a PDF smaller, or hit a size', accept: 'application/pdf,.pdf', after: { fill: 'compress to 500 KB' } },
    { t: 'Split PDF', d: 'Every page, every N pages, or at a page', accept: 'application/pdf,.pdf', after: { fill: 'split every 1 page' } },
    { t: 'Delete or keep pages', d: 'Pick pages by number or range', accept: 'application/pdf,.pdf', after: { fill: 'delete pages 2-3' } },
    { t: 'Rotate and reorder', d: 'Rotate, drag, move or reverse pages', accept: 'application/pdf,.pdf', after: { fill: 'rotate all right' } },
    { t: 'Images to PDF', d: 'JPG, PNG and more into one PDF', accept: 'image/*', after: { mode: 'pdf', fill: 'download' } },
    { t: 'PDF to images', d: 'Every page as JPG, PNG or WebP', accept: 'application/pdf,.pdf', after: { fill: 'convert pages to png' } },
    { t: 'Convert images', d: 'JPG, PNG and WebP in a batch', accept: 'image/*', after: { fill: 'convert to png' } },
    { t: 'Resize or compress images', d: 'Set pixels, percent or an exact KB limit', accept: 'image/*', after: { fill: 'compress to 100 KB' } },
    { t: 'Page numbers', d: 'Number every page, any corner', accept: 'application/pdf,.pdf', after: { fill: 'add page numbers' } },
    { t: 'Watermark', d: 'Stamp text across every page', accept: 'application/pdf,.pdf', after: { fill: 'watermark CONFIDENTIAL' } }
  ];
  function init() {
    $('#tools').innerHTML = TOOLS.map((t, i) => '<button type="button" data-i="' + i + '"><b>' + esc(t.t) + '</b><span>' + esc(t.d) + '</span></button>').join('');
    wire(); renderChips(); renderAll();
    window.Docsmith = { S, run, addFiles, buildPdf, setTab };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
