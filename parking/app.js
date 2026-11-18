import * as THREE from 'three';
import { RGBELoader } from './vendor/jsm/RGBELoader.js';
import { GroundProjectedSkybox } from './vendor/jsm/GroundProjectedSkybox.js';

// ───────────────────────── constants (metres, radians) ─────────────────────────
const DEG = Math.PI / 180;
// Exam car: VW Santana-class sedan. Steering is a little quicker than the real car so that
// one full-lock arc fits the bay (see LANE_Y).
const CAR = { len: 4.475, wid: 1.706, wb: 2.603, fo: 0.88, ro: 0.992, track: 1.47, maxSteer: 38 * DEG, lock: 540 };
const HW = CAR.wid / 2;
const XF = CAR.wb + CAR.fo; // front bumper, measured from the rear axle
const XR = -CAR.ro; // rear bumper
// Site per the C1 exam standard: bay = car + 0.6 m wide, car + 0.7 m deep,
// lane = 1.5 car lengths wide, control lines 1.5 car lengths from the bay edge.
const GW = CAR.wid + 0.6;
const GD = CAR.len + 0.7;
const HG = GW / 2;
const RW = 1.5 * CAR.len;
const CX = HG + 1.5 * CAR.len;
const XE = CX + 7.4;
const LW = 0.15;
const RMIN = CAR.wb / Math.tan(CAR.maxSteer); // rear-axle turning radius at full lock
// Start 1.7 m off the bay-side edge line: with a 3.3 m rear-axle radius one full-lock arc
// then clears the bay corner by ~17 cm and ends centred.
const LANE_Y = 1.7 + HW;
const START = { x: CX + 1.9, y: LANE_Y, th: 0 };
const TIME_LIMIT = 210;
const STEER_KEY_RATE = 460; // deg/s while holding A/D
const STEER_SNAP_RATE = 900; // deg/s for Q/E/X
const EYE = { x: 1.22, y: 1.2, z: -0.36 }; // driver's eye in the car frame (left-hand drive)

// Painted lines as world rects [x0, y0, x1, y1]. Boundaries sit on the inner edge.
const LINES = [
  [-XE - LW, RW, XE + LW, RW + LW],
  [-XE - LW, -LW, -HG, 0],
  [HG, -LW, XE + LW, 0],
  [-HG - LW, -GD - LW, -HG, -LW],
  [HG, -GD - LW, HG + LW, -LW],
  [-HG, -GD - LW, HG, -GD],
  [-XE - LW, 0, -XE, RW],
  [XE, 0, XE + LW, RW],
  [-CX - LW / 2, 0, -CX + LW / 2, RW],
  [CX - LW / 2, 0, CX + LW / 2, RW],
];
const DASHES = [];
for (let x = -HG + 0.1; x < HG - 0.1; x += 0.5) DASHES.push([x, -0.07, Math.min(x + 0.28, HG), 0]);

const PHASES = ['① 右倒库', '② 出库到左侧', '③ 左倒库', '④ 出库回起点', '完成'];
const PHASE_LONG = ['从起点倒入车库', '前进驶过左侧控制线', '从左侧倒入车库', '前进驶过右侧控制线回到起点', ''];
const VIEWS = ['cabin', 'top', 'chase'];
const VIEW_NAME = { cabin: '车内', top: '俯视', chase: '车后' };

// ───────────────────────── helpers ─────────────────────────
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = (a) => {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

// ───────────────────────── state ─────────────────────────
const S = {};
const K = { gas: false, brake: false, left: false, right: false };
const look = { yaw: 0, pitch: 0, glance: null, drag: null };
// gamepad state, refreshed every frame by pollPad()
const PAD = { on: false, gp: null, left: false, right: false, brake: 0, gas: 0, steer: false, look: false, glance: null, prev: {} };
let lastInput = 'kb';
const GEARS = ['P', 'R', 'N', 'D'];
let mode = 'practice';
let view = 'cabin';
let aid = store.get('parking.aid', '1') === '1';
let voice = store.get('parking.voice', '1') === '1';
let vmax = parseFloat(store.get('parking.vmax', '0.8')) || 0.8;

const newPh = () => ({ moved: 0, wrong: 0, stopT: 0, stopHit: false, parkT: 0, entered: false });

function reset() {
  Object.assign(S, {
    x: START.x, y: START.y, th: START.th, v: 0,
    steer: 0, steerTarget: null, gear: 'P', brake: 1, dist: 0,
    t: 0, started: false, over: false, phase: 0,
    score: 100, stops: 0, outs: 0, out: false, parks: [], failReason: '',
    ph: newPh(), braking: false,
  });
  for (const k in K) K[k] = false;
  look.yaw = 0; look.pitch = 0;
  syncPedals();
  hideModal();
  if (mode === 'exam') say('倒车入库，考试开始');
}

const gearDir = () => (S.gear === 'R' ? -1 : S.gear === 'D' ? 1 : 0);
function setGear(g) {
  if (S.over || g === S.gear) return;
  if (!K.brake && PAD.brake < 0.5 && S.brake < 0.5) return toast('先踩住刹车再换挡', 'warn');
  if (Math.abs(S.v) > 0.15) return toast('车停稳再换挡', 'warn');
  S.gear = g;
}

function corners(s) {
  const c = Math.cos(s.th), n = Math.sin(s.th);
  const P = (X, Y) => ({ x: s.x + X * c - Y * n, y: s.y + X * n + Y * c });
  return [P(XF, HW), P(XF, -HW), P(XR, -HW), P(XR, HW)]; // FL FR RR RL
}
const inAllowed = (p) =>
  (p.y >= 0 && p.y <= RW && Math.abs(p.x) <= XE) || (p.y < 0 && p.y >= -GD && Math.abs(p.x) <= HG);
function bayCornerInside(s) {
  const c = Math.cos(s.th), n = Math.sin(s.th);
  for (const kx of [-HG, HG]) {
    const dx = kx - s.x, dy = 0 - s.y;
    const X = dx * c + dy * n, Y = -dx * n + dy * c;
    if (X > XR + 0.01 && X < XF - 0.01 && Math.abs(Y) < HW - 0.01) return true;
  }
  return false;
}

// ───────────────────────── simulation ─────────────────────────
function step(dt) {
  const turnL = K.left || PAD.left, turnR = K.right || PAD.right;
  if (turnL !== turnR) {
    S.steerTarget = null;
    S.steer += (turnR ? 1 : -1) * STEER_KEY_RATE * dt;
  } else if (S.steerTarget !== null) {
    const d = S.steerTarget - S.steer, m = STEER_SNAP_RATE * dt;
    if (Math.abs(d) <= m) { S.steer = S.steerTarget; S.steerTarget = null; } else S.steer += Math.sign(d) * m;
  }
  S.steer = clamp(S.steer, -CAR.lock, CAR.lock);

  // automatic gearbox: in D or R the car creeps at idle; the brake pedal is what holds it
  const wantBrake = S.over ? 1 : Math.max(K.brake ? 1 : 0, PAD.brake);
  S.brake += clamp(wantBrake - S.brake, -5 * dt, 4 * dt);
  S.braking = S.brake > 0.05;
  const dir = gearDir();
  let drive = 0;
  if (dir) {
    const along = S.v * dir;
    const gas = S.over ? 0 : Math.max(K.gas ? 1 : 0, PAD.gas);
    if (gas > 0.05) drive = along < vmax + (2.2 - vmax) * gas ? 0.9 + 0.5 * gas : 0;
    else drive = along < vmax ? 1.2 * (1 - along / vmax) : -0.5; // idle creep fades as speed builds, so a light brake holds a lower speed
    drive *= dir * (1 - S.brake);
  }
  const resist = S.brake * 3 + (dir ? 0 : 0.25) + (S.gear === 'P' ? 8 : 0);
  if (Math.abs(S.v) < 0.004) {
    S.v = Math.abs(drive) > resist ? (drive - Math.sign(drive) * resist) * dt : 0;
  } else {
    S.v += drive * dt;
    const dec = resist * dt;
    S.v = Math.abs(S.v) <= dec ? 0 : S.v - Math.sign(S.v) * dec;
  }

  const delta = (-S.steer / CAR.lock) * CAR.maxSteer;
  const ds = S.v * dt;
  const dth = (ds * Math.tan(delta)) / CAR.wb;
  S.x += ds * Math.cos(S.th + dth / 2);
  S.y += ds * Math.sin(S.th + dth / 2);
  S.th = norm(S.th + dth);
  S.dist += ds;

  if (!S.started && Math.abs(S.v) > 0.02) S.started = true;
  if (S.started && !S.over && S.phase < 4) S.t += dt;
  judge(dt, ds);
}

function judge(dt, ds) {
  if (S.over || S.phase >= 4) return;
  const exam = mode === 'exam';
  const cs = corners(S);
  const bad = cs.some((p) => !inAllowed(p)) || bayCornerInside(S);
  if (bad && !S.out) {
    S.outs++;
    if (exam) { S.out = true; return fail('车身出线'); }
    rumble(350, 1);
    toast('车身出线（考试中直接不合格）', 'bad');
    say('车身出线');
  }
  S.out = bad;

  const ph = S.ph;
  const dir = S.phase % 2 === 0 ? -1 : 1;
  if (ds * dir > 0) ph.moved += Math.abs(ds);
  else if (ph.moved > 0.2 || dir > 0) ph.wrong += Math.abs(ds);

  const allIn = !bad && cs.every((p) => p.y < 0);
  const still = Math.abs(S.v) < 0.01;
  const frontAxleX = S.x + CAR.wb * Math.cos(S.th);

  if (dir < 0) {
    if (cs[2].y < 0 || cs[3].y < 0) ph.entered = true;
    if (ph.wrong > 0.5) {
      ph.wrong = 0;
      const why = ph.entered ? '倒库不入' : '不按规定路线行驶';
      if (exam) return fail(why);
      toast(`倒库途中前进：考试中判「${why}」`, 'bad');
    }
    if (allIn && still) {
      ph.parkT += dt;
      if (ph.parkT > 0.7) return parked(cs);
    } else ph.parkT = 0;
  } else {
    if (ph.wrong > 0.5) {
      ph.wrong = 0;
      if (exam) return fail('不按规定路线行驶');
      toast('出库途中后退：考试中判「不按规定路线行驶」', 'bad');
    }
    if (S.phase === 1 && frontAxleX < -CX) { nextPhase(); toast('前轮已过控制线，停车后倒车', 'good'); return; }
    if (S.phase === 3 && frontAxleX > CX) return finish();
  }

  if (S.started && still) {
    ph.stopT += dt;
    if (ph.stopT > 2 && !ph.stopHit && ph.moved > 0.3 && !(dir < 0 && allIn)) {
      ph.stopHit = true;
      S.stops++;
      S.score -= 5;
      rumble(150, 0.5);
      toast('中途停车 −5 分', 'warn');
      say('中途停车，扣5分');
      if (exam && S.score < 80) return fail('扣分后成绩低于 80 分');
    }
  } else if (Math.abs(S.v) > 0.05) {
    ph.stopT = 0;
    ph.stopHit = false;
  }
  if (exam && S.t > TIME_LIMIT) return fail('项目超时（超过 210 秒）');
}

function nextPhase() { S.phase++; S.ph = newPh(); }

function parked(cs) {
  const xs = cs.map((p) => p.x), ys = cs.map((p) => p.y);
  const m = {
    side: S.phase === 0 ? '右倒库' : '左倒库',
    left: Math.min(...xs) + HG,
    right: HG - Math.max(...xs),
    front: -Math.max(...ys),
    rear: Math.min(...ys) + GD,
    ang: norm(S.th - Math.PI / 2) / DEG,
  };
  S.parks.push(m);
  nextPhase();
  toast(`入库完成 ✓  左 ${cm(m.left)} · 右 ${cm(m.right)} · 偏 ${Math.abs(m.ang).toFixed(1)}°`, 'good');
}
const cm = (v) => `${Math.round(v * 100)} cm`;

function finish() {
  S.phase = 4;
  S.over = true;
  const pass = S.score >= 80;
  if (mode === 'exam') {
    say(pass ? '考试合格' : '考试不合格');
    if (pass) {
      const best = parseFloat(store.get('parking.best', '0')) || 0;
      if (!best || S.t < best) store.set('parking.best', S.t.toFixed(1));
    }
  } else say('练习完成');
  showResult();
}

function fail(reason) {
  rumble(500, 1);
  S.over = true;
  S.failReason = reason;
  S.score = 0;
  say(`${reason.replace(/（.*）/, '')}，考试不合格`);
  showResult();
}

// ───────────────────────── coaching (practice + aids) ─────────────────────────
// Phases 2/3 are mirror images of 0/1, so reason in the mirrored frame.
const turnLead = () => 0.3 * vmax; // start winding the wheel a little before the geometric point

function coach() {
  if (S.over || S.phase >= 4) return '';
  const mir = S.phase >= 2;
  const x = mir ? -S.x : S.x;
  const th = norm(mir ? Math.PI - S.th : S.th);
  const st = mir ? -S.steer : S.steer;
  const sideR = mir ? '左' : '右', sideL = mir ? '右' : '左';
  const pad = lastInput === 'pad';
  const keyR = pad ? '摇杆推到底' : mir ? 'Q' : 'E', keyL = pad ? '摇杆推到底' : mir ? 'E' : 'Q';
  const ctr = pad ? '松开摇杆' : 'X';
  const a = th / DEG;
  const cs = corners(S);
  const allIn = cs.every((p) => p.y < 0) && !S.out;

  const need = S.phase % 2 === 0 ? 'R' : 'D';
  const stopped = Math.abs(S.v) < 0.02;
  if (S.gear !== need) {
    if (!stopped) return S.phase === 2 ? '前轮已过控制线，踩刹车停稳，再挂 R 挡' : '踩刹车停稳';
    if (pad) return `踩住刹车（LT），用 LB / RB 把挡位切到 ${need}，再松开刹车`;
    return `踩住刹车（S 或空格），挂 ${need} 挡（按 ${need === 'R' ? 2 : 4}），再松开刹车`;
  }
  if (stopped && S.brake > 0.3 && !(S.phase % 2 === 0 && allIn)) return '松开刹车，车会自己慢慢走；踩刹车就停';

  if (S.phase % 2 === 0) {
    if (S.ph.moved < 0.05) return `倒车中 · 到地面蓝色虚线（打死点）时向${sideR}打死`;
    if (Math.abs(a) < 8 && S.y > 0.5) {
      const d = x - (RMIN + turnLead());
      if (st > 500) return '保持打死，继续后退';
      if (d > 0.3) return `直线后退，距打死点还有 ${d.toFixed(1)} m`;
      if (d > -0.5) return `到点了，向${sideR}打死（${keyR}）`;
      return `已过打死点 ${(-d).toFixed(1)} m，入库会偏，建议重来`;
    }
    if (a >= 8 && a < 82) {
      if (st > 500) return `保持打死 · 车身已转 ${Math.round(a)}°，快到 90° 时回正`;
      return a > 60 ? '看后视镜里车身和库线的夹角，修正方向' : `向${sideR}打死（${keyR}）`;
    }
    if (a >= 82 && a <= 98) {
      if (Math.abs(st) > 60 && Math.abs(a - 90) < 5) return '车身已正，回正方向盘（' + ctr + '）';
      if (allIn) return '已全部入库，踩刹车停车';
      if (Math.abs(S.x) > 0.1 && cs[2].y > -GD + 1.5)
        return `车身偏${S.x > 0 ? '右' : '左'} ${Math.round(Math.abs(S.x) * 100)} cm，向${S.x > 0 ? '左' : '右'}微调方向`;
      return '保持回正，直线后退，车头过库口线后停车';
    }
    return '车身角度偏差较大，建议重来';
  }

  const b = a < 0 ? a + 360 : a;
  if (b > 82 && b < 98) {
    const d = LANE_Y - RMIN - turnLead() - S.y;
    if (st < -500) return '保持打死，继续前进';
    if (d > 0.3) return `直线前进，距打死点还有 ${d.toFixed(1)} m`;
    return `到点了，向${sideL}打死（${keyL}）`;
  }
  if (b >= 98 && b < 172) {
    if (st < -500) return '保持打死 · 车身快与边线平行时回正';
    return b > 150 ? '车身快平行了，回正方向盘（' + ctr + '）' : `向${sideL}打死（${keyL}）`;
  }
  if (b >= 172 && b <= 188) {
    if (Math.abs(st) > 60) return '车身已平行，回正方向盘（' + ctr + '）';
    const fa = x + CAR.wb * Math.cos(th);
    const d = Math.max(0, fa + CX);
    return S.phase === 1
      ? `直行，前轮过控制线后停车（还差 ${d.toFixed(1)} m）`
      : `直行，前轮过控制线回到起点（还差 ${d.toFixed(1)} m）`;
  }
  return '调整方向，保持车身在车道内';
}

// ───────────────────────── speech ─────────────────────────
function say(text) {
  if (!voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch (e) { /* speech is optional */ }
}

// ───────────────────────── three.js scene ─────────────────────────
// World (x east, y north) maps to three (x, up, -y). Car frame: +X forward, +Y up, +Z right.
const cv = $('cv');
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.autoClear = false;
renderer.setClearColor(0x0f1114, 1);
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function speckle(g, w, h, base, n, seed) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = r();
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.03 + r() * 0.07})` : `rgba(0,0,0,${0.04 + r() * 0.1})`;
    const s = 1 + r() * 2.2;
    g.fillRect(r() * w, r() * h, s, s);
  }
}
// world rect → flat mesh lying on the ground
function groundRect(x0, y0, x1, y1, h, material) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), material);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, h, -(y0 + y1) / 2);
  m.receiveShadow = true;
  return m;
}

// Sun direction read off the sky panorama, so cast shadows agree with the photographed light.
const SUN_DIR = new THREE.Vector3(0.683, 0.536, 0.496).normalize();

function buildWorld() {
  const tl = new THREE.TextureLoader();
  // photographed sky and surroundings (a real driving-school lot), projected so its ground meets ours
  tl.load('assets/driving_school_sky.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    const sky = new GroundProjectedSkybox(t, { height: 1.7, radius: 140 });
    sky.scale.setScalar(320);
    scene.add(sky);
  });
  new RGBELoader().load('assets/driving_school_1k.hdr', (hdr) => {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pm.dispose();
  });

  const sun = new THREE.DirectionalLight(0xfff0dc, 3.2);
  sun.position.copy(SUN_DIR).multiplyScalar(60);
  sun.target.position.set(0, 0, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 18, bottom: -18, near: 5, far: 130 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // sharp asphalt under the site, fading out into the photographed ground
  const GX = 120, GY = 90, TILE = 3.2;
  const map = (file, srgb) => {
    const t = tl.load(`assets/${file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(GX / TILE, GY / TILE);
    t.anisotropy = MAX_ANISO;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const fade = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, '#fff');
    gr.addColorStop(1, '#000');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GX, GY),
    new THREE.MeshStandardMaterial({
      map: map('asphalt_diff.jpg', true), normalMap: map('asphalt_nor.jpg'), roughnessMap: map('asphalt_rough.jpg'),
      alphaMap: fade, transparent: true, color: 0xffffff, metalness: 0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0.001, -(RW - GD) / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // worn road paint
  const paintTex = canvasTex(256, 256, (g, w, h) => {
    speckle(g, w, h, '#e9b92b', 2600, 11);
    const r = rng(5);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(70,66,60,${0.08 + r() * 0.2})`; g.fillRect(r() * w, r() * h, 2 + r() * 10, 1 + r() * 3); }
  }, [1, 1]);
  const paint = new THREE.MeshStandardMaterial({ map: paintTex, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  for (const [x0, y0, x1, y1] of LINES) scene.add(groundRect(x0, y0, x1, y1, 0.004, paint));
  const dash = paint.clone();
  dash.transparent = true;
  dash.opacity = 0.6;
  for (const [x0, y0, x1, y1] of DASHES) scene.add(groundRect(x0, y0, x1, y1, 0.004, dash));

  // ground labels: plan view only (layer 1)
  const label = (text, x, y, w) => {
    const t = canvasTex(256, 96, (g) => {
      g.font = '600 56px -apple-system, "PingFang SC", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillText(text, 128, 50);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 96) / 256), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, -y);
    m.layers.set(1);
    scene.add(m);
  };
  label('车 库', 0, -GD / 2, 2.2);
  label('控制线', -CX, RW + 1, 2.4);
  label('控制线', CX, RW + 1, 2.4);
  label('起点', START.x + 1.6, RW + 1, 2.4);
}

// ───────────────────────── car model ─────────────────────────
const RT = {
  left: new THREE.WebGLRenderTarget(640, 412),
  right: new THREE.WebGLRenderTarget(640, 412),
  inner: new THREE.WebGLRenderTarget(512, 128),
};
const car = new THREE.Group();
const carParts = {};
const MAT = {
  paint: new THREE.MeshPhysicalMaterial({ color: 0xf2f3f3, metalness: 0.1, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.06 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.75 }),
  cabin: new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.95 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x35383e, roughness: 0.95 }),
  liner: new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 1 }),
  glassFront: new THREE.MeshPhysicalMaterial({ color: 0xbfd0d8, transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.6 }),
  glassRear: new THREE.MeshPhysicalMaterial({ color: 0x3d4f57, transparent: true, opacity: 0.3, roughness: 0.02, metalness: 0, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.6 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xc4c8cd, metalness: 0.9, roughness: 0.3 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, metalness: 1, roughness: 0.12 }),
  lamp: new THREE.MeshPhysicalMaterial({ color: 0xf2f6f8, metalness: 0.6, roughness: 0.1, clearcoat: 1 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x7a0d0d, emissive: 0xff1a1a, emissiveIntensity: 0.1, roughness: 0.3 }),
  reverse: new THREE.MeshStandardMaterial({ color: 0xd9d9d9, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3 }),
  plate: new THREE.MeshStandardMaterial({ color: 0x2456b4, roughness: 0.5 }),
  lining: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 1, side: THREE.BackSide }),
  dash: new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.85 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.55 }),
  screen: new THREE.MeshBasicMaterial({ color: 0x050608 }), // unlit, so the sun does not blow out its edge
};

function box(w, h, d, mat, x, y, z, parent = car) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
const flipU = (geom) => { const uv = geom.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); };

// Body shell: cross-sections lofted nose to tail, so the body has real curvature, a tapered
// plan, a raked screen and wheel arches. Returns the roof-edge line for the pillars.
function buildShell() {
  const N = 121;
  const xs = Array.from({ length: N }, (_, i) => XR + ((XF - XR) * i) / (N - 1));
  const lin = (keys) => xs.map((x) => {
    let i = 1;
    while (i < keys.length - 1 && x > keys[i][0]) i++;
    const [x0, y0] = keys[i - 1], [x1, y1] = keys[i];
    return y0 + (y1 - y0) * clamp((x - x0) / (x1 - x0), 0, 1);
  });
  const smooth = (a, n) => {
    for (let k = 0; k < n; k++) { const b = a.slice(); for (let i = 1; i < a.length - 1; i++) b[i] = (a[i - 1] + 2 * a[i] + a[i + 1]) / 4; a = b; }
    return a;
  };
  const top = smooth(lin([[XR, 0.74], [-0.9, 0.95], [-0.45, 1.0], [-0.25, 1.03], [0.35, 1.42], [0.9, 1.46], [1.5, 1.43], [2.2, 1.02], [2.9, 0.94], [3.3, 0.85], [XF, 0.64]]), 3);
  const wid = smooth(lin([[XR, 0.68], [-0.9, 0.8], [-0.6, 0.845], [0, HW], [2.6, HW], [3.1, 0.83], [3.35, 0.76], [XF, 0.6]]), 4);
  const belt = smooth(lin([[XR, 0.72], [-0.9, 0.9], [-0.3, 0.97], [2.2, 0.96], [2.9, 0.88], [3.3, 0.8], [XF, 0.6]]), 3);
  const edge = smooth(lin([[XR, 0.55], [-0.3, 0.68], [0.35, 0.6], [1.5, 0.6], [2.2, 0.73], [XF, 0.5]]), 3);
  const bot = smooth(lin([[XR, 0.44], [-0.8, 0.27], [3.3, 0.27], [XF, 0.44]]), 2);

  const R = 16; // points per ring: 9 rows up the right side, 7 back down the left
  const pos = [];
  const roofEdge = [];
  for (let i = 0; i < N; i++) {
    const x = xs[i], w = wid[i], t = top[i], yb = bot[i];
    let arch = 0;
    for (const xw of [0, CAR.wb]) { const d = x - xw; if (Math.abs(d) < 0.375) arch = Math.max(arch, 0.31 + Math.sqrt(0.375 * 0.375 - d * d)); }
    const b = Math.min(belt[i], t - 0.02);
    const y1 = Math.max(yb + 0.02, arch);
    const y2 = Math.min(Math.max(0.6, arch + 0.05), b - 0.04);
    const z4 = Math.min(edge[i], 0.94 * w), y4 = Math.max(t - 0.035, b + 0.002);
    const rows = [
      [0, yb], [0.93 * w, y1], [0.972 * w, (y1 + y2) / 2], [w, y2], [0.994 * w, (y2 + b) / 2],
      [0.965 * w, b], [z4, y4], [0.55 * z4, t - 0.008], [0, t],
    ];
    for (let k = 0; k < 9; k++) pos.push(x, rows[k][1], rows[k][0]);
    for (let k = 7; k >= 1; k--) pos.push(x, rows[k][1], -rows[k][0]);
    roofEdge.push([x, y4, z4]);
  }
  const idx = [[], [], []]; // paint, front glass, rear glass
  for (let i = 0; i < N - 1; i++) {
    const xm = (xs[i] + xs[i + 1]) / 2;
    for (let k = 0; k < R; k++) {
      const band = k < 8 ? k : 15 - k; // which pair of rows this strip lies between
      let g = 0;
      if (band === 5) { if (xm > 1.02 && xm < 2.12) g = 1; else if (xm > -0.18 && xm < 0.9) g = 2; }
      else if (band >= 6) { if (xm > 1.55 && xm < 2.17) g = 1; else if (xm > -0.24 && xm < 0.33) g = 2; }
      const a = i * R + k, b2 = i * R + ((k + 1) % R), c = (i + 1) * R + ((k + 1) % R), d = (i + 1) * R + k;
      idx[g].push(a, c, b2, a, d, c);
    }
  }
  // close nose and tail
  for (const [i, x] of [[0, XR], [N - 1, XF]]) {
    const c = pos.length / 3;
    pos.push(x, (top[i] + bot[i]) / 2, 0);
    for (let k = 0; k < R; k++) { const a = i * R + k, b2 = i * R + ((k + 1) % R); idx[0].push(c, a, b2, c, b2, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx[0].concat(idx[1], idx[2]));
  g.addGroup(0, idx[0].length, 0);
  g.addGroup(idx[0].length, idx[1].length, 1);
  g.addGroup(idx[0].length + idx[1].length, idx[2].length, 2);
  g.computeVertexNormals();
  const shell = new THREE.Mesh(g, [MAT.paint, MAT.glassFront, MAT.glassRear]);
  shell.castShadow = true;
  // the same surface seen from inside: trim instead of paint
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  car.add(shell, new THREE.Mesh(g, [MAT.lining, hidden, hidden]));
  return roofEdge;
}

function tube(points, radius, mat) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, radius, 7), mat);
  m.castShadow = true;
  car.add(m);
}

function buildCar() {
  const roofEdge = buildShell();
  // pillars follow the roof edge of the shell
  for (const sg of [-1, 1]) {
    const seg = (x0, x1) => roofEdge.filter((p) => p[0] >= x0 && p[0] <= x1).map((p) => [p[0], p[1], sg * p[2]]);
    tube(seg(1.48, 2.2), 0.036, MAT.trim);
    tube(seg(-0.27, 0.4), 0.05, MAT.paint);
    box(0.1, 0.44, 0.04, MAT.trim, 0.96, 1.2, sg * 0.71).rotation.x = sg * 0.33; // B-pillar
    box(0.16, 0.025, 0.014, MAT.chrome, 0.57, 0.84, sg * (HW + 0.009));
    box(0.16, 0.025, 0.014, MAT.chrome, 1.15, 0.84, sg * (HW + 0.009));
  }

  // ── interior ──
  box(2.9, 0.03, 1.5, MAT.cabin, 0.9, 0.34, 0).castShadow = false; // floor
  // bulkheads: the shell is hollow, so close the cabin off from the engine bay and the boot
  box(0.03, 0.75, 1.5, MAT.dash, 2.185, 0.637, 0).castShadow = false;
  box(0.03, 0.68, 1.46, MAT.cabin, -0.27, 0.64, 0).castShadow = false;
  box(0.34, 0.02, 1.4, MAT.cabin, -0.12, 0.985, 0).castShadow = false; // parcel shelf
  // dashboard: side profile extruded across the cabin
  const dp = new THREE.Shape();
  dp.moveTo(2.17, 0.965);
  dp.lineTo(1.8, 0.975);
  dp.quadraticCurveTo(1.63, 0.98, 1.6, 0.93);
  dp.lineTo(1.58, 0.84);
  dp.quadraticCurveTo(1.6, 0.74, 1.7, 0.7);
  dp.lineTo(1.78, 0.45);
  dp.lineTo(2.17, 0.45);
  const dashG = new THREE.ExtrudeGeometry(dp, { depth: 1.5, bevelEnabled: false, curveSegments: 10 });
  dashG.translate(0, 0, -0.75);
  car.add(new THREE.Mesh(dashG, MAT.dash));
  // instrument cluster, drawn
  const cluster = canvasTex(512, 200, (g, w, h) => {
    g.fillStyle = '#07080a'; g.fillRect(0, 0, w, h);
    for (const [cx, max, label] of [[140, 8, 'x1000r/min'], [372, 220, 'km/h']]) {
      g.strokeStyle = '#d7dbe0'; g.lineWidth = 3;
      g.beginPath(); g.arc(cx, 112, 82, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
      g.fillStyle = '#d7dbe0'; g.font = '600 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * 0.8 + (i / 8) * Math.PI * 1.4;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * 82, 112 + Math.sin(a) * 82); g.lineTo(cx + Math.cos(a) * 70, 112 + Math.sin(a) * 70); g.stroke();
        g.fillText(String(Math.round((max * i) / 8)), cx + Math.cos(a) * 55, 112 + Math.sin(a) * 55);
      }
      g.font = '11px sans-serif'; g.fillText(label, cx, 150);
      g.strokeStyle = '#ff4433'; g.lineWidth = 4;
      const a0 = Math.PI * (label === 'km/h' ? 0.8 : 0.975);
      g.beginPath(); g.moveTo(cx, 112); g.lineTo(cx + Math.cos(a0) * 64, 112 + Math.sin(a0) * 64); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(cx, 112, 9, 0, 7); g.fill();
    }
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.117), new THREE.MeshBasicMaterial({ map: cluster }));
  face.position.set(1.612, 0.9, EYE.z);
  face.rotation.set(0, -Math.PI / 2, 0);
  face.rotateX(-0.2);
  box(0.07, 0.02, 0.36, MAT.dash, 1.63, 0.975, EYE.z); // cowl over the cluster
  car.add(face);
  // centre screen, vents, console, gear lever
  box(0.02, 0.13, 0.24, MAT.screen, 1.588, 0.9, 0.02);
  for (const vz of [-0.66, 0.66, 0.3]) box(0.02, 0.05, 0.14, MAT.trim, 1.59, 0.9, vz);
  box(0.75, 0.2, 0.2, MAT.dash, 1.25, 0.5, 0.0);
  box(0.03, 0.14, 0.03, MAT.chrome, 1.3, 0.66, 0.0);
  box(0.05, 0.05, 0.05, MAT.trim, 1.3, 0.74, 0.0);
  // seats: passenger and rear bench (the driver's own would only block the look over the shoulder)
  const seat = (x, z, w) => {
    box(0.5, 0.13, w, MAT.seat, x + 0.2, 0.5, z);
    const back = box(0.12, 0.62, w, MAT.seat, x - 0.08, 0.84, z);
    back.rotation.z = 0.2;
    box(0.09, 0.16, w * 0.5, MAT.seat, x - 0.15, 1.24, z);
  };
  seat(0.95, 0.37, 0.48);
  seat(0.02, 0, 1.28);
  box(0.5, 0.13, 0.48, MAT.seat, 1.15, 0.5, -0.37); // driver's cushion only
  // door armrests
  for (const sg of [-1, 1]) {
    box(0.7, 0.05, 0.07, MAT.dash, 1.25, 0.72, sg * 0.74);
  }

  // steering wheel: local Z is the column axis pointing at the driver
  const tilt = 24 * DEG;
  const sw = new THREE.Group();
  const zAxis = new THREE.Vector3(-Math.cos(tilt), Math.sin(tilt), 0);
  const yAxis = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0);
  sw.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), yAxis, zAxis));
  sw.position.set(1.5, 0.9, EYE.z);
  const spin = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.182, 0.019, 14, 56), MAT.leather);
  spin.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.075, 0.05, 28), MAT.dash);
  hub.rotation.x = Math.PI / 2;
  spin.add(hub);
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.054, 20), MAT.chrome);
  badge.rotation.x = Math.PI / 2;
  spin.add(badge);
  for (const [bx, by, bw, bh] of [[-0.118, 0.004, 0.12, 0.04], [0.118, 0.004, 0.12, 0.04], [0, -0.118, 0.045, 0.12]]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.022), MAT.dash);
    sp.position.set(bx, by, -0.004);
    spin.add(sp);
  }
  // 12 o'clock stitch, so full turns can be counted like on a real wheel
  const mark = new THREE.Mesh(new THREE.TorusGeometry(0.182, 0.0205, 10, 6, 0.09), new THREE.MeshStandardMaterial({ color: 0xd8a51c, roughness: 0.6 }));
  mark.rotation.z = Math.PI / 2 - 0.045;
  spin.add(mark);
  sw.add(spin);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12), MAT.dash);
  column.rotation.x = Math.PI / 2;
  column.position.z = -0.15;
  sw.add(column);
  car.add(sw);
  carParts.steer = spin;

  // lamps, plates, grille
  for (const sg of [-1, 1]) {
    box(0.16, 0.11, 0.3, MAT.lamp, XF - 0.13, 0.7, sg * 0.5);
    box(0.1, 0.11, 0.26, MAT.tail, XR + 0.045, 0.8, sg * 0.44);
    box(0.1, 0.06, 0.1, MAT.reverse, XR + 0.03, 0.8, sg * 0.28);
  }
  box(0.04, 0.11, 0.42, MAT.plate, XR - 0.004, 0.6, 0);
  box(0.04, 0.11, 0.42, MAT.plate, XF - 0.005, 0.5, 0);
  box(0.06, 0.09, 0.62, MAT.trim, XF - 0.035, 0.66, 0);

  // wheels
  const tyreG = new THREE.CylinderGeometry(0.31, 0.31, 0.21, 36);
  tyreG.rotateX(Math.PI / 2);
  const rimG = new THREE.CylinderGeometry(0.205, 0.205, 0.214, 28);
  rimG.rotateX(Math.PI / 2);
  const capG = new THREE.CylinderGeometry(0.05, 0.05, 0.224, 16);
  capG.rotateX(Math.PI / 2);
  carParts.wheels = [];
  carParts.pivots = [];
  for (const wx of [0, CAR.wb]) {
    for (const sg of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, 0.31, sg * (CAR.track / 2 + 0.005));
      const w = new THREE.Group();
      const tyre = new THREE.Mesh(tyreG, MAT.tyre);
      tyre.castShadow = true;
      w.add(tyre, new THREE.Mesh(rimG, MAT.rim), new THREE.Mesh(capG, MAT.chrome));
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.17, 0.218), MAT.tyre);
        const a = (i / 5) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.125, Math.sin(a) * 0.125, 0);
        sp.rotation.z = a + Math.PI / 5 + Math.PI / 2;
        w.add(sp);
      }
      pivot.add(w);
      car.add(pivot);
      carParts.wheels.push(w);
      if (wx) carParts.pivots.push(pivot);
    }
  }
  // dark wheel wells behind the arches
  for (const wx of [0, CAR.wb]) box(0.8, 0.5, CAR.track - 0.24, MAT.trim, wx, 0.5, 0).castShadow = false;

  // door mirrors: housing + glass showing the reflection texture
  carParts.glass = [];
  const doorMirror = (sg, tex) => {
    const g = new THREE.Group();
    g.position.set(1.98, 1.04, sg * (HW + 0.11));
    g.rotation.y = sg * 10 * DEG;
    const shellG = new THREE.SphereGeometry(0.1, 20, 14);
    shellG.scale(0.5, 0.62, 1.05);
    const shell = new THREE.Mesh(shellG, MAT.paint);
    shell.position.x = 0.042;
    shell.castShadow = true;
    g.add(shell);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.1), MAT.trim);
    arm.position.set(0.01, -0.05, -sg * 0.1);
    g.add(arm);
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.1, 28), MAT.trim);
    back.scale.set(1.03, 0.6, 1);
    back.rotation.y = -Math.PI / 2;
    back.position.x = -0.006;
    g.add(back);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.1, 28), new THREE.MeshBasicMaterial({ map: tex }));
    glass.scale.set(0.95, 0.54, 1);
    glass.rotation.y = -Math.PI / 2; // face rearwards
    glass.position.x = -0.009;
    flipU(glass.geometry); // a mirror swaps left and right
    g.add(glass);
    car.add(g);
    carParts.glass.push(glass);
  };
  doorMirror(-1, RT.left.texture);
  doorMirror(1, RT.right.texture);
  box(0.03, 0.07, 0.25, MAT.trim, 1.58, 1.33, 0.02).castShadow = false;
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.055), new THREE.MeshBasicMaterial({ map: RT.inner.texture }));
  inner.rotation.y = -Math.PI / 2;
  inner.position.set(1.563, 1.33, 0.02);
  flipU(inner.geometry);
  car.add(inner);
  carParts.glass.push(inner);

  // rear-axle marker for the plan view
  const axle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, CAR.wid + 0.6), new THREE.MeshBasicMaterial({ color: 0x4fd8ff }));
  axle.position.set(0, 1.6, 0);
  axle.layers.set(1);
  car.add(axle);
  carParts.axle = axle;

  scene.add(car);
}

// ───────────────────────── cameras ─────────────────────────
const eyeCam = new THREE.PerspectiveCamera(60, 1, 0.06, 800);
eyeCam.rotation.order = 'YXZ';
const chaseCam = new THREE.PerspectiveCamera(50, 1, 0.3, 800);
const topCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
topCam.up.set(0, 0, -1);
topCam.layers.enable(1);
const mirrorCam = {};
function buildCameras() {
  eyeCam.position.set(EYE.x, EYE.y, EYE.z);
  car.add(eyeCam);
  const side = (sg) => {
    const c = new THREE.PerspectiveCamera(30, 640 / 412, 0.05, 400);
    c.rotation.order = 'YXZ';
    c.position.set(1.9, 1.1, sg * (HW + 0.15));
    c.rotation.y = Math.PI / 2 + sg * 5 * DEG; // look back, toed out
    c.rotation.x = -15 * DEG;
    car.add(c);
    return c;
  };
  mirrorCam.left = side(-1);
  mirrorCam.right = side(1);
  const c = new THREE.PerspectiveCamera(13, 4, 0.05, 400);
  c.rotation.order = 'YXZ';
  c.position.set(1.54, 1.33, 0.02);
  c.rotation.y = Math.PI / 2;
  c.rotation.x = -2 * DEG;
  car.add(c);
  mirrorCam.inner = c;
}

// ───────────────────────── aids (turn point, predicted sweep) ─────────────────────────
const aids = new THREE.Group();
const AID_MAT = new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
let turnLine;
const sweep = [];
const SWEEP_N = 44;
function buildAids() {
  turnLine = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.09), AID_MAT);
    d.position.set(-1.35 + i * 0.45, 0, 0);
    turnLine.add(d);
  }
  aids.add(turnLine);
  for (let k = 0; k < 2; k++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SWEEP_N + 1) * 6), 3));
    const idx = [];
    for (let i = 0; i < SWEEP_N; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    g.setIndex(idx);
    const m = new THREE.Mesh(g, AID_MAT);
    m.frustumCulled = false;
    aids.add(m);
    sweep.push(m);
  }
  scene.add(aids);
}
function updateAids() {
  const on = aid && mode === 'practice' && !S.over;
  aids.visible = on;
  carParts.axle.visible = on;
  if (!on) return;
  const lead = turnLead();
  if (S.phase === 0 || S.phase === 2) {
    turnLine.position.set((S.phase === 0 ? 1 : -1) * (RMIN + lead), 0.02, -LANE_Y);
    turnLine.rotation.y = Math.PI / 2;
    turnLine.scale.x = 1;
  } else {
    turnLine.position.set(0, 0.02, -(LANE_Y - RMIN - lead));
    turnLine.rotation.y = 0;
    turnLine.scale.x = GW / 3;
  }
  // where the leading body corners will sweep at the current steering angle
  const dir = gearDir() || (S.phase % 2 === 0 ? -1 : 1);
  const delta = (-S.steer / CAR.lock) * CAR.maxSteer;
  const p = { x: S.x, y: S.y, th: S.th };
  const bx = dir < 0 ? XR : XF, hw = 0.035;
  const arr = [sweep[0].geometry.attributes.position, sweep[1].geometry.attributes.position];
  for (let i = 0; i <= SWEEP_N; i++) {
    const c = Math.cos(p.th), n = Math.sin(p.th);
    [HW, -HW].forEach((off, k) => {
      for (let e = 0; e < 2; e++) {
        const o = off + (e ? hw : -hw);
        arr[k].setXYZ(2 * i + e, p.x + bx * c - o * n, 0.025, -(p.y + bx * n + o * c));
      }
    });
    const ds = 0.16 * dir;
    p.th += (ds * Math.tan(delta)) / CAR.wb;
    p.x += ds * Math.cos(p.th);
    p.y += ds * Math.sin(p.th);
  }
  arr[0].needsUpdate = arr[1].needsUpdate = true;
}

// ───────────────────────── HUD overlay: enlarged mirror insets ─────────────────────────
const hud = new THREE.Scene();
const hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
const insets = [];
function rrGeom(w, h, r, flip) {
  const s = new THREE.Shape();
  s.moveTo(r, 0);
  s.lineTo(w - r, 0); s.quadraticCurveTo(w, 0, w, r);
  s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(r, h); s.quadraticCurveTo(0, h, 0, h - r);
  s.lineTo(0, r); s.quadraticCurveTo(0, 0, r, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const u = p.getX(i) / w; uv.setXY(i, flip ? 1 - u : u, p.getY(i) / h); }
  return g;
}
function buildInsets() {
  for (const m of insets) { hud.remove(m); m.geometry.dispose(); }
  insets.length = 0;
  for (const [r, tex] of [[L.mL, RT.left.texture], [L.mR, RT.right.texture]]) {
    const y = H - r.y - r.h, rad = r.h * 0.17;
    const frame = new THREE.Mesh(rrGeom(r.w + 8, r.h + 8, rad + 4, false), new THREE.MeshBasicMaterial({ color: 0x08090b }));
    frame.position.set(r.x - 4, y - 4, 0);
    const glass = new THREE.Mesh(rrGeom(r.w, r.h, rad, true), new THREE.MeshBasicMaterial({ map: tex }));
    glass.position.set(r.x, y, 0.1);
    hud.add(frame, glass);
    insets.push(frame, glass);
  }
}

// ───────────────────────── layout ─────────────────────────
let W = 0, H = 0;
const L = { mL: null, mR: null, main: null, overlay: false, band: 0 };

function resize() {
  const r = stage.getBoundingClientRect();
  W = Math.max(200, r.width);
  H = Math.max(200, r.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(W, H, false);

  const narrow = W < 720, short = H < 520;
  let mw;
  if (short) mw = Math.min(W * 0.24, H * 0.36 * 1.55);
  else if (narrow) mw = (W - 36) / 2;
  else mw = Math.min(340, W * 0.25);
  const mh = mw / 1.55;
  L.overlay = short;
  L.band = short ? 0 : mh + 24;
  L.mL = { x: 12, y: 12, w: mw, h: mh };
  L.mR = { x: W - 12 - mw, y: 12, w: mw, h: mh };
  L.main = { x: 0, y: L.band, w: W, h: H - L.band };
  hudCam.right = W; hudCam.top = H;
  hudCam.updateProjectionMatrix();
  buildInsets();

  const hint = $('hint');
  if (!narrow) {
    hint.style.left = `${mw + 24}px`;
    hint.style.width = `${W - 2 * mw - 48}px`;
    hint.style.top = '12px';
    hint.style.height = `${mh}px`;
  } else {
    hint.style.left = '8px';
    hint.style.width = `${W - 16}px`;
    hint.style.top = `${mh + 28}px`;
    hint.style.height = 'auto';
  }
}

// plan camera for a pixel viewport; `mini` follows the car at a fixed scale
function setTopCam(vp, mini) {
  const fit = Math.min(vp.w / (2 * XE + 2.6), vp.h / (RW + GD + 2.8));
  let s, cx, cy;
  if (!mini && !L.overlay && fit >= 20) {
    s = fit; cx = 0; cy = (RW - GD) / 2;
  } else {
    s = mini ? 10.5 : clamp(Math.min(vp.w, vp.h) / 18, 15, 30);
    const mid = (XF + XR) / 2;
    cx = S.x + mid * Math.cos(S.th);
    // keep the car clear of the wheel and pedals along the bottom edge
    cy = S.y + mid * Math.sin(S.th) - (mini ? 0 : ((vp.h > vp.w ? 0.22 : 0.09) * vp.h) / s);
  }
  topCam.left = -vp.w / 2 / s; topCam.right = vp.w / 2 / s;
  topCam.top = vp.h / 2 / s; topCam.bottom = -vp.h / 2 / s;
  topCam.position.set(cx, 60, -cy);
  topCam.lookAt(cx, 0, -cy);
  topCam.updateProjectionMatrix();
}
function viewport(vp) {
  renderer.setViewport(vp.x, H - vp.y - vp.h, vp.w, vp.h);
  renderer.setScissor(vp.x, H - vp.y - vp.h, vp.w, vp.h);
  renderer.setScissorTest(true);
}

// ───────────────────────── frame ─────────────────────────
const GLANCE = { left: [42, -8], right: [-58, -8], back: [-158, -3] }; // back = over the right shoulder
const head = { yaw: 0, pitch: 0 };
const chasePos = new THREE.Vector3();
const chaseWant = new THREE.Vector3();
let chaseInit = false;
const FULL = { x: 0, y: 0, w: 0, h: 0 };

function syncScene(dt) {
  car.position.set(S.x, 0, -S.y);
  car.rotation.y = S.th;
  const delta = (-S.steer / CAR.lock) * CAR.maxSteer;
  for (const p of carParts.pivots) p.rotation.y = delta;
  for (const w of carParts.wheels) w.rotation.z = -S.dist / 0.31;
  carParts.steer.rotation.z = -S.steer * DEG;
  MAT.tail.emissiveIntensity = S.braking ? 1.6 : 0.1;
  MAT.reverse.emissiveIntensity = S.gear === 'R' ? 1.5 : 0;
  MAT.paint.emissive.setHex(S.out ? 0x661010 : 0x000000);
  updateAids();

  // head: a held glance key wins, otherwise the dragged direction
  const [ty, tp] = look.glance ? GLANCE[look.glance] : [look.yaw, look.pitch];
  const k = 1 - Math.exp(-dt * 12);
  head.yaw += (ty - head.yaw) * k;
  head.pitch += (tp - head.pitch) * k;
  eyeCam.rotation.y = -Math.PI / 2 + head.yaw * DEG;
  eyeCam.rotation.x = (-6 + head.pitch) * DEG;
  // lean a little towards where the head turns
  const lean = head.yaw < 0 ? clamp(-head.yaw / 150, 0, 1) * 0.3 : -clamp(head.yaw / 150, 0, 1) * 0.07;
  eyeCam.position.set(EYE.x - Math.min(0.1, Math.abs(head.yaw) / 1200), EYE.y, EYE.z + lean);

  const c = Math.cos(S.th), n = Math.sin(S.th);
  chaseWant.set(S.x - 7.5 * c, 3.6, -(S.y - 7.5 * n));
  if (!chaseInit) { chasePos.copy(chaseWant); chaseInit = true; } else chasePos.lerp(chaseWant, 1 - Math.exp(-dt * 4));
  chaseCam.position.copy(chasePos);
  chaseCam.lookAt(S.x + 1.5 * c, 0.9, -(S.y + 1.5 * n));
}

let frameNo = 0;
function render(dt) {
  frameNo++;
  syncScene(dt);
  renderer.shadowMap.needsUpdate = true;

  // reflections first; the mirror glass must not be drawn into its own texture
  for (const g of carParts.glass) g.visible = false;
  for (const key of ['left', 'right', 'inner']) {
    // the interior mirror is small and rarely looked at: refresh it every third frame
    if (key === 'inner' && (view !== 'cabin' || frameNo % 3)) continue;
    renderer.setRenderTarget(RT[key]);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.render(scene, mirrorCam[key]);
  }
  for (const g of carParts.glass) g.visible = true;
  renderer.setRenderTarget(null);

  FULL.w = W; FULL.h = H;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  renderer.clear();

  if (view === 'top') {
    setTopCam(L.main, false);
    viewport(L.main);
    renderer.render(scene, topCam);
  } else {
    const cam = view === 'cabin' ? eyeCam : chaseCam;
    const aspect = W / H;
    cam.aspect = aspect;
    cam.fov = view === 'cabin'
      ? clamp((2 * Math.atan(Math.tan(50 * DEG) / aspect)) / DEG, 48, 78)
      : clamp((2 * Math.atan(Math.tan(36 * DEG) / aspect)) / DEG, 40, 70);
    cam.updateProjectionMatrix();
    viewport(FULL);
    renderer.render(scene, cam);
  }

  const mini = $('mini');
  if (view !== 'top' && aid && mode === 'practice' && W >= 720 && !L.overlay) { // no room for it on phones
    const mw = Math.round(clamp(W * 0.24, 150, 280)), mh = Math.round(mw * 0.62);
    const m = { x: Math.round((W - mw) / 2), y: H - mh - 14, w: mw, h: mh };
    setTopCam(m, true);
    viewport(m);
    renderer.clearDepth();
    renderer.render(scene, topCam);
    mini.style.cssText = `display:block;left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px`;
  } else if (mini.style.display !== 'none') mini.style.display = 'none';

  viewport(FULL);
  renderer.clearDepth();
  renderer.render(hud, hudCam);
}

// ───────────────────────── DOM sync ─────────────────────────
const ui = { phase: '', timer: '', score: '', hint: '', steer: '', gear: '', speed: '' };
function setText(key, el, text) { if (ui[key] !== text) { ui[key] = text; el.textContent = text; } }
const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function syncUI() {
  setText('phase', $('phase'), S.phase < 4 ? `${PHASES[S.phase]}：${PHASE_LONG[S.phase]}` : '完成');
  setText('timer', $('timer'), `${fmtT(S.t)} / 3:30`);
  $('timer').classList.toggle('over', S.t > TIME_LIMIT);
  setText('score', $('score'), mode === 'exam' ? `${S.score} 分` : `出线 ${S.outs} · 停车 ${S.stops}`);
  setText('hint', $('hint').firstElementChild, aid && mode === 'practice' ? coach() : '');

  $('wheelG').setAttribute('transform', `rotate(${S.steer.toFixed(1)})`);
  const turns = Math.abs(S.steer) / 360;
  const full = Math.abs(S.steer) >= CAR.lock - 0.5;
  const st = Math.abs(S.steer) < 3 ? '回正' : `${S.steer > 0 ? '右' : '左'} ${turns.toFixed(2)} 圈${full ? ' · 打死' : ''}`;
  setText('steer', $('steerText'), st);
  $('steerText').classList.toggle('full', full);

  const g = S.gear;
  if (ui.gear !== g) {
    ui.gear = g;
    $('gear').textContent = g;
    $('gear').className = g === 'R' ? 'r' : g === 'D' ? 'd' : '';
    for (const b of $('gearBox').children) b.classList.toggle('on', b.dataset.gear === g);
  }
  const sp = (Math.abs(S.v) * 3.6).toFixed(1);
  if (ui.speed !== sp) { ui.speed = sp; $('speed').firstChild.nodeValue = `${sp} `; }
}

function syncPedals() {
  $('pGas').classList.toggle('on', K.gas || PAD.gas > 0.1);
  $('pBrake').classList.toggle('on', K.brake || PAD.brake > 0.1);
  $('lookL').classList.toggle('on', look.glance === 'left');
  $('lookR').classList.toggle('on', look.glance === 'right');
  $('lookB').classList.toggle('on', look.glance === 'back');
}

let toastTimer = 0;
function toast(text, kind) {
  const el = $('toast');
  el.textContent = text;
  el.className = `show ${kind || ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2600);
}

// ───────────────────────── modals ─────────────────────────
function hideModal() { $('modal').classList.remove('show'); }
function showModal(html) { $('card').innerHTML = html; $('modal').classList.add('show'); }

function showResult() {
  const exam = mode === 'exam';
  const pass = !S.failReason && S.score >= 80;
  let title, cls, sub;
  if (exam) {
    title = pass ? `合格 · ${S.score} 分` : '不合格';
    cls = pass ? 'pass' : 'fail';
    sub = S.failReason || (pass ? '全流程完成。' : '扣分后成绩低于 80 分。');
  } else {
    title = '练习完成';
    cls = S.outs ? 'fail' : 'pass';
    sub = S.outs ? `这一把有 ${S.outs} 次出线，考试里任何一次都是不合格。` : '没有出线，可以去考试模式试一把。';
  }
  const rows = [
    ['用时', `${fmtT(S.t)}（限时 3:30）`],
    ['中途停车', `${S.stops} 次${S.stops ? `（−${S.stops * 5} 分）` : ''}`],
    ['车身出线', `${S.outs} 次`],
  ];
  for (const p of S.parks) rows.push([`${p.side}停车位置`, `左 ${cm(p.left)} · 右 ${cm(p.right)} · 车头距库口 ${cm(p.front)} · 偏 ${Math.abs(p.ang).toFixed(1)}°`]);
  const best = parseFloat(store.get('parking.best', '0')) || 0;
  if (exam && best) rows.push(['考试最快合格', fmtT(best)]);
  showModal(`
    <h2 class="${cls}">${title}</h2>
    <p>${sub}</p>
    <table>${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
    <div class="actions">
      <button class="btn" data-act="${exam ? 'practice' : 'exam'}">${exam ? '回到练习' : '去考试模式'}</button>
      <button class="btn primary" data-act="again">再来一次</button>
    </div>`);
}

// Labelled controller drawing for the help card.
function padDiagram() {
  const L = (y, name, what) => `<text x="150" y="${y}" text-anchor="end"><tspan class="k">${name}</tspan>　${what}</text>`;
  const R = (y, name, what) => `<text x="550" y="${y}"><tspan class="k">${name}</tspan>　${what}</text>`;
  const face = (x, y, c, t) => `<circle cx="${x}" cy="${y}" r="11" fill="#1d2025" stroke="${c}" stroke-width="2"/><text x="${x}" y="${y + 4.5}" text-anchor="middle" fill="${c}" font-weight="700" font-size="12">${t}</text>`;
  return `<svg class="pad" viewBox="0 0 700 292" role="img" aria-label="手柄按键图示">
    <g fill="none" stroke="#6b727c" stroke-width="1.2">
      <path d="M156 36 H236 V48"/><path d="M156 70 H224"/><path d="M156 124 H243"/><path d="M156 192 H282"/>
      <path d="M156 262 H320 V136"/>
      <path d="M544 36 H464 V48"/><path d="M544 70 H476"/><path d="M544 116 H470"/><path d="M544 138 H447 V146"/><path d="M544 192 H420"/>
      <path d="M544 262 H380 V136"/>
    </g>
    <path d="M210 88 Q350 70 490 88 Q532 96 540 170 Q546 236 510 240 Q486 240 460 205 H240 Q214 240 190 240 Q154 236 160 170 Q168 96 210 88 Z" fill="#2a2e35" stroke="#4a505a" stroke-width="2"/>
    <rect x="236" y="48" width="48" height="20" rx="7" fill="#f2c230"/><rect x="416" y="48" width="48" height="20" rx="7" fill="#f2c230"/>
    <rect x="224" y="72" width="74" height="13" rx="6" fill="#3a3f48" stroke="#f2c230" stroke-width="2"/><rect x="402" y="72" width="74" height="13" rx="6" fill="#3a3f48" stroke="#f2c230" stroke-width="2"/>
    <g font-size="10" font-weight="700" text-anchor="middle"><text x="260" y="62" fill="#1a1500">LT</text><text x="440" y="62" fill="#1a1500">RT</text><text x="261" y="82.5" fill="#f2c230">LB</text><text x="439" y="82.5" fill="#f2c230">RB</text></g>
    <circle cx="255" cy="128" r="24" fill="#1d2025" stroke="#f2c230" stroke-width="2"/><circle cx="255" cy="128" r="13" fill="#3a3f48"/>
    <path d="M247 128 H228 M224 128 l7 -5 v10 z M263 128 H282 M286 128 l-7 -5 v10 z" stroke="#f2c230" stroke-width="2" fill="#f2c230"/>
    <circle cx="405" cy="184" r="24" fill="#1d2025" stroke="#f2c230" stroke-width="2"/><circle cx="405" cy="184" r="13" fill="#3a3f48"/>
    <path d="M286 172 h18 v12 h12 v18 h-12 v12 h-18 v-12 h-12 v-18 h12 z" fill="#1d2025" stroke="#6b727c" stroke-width="1.5"/>
    <path d="M276 193 l8 -6 v12 z M314 193 l-8 -6 v12 z" fill="#f2c230"/>
    ${face(445, 106, '#e8c33a', 'Y')}${face(423, 128, '#4f9dff', 'X')}${face(467, 128, '#ff5a4f', 'B')}${face(445, 150, '#49c774', 'A')}
    <rect x="311" y="122" width="18" height="11" rx="5" fill="#1d2025" stroke="#6b727c"/><rect x="371" y="122" width="18" height="11" rx="5" fill="#1d2025" stroke="#6b727c"/>
    <g font-size="13.5" fill="#e9ebee">
      ${L(40, 'LT', '刹车（线性）')}${L(74, 'LB', '挡位往 P')}${L(128, '左摇杆', '方向盘')}${L(196, '十字键 ← →', '慢转并停住')}${L(266, 'Back', '切换视角')}
      ${R(40, 'RT', '油门')}${R(74, 'RB', '挡位往 D')}${R(120, 'X / B', '看左镜 / 右镜')}${R(142, 'Y / A', '回头 / 关弹窗')}${R(196, '右摇杆', '转头')}${R(266, 'Start', '重来')}
    </g>
  </svg>
  <ul>
    <li><b>左摇杆</b>的位置就是方向盘的位置：推到底是打死，松开自动回正。想让方向盘停在某个角度，用十字键。</li>
    <li><b>换挡</b>要先踩住 LT。挡位顺序 P ⇄ R ⇄ N ⇄ D：起步倒车是踩 LT、按一下 RB 到 R、松开 LT。</li>
    <li><b>LT 轻踩</b>可以把车速压在怠速以下，踩到三成左右停住。出线或不合格时手柄会震动。</li>
  </ul>`;
}
function showPadGuide() {
  showModal(`<h2>手柄操作</h2><p>已识别到手柄，键盘和触屏仍然可以同时用。</p>${padDiagram()}
    <div class="actions"><button class="btn" data-act="help">全部说明</button><button class="btn primary" data-act="close">开始（A）</button></div>`);
}

function showHelp() {
  showModal(`
    <h2>倒车入库模拟</h2>
    <p>按科目二标准场地 1:1 建模：库宽 = 车宽 + 0.6 m，库长 = 车长 + 0.7 m，车道宽 1.5 倍车长。方向盘一圈半打死，不会自动回正。</p>
    <h3>流程</h3>
    <ul>
      <li>① 从起点倒入车库停车（右倒库）</li>
      <li>② 前进出库，前轮驶过左侧控制线</li>
      <li>③ 再倒入车库停车（左倒库）</li>
      <li>④ 前进出库，回到右侧起点</li>
    </ul>
    <h3>开车（自动挡）</h3>
    <ul>
      <li>挡位 <kbd>1</kbd> P、<kbd>2</kbd> R、<kbd>3</kbd> N、<kbd>4</kbd> D，要踩住刹车、车停稳才能换</li>
      <li><kbd>S</kbd>/<kbd>↓</kbd>/<kbd>空格</kbd> 刹车。挂上 R 或 D 后松开刹车，车会怠速蠕行；踩刹车就停</li>
      <li><kbd>W</kbd>/<kbd>↑</kbd> 油门，倒库一般用不到</li>
      <li><kbd>A</kbd>/<kbd>←</kbd>、<kbd>D</kbd>/<kbd>→</kbd> 转方向盘，也可以直接拖左下角的方向盘</li>
      <li><kbd>Q</kbd> 左打死，<kbd>E</kbd> 右打死，<kbd>X</kbd> 回正</li>
    </ul>
    <h3>手柄</h3>
    ${padDiagram()}
    <h3>看哪里</h3>
    <ul>
      <li>在画面上拖动可以转头，<kbd>F</kbd> 或双击回到正前方</li>
      <li>按住 <kbd>Z</kbd> 看左后视镜，<kbd>C</kbd> 看右后视镜，<kbd>B</kbd> 回头看后窗</li>
      <li>屏幕上方两块是放大的左右后视镜</li>
      <li><kbd>V</kbd> 切换车内 / 俯视 / 车后视角，<kbd>H</kbd> 开关辅助，<kbd>退格</kbd> 重来</li>
    </ul>
    <h3>评判（考试模式）</h3>
    <ul>
      <li>车身出线、倒库不入、不按规定路线、超过 210 秒：不合格</li>
      <li>中途停车超过 2 秒：每次扣 5 分；80 分合格</li>
    </ul>
    <div class="actions"><button class="btn primary" data-act="close">开始</button></div>`);
}

$('modal').addEventListener('click', (e) => {
  const act = e.target.dataset && e.target.dataset.act;
  if (e.target === $('modal') || act === 'close') return hideModal();
  if (act === 'help') return showHelp();
  if (act === 'again') reset();
  else if (act === 'practice' || act === 'exam') setMode(act);
});

// ───────────────────────── controls ─────────────────────────
function setMode(m) {
  mode = m;
  for (const b of $('modeSeg').children) b.classList.toggle('on', b.dataset.mode === m);
  $('aidBtn').disabled = m === 'exam';
  reset();
}
function setView(v) {
  view = v;
  store.set('parking.view', v);
  chaseInit = false;
  $('viewBtn').textContent = `视角：${VIEW_NAME[v]}`;
  $('lookBox').style.display = v === 'cabin' ? '' : 'none';
}
const nextView = () => setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]);
function setAid(v) { aid = v; store.set('parking.aid', v ? '1' : '0'); $('aidBtn').textContent = `辅助：${v ? '开' : '关'}`; $('aidBtn').classList.toggle('off', !v); }
function setVoice(v) {
  voice = v; store.set('parking.voice', v ? '1' : '0');
  $('voiceBtn').textContent = `语音：${v ? '开' : '关'}`; $('voiceBtn').classList.toggle('off', !v);
  if (!v && 'speechSynthesis' in window) speechSynthesis.cancel();
}
function setVmax(v) {
  vmax = clamp(v, 0.3, 1.5);
  store.set('parking.vmax', String(vmax));
  $('vmax').value = vmax;
  $('vmaxText').textContent = (vmax * 3.6).toFixed(1);
}

$('modeSeg').addEventListener('click', (e) => { if (e.target.dataset.mode) { setMode(e.target.dataset.mode); e.target.blur(); } });
$('viewBtn').addEventListener('click', (e) => { nextView(); e.target.blur(); });
$('aidBtn').addEventListener('click', (e) => { setAid(!aid); e.target.blur(); });
$('voiceBtn').addEventListener('click', (e) => { setVoice(!voice); e.target.blur(); });
$('resetBtn').addEventListener('click', (e) => { reset(); e.target.blur(); });
$('helpBtn').addEventListener('click', (e) => { showHelp(); e.target.blur(); });
$('vmax').addEventListener('input', (e) => setVmax(parseFloat(e.target.value)));
$('vmax').addEventListener('change', (e) => e.target.blur());

const KEYMAP = {
  KeyW: 'gas', ArrowUp: 'gas', KeyS: 'brake', ArrowDown: 'brake', Space: 'brake',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};
const GEAR_KEY = { Digit1: 'P', Digit2: 'R', Digit3: 'N', Digit4: 'D', Numpad1: 'P', Numpad2: 'R', Numpad3: 'N', Numpad4: 'D' };
const GLANCE_KEY = { KeyZ: 'left', KeyC: 'right', KeyB: 'back' };
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  lastInput = 'kb';
  if ($('modal').classList.contains('show')) {
    if (e.code === 'Enter' || e.code === 'Escape') { if (S.over) reset(); else hideModal(); }
    return;
  }
  const k = KEYMAP[e.code];
  if (k) { K[k] = true; syncPedals(); e.preventDefault(); return; }
  if (GLANCE_KEY[e.code]) { look.glance = GLANCE_KEY[e.code]; syncPedals(); return; }
  if (e.repeat) return;
  if (e.code === 'KeyQ') S.steerTarget = -CAR.lock;
  else if (e.code === 'KeyE') S.steerTarget = CAR.lock;
  else if (e.code === 'KeyX') S.steerTarget = 0;
  else if (GEAR_KEY[e.code]) setGear(GEAR_KEY[e.code]);
  else if (e.code === 'Backspace') reset();
  else if (e.code === 'KeyV') nextView();
  else if (e.code === 'KeyF') { look.yaw = 0; look.pitch = 0; }
  else if (e.code === 'KeyH' && mode === 'practice') setAid(!aid);
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) { K[k] = false; syncPedals(); }
  if (GLANCE_KEY[e.code] && look.glance === GLANCE_KEY[e.code]) { look.glance = null; syncPedals(); }
});
window.addEventListener('blur', () => { for (const k in K) K[k] = false; look.glance = null; syncPedals(); });

function hold(el, on, off) {
  const down = (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } on(); syncPedals(); };
  const up = () => { off(); syncPedals(); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
for (const [id, key] of [['pGas', 'gas'], ['pBrake', 'brake']]) hold($(id), () => { K[key] = true; }, () => { K[key] = false; });
$('gearBox').addEventListener('pointerdown', (e) => { if (e.target.dataset.gear) { e.preventDefault(); setGear(e.target.dataset.gear); } });
for (const [id, g] of [['lookL', 'left'], ['lookR', 'right'], ['lookB', 'back']]) hold($(id), () => { look.glance = g; }, () => { if (look.glance === g) look.glance = null; });
const snap = (el, target) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); S.steerTarget = target; });
snap($('qL'), -CAR.lock);
snap($('qC'), 0);
snap($('qR'), CAR.lock);

// drag the HUD wheel: accumulate the pointer's angle change around the hub
(() => {
  const el = $('wheel');
  let last = null;
  const ang = (e) => {
    const r = el.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) / DEG;
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    last = ang(e);
    S.steerTarget = null;
  });
  el.addEventListener('pointermove', (e) => {
    if (last === null) return;
    const a = ang(e);
    let d = a - last;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    last = a;
    S.steer = clamp(S.steer + d, -CAR.lock, CAR.lock);
  });
  const end = () => { last = null; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
})();

// ───────────────────────── gamepad ─────────────────────────
// Standard mapping: left stick steers (springs back like a real wheel being unwound), LT brake and
// RT throttle are analog, LB/RB walk the gear lever P-R-N-D, right stick or X/B/Y turn the head.
function rumble(ms, strength) {
  try {
    const act = PAD.gp && PAD.gp.vibrationActuator;
    if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength });
  } catch (e) { /* rumble is optional */ }
}
function pollPad() {
  let gp = null;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected && (!gp || p.mapping === 'standard')) { gp = p; if (p.mapping === 'standard') break; }
  PAD.gp = gp;
  if (!gp) {
    if (PAD.on) Object.assign(PAD, { on: false, left: false, right: false, brake: 0, gas: 0, steer: false, look: false, glance: null, prev: {} });
    return;
  }
  PAD.on = true;
  const dz = (v) => { const a = Math.abs(v || 0); return a < 0.14 ? 0 : (Math.sign(v) * (a - 0.14)) / 0.86; };
  const val = (i) => { const b = gp.buttons[i]; return b ? Math.max(b.value || 0, b.pressed ? 1 : 0) : 0; };
  const edge = {};
  for (const i of [0, 1, 2, 3, 4, 5, 8, 9, 11]) { const now = val(i) > 0.5; edge[i] = now && !PAD.prev[i]; PAD.prev[i] = now; }
  const sx = dz(gp.axes[0]), lx = dz(gp.axes[2]), ly = dz(gp.axes[3]);
  PAD.brake = val(6);
  PAD.gas = val(7);
  PAD.left = val(14) > 0.5;
  PAD.right = val(15) > 0.5;
  if (sx || lx || ly || PAD.brake > 0.1 || PAD.gas > 0.1 || PAD.left || PAD.right || Object.values(edge).some(Boolean)) lastInput = 'pad';

  if ($('modal').classList.contains('show')) {
    if (edge[0] || edge[9]) { if (S.over) reset(); else hideModal(); }
    return;
  }
  // steering: stick position is wheel position; the D-pad nudges and leaves it there
  if (PAD.left || PAD.right) PAD.steer = false;
  else if (sx) { PAD.steer = true; S.steerTarget = Math.sign(sx) * Math.pow(Math.abs(sx), 1.4) * CAR.lock; }
  else if (PAD.steer) { S.steerTarget = 0; if (Math.abs(S.steer) < 1) PAD.steer = false; }
  // gear lever
  const gi = GEARS.indexOf(S.gear);
  if (edge[4] && gi > 0) setGear(GEARS[gi - 1]);
  if (edge[5] && gi < GEARS.length - 1) setGear(GEARS[gi + 1]);
  // head
  const g = val(2) > 0.5 ? 'left' : val(1) > 0.5 ? 'right' : val(3) > 0.5 ? 'back' : null;
  if (g) { look.glance = g; PAD.glance = g; } else if (PAD.glance) { if (look.glance === PAD.glance) look.glance = null; PAD.glance = null; }
  if (lx || ly) { PAD.look = true; look.yaw = -lx * 120; look.pitch = -ly * 35; }
  else if (PAD.look) { PAD.look = false; look.yaw = 0; look.pitch = 0; }
  if (edge[11]) { look.yaw = 0; look.pitch = 0; }
  if (edge[8]) nextView();
  if (edge[9]) reset();
  syncPedals();
}
window.addEventListener('gamepadconnected', () => {
  // show the diagram the first time, unless that would interrupt a run
  if (!S.started && !$('modal').classList.contains('show')) showPadGuide();
  else toast('手柄已连接：左摇杆转向 · LT 刹车 · RT 油门 · LB/RB 换挡', 'good');
});

// drag on the scene to turn the head (cabin view)
cv.addEventListener('pointerdown', (e) => {
  if (view !== 'cabin') return;
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
  look.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
cv.addEventListener('pointermove', (e) => {
  const d = look.drag;
  if (!d || d.id !== e.pointerId) return;
  const k = 110 / Math.max(320, W); // a drag across the screen is a little over 100°
  look.yaw = clamp(look.yaw + (e.clientX - d.x) * k, -165, 150);
  look.pitch = clamp(look.pitch - (e.clientY - d.y) * k, -45, 30);
  d.x = e.clientX; d.y = e.clientY;
});
const endLook = (e) => { if (look.drag && look.drag.id === e.pointerId) look.drag = null; };
cv.addEventListener('pointerup', endLook);
cv.addEventListener('pointercancel', endLook);
cv.addEventListener('dblclick', () => { look.yaw = 0; look.pitch = 0; });

// ───────────────────────── boot ─────────────────────────
buildWorld();
buildCar();
buildCameras();
buildAids();

let prev = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000 || 0);
  prev = now;
  pollPad();
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  for (let i = 0; i < n; i++) step(dt / n);
  render(dt);
  syncUI();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
setAid(aid);
setVoice(voice);
setVmax(vmax);
const savedView = store.get('parking.view', 'cabin');
setView(VIEWS.includes(savedView) ? savedView : 'cabin');
reset();
resize();
if (store.get('parking.seen', '0') !== '4') { showHelp(); store.set('parking.seen', '4'); }
window.__parking = { S, K, PAD, look, step, reset, setMode, setView, setGear, coach, consts: { RMIN, CX, HG, GD, RW, LANE_Y } };
requestAnimationFrame(frame);
