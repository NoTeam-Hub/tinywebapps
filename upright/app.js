/* Upright start-up: capability check, restore prompt, offline. */
(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id), U = root.U;
  root.details = async () => {
    const rows = []; const y = (ok, t) => rows.push(`<div class="${ok ? 'y' : 'n'}">${ok ? '✓' : '✗'} ${t}</div>`);
    y(!!U.R, 'WebGL 2 graphics (looks and effects)'); const c = U.exportCaps(); y(c.webcodecs, 'Fast export (WebCodecs)');
    try { if (c.webcodecs) { const h = await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: 720, height: 1280, bitrate: 4e6, framerate: 30 }); y(h.supported, 'H.264 video (MP4)'); } } catch (e) { y(false, 'H.264 video (MP4)'); }
    try { if (typeof AudioEncoder !== 'undefined') { const a = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }); y(a.supported, 'AAC audio (MP4)'); } else y(false, 'AAC audio (MP4)'); } catch (e) { y(false, 'AAC audio (MP4)'); }
    y(c.recorder, 'Real-time recording fallback'); y(!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia), 'Microphone (voiceover)'); y(typeof WebAssembly === 'object', 'WebAssembly (captions)'); y(!!root.indexedDB, 'Autosave storage'); y(!!navigator.share, 'Share sheet');
    $('ck').innerHTML = rows.join(''); $('dt').showModal();
  };
  root.addEventListener('DOMContentLoaded', async () => {
    try { UI.init(); } catch (e) { $('chipt').textContent = 'This browser cannot run Upright (needs WebGL 2)'; $('chip').classList.add('bad'); $('intro').insertAdjacentHTML('beforeend', '<p class="m" style="color:#e5484d">' + (e.message || e) + ' Try a current Chrome, Edge, Safari or Firefox.</p>'); return; }
    const pk = await U.store.peek();
    if (pk) { const r = $('restore'); r.innerHTML = `<div class="restore"><span>Continue your last reel? ${pk.clips} clip${pk.clips > 1 ? 's' : ''}, saved ${new Date(pk.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.</span><span><button class="p" id="rsY">Continue</button> <button id="rsN">Discard</button></span></div>`;
      $('rsY').onclick = async () => { $('rsY').disabled = true; $('rsY').textContent = 'Loading…'; try { await U.store.restore(); document.body.classList.add('edit'); UI.S.clip = 0; UI.setAspect(); U.fitPreview(); UI.syncPanels(); UI.fitTL(); U.seek(0); r.innerHTML = ''; } catch (e) { UI.say('Could not restore that project.', true); r.innerHTML = ''; } };
      $('rsN').onclick = async () => { await U.store.clear(); r.innerHTML = ''; }; }
  });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})(window);
