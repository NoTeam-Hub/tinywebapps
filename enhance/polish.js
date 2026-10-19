/* Polish: analysis, automatic corrections and filters. Pure functions on RGBA pixels; no network. */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  /* ---------- analysis ---------- */
  // a: ImageData (whole photo, at most 512 px); crop: ImageData of a native-resolution centre crop (for noise)
  function analyze(a, crop) {
    const d = a.data, n = a.width * a.height, hist = new Uint32Array(256);
    let sum = 0, sum2 = 0, sat = 0, wr = 0, wg = 0, wb = 0, wn = 0;
    const Y = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2], y = lum(r, g, b);
      Y[i] = y; hist[(y + 0.5) | 0]++; sum += y; sum2 += y * y;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0;
      sat += s;
      if (s < 0.22 && y > 40 && y < 215) { wr += r; wg += g; wb += b; wn++; }
    }
    const mean = sum / n / 255, std = Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2)) / 255;
    const pct = (q) => { let c = 0; const t = n * q; for (let i = 0; i < 256; i++) { c += hist[i]; if (c >= t) return i / 255; } return 1; };
    let dark = 0; for (let i = 0; i < 38; i++) dark += hist[i]; dark /= n;
    // colour cast from near-neutral pixels only (a teal cup is not a cast)
    let cast = null;
    if (wn > n * 0.03) {
      const r = wr / wn, g = wg / wn, b = wb / wn, m = (r + g + b) / 3;
      const gains = [m / r, m / g, m / b];
      if (Math.max(...gains.map((x) => Math.abs(x - 1))) > 0.035) cast = gains.map((x) => clamp(1 + (x - 1) * 0.65, 0.88, 1.12));
    }
    // sharpness: variance of the Laplacian
    const w = a.width, h = a.height; let lv = 0, lc = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, l = 4 * Y[i] - Y[i - 1] - Y[i + 1] - Y[i - w] - Y[i + w]; lv += l * l; lc++;
    }
    const sharp = lc ? lv / lc : 0;
    // noise: Immerkaer's estimator on the native crop
    let noise = 0;
    { const c = crop.data, cw = crop.width, ch = crop.height; const L = new Float32Array(cw * ch);
      for (let i = 0, p = 0; i < L.length; i++, p += 4) L[i] = lum(c[p], c[p + 1], c[p + 2]);
      if (cw > 8 && ch > 8) { let s = 0;
        for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
          const i = y * cw + x;
          s += Math.abs(L[i - cw - 1] - 2 * L[i - cw] + L[i - cw + 1] - 2 * L[i - 1] + 4 * L[i] - 2 * L[i + 1] + L[i + cw - 1] - 2 * L[i + cw] + L[i + cw + 1]);
        }
        noise = Math.sqrt(Math.PI / 2) * s / (6 * (cw - 2) * (ch - 2)); } }
    return { mean, std, pLo: pct(0.005), pHi: pct(0.995), dark, satMean: sat / n, cast, sharp, noise };
  }

  /* ---------- plan: decide what this photo needs ---------- */
  function makePlan(an, W, H, ai) {
    const p = { ai: !!ai, scale: 1, items: [] }, long = Math.max(W, H);
    if (p.ai) {
      p.scale = clamp(Math.round(2400 / long), 2, 4);
      while (long * p.scale > 4096 && p.scale > 2) p.scale--;
      p.items.push({ k: 'ai', t: 'Rebuilt detail with AI', d: p.scale + '× larger, ' + W * p.scale + ' × ' + H * p.scale + ' px' });
      if (an.noise > 3.5) p.items.push({ k: 'dn', t: 'Cleaned up grain', d: 'noise level ' + an.noise.toFixed(1) + ' before' });
    }
    // tone
    p.lo = Math.min(an.pLo, 0.10); p.hi = Math.max(an.pHi, 0.90);
    if (p.hi - p.lo < 0.5) { p.lo = 0; p.hi = 1; }
    const levels = p.lo > 0.015 || p.hi < 0.985;
    const span = p.hi - p.lo, m2 = clamp((an.mean - p.lo) / span, 0.02, 0.98), std2 = an.std / span;
    let g = Math.log(0.46) / Math.log(m2); g = 1 + (clamp(g, 0.72, 1.35) - 1) * 0.8;
    p.gamma = Math.abs(g - 1) > 0.04 ? g : 1;
    p.contrast = clamp((0.23 - std2) / 0.23, 0, 1) * 0.45; if (p.contrast < 0.04) p.contrast = 0;
    p.lift = an.dark > 0.3 ? clamp((an.dark - 0.3) * 0.5 + 0.08, 0, 0.2) : 0;
    p.wb = an.cast;
    p.vibrance = an.satMean < 0.18 ? 0.45 : an.satMean < 0.3 ? 0.28 : an.satMean < 0.42 ? 0.14 : 0.04;
    if (an.satMean > 0.5) p.vibrance = 0;
    if (p.wb) p.items.push({ k: 'wb', t: 'Corrected a colour cast', d: 'neutral tones pulled back to grey' });
    if (p.gamma !== 1) p.items.push({ k: 'ex', t: p.gamma < 1 ? 'Brightened the photo' : 'Brought the exposure down', d: 'automatic exposure' });
    else if (p.lift) p.items.push({ k: 'ex', t: 'Opened up the shadows', d: Math.round(an.dark * 100) + '% of the image was very dark' });
    if (levels) p.items.push({ k: 'lv', t: 'Reset black and white points', d: 'cleaner blacks and brighter whites' });
    if (p.contrast) p.items.push({ k: 'ct', t: 'Added contrast', d: 'the photo looked flat' });
    if (p.vibrance >= 0.14) p.items.push({ k: 'vb', t: 'Revived the colour', d: 'smart saturation, skin stays natural' });
    p.levels = levels;
    // classic noise reduction only when the AI is not already doing it
    p.denoise = !p.ai && an.noise > 4.2 ? an.noise : 0;
    if (p.denoise) p.items.push({ k: 'dn', t: 'Softened noise', d: 'noise level ' + an.noise.toFixed(1) });
    // sharpen
    let s = an.sharp < 25 ? 1.0 : an.sharp < 70 ? 0.7 : an.sharp < 150 ? 0.45 : 0.25;
    if (p.ai) s *= 0.45;
    p.sharpen = s;
    if (an.sharp < 70 || p.ai) p.items.push({ k: 'sh', t: 'Sharpened edges', d: an.sharp < 25 ? 'it was soft' : 'light touch' });
    if (!p.items.length) p.items.push({ k: 'ok', t: 'Already in good shape', d: 'only a light polish applied' });
    return p;
  }

  /* ---------- box blur on a byte plane (3 passes ~ gaussian) ---------- */
  function blurPlane(src, w, h, r) {
    let a = src, b = new Uint8Array(w * h), out = new Uint8Array(w * h);
    const pass = (s, d, horizontal) => {
      const len = horizontal ? w : h, lines = horizontal ? h : w, step = horizontal ? 1 : w, div = 2 * r + 1;
      for (let l = 0; l < lines; l++) {
        const base = horizontal ? l * w : l; let acc = 0;
        for (let k = -r; k <= r; k++) acc += s[base + clamp(k, 0, len - 1) * step];
        for (let k = 0; k < len; k++) {
          d[base + k * step] = (acc + (div >> 1)) / div;
          acc += s[base + clamp(k + r + 1, 0, len - 1) * step] - s[base + clamp(k - r, 0, len - 1) * step];
        }
      }
    };
    pass(a, b, true); pass(b, out, false); pass(out, b, true); pass(b, out, false);
    return out;
  }

  /* ---------- apply the automatic corrections in place ---------- */
  function applyTone(img, p) {
    const d = img.data, n = img.width * img.height, luts = [0, 1, 2].map((ch) => {
      const lut = new Uint8ClampedArray(256), gain = p.wb ? p.wb[ch] : 1;
      for (let i = 0; i < 256; i++) {
        let v = clamp(i / 255 * gain, 0, 1);
        v = clamp((v - p.lo) / (p.hi - p.lo), 0, 1);
        if (p.gamma !== 1) v = Math.pow(v, p.gamma);
        if (p.lift) v += p.lift * 2 * v * (1 - v) * (1 - v);
        if (p.contrast) v += p.contrast * (v * v * (3 - 2 * v) - v);
        lut[i] = clamp(v, 0, 1) * 255 + 0.5;
      } return lut;
    }), [lr, lg, lb] = luts, vib = p.vibrance;
    for (let i = 0, q = 0; i < n; i++, q += 4) {
      let r = lr[d[q]], g = lg[d[q + 1]], b = lb[d[q + 2]];
      if (vib) {
        const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
        const s = mx ? (mx - mn) / mx : 0, k = 1 + vib * (1 - s) * (1 - s), L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = L + (r - L) * k; g = L + (g - L) * k; b = L + (b - L) * k;
      }
      d[q] = r; d[q + 1] = g; d[q + 2] = b;
    }
  }

  function denoise(img, sigma) {
    const w = img.width, h = img.height, n = w * h, d = img.data;
    const Y = new Uint8Array(n), cr = new Int16Array(n), cb = new Int16Array(n);
    for (let i = 0, q = 0; i < n; i++, q += 4) { const y = lum(d[q], d[q + 1], d[q + 2]); Y[i] = y + 0.5; cr[i] = d[q] - y; cb[i] = d[q + 2] - y; }
    const hh = 2 * (sigma * 1.6) * (sigma * 1.6), Y2 = new Uint8Array(Y);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, c = Y[i]; let s = c, ws = 1;
      for (let k = 0; k < 8; k++) {
        const o = k === 0 ? -w - 1 : k === 1 ? -w : k === 2 ? -w + 1 : k === 3 ? -1 : k === 4 ? 1 : k === 5 ? w - 1 : k === 6 ? w : w + 1;
        const df = Y[i + o] - c, wt = Math.exp(-(df * df) / hh) * (k === 1 || k === 3 || k === 4 || k === 6 ? 1 : 0.7);
        s += wt * Y[i + o]; ws += wt;
      } Y2[i] = s / ws;
    }
    // chroma: box blur on Cr/Cb
    const s = clamp((sigma - 3) / 10, 0.25, 0.9), tmp = new Int16Array(n), R = 2;
    const blurI = (src) => {
      for (let y = 0; y < h; y++) { let a = 0; const b = y * w;
        for (let k = -R; k <= R; k++) a += src[b + clamp(k, 0, w - 1)];
        for (let x = 0; x < w; x++) { tmp[b + x] = a / (2 * R + 1); a += src[b + clamp(x + R + 1, 0, w - 1)] - src[b + clamp(x - R, 0, w - 1)]; } }
      const out = new Int16Array(n);
      for (let x = 0; x < w; x++) { let a = 0;
        for (let k = -R; k <= R; k++) a += tmp[clamp(k, 0, h - 1) * w + x];
        for (let y = 0; y < h; y++) { out[y * w + x] = a / (2 * R + 1); a += tmp[clamp(y + R + 1, 0, h - 1) * w + x] - tmp[clamp(y - R, 0, h - 1) * w + x]; } }
      return out;
    };
    const bcr = blurI(cr), bcb = blurI(cb);
    for (let i = 0, q = 0; i < n; i++, q += 4) {
      const y = Y2[i], r = y + cr[i] + (bcr[i] - cr[i]) * s, b = y + cb[i] + (bcb[i] - cb[i]) * s;
      d[q] = r; d[q + 2] = b; d[q + 1] = (y - 0.2126 * r - 0.0722 * b) / 0.7152;
    }
  }

  function sharpen(img, amount) {
    const w = img.width, h = img.height, n = w * h, d = img.data, r = clamp(Math.round(Math.max(w, h) / 1500), 1, 3);
    const Y = new Uint8Array(n); for (let i = 0, q = 0; i < n; i++, q += 4) Y[i] = lum(d[q], d[q + 1], d[q + 2]) + 0.5;
    const B = blurPlane(Y, w, h, r), thr = 2;
    for (let i = 0, q = 0; i < n; i++, q += 4) {
      let df = Y[i] - B[i]; const a = Math.abs(df);
      if (a < thr) continue;
      df = clamp(df * amount * 1.1, -40, 40);
      d[q] += df; d[q + 1] += df; d[q + 2] += df;
    }
  }

  function enhance(img, p) {
    applyTone(img, p);
    if (p.denoise) denoise(img, p.denoise);
    if (p.sharpen > 0.05) sharpen(img, p.sharpen);
  }

  /* ---------- filters ---------- */
  // gain: per-channel multiplier; b: brightness; c: contrast; f: fade (lifted blacks); s: saturation;
  // mono: 0/1; tone: [r,g,b] tint for mono; sh/hi: shadow / highlight tint [r,g,b]; vig; grain
  const FILTERS = [
    { id: 'none', name: 'Auto' },
    { id: 'vivid', name: 'Vivid', c: 0.12, s: 1.35 },
    { id: 'warm', name: 'Warm', gain: [1.07, 1.0, 0.91], s: 1.06 },
    { id: 'cool', name: 'Cool', gain: [0.92, 1.0, 1.09], s: 1.02 },
    { id: 'cinema', name: 'Cinema', c: 0.16, s: 1.05, sh: [-0.02, 0.05, 0.07], hi: [0.07, 0.03, -0.04], vig: 0.18 },
    { id: 'film', name: 'Film', c: 0.08, f: 0.05, s: 0.92, sh: [0.0, 0.03, 0.03], hi: [0.05, 0.03, 0.0], grain: 0.045, vig: 0.1 },
    { id: 'golden', name: 'Golden', gain: [1.1, 1.02, 0.84], b: 0.03, s: 1.12, vig: 0.12 },
    { id: 'matte', name: 'Matte', c: -0.04, f: 0.09, s: 0.88 },
    { id: 'pastel', name: 'Pastel', b: 0.07, c: -0.12, f: 0.04, s: 0.78 },
    { id: 'mono', name: 'Mono', mono: 1, c: 0.12 },
    { id: 'noir', name: 'Noir', mono: 1, c: 0.38, vig: 0.38, grain: 0.05 },
    { id: 'sepia', name: 'Sepia', mono: 1, tone: [1.0, 0.86, 0.64], c: 0.06, f: 0.03, vig: 0.15 }
  ];
  const noiseTile = (() => { const t = new Float32Array(256 * 256); let s = 1234567; for (let i = 0; i < t.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; t[i] = (s / 4294967296 - 0.5) * 2; } return t; })();

  // returns a new filtered copy in img.data order; k = intensity 0..1
  function applyFilter(img, f, k) {
    if (!f || f.id === 'none' || k <= 0) return;
    const w = img.width, h = img.height, d = img.data, n = w * h;
    const gain = f.gain || [1, 1, 1], b = f.b || 0, c = f.c || 0, fade = f.f || 0, sat = f.s === undefined ? 1 : f.s;
    const lut = [0, 1, 2].map((ch) => {
      const t = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        let v = clamp(i / 255 * gain[ch] + b, 0, 1);
        v += c * (v * v * (3 - 2 * v) - v);
        v = fade + v * (1 - fade);
        t[i] = clamp(v, 0, 1) * 255;
      } return t;
    });
    const sh = f.sh, hi = f.hi, vig = f.vig || 0, grain = f.grain || 0, mono = f.mono, tone = f.tone || [1, 1, 1];
    const cx = w / 2, cy = h / 2, maxR = Math.sqrt(cx * cx + cy * cy);
    for (let i = 0, q = 0; i < n; i++, q += 4) {
      const R0 = d[q], G0 = d[q + 1], B0 = d[q + 2];
      let r = lut[0][R0], g = lut[1][G0], bl = lut[2][B0];
      let L = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      if (mono) { r = g = bl = L; r *= tone[0]; g *= tone[1]; bl *= tone[2]; }
      else if (sat !== 1) { r = L + (r - L) * sat; g = L + (g - L) * sat; bl = L + (bl - L) * sat; }
      if (sh || hi) {
        const t = L / 255, ws = (1 - t) * (1 - t) * 255, wh = t * t * 255;
        if (sh) { r += sh[0] * ws; g += sh[1] * ws; bl += sh[2] * ws; }
        if (hi) { r += hi[0] * wh; g += hi[1] * wh; bl += hi[2] * wh; }
      }
      if (vig) {
        const x = (i % w) - cx, y = ((i / w) | 0) - cy, rr = Math.sqrt(x * x + y * y) / maxR, t = clamp((rr - 0.35) / 0.75, 0, 1), m = 1 - vig * t * t * (3 - 2 * t);
        r *= m; g *= m; bl *= m;
      }
      if (grain) { const gn = noiseTile[(((i / w) | 0) & 255) * 256 + ((i % w) & 255)] * grain * 255; r += gn; g += gn; bl += gn; }
      if (k >= 1) { d[q] = r; d[q + 1] = g; d[q + 2] = bl; }
      else { d[q] = R0 + (r - R0) * k; d[q + 1] = G0 + (g - G0) * k; d[q + 2] = B0 + (bl - B0) * k; }
    }
  }

  // enh = base + (enh - base) * k   (strength slider); both ImageData of the same size
  function mixInto(enh, base, k) {
    if (k >= 1) return;
    const a = enh.data, b = base.data, n = a.length;
    for (let i = 0; i < n; i += 4) { a[i] = b[i] + (a[i] - b[i]) * k; a[i + 1] = b[i + 1] + (a[i + 1] - b[i + 1]) * k; a[i + 2] = b[i + 2] + (a[i + 2] - b[i + 2]) * k; }
  }

  root.Polish = { analyze, makePlan, enhance, applyFilter, mixInto, FILTERS };
})(typeof self !== 'undefined' ? self : this);
