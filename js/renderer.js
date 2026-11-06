/* ORIGIN — WebGL2 renderer */
(function (global) {
  'use strict';

  const CFG = global.ORIGIN_CONFIG.CONFIG;

  const BG_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
void main(){ gl_Position = vec4(aCorner, 0.0, 1.0); }`;

  const BG_FS = `#version 300 es
precision highp float;
uniform sampler2D uNutrient;
uniform vec2 uCam, uRes, uWorld;
uniform float uScale, uPulse;
out vec4 outColor;
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main(){
  vec2 px = gl_FragCoord.xy - uRes * 0.5;
  vec2 world = uCam + vec2(px.x, px.y) / uScale;
  vec2 uv = world / uWorld;
  vec3 col = vec3(0.010, 0.022, 0.028);
  if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
    float n = texture(uNutrient, uv).r;
    vec3 deep = vec3(0.012, 0.030, 0.037);
    vec3 rich = vec3(0.020, 0.105, 0.096);
    col = mix(deep, rich, smoothstep(0.02, 0.85, n));
    float contour = abs(fract(n * 16.0) - 0.5);
    col += vec3(0.02, 0.09, 0.08) * smoothstep(0.48, 0.5, contour) * 0.5;
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    col += vec3(0.05, 0.22, 0.20) * smoothstep(0.014, 0.0, edge) * 0.7;
  }
  vec2 q = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.012;
  float v = smoothstep(0.32, 0.86, length(q) * 1.5) * uPulse;
  col += vec3(0.30, 0.05, 0.02) * v * 0.40;
  outColor = vec4(col, 1.0);
}`;

  const CELL_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aPos;
layout(location=2) in float aRadius;
layout(location=3) in vec3 aColor;
layout(location=4) in float aSoma;
layout(location=5) in float aEnergy;
uniform vec2 uCam, uRes;
uniform float uScale, uGlow;
out vec2 vLocal;
out vec3 vColor;
out float vSoma;
out float vEnergy;
void main(){
  float r = aRadius * (uGlow > 0.5 ? 2.7 : 1.0);
  vec2 world = aPos + aCorner * r;
  vec2 px = (world - uCam) * uScale;
  vec2 clip = px / (uRes * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
  vLocal = aCorner;
  vColor = aColor;
  vSoma = aSoma;
  vEnergy = aEnergy;
}`;

  const CELL_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vColor;
in float vSoma;
in float vEnergy;
uniform float uGlow;
out vec4 outColor;
void main(){
  float d = length(vLocal);
  if (uGlow > 0.5) {
    float g = exp(-d * d * 3.0) * 0.16;
    outColor = vec4(vColor * g, g);
    return;
  }
  float aa = max(fwidth(d) * 1.5, 0.015);
  float body = 1.0 - smoothstep(1.0 - aa, 1.0, d);
  if (body <= 0.001) discard;
  float core = exp(-d * d * 2.4);
  vec3 col = vColor * (0.45 + 0.55 * clamp(vEnergy, 0.0, 1.0)) + vec3(core * 0.22);
  float rim = smoothstep(0.70, 0.96, d) * (1.0 - smoothstep(0.96, 1.0, d));
  col += vColor * rim * 0.9;
  if (vSoma > 0.5) {
    float ring = smoothstep(0.52, 0.57, d) * (1.0 - smoothstep(0.63, 0.68, d));
    col = mix(col, vec3(1.0, 0.78, 0.38), ring);
  }
  outColor = vec4(col, body);
}`;

  const BOND_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aA;
layout(location=2) in vec2 aB;
layout(location=3) in float aWidth;
layout(location=4) in float aAlpha;
uniform vec2 uCam, uRes;
uniform float uScale;
out float vSide;
out float vAlpha;
void main(){
  vec2 dir = aB - aA;
  float len = length(dir);
  dir = len > 0.0001 ? dir / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  float t = aCorner.x * 0.5 + 0.5;
  vec2 world = mix(aA, aB, t) + n * aCorner.y * aWidth;
  vec2 px = (world - uCam) * uScale;
  vec2 clip = px / (uRes * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
  vSide = aCorner.y;
  vAlpha = aAlpha;
}`;

  const BOND_FS = `#version 300 es
precision highp float;
in float vSide;
in float vAlpha;
out vec4 outColor;
void main(){
  float a = (1.0 - abs(vSide)) * vAlpha;
  outColor = vec4(0.30, 0.92, 0.82, a);
}`;

  const PULSE_FS = `#version 300 es
precision highp float;
uniform float uPulse;
uniform vec2 uRes;
out vec4 outColor;
void main(){
  vec2 q = gl_FragCoord.xy / uRes - 0.5;
  float v = smoothstep(0.30, 0.86, length(q) * 1.4) * uPulse;
  outColor = vec4(1.0, 0.25, 0.15, v * 0.20);
}`;

  const PALETTE = [
    [0.31, 0.88, 0.75],
    [1.00, 0.77, 0.37],
    [0.39, 0.66, 1.00],
    [0.76, 0.61, 1.00],
    [1.00, 0.54, 0.48],
    [0.62, 0.88, 0.42],
    [0.37, 0.83, 0.91],
    [0.95, 0.63, 0.82]
  ];

  function ramp(t, stops) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (t <= b[0]) {
        const u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
        return [
          a[1][0] + (b[1][0] - a[1][0]) * u,
          a[1][1] + (b[1][1] - a[1][1]) * u,
          a[1][2] + (b[1][2] - a[1][2]) * u
        ];
      }
    }
    return stops[stops.length - 1][1];
  }

  const COOP_RAMP = [
    [0.0, [1.00, 0.42, 0.37]],
    [0.5, [1.00, 0.77, 0.37]],
    [1.0, [0.29, 0.88, 0.75]]
  ];
  const ADH_RAMP = [
    [0.0, [0.18, 0.42, 0.58]],
    [0.55, [0.37, 0.83, 0.91]],
    [1.0, [1.00, 0.77, 0.37]]
  ];

  function createShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
    }
    return s;
  }

  function createProgram(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, createShader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, createShader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || 'program link failed');
    }
    return p;
  }

  class Renderer {
    constructor(canvas, sim) {
      this.canvas = canvas;
      this.sim = sim;
      this.gl = canvas.getContext('webgl2', {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      if (!this.gl) throw new Error('WebGL2 desteklenmiyor. Güncel bir Chrome/Safari deneyin.');

      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cam = { x: sim.worldW / 2, y: sim.worldH / 2, zoom: 1 };
      this.fitScale = 1;
      this.colorMode = 'lineage';
      this.pointer = { down: false, moved: false, x: 0, y: 0, sx: 0, sy: 0 };
      this.hover = null;
      this.onHover = null;
      this.onSelect = null;
      this.lastTexture = -1;
      this.nutrientBytes = new Uint8Array(sim.field.gw * sim.field.gh);

      this.initGL();
      this.resize();
      this.bindEvents();
    }

    initGL() {
      const gl = this.gl;
      this.bgProg = createProgram(gl, BG_VS, BG_FS);
      this.cellProg = createProgram(gl, CELL_VS, CELL_FS);
      this.bondProg = createProgram(gl, BOND_VS, BOND_FS);
      this.pulseProg = createProgram(gl, BG_VS, PULSE_FS);

      this.bgU = {
        nutrient: gl.getUniformLocation(this.bgProg, 'uNutrient'),
        cam: gl.getUniformLocation(this.bgProg, 'uCam'),
        res: gl.getUniformLocation(this.bgProg, 'uRes'),
        world: gl.getUniformLocation(this.bgProg, 'uWorld'),
        scale: gl.getUniformLocation(this.bgProg, 'uScale'),
        pulse: gl.getUniformLocation(this.bgProg, 'uPulse')
      };
      this.cellU = {
        cam: gl.getUniformLocation(this.cellProg, 'uCam'),
        res: gl.getUniformLocation(this.cellProg, 'uRes'),
        scale: gl.getUniformLocation(this.cellProg, 'uScale'),
        glow: gl.getUniformLocation(this.cellProg, 'uGlow')
      };
      this.bondU = {
        cam: gl.getUniformLocation(this.bondProg, 'uCam'),
        res: gl.getUniformLocation(this.bondProg, 'uRes'),
        scale: gl.getUniformLocation(this.bondProg, 'uScale')
      };
      this.pulseU = {
        pulse: gl.getUniformLocation(this.pulseProg, 'uPulse'),
        res: gl.getUniformLocation(this.pulseProg, 'uRes')
      };

      // Fullscreen quad
      this.quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1, 1, 1
      ]), gl.STATIC_DRAW);

      this.fsVao = gl.createVertexArray();
      gl.bindVertexArray(this.fsVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      // Cell instances
      this.cellData = new Float32Array(CFG.maxCells * 8);
      this.cellBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cellBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.cellData.byteLength, gl.DYNAMIC_DRAW);

      this.cellVao = gl.createVertexArray();
      gl.bindVertexArray(this.cellVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cellBuf);
      const cs = 8 * 4;
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, cs, 0); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, cs, 8); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, cs, 12); gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, cs, 24); gl.vertexAttribDivisor(4, 1);
      gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.FLOAT, false, cs, 28); gl.vertexAttribDivisor(5, 1);

      // Bond instances. A toroidal bond can be split into two screen-space
      // segments, so reserve room for twice the physical bond count.
      this.bondData = new Float32Array(CFG.maxBonds * 2 * 6);
      this.bondBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bondBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.bondData.byteLength, gl.DYNAMIC_DRAW);

      this.bondVao = gl.createVertexArray();
      gl.bindVertexArray(this.bondVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bondBuf);
      const bs = 6 * 4;
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, bs, 0); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, bs, 8); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, bs, 16); gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, bs, 20); gl.vertexAttribDivisor(4, 1);

      // Nutrient texture
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.sim.field.gw, this.sim.field.gh, 0,
        gl.RED, gl.UNSIGNED_BYTE, this.nutrientBytes);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindVertexArray(null);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(2, Math.round(rect.width));
      const h = Math.max(2, Math.round(rect.height));
      const pw = Math.round(w * this.dpr);
      const ph = Math.round(h * this.dpr);
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = pw;
        this.canvas.height = ph;
      }
      this.cssW = w;
      this.cssH = h;
      this.fitScale = Math.min(w / (this.sim.worldW * 1.06), h / (this.sim.worldH * 1.06));
    }

    setColorMode(mode) { this.colorMode = mode; }

    colorForCell(i) {
      const sim = this.sim;
      const mode = this.colorMode;
      if (mode === 'cooperation') return ramp(sim.gCoop[i], COOP_RAMP);
      if (mode === 'adhesion') return ramp(sim.gAdh[i], ADH_RAMP);
      if (mode === 'soma') {
        return sim.somaState[i] ? [1.0, 0.77, 0.36] : [0.22, 0.38, 0.42];
      }
      const c = PALETTE[sim.clade[i] % PALETTE.length];
      const boost = 0.82 + 0.18 * Math.min(1, sim.energy[i] / 1.6);
      return [c[0] * boost, c[1] * boost, c[2] * boost];
    }

    resetView() {
      this.cam.x = this.sim.worldW / 2;
      this.cam.y = this.sim.worldH / 2;
      this.cam.zoom = 1;
    }

    worldFromScreen(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const mx = clientX - rect.left - rect.width / 2;
      const my = clientY - rect.top - rect.height / 2;
      const s = this.fitScale * this.cam.zoom;
      return {
        x: this.cam.x + mx / s,
        y: this.cam.y - my / s
      };
    }

    screenFromWorld(x, y) {
      const rect = this.canvas.getBoundingClientRect();
      const s = this.fitScale * this.cam.zoom;
      return {
        x: rect.left + rect.width / 2 + (x - this.cam.x) * s,
        y: rect.top + rect.height / 2 - (y - this.cam.y) * s
      };
    }

    pick(x, y) {
      const sim = this.sim;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < sim.slotCount; i++) {
        if (!sim.alive[i]) continue;
        let dx = sim.x[i] - x;
        let dy = sim.y[i] - y;
        if (dx > sim.worldW * 0.5) dx -= sim.worldW; else if (dx < -sim.worldW * 0.5) dx += sim.worldW;
        if (dy > sim.worldH * 0.5) dy -= sim.worldH; else if (dy < -sim.worldH * 0.5) dy += sim.worldH;
        const d2 = dx * dx + dy * dy;
        const r = sim.radius[i] + 5;
        if (d2 < r * r && d2 < bestD) {
          bestD = d2;
          best = i;
        }
      }
      return best;
    }

    bindEvents() {
      const c = this.canvas;
      c.addEventListener('pointerdown', (e) => {
        this.pointer.down = true;
        this.pointer.moved = false;
        this.pointer.x = e.clientX;
        this.pointer.y = e.clientY;
        this.pointer.sx = e.clientX;
        this.pointer.sy = e.clientY;
        c.setPointerCapture(e.pointerId);
      });
      c.addEventListener('pointermove', (e) => {
        if (this.pointer.down) {
          const dx = e.clientX - this.pointer.x;
          const dy = e.clientY - this.pointer.y;
          if (Math.abs(e.clientX - this.pointer.sx) + Math.abs(e.clientY - this.pointer.sy) > 3) {
            this.pointer.moved = true;
          }
          const s = this.fitScale * this.cam.zoom;
          this.cam.x -= dx / s;
          this.cam.y += dy / s;
          this.cam.x = Math.max(0, Math.min(this.sim.worldW, this.cam.x));
          this.cam.y = Math.max(0, Math.min(this.sim.worldH, this.cam.y));
          this.pointer.x = e.clientX;
          this.pointer.y = e.clientY;
          this.hover = null;
          if (this.onHover) this.onHover(null, null);
        } else {
          const w = this.worldFromScreen(e.clientX, e.clientY);
          const i = this.pick(w.x, w.y);
          this.hover = i >= 0 ? i : null;
          if (this.onHover) this.onHover(this.hover, e);
        }
      });
      c.addEventListener('pointerup', (e) => {
        if (this.pointer.down && !this.pointer.moved) {
          const w = this.worldFromScreen(e.clientX, e.clientY);
          const i = this.pick(w.x, w.y);
          if (this.onSelect) this.onSelect(i >= 0 ? i : null, e);
        }
        this.pointer.down = false;
        try { c.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
      });
      c.addEventListener('pointerleave', () => {
        this.hover = null;
        if (this.onHover) this.onHover(null, null);
      });
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const before = this.worldFromScreen(e.clientX, e.clientY);
        const factor = Math.exp(-e.deltaY * 0.0012);
        this.cam.zoom = Math.max(0.65, Math.min(7, this.cam.zoom * factor));
        const after = this.worldFromScreen(e.clientX, e.clientY);
        this.cam.x += before.x - after.x;
        this.cam.y += before.y - after.y;
        this.cam.x = Math.max(0, Math.min(this.sim.worldW, this.cam.x));
        this.cam.y = Math.max(0, Math.min(this.sim.worldH, this.cam.y));
      }, { passive: false });
      c.addEventListener('dblclick', () => this.resetView());
      window.addEventListener('resize', () => this.resize());
    }

    updateTexture(now) {
      if (now - this.lastTexture < 180) return;
      this.lastTexture = now;
      const gl = this.gl;
      const n = this.sim.field.n;
      const bytes = this.nutrientBytes;
      for (let i = 0; i < n.length; i++) bytes[i] = (n[i] * 255) | 0;
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.sim.field.gw, this.sim.field.gh,
        gl.RED, gl.UNSIGNED_BYTE, bytes);
    }

    buildCells() {
      const sim = this.sim;
      const data = this.cellData;
      let n = 0;
      for (let i = 0; i < sim.slotCount; i++) {
        if (!sim.alive[i]) continue;
        const c = this.colorForCell(i);
        const r = c[0], g = c[1], b = c[2];
        const off = n * 8;
        data[off] = sim.x[i];
        data[off + 1] = sim.y[i];
        data[off + 2] = sim.radius[i];
        data[off + 3] = r;
        data[off + 4] = g;
        data[off + 5] = b;
        data[off + 6] = sim.somaState[i] ? 1 : 0;
        data[off + 7] = Math.min(1, sim.energy[i] / 1.6);
        n++;
      }
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cellBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 8);
      return n;
    }

    buildBonds() {
      const sim = this.sim;
      const data = this.bondData;
      const W = sim.worldW;
      const H = sim.worldH;
      const limit = CFG.maxBonds * 2;
      let n = 0;

      const emit = (x1, y1, x2, y2, s) => {
        if (n >= limit) return;
        const off = n * 6;
        data[off] = x1;
        data[off + 1] = y1;
        data[off + 2] = x2;
        data[off + 3] = y2;
        data[off + 4] = 0.55 + 0.75 * s;
        data[off + 5] = 0.10 + 0.28 * s;
        n++;
      };

      const max = Math.min(sim.bondCount, CFG.maxBonds);
      for (let b = 0; b < max; b++) {
        const s = sim.bondS[b];
        if (s < 0.14) continue;

        const x1 = sim.bondX1[b];
        const y1 = sim.bondY1[b];
        const x2 = sim.bondX2[b];
        const y2 = sim.bondY2[b];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const wrapX = Math.abs(dx) > W * 0.5;
        const wrapY = Math.abs(dy) > H * 0.5;

        if (!wrapX && !wrapY) {
          emit(x1, y1, x2, y2, s);
        } else if (wrapX && wrapY) {
          // Corner wrap: skip rather than draw a line across the whole world.
          continue;
        } else if (wrapX) {
          // Split the bond at the left/right seam.
          const edge = dx > 0 ? 0 : W;
          const virtualX = dx > 0 ? x2 - W : x2 + W;
          const t = (edge - x1) / (virtualX - x1);
          const yCross = y1 + (y2 - y1) * t;
          emit(x1, y1, edge, yCross, s);
          emit(edge === 0 ? W : 0, yCross, x2, y2, s);
        } else {
          // Split the bond at the top/bottom seam.
          const edge = dy > 0 ? 0 : H;
          const virtualY = dy > 0 ? y2 - H : y2 + H;
          const t = (edge - y1) / (virtualY - y1);
          const xCross = x1 + (x2 - x1) * t;
          emit(x1, y1, xCross, edge, s);
          emit(xCross, edge === 0 ? H : 0, x2, y2, s);
        }
      }

      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bondBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 6);
      return n;
    }

    render(now) {
      const gl = this.gl;
      const sim = this.sim;
      this.resize();
      this.updateTexture(now);

      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.010, 0.020, 0.026, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const scale = this.fitScale * this.cam.zoom * this.dpr;
      const resW = this.canvas.width;
      const resH = this.canvas.height;

      // Background
      gl.disable(gl.BLEND);
      gl.useProgram(this.bgProg);
      gl.uniform2f(this.bgU.cam, this.cam.x, this.cam.y);
      gl.uniform2f(this.bgU.res, resW, resH);
      gl.uniform2f(this.bgU.world, sim.worldW, sim.worldH);
      gl.uniform1f(this.bgU.scale, scale);
      gl.uniform1f(this.bgU.pulse, sim.pulseFlash);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(this.bgU.nutrient, 0);
      gl.bindVertexArray(this.fsVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Bonds (additive)
      const bondCount = this.buildBonds();
      if (bondCount > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.useProgram(this.bondProg);
        gl.uniform2f(this.bondU.cam, this.cam.x, this.cam.y);
        gl.uniform2f(this.bondU.res, resW, resH);
        gl.uniform1f(this.bondU.scale, scale);
        gl.bindVertexArray(this.bondVao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, bondCount);
      }

      // Cells
      const count = this.buildCells();
      if (count > 0) {
        gl.useProgram(this.cellProg);
        gl.uniform2f(this.cellU.cam, this.cam.x, this.cam.y);
        gl.uniform2f(this.cellU.res, resW, resH);
        gl.uniform1f(this.cellU.scale, scale);
        gl.bindVertexArray(this.cellVao);

        // Glow pass
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.uniform1f(this.cellU.glow, 1);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);

        // Core pass
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1f(this.cellU.glow, 0);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      }

      // Pulse vignette
      if (sim.pulseFlash > 0.01) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.useProgram(this.pulseProg);
        gl.uniform1f(this.pulseU.pulse, sim.pulseFlash);
        gl.uniform2f(this.pulseU.res, resW, resH);
        gl.bindVertexArray(this.fsVao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      gl.bindVertexArray(null);
    }
  }

  global.ORIGIN_RENDERER = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
