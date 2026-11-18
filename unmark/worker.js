/* Unmark worker: runs the LaMa inpainting model (ONNX, 512 x 512) on this device with ONNX Runtime Web (WASM). */
const BASE = new URL('./', self.location.href).href;
let ORT, session;
function post(m, t) { self.postMessage(m, t || []); }

async function init(parts, v, total) {
  importScripts(BASE + 'vendor/ort.wasm.min.js');
  ORT = self.ort;
  ORT.env.wasm.wasmPaths = BASE + 'vendor/';
  ORT.env.wasm.numThreads = 1;
  ORT.env.wasm.proxy = false;
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
  } catch (err) { post({ type: 'fail', id: m.id, error: String((err && err.message) || err) }); }
};
