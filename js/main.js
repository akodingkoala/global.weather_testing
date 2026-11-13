'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#scene');
  const ctx = canvas.getContext('2d');
  const bubbleLayer = $('#bubbles');
  const { PALETTE, SPRITES } = window.PIXEL;

  const INK = '#2b2135';
  const GRAV = 340;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

  // Logical (pixel-art) resolution; the canvas is scaled up with crisp pixels.
  let SCALE = 4, W = 320, H = 200, GROUND = 180;
  let T = 0;

  // ---------------------------------------------------------------- sprites
  function buildSprite(rows) {
    const h = rows.length, w = rows[0].length;
    const filled = (i, j) => j >= 0 && j < h && i >= 0 && i < w && rows[j][i] !== '.';
    const make = flip => {
      const c = document.createElement('canvas');
      c.width = w + 2; c.height = h + 2;
      const x = c.getContext('2d');
      for (let j = -1; j <= h; j++) {
        for (let i = -1; i <= w; i++) {
          let col = null;
          if (filled(i, j)) col = PALETTE[rows[j][i]];
          else if (filled(i - 1, j) || filled(i + 1, j) || filled(i, j - 1) || filled(i, j + 1)) col = INK;
          if (!col) continue;
          x.fillStyle = col;
          x.fillRect(flip ? w - i : i + 1, j + 1, 1, 1);
        }
      }
      return c;
    };
    return { r: make(false), l: make(true), w: w + 2, h: h + 2 };
  }
  const SPR = {};
  for (const [name, rows] of Object.entries(SPRITES)) SPR[name] = buildSprite(rows);

  // ---------------------------------------------------------------- palettes
  const SKIES = {
    clear:  { day: ['#3d9bff', '#bfe8ff'], night: ['#0a0f2e', '#2b2f6e'] },
    cloudy: { day: ['#7f9bb8', '#d3dde8'], night: ['#181d30', '#393f58'] },
    rain:   { day: ['#46536d', '#8c99ae'], night: ['#10141f', '#2a3245'] },
    storm:  { day: ['#25223a', '#5a5372'], night: ['#0c0a16', '#2d2840'] },
    snow:   { day: ['#9fb9d8', '#eef4fb'], night: ['#232b45', '#58628a'] },
    fog:    { day: ['#aab0b8', '#e4e6ea'], night: ['#33363e', '#5c6069'] },
  };
  const CLOUD_TONES = {
    // [base, shade, highlight]
    white:  { day: ['#ffffff', '#dfe7f1', '#ffffff'], night: ['#59608a', '#434970', '#6c74a0'] },
    grey:   { day: ['#c9d1dc', '#9aa6b6', '#e6ebf0'], night: ['#4a5068', '#383d52', '#5a6080'] },
    dark:   { day: ['#6d7486', '#4d5366', '#878ea0'], night: ['#2e3346', '#22263a', '#3b4157'] },
    storm:  { day: ['#4a4760', '#343147', '#625e7c'], night: ['#26233a', '#1a1829', '#34304a'] },
  };
  const CLOUD_PLAN = {
    clear: { n: 2, tone: 'white' }, cloudy: { n: 7, tone: 'grey' }, rain: { n: 9, tone: 'dark' },
    storm: { n: 11, tone: 'storm' }, snow: { n: 7, tone: 'grey' }, fog: { n: 4, tone: 'grey' },
  };
  const LABELS = { clear: 'Sunny', cloudy: 'Cloudy', rain: 'Rain', storm: 'Thunderstorm', snow: 'Snow', fog: 'Fog' };

  // ---------------------------------------------------------------- weather state
  const view = { kind: 'clear', isDay: true, intensity: 1, windX: 12 };
  const mood = { sky: [hex('#3d9bff'), hex('#bfe8ff')], snow: 0, wet: 0, sun: 1, moon: 0, stars: 0, fog: 0, dark: 0 };
  const isRainy = () => view.kind === 'rain' || view.kind === 'storm';

  function moodTargets() {
    const k = view.kind, d = view.isDay;
    const s = SKIES[k][d ? 'day' : 'night'];
    return {
      sky: [hex(s[0]), hex(s[1])],
      snow: k === 'snow' ? 1 : 0,
      wet: isRainy() ? 1 : 0,
      sun: d ? ({ clear: 1, cloudy: 0.55 }[k] || 0) : 0,
      moon: d ? 0 : ({ clear: 1, cloudy: 0.5, snow: 0.35, fog: 0.25 }[k] || 0),
      stars: d ? 0 : ({ clear: 1, cloudy: 0.35, snow: 0.25 }[k] || 0),
      fog: k === 'fog' ? 1 : 0,
      dark: d ? 0 : 1,
    };
  }
  function easeMood(dt) {
    const t = moodTargets();
    const r = 1 - Math.pow(0.15, dt);
    mood.sky = [mix(mood.sky[0], t.sky[0], r), mix(mood.sky[1], t.sky[1], r)];
    for (const k of ['snow', 'sun', 'moon', 'stars', 'fog', 'dark']) mood[k] += (t[k] - mood[k]) * r;
    mood.wet += (t.wet - mood.wet) * (1 - Math.pow(t.wet ? 0.5 : 0.85, dt));
  }

  // ---------------------------------------------------------------- scenery
  let groundGrass, groundSnow, stars = [], fogBands = [], puddles = [];
  const skyCache = document.createElement('canvas');
  let skyKey = '';

  function buildGround(snowy) {
    const top = GROUND - 3, gh = H - top;
    const c = document.createElement('canvas');
    c.width = W; c.height = gh;
    const x = c.getContext('2d');
    x.fillStyle = '#9a6744'; x.fillRect(0, 3, W, gh);
    x.fillStyle = '#7a4e33';
    for (let i = 0; i < W * gh * 0.05; i++) x.fillRect(rand(0, W) | 0, rand(8, gh) | 0, 1, 1);
    if (!snowy) {
      x.fillStyle = '#4fae52'; x.fillRect(0, 3, W, 5);
      x.fillStyle = '#7ad65f'; x.fillRect(0, 3, W, 2);
      x.fillStyle = '#3e8e4a'; x.fillRect(0, 8, W, 1);
      for (let i = 0; i < W; i += 2) {
        if (Math.random() < 0.45) {
          const hgt = 1 + (Math.random() * 3 | 0);
          x.fillStyle = Math.random() < 0.5 ? '#7ad65f' : '#4fae52';
          x.fillRect(i, 3 - hgt, 1, hgt);
        }
      }
      for (let i = 0; i < W / 25; i++) { // tiny flowers
        const fx = rand(2, W - 2) | 0;
        x.fillStyle = pick(['#ff9eb5', '#ffd84a', '#ffffff']);
        x.fillRect(fx, 1, 1, 1);
      }
    } else {
      x.fillStyle = '#ffffff'; x.fillRect(0, 2, W, 7);
      x.fillStyle = '#d9e5f3'; x.fillRect(0, 7, W, 2);
      for (let i = 0; i < W; i++) {
        const b = Math.round(Math.sin(i * 0.15) * 1.2 + Math.sin(i * 0.05) * 1.2);
        if (b > 0) { x.fillStyle = '#ffffff'; x.fillRect(i, 2 - b, 1, b); }
      }
    }
    return c;
  }

  function initScenery() {
    groundGrass = buildGround(false);
    groundSnow = buildGround(true);
    stars = Array.from({ length: Math.round(W * H / 900) }, () => ({
      x: rand(0, W) | 0, y: rand(0, GROUND * 0.7) | 0, ph: rand(0, 6.28), sp: rand(1, 3), big: Math.random() < 0.12,
    }));
    fogBands = Array.from({ length: 6 }, (_, i) => ({
      y: Math.round(GROUND * (0.3 + i * 0.12)), h: Math.round(rand(6, 14)), sp: rand(6, 16) * (i % 2 ? 1 : -1), ph: rand(0, 500), amp: rand(1, 3),
    }));
    const nPuddles = Math.max(2, Math.round(W / 110));
    puddles = Array.from({ length: nPuddles }, (_, i) => ({
      x: Math.round((i + 0.5) * W / nPuddles + rand(-20, 20)), w: Math.round(rand(14, 26)),
    }));
    skyKey = '';
  }

  function drawSky() {
    const key = mood.sky.flat().map(v => v | 0).join(',') + W + 'x' + H;
    if (key !== skyKey) {
      skyKey = key;
      skyCache.width = W; skyCache.height = H;
      const x = skyCache.getContext('2d');
      const bands = 12, bh = Math.ceil(GROUND / bands);
      for (let i = 0; i < bands; i++) {
        x.fillStyle = rgb(mix(mood.sky[0], mood.sky[1], i / (bands - 1)));
        x.fillRect(0, i * bh, W, bh + 1);
        if (i < bands - 1) { // dithered seam between bands
          x.fillStyle = rgb(mix(mood.sky[0], mood.sky[1], (i + 1) / (bands - 1)));
          const y = (i + 1) * bh - 1;
          for (let px = (i % 2); px < W; px += 2) x.fillRect(px, y, 1, 1);
        }
      }
      x.fillStyle = rgb(mood.sky[1]);
      x.fillRect(0, bands * bh, W, H);
    }
    ctx.drawImage(skyCache, 0, 0);
  }

  const celestial = () => ({ cx: Math.round(W * 0.78), cy: Math.round(Math.max(H * 0.2, 60)), r: Math.max(8, Math.round(Math.min(W, H) * 0.055)) });
  let sunSpin = 1, sunWink = 0;

  function disc(cx, cy, r, color, skip) {
    ctx.fillStyle = color;
    for (let j = -r; j <= r; j++) {
      const half = Math.floor(Math.sqrt(r * r - j * j));
      if (!skip) { ctx.fillRect(cx - half, cy + j, half * 2 + 1, 1); continue; }
      for (let i = -half; i <= half; i++) if (!skip(i, j)) ctx.fillRect(cx + i, cy + j, 1, 1);
    }
  }

  function drawSun() {
    if (mood.sun < 0.02) return;
    const { cx, cy, r } = celestial();
    ctx.globalAlpha = mood.sun;
    ctx.fillStyle = '#ffd84a';
    for (let k = 0; k < 12; k++) {
      const a = T * 0.4 * sunSpin + k * Math.PI / 6;
      const len = k % 2 ? 3 : 5;
      for (let d = r + 3; d < r + 3 + len; d++) ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1);
    }
    disc(cx, cy, r + 1, INK);
    disc(cx, cy, r, '#ffd84a');
    disc(cx - 1, cy - 2, Math.max(2, r - 4), '#ffe98a');
    const ey = cy - Math.round(r * 0.15), ex = Math.round(r * 0.38), my = cy + Math.round(r * 0.35);
    ctx.fillStyle = INK;
    if (sunWink > 0) ctx.fillRect(cx - ex - 1, ey, 3, 1); else ctx.fillRect(cx - ex, ey - 1, 1, 2);
    ctx.fillRect(cx + ex, ey - 1, 1, 2);
    ctx.fillRect(cx - 2, my, 5, 1); ctx.fillRect(cx - 3, my - 1, 1, 1); ctx.fillRect(cx + 3, my - 1, 1, 1);
    ctx.fillStyle = '#ff9eb5';
    ctx.fillRect(cx - ex - 2, ey + 2, 2, 1); ctx.fillRect(cx + ex + 1, ey + 2, 2, 1);
    ctx.globalAlpha = 1;
  }

  function drawMoon() {
    if (mood.moon < 0.02) return;
    const { cx, cy, r } = celestial();
    ctx.globalAlpha = mood.moon;
    disc(cx, cy, r + 1, INK, (i, j) => (i - r * 0.55) ** 2 + (j + r * 0.2) ** 2 < (r * 0.8) ** 2);
    disc(cx, cy, r, '#fff4c8', (i, j) => (i - r * 0.55) ** 2 + (j + r * 0.2) ** 2 < (r * 0.9) ** 2);
    ctx.fillStyle = INK; // sleepy face
    const ex = cx - Math.round(r * 0.55), ey = cy - Math.round(r * 0.1);
    ctx.fillRect(ex - 1, ey, 3, 1);
    ctx.fillRect(ex, cy + Math.round(r * 0.35), 2, 1);
    ctx.fillStyle = '#ff9eb5'; ctx.fillRect(ex - 2, ey + 2, 2, 1);
    ctx.globalAlpha = 1;
  }

  function drawStars() {
    if (mood.stars < 0.02) return;
    ctx.fillStyle = '#fff8d0';
    for (const s of stars) {
      ctx.globalAlpha = mood.stars * (0.45 + 0.55 * Math.sin(T * s.sp + s.ph) ** 2);
      ctx.fillRect(s.x, s.y, 1, 1);
      if (s.big) { ctx.fillRect(s.x - 1, s.y, 3, 1); ctx.fillRect(s.x, s.y - 1, 1, 3); }
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- clouds
  let clouds = [];
  function makeCloudSprite(w, h, tone) {
    const [base, shade, light] = CLOUD_TONES[tone][view.isDay ? 'day' : 'night'];
    const circles = [];
    const n = 3 + Math.floor(w / 14);
    for (let i = 0; i < n; i++) {
      const r = rand(h * 0.32, h * 0.5);
      circles.push([rand(r, w - r), rand(r, Math.max(r, h - r)), r]);
    }
    circles.push([w / 2, h - h * 0.3, h * 0.3]);
    const inside = (i, j) => circles.some(([cx, cy, r]) => (i - cx) ** 2 + (j - cy) ** 2 <= r * r) && j < h - 1;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (!inside(i, j)) continue;
        x.fillStyle = !inside(i, j - 1) ? light : (j > h * 0.68 ? shade : base);
        x.fillRect(i, j, 1, 1);
      }
    }
    return c;
  }
  function makeCloud(tone, opts = {}) {
    const w = Math.round(opts.w || rand(32, 74)), h = Math.round(w * rand(0.36, 0.5));
    const dir = Math.sign(view.windX) || 1;
    return {
      spr: makeCloudSprite(w, h, tone),
      x: opts.x ?? rand(-w * 0.5, W),
      y: opts.y ?? rand(-h * 0.35, GROUND * 0.38),
      vx: dir * rand(0.5, 1) * (4 + Math.abs(view.windX) * 0.3),
      a: 0, target: opts.target ?? rand(0.85, 1),
    };
  }
  function planClouds() {
    for (const c of clouds) c.target = 0;
    const p = CLOUD_PLAN[view.kind];
    const n = Math.round(p.n * clamp(W / 320, 0.7, 1.6));
    for (let i = 0; i < n; i++) clouds.push(makeCloud(p.tone));
  }
  function updateClouds(dt) {
    const r = 1 - Math.pow(0.2, dt);
    for (const c of clouds) {
      c.a += (c.target - c.a) * r;
      c.x += c.vx * dt;
      const w = c.spr.width;
      if (c.vx > 0 && c.x > W + 4) c.x = -w - 4;
      if (c.vx < 0 && c.x < -w - 4) c.x = W + 4;
    }
    clouds = clouds.filter(c => c.target > 0 || c.a > 0.02);
  }
  function drawClouds() {
    for (const c of clouds) {
      ctx.globalAlpha = c.a;
      ctx.drawImage(c.spr, Math.round(c.x), Math.round(c.y));
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- particles
  let drops = [], flakes = [], particles = [], bolts = [];
  let flash = 0, lightningTimer = 3;

  function rainTarget() {
    const base = view.kind === 'storm' ? 1.6 : view.kind === 'rain' ? 1 : 0;
    return Math.round(base * view.intensity * W * 0.9);
  }
  function snowTarget() { return view.kind === 'snow' ? Math.round(W * 0.6 * view.intensity) : 0; }

  function newDrop(anywhere) {
    const vy = rand(170, 230) * (view.kind === 'storm' ? 1.25 : 1);
    const drift = view.windX * (H / vy);
    return {
      x: rand(Math.min(0, -drift), W + Math.max(0, -drift)),
      y: anywhere ? rand(-H, GROUND) : rand(-24, -2),
      vy, len: Math.random() < 0.5 ? 3 : 4,
      landY: GROUND + 1 + rand(0, (H - GROUND) * 0.55),
    };
  }
  function newFlake(anywhere) {
    return {
      x: rand(-20, W + 20), y: anywhere ? rand(-H, GROUND) : rand(-20, -2),
      vy: rand(14, 30), s: Math.random() < 0.25 ? 2 : 1, ph: rand(0, 6.28), vx: 0,
      landY: GROUND + 1 + rand(0, (H - GROUND) * 0.5),
    };
  }

  function addParticle(p) { p.max = p.life; particles.push(p); }
  function splash(x, y, onGround) {
    const n = onGround ? 2 : 3;
    for (let i = 0; i < n; i++) addParticle({ type: 'px', x, y: y - 1, vx: rand(-22, 22), vy: rand(-55, -25), g: 400, life: rand(0.15, 0.3), color: '#d6eeff' });
    if (onGround && mood.wet > 0.35 && puddles.some(p => Math.abs(x - p.x) < p.w / 2 - 2) && Math.random() < 0.4) {
      addParticle({ type: 'ring', x: Math.round(x), y: GROUND + 3, life: 0.45, color: '#e6f4ff' });
    }
  }
  function hearts(x, y) {
    for (let i = 0; i < 3; i++) addParticle({ type: 'heart', x: x + rand(-6, 6), y: y - rand(0, 4), vx: rand(-6, 6), vy: rand(-26, -16), life: rand(0.9, 1.3) });
  }
  function sparkles(x, y, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28), s = rand(15, 45);
      addParticle({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 0.9), color: pick(['#fff6a0', '#ffffff', '#ffd84a', '#ff9eb5']) });
    }
  }
  function dust(x, y) {
    for (let i = 0; i < 4; i++) addParticle({ type: 'px', x: x + rand(-4, 4), y: y - 1, vx: rand(-25, 25), vy: rand(-15, -5), life: 0.35, color: mood.snow > 0.5 ? '#ffffff' : '#e8d8b8' });
  }

  function strike(tx, ty) {
    const pts = [];
    let x = tx + rand(-30, 30), y = 0;
    pts.push([Math.round(x), 0]);
    while (y < ty) {
      y = Math.min(ty, y + rand(4, 9));
      x += rand(-5, 5) + (tx - x) * 0.18;
      pts.push([Math.round(x), Math.round(y)]);
    }
    pts[pts.length - 1][0] = Math.round(tx);
    bolts.push({ pts, life: 0.35 });
    flash = 1;
    sparkles(tx, ty, 8);
    for (const c of critters) {
      const near = Math.abs(c.x - tx) < 18 && Math.abs((c.y - 6) - ty) < 24;
      if (near) { say(c, pick(['ZAP!', 'that was close!', 'my fur!'])); kick(c, -150); }
      else if (!c.flier && Math.random() < 0.5) setTimeout(() => kick(c, -90), rand(150, 500));
    }
    if (Math.random() < 0.5) {
      const c = pick(critters);
      setTimeout(() => say(c, pick(LINES[c.kind].thunder)), 400);
    }
  }

  function line(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // ---------------------------------------------------------------- critters
  const LINES = {
    frog: {
      any: ['ribbit!', '*boing*', 'hi friend!', 'croak.'],
      rain: ['perfect puddle weather!', 'ribbit! rain!', 'splish splash'],
      storm: ['eek, thunder!', 'hold my umbrella'],
      clear: ['sunbathing...', 'warm toes!'],
      cloudy: ["where'd the sun go?", 'cozy grey day'],
      snow: ['brrr... ribbit', 'my toes are frozen'],
      fog: ["can't see a thing", 'hello? anyone?'],
      thunder: ['eek!', 'RIBBIT?!'],
      toss: ['wheee!', 'i can fly!'],
    },
    cat: {
      any: ['mrrp.', 'purrr', 'pet me more', 'meow?'],
      rain: ['i hate getting wet', 'umbrella please'],
      storm: ['*hides*', 'nope nope nope'],
      clear: ['nap in the sun?', 'warm spot found'],
      cloudy: ['nap weather', 'zzz...'],
      snow: ['cold paws!', 'what is this white stuff'],
      fog: ['i sense a mouse...', 'spooky'],
      thunder: ['HISS!', '*puffs up*'],
      toss: ['MEOW!', 'put me down!'],
    },
    snail: {
      any: ['hi there...', 'slow and steady', 'no rush'],
      rain: ['love this damp', 'mmm, moist'],
      storm: ['hiding in my shell'],
      clear: ['too dry for me...', 'need shade'],
      cloudy: ['nice and mild'],
      snow: ['shell is chilly'],
      fog: ['taking my time'],
      thunder: ['*retreats*'],
      toss: ['whoooa', 'too fast!'],
    },
    cloud: {
      any: ["i'm a cloud!", 'wheee', 'floaty!'],
      rain: ["sorry, that's me", '*sniffle*'],
      storm: ['i feel grumbly', 'rumble rumble'],
      clear: ["i'm lonely up here", 'too sunny for me'],
      cloudy: ['so many friends!', 'cloud party!'],
      snow: ['making snowflakes!'],
      fog: ["that's my cousin"],
      thunder: ['not me!', 'bzzt'],
      toss: ['weee!', 'up up up'],
    },
    bird: {
      any: ['tweet!', 'chirp chirp', 'peep!'],
      rain: ['wet feathers!', 'flying is hard'],
      storm: ['where is my nest?!'],
      clear: ['great flying day!', 'tweet tweet!'],
      cloudy: ['flying through clouds'],
      snow: ['brrr, chirp'],
      fog: ['which way is up?'],
      thunder: ['SQUAWK!'],
      toss: ['i was already flying!'],
    },
  };

  class Critter {
    constructor(o) {
      Object.assign(this, {
        vx: 0, vy: 0, dir: Math.random() < 0.5 ? 1 : -1, t: rand(0, 10), frame: 0, ft: 0, timer: rand(0.5, 2),
        mode: 'walk', onGround: true, drag: false, hop: 0, loop: 0, umb: 0, drip: 0, _b: null, chase: false,
      }, o);
    }
    get size() { return this.frames[0]; }
    box() { const s = this.size; return { x: this.x - s.w / 2, y: this.y - s.h, w: s.w, h: s.h }; }
    bubblePos() { return [this.x, this.y - this.size.h - (this.umb > 0.5 ? 7 : 1)]; }
  }

  let critters = [];
  function initCritters() {
    const floor = GROUND + 1;
    critters = [
      new Critter({ kind: 'frog', frames: [SPR.frog0, SPR.frog1], faces: 1, x: W * 0.22, y: floor, umbrella: SPR.umbY }),
      new Critter({ kind: 'cat', frames: [SPR.cat0, SPR.cat1], faces: -1, x: W * 0.5, y: floor, speed: 22, umbrella: SPR.umbB }),
      new Critter({ kind: 'snail', frames: [SPR.snail0, SPR.snail1], faces: 1, x: W * 0.75, y: floor, speed: 5, umbrella: SPR.umbR }),
      new Critter({ kind: 'bird', frames: [SPR.bird0, SPR.bird1], faces: 1, x: W * 0.62, y: GROUND * 0.55, baseY: GROUND * 0.55, flier: true, speed: 28 }),
      new Critter({ kind: 'cloud', frames: [SPR.cloud0, SPR.cloud1], faces: 1, x: W * 0.3, y: GROUND * 0.42, baseY: GROUND * 0.42, flier: true }),
    ];
  }

  function kick(c, vy) {
    if (c.drag) return;
    if (c.flier) { c.loop = 1; return; }
    c.vy = vy; c.onGround = false;
  }

  function poke(c) {
    const lines = LINES[c.kind];
    const pool = lines[view.kind] && Math.random() < 0.7 ? lines[view.kind] : lines.any;
    say(c, pick(pool));
    hearts(c.x, c.y - c.size.h);
    if (c.kind === 'cloud') burstFromCloud(c);
    kick(c, c.kind === 'snail' ? -60 : -130);
  }

  function burstFromCloud(c) {
    const snowy = view.kind === 'snow';
    const sunny = view.kind === 'clear';
    for (let i = 0; i < 18; i++) {
      const x = c.x + rand(-6, 6), y = c.y - 1;
      if (sunny) addParticle({ type: 'spark', x, y, vx: rand(-25, 25), vy: rand(10, 40), life: rand(0.6, 1), color: pick(['#ff5d6c', '#ffd84a', '#7ad65f', '#6ab8ff', '#b48cff']) });
      else if (snowy) addParticle({ type: 'flake', x, y, vx: rand(-10, 10), vy: rand(15, 35), life: 4, color: '#ffffff' });
      else addParticle({ type: 'drop', x, y: y + rand(0, 20), vx: view.windX * 0.5, vy: rand(140, 190), life: 3, color: '#a8d8ff' });
    }
  }

  function updateWalker(c, dt) {
    c.t += dt;
    c.umb += ((isRainy() ? 1 : 0) - c.umb) * Math.min(1, dt * 4);
    if (c.drag) { c.frame = (c.t * 8 | 0) % 2; return; }
    if (c.onGround) {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.timer = rand(1.5, 4);
        c.mode = Math.random() < 0.35 ? 'idle' : 'walk';
        if (Math.random() < 0.4) c.dir *= -1;
      }
      // The cat chases the cursor when it is close and low.
      if (c.kind === 'cat' && pointer.inside && !pointer.drag && Math.abs(pointer.x - c.x) < 80 && pointer.y > GROUND - 70) {
        const dx = pointer.x - c.x;
        if (Math.abs(dx) > 5) { c.mode = 'walk'; c.dir = Math.sign(dx); c.chase = true; } else c.mode = 'idle';
      }
      if (c.kind === 'frog') {
        c.vx = 0; c.hop -= dt;
        if (c.mode === 'walk' && c.hop <= 0) {
          c.vy = -rand(70, 95); c.vx = c.dir * rand(35, 50); c.onGround = false; c.hop = rand(0.5, 1.4);
        }
      } else {
        c.vx = c.mode === 'walk' ? c.dir * c.speed * (c.chase ? 1.9 : 1) : 0;
      }
      c.chase = false;
    }
    c.vy += GRAV * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    const floor = GROUND + 1;
    if (c.y >= floor) {
      c.y = floor;
      if (c.vy > 130) { c.vy = -c.vy * 0.35; c.vx *= 0.6; c.onGround = false; dust(c.x, floor); }
      else { c.vy = 0; if (!c.onGround) { c.onGround = true; if (c.kind === 'frog') c.vx = 0; } }
    }
    const half = c.size.w / 2;
    if (c.x < half) { c.x = half; c.dir = 1; if (!c.onGround) c.vx = Math.abs(c.vx) * 0.5; }
    if (c.x > W - half) { c.x = W - half; c.dir = -1; if (!c.onGround) c.vx = -Math.abs(c.vx) * 0.5; }
    if (!c.onGround && Math.abs(c.vx) > 5) c.dir = Math.sign(c.vx);
    if (c.kind === 'frog') c.frame = c.onGround ? 0 : 1;
    else if (c.vx !== 0 && c.onGround) {
      c.ft += dt;
      if (c.ft > (c.kind === 'snail' ? 0.45 : 0.16)) { c.ft = 0; c.frame ^= 1; }
    } else c.frame = 0;
  }

  function updateFlier(c, dt) {
    c.t += dt;
    if (c.kind === 'bird') { c.ft += dt; if (c.ft > 0.14) { c.ft = 0; c.frame ^= 1; } }
    else c.frame = (c.t % 4) < 0.15 ? 1 : 0; // cloud blinks
    if (c.drag) return;
    c.loop = Math.max(0, c.loop - dt * 1.3);
    const lift = -Math.sin(c.loop * Math.PI) * 14;
    if (c.kind === 'bird') {
      c.x += c.dir * c.speed * dt;
      if (c.x > W - 10) c.dir = -1;
      if (c.x < 10) c.dir = 1;
      c.timer -= dt;
      if (c.timer <= 0) {
        c.timer = rand(3, 7);
        if (Math.random() < 0.3) c.dir *= -1;
        c.targetY = clamp(c.baseY + rand(-20, 20), 24, GROUND - 35);
      }
      if (c.targetY != null) c.baseY += (c.targetY - c.baseY) * Math.min(1, dt);
      c.y = c.baseY + Math.sin(c.t * 2.2) * 5 + lift;
    } else {
      c.x += c.dir * 7 * dt;
      if (c.x < 20) c.dir = 1;
      if (c.x > W - 20) c.dir = -1;
      c.y = c.baseY + Math.sin(c.t * 1.6) * 3 + lift;
      if (isRainy() || view.kind === 'snow') {
        c.drip -= dt;
        if (c.drip <= 0) {
          c.drip = rand(0.08, 0.25);
          const x = c.x + rand(-5, 5);
          if (view.kind === 'snow') addParticle({ type: 'flake', x, y: c.y, vx: rand(-5, 5), vy: rand(15, 25), life: 5, color: '#ffffff' });
          else addParticle({ type: 'drop', x, y: c.y, vx: view.windX * 0.4, vy: rand(130, 170), life: 3, color: '#a8d8ff' });
        }
      }
    }
  }

  function hitCritter(x, y) {
    for (let i = critters.length - 1; i >= 0; i--) {
      const b = critters[i].box();
      if (x >= b.x - 3 && x <= b.x + b.w + 3 && y >= b.y - 3 && y <= b.y + b.h + 3) return critters[i];
    }
    return null;
  }

  function drawSprite(s, x, y, facingRight) {
    ctx.drawImage(facingRight ? s.r : s.l, Math.round(x), Math.round(y));
  }

  function drawCritter(c) {
    const s = c.frames[c.frame];
    const wiggle = c.drag ? Math.round(Math.sin(c.t * 30)) : 0;
    const left = c.x - s.w / 2 + wiggle, top = c.y - s.h;
    drawSprite(s, left, top, c.dir === c.faces);
    if (!c.flier && c.umb > 0.02) {
      ctx.globalAlpha = c.umb;
      const u = c.umbrella;
      drawSprite(u, c.x - u.w / 2 + wiggle, top - u.h + 2 + (1 - c.umb) * 4, true);
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- speech bubbles
  const bubbles = [];
  function say(anchor, text, life = 2.2) {
    if (anchor._b) { anchor._b.el.remove(); bubbles.splice(bubbles.indexOf(anchor._b), 1); }
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = text;
    bubbleLayer.appendChild(el);
    const b = { el, life, anchor };
    anchor._b = b;
    bubbles.push(b);
    placeBubble(b);
  }
  function placeBubble(b) {
    const [x, y] = b.anchor.bubblePos();
    const half = (b.el.offsetWidth || 120) / 2 + 6;
    b.el.style.left = clamp(x * SCALE, half, innerWidth - half) + 'px';
    b.el.style.top = Math.max(b.el.offsetHeight + 8, y * SCALE - 10) + 'px';
  }
  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.life -= dt;
      if (b.life <= 0) { b.el.remove(); b.anchor._b = null; bubbles.splice(i, 1); continue; }
      placeBubble(b);
    }
  }
  const sunAnchor = { _b: null, bubblePos() { const { cx, cy, r } = celestial(); return [cx, cy - r - 8]; } };

  // ---------------------------------------------------------------- pointer
  const pointer = { x: -99, y: -99, inside: false, drag: null, moved: false, hist: [] };
  const toLogical = e => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / SCALE, (e.clientY - r.top) / SCALE];
  };
  const showUmbrellaCursor = () => isRainy() && pointer.inside && !pointer.drag && !hitCritter(pointer.x, pointer.y) && pointer.y < GROUND + 4;

  function setCursor() {
    const over = hitCritter(pointer.x, pointer.y);
    canvas.style.cursor = pointer.drag ? 'grabbing' : over ? 'grab' : showUmbrellaCursor() ? 'none' : 'pointer';
  }

  canvas.addEventListener('pointerdown', e => {
    const [x, y] = toLogical(e);
    const now = performance.now();
    Object.assign(pointer, { x, y, inside: true, moved: false, hist: [[x, y, now]], downX: x, downY: y });
    const c = hitCritter(x, y);
    if (c) {
      pointer.drag = c;
      c.drag = true;
      c.grabDX = c.x - x; c.grabDY = c.y - y;
      canvas.setPointerCapture(e.pointerId);
    } else skyClick(x, y);
    setCursor();
  });

  canvas.addEventListener('pointermove', e => {
    const [x, y] = toLogical(e);
    Object.assign(pointer, { x, y, inside: true });
    const now = performance.now();
    pointer.hist.push([x, y, now]);
    while (pointer.hist.length > 6) pointer.hist.shift();
    const c = pointer.drag;
    if (c) {
      if (Math.hypot(x - pointer.downX, y - pointer.downY) > 2) pointer.moved = true;
      c.x = clamp(x + c.grabDX, c.size.w / 2, W - c.size.w / 2);
      c.y = clamp(y + c.grabDY, c.size.h, GROUND + 1);
    }
    setCursor();
  });

  function release() {
    const c = pointer.drag;
    if (!c) return;
    c.drag = false;
    pointer.drag = null;
    if (!pointer.moved) { poke(c); return; }
    const h = pointer.hist, a = h[0], b = h[h.length - 1];
    const dt = Math.max(0.016, (b[2] - a[2]) / 1000);
    const vx = clamp((b[0] - a[0]) / dt, -300, 300), vy = clamp((b[1] - a[1]) / dt, -300, 300);
    if (c.flier) {
      c.baseY = clamp(c.y, 16, GROUND - 30);
      c.targetY = c.baseY;
      if (Math.abs(vx) > 40) c.dir = Math.sign(vx);
    } else {
      c.vx = vx; c.vy = vy; c.onGround = false;
    }
    if (Math.hypot(vx, vy) > 120) say(c, pick(LINES[c.kind].toss), 1.4);
  }
  canvas.addEventListener('pointerup', () => { release(); setCursor(); });
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { if (!pointer.drag) pointer.inside = false; });

  function skyClick(x, y) {
    const { cx, cy, r } = celestial();
    if (mood.sun > 0.5 && Math.hypot(x - cx, y - cy) < r + 6) {
      sunSpin = 8; sunWink = 0.6;
      sparkles(cx, cy, 16);
      say(sunAnchor, pick(['hello down there!', 'have a sunny day!', 'wink!']));
      return;
    }
    if (mood.moon > 0.5 && Math.hypot(x - cx, y - cy) < r + 6) {
      say(sunAnchor, pick(['zzz...', 'shh, sleeping', '5 more minutes']));
      return;
    }
    const gy = Math.min(y, GROUND);
    switch (view.kind) {
      case 'storm':
        strike(x, gy);
        break;
      case 'rain':
        for (let i = 0; i < 10; i++) addParticle({ type: 'px', x, y, vx: rand(-40, 40), vy: rand(-70, -20), g: 300, life: rand(0.3, 0.6), color: '#cfe9ff' });
        addParticle({ type: 'ring', x: Math.round(x), y: Math.round(y), life: 0.5, color: '#e6f4ff' });
        break;
      case 'snow':
        for (let i = 0; i < 24; i++) {
          const a = rand(0, 6.28), s = rand(10, 50);
          addParticle({ type: 'flake', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(1.5, 3), color: '#ffffff', drag: true });
        }
        break;
      case 'cloudy':
      case 'fog': {
        const c = makeCloud(CLOUD_PLAN[view.kind].tone, { w: rand(22, 36), target: 0.95 });
        c.x = x - c.spr.width / 2; c.y = y - c.spr.height / 2;
        clouds.push(c);
        break;
      }
      default:
        if (!view.isDay) {
          addParticle({ type: 'trail', x, y, vx: rand(80, 120) * (Math.random() < 0.5 ? -1 : 1), vy: rand(30, 50), life: 0.8, color: '#fff8d0' });
        } else sparkles(x, y, 12);
    }
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    T += dt;
    easeMood(dt);
    updateClouds(dt);
    sunSpin += (1 - sunSpin) * Math.min(1, dt * 1.5);
    sunWink -= dt;

    for (const c of critters) (c.flier ? updateFlier : updateWalker)(c, dt);

    // Things raindrops bounce off: critter umbrellas and the umbrella cursor.
    const shields = [];
    for (const c of critters) if (!c.flier && c.umb > 0.6 && !c.drag) shields.push({ x: c.x - 6, w: 13, y: c.y - c.size.h - 5 });
    if (showUmbrellaCursor()) shields.push({ x: pointer.x - 6, w: 13, y: pointer.y - 6 });

    const rt = rainTarget();
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      const py = d.y;
      d.y += d.vy * dt;
      d.x += view.windX * dt;
      let hit = null, ground = false;
      if (d.y >= d.landY) { hit = d.landY; ground = true; }
      else for (const s of shields) if (d.x >= s.x && d.x <= s.x + s.w && py < s.y && d.y >= s.y) { hit = s.y; break; }
      if (hit !== null) {
        splash(d.x, hit, ground);
        if (drops.length > rt) { drops[i] = drops[drops.length - 1]; drops.pop(); }
        else Object.assign(d, newDrop(false));
      }
    }
    for (let i = 0; drops.length < rt && i < 12; i++) drops.push(newDrop(drops.length < rt * 0.3));

    const st = snowTarget();
    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i];
      f.vx *= Math.pow(0.1, dt);
      if (pointer.inside) {
        const dx = f.x - pointer.x, dy = f.y - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < 400 && d2 > 0.1) { const d = Math.sqrt(d2); f.vx += dx / d * 300 * dt; f.y += dy / d * 30 * dt; }
      }
      if (flakes.length > st) f.vy += 120 * dt; // clear out leftover snow quickly
      f.y += f.vy * dt;
      f.x += (view.windX * 0.6 + Math.sin(T * 1.5 + f.ph) * 8 + f.vx) * dt;
      if (f.y >= f.landY || f.x < -30 || f.x > W + 30) {
        if (flakes.length > st) { flakes[i] = flakes[flakes.length - 1]; flakes.pop(); }
        else Object.assign(f, newFlake(false));
      }
    }
    for (let i = 0; flakes.length < st && i < 8; i++) flakes.push(newFlake(flakes.length < st * 0.3));

    for (const p of particles) {
      p.life -= dt;
      if (p.drag) { p.vx *= Math.pow(0.05, dt); p.vy = p.vy * Math.pow(0.05, dt) + 20 * dt; }
      p.vy += (p.g || 0) * dt;
      p.x += p.vx * dt || 0;
      p.y += p.vy * dt || 0;
      if (p.type === 'drop' && p.y >= GROUND + 2) { splash(p.x, GROUND + 2, true); p.life = 0; }
      if (p.type === 'flake' && p.y >= GROUND + 2) p.life = Math.min(p.life, 0.3);
    }
    particles = particles.filter(p => p.life > 0);
    if (particles.length > 1500) particles.splice(0, particles.length - 1500);

    for (const b of bolts) b.life -= dt;
    bolts = bolts.filter(b => b.life > 0);
    flash = Math.max(0, flash - dt * 3);
    if (view.kind === 'storm') {
      lightningTimer -= dt;
      if (lightningTimer <= 0) { lightningTimer = rand(3, 8); strike(rand(W * 0.05, W * 0.95), GROUND + 2); }
    }

    updateBubbles(dt);
  }

  // ---------------------------------------------------------------- draw
  function drawGround() {
    ctx.drawImage(groundGrass, 0, GROUND - 3);
    if (mood.snow > 0.01) { ctx.globalAlpha = mood.snow; ctx.drawImage(groundSnow, 0, GROUND - 3); ctx.globalAlpha = 1; }
    if (mood.wet > 0.02) {
      for (const p of puddles) {
        ctx.globalAlpha = mood.wet * 0.85;
        ctx.fillStyle = mood.snow > 0.5 ? '#dbeeff' : '#7ec8ff';
        const x = p.x - p.w / 2 | 0, y = GROUND + 2;
        ctx.fillRect(x + 3, y, p.w - 6, 1);
        ctx.fillRect(x, y + 1, p.w, 2);
        ctx.fillRect(x + 3, y + 3, p.w - 6, 1);
        ctx.fillStyle = '#c4e6ff';
        ctx.fillRect(x + 4, y + 1, 4, 1);
      }
      ctx.globalAlpha = 1;
    }
    if (mood.dark > 0.01) {
      ctx.fillStyle = `rgba(14,16,48,${0.45 * mood.dark})`;
      ctx.fillRect(0, GROUND - 3, W, H);
    }
  }

  function drawBolts() {
    for (const b of bolts) {
      if (Math.random() < 0.25) continue; // flicker
      ctx.globalAlpha = Math.min(1, b.life / 0.2);
      for (let i = 1; i < b.pts.length; i++) {
        const [x0, y0] = b.pts[i - 1], [x1, y1] = b.pts[i];
        ctx.fillStyle = '#fff3a0'; line(x0 + 1, y0, x1 + 1, y1);
        ctx.fillStyle = '#ffffff'; line(x0, y0, x1, y1);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawWeather() {
    if (drops.length) {
      ctx.fillStyle = view.isDay ? '#cfe6ff' : '#8fa8d6';
      ctx.globalAlpha = 0.85;
      const slant = view.windX / 200;
      for (const d of drops) {
        for (let k = 0; k < d.len; k++) ctx.fillRect(Math.round(d.x - k * slant), Math.round(d.y - k), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    if (flakes.length) {
      ctx.fillStyle = '#ffffff';
      for (const f of flakes) ctx.fillRect(Math.round(f.x), Math.round(f.y), f.s, f.s);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.max * 2, 0, 1);
      ctx.globalAlpha = a;
      const x = Math.round(p.x), y = Math.round(p.y);
      switch (p.type) {
        case 'heart':
          drawSprite(SPR.heart, x - 3, y - 3, true);
          break;
        case 'ring': {
          const r = Math.round((1 - p.life / p.max) * 6) + 1;
          ctx.fillStyle = p.color;
          ctx.fillRect(x - r, y, 1, 1); ctx.fillRect(x + r, y, 1, 1);
          ctx.fillRect(x - r + 1, y - 1, r * 2 - 1, 1); ctx.fillRect(x - r + 1, y + 1, r * 2 - 1, 1);
          break;
        }
        case 'spark':
          ctx.fillStyle = p.color;
          ctx.fillRect(x, y, 1, 1);
          if (p.life / p.max > 0.4) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
          break;
        case 'trail': {
          ctx.fillStyle = p.color;
          const sp = Math.hypot(p.vx, p.vy);
          for (let k = 0; k < 10; k++) {
            ctx.globalAlpha = a * (1 - k / 10);
            ctx.fillRect(Math.round(p.x - p.vx / sp * k), Math.round(p.y - p.vy / sp * k), 1, 1);
          }
          break;
        }
        case 'drop':
          ctx.fillStyle = p.color;
          ctx.fillRect(x, y, 1, 3);
          break;
        default:
          ctx.fillStyle = p.color;
          ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFog() {
    if (mood.fog < 0.02) return;
    ctx.fillStyle = mood.dark > 0.5 ? '#8c919c' : '#f2f3f5';
    for (const b of fogBands) {
      ctx.globalAlpha = 0.32 * mood.fog;
      for (let x = 0; x < W; x += 2) {
        const off = Math.round(Math.sin((x + b.ph + T * b.sp) * 0.05) * b.amp + Math.sin((x - T * b.sp * 0.5) * 0.013) * b.amp * 2);
        ctx.fillRect(x, b.y + off, 2, b.h);
      }
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    drawSky();
    drawStars();
    drawSun();
    drawMoon();
    drawClouds();
    drawBolts();
    drawGround();
    for (const c of critters) if (!c.flier) drawCritter(c);
    for (const c of critters) if (c.flier) drawCritter(c);
    drawWeather();
    drawParticles();
    drawFog();
    if (showUmbrellaCursor()) drawSprite(SPR.umbV, pointer.x - 6, pointer.y - 7, true);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------- sizing
  function resize() {
    SCALE = Math.max(3, Math.round(Math.min(innerWidth, innerHeight) / 180));
    W = Math.ceil(innerWidth / SCALE);
    H = Math.ceil(innerHeight / SCALE);
    canvas.width = W; canvas.height = H;
    canvas.style.width = W * SCALE + 'px';
    canvas.style.height = H * SCALE + 'px';
    ctx.imageSmoothingEnabled = false;
    GROUND = H - Math.max(16, Math.round(H * 0.13));
    initScenery();
    for (const c of critters) {
      c.x = clamp(c.x, 8, W - 8);
      if (c.flier) c.baseY = clamp(c.baseY, 16, GROUND - 30);
      else { c.y = GROUND + 1; c.onGround = true; c.vy = 0; }
    }
    drops = []; flakes = [];
  }

  // ---------------------------------------------------------------- live weather (Open-Meteo, no key needed)
  const WMO = {
    0: ['Clear sky', 'clear'], 1: ['Mostly clear', 'clear'], 2: ['Partly cloudy', 'cloudy'], 3: ['Overcast', 'cloudy'],
    45: ['Foggy', 'fog'], 48: ['Icy fog', 'fog'],
    51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Heavy drizzle', 'rain'], 56: ['Freezing drizzle', 'rain'], 57: ['Freezing drizzle', 'rain'],
    61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'], 66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
    71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'],
    80: ['Rain showers', 'rain'], 81: ['Rain showers', 'rain'], 82: ['Violent showers', 'rain'],
    85: ['Snow showers', 'snow'], 86: ['Heavy snow showers', 'snow'],
    95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm + hail', 'storm'], 99: ['Thunderstorm + hail', 'storm'],
  };
  const HEAVY = new Set([55, 65, 67, 75, 82, 86, 99]);
  const LIGHT = new Set([51, 61, 71, 80, 85]);
  const CITIES = [
    ['Tokyo', 35.68, 139.69, 'JP'], ['London', 51.51, -0.13, 'GB'], ['Reykjavik', 64.15, -21.94, 'IS'],
    ['Mumbai', 19.08, 72.88, 'IN'], ['Rio', -22.91, -43.17, 'BR'], ['Cairo', 30.04, 31.24, 'EG'],
    ['Sydney', -33.87, 151.21, 'AU'], ['Seattle', 47.61, -122.33, 'US'],
  ];

  const hour = new Date().getHours();
  const live = { kind: 'clear', cond: 'Loading weather', isDay: hour >= 6 && hour < 19, tempC: null, wind: 10, windDir: 270, place: '', intensity: 1, loaded: false, lat: null, lon: null };
  let override = null, dayOverride = null;
  const pref = (k, d) => { try { return localStorage.getItem('pixel-weather-' + k) || d; } catch { return d; } };
  const savePref = (k, v) => { try { localStorage.setItem('pixel-weather-' + k, v); } catch { /* storage unavailable */ } };
  let unit = pref('unit', 'F');

  function applyView() {
    const prevKind = view.kind, prevDay = view.isDay;
    view.kind = override || live.kind;
    view.isDay = dayOverride ?? live.isDay;
    view.intensity = override ? 1 : live.intensity;
    const rad = live.windDir * Math.PI / 180;
    view.windX = clamp(-Math.sin(rad) * live.wind * 1.6 * (view.kind === 'storm' ? 1.4 : 1), -70, 70);
    if (Math.abs(view.windX) < 4) view.windX = 4;
    if (prevKind !== view.kind || prevDay !== view.isDay || !clouds.length) planClouds();
    if (prevKind !== view.kind && view.kind === 'storm') lightningTimer = 0.8;
    if (prevKind !== view.kind && critters.length) {
      const c = pick(critters.filter(x => !x.flier));
      setTimeout(() => say(c, pick(LINES[c.kind][view.kind])), 600);
    }
    renderHud();
  }

  function renderHud() {
    $('#place').textContent = live.place || 'Finding you...';
    const t = live.tempC == null ? null : Math.round(unit === 'F' ? live.tempC * 9 / 5 + 32 : live.tempC);
    $('#temp').innerHTML = t == null ? '--' : `${t}<span class="deg"></span>${unit}`;
    $('#cond').textContent = override ? `Preview: ${LABELS[override]}` : live.cond;
    $('#extra').textContent = live.loaded
      ? `Wind ${Math.round(unit === 'F' ? live.wind * 0.621 : live.wind)} ${unit === 'F' ? 'mph' : 'km/h'} · ${live.isDay ? 'daytime' : 'nighttime'} there`
      : '';
    for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('on', b.dataset.mode === (override || 'live'));
    $('#daynight').textContent = view.isDay ? 'Night' : 'Day';
    $('#daynight').classList.toggle('on', dayOverride !== null);
    $('#unit').innerHTML = `<span class="deg"></span>${unit === 'F' ? 'C' : 'F'}`;
  }

  let loadSeq = 0;
  async function loadWeather(lat, lon, place) {
    const seq = ++loadSeq;
    Object.assign(live, { place, lat, lon });
    $('#place').textContent = place;
    $('#cond').textContent = 'Checking the sky...';
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`
        + '&current=temperature_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m&timezone=auto';
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const c = (await res.json()).current;
      if (seq !== loadSeq) return;
      const [cond, kind] = WMO[c.weather_code] || ['Unknown', 'cloudy'];
      Object.assign(live, {
        kind, cond, tempC: c.temperature_2m, isDay: !!c.is_day, wind: c.wind_speed_10m, windDir: c.wind_direction_10m,
        intensity: HEAVY.has(c.weather_code) ? 1.5 : LIGHT.has(c.weather_code) ? 0.6 : 1, loaded: true,
      });
    } catch {
      if (seq !== loadSeq) return;
      Object.assign(live, { cond: "Couldn't reach the weather service", loaded: false, tempC: null });
    }
    applyView();
  }

  async function searchCity(name) {
    $('#cond').textContent = 'Searching...';
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`);
      const g = (await res.json()).results?.[0];
      if (!g) { $('#cond').textContent = `Couldn't find "${name}"`; return; }
      override = null;
      loadWeather(g.latitude, g.longitude, g.country_code ? `${g.name}, ${g.country_code}` : g.name);
    } catch {
      $('#cond').textContent = 'Search failed, try again';
    }
  }

  function loadCity(c) { override = null; loadWeather(c[1], c[2], `${c[0]}, ${c[3]}`); }

  function locate(onFail) {
    if (!navigator.geolocation) { onFail?.(); return; }
    $('#place').textContent = 'Finding you...';
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: la, longitude: lo } = pos.coords;
      let name = 'Your location';
      try {
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${la}&longitude=${lo}&localityLanguage=en`);
        const j = await res.json();
        const city = j.city || j.locality;
        if (city) name = j.countryCode ? `${city}, ${j.countryCode}` : city;
      } catch { /* keep generic name */ }
      override = null;
      loadWeather(la, lo, name);
    }, () => onFail?.(), { timeout: 8000, maximumAge: 600000 });
  }

  // ---------------------------------------------------------------- HUD wiring
  const chips = $('#chips');
  for (const c of CITIES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c[0];
    b.addEventListener('click', () => loadCity(c));
    chips.appendChild(b);
  }
  $('#search').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#city').value.trim();
    if (v) { searchCity(v); $('#city').blur(); }
  });
  $('#locate').addEventListener('click', () => locate(() => { $('#cond').textContent = 'Location is blocked or unavailable'; }));
  for (const b of document.querySelectorAll('#modes button')) {
    b.addEventListener('click', () => {
      override = b.dataset.mode === 'live' ? null : b.dataset.mode;
      if (!override) dayOverride = null;
      applyView();
    });
  }
  $('#daynight').addEventListener('click', () => { dayOverride = !view.isDay; applyView(); });
  $('#unit').addEventListener('click', () => { unit = unit === 'F' ? 'C' : 'F'; savePref('unit', unit); renderHud(); });

  // ---------------------------------------------------------------- start
  addEventListener('resize', resize);
  resize();
  initCritters();
  applyView();
  locate(() => loadCity(pick(CITIES)));
  setInterval(() => { if (live.lat != null) loadWeather(live.lat, live.lon, live.place); }, 10 * 60 * 1000);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Small hook for automated checks and the browser console.
  window.pixelWeather = { setWeather: k => { override = k; applyView(); }, setNight: n => { dayOverride = n ? false : true; applyView(); } };
})();
