/* Upright export: WebCodecs (H.264/AAC where available) with a real-time recorder fallback. */
(function (root) {
  'use strict';
  const U = root.U, nextTick = () => new Promise((r) => setTimeout(r, 0));
  async function pickCodecs(W, H, fps, bitrate, wantAudio) {
    const px = W * H, level = px <= 921600 ? '1f' : px <= 2097152 ? '28' : '33';
    const tries = [{ codec: 'avc1.6400' + level, mux: 'avc', extra: { avc: { format: 'avc' } } }, { codec: 'avc1.4d00' + level, mux: 'avc', extra: { avc: { format: 'avc' } } }, { codec: 'vp09.00.40.08', mux: 'vp9', extra: {} }, { codec: 'av01.0.08M.08', mux: 'av1', extra: {} }];
    let video = null;
    for (const t of tries) { try { const cfg = Object.assign({ codec: t.codec, width: W, height: H, bitrate, framerate: fps }, t.extra); const s = await VideoEncoder.isConfigSupported(cfg); if (s.supported) { video = { cfg, mux: t.mux, name: t.codec }; break; } } catch (e) {} }
    if (!video) throw new Error('This browser cannot encode video at this size.');
    let audio = null;
    if (wantAudio && typeof AudioEncoder !== 'undefined') for (const a of [{ codec: 'mp4a.40.2', mux: 'aac' }, { codec: 'opus', mux: 'opus' }]) { try { const cfg = { codec: a.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 }; const s = await AudioEncoder.isConfigSupported(cfg); if (s.supported) { audio = { cfg, mux: a.mux }; break; } } catch (e) {} }
    return { video, audio };
  }
  U.exportCaps = () => ({ webcodecs: typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof Mp4Muxer !== 'undefined', recorder: typeof MediaRecorder !== 'undefined' });
  U.exportVideo = async (o) => {
    const P = U.P, total = U.total(); if (!total) throw new Error('Add a clip first.');
    U.pause(); U.exporting = true; const keep = U.view.t, sig = o.signal, abort = () => { if (sig && sig.aborted) throw new DOMException('cancelled', 'AbortError'); };
    try {
      U.setRes(P.q); const W = U.R.W, H = U.R.H, fps = o.fps || P.fps, N = Math.max(1, Math.round(total * fps));
      if (!U.exportCaps().webcodecs || o.forceRecorder) return await viaRecorder(o, total, W, H, fps);
      const wantAudio = U.hasAnyAudio(), bitrate = Math.round(Math.min(16e6, Math.max(3e6, W * H * fps * .1)));
      const codecs = await pickCodecs(W, H, fps, bitrate, wantAudio);
      const target = new Mp4Muxer.ArrayBufferTarget();
      const muxer = new Mp4Muxer.Muxer({ target, fastStart: 'in-memory', video: { codec: codecs.video.mux, width: W, height: H, frameRate: fps }, audio: codecs.audio ? { codec: codecs.audio.mux, numberOfChannels: 2, sampleRate: 48000 } : undefined });
      let fail = null; const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { fail = e; } }); venc.configure(codecs.video.cfg);
      let aenc = null; if (codecs.audio) { aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { fail = e; } }); aenc.configure(codecs.audio.cfg); }
      const t0 = performance.now(); let lastUi = 0;
      try {
        let mix = null; if (aenc) { o.onProgress(0, { stage: 'Mixing audio' }); mix = await U.renderMix(total, 48000); await nextTick(); }
        for (let i = 0; i < N; i++) {
          abort(); if (fail) throw fail; const t = Math.min(total - 1e-4, i / fps);
          await U.prepareAt(t); U.draw(t, true);
          const frame = new VideoFrame(U.R.canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
          venc.encode(frame, { keyFrame: i % (fps * 2) === 0 }); frame.close();
          while (venc.encodeQueueSize > 6) { await nextTick(); if (fail) throw fail; }
          const now = performance.now(); if (now - lastUi > 150) { lastUi = now; const d = (i + 1) / N, el = (now - t0) / 1000; o.onProgress(d * (aenc ? .94 : 1), { eta: d > .03 ? el / d - el : null, fps: (i + 1) / Math.max(.1, el) }); await nextTick(); }
        }
        await venc.flush();
        if (aenc && mix) {
          const sr = 48000, ch0 = mix.getChannelData(0), ch1 = mix.numberOfChannels > 1 ? mix.getChannelData(1) : ch0, chunk = 4800;
          for (let s = 0; s < mix.length; s += chunk) { abort(); const n = Math.min(chunk, mix.length - s), d = new Float32Array(n * 2); d.set(ch0.subarray(s, s + n), 0); d.set(ch1.subarray(s, s + n), n);
            const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(s * 1e6 / sr), data: d }); aenc.encode(ad); ad.close(); while (aenc.encodeQueueSize > 12) await nextTick(); if (s % (chunk * 40) === 0) await nextTick(); }
          await aenc.flush();
        }
        if (fail) throw fail; muxer.finalize(); o.onProgress(1, { done: true });
        return { blob: new Blob([target.buffer], { type: 'video/mp4' }), ext: 'mp4', info: codecs.video.name + (codecs.audio ? ' + ' + codecs.audio.cfg.codec : ' (no audio)'), seconds: total, via: 'webcodecs' };
      } finally { try { venc.close(); } catch (e) {} try { aenc && aenc.close(); } catch (e) {} }
    } finally { U.exporting = false; U.fitPreview(); U.view.t = keep; U.renderNow(); }
  };
  async function viaRecorder(o, total, W, H, fps) {
    const cv = U.R.canvas, ac = U.audioCtx(); await ac.resume(); const dest = ac.createMediaStreamDestination();
    const vs = cv.captureStream(fps); const tracks = vs.getVideoTracks().slice(); if (U.hasAnyAudio()) dest.stream.getAudioTracks().forEach((t) => tracks.push(t));
    const stream = new MediaStream(tracks), mimes = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'], mime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: Math.round(W * H * fps * .1) } : undefined), chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    for (const c of U.P.clips) { const m = U.MEDIA[c.mid]; if (m && m.kind === 'video') await U.decodeAudio(m); }
    const done = new Promise((r) => { rec.onstop = r; }); rec.start(500);
    const when = ac.currentTime + .15, g = U.scheduleAudio(ac, dest, when, 0, total); U.playing = true; U.exporting = true;
    await new Promise((res, rej) => { const tick = () => { if (o.signal && o.signal.aborted) return rej(new DOMException('cancelled', 'AbortError')); const t = Math.max(0, ac.currentTime - when); if (t >= total) return res(); U.draw(Math.min(t, total - 1e-3)); o.onProgress(t / total, {}); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }).catch((e) => { try { rec.stop(); } catch (x) {} g.stop(); U.playing = false; throw e; });
    g.stop(); U.playing = false; rec.stop(); await done; o.onProgress(1, { done: true });
    const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
    return { blob: new Blob(chunks, { type }), ext: /mp4/.test(type) ? 'mp4' : 'webm', info: 'real-time recording', seconds: total, via: 'recorder' };
  }
})(window);
