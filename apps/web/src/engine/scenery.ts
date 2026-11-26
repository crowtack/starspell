/* =========================================================================
   3. FULLSCREEN WILDERNESS CANYON SCENERY ENGINE (SunsetSceneryEngine)
   ========================================================================= */

type RgbTuple = [number, number, number];

interface StarSpec {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  color: string;
  sparkle: boolean;
}

interface CirrusSpec {
  x: number;
  y: number;
  w: number;
  speed: number;
}

interface CloudBankSpec {
  x: number;
  y: number;
  scale: number;
  puffs: number;
  speed: number;
  seed: number;
}

interface BirdSpec {
  x: number;
  y: number;
  wingPhase: number;
  scale: number;
  driftX: number;
}

interface ParticleSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

interface AshFlakeSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

interface ShootingStarSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface LightningSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
}

interface PulseRing {
  progress: number;
  maxRadius: number;
}

export interface SunsetSceneryOptions {
  initialEnvIndex?: number;
  initialReducedMotion?: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerpRGB(c1: RgbTuple, c2: RgbTuple, t: number): RgbTuple {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

function mix3Color(c0: RgbTuple, c1: RgbTuple, c2: RgbTuple, env: number): RgbTuple {
  if (env <= 1.0) return lerpRGB(c0, c1, clamp(env, 0, 1));
  return lerpRGB(c1, c2, clamp(env - 1.0, 0, 1));
}

function rgbStr(c: RgbTuple, a = 1): string {
  if (a >= 0.999) return `rgb(${String(c[0])},${String(c[1])},${String(c[2])})`;
  return `rgba(${String(c[0])},${String(c[1])},${String(c[2])},${a.toFixed(3)})`;
}

export class SunsetSceneryEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  dpr: number;

  envProgress: number;
  targetEnvProgress: number;

  pointerX: number;
  pointerY: number;
  smoothX: number;
  smoothY: number;
  reducedMotion: boolean;

  time: number;
  lastFrameTime: number;

  lightningFlash: number;
  lightningTimer: number;
  lightningSegments: LightningSegment[];

  shootingStars: ShootingStarSpec[];
  shootTimer: number;

  pulseRings: PulseRing[];

  stars: StarSpec[];
  cirrus: CirrusSpec[];
  cloudBanks: CloudBankSpec[];
  birds: BirdSpec[];
  particles: ParticleSpec[];
  ashFlakes: AshFlakeSpec[];

  private readonly handleResize: () => void;
  private readonly handlePointerMove: (e: PointerEvent) => void;

  constructor(canvas: HTMLCanvasElement, options: SunsetSceneryOptions = {}) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
    this.w = 1280;
    this.h = 720;
    this.dpr = 1;

    this.envProgress = options.initialEnvIndex ?? 0.0;
    this.targetEnvProgress = this.envProgress;

    this.pointerX = 0;
    this.pointerY = 0;
    this.smoothX = 0;
    this.smoothY = 0;
    this.reducedMotion = Boolean(options.initialReducedMotion);

    this.time = 0;
    this.lastFrameTime = performance.now();

    // Lightning state (Hard mode)
    this.lightningFlash = 0;
    this.lightningTimer = 4.5;
    this.lightningSegments = [];

    // Shooting stars (Intermediate)
    this.shootingStars = [];
    this.shootTimer = 3.2;

    // Interactive horizon pulse rings
    this.pulseRings = [];

    // Deterministic 165 stars
    const starColors = ['#fffbeb', '#e0e7ff', '#fef3c7', '#c7d2fe'];
    this.stars = Array.from({ length: 165 }, (_, i) => {
      const s1 = Math.sin(i * 12.9898 + 1.23) * 43758.5453;
      const s2 = Math.sin(i * 78.233 + 4.56) * 43758.5453;
      const s3 = Math.sin(i * 45.164 + 7.89) * 43758.5453;
      const r1 = s1 - Math.floor(s1);
      const r2 = s2 - Math.floor(s2);
      const r3 = s3 - Math.floor(s3);
      return {
        x: r1,
        y: r2 * 0.62,
        size: 0.7 + r3 * 1.45,
        phase: r1 * Math.PI * 2,
        speed: 1.1 + r2 * 2.2,
        color: starColors[i % starColors.length] ?? '#fffbeb',
        sparkle: i % 11 === 0,
      };
    });

    // 5 High-altitude cirrus wisps
    this.cirrus = Array.from({ length: 5 }, (_, i) => ({
      x: (i * 0.22 + 0.08) % 1.1,
      y: 0.09 + (i % 3) * 0.055,
      w: 0.18 + (i % 2) * 0.09,
      speed: 0.002 + i * 0.0004,
    }));

    // 6 Multi-puff 3D cloud banks
    this.cloudBanks = [
      { x: 0.13, y: 0.19, scale: 1.05, puffs: 7, speed: 0.0024, seed: 1.1 },
      { x: 0.36, y: 0.13, scale: 0.85, puffs: 6, speed: 0.0018, seed: 2.3 },
      { x: 0.56, y: 0.16, scale: 0.95, puffs: 8, speed: 0.0021, seed: 3.7 },
      { x: 0.84, y: 0.2, scale: 1.12, puffs: 9, speed: 0.0026, seed: 4.9 },
      { x: 0.24, y: 0.28, scale: 0.78, puffs: 6, speed: 0.0015, seed: 5.5 },
      { x: 0.73, y: 0.27, scale: 0.82, puffs: 7, speed: 0.0019, seed: 6.8 },
    ];

    // 6 Gliding birds (Easy)
    this.birds = Array.from({ length: 6 }, (_, i) => ({
      x: 0.63 + i * 0.032,
      y: 0.21 + (i % 3) * 0.025,
      wingPhase: i * 1.15,
      scale: 0.78 + (i % 3) * 0.16,
      driftX: 0.004 + (i % 2) * 0.002,
    }));

    // 78 Drifting stage particles (pollen / fireflies / embers)
    this.particles = Array.from({ length: 78 }, () => ({
      x: Math.random(),
      y: 0.35 + Math.random() * 0.65,
      vx: (Math.random() - 0.5) * 0.012,
      vy: -(0.008 + Math.random() * 0.022),
      size: 1.3 + Math.random() * 2.6,
      phase: Math.random() * Math.PI * 2,
    }));

    // 28 Volcanic ash flakes (Hard)
    this.ashFlakes = Array.from({ length: 28 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: -0.006 + Math.random() * 0.012,
      vy: 0.009 + Math.random() * 0.015,
      size: 1.4 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2,
    }));

    this.handleResize = () => {
      this.resize();
    };
    this.handlePointerMove = (e: PointerEvent) => {
      if (this.reducedMotion) return;
      this.pointerX = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      this.pointerY = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    };

    this.resize();
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('pointermove', this.handlePointerMove);
  }

  destroy(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointermove', this.handlePointerMove);
  }

  setTargetEnv(val: number): void {
    this.targetEnvProgress = val;
  }

  setReducedMotion(val: boolean): void {
    this.reducedMotion = val;
    if (this.reducedMotion) {
      this.pointerX = 0;
      this.pointerY = 0;
      this.lightningFlash = 0;
    }
  }

  emitPulseRing(): void {
    if (this.reducedMotion) return;
    this.pulseRings.push({
      progress: 0,
      maxRadius: Math.max(this.w, this.h) * 0.55,
    });
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  triggerLightning(): void {
    if (this.reducedMotion) return;
    this.lightningFlash = 1.0;
    const startX = this.w * (0.76 + Math.random() * 0.16);
    const startY = this.h * 0.04;
    const segs: LightningSegment[] = [];
    let cx = startX;
    let cy = startY;
    const steps = 9;
    for (let i = 0; i < steps; i++) {
      const nx = cx + (Math.random() - 0.54) * (this.w * 0.045);
      const ny = cy + this.h * 0.046 + Math.random() * 14;
      segs.push({ x1: cx, y1: cy, x2: nx, y2: ny, w: 2.6 - i * 0.18 });
      if (i === 2 || i === 5) {
        let fx = nx;
        let fy = ny;
        for (let j = 0; j < 3; j++) {
          const fnx = fx + (Math.random() > 0.45 ? 1 : -1) * (16 + Math.random() * 24);
          const fny = fy + 18 + Math.random() * 22;
          segs.push({ x1: fx, y1: fy, x2: fnx, y2: fny, w: 1.2 - j * 0.25 });
          fx = fnx;
          fy = fny;
        }
      }
      cx = nx;
      cy = ny;
    }
    this.lightningSegments = segs;
  }

  update(dt: number): void {
    const motionScale = this.reducedMotion ? 0.15 : 1.0;
    this.time += dt * motionScale;

    // Smooth bidirectional envProgress morph
    const diff = this.targetEnvProgress - this.envProgress;
    if (Math.abs(diff) > 0.0005) {
      this.envProgress += diff * Math.min(1, dt * 2.6);
    } else {
      this.envProgress = this.targetEnvProgress;
    }

    // Smooth cursor parallax
    const pxTarget = this.reducedMotion ? 0 : this.pointerX;
    const pyTarget = this.reducedMotion ? 0 : this.pointerY;
    this.smoothX += (pxTarget - this.smoothX) * Math.min(1, dt * 4.5);
    this.smoothY += (pyTarget - this.smoothY) * Math.min(1, dt * 4.5);

    // Cirrus & clouds drift
    for (const c of this.cirrus) {
      c.x = (c.x + c.speed * dt * motionScale) % 1.25;
    }
    for (const b of this.cloudBanks) {
      b.x += b.speed * dt * motionScale;
      if (b.x > 1.18) b.x = -0.18;
    }

    // Birds (Easy)
    for (const bird of this.birds) {
      bird.x += bird.driftX * dt * motionScale;
      bird.wingPhase += dt * 4.8 * motionScale;
      if (bird.x > 1.08) bird.x = -0.08;
    }

    // Shooting stars (Intermediate)
    const interWeight = clamp(1 - Math.abs(this.envProgress - 1.0), 0, 1);
    if (interWeight > 0.3 && !this.reducedMotion) {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = 2.6 + Math.random() * 4.2;
        this.shootingStars.push({
          x: 0.15 + Math.random() * 0.55,
          y: 0.06 + Math.random() * 0.18,
          vx: 0.24 + Math.random() * 0.15,
          vy: 0.08 + Math.random() * 0.07,
          life: 0,
          maxLife: 0.85,
        });
      }
    }
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const s = this.shootingStars[i];
      if (!s) continue;
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life >= s.maxLife) this.shootingStars.splice(i, 1);
    }

    // Hard mode lightning
    const hardWeight = clamp(this.envProgress - 1.0, 0, 1);
    if (hardWeight > 0.35 && !this.reducedMotion) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 3.2 + Math.random() * 5.0;
        this.triggerLightning();
      }
    }
    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.4);
    }

    // Particles
    for (const p of this.particles) {
      p.x += (p.vx + Math.sin(this.time * 1.4 + p.phase) * 0.005) * dt * motionScale;
      p.y += p.vy * dt * motionScale;
      if (p.y < 0.22) {
        p.y = 1.02;
        p.x = Math.random();
      }
      if (p.x < -0.02) p.x = 1.02;
      if (p.x > 1.02) p.x = -0.02;
    }

    // Volcanic ash (Hard)
    for (const a of this.ashFlakes) {
      a.x += (a.vx + Math.sin(this.time + a.phase) * 0.006) * dt * motionScale;
      a.y += a.vy * dt * motionScale;
      if (a.y > 1.04) {
        a.y = -0.04;
        a.x = Math.random();
      }
    }

    // Interactive pulse rings
    for (let i = this.pulseRings.length - 1; i >= 0; i--) {
      const ring = this.pulseRings[i];
      if (!ring) continue;
      ring.progress += dt * 0.95;
      if (ring.progress >= 1) this.pulseRings.splice(i, 1);
    }
  }

  render(): void {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const env = this.envProgress;

    const easyW = clamp(1 - env, 0, 1);
    const interW = clamp(1 - Math.abs(env - 1.0), 0, 1);
    const hardW = clamp(env - 1.0, 0, 1);
    const flash = this.lightningFlash * hardW;

    // Parallax offsets per depth
    const pxSky = this.smoothX * 6;
    const pySky = this.smoothY * 4;
    const pxFar = this.smoothX * 14;
    const pyFar = this.smoothY * 8;
    const pxMid = this.smoothX * 26;
    const pyMid = this.smoothY * 14;
    const pxNear = this.smoothX * 40;
    const pyNear = this.smoothY * 20;
    const pxFg = this.smoothX * 58;
    const pyFg = this.smoothY * 26;

    /* ---------- LAYER 1: SKY GRADIENT, STARS & CELESTIAL BODIES ---------- */
    const skyTop = mix3Color([252, 224, 186], [14, 21, 56], [24, 9, 18], env);
    const skyMid = mix3Color([251, 175, 114], [43, 47, 108], [76, 17, 36], env);
    const skyLow = mix3Color([251, 146, 60], [107, 79, 145], [164, 42, 46], env);
    const skyHor = mix3Color([254, 226, 146], [173, 128, 188], [234, 88, 36], env);

    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.75);
    skyGrad.addColorStop(0.0, rgbStr(skyTop));
    skyGrad.addColorStop(0.38, rgbStr(skyMid));
    skyGrad.addColorStop(0.72, rgbStr(skyLow));
    skyGrad.addColorStop(1.0, rgbStr(skyHor));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    if (flash > 0.02) {
      ctx.fillStyle = `rgba(255, 228, 220, ${(flash * 0.16).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h * 0.7);
    }

    // 165 Deterministic Stars
    const starVisibility = easyW * 0.16 + interW * 0.95 + hardW * 0.42;
    if (starVisibility > 0.02) {
      for (const st of this.stars) {
        const sx = st.x * w + pxSky * 0.5;
        const sy = st.y * h + pySky * 0.5;
        const twinkle = 0.45 + 0.55 * Math.sin(this.time * st.speed + st.phase);
        const alpha = clamp(starVisibility * twinkle, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.arc(sx, sy, st.size, 0, Math.PI * 2);
        ctx.fill();
        if (st.sparkle && interW > 0.25) {
          const sp = st.size * 2.9 * twinkle;
          ctx.strokeStyle = st.color;
          ctx.lineWidth = 0.85;
          ctx.beginPath();
          ctx.moveTo(sx - sp, sy);
          ctx.lineTo(sx + sp, sy);
          ctx.moveTo(sx, sy - sp);
          ctx.lineTo(sx, sy + sp);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Shooting stars (Intermediate)
    if (interW > 0.2) {
      for (const s of this.shootingStars) {
        const p = s.life / s.maxLife;
        const alpha = Math.sin(p * Math.PI) * interW;
        const hx = s.x * w + pxSky;
        const hy = s.y * h + pySky;
        const tx = hx - s.vx * w * 0.14;
        const ty = hy - s.vy * h * 0.14;
        const g = ctx.createLinearGradient(tx, ty, hx, hy);
        g.addColorStop(0, 'rgba(224,231,255,0)');
        g.addColorStop(1, `rgba(255,255,255,${alpha.toFixed(3)})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();
      }
    }

    // Easy Celestial: Low Sun in Central Saddle + Rotating Crepuscular Rays + Tiny Upper-Left Moon + Birds
    if (easyW > 0.01) {
      const sunX = w * 0.5 + pxSky;
      const sunY = h * 0.49 + pySky;
      const sunR = Math.min(w, h) * 0.082;

      ctx.save();
      ctx.globalAlpha = easyW;

      // Volumetric rotating crepuscular light shafts
      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.rotate(this.time * 0.04);
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        ctx.save();
        ctx.rotate(ang);
        const rayGrad = ctx.createLinearGradient(0, 0, 0, -Math.max(w, h) * 0.65);
        rayGrad.addColorStop(0, 'rgba(254, 240, 175, 0.16)');
        rayGrad.addColorStop(1, 'rgba(254, 240, 175, 0)');
        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(-sunR * 0.35, 0);
        ctx.lineTo(-sunR * 2.2, -Math.max(w, h) * 0.65);
        ctx.lineTo(sunR * 2.2, -Math.max(w, h) * 0.65);
        ctx.lineTo(sunR * 0.35, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // Multi-ring halo
      const halo = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, sunR * 4.2);
      halo.addColorStop(0, 'rgba(255, 250, 215, 0.72)');
      halo.addColorStop(0.35, 'rgba(253, 210, 118, 0.32)');
      halo.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR * 4.2, 0, Math.PI * 2);
      ctx.fill();

      // Sun disc
      ctx.fillStyle = '#fff9d6';
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.fill();

      // Tiny delicate crescent moon in upper-left sky
      const tmX = w * 0.18 + pxSky;
      const tmY = h * 0.14 + pySky;
      ctx.fillStyle = 'rgba(255, 250, 232, 0.65)';
      ctx.beginPath();
      ctx.arc(tmX, tmY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgbStr(skyTop);
      ctx.beginPath();
      ctx.arc(tmX + 4.5, tmY - 2, 9.2, 0, Math.PI * 2);
      ctx.fill();

      // 6 Silhouetted Canyon Birds
      ctx.strokeStyle = 'rgba(78, 34, 34, 0.78)';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      for (const b of this.birds) {
        const bx = b.x * w + pxFar * 0.7;
        const by = b.y * h + pyFar * 0.7;
        const flap = Math.sin(b.wingPhase) * 4.5 * b.scale;
        const span = 9 * b.scale;
        ctx.beginPath();
        ctx.moveTo(bx - span, by - flap);
        ctx.quadraticCurveTo(bx - span * 0.45, by - 4 * b.scale, bx, by);
        ctx.quadraticCurveTo(bx + span * 0.45, by - 4 * b.scale, bx + span, by - flap);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Intermediate Celestial: Crisp Silver-White Crescent Moon in Upper-Right Sky
    if (interW > 0.01) {
      ctx.save();
      ctx.globalAlpha = interW;
      const mx = w * 0.79 + pxSky;
      const my = h * 0.16 + pySky;
      const mr = Math.min(w, h) * 0.042;
      const mGlow = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 4.5);
      mGlow.addColorStop(0, 'rgba(219, 234, 254, 0.5)');
      mGlow.addColorStop(0.45, 'rgba(165, 180, 252, 0.18)');
      mGlow.addColorStop(1, 'rgba(129, 140, 248, 0)');
      ctx.fillStyle = mGlow;
      ctx.beginPath();
      ctx.arc(mx, my, mr * 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgbStr(skyTop);
      ctx.beginPath();
      ctx.arc(mx - mr * 0.42, my - mr * 0.24, mr * 0.88, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Hard Celestial: Total Eclipse above Valley Saddle + Branched Right Lightning
    if (hardW > 0.01) {
      ctx.save();
      ctx.globalAlpha = hardW;
      const ex = w * 0.5 + pxSky;
      const ey = h * 0.34 + pySky;
      const er = Math.min(w, h) * 0.072;

      // Radiating fiery atmospheric halo
      const eHalo = ctx.createRadialGradient(ex, ey, er * 0.9, ex, ey, er * 4.4);
      eHalo.addColorStop(0, 'rgba(255, 148, 56, 0.95)');
      eHalo.addColorStop(0.18, 'rgba(244, 63, 94, 0.62)');
      eHalo.addColorStop(0.55, 'rgba(159, 18, 57, 0.18)');
      eHalo.addColorStop(1, 'rgba(40, 8, 18, 0)');
      ctx.fillStyle = eHalo;
      ctx.beginPath();
      ctx.arc(ex, ey, er * 4.4, 0, Math.PI * 2);
      ctx.fill();

      // Blazing corona ring
      ctx.strokeStyle = '#ffedd5';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(ex, ey, er * 1.03, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Dark crimson-black eclipse disc
      const discGrad = ctx.createRadialGradient(ex, ey, er * 0.1, ex, ey, er);
      discGrad.addColorStop(0, '#0c0408');
      discGrad.addColorStop(0.85, '#19060d');
      discGrad.addColorStop(1, '#4c0d1b');
      ctx.fillStyle = discGrad;
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();

      // Branched Storm Lightning on far-right sky
      if (flash > 0.03 && this.lightningSegments.length > 0) {
        ctx.save();
        ctx.globalAlpha = clamp(flash * 1.2, 0, 1);
        ctx.strokeStyle = '#ffe4e6';
        ctx.shadowColor = '#fb7185';
        ctx.shadowBlur = 18;
        ctx.lineCap = 'round';
        for (const seg of this.lightningSegments) {
          ctx.lineWidth = seg.w;
          ctx.beginPath();
          ctx.moveTo(seg.x1 + pxSky, seg.y1 + pySky);
          ctx.lineTo(seg.x2 + pxSky, seg.y2 + pySky);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    }

    /* ---------- LAYER 2: SCULPTED PAINTERLY CLOUDS ---------- */
    this.renderClouds(ctx, w, h, env, pxSky, pySky, flash);

    /* ---------- LAYER 3: FACETED ALPINE MOUNTAIN RANGES ---------- */
    this.renderMountainRanges(ctx, w, h, env, pxFar, pyFar, pxMid, pyMid, pxNear, pyNear, flash);

    /* ---------- LAYER 4: FORESTED VALLEY, RIVER & CAMPFIRE SMOKE ---------- */
    this.renderForestedValley(ctx, w, h, env, pxNear, pyNear, pxFg, pyFg);

    /* ---------- LAYER 5: FOREGROUND CANYON OVERLOOK & STORYTELLING ---------- */
    this.renderForegroundOverlook(ctx, w, h, env, pxFg, pyFg);

    /* ---------- LAYER 6: AMBIENT PARTICLES & INTERACTIVE PULSES ---------- */
    this.renderParticlesAndPulses(ctx, w, h, env, pxFg, pyFg);
  }

  renderClouds(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    env: number,
    px: number,
    py: number,
    flash: number,
  ): void {
    // 5 High-altitude wispy cirrus streaks
    const cirrusCol = mix3Color([255, 237, 213], [165, 180, 252], [190, 88, 102], env);
    ctx.save();
    for (const c of this.cirrus) {
      const cx = ((c.x * w) % (w * 1.2)) - w * 0.1 + px * 0.6;
      const cy = c.y * h + py * 0.6;
      const cw = c.w * w;
      const g = ctx.createLinearGradient(cx - cw * 0.5, cy, cx + cw * 0.5, cy);
      g.addColorStop(0, rgbStr(cirrusCol, 0));
      g.addColorStop(0.5, rgbStr(cirrusCol, 0.22));
      g.addColorStop(1, rgbStr(cirrusCol, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw * 0.5, 5.5, -0.04, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 6 Sculpted Multi-Puff 3D Cloud Banks
    const bankTop = mix3Color([255, 241, 214], [118, 114, 186], [78, 30, 48], env);
    const bankBot = mix3Color([244, 152, 108], [46, 44, 96], [28, 11, 22], env);
    const rimCol = mix3Color([255, 249, 219], [224, 231, 255], [251, 146, 60], env);

    for (const bank of this.cloudBanks) {
      const bx = bank.x * w + px;
      const by = bank.y * h + py;
      const baseR = 26 * bank.scale * Math.min(1.25, w / 1000 + 0.35);

      ctx.save();
      const rightSideBoost = bank.x > 0.5 ? flash * 0.55 : flash * 0.15;

      for (let i = 0; i < bank.puffs; i++) {
        const norm = i / (bank.puffs - 1) - 0.5;
        const pxOff = norm * baseR * 4.4;
        const pyOff = Math.abs(norm) * baseR * 0.72 - Math.sin(i * 1.7 + bank.seed) * baseR * 0.28;
        const r = baseR * (1.08 - Math.abs(norm) * 0.65);

        const rimShiftX = bank.x < 0.5 ? 2.5 : -2.5;
        ctx.fillStyle = rgbStr(rimCol, 0.38 + rightSideBoost);
        ctx.beginPath();
        ctx.arc(bx + pxOff + rimShiftX, by + pyOff - 2.2, r * 1.02, 0, Math.PI * 2);
        ctx.fill();

        const cg = ctx.createLinearGradient(0, by + pyOff - r, 0, by + pyOff + r);
        cg.addColorStop(0, rgbStr(bankTop, 0.88));
        cg.addColorStop(1, rgbStr(bankBot, 0.86));
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(bx + pxOff, by + pyOff, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  renderMistRibbon(
    ctx: CanvasRenderingContext2D,
    w: number,
    yBase: number,
    height: number,
    color: RgbTuple,
    alpha: number,
    speedOffset: number,
  ): void {
    const g = ctx.createLinearGradient(0, yBase - height, 0, yBase + height);
    g.addColorStop(0, rgbStr(color, 0));
    g.addColorStop(0.5, rgbStr(color, alpha));
    g.addColorStop(1, rgbStr(color, 0));
    ctx.fillStyle = g;
    const shift = Math.sin(this.time * 0.25 + speedOffset) * 28;
    ctx.beginPath();
    ctx.moveTo(-40, yBase + height);
    for (let x = -40; x <= w + 40; x += 80) {
      const wave = Math.sin(x * 0.005 + this.time * 0.3 + speedOffset) * (height * 0.38);
      ctx.lineTo(x + shift, yBase - height * 0.35 + wave);
    }
    ctx.lineTo(w + 40, yBase + height);
    ctx.closePath();
    ctx.fill();
  }

  renderMountainRanges(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    env: number,
    pxFar: number,
    pyFar: number,
    pxMid: number,
    pyMid: number,
    pxNear: number,
    pyNear: number,
    flash: number,
  ): void {
    const mistCol = mix3Color([254, 215, 170], [138, 132, 198], [160, 52, 58], env);

    /* --- 1. FAR MISTY ALPINE RANGE (pxFar) --- */
    const farLit = mix3Color([232, 152, 108], [72, 74, 134], [92, 28, 42], env);
    const farShad = mix3Color([194, 114, 92], [52, 54, 106], [56, 16, 28], env);
    const farYBase = h * 0.63 + pyFar;

    const drawPoly = (pts: ReadonlyArray<[number, number]>, fill: string) => {
      const first = pts[0];
      if (!first) return;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(first[0], first[1]);
      for (let i = 1; i < pts.length; i++) {
        const pt = pts[i];
        if (pt) ctx.lineTo(pt[0], pt[1]);
      }
      ctx.closePath();
      ctx.fill();
    };

    const cPeakX = w * 0.5 + pxFar;
    const cPeakY = h * 0.43 + pyFar;
    drawPoly(
      [
        [cPeakX - w * 0.16, farYBase],
        [cPeakX, cPeakY],
        [cPeakX + w * 0.02, farYBase],
      ],
      rgbStr(farShad, 0.85),
    );
    drawPoly(
      [
        [cPeakX, cPeakY],
        [cPeakX + w * 0.17, farYBase],
        [cPeakX - w * 0.01, farYBase],
      ],
      rgbStr(farLit, 0.85),
    );

    drawPoly(
      [
        [-40 + pxFar, farYBase],
        [w * 0.06 + pxFar, h * 0.38 + pyFar],
        [w * 0.25 + pxFar, farYBase],
      ],
      rgbStr(farLit, 0.88),
    );
    drawPoly(
      [
        [w * 0.72 + pxFar, farYBase],
        [w * 0.92 + pxFar, h * 0.37 + pyFar],
        [w + 40 + pxFar, farYBase],
      ],
      rgbStr(farLit, 0.88),
    );

    this.renderMistRibbon(ctx, w, h * 0.59 + pyFar, h * 0.055, mistCol, 0.36, 0.4);

    /* --- 2. MAIN MID-GROUND MASSIFS (pxMid) --- */
    const midShad = mix3Color([118, 58, 72], [32, 36, 78], [34, 12, 24], env);
    const midWarm = mix3Color([178, 92, 80], [58, 62, 118], [82, 24, 38], env);
    const midSpec = mix3Color([253, 212, 134], [176, 184, 244], [248, 113, 113], env);

    const lBgX = w * 0.165 + pxMid;
    const lBgY = h * 0.305 + pyMid;
    const midBaseY = h * 0.69 + pyMid;
    drawPoly(
      [
        [-30 + pxMid, midBaseY],
        [lBgX, lBgY],
        [lBgX + w * 0.02, midBaseY],
      ],
      rgbStr(midShad),
    );
    drawPoly(
      [
        [lBgX, lBgY],
        [lBgX + w * 0.16, midBaseY],
        [lBgX - w * 0.01, midBaseY],
      ],
      rgbStr(midWarm),
    );
    drawPoly(
      [
        [lBgX, lBgY],
        [lBgX + w * 0.055, lBgY + h * 0.12],
        [lBgX + w * 0.014, lBgY + h * 0.14],
      ],
      rgbStr(midSpec, 0.85),
    );

    const rPeakX = w * 0.725 + pxMid;
    const rPeakY = h * 0.265 + pyMid;
    drawPoly(
      [
        [rPeakX - w * 0.24, midBaseY],
        [rPeakX, rPeakY],
        [rPeakX - w * 0.02, midBaseY],
      ],
      rgbStr(midShad),
    );
    drawPoly(
      [
        [rPeakX, rPeakY],
        [rPeakX + w * 0.26, midBaseY],
        [rPeakX - w * 0.02, midBaseY],
      ],
      rgbStr(midWarm),
    );
    drawPoly(
      [
        [rPeakX + w * 0.03, rPeakY + h * 0.13],
        [rPeakX + w * 0.15, midBaseY],
        [rPeakX + w * 0.01, midBaseY],
      ],
      rgbStr(midShad, 0.82),
    );
    drawPoly(
      [
        [rPeakX, rPeakY],
        [rPeakX + w * 0.085, rPeakY + h * 0.145],
        [rPeakX + w * 0.025, rPeakY + h * 0.13],
      ],
      rgbStr(midSpec, 0.92 + flash * 0.08),
    );

    ctx.strokeStyle = rgbStr(midSpec, 0.75 + flash * 0.25);
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(rPeakX, rPeakY);
    ctx.lineTo(rPeakX + w * 0.085, rPeakY + h * 0.145);
    ctx.stroke();

    this.renderSummitLandmark(ctx, rPeakX, rPeakY, env);

    /* --- 3. CLOSER FACETED LEFT PEAK CLUSTER & FOOTHILLS (pxNear) --- */
    const nearShad = mix3Color([86, 40, 56], [22, 24, 58], [24, 9, 18], env);
    const nearLit = mix3Color([208, 108, 76], [74, 82, 146], [122, 34, 46], env);
    const nearSpec = mix3Color([254, 224, 152], [199, 210, 254], [251, 146, 60], env);
    const nearBaseY = h * 0.72 + pyNear;

    const lPeakX = w * 0.255 + pxNear;
    const lPeakY = h * 0.33 + pyNear;
    drawPoly(
      [
        [lPeakX - w * 0.21, nearBaseY],
        [lPeakX, lPeakY],
        [lPeakX - w * 0.015, nearBaseY],
      ],
      rgbStr(nearShad),
    );
    drawPoly(
      [
        [lPeakX, lPeakY],
        [lPeakX + w * 0.18, nearBaseY],
        [lPeakX - w * 0.02, nearBaseY],
      ],
      rgbStr(nearLit),
    );
    drawPoly(
      [
        [lPeakX, lPeakY],
        [lPeakX + w * 0.068, lPeakY + h * 0.16],
        [lPeakX + w * 0.022, lPeakY + h * 0.16],
      ],
      rgbStr(nearSpec, 0.92),
    );
    drawPoly(
      [
        [lPeakX - w * 0.04, lPeakY + h * 0.15],
        [lPeakX + w * 0.018, lPeakY + h * 0.19],
        [lPeakX - w * 0.02, lPeakY + h * 0.28],
      ],
      rgbStr(nearLit),
    );
    drawPoly(
      [
        [lPeakX - w * 0.04, lPeakY + h * 0.15],
        [lPeakX - w * 0.075, lPeakY + h * 0.26],
        [lPeakX - w * 0.02, lPeakY + h * 0.28],
      ],
      rgbStr(nearShad),
    );

    const lfX = w * 0.198 + pxNear;
    const lfY = h * 0.462 + pyNear;
    drawPoly(
      [
        [lfX - w * 0.22, nearBaseY],
        [lfX, lfY],
        [lfX + w * 0.01, nearBaseY],
      ],
      rgbStr(nearShad),
    );
    drawPoly(
      [
        [lfX, lfY],
        [lfX + w * 0.14, nearBaseY],
        [lfX, nearBaseY],
      ],
      rgbStr(nearLit, 0.92),
    );

    const clX = w * 0.398 + pxNear;
    const clY = h * 0.465 + pyNear;
    drawPoly(
      [
        [clX - w * 0.09, nearBaseY],
        [clX, clY],
        [clX + w * 0.01, nearBaseY],
      ],
      rgbStr(nearShad),
    );
    drawPoly(
      [
        [clX, clY],
        [clX + w * 0.1, nearBaseY],
        [clX, nearBaseY],
      ],
      rgbStr(nearLit, 0.82),
    );

    /* --- 4. CLOSER DARK-BRONZE / VOLCANIC RIGHT FOREGROUND PEAK (pxNear) --- */
    const rfX = w * 0.798 + pxNear;
    const rfY = h * 0.395 + pyNear;
    const rfShad = mix3Color([68, 34, 44], [20, 22, 52], [20, 8, 16], env);
    const rfLit = mix3Color([188, 96, 68], [88, 94, 162], [176, 48, 42], env);
    drawPoly(
      [
        [rfX - w * 0.19, nearBaseY],
        [rfX, rfY],
        [rfX + w * 0.02, nearBaseY],
      ],
      rgbStr(rfShad),
    );
    drawPoly(
      [
        [rfX, rfY],
        [rfX + w * 0.22, nearBaseY],
        [rfX, nearBaseY],
      ],
      rgbStr(rfLit),
    );
    drawPoly(
      [
        [rfX, rfY],
        [rfX + w * 0.052, rfY + h * 0.11],
        [rfX + w * 0.018, rfY + h * 0.105],
      ],
      rgbStr(nearSpec, 0.9 + flash * 0.1),
    );

    /* --- 5. PAINTERLY VALLEY MIST DISSOLVE --- */
    this.renderMistRibbon(ctx, w, h * 0.625 + pyNear, h * 0.05, mistCol, 0.34, 1.8);
  }

  renderSummitLandmark(ctx: CanvasRenderingContext2D, px: number, py: number, env: number): void {
    const easyW = clamp(1 - env, 0, 1);
    const interW = clamp(1 - Math.abs(env - 1.0), 0, 1);
    const hardW = clamp(env - 1.0, 0, 1);

    // Easy: Wooden Fire Lookout Tower + Descending Utility Poles
    if (easyW > 0.02) {
      ctx.save();
      ctx.globalAlpha = easyW;
      const towerCol = '#3b1e24';
      ctx.strokeStyle = towerCol;
      ctx.fillStyle = towerCol;
      ctx.lineWidth = 1.6;

      const topY = py - 24;
      ctx.beginPath();
      ctx.moveTo(px - 8, py + 2);
      ctx.lineTo(px - 5, topY + 8);
      ctx.moveTo(px + 8, py + 2);
      ctx.lineTo(px + 5, topY + 8);
      ctx.moveTo(px - 7, py - 5);
      ctx.lineTo(px + 6, topY + 10);
      ctx.moveTo(px + 7, py - 5);
      ctx.lineTo(px - 6, topY + 10);
      ctx.stroke();

      ctx.fillRect(px - 10, topY + 6, 20, 2.5);
      ctx.fillRect(px - 7, topY - 4, 14, 10);

      ctx.fillStyle = '#fde047';
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 10;
      ctx.fillRect(px - 4.5, topY - 2, 9, 4.5);
      ctx.shadowBlur = 0;

      ctx.fillStyle = towerCol;
      ctx.beginPath();
      ctx.moveTo(px - 10, topY - 4);
      ctx.lineTo(px, topY - 12);
      ctx.lineTo(px + 10, topY - 4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px, topY - 12);
      ctx.lineTo(px, topY - 20);
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(px, topY - 20, 1.6, 0, Math.PI * 2);
      ctx.fill();

      const poles: Array<[number, number]> = [
        [px + 10, py - 12],
        [px + 36, py + 28],
        [px + 64, py + 72],
      ];
      ctx.strokeStyle = 'rgba(59, 30, 36, 0.72)';
      ctx.lineWidth = 1.2;
      for (let i = 1; i < poles.length; i++) {
        const pole = poles[i];
        if (!pole) continue;
        ctx.beginPath();
        ctx.moveTo(pole[0], pole[1]);
        ctx.lineTo(pole[0], pole[1] - 12);
        ctx.stroke();
      }
      ctx.lineWidth = 0.85;
      for (let i = 0; i < poles.length - 1; i++) {
        const p1 = poles[i];
        const p2 = poles[i + 1];
        if (!p1 || !p2) continue;
        const midX = (p1[0] + p2[0]) * 0.5;
        const midY = (p1[1] + p2[1]) * 0.5 - 3;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1] - (i === 0 ? 4 : 11));
        ctx.quadraticCurveTo(midX, midY, p2[0], p2[1] - 11);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Intermediate: Silver-Domed Mountain Observatory with Warm Arched Windows
    if (interW > 0.02) {
      ctx.save();
      ctx.globalAlpha = interW;
      ctx.fillStyle = '#272a52';
      ctx.fillRect(px - 14, py - 10, 28, 12);

      const domeG = ctx.createLinearGradient(px - 11, py - 24, px + 11, py - 10);
      domeG.addColorStop(0, '#e2e8f0');
      domeG.addColorStop(1, '#64748b');
      ctx.fillStyle = domeG;
      ctx.beginPath();
      ctx.arc(px, py - 10, 11.5, Math.PI, 0);
      ctx.fill();

      ctx.strokeStyle = '#1e1b4b';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(px + 2, py - 21);
      ctx.lineTo(px + 7, py - 13);
      ctx.stroke();

      ctx.fillStyle = '#fde68a';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 8;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.roundRect(px + i * 7 - 1.8, py - 7, 3.6, 5.5, [2, 2, 0, 0]);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      for (let i = 1; i <= 3; i++) {
        ctx.fillStyle = 'rgba(253, 224, 71, 0.8)';
        ctx.beginPath();
        ctx.arc(px + i * 16, py + i * 24, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Hard: Dark Silhouetted Summit Lookout bathed in Fiery Crimson Rim-Light
    if (hardW > 0.02) {
      ctx.save();
      ctx.globalAlpha = hardW;
      ctx.fillStyle = '#14060b';
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px - 8, py + 2);
      ctx.lineTo(px - 5, py - 18);
      ctx.lineTo(px + 5, py - 18);
      ctx.lineTo(px + 8, py + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(px - 9, py - 24, 18, 7);
      ctx.beginPath();
      ctx.moveTo(px - 11, py - 24);
      ctx.lineTo(px, py - 31);
      ctx.lineTo(px + 11, py - 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  renderForestedValley(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    env: number,
    pxNear: number,
    pyNear: number,
    pxFg: number,
    pyFg: number,
  ): void {
    const bandColors: RgbTuple[] = [
      mix3Color([124, 62, 68], [30, 34, 74], [48, 16, 28], env),
      mix3Color([98, 46, 56], [24, 28, 62], [38, 12, 22], env),
      mix3Color([74, 34, 46], [19, 22, 52], [30, 9, 18], env),
      mix3Color([54, 24, 36], [15, 17, 42], [22, 7, 14], env),
      mix3Color([36, 16, 26], [11, 13, 32], [16, 5, 10], env),
    ];
    const mistCol = mix3Color([251, 191, 134], [129, 140, 248], [190, 62, 62], env);

    for (let b = 0; b < 5; b++) {
      const t = b / 4;
      const yEdge = h * lerp(0.51, 0.73, t) + lerp(pyNear, pyFg, t);
      const pxBand = lerp(pxNear, pxFg, t);
      const dip = h * lerp(0.11, 0.14, t);
      const bandColor = bandColors[b];
      if (!bandColor) continue;

      ctx.fillStyle = rgbStr(bandColor);
      ctx.beginPath();
      ctx.moveTo(-40, h + 20);
      ctx.lineTo(-40, yEdge);
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const x = u * (w + 80) - 40 + pxBand * 0.4;
        const centerDist = Math.abs(u - 0.5) * 2;
        const bowlY = yEdge + (1 - centerDist * centerDist) * dip;
        const sway = Math.sin(this.time * 1.4 + i * 0.6 + b) * (1.2 + t * 1.4);
        const treeH = (12 + ((i * 37 + b * 13) % 16)) * (0.75 + t * 0.55);
        ctx.lineTo(x + sway * 0.5, bowlY - treeH);
        ctx.lineTo(x + (w + 80) / (steps * 2), bowlY - treeH * 0.35);
      }
      ctx.lineTo(w + 40, h + 20);
      ctx.closePath();
      ctx.fill();

      if (b === 2) {
        this.renderValleyRiver(
          ctx,
          w,
          h,
          env,
          pxNear * 0.7 + pxFg * 0.3,
          pyNear * 0.7 + pyFg * 0.3,
        );
      }

      if (b === 1) {
        this.renderCampfireSmoke(ctx, w * 0.24 + pxNear * 0.8, yEdge + h * 0.04, env);
      }

      if (b === 0 || b === 2) {
        this.renderMistRibbon(ctx, w, yEdge + dip * 0.72, h * 0.028, mistCol, 0.22, b * 2.1);
      }
    }
  }

  renderValleyRiver(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    env: number,
    px: number,
    py: number,
  ): void {
    const riverStart = { x: w * 0.51 + px * 0.6, y: h * 0.635 + py * 0.6 };
    const riverEnd = { x: w * 0.44 + px, y: h * 0.94 + py };

    const rivTop = mix3Color([254, 240, 178], [165, 180, 252], [251, 146, 60], env);
    const rivBot = mix3Color([245, 158, 86], [79, 70, 229], [185, 28, 28], env);

    const rg = ctx.createLinearGradient(0, riverStart.y, 0, riverEnd.y);
    rg.addColorStop(0, rgbStr(rivTop, 0.92));
    rg.addColorStop(1, rgbStr(rivBot, 0.86));

    ctx.save();
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(riverStart.x - 4, riverStart.y);
    ctx.bezierCurveTo(
      w * 0.43 + px,
      h * 0.72 + py,
      w * 0.59 + px,
      h * 0.81 + py,
      riverEnd.x + 28,
      riverEnd.y,
    );
    ctx.lineTo(riverEnd.x - 36, riverEnd.y);
    ctx.bezierCurveTo(
      w * 0.51 + px,
      h * 0.81 + py,
      w * 0.38 + px,
      h * 0.72 + py,
      riverStart.x + 4,
      riverStart.y,
    );
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = rgbStr(rivTop, 0.65);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      const u = (i + ((this.time * 0.35) % 1)) / 9;
      const ry = lerp(riverStart.y + 8, riverEnd.y - 12, u);
      const curveX = lerp(riverStart.x, riverEnd.x, u) + Math.sin(u * Math.PI * 2.1) * (w * 0.036);
      const halfW = 6 + u * 20;
      ctx.beginPath();
      ctx.moveTo(curveX - halfW, ry);
      ctx.lineTo(curveX + halfW, ry);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderCampfireSmoke(ctx: CanvasRenderingContext2D, sx: number, sy: number, env: number): void {
    const smokeCol = mix3Color([255, 237, 213], [199, 210, 254], [254, 205, 211], env);
    ctx.save();
    ctx.strokeStyle = rgbStr(smokeCol, 0.24);
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const cx = sx + Math.sin(this.time * 1.1 + i * 0.65) * (6 + t * 14) + t * 14;
      const cy = sy - t * 62;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.restore();
  }

  renderForegroundOverlook(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    env: number,
    pxFg: number,
    pyFg: number,
  ): void {
    const fgDark = mix3Color([26, 12, 20], [8, 10, 24], [12, 4, 9], env);
    const fgFacetLit = mix3Color([118, 52, 54], [38, 44, 88], [94, 24, 34], env);
    const fgRim = mix3Color([251, 191, 114], [165, 180, 252], [249, 115, 22], env);

    const lx = pxFg;
    const ly = pyFg;
    ctx.fillStyle = rgbStr(fgDark);
    ctx.beginPath();
    ctx.moveTo(-40, h + 30);
    ctx.lineTo(-40, h * 0.68 + ly);
    ctx.lineTo(w * 0.09 + lx, h * 0.72 + ly);
    ctx.lineTo(w * 0.165 + lx, h * 0.745 + ly);
    ctx.lineTo(w * 0.235 + lx, h * 0.84 + ly);
    ctx.lineTo(w * 0.34 + lx, h + 30);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = rgbStr(fgFacetLit, 0.78);
    ctx.beginPath();
    ctx.moveTo(w * 0.08 + lx, h * 0.72 + ly);
    ctx.lineTo(w * 0.165 + lx, h * 0.745 + ly);
    ctx.lineTo(w * 0.21 + lx, h * 0.86 + ly);
    ctx.lineTo(w * 0.11 + lx, h * 0.89 + ly);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = rgbStr(fgRim, 0.55);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-20, h * 0.685 + ly);
    ctx.lineTo(w * 0.09 + lx, h * 0.72 + ly);
    ctx.lineTo(w * 0.165 + lx, h * 0.745 + ly);
    ctx.lineTo(w * 0.235 + lx, h * 0.84 + ly);
    ctx.stroke();

    const hx = w * 0.132 + lx;
    const hy = h * 0.737 + ly;
    ctx.save();
    ctx.fillStyle = rgbStr(fgDark);
    ctx.strokeStyle = rgbStr(fgDark);
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(hx - 2, hy - 14);
    ctx.lineTo(hx - 5, hy + 1);
    ctx.moveTo(hx + 2, hy - 14);
    ctx.lineTo(hx + 5, hy + 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(hx - 4, hy - 28, 8, 15, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(hx - 9.5, hy - 28, 6.5, 13, 2.5);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx - 6.5, hy - 29.5, 4.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx + 1, hy - 32.5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx + 7, hy - 22);
    ctx.lineTo(hx + 11, hy + 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = rgbStr(fgDark);
    ctx.beginPath();
    ctx.moveTo(w + 40, h + 30);
    ctx.lineTo(w + 40, h * 0.65 + ly);
    ctx.lineTo(w * 0.89 + lx, h * 0.7 + ly);
    ctx.lineTo(w * 0.805 + lx, h * 0.75 + ly);
    ctx.lineTo(w * 0.73 + lx, h * 0.87 + ly);
    ctx.lineTo(w * 0.64 + lx, h + 30);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = rgbStr(fgFacetLit, 0.75);
    ctx.beginPath();
    ctx.moveTo(w * 0.89 + lx, h * 0.7 + ly);
    ctx.lineTo(w * 0.805 + lx, h * 0.75 + ly);
    ctx.lineTo(w * 0.78 + lx, h * 0.88 + ly);
    ctx.lineTo(w * 0.88 + lx, h * 0.85 + ly);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = rgbStr(fgRim, 0.55);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(w + 20, h * 0.655 + ly);
    ctx.lineTo(w * 0.89 + lx, h * 0.7 + ly);
    ctx.lineTo(w * 0.805 + lx, h * 0.75 + ly);
    ctx.stroke();

    const postX = w * 0.845 + lx;
    const postY = h * 0.728 + ly;
    const interW = clamp(1 - Math.abs(env - 1.0), 0, 1);
    ctx.save();
    ctx.strokeStyle = rgbStr(fgDark);
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(postX, postY + 4);
    ctx.lineTo(postX, postY - 54);
    ctx.moveTo(postX, postY - 46);
    ctx.lineTo(postX - 18, postY - 46);
    ctx.stroke();

    const lanX = postX - 16;
    const lanY = postY - 36;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(lanX, postY - 46);
    ctx.lineTo(lanX, lanY);
    ctx.stroke();

    if (interW > 0.05) {
      const lanHalo = ctx.createRadialGradient(lanX, lanY + 4, 2, lanX, lanY + 4, 62 * interW);
      lanHalo.addColorStop(0, `rgba(253, 224, 71, ${(0.72 * interW).toFixed(3)})`);
      lanHalo.addColorStop(0.4, `rgba(251, 146, 60, ${(0.28 * interW).toFixed(3)})`);
      lanHalo.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = lanHalo;
      ctx.beginPath();
      ctx.arc(lanX, lanY + 4, 62 * interW, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = interW > 0.2 ? '#fef08a' : '#78350f';
    ctx.beginPath();
    ctx.roundRect(lanX - 3.5, lanY, 7, 10, 2);
    ctx.fill();
    ctx.restore();

    const hardW = clamp(env - 1.0, 0, 1);
    if (hardW > 0.04) {
      const pulse = 0.65 + 0.35 * Math.sin(this.time * 3.1);
      ctx.save();
      ctx.globalAlpha = hardW * pulse;
      ctx.strokeStyle = '#fb923c';
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2.0;
      ctx.lineCap = 'round';
      const cracks: Array<[[number, number], [number, number], [number, number]]> = [
        [
          [w * 0.06 + lx, h * 0.85 + ly],
          [w * 0.11 + lx, h * 0.88 + ly],
          [w * 0.14 + lx, h * 0.94 + ly],
        ],
        [
          [w * 0.15 + lx, h * 0.81 + ly],
          [w * 0.18 + lx, h * 0.86 + ly],
          [w * 0.22 + lx, h * 0.89 + ly],
        ],
        [
          [w * 0.82 + lx, h * 0.82 + ly],
          [w * 0.79 + lx, h * 0.88 + ly],
          [w * 0.75 + lx, h * 0.93 + ly],
        ],
        [
          [w * 0.88 + lx, h * 0.78 + ly],
          [w * 0.92 + lx, h * 0.85 + ly],
          [w * 0.95 + lx, h * 0.91 + ly],
        ],
      ];
      for (const c of cracks) {
        ctx.beginPath();
        ctx.moveTo(c[0][0], c[0][1]);
        ctx.lineTo(c[1][0], c[1][1]);
        ctx.lineTo(c[2][0], c[2][1]);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = rgbStr(fgDark);
    ctx.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const isLeft = i < 11;
      const u = (i % 11) / 10;
      const gx = isLeft ? lerp(12, w * 0.22, u) + lx : lerp(w * 0.76, w - 12, u) + lx;
      const gy = isLeft ? lerp(h * 0.7, h * 0.85, u) + ly : lerp(h * 0.82, h * 0.68, u) + ly;
      const bladeH = 18 + (i % 4) * 9;
      const sway = Math.sin(this.time * 2.1 + i * 0.7) * 5;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(gx, gy + 8);
      ctx.quadraticCurveTo(gx + sway * 0.4, gy - bladeH * 0.5, gx + sway, gy - bladeH);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderParticlesAndPulses(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    env: number,
    pxFg: number,
    pyFg: number,
  ): void {
    const easyW = clamp(1 - env, 0, 1);
    const interW = clamp(1 - Math.abs(env - 1.0), 0, 1);
    const hardW = clamp(env - 1.0, 0, 1);

    for (const p of this.particles) {
      const x = p.x * w + pxFg * 0.35;
      const y = p.y * h + pyFg * 0.35;
      const blink = 0.45 + 0.55 * Math.sin(this.time * 2.8 + p.phase);

      if (easyW > 0.05) {
        ctx.fillStyle = `rgba(254, 240, 138, ${(0.48 * easyW * blink).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      if (interW > 0.05) {
        const fy = y + Math.sin(this.time * 2.2 + p.phase) * 7;
        const fHalo = ctx.createRadialGradient(x, fy, 0.5, x, fy, p.size * 4.2);
        fHalo.addColorStop(0, `rgba(253, 224, 71, ${(0.9 * interW * blink).toFixed(3)})`);
        fHalo.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.fillStyle = fHalo;
        ctx.beginPath();
        ctx.arc(x, fy, p.size * 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (hardW > 0.05) {
        ctx.fillStyle = `rgba(251, 113, 60, ${(0.78 * hardW * blink).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 1.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (hardW > 0.05) {
      ctx.fillStyle = `rgba(46, 12, 18, ${(0.65 * hardW).toFixed(3)})`;
      for (const a of this.ashFlakes) {
        ctx.beginPath();
        ctx.ellipse(a.x * w, a.y * h, a.size, a.size * 0.55, a.phase + this.time, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.pulseRings.length > 0) {
      const cx = w * 0.5;
      const cy = h * 0.52;
      const ringCol = mix3Color([250, 204, 21], [129, 140, 248], [251, 113, 133], env);
      for (const ring of this.pulseRings) {
        const alpha = (1 - ring.progress) * 0.45;
        const r = ring.progress * ring.maxRadius;
        ctx.strokeStyle = rgbStr(ringCol, alpha);
        ctx.lineWidth = 2.5 * (1 - ring.progress) + 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
