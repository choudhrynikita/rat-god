// Post-processing pipeline (PixiJS v8). The world is rendered at an INTEGER pixel scale k into render textures, then a single
// composite pass upsamples it to the screen with sharp-bilinear filtering (crisp pixel art at any fractional zoom, smooth
// sub-pixel scrolling) and applies: per-pixel lighting from a light buffer, rim light on actors, bloom, fog & dust, colour
// grading (time of day / weather / god mood), vignette, film grain, optional CRT scanlines, chromatic aberration,
// heat haze near warm lights and lightning flashes. Quality tiers change resolution and toggle the costly passes.
import { BlurFilter, Container, Filter, GlProgram, Geometry, Mesh, RenderTexture, Shader, Sprite, Texture, type Renderer } from 'pixi.js';

const VERT = `#version 300 es
in vec2 aPosition; in vec2 aUV; out vec2 vUV;
uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
void main(){ mat3 m = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix; gl_Position = vec4((m * vec3(aPosition, 1.0)).xy, 0.0, 1.0); vUV = aUV; }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uScene; uniform sampler2D uActor; uniform sampler2D uLight; uniform sampler2D uBloom;
uniform vec2 uRT; uniform vec2 uLRT; uniform vec2 uScreen; uniform float uS; uniform vec2 uOff; uniform float uLScale;
uniform float uTime; uniform float uBloomAmt; uniform float uRim; uniform float uVig; uniform float uGrain; uniform float uCA;
uniform float uHaze; uniform float uFlash; uniform float uScan; uniform float uSat; uniform float uContrast; uniform float uLightOn;
uniform vec3 uTint; uniform vec3 uFogCol; uniform float uFog; uniform vec4 uCamW; uniform float uSurf; uniform float uDust;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 sharpUV(vec2 p){ vec2 fl = floor(p); vec2 f = fract(p); vec2 rr = vec2(0.5 - 0.5 / uS); vec2 cd = f - 0.5;
  vec2 ff = (cd - clamp(cd, -rr, rr)) * uS + 0.5; return (fl + ff) / uRT; }
void main(){
  vec2 sp = vUV * uScreen;                  // device px
  vec2 p = sp / uS + uOff;                  // scene RT px
  vec2 lp = p * uLScale / uLRT;             // light/bloom uv
  vec4 L4 = texture(uLight, lp); vec3 L = mix(vec3(1.0), L4.rgb * 2.0, uLightOn);
  float heat = clamp((L4.r - L4.b) * 2.4 - 0.25, 0.0, 1.0);
  p.x += sin(p.y * 0.35 + uTime * 6.0) * uHaze * heat * 1.2;
  vec2 uv = sharpUV(p);
  vec3 col;
  if (uCA > 0.0) { vec2 d = (vUV - 0.5) * uCA / uRT * 2.0; col = vec3(texture(uScene, uv + d).r, texture(uScene, uv).g, texture(uScene, uv - d).b); }
  else col = texture(uScene, uv).rgb;
  vec4 a = texture(uActor, uv); col = col * (1.0 - a.a) + a.rgb;
  vec3 lit = mix(vec3(0.28), L * 1.55, uLightOn);
  col *= lit;
  if (uLightOn > 0.5) {
    vec2 px = vec2(1.6) / uRT;
    float l0 = dot(texture(uScene, uv).rgb, vec3(0.3));
    float ln = dot(texture(uScene, uv + vec2(px.x, 0.0)).rgb, vec3(0.3));
    ln += dot(texture(uScene, uv - vec2(px.x, 0.0)).rgb, vec3(0.3));
    ln += dot(texture(uScene, uv + vec2(0.0, px.y)).rgb, vec3(0.3));
    ln += dot(texture(uScene, uv - vec2(0.0, px.y)).rgb, vec3(0.3));
    float ao = clamp(l0 / max(0.04, ln * 0.25), 0.35, 1.0);
    col *= mix(0.72, 1.0, ao);
  }
  col += texture(uBloom, lp).rgb * uBloomAmt * (0.65 + L * 0.8);
  if (uRim > 0.0 && a.a > 0.05) {
    vec2 e = vec2(4.0 * uLScale / uLRT.x, 0.0), f = vec2(0.0, 4.0 * uLScale / uLRT.y);
    vec2 g = vec2(dot(texture(uLight, lp + e).rgb - texture(uLight, lp - e).rgb, vec3(.33)), dot(texture(uLight, lp + f).rgb - texture(uLight, lp - f).rgb, vec3(.33)));
    float gl = length(g); vec2 dir = gl > 0.002 ? g / gl : vec2(0.0, -1.0);
    float out_ = 1.0 - texture(uActor, sharpUV(p + dir * 1.0)).a;
    col += a.a * out_ * L * uRim * (0.25 + min(gl * 30.0, 0.75)) * 0.55;
  }
  // fog & drifting dust, thicker with depth underground
  float wy = uCamW.y + (sp.y - uScreen.y * 0.5) / uCamW.z; float wx = uCamW.x + (sp.x - uScreen.x * 0.5) / uCamW.z;
  float depth = clamp((wy - uSurf) / 2200.0, 0.0, 1.0);
  float dust = 0.6 + 0.4 * sin(wx * 0.013 + uTime * 0.4 + sin(wy * 0.017 - uTime * 0.3) * 2.0);
  float fg = uFog * (wy < uSurf ? 0.6 : 0.25 + 0.75 * depth) * dust;
  col = mix(col, uFogCol * (L * 0.5 + 0.25), clamp(fg, 0.0, 0.85));
  float mote = step(0.9994, hash(floor(vec2(wx + uTime * 2.0, wy + uTime * 4.0)))) * uDust * (wy > uSurf ? 1.0 : 0.3);
  col += mote * L * 0.3;
  // grade
  col *= uTint; float lum = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(lum), col, uSat); col = (col - 0.5) * uContrast + 0.5;
  col += uFlash * vec3(0.75, 0.82, 1.0) * (wy < uSurf + 300.0 ? 1.0 : 0.25);
  float vd = length((vUV - 0.5) * vec2(uScreen.x / uScreen.y, 1.0)); col *= 1.0 - uVig * smoothstep(0.35, 0.95, vd);
  col += (hash(sp + fract(uTime) * 91.0) - 0.5) * uGrain;
  if (uScan > 0.0) col *= 1.0 - uScan * 0.35 * (0.5 + 0.5 * cos(sp.y * 3.14159));
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const THRESH = `#version 300 es
precision highp float;
in vec2 vTextureCoord; out vec4 fragColor; uniform sampler2D uTexture; uniform float uThr;
void main(){ vec4 c = texture(uTexture, vTextureCoord); float l = max(c.r, max(c.g, c.b)); fragColor = vec4(c.rgb * smoothstep(uThr, uThr + 0.2, l), 1.0); }`;
const FVERT = `#version 300 es
in vec2 aPosition; out vec2 vTextureCoord; uniform vec4 uInputSize; uniform vec4 uOutputFrame; uniform vec4 uOutputTexture;
void main(){ vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy; position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z; gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw); }`;

export type Tier = 'high' | 'mid' | 'low';
export interface PostToggles { lighting: boolean; bloom: boolean; rim: boolean; grade: boolean; vignette: boolean; grain: boolean; crt: boolean; ca: boolean; haze: boolean; fog: boolean }
export interface PostEnv { tint: [number, number, number]; sat: number; contrast: number; fog: number; fogCol: [number, number, number]; flash: number; haze: number; ambient: [number, number, number]; dust: number }

export class Post {
  tier: Tier = 'high'; auto = true;
  toggles: PostToggles = { lighting: true, bloom: true, rim: true, grade: true, vignette: true, grain: true, crt: false, ca: true, haze: true, fog: true };
  readonly sceneRoot = new Container({ label: 'scene' });   // world-space, not on stage
  readonly actorRoot = new Container({ label: 'actors' });
  readonly lightRoot = new Container({ label: 'lights' });
  private sceneHold = new Container(); private actorHold = new Container(); private lightHold = new Container();
  private sceneRT!: RenderTexture; private actorRT!: RenderTexture; private lightRT!: RenderTexture; private bloomRT!: RenderTexture;
  private bloomSprite = new Sprite(); private bloomHold = new Container();
  private thr: Filter; private blur: BlurFilter;
  readonly quad: Mesh<Geometry, Shader>; private U: any;
  private alloc = { w: 0, h: 0, lw: 0, lh: 0 };
  /** current integer scale (k) and screen upscale (s) */
  k = 1; s = 1; lod = false;
  private ft: number[] = []; private tierDropAt = 0;
  constructor(private renderer: Renderer) {
    this.sceneHold.addChild(this.sceneRoot); this.actorHold.addChild(this.actorRoot); this.lightHold.addChild(this.lightRoot);
    this.thr = new Filter({ glProgram: GlProgram.from({ vertex: FVERT, fragment: THRESH, name: 'rg-threshold' }), resources: { tu: { uThr: { value: 0.45, type: 'f32' } } } });
    this.blur = new BlurFilter({ strength: 10, quality: 2 });
    this.bloomSprite.filters = [this.thr, this.blur]; this.bloomHold.addChild(this.bloomSprite);
    const geometry = new Geometry({ attributes: { aPosition: [0, 0, 1, 0, 1, 1, 0, 1], aUV: [0, 0, 1, 0, 1, 1, 0, 1] }, indexBuffer: [0, 1, 2, 0, 2, 3] });
    this.alloc0();
    const f = (v = 0) => ({ value: v, type: 'f32' as const }); const v2 = (a = 0, b = 0) => ({ value: new Float32Array([a, b]), type: 'vec2<f32>' as const });
    const v3 = (a = 1, b = 1, c = 1) => ({ value: new Float32Array([a, b, c]), type: 'vec3<f32>' as const });
    const shader = Shader.from({ gl: { vertex: VERT, fragment: FRAG, name: 'rg-composite' }, resources: {
      uScene: this.sceneRT.source, uActor: this.actorRT.source, uLight: this.lightRT.source, uBloom: this.bloomRT.source,
      cu: { uRT: v2(), uLRT: v2(), uScreen: v2(), uS: f(1), uOff: v2(), uLScale: f(0.25), uTime: f(), uBloomAmt: f(0.6), uRim: f(1), uVig: f(0.35), uGrain: f(0.035),
        uCA: f(0.6), uHaze: f(1), uFlash: f(), uScan: f(), uSat: f(1), uContrast: f(1), uLightOn: f(1), uTint: v3(), uFogCol: v3(0.3, 0.27, 0.3), uFog: f(0.1),
        uCamW: { value: new Float32Array(4), type: 'vec4<f32>' }, uSurf: f(0), uDust: f(1) },
    } });
    this.U = (shader.resources as any).cu.uniforms;
    this.quad = new Mesh({ geometry, shader });
  }
  private alloc0() {
    const mk = (w: number, h: number, lin: boolean) => { const t = RenderTexture.create({ width: w, height: h, resolution: 1, scaleMode: lin ? 'linear' : 'nearest' }); return t; };
    this.sceneRT = mk(64, 64, true); this.actorRT = mk(64, 64, true); this.lightRT = mk(16, 16, true); this.bloomRT = mk(16, 16, true);
  }
  /** (re)size buffers for a device-pixel viewport */
  resize(devW: number, devH: number) {
    const w = Math.ceil(devW) + 12, h = Math.ceil(devH) + 12; const lw = Math.ceil(w / 4) + 4, lh = Math.ceil(h / 4) + 4;
    if (w === this.alloc.w && h === this.alloc.h) return; this.alloc = { w, h, lw, lh };
    this.sceneRT.resize(w, h); this.actorRT.resize(w, h); this.lightRT.resize(lw, lh); this.bloomRT.resize(lw, lh);
  }
  /** render everything. cam: world x,y at the screen centre; zd: device px per world px; shake in device px */
  render(cam: { x: number; y: number; zd: number; shakeX: number; shakeY: number }, devW: number, devH: number, cssW: number, cssH: number, env: PostEnv, surfY: number, timeS: number, fast = false) {
    const r = this.renderer; this.resize(devW, devH);
    const zd = cam.zd; this.lod = zd < 1; const k = zd >= 1 ? Math.min(Math.floor(zd), 4) : zd; const s = zd / k; this.k = k; this.s = s;
    const PAD = 4; const ox = cam.x * k - devW / s / 2, oy = cam.y * k - devH / s / 2; const ix = Math.floor(ox), iy = Math.floor(oy);
    for (const c of [this.sceneRoot, this.actorRoot]) { c.scale.set(k); c.position.set(-(ix - PAD), -(iy - PAD)); }
    const LS = 0.25; this.lightRoot.scale.set(k * LS); this.lightRoot.position.set(-(ix - PAD) * LS, -(iy - PAD) * LS);
    const T = this.toggles; const amb = env.ambient;
    r.render({ container: this.sceneHold, target: this.sceneRT, clear: true, clearColor: [0.03, 0.04, 0.04, 1] });
    r.render({ container: this.actorHold, target: this.actorRT, clear: true, clearColor: [0, 0, 0, 0] });
    if (T.lighting) r.render({ container: this.lightHold, target: this.lightRT, clear: true, clearColor: [amb[0] * 0.35, amb[1] * 0.32, amb[2] * 0.38, 0] });
    const bloomOn = T.bloom && this.tier !== 'low' && !fast;
    if (bloomOn) { this.bloomSprite.texture = this.sceneRT; this.bloomSprite.scale.set(LS); this.blur.quality = this.tier === 'high' ? 2 : 1; r.render({ container: this.bloomHold, target: this.bloomRT, clear: true, clearColor: [0, 0, 0, 1] }); }
    const U = this.U;
    U.uRT[0] = this.alloc.w; U.uRT[1] = this.alloc.h; U.uLRT[0] = this.alloc.lw; U.uLRT[1] = this.alloc.lh; U.uScreen[0] = devW; U.uScreen[1] = devH;
    U.uS = s; U.uOff[0] = ox - ix + PAD + cam.shakeX / s; U.uOff[1] = oy - iy + PAD + cam.shakeY / s; U.uLScale = LS; U.uTime = timeS;
    U.uBloomAmt = bloomOn ? 1.15 : 0; U.uRim = T.rim && this.tier === 'high' && T.lighting ? 1.4 : 0; U.uLightOn = T.lighting ? 1 : 0;
    U.uVig = T.vignette ? 0.62 : 0; U.uGrain = T.grain && this.tier !== 'low' ? 0.055 : 0; U.uCA = T.ca && this.tier === 'high' ? 1.6 : 0; U.uHaze = T.haze ? env.haze * 1.4 : 0;
    U.uScan = T.crt ? 1 : 0; U.uFlash = env.flash;
    const g = T.grade; U.uTint[0] = g ? env.tint[0] : 1; U.uTint[1] = g ? env.tint[1] : 1; U.uTint[2] = g ? env.tint[2] : 1; U.uSat = g ? env.sat : 1; U.uContrast = g ? env.contrast : 1;
    U.uFog = T.fog ? env.fog : 0; U.uFogCol[0] = env.fogCol[0]; U.uFogCol[1] = env.fogCol[1]; U.uFogCol[2] = env.fogCol[2]; U.uDust = T.fog ? env.dust : 0;
    U.uCamW[0] = cam.x; U.uCamW[1] = cam.y; U.uCamW[2] = zd; U.uSurf = surfY;
    this.quad.scale.set(cssW, cssH);
    r.render({ container: this.quad, clear: true });
  }
  /** feed frame times; drops the quality tier when the phone can't keep up. Returns a new resolution multiplier or 0 */
  sample(dtMs: number): Tier | null {
    if (!this.auto) return null; this.ft.push(dtMs); if (this.ft.length < 90) return null;
    const avg = this.ft.reduce((a, b) => a + b, 0) / this.ft.length; this.ft.length = 0;
    const now = performance.now(); if (now - this.tierDropAt < 3000) return null;
    if (avg > 20 && this.tier !== 'low') { this.tier = this.tier === 'high' ? 'mid' : 'low'; this.tierDropAt = now; return this.tier; }
    return null;
  }
  setTier(t: Tier) { this.tier = t; this.ft.length = 0; }
  static resFor(tier: Tier) { const d = window.devicePixelRatio || 1; return tier === 'high' ? Math.min(d, 2) : tier === 'mid' ? Math.min(d, 1.5) : 1; }
}
/** soft radial light texture (shared) */
let _lightTex: Texture | null = null;
export function lightTexture(): Texture {
  if (_lightTex) return _lightTex; const S = 128; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S); _lightTex = Texture.from(c); return _lightTex;
}
