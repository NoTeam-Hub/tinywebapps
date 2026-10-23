/* Upright: GPU renderer (WebGL2), looks and effects. */
(function (root) {
  'use strict';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255); };

  /* ---------- looks: parameter bundles, blended by an intensity ---------- */
  const L = (n, o) => Object.assign({ n }, o);
  const LOOKS = {
    none: L('None', {}),
    cinematic: L('Cinematic', { con: 1.12, sat: 1.05, sT: hex('0d5a73'), sA: .45, hT: hex('f2a14a'), hA: .4, vig: .25 }),
    golden: L('Golden hour', { exp: .1, warm: .35, sat: 1.15, fade: .05, bloom: .18, vig: .2, hT: hex('ffb347'), hA: .3 }),
    vintage: L('Vintage film', { fade: .35, warm: .15, sat: .85, grain: .35, vig: .3, sT: hex('2a4a3a'), sA: .25, hT: hex('f0d88a'), hA: .25 }),
    moody: L('Moody', { exp: -.15, con: 1.2, sat: .8, fade: .1, vig: .4, sT: hex('1b3a66'), sA: .3 }),
    pastel: L('Pastel', { exp: .15, con: .85, sat: .85, fade: .2, tint: .15, bloom: .2 }),
    matte: L('Matte', { fade: .45, con: .95, sat: .9 }),
    cyber: L('Cyber', { con: 1.15, sat: 1.3, bloom: .35, sT: hex('8c0f99'), sA: .5, hT: hex('1ad1e6'), hA: .45 }),
    cold: L('Cold blue', { warm: -.35, sat: .95, con: 1.05, hT: hex('9cc8ff'), hA: .2 }),
    polaroid: L('Polaroid', { fade: .3, warm: .2, tint: .1, con: .9, sat: .9, vig: .35, grain: .2 }),
    bwc: L('B&W contrast', { sat: 0, con: 1.35, vig: .25, grain: .1 }),
    noir: L('Noir', { sat: 0, con: 1.5, exp: -.2, vig: .5, grain: .15 }),
    dream: L('Dream', { exp: .15, con: .9, sat: 1.1, warm: .1, fade: .1, bloom: .6 }),
    punchy: L('Punchy', { con: 1.2, sat: 1.35, sharp: .5 }),
    sepia: L('Sepia', { duoA: hex('1f1208'), duoB: hex('ffe6bd'), duoAmt: .92, vig: .2, grain: .12 }),
    glow: L('Warm glow', { warm: .3, sat: 1.1, bloom: .4, exp: .05 }),
    sunset: L('Sunset', { warm: .45, tint: .2, hue: -10, sat: 1.25, vig: .25, bloom: .2 }),
    forest: L('Forest', { tint: -.2, warm: -.05, sat: 1.2, con: 1.08, sT: hex('1f4d2e'), sA: .3 }),
    neon: L('Neon night', { sat: 1.4, con: 1.25, bloom: .45, sT: hex('5a1ab3'), sA: .4, hT: hex('1ad1e6'), hA: .35 }),
    bluenoir: L('Blue noir', { duoA: hex('040a1a'), duoB: hex('cfe4ff'), duoAmt: .88, con: 1.2, grain: .25, vig: .3 }),
    retro: L('Retro 80s', { warm: .2, fade: .2, sat: 1.1, sT: hex('9b1b7a'), sA: .35, vhs: .3, grain: .15 }),
    teal: L('Mono teal', { duoA: hex('001a1f'), duoB: hex('a0fff0'), duoAmt: .85, con: 1.1 })
  };
  const DEF = () => ({ exp: 0, con: 1, sat: 1, warm: 0, tint: 0, hue: 0, hi: 0, sh: 0, fade: 0, vig: 0, grain: 0, bloom: 0, sharp: 0, blur: 0,
    sT: [.5, .5, .5], sA: 0, hT: [.5, .5, .5], hA: 0, duoA: [0, 0, 0], duoB: [1, 1, 1], duoAmt: 0, lutAmt: 0, rgb: 0, pix: 0, glitch: 0, vhs: 0 });
  /* clip -> effective shader parameters */
  function effective(clip, beat) {
    const p = DEF(), a = clip.adj || {}, fx = clip.fx || {}, amt = clip.lookAmt == null ? 1 : clip.lookAmt, lk = LOOKS[clip.look] || LOOKS.none;
    for (const k of ['exp', 'warm', 'tint', 'hue', 'hi', 'sh', 'fade', 'vig', 'grain', 'sharp', 'blur']) p[k] = a[k] || 0;
    p.con = a.con == null ? 1 : a.con; p.sat = a.sat == null ? 1 : a.sat;
    for (const k of ['exp', 'warm', 'tint', 'hue', 'fade', 'vig', 'grain', 'bloom', 'sharp', 'vhs']) if (lk[k] != null) p[k] = (p[k] || 0) + amt * lk[k];
    if (lk.con != null) p.con *= 1 + amt * (lk.con - 1);
    if (lk.sat != null) p.sat *= 1 + amt * (lk.sat - 1);
    if (lk.sT) { p.sT = lk.sT; p.sA = amt * lk.sA; } if (lk.hT) { p.hT = lk.hT; p.hA = amt * lk.hA; }
    if (lk.duoA) { p.duoA = lk.duoA; p.duoB = lk.duoB; p.duoAmt = amt * lk.duoAmt; }
    if (fx.duo) { p.duoA = hex(fx.duoA || '#101030'); p.duoB = hex(fx.duoB || '#ffd0a0'); p.duoAmt = Math.max(p.duoAmt, fx.duo); }
    p.bloom = (p.bloom || 0) + (fx.glow || 0); p.rgb = fx.rgb || 0; p.pix = fx.pix || 0; p.glitch = fx.glitch || 0; p.vhs = (p.vhs || 0) + (fx.vhs || 0);
    p.lutAmt = clip.lutId ? (clip.lutAmt == null ? 1 : clip.lutAmt) : 0;
    p.exp = clamp(p.exp, -2, 2); p.sat = clamp(p.sat, 0, 3); p.con = clamp(p.con, .3, 2.5);
    return p;
  }

  /* ---------- shaders ---------- */
  const VS = `#version 300 es
in vec2 a; uniform mat3 u_m; out vec2 v_uv; out vec2 v_scr;
void main(){ vec3 p=u_m*vec3(a,1.); gl_Position=vec4(p.xy,0.,1.); v_uv=a*.5+.5; v_scr=p.xy*.5+.5; }`;
  const HDR = '#version 300 es\nprecision highp float; precision highp sampler3D;\nin vec2 v_uv; in vec2 v_scr; out vec4 o;\n';
  const GRADE = HDR + `
uniform sampler2D u_tex; uniform sampler3D u_lut; uniform vec2 u_res; uniform float u_time; uniform int u_bg;
uniform float u_exp,u_con,u_sat,u_warm,u_tint,u_hue,u_hi,u_sh,u_fade,u_vig,u_grain,u_sharp,u_blur,u_sA,u_hA,u_duoAmt,u_lutAmt,u_rgb,u_pix,u_glitch,u_vhs;
uniform vec3 u_sT,u_hT,u_duoA,u_duoB; uniform float u_lutN;
float h1(float n){return fract(sin(n*91.345)*47453.5453);} float h2(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 samp(vec2 uv){ return texture(u_tex,clamp(uv,vec2(0.001),vec2(.999))).rgb; }
void main(){
  vec2 uv=v_uv; float t=u_time;
  if(u_pix>0.5){ vec2 g=u_res/u_pix; uv=(floor(uv*g)+.5)/g; }
  float sh=0.;
  if(u_glitch>0.){ float row=floor(uv.y*18.); float tt=floor(t*10.); float r=h1(row*7.+tt); if(r>1.-u_glitch*.35){ sh=(h1(row+tt*3.)-.5)*.18*u_glitch; } }
  if(u_vhs>0.){ sh+=sin(uv.y*u_res.y*.35+t*18.)*.0012*u_vhs + (h1(floor(uv.y*40.)+floor(t*8.))>.93?(h1(t)-.5)*.02*u_vhs:0.); }
  uv.x+=sh;
  vec3 c;
  float rg=(u_rgb*.012)+(sh!=0.?abs(sh)*.5:0.)+(u_vhs*.0025);
  if(u_bg==1){ vec3 s=vec3(0.); for(int i=0;i<12;i++){ float a=float(i)*.5236; s+=samp(uv+vec2(cos(a),sin(a))*.025); } c=s/12.*.55; }
  else if(rg>0.){ c=vec3(samp(uv+vec2(rg,0.)).r,samp(uv).g,samp(uv-vec2(rg,0.)).b); }
  else c=samp(uv);
  if(u_blur>0.){ vec3 s=c; float r=u_blur/u_res.y; for(int i=0;i<12;i++){ float a=float(i)*.5236; s+=samp(uv+vec2(cos(a),sin(a)*u_res.x/u_res.y)*r*.7)+samp(uv+vec2(cos(a),sin(a)*u_res.x/u_res.y)*r*.35); } c=s/25.; }
  if(u_sharp>0.){ vec2 px=1./u_res; vec3 n=(samp(uv+vec2(px.x,0.))+samp(uv-vec2(px.x,0.))+samp(uv+vec2(0.,px.y))+samp(uv-vec2(0.,px.y)))*.25; c+= (c-n)*u_sharp*1.6; }
  c*=exp2(u_exp);
  float lum=dot(c,vec3(.2126,.7152,.0722));
  c+= u_sh*(1.-lum)*(1.-lum)*.35; c-= u_hi*lum*lum*.35;
  c=(c-.5)*u_con+.5;
  lum=dot(c,vec3(.2126,.7152,.0722)); c=mix(vec3(lum),c,u_sat);
  c.r+=u_warm*.08; c.b-=u_warm*.08; c.g+=u_tint*.06; c.r-=u_tint*.03; c.b-=u_tint*.03;
  if(u_hue!=0.){ float a=radians(u_hue); float cs=cos(a),sn=sin(a); mat3 m=mat3(.299+.701*cs+.168*sn,.299-.299*cs-.328*sn,.299-.3*cs+1.25*sn,.587-.587*cs+.33*sn,.587+.413*cs+.035*sn,.587-.588*cs-1.05*sn,.114-.114*cs-.497*sn,.114-.114*cs+.292*sn,.114+.886*cs-.203*sn); c=m*c; }
  c=c*(1.-u_fade*.28)+u_fade*.1;
  lum=clamp(dot(c,vec3(.2126,.7152,.0722)),0.,1.);
  c+=(u_sT-.5)*u_sA*(1.-lum)*1.2 + (u_hT-.5)*u_hA*lum*1.2;
  if(u_duoAmt>0.) c=mix(c,mix(u_duoA,u_duoB,lum),u_duoAmt);
  if(u_lutAmt>0.){ vec3 q=clamp(c,0.,1.); q=q*((u_lutN-1.)/u_lutN)+.5/u_lutN; c=mix(c,texture(u_lut,q).rgb,u_lutAmt); }
  if(u_vhs>0.){ c=mix(c,vec3(dot(c,vec3(.3,.59,.11))),.15*u_vhs); c*=1.-u_vhs*.1*(sin(v_scr.y*u_res.y*3.1416)*.5+.5); c+=(h2(v_scr*u_res+t)-.5)*.06*u_vhs; }
  if(u_vig>0.){ float d=distance(v_scr,vec2(.5))*1.5; c*=1.-u_vig*smoothstep(.35,1.05,d); }
  if(u_grain>0.){ float n=h2(v_scr*u_res+fract(t)*91.7)-.5; c+=n*u_grain*.3*(1.-lum*.5); }
  o=vec4(clamp(c,0.,1.),1.);
}`;
  const BLIT = HDR + `uniform sampler2D u_tex; void main(){ o=texture(u_tex,v_uv); }`;
  const BRIGHT = HDR + `uniform sampler2D u_tex; void main(){ vec3 c=texture(u_tex,v_uv).rgb; float l=dot(c,vec3(.3,.59,.11)); o=vec4(c*smoothstep(.45,.9,l),1.); }`;
  const BLUR = HDR + `uniform sampler2D u_tex; uniform vec2 u_dir;
void main(){ vec3 s=texture(u_tex,v_uv).rgb*.227; s+=(texture(u_tex,v_uv+u_dir*1.38).rgb+texture(u_tex,v_uv-u_dir*1.38).rgb)*.316; s+=(texture(u_tex,v_uv+u_dir*3.23).rgb+texture(u_tex,v_uv-u_dir*3.23).rgb)*.07; o=vec4(s,1.); }`;
  const ADD = HDR + `uniform sampler2D u_tex; uniform sampler2D u_tex2; uniform float u_k; void main(){ vec3 a=texture(u_tex,v_uv).rgb, b=texture(u_tex2,v_uv).rgb; o=vec4(1.-(1.-a)*(1.-b*u_k),1.); }`;
  const TRANS = HDR + `uniform sampler2D u_tex; uniform sampler2D u_tex2; uniform float u_p; uniform int u_type; uniform float u_time;
float h1(float n){return fract(sin(n*91.345)*47453.5453);}
void main(){
  vec2 uv=v_uv; float p=u_p; vec3 a,b;
  if(u_type==3){ vec2 ua=(uv-.5)/(1.+p*.6)+.5, ub=(uv-.5)/(1.6-p*.6)+.5; a=texture(u_tex,ua).rgb; b=texture(u_tex2,ub).rgb; o=vec4(mix(a,b,smoothstep(.2,.8,p)),1.); return; }
  if(u_type==4){ float s=p; a=texture(u_tex,uv+vec2(s,0.)).rgb; b=texture(u_tex2,uv-vec2(1.-s,0.)).rgb; o=vec4(uv.x+s<1.?a:b,1.); if(uv.x+s<1.) o=vec4(a,1.); else o=vec4(b,1.); return; }
  if(u_type==5){ float s=p; if(uv.y+s<1.) o=vec4(texture(u_tex,uv+vec2(0.,s)).rgb,1.); else o=vec4(texture(u_tex2,uv-vec2(0.,1.-s)).rgb,1.); return; }
  if(u_type==6){ float e=smoothstep(p-.04,p+.04,uv.x); o=vec4(mix(texture(u_tex2,uv).rgb,texture(u_tex,uv).rgb,e),1.); return; }
  if(u_type==7){ float row=floor(uv.y*14.); float r=h1(row+floor(u_time*20.)); float sh=(r>.5?(r-.5):0.)*.25*sin(p*3.1416); vec2 u2=vec2(uv.x+sh,uv.y);
    vec3 A=vec3(texture(u_tex,u2+vec2(.01*sin(p*3.14),0.)).r,texture(u_tex,u2).g,texture(u_tex,u2-vec2(.01*sin(p*3.14),0.)).b); vec3 B=texture(u_tex2,u2).rgb; o=vec4(mix(A,B,step(.5,p+(r-.5)*.3)),1.); return; }
  a=texture(u_tex,uv).rgb; b=texture(u_tex2,uv).rgb;
  if(u_type==1){ o=vec4(p<.5?a*(1.-p*2.):b*((p-.5)*2.),1.); return; }
  if(u_type==2){ o=vec4(p<.5?mix(a,vec3(1.),p*2.):mix(vec3(1.),b,(p-.5)*2.),1.); return; }
  o=vec4(mix(a,b,p),1.);
}`;
  const LAYER = HDR + `uniform sampler2D u_tex; uniform float u_alpha; uniform int u_key; uniform vec3 u_keyc; uniform float u_tol,u_soft,u_radius,u_aspect;
vec2 cbcr(vec3 c){ return vec2(-.169*c.r-.331*c.g+.5*c.b, .5*c.r-.419*c.g-.081*c.b); }
void main(){ vec4 c=texture(u_tex,v_uv); float al=c.a*u_alpha;
  if(u_key==1){ float d=distance(cbcr(c.rgb),cbcr(u_keyc)); float k=smoothstep(u_tol,u_tol+u_soft,d); al*=k;
    float m=max(c.r,max(c.g,c.b)); if(u_keyc.g>=u_keyc.r&&u_keyc.g>=u_keyc.b) c.g=min(c.g,max(c.r,c.b)); else if(u_keyc.b>=u_keyc.r) c.b=min(c.b,max(c.r,c.g)); else c.r=min(c.r,max(c.g,c.b)); }
  if(u_radius>0.){ vec2 q=(v_uv-.5)*vec2(u_aspect,1.); vec2 hb=vec2(u_aspect,1.)*.5-u_radius; vec2 d=abs(q)-hb; float s=length(max(d,0.))+min(max(d.x,d.y),0.)-u_radius; al*=1.-smoothstep(-.004,.004,s); }
  o=vec4(c.rgb*al,al); }`;

  function Renderer(canvas, opts) {
    opts = opts || {};
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl; this.canvas = canvas; this.W = canvas.width; this.H = canvas.height; this.luts = {};
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s)); return s; };
    const prog = (fs) => { const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p)); const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); } return { p, u }; };
    this.P = { grade: prog(GRADE), blit: prog(BLIT), bright: prog(BRIGHT), blur: prog(BLUR), add: prog(ADD), trans: prog(TRANS), layer: prog(LAYER) };
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    this.fb = {}; this.resize(this.W, this.H);
  }
  const R = Renderer.prototype;
  R.target = function (w, h) {
    const gl = this.gl, tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  };
  R.free = function (t) { if (t) { this.gl.deleteTexture(t.tex); this.gl.deleteFramebuffer(t.fbo); } };
  R.resize = function (W, H) {
    this.W = W; this.H = H; this.canvas.width = W; this.canvas.height = H;
    for (const k in this.fb) this.free(this.fb[k]);
    const q = (n) => Math.max(8, Math.round(n / 4));
    this.fb = { A: this.target(W, H), B: this.target(W, H), work: this.target(W, H), comp: this.target(W, H), g1: this.target(q(W), q(H)), g2: this.target(q(W), q(H)) };
  };
  R.newTex = function () { const gl = this.gl, t = { tex: gl.createTexture(), w: 0, h: 0 }; gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  R.upload = function (t, src, w, h) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); t.w = w || src.videoWidth || src.naturalWidth || src.width; t.h = h || src.videoHeight || src.naturalHeight || src.height; };
  R.freeTex = function (t) { if (t && t.tex) this.gl.deleteTexture(t.tex); };
  R.use = function (name, tgt) { const gl = this.gl; const P = this.P[name]; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fbo : null); gl.viewport(0, 0, tgt ? tgt.w : this.W, tgt ? tgt.h : this.H); return P.u; };
  R.bind = function (unit, t) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex || t); };
  R.quad = function () { this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4); };
  const IDM = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function matFrom(W, H, cx, cy, w, h, rot) {
    /* unit quad (x,y in [-1,1], y up) -> pixel offsets (px right, py up) -> rotate (counter-clockwise by rot on screen) -> clip */
    const hw = w / 2, hh = h / 2, c = Math.cos(rot), s = Math.sin(rot);
    /* screen px: X = cx + hw*x*c + hh*y*s ; Y(down) = cy - (hh*y*c - hw*x*s)  */
    const m00 = hw * c * 2 / W, m10 = hh * s * 2 / W;
    const m01 = hw * s * 2 / H, m11 = hh * c * 2 / H;
    const tx = cx / W * 2 - 1, ty = 1 - cy / H * 2;
    /* clip.x = tx + m00*x + m10*y ; clip.y = ty + m01*x + m11*y   (column-major) */
    return [m00, m01, 0, m10, m11, 0, tx, ty, 1];
  }
  R.setLut = function (id, N, data) {
    const gl = this.gl; if (this.luts[id]) return; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, N, N, N, 0, gl.RGB, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); this.luts[id] = { tex: t, N };
  };
  /* Draw a clip's source texture into `out` with transform + grade + effects.
     st: {fit, zoom, panX, panY, flip, rot, shake, pulse, params (effective()), time, lutId} */
  R.clip = function (src, st, out) {
    const gl = this.gl, W = this.W, H = this.H, sw = src.w, sh = src.h;
    gl.disable(gl.BLEND);
    const cover = Math.max(W / sw, H / sh), contain = Math.min(W / sw, H / sh);
    const base = st.fit === 'contain' ? contain : cover, z = base * (st.zoom || 1) * (st.pulse || 1);
    let w = sw * z, h = sh * z;
    const panx = (st.panX || 0) * Math.max(0, w - W) / 2 + (st.shx || 0), pany = (st.panY || 0) * Math.max(0, h - H) / 2 + (st.shy || 0);
    const p = st.params, lut = st.lutId && this.luts[st.lutId];
    const setU = (u) => {
      gl.uniform2f(u.u_res, W, H); gl.uniform1f(u.u_time, st.time || 0);
      for (const k of ['exp', 'con', 'sat', 'warm', 'tint', 'hue', 'hi', 'sh', 'fade', 'vig', 'grain', 'sharp', 'blur', 'sA', 'hA', 'duoAmt', 'lutAmt', 'rgb', 'pix', 'glitch', 'vhs']) gl.uniform1f(u['u_' + k], p[k]);
      gl.uniform3fv(u.u_sT, p.sT); gl.uniform3fv(u.u_hT, p.hT); gl.uniform3fv(u.u_duoA, p.duoA); gl.uniform3fv(u.u_duoB, p.duoB);
      gl.uniform1i(u.u_tex, 0); gl.uniform1i(u.u_lut, 1); gl.uniform1f(u.u_lutN, lut ? lut.N : 2);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, lut ? lut.tex : (this.nolut || (this.nolut = (() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, 1, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0])); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); return t; })())));
    };
    const needGlow = p.bloom > .01, dst = needGlow ? this.fb.work : out;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (st.fit === 'contain' && (w < W - 1 || h < H - 1)) {
      let u = this.use('grade', dst); setU(u); gl.uniform1i(u.u_bg, 1); gl.uniformMatrix3fv(u.u_m, false, matFrom(W, H, W / 2, H / 2, W * 1.0001, H * 1.0001, 0)); this.bind(0, src); this.quad();
    }
    const u = this.use('grade', dst); setU(u); gl.uniform1i(u.u_bg, 0);
    const sx = st.flip ? -1 : 1; let m = matFrom(W, H, W / 2 - panx, H / 2 - pany, w * sx, h, (st.rot || 0) * Math.PI / 180);
    gl.uniformMatrix3fv(u.u_m, false, m); this.bind(0, src); this.quad();
    if (needGlow) {
      let u1 = this.use('bright', this.fb.g1); gl.uniformMatrix3fv(u1.u_m, false, IDM); gl.uniform1i(u1.u_tex, 0); this.bind(0, this.fb.work); this.quad();
      const g = this.fb.g1, g2 = this.fb.g2; let ub = this.use('blur', g2); gl.uniformMatrix3fv(ub.u_m, false, IDM); gl.uniform1i(ub.u_tex, 0); gl.uniform2f(ub.u_dir, 1.5 / g.w, 0); this.bind(0, g); this.quad();
      ub = this.use('blur', g); gl.uniformMatrix3fv(ub.u_m, false, IDM); gl.uniform1i(ub.u_tex, 0); gl.uniform2f(ub.u_dir, 0, 1.5 / g.h); this.bind(0, g2); this.quad();
      ub = this.use('blur', g2); gl.uniformMatrix3fv(ub.u_m, false, IDM); gl.uniform1i(ub.u_tex, 0); gl.uniform2f(ub.u_dir, 3 / g.w, 0); this.bind(0, g); this.quad();
      ub = this.use('blur', g); gl.uniformMatrix3fv(ub.u_m, false, IDM); gl.uniform1i(ub.u_tex, 0); gl.uniform2f(ub.u_dir, 0, 3 / g.h); this.bind(0, g2); this.quad();
      const ua = this.use('add', out); gl.uniformMatrix3fv(ua.u_m, false, IDM); gl.uniform1i(ua.u_tex, 0); gl.uniform1i(ua.u_tex2, 1); gl.uniform1f(ua.u_k, Math.min(1.6, p.bloom * 1.6)); this.bind(0, this.fb.work); this.bind(1, g); this.quad();
    }
    return out;
  };
  R.transition = function (a, b, p, type, time, out) {
    const gl = this.gl; gl.disable(gl.BLEND); const u = this.use('trans', out); gl.uniformMatrix3fv(u.u_m, false, IDM); gl.uniform1i(u.u_tex, 0); gl.uniform1i(u.u_tex2, 1);
    gl.uniform1f(u.u_p, p); gl.uniform1i(u.u_type, type); gl.uniform1f(u.u_time, time || 0); this.bind(0, a); this.bind(1, b); this.quad(); return out;
  };
  R.copy = function (src, dst) { const gl = this.gl; gl.disable(gl.BLEND); const u = this.use('blit', dst); gl.uniformMatrix3fv(u.u_m, false, IDM); gl.uniform1i(u.u_tex, 0); this.bind(0, src); this.quad(); };
  R.clear = function (dst, r, g, b) { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null); gl.viewport(0, 0, dst ? dst.w : this.W, dst ? dst.h : this.H); gl.clearColor(r || 0, g || 0, b || 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
  /* overlay: o = {cx,cy,w,h,rot(deg),alpha,key:{on,color,tol,soft},radius} on top of `dst` */
  R.overlay = function (tex, o, dst) {
    const gl = this.gl; gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const u = this.use('layer', dst); gl.uniformMatrix3fv(u.u_m, false, matFrom(this.W, this.H, o.cx, o.cy, o.w * (o.flip ? -1 : 1), o.h, (o.rot || 0) * Math.PI / 180));
    gl.uniform1i(u.u_tex, 0); gl.uniform1f(u.u_alpha, o.alpha == null ? 1 : o.alpha);
    const k = o.key || {}; gl.uniform1i(u.u_key, k.on ? 1 : 0); gl.uniform3fv(u.u_keyc, hex(k.color || '#00ff00')); gl.uniform1f(u.u_tol, k.tol == null ? .12 : k.tol); gl.uniform1f(u.u_soft, k.soft == null ? .08 : k.soft);
    gl.uniform1f(u.u_radius, o.radius || 0); gl.uniform1f(u.u_aspect, o.w / Math.max(1, o.h)); this.bind(0, tex); this.quad(); gl.disable(gl.BLEND);
  };
  R.present = function (src) { this.copy(src, null); };
  function parseCube(text) {
    let N = 0; const rows = [];
    for (const ln of text.split(/\r?\n/)) { const s = ln.trim(); if (!s || s[0] === '#') continue; if (/^LUT_3D_SIZE/i.test(s)) { N = parseInt(s.split(/\s+/)[1], 10); continue; } if (/^[A-Z_]+/.test(s) && !/^[-+\d.]/.test(s)) continue; const p = s.split(/\s+/).map(Number); if (p.length >= 3 && p.every((v) => isFinite(v))) rows.push(p); }
    if (!N || N < 2 || N > 65 || rows.length !== N * N * N) throw new Error('This .cube file is not a 3D LUT Upright can read.');
    const d = new Uint8Array(rows.length * 3); rows.forEach((r, i) => { d[i * 3] = clamp(r[0]) * 255 + .5; d[i * 3 + 1] = clamp(r[1]) * 255 + .5; d[i * 3 + 2] = clamp(r[2]) * 255 + .5; });
    return { N, data: d };
  }
  root.UprightFX = { Renderer, LOOKS, effective, DEF, parseCube, hex, clamp, matFrom };
})(window);
