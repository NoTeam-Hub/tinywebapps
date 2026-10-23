/* Upright one-tap Auto reel: cuts on exact beats with transitions, fades and a look. */
(function (root) {
  'use strict';
  const U = root.U, clamp = U.clamp;
  U.autoReel = async (o) => {
    const P = U.P, pool = Object.values(U.MEDIA).filter((m) => m.kind === 'video' || m.kind === 'image').filter((m) => P.clips.some((c) => c.mid === m.id) || true);
    if (!pool.length) throw new Error('Add some videos or photos first.');
    if (!P.music) throw new Error('Pick a song first, so the cuts have a beat to land on.');
    if (!U.musicBuf) await U.musicReady(); const mu = P.music; if (!mu || !mu.beats || mu.beats.length < 4) throw new Error('Could not find the beat of this song. Try another one.');
    const beats = mu.beats, bpm = mu.bpm || Math.round(60 / ((beats[beats.length - 1] - beats[0]) / (beats.length - 1)));
    const per = (beats[beats.length - 1] - beats[0]) / (beats.length - 1), seg = per * o.pace; U.snap();
    mu.at = 0; mu.off = beats[0];
    const target = Math.min(o.dur, U.musicBuf.duration - mu.off - .5), n = Math.max(2, Math.floor(target / seg)), td = o.trans === 'cut' ? 0 : Math.min(.28, seg * .35), mix = ['fade', 'zoom', 'slide', 'wipe', 'glitch', 'white'];
    const order = pool.slice(); if (o.shuffle) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const used = {}; const clips = [];
    for (let i = 0; i < n; i++) {
      const m = order[i % order.length], len = seg + (i === 0 ? td / 2 : i === n - 1 ? td / 2 : td), c = U.newClip(m);
      if (m.kind === 'image') { c.dur = +len.toFixed(3); c.kb = (i % 2 ? 1 : -1) * .12; if (c.kb < 0) { c.zoom = 1.12; } } else {
        const k = used[m.id] = (used[m.id] || 0) + 1 - 1; used[m.id]++; const room = Math.max(0, m.dur - len);
        if (m.dur < len) { c.in = 0; c.out = m.dur; c.speed = Math.max(.5, m.dur / len); } else { c.in = room ? (k * len * 1.15) % room : 0; c.out = c.in + len; }
      }
      c.look = o.look === 'none' ? 'none' : o.look; c.lookAmt = .9;
      c.tr = i === 0 ? null : (o.trans === 'mix' ? mix[i % mix.length] : o.trans === 'cut' ? 'none' : o.trans); c.trd = td; clips.push(c);
    }
    P.clips.forEach((c) => U.dropClipEl(c.id)); P.clips = clips; P.tr = { type: o.trans === 'cut' || o.trans === 'mix' ? 'fade' : o.trans, dur: td || .3 }; P.fade = true; P.beatZoom = o.zoom ? .06 : 0;
    U.view.t = 0; U.changed(true); return { clips: n, seconds: +(n * seg).toFixed(1), bpm };
  };
})(window);
