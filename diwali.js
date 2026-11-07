/* Happy Diwali 2026 wish card for tinywebapps.in
   One self-contained file: no cookies, no network requests, no tracking.
   Shows once per visitor (a flag in this browser only) and stops appearing after 14 Nov 2026.
   Preview any time with ?diwali=1 on any page. Remove the <script> tag to take it off the site. */
(function () {
  'use strict';
  var KEY = 'twa-diwali-2026', params = '';
  try { params = location.search; } catch (e) {}
  var force = /[?&]diwali=1\b/.test(params);
  if (!force) {
    if (Date.now() > Date.parse('2026-11-14T00:00:00+05:30')) return;
    try { if (localStorage.getItem(KEY)) return; } catch (e) {}
  }
  if (window.top !== window.self) return;

  var css = [
    '.twd-ov{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(12,6,28,.74);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;transition:opacity .45s ease;overflow:auto}',
    '.twd-ov.on{opacity:1}',
    '.twd-card{position:relative;width:min(100%,400px);margin:auto;border-radius:28px;padding:26px 24px 24px;text-align:center;color:#fff4dc;font-family:Fraunces,Georgia,"Times New Roman",serif;background:radial-gradient(120% 70% at 50% 0%,#5b1747 0%,#2b0d45 48%,#160a2e 100%);box-shadow:0 0 0 1.5px #f3c15a,0 0 0 6px #160a2e,0 0 0 7.5px rgba(243,193,90,.55),0 30px 80px rgba(0,0,0,.6),0 0 90px rgba(255,160,40,.18);transform:translateY(24px) scale(.94);transition:transform .6s cubic-bezier(.2,1.2,.3,1);overflow:hidden}',
    '.twd-ov.on .twd-card{transform:none}',
    '.twd-scene{position:relative;width:230px;height:200px;margin:0 auto 4px}',
    '.twd-scene svg{width:100%;height:100%;display:block;overflow:visible}',
    '.twd-ring{transform-origin:115px 118px;animation:twd-spin 70s linear infinite}',
    '.twd-ring.r2{animation-duration:48s;animation-direction:reverse}',
    '.twd-glow{transform-origin:115px 112px;animation:twd-glow 2.8s ease-in-out infinite}',
    '.twd-flame{transform-origin:115px 128px;animation:twd-flick 1.6s ease-in-out infinite}',
    '.twd-hi{font-size:13px;letter-spacing:.32em;text-transform:uppercase;color:#f3c15a;margin:2px 0 0;font-family:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-weight:600}',
    '.twd-hindi{font-family:"Nirmala UI","Noto Sans Devanagari","Mangal",system-ui,sans-serif;font-size:34px;font-weight:700;line-height:1.3;margin:8px 0 0;color:#ffd77a;text-shadow:0 0 22px rgba(255,170,50,.55)}',
    '.twd-t{font-size:clamp(34px,10vw,46px);line-height:1.02;font-weight:700;letter-spacing:-.02em;margin:6px 0 0;background:linear-gradient(180deg,#fff7e0,#f6c85e 70%,#e9972b);-webkit-background-clip:text;background-clip:text;color:transparent}',
    '.twd-m{margin:14px auto 0;max-width:30ch;font-family:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15.5px;line-height:1.55;color:#f6e8cf}',
    '.twd-sig{margin:12px 0 0;font-style:italic;font-size:15px;color:#f3c15a}',
    '.twd-btn{margin-top:20px;display:inline-block;border:0;cursor:pointer;border-radius:999px;padding:13px 30px;font:700 15px "Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color:#2a0f06;background:linear-gradient(180deg,#ffe08a,#f1a93a);box-shadow:0 8px 24px rgba(241,169,58,.35),inset 0 1px 0 rgba(255,255,255,.6)}',
    '.twd-btn:hover{filter:brightness(1.06)}',
    '.twd-btn:focus-visible,.twd-x:focus-visible{outline:3px solid #fff;outline-offset:3px}',
    '.twd-x{position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:50%;border:1px solid rgba(243,193,90,.55);background:rgba(255,255,255,.06);color:#f3c15a;font-size:20px;line-height:1;cursor:pointer}',
    '.twd-x:hover{background:rgba(255,255,255,.14)}',
    '.twd-sp{position:absolute;bottom:-10px;width:5px;height:5px;border-radius:50%;background:#ffd77a;box-shadow:0 0 8px 2px rgba(255,200,90,.8);opacity:0;animation:twd-rise var(--d,6s) var(--l,0s) linear infinite;pointer-events:none}',
    '.twd-str{display:flex;justify-content:center;gap:7px;margin:16px 0 0}',
    '.twd-str i{display:block;width:12px;height:12px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffd27a,#f08a1c 70%);box-shadow:0 0 8px rgba(255,160,40,.6);animation:twd-tw 2.4s var(--l,0s) ease-in-out infinite}',
    '@keyframes twd-spin{to{transform:rotate(360deg)}}',
    '@keyframes twd-glow{0%,100%{opacity:.75;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}',
    '@keyframes twd-flick{0%,100%{transform:scale(1,1) rotate(0)}20%{transform:scale(.96,1.05) rotate(-2.5deg)}45%{transform:scale(1.04,.97) rotate(2deg)}70%{transform:scale(.97,1.04) rotate(-1.5deg)}}',
    '@keyframes twd-rise{0%{transform:translate(0,0) scale(.6);opacity:0}15%{opacity:1}100%{transform:translate(var(--x,0),-420px) scale(1);opacity:0}}',
    '@keyframes twd-tw{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1.1)}}',
    '@media (prefers-reduced-motion:reduce){.twd-ov,.twd-card{transition:none}.twd-ring,.twd-glow,.twd-flame,.twd-sp,.twd-str i{animation:none}.twd-sp{display:none}}'
  ].join('\n');

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* rangoli: rings of petals drawn around the lamp */
  function petals(n, rx, ry, cy, fill, stroke) {
    var out = '', i;
    for (i = 0; i < n; i++) out += '<ellipse cx="115" cy="' + (cy - ry) + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1" transform="rotate(' + (i * 360 / n) + ' 115 ' + cy + ')"/>';
    return out;
  }
  function dots(n, r, cy, fill, size) {
    var out = '', i, a;
    for (i = 0; i < n; i++) { a = i * 2 * Math.PI / n; out += '<circle cx="' + (115 + r * Math.sin(a)).toFixed(1) + '" cy="' + (cy - r * Math.cos(a)).toFixed(1) + '" r="' + size + '" fill="' + fill + '"/>'; }
    return out;
  }
  var CY = 118;
  var scene =
    '<svg viewBox="0 0 230 200" aria-hidden="true" focusable="false">' +
    '<defs>' +
    '<radialGradient id="twdG" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffcf6b" stop-opacity=".95"/><stop offset=".45" stop-color="#ff9a2e" stop-opacity=".35"/><stop offset="1" stop-color="#ff7a18" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="twdB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset=".55" stop-color="#e48a24"/><stop offset="1" stop-color="#a8531a"/></linearGradient>' +
    '<linearGradient id="twdF" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff7a18"/><stop offset=".55" stop-color="#ffc44d"/><stop offset="1" stop-color="#fff6c8"/></linearGradient>' +
    '</defs>' +
    '<g class="twd-ring">' + petals(16, 7, 24, CY, 'rgba(236,64,122,.28)', 'rgba(243,193,90,.55)') + dots(16, 62, CY, '#f3c15a', 1.8) + '</g>' +
    '<g class="twd-ring r2">' + petals(12, 6, 15, CY, 'rgba(255,170,50,.35)', 'rgba(255,215,122,.6)') + dots(24, 38, CY, '#ffd77a', 1.3) + '</g>' +
    '<circle class="twd-glow" cx="115" cy="112" r="60" fill="url(#twdG)"/>' +
    '<g class="twd-flame"><path d="M115 82 C104 100 101 112 107 122 C110 127 120 127 123 122 C129 112 126 100 115 82 Z" fill="url(#twdF)"/><path d="M115 100 C110 109 110 116 115 121 C120 116 120 109 115 100 Z" fill="#fffbe6" opacity=".9"/></g>' +
    '<path d="M84 128 C84 150 100 162 115 162 C130 162 146 150 146 128 C136 134 94 134 84 128 Z" fill="url(#twdB)"/>' +
    '<path d="M84 128 C94 122 136 122 146 128 C136 134 94 134 84 128 Z" fill="#7a3a12"/>' +
    '<ellipse cx="115" cy="126" rx="16" ry="3.4" fill="#2a1206"/>' +
    '<path d="M84 128 C76 126 72 122 70 117 C78 118 84 121 88 125 Z" fill="#d7791f"/>' +
    '<path d="M92 142 C100 150 130 150 138 142" fill="none" stroke="#ffe3a0" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>' +
    '<circle cx="104" cy="146" r="1.8" fill="#ffe3a0"/><circle cx="115" cy="152" r="1.8" fill="#ffe3a0"/><circle cx="126" cy="146" r="1.8" fill="#ffe3a0"/>' +
    '<ellipse cx="115" cy="174" rx="44" ry="6" fill="#000" opacity=".28"/>' +
    '</svg>';

  var prev = document.activeElement;
  var ov = el('div', 'twd-ov');
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'twd-title');
  var card = el('div', 'twd-card');
  var st = document.createElement('style'); st.textContent = css;

  var i, sp;
  for (i = 0; i < 14; i++) {
    sp = el('span', 'twd-sp');
    sp.style.left = (6 + Math.random() * 88).toFixed(1) + '%';
    sp.style.setProperty('--d', (5 + Math.random() * 5).toFixed(1) + 's');
    sp.style.setProperty('--l', (-Math.random() * 9).toFixed(1) + 's');
    sp.style.setProperty('--x', ((Math.random() - .5) * 60).toFixed(0) + 'px');
    card.appendChild(sp);
  }
  var x = el('button', 'twd-x', '&times;'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
  card.appendChild(x);
  card.appendChild(el('div', 'twd-scene', scene));
  card.appendChild(el('p', 'twd-hi', 'Wishing you light'));
  card.appendChild(el('p', 'twd-hindi', 'शुभ दीपावली'));
  var h = el('h2', 'twd-t', 'Happy Diwali'); h.id = 'twd-title'; card.appendChild(h);
  card.appendChild(el('p', 'twd-m', 'May this festival of lights fill your home with joy, your days with success and your year with good things.'));
  card.appendChild(el('p', 'twd-sig', 'With love, the Tiny Web Apps team'));
  var b = el('button', 'twd-btn', 'Thank you'); b.type = 'button'; card.appendChild(b);
  var str = el('div', 'twd-str'); for (i = 0; i < 9; i++) { var d = document.createElement('i'); d.style.setProperty('--l', (i * .25).toFixed(2) + 's'); str.appendChild(d); }
  card.appendChild(str);
  ov.appendChild(card);

  function close() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    ov.classList.remove('on');
    document.removeEventListener('keydown', key, true);
    setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); if (st.parentNode) st.parentNode.removeChild(st); try { if (prev && prev.focus) prev.focus(); } catch (e) {} }, 480);
  }
  function key(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') {
      var f = [x, b], at = document.activeElement, k = f.indexOf(at);
      e.preventDefault(); f[(k + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
    }
  }
  x.addEventListener('click', close); b.addEventListener('click', close);
  ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

  function show() {
    document.head.appendChild(st); document.body.appendChild(ov);
    document.addEventListener('keydown', key, true);
    requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('on'); b.focus({ preventScroll: true }); }); });
  }
  function go() { setTimeout(show, force ? 100 : 900); }
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();
