/* Polish worker: runs a Real-ESRGAN x4 ONNX model (general v3, or x4plus for Better quality) on tiles, entirely on this device.
   ?mode=webgpu tries the GPU first (and checks it against a known answer); ?mode=wasm uses the CPU. */
const MODE = new URL(self.location.href).searchParams.get('mode') || 'wasm';
const BASE = new URL('./', self.location.href).href;
let ORT, session, EP = '';
let TILE = 104, PAD = 12, IN = TILE + PAD * 2, STFILE = 'model/selftest.bin', STN = 32;   // fixed input size keeps GPU shaders compiled once
const cancelled = { v: false };

function post(m, t) { self.postMessage(m, t || []); }

async function init(modelUrl, o) {
  o = o || {};
  if (o.tile) { TILE = o.tile; PAD = o.pad || PAD; IN = TILE + PAD * 2; }
  if (o.selftest) { STFILE = o.selftest; STN = o.stn || STN; }
  importScripts(BASE + (MODE === 'webgpu' ? 'vendor/ort.webgpu.min.js' : 'vendor/ort.wasm.min.js'));
  ORT = self.ort;
  ORT.env.wasm.wasmPaths = BASE + 'vendor/';
  ORT.env.wasm.numThreads = 1;
  ORT.env.wasm.proxy = false;
  const buf = new Uint8Array(await (await fetch(modelUrl)).arrayBuffer());
  const eps = MODE === 'webgpu' ? ['webgpu'] : ['wasm'];
  session = await ORT.InferenceSession.create(buf, { executionProviders: eps, graphOptimizationLevel: 'all' });
  EP = eps[0];
  if (MODE === 'webgpu') await selfTest();
}

// the GPU must reproduce a known answer (made with the CPU) or we refuse to use it
async function selfTest() {
  const raw = new Float32Array(await (await fetch(BASE + STFILE)).arrayBuffer());
  const n = STN, inN = 3 * n * n, input = raw.slice(0, inN), want = raw.slice(inN);
  const out = (await session.run({ input: new ORT.Tensor('float32', input, [1, 3, n, n]) })).output.data;
  let err = 0; for (let i = 0; i < want.length; i++) err += Math.abs(out[i] - want[i]);
  err /= want.length;
  if (!(err < 0.01)) throw new Error('GPU self-test failed (mean error ' + err.toFixed(4) + ')');
}

// area-average resample of an RGBA block (sw x sh) to (dw x dh); keeps tiles seamless because tile rects are integer multiples
function areaResample(src, sw, sh, dw, dh) {
  if (dw === sw && dh === sh) return src;
  const dst = new Uint8ClampedArray(dw * dh * 4), fx = sw / dw, fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = y * fy, y1 = (y + 1) * fy, iy0 = Math.floor(y0), iy1 = Math.min(sh, Math.ceil(y1));
    for (let x = 0; x < dw; x++) {
      const x0 = x * fx, x1 = (x + 1) * fx, ix0 = Math.floor(x0), ix1 = Math.min(sw, Math.ceil(x1));
      let r = 0, g = 0, b = 0, wsum = 0;
      for (let yy = iy0; yy < iy1; yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        for (let xx = ix0; xx < ix1; xx++) {
          const w = wy * (Math.min(xx + 1, x1) - Math.max(xx, x0)), p = (yy * sw + xx) * 4;
          r += src[p] * w; g += src[p + 1] * w; b += src[p + 2] * w; wsum += w;
        }
      }
      const q = (y * dw + x) * 4; dst[q] = r / wsum; dst[q + 1] = g / wsum; dst[q + 2] = b / wsum; dst[q + 3] = 255;
    }
  }
  return dst;
}

async function run(w, h, rgba, scale) {
  cancelled.v = false;
  const ow = w * scale, oh = h * scale, out = new Uint8ClampedArray(ow * oh * 4);
  const tx = Math.ceil(w / TILE), ty = Math.ceil(h / TILE), total = tx * ty;
  const buf = new Float32Array(3 * IN * IN), plane = IN * IN;
  let done = 0, lastPost = 0;
  for (let j = 0; j < ty; j++) for (let i = 0; i < tx; i++) {
    if (cancelled.v) return post({ type: 'cancelled' });
    const x0 = i * TILE, y0 = j * TILE, cw = Math.min(TILE, w - x0), ch = Math.min(TILE, h - y0);
    for (let yy = 0; yy < IN; yy++) {
      const sy = Math.min(h - 1, Math.max(0, y0 - PAD + yy));
      for (let xx = 0; xx < IN; xx++) {
        const sx = Math.min(w - 1, Math.max(0, x0 - PAD + xx)), p = (sy * w + sx) * 4, q = yy * IN + xx;
        buf[q] = rgba[p] / 255; buf[plane + q] = rgba[p + 1] / 255; buf[2 * plane + q] = rgba[p + 2] / 255;
      }
    }
    const res = (await session.run({ input: new ORT.Tensor('float32', buf, [1, 3, IN, IN]) })).output.data;
    const OW = IN * 4, OP = OW * OW, bw = cw * 4, bh = ch * 4, block = new Uint8ClampedArray(bw * bh * 4);
    for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
      const q = (PAD * 4 + yy) * OW + (PAD * 4 + xx), p = (yy * bw + xx) * 4;
      block[p] = res[q] * 255 + 0.5; block[p + 1] = res[OP + q] * 255 + 0.5; block[p + 2] = res[2 * OP + q] * 255 + 0.5; block[p + 3] = 255;
    }
    const dw = cw * scale, dh = ch * scale, small = areaResample(block, bw, bh, dw, dh);
    for (let yy = 0; yy < dh; yy++) out.set(small.subarray(yy * dw * 4, (yy + 1) * dw * 4), ((y0 * scale + yy) * ow + x0 * scale) * 4);
    done++;
    const now = performance.now();
    if (now - lastPost > 120 || done === total) { lastPost = now; post({ type: 'progress', done, total }); }
  }
  post({ type: 'done', width: ow, height: oh, rgba: out.buffer }, [out.buffer]);
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') { await init(m.modelUrl, m); post({ type: 'ready', ep: EP }); }
    else if (m.type === 'run') await run(m.width, m.height, new Uint8ClampedArray(m.rgba), m.scale);
    else if (m.type === 'cancel') cancelled.v = true;
  } catch (err) { post({ type: 'fail', error: String(err && err.message || err), ep: EP || MODE }); }
};
