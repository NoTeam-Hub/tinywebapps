/* Unmark worker: runs the LaMa inpainting model (ONNX, 512 x 512) on this device with ONNX Runtime Web (WASM). */
const BASE = new URL('./', self.location.href).href;
let ORT, session, detSession;
function post(m, t) { self.postMessage(m, t || []); }

function ensureORT() {
  if (ORT) return;
  importScripts(BASE + 'vendor/ort.wasm.min.js');
  ORT = self.ort;
  ORT.env.wasm.wasmPaths = BASE + 'vendor/';
  ORT.env.wasm.numThreads = 1;
  ORT.env.wasm.proxy = false;
}

async function initDet(det) {
  ensureORT();
  const res = await fetch(BASE + det[0]);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + det[0]);
  const b = new Uint8Array(await res.arrayBuffer());
  if (b.length !== det[1]) throw new Error('Incomplete download of ' + det[0]);
  detSession = await ORT.InferenceSession.create(b, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

async function detect(id, data, h, w) {
  const out = await detSession.run({ x: new ORT.Tensor('float32', data, [1, 3, h, w]) });
  const t = out[detSession.outputNames[0]], dims = t.dims;
  const copy = new Float32Array(t.data);
  post({ type: 'det', id, prob: copy, h: dims[dims.length - 2], w: dims[dims.length - 1] }, [copy.buffer]);
}

async function init(parts, v, total) {
  ensureORT();
  const buf = new Uint8Array(total); let off = 0;
  for (let i = 0; i < parts.length; i++) {
    const [p, size] = parts[i];
    let ok = false, err;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const res = await fetch(BASE + p, { cache: attempt ? 'reload' : 'default' });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + p);
        const b = new Uint8Array(await res.arrayBuffer());
        if (b.length !== size) throw new Error('Incomplete download of ' + p);
        buf.set(b, off); ok = true;
      } catch (e) { err = e; }
    }
    if (!ok) throw err;
    off += size; post({ type: 'progress', frac: off / total });
  }
  post({ type: 'stage', text: 'Starting AI engine' });
  session = await ORT.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

async function run(id, rgb, mask) {
  const out = await session.run({ image: new ORT.Tensor('float32', rgb, [1, 3, 512, 512]), mask: new ORT.Tensor('float32', mask, [1, 1, 512, 512]) });
  const data = out[session.outputNames[0]].data;
  const copy = new Float32Array(data); // detach from the runtime's memory
  post({ type: 'result', id, out: copy }, [copy.buffer]);
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') { await init(m.parts, m.v, m.total); post({ type: 'ready' }); }
    else if (m.type === 'run') await run(m.id, m.rgb, m.mask);
    else if (m.type === 'detinit') { await initDet(m.det); post({ type: 'detready' }); }
    else if (m.type === 'detect') await detect(m.id, m.data, m.h, m.w);
  } catch (err) { post({ type: (m.type === 'detinit' || m.type === 'detect') ? 'detfail' : 'fail', id: m.id, error: String((err && err.message) || err) }); }
};
