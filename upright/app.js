/* Upright start-up: capability check, restore prompt, offline. */
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id), U = root.U;
  const APP_FILES = ['index.html', 'fx.js', 'engine.js', 'export.js', 'store.js', 'auto.js', 'ui.js', 'app.js', 'lib.js', 'whisper.js', 'mp4-muxer.js', 'sw.js', 'site.webmanifest'];
  let checkLines = {}, lastErr = '';
  const chip = () => $('model');
  root.setChip = (state, text) => { chip().dataset.state = state; $('modelText').textContent = text; };
  const yn = (v) => (v ? 'yes' : 'no');
  async function support(cfg, kind) { try { if (kind === 'v') { if (typeof VideoEncoder === 'undefined') return 'no'; return (await VideoEncoder.isConfigSupported(cfg)).supported ? 'yes' : 'no'; } if (typeof AudioEncoder === 'undefined') return 'no'; return (await AudioEncoder.isConfigSupported(cfg)).supported ? 'yes' : 'no'; } catch (e) { return 'no'; } }
  function gpuName() { try { const g = U.R.gl, e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); } catch (e) { return 'unknown'; } }
  async function buildReport() {
    const c = U.exportCaps(), simd = (() => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { return false; } })();
    const L = ['Upright report', 'Time: ' + new Date().toISOString(), 'Page: ' + location.href, 'Browser: ' + navigator.userAgent,
      'WebGL 2: ' + yn(!!U.R) + (U.R ? '   renderer: ' + gpuName() + '   max texture: ' + U.R.gl.getParameter(U.R.gl.MAX_TEXTURE_SIZE) : ''),
      'Fast export (WebCodecs + MP4 writer): ' + yn(c.webcodecs), 'H.264 video: ' + await support({ codec: 'avc1.640028', width: 720, height: 1280, bitrate: 4e6, framerate: 30 }, 'v') + '   VP9 video: ' + await support({ codec: 'vp09.00.40.08', width: 720, height: 1280, bitrate: 4e6, framerate: 30 }, 'v'),
      'AAC audio: ' + await support({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }, 'a') + '   Opus audio: ' + await support({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }, 'a'),
      'Real-time recorder fallback: ' + yn(c.recorder), 'Microphone: ' + yn(!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)), 'WebAssembly SIMD (captions): ' + yn(simd), 'Autosave storage: ' + yn(!!root.indexedDB), 'Share sheet: ' + yn(!!navigator.share),
      'Offline cache: ' + yn('serviceWorker' in navigator && !!navigator.serviceWorker.controller),
      'Project: ' + U.P.clips.length + ' clips, ' + U.P.overlays.length + ' overlays, ' + (U.total() || 0).toFixed(1) + ' s, ' + U.P.ar + ' at ' + U.P.q + 'p',
      'Last error: ' + (lastErr || 'none'), '', 'Page files:'];
    APP_FILES.forEach((f) => L.push('  ' + f + (checkLines[f] ? '  ' + checkLines[f] : '')));
    L.push('', 'Caption model files (expected size):'); root.UprightWhisper.files().forEach((f) => L.push('  ' + f.name + '  ' + f.size + ' bytes' + (checkLines[f.name] ? '  ' + checkLines[f.name] : '')));
    return L.join('\n');
  }
  async function showReport() { $('report').hidden = false; $('reportText').value = await buildReport(); $('report').scrollIntoView({ block: 'nearest' }); }
  root.addEventListener('error', (e) => { lastErr = (e && e.message) || lastErr; });
  root.addEventListener('unhandledrejection', (e) => { lastErr = (e && e.reason && e.reason.message) || lastErr; });
  async function head(url) { try { const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' }); return r.ok ? Number(r.headers.get('content-length') || -1) : 'MISSING (HTTP ' + r.status + ')'; } catch (e) { return 'ERROR ' + e.message; } }
  function bindReport() {
    $('modelDetails').addEventListener('click', () => { if ($('report').hidden) showReport(); else $('report').hidden = true; });
    $('reportClose').addEventListener('click', () => { $('report').hidden = true; });
    $('reportCopy').addEventListener('click', async () => { const t = $('reportText'); try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); } $('reportCopy').textContent = 'Copied'; setTimeout(() => { $('reportCopy').textContent = 'Copy'; }, 1600); });
    $('reportCheck').addEventListener('click', async () => {
      const b = $('reportCheck'); b.disabled = true; checkLines = {}; const list = APP_FILES.map((f) => ({ name: f, url: f })).concat(root.UprightWhisper.files().filter((f) => !/\/base/.test(f.name)));
      for (let i = 0; i < list.length; i++) { b.textContent = 'Checking ' + (i + 1) + '/' + list.length; const f = list[i], n = await head(f.url); checkLines[f.name] = typeof n === 'string' ? n : (f.size && n >= 0 && n !== f.size ? 'WRONG SIZE (' + n + ')' : 'OK'); }
      root.UprightWhisper.files().forEach((f) => { if (!(f.name in checkLines)) checkLines[f.name] = '(not checked here: only the Fast model is checked)'; });
      b.textContent = 'Check files'; b.disabled = false; $('reportText').value = await buildReport();
    });
  }
  root.addEventListener('DOMContentLoaded', async () => {
    try { UI.init(); } catch (e) { lastErr = e.message || String(e); setChip('error', 'Needs WebGL 2'); bindReport(); $('intro').insertAdjacentHTML('beforeend', '<p class="m" style="color:#e5484d">' + (e.message || e) + ' Try a current Chrome, Edge, Safari or Firefox.</p>'); return; }
    bindReport();
    const pk = await U.store.peek();
    if (pk) { const r = $('restore'); r.innerHTML = `<div class="restore"><span>Continue your last reel? ${pk.clips} clip${pk.clips > 1 ? 's' : ''}, saved ${new Date(pk.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.</span><span><button class="p" id="rsY">Continue</button> <button id="rsN">Discard</button></span></div>`;
      $('rsY').onclick = async () => { $('rsY').disabled = true; $('rsY').textContent = 'Loading…'; try { await U.store.restore(); document.body.classList.add('edit'); UI.S.clip = 0; UI.setAspect(); U.fitPreview(); UI.syncPanels(); UI.fitTL(); U.seek(0); r.innerHTML = ''; } catch (e) { UI.say('Could not restore that project.', true); r.innerHTML = ''; } };
      $('rsN').onclick = async () => { await U.store.clear(); r.innerHTML = ''; }; }
  });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})(window);
