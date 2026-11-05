// Time Deleted Game. — 3D 本編（three.js）
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const $ = (id) => document.getElementById(id);
// セーブはスロットごと（tdg_slot1〜3）
let slot = 1;
const saveKey = () => 'tdg_slot' + slot;
// タッチ端末か（index.html で判定済み）
const IS_TOUCH = !!window.TDG_TOUCH;

// ===== 定数 =====
const HALF = 6;            // 部屋は 12m 四方
const HEIGHT = 4;          // 天井の高さ
const EYE = 1.6;           // 目線の高さ
const PLAYER_R = 0.3;      // プレイヤーの当たり判定の半径
const SPEED = 3.2;         // 歩く速さ（m/秒）
const RUN_MULT = 1.8;      // 走ると何倍速くなるか
const FOV = 70, FOV_RUN = 78; // 走っているときは視野を少し広げてスピード感を出す
const LOOK_SENS = 0.0022;  // マウス感度
const TOUCH_SENS = 0.006;  // 指でなぞったときの視点感度（1px あたりのラジアン）
const STICK_R = 48;        // スティックが最大まで倒れる距離（px）
const CONVERT_COST = 10;   // 10 ti → 1 de（Lv0。チュートリアル用）
// 変換装置1のレベルごとの「ti いくつで de いくつ」（Lv0〜Lv5）
const CONV_LV = [
  { cost: 10, gain: 1 },
  { cost: 15, gain: 2 },
  { cost: 25, gain: 4 },
  { cost: 40, gain: 6 },
  { cost: 60, gain: 8 },
  { cost: 90, gain: 10 },
];
const CONV_MAX = CONV_LV.length - 1;     // 最大 Lv5
const UPGRADE_COST = [1, 2, 4, 8, 16];   // Lv0→1, 1→2, … にかかる ai
const AI_COST = 100000;                   // 100,000 ti → 1 ai
const CONVERTER_R = 0.7;   // 変換装置の当たり判定
const INTERACT_DIST = 1.9; // 変換装置を使える距離
const BED = { x: -4.9, z: -4.7, w: 1.7, d: 2.5 };
const BED_BOX = { minX: BED.x - BED.w / 2, maxX: BED.x + BED.w / 2, minZ: BED.z - BED.d / 2, maxZ: BED.z + BED.d / 2 };
const ACCENT = 0xd23a2c;
const INK = 0x141414;

// ===== 状態 =====
let renderer, scene, camera;
let hands = {}, ring, gem, ringPulse = 0, orbs = [];
let state = null;
let phase = 'off';          // off | wake | play | paused
let yaw = 0, pitch = 0, camY = EYE;
const keys = {};
let lastT = 0, saveTimer = 0, rafId = 0;
let tutMoved = 0, tutLooked = 0, tutTimer = 0, tutDoneWait = 0;
let leaving = false, dragging = false;
// タッチ操作の状態
let lookId = null, lookX = 0, lookY = 0;
let runToggle = false, moving = false; // スマホの「走る」ボタン（押すたびに切り替え）・いま動いているか
let stickId = null, stickCX = 0, stickCY = 0, stickX = 0, stickY = 0;

const newState = () => ({ ti: 0, de: 0, ai: 0, lv: 0, tut: 0, x: -3.4, z: -4.4, yaw: -2.48, pitch: 0 });
// 1 秒あたりの ti：基本 1 ti × (1 + 持っている de)
const rate = () => 1 * (1 + state.de);
// いまの変換装置1の性能
const conv = () => CONV_LV[Math.min(state.lv || 0, CONV_MAX)];
// 装置のパネル（ai・アップグレード）はチュートリアルが終わってから
const machineUnlocked = () => state.tut >= 6;

// ===== 小さな便利関数 =====
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function tween(ms, fn) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const k = clamp01((now - t0) / ms);
      fn(k);
      k < 1 ? requestAnimationFrame(step) : resolve();
    };
    requestAnimationFrame(step);
  });
}
function fmt(n) {
  n = Math.floor(n);
  return n < 1e9 ? n.toLocaleString('en-US') : n.toExponential(2).replace('+', '');
}

// ===== 初期化（初回だけ） =====
function init() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.25 : 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  $('stage').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f3f2);
  camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100);
  camera.rotation.order = 'YXZ';

  buildRoom();
  buildBed();
  buildClock();
  buildConverter();

  resize();
  addEventListener('resize', resize);
  bindInput();
}

function resize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
function add(geo, mat, x, y, z, parent = scene) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ===== 真っ白な部屋 =====
function buildRoom() {
  const S = HALF * 2;
  const wallMat = std(0xf6f6f4, { roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S), std(0xe2e2e0, { roughness: 0.75 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(S, S), wallMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = HEIGHT;
  scene.add(ceil);

  // 壁4枚（すべて内側を向く）
  for (const [x, z, ry] of [[0, -HALF, 0], [0, HALF, Math.PI], [-HALF, 0, Math.PI / 2], [HALF, 0, -Math.PI / 2]]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(S, HEIGHT), wallMat);
    w.position.set(x, HEIGHT / 2, z);
    w.rotation.y = ry;
    w.receiveShadow = true;
    scene.add(w);
  }

  // 床のタイル目地（うっすら）
  const grid = new THREE.GridHelper(S, 12, INK, INK);
  grid.material.transparent = true;
  grid.material.opacity = 0.05;
  grid.position.y = 0.002;
  scene.add(grid);

  // 部屋の角の細い線（タイトル画面と同じ雰囲気）
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(S - 0.01, HEIGHT - 0.01, S - 0.01)),
    new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.12 })
  );
  edges.position.y = HEIGHT / 2;
  scene.add(edges);

  // 天井のライン照明
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.22), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  panel.rotation.x = Math.PI / 2;
  panel.position.y = HEIGHT - 0.01;
  scene.add(panel);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd6d6d4, 1.7));
  const light = new THREE.PointLight(0xffffff, 32, 0, 2);
  light.position.set(0, HEIGHT - 0.3, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.002;
  scene.add(light);
}

// ===== 目が覚めたベッド =====
function buildBed() {
  const g = new THREE.Group();
  scene.add(g);
  add(new THREE.BoxGeometry(BED.w, 0.3, BED.d), std(0xd9d9d7), BED.x, 0.15, BED.z, g);
  add(new THREE.BoxGeometry(BED.w - 0.1, 0.22, BED.d - 0.1), std(0xffffff), BED.x, 0.41, BED.z, g);
  add(new THREE.BoxGeometry(1.0, 0.14, 0.45), std(0xffffff), BED.x, 0.59, BED.z - BED.d / 2 + 0.4, g);
  add(new THREE.BoxGeometry(BED.w - 0.06, 0.08, 1.5), std(0xebebe9), BED.x, 0.56, BED.z + 0.45, g);
  add(new THREE.BoxGeometry(BED.w - 0.04, 0.085, 0.06), std(ACCENT), BED.x, 0.56, BED.z - 0.2, g);
}

// ===== 逆回転する壁掛け時計 =====
function buildClock() {
  const g = new THREE.Group();
  g.position.set(2, 2.5, -HALF + 0.02);
  scene.add(g);
  g.add(new THREE.Mesh(new THREE.CircleGeometry(0.75, 64), std(0xffffff)));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.035, 12, 64), std(INK));
  g.add(rim);
  const inkMat = std(INK);
  for (let i = 0; i < 60; i++) {
    const big = i % 5 === 0;
    const a = (i / 60) * Math.PI * 2;
    const r = big ? 0.62 : 0.66;
    const t = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.035 : 0.012, big ? 0.12 : 0.05, 0.01), inkMat);
    t.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.01);
    t.rotation.z = -a;
    g.add(t);
  }
  const hand = (w, len, z, mat) => {
    const pivot = new THREE.Group();
    pivot.position.z = z;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.01), mat);
    m.position.y = len / 2 - 0.06;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  };
  hands.hour = hand(0.05, 0.38, 0.02, inkMat);
  hands.min = hand(0.035, 0.58, 0.03, inkMat);
  hands.sec = hand(0.012, 0.68, 0.04, std(ACCENT));
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24), std(ACCENT));
  cap.position.z = 0.05;
  g.add(cap);
}

// ===== 部屋の中央の変換装置（ti → de） =====
function buildConverter() {
  const g = new THREE.Group();
  scene.add(g);
  add(new THREE.CylinderGeometry(0.45, 0.55, 0.95, 48), std(0xffffff, { roughness: 0.6 }), 0, 0.475, 0, g);
  add(new THREE.CylinderGeometry(0.47, 0.47, 0.04, 48), std(INK, { roughness: 0.4 }), 0, 0.97, 0, g);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.36, 48), new THREE.MeshBasicMaterial({ color: ACCENT }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.995;
  g.add(glow);

  ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.022, 16, 96),
    new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 1.2 })
  );
  ring.position.y = 1.6;
  g.add(ring);

  gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), new THREE.MeshStandardMaterial({ color: INK, roughness: 0.25, metalness: 0.4 }));
  gem.position.y = 1.6;
  gem.castShadow = true;
  g.add(gem);

  // 使える範囲を示す床の円
  const area = new THREE.Mesh(
    new THREE.RingGeometry(INTERACT_DIST - 0.03, INTERACT_DIST, 96),
    new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.18 })
  );
  area.rotation.x = -Math.PI / 2;
  area.position.y = 0.004;
  g.add(area);

  // アップグレードしたレベルの数だけ、赤い玉が宝石のまわりを回る
  const orbMat = new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 1.5 });
  for (let i = 0; i < CONV_MAX; i++) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), orbMat);
    o.visible = false;
    g.add(o);
    orbs.push(o);
  }

  const red = new THREE.PointLight(ACCENT, 3, 4, 2);
  red.position.y = 1.5;
  g.add(red);
}

// ===== 入力 =====
const isLocked = () => document.pointerLockElement === renderer.domElement;
function lockPointer() {
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

function bindInput() {
  addEventListener('keydown', (e) => {
    if (phase === 'off') return;
    keys[e.code] = true;
    if (e.code === 'KeyE' && phase === 'play') convert(e.shiftKey);
    if (e.code === 'KeyF') {
      if (phase === 'play') openMachine();
      else if (phase === 'menu') closeMachine();
    }
    if (e.code === 'Escape') {
      if (phase === 'menu') closeMachine();
      else if (phase === 'play' && !isLocked()) pause();
      else if (phase === 'paused') resume();
    }
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  const cv = renderer.domElement;
  cv.addEventListener('mousedown', () => {
    if (phase !== 'play') return;
    dragging = true;
    if (!isLocked()) lockPointer();
  });
  addEventListener('mouseup', () => { dragging = false; });
  addEventListener('mousemove', (e) => {
    if (phase !== 'play') return;
    if (isLocked() || dragging) look(e.movementX, e.movementY);
  });
  // ===== タッチ：画面をなぞって視点を動かす =====
  cv.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || phase !== 'play') return;
    e.preventDefault(); // 互換のマウスイベント（mousedown など）を出さない
    if (lookId === null) {
      lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY;
      try { cv.setPointerCapture(e.pointerId); } catch {}
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId || phase !== 'play') return;
    const k = TOUCH_SENS / LOOK_SENS;
    look((e.clientX - lookX) * k, (e.clientY - lookY) * k);
    lookX = e.clientX; lookY = e.clientY;
  });
  const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
  cv.addEventListener('pointerup', endLook);
  cv.addEventListener('pointercancel', endLook);

  // ===== タッチ：左下のスティックで歩く =====
  const stick = $('stick'), knob = $('knob');
  const setStick = (x, y) => {
    stickX = x; stickY = y;
    knob.style.transform = `translate(${x * STICK_R}px, ${y * STICK_R}px)`;
  };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (stickId !== null) return;
    const r = stick.getBoundingClientRect();
    stickId = e.pointerId; stickCX = r.left + r.width / 2; stickCY = r.top + r.height / 2;
    try { stick.setPointerCapture(e.pointerId); } catch {}
    moveStick(e);
  });
  const moveStick = (e) => {
    if (e.pointerId !== stickId) return;
    let x = (e.clientX - stickCX) / STICK_R, y = (e.clientY - stickCY) / STICK_R;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    setStick(x, y);
  };
  stick.addEventListener('pointermove', moveStick);
  const endStick = (e) => { if (e.pointerId === stickId) { stickId = null; setStick(0, 0); } };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);
  window.TDG_resetStick = () => { stickId = null; lookId = null; setStick(0, 0); };

  // ===== タッチ：走るボタン（押すたびに ON / OFF） =====
  $('btnRun').addEventListener('click', () => {
    runToggle = !runToggle;
    $('btnRun').classList.toggle('on', runToggle);
  });

  // ===== タッチ：ボタン =====
  $('btnPause').addEventListener('click', () => { if (phase === 'play') pause(); });
  $('btnAct').addEventListener('click', () => { if (phase === 'play') convert(false); });
  $('btnActAll').addEventListener('click', () => { if (phase === 'play') convert(true); });
  $('btnMachine').addEventListener('click', () => { if (phase === 'play') openMachine(); });

  // ===== 変換装置1のパネル =====
  $('mConv1').addEventListener('click', () => convert(false, true));
  $('mConvAll').addEventListener('click', () => convert(true, true));
  $('mAi1').addEventListener('click', () => makeAi(false));
  $('mAiAll').addEventListener('click', () => makeAi(true));
  $('mUp').addEventListener('click', upgrade);
  $('mClose').addEventListener('click', closeMachine);
  $('machine').addEventListener('click', (e) => { if (e.target.id === 'machine') closeMachine(); });

  // スマホはページを閉じても beforeunload が来ないことがあるので、隠れたときにも保存
  document.addEventListener('visibilitychange', () => { if (document.hidden && phase !== 'off') save(); });

  document.addEventListener('pointerlockchange', () => {
    document.body.classList.toggle('locked', isLocked());
    // Esc でマウス固定が外れたら一時停止
    if (!isLocked() && phase === 'play' && !leaving) pause();
  });
}

function look(dx, dy) {
  yaw -= dx * LOOK_SENS;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - dy * LOOK_SENS));
  if (state.tut === 2) tutLooked += (Math.abs(dx) + Math.abs(dy)) * LOOK_SENS;
}

// ===== 移動と当たり判定 =====
// Shift（PC）か「走る」ボタン（スマホ）で走る
const isRunning = () => !!(keys.ShiftLeft || keys.ShiftRight || runToggle);

function move(dt) {
  moving = false;
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1;
  if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyD || keys.ArrowRight) s += 1;
  if (keys.KeyA || keys.ArrowLeft) s -= 1;
  // スティック（上に倒すと前進）
  f -= stickY;
  s += stickX;
  let len = Math.hypot(f, s);
  if (len < 0.05) return;
  moving = true;
  const speed = SPEED * (isRunning() ? RUN_MULT : 1);
  if (len > 1) { f /= len; s /= len; len = 1; }
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  // 前方 = (-sin, -cos)、右 = (cos, -sin)
  state.x += (-sin * f + cos * s) * speed * dt;
  state.z += (-cos * f - sin * s) * speed * dt;
  collide();
  // 壁に向かって歩いても進むよう、歩こうとした距離で判定
  if (state.tut === 1) tutMoved += SPEED * dt * len;
}

function collide() {
  const lim = HALF - PLAYER_R;
  state.x = Math.max(-lim, Math.min(lim, state.x));
  state.z = Math.max(-lim, Math.min(lim, state.z));

  // ベッド（箱）から押し出す
  const b = BED_BOX, r = PLAYER_R;
  if (state.x > b.minX - r && state.x < b.maxX + r && state.z > b.minZ - r && state.z < b.maxZ + r) {
    const push = [
      [b.minX - r - state.x, 0], [b.maxX + r - state.x, 0],
      [0, b.minZ - r - state.z], [0, b.maxZ + r - state.z],
    ].sort((p, q) => Math.hypot(...p) - Math.hypot(...q))[0];
    state.x += push[0];
    state.z += push[1];
  }

  // 変換装置（円柱）から押し出す
  const d = Math.hypot(state.x, state.z), min = CONVERTER_R + PLAYER_R;
  if (d < min) {
    const k = d > 0.0001 ? min / d : 0;
    state.x = d > 0.0001 ? state.x * k : min;
    state.z = d > 0.0001 ? state.z * k : 0;
  }
}

const nearConverter = () => Math.hypot(state.x, state.z) < INTERACT_DIST;

// ===== ti → de 変換 =====
function convert(all, fromPanel = false) {
  if (state.tut < 4 || (!fromPanel && !nearConverter())) return;
  const c = conv();
  const n = all ? Math.floor(state.ti / c.cost) : state.ti >= c.cost ? 1 : 0;
  if (n <= 0) {
    const p = $('prompt');
    p.classList.remove('shake');
    void p.offsetWidth;
    p.classList.add('shake');
    return;
  }
  state.ti -= n * c.cost;
  state.de += n * c.gain;
  ringPulse = 1;
  toast(`+${fmt(n * c.gain)} de`);
  save();
  if (phase === 'menu') renderMachine();
}

// ===== ti → ai（100,000 ti で 1 ai） =====
function makeAi(all) {
  const n = all ? Math.floor(state.ti / AI_COST) : state.ti >= AI_COST ? 1 : 0;
  if (n <= 0) return;
  state.ti -= n * AI_COST;
  state.ai = (state.ai || 0) + n;
  ringPulse = 1;
  toast(`+${fmt(n)} ai`);
  save();
  if (phase === 'menu') renderMachine();
}

// ===== 変換装置1のアップグレード（ai を使う。de は 0 になる） =====
let upArmed = false; // 1回目で「本当に？」、2回目で実行
function upgrade() {
  const lv = state.lv || 0;
  if (lv >= CONV_MAX) return;
  const cost = UPGRADE_COST[lv];
  if ((state.ai || 0) < cost) return;
  if (!upArmed) { upArmed = true; renderMachine(); return; }
  upArmed = false;
  state.ai -= cost;
  state.lv = lv + 1;
  state.de = 0;
  ringPulse = 1.6;
  toast(`変換装置1 Lv${state.lv}`);
  save();
  renderMachine();
}

// ===== パネルの開け閉め =====
function openMachine() {
  if (!machineUnlocked() || !nearConverter()) return;
  phase = 'menu';
  upArmed = false;
  for (const k in keys) keys[k] = false;
  if (window.TDG_resetStick) window.TDG_resetStick();
  if (document.pointerLockElement) document.exitPointerLock();
  renderMachine();
  $('machine').classList.add('active');
}
function closeMachine() {
  $('machine').classList.remove('active');
  phase = 'play';
  upArmed = false;
  if (!IS_TOUCH) lockPointer();
}

// パネルの中身（開いている間は毎フレーム更新）
function renderMachine() {
  const lv = state.lv || 0, c = conv(), ai = state.ai || 0;
  $('mLv').textContent = lv >= CONV_MAX ? 'Lv MAX' : `Lv ${lv}`;
  $('mLvBar').innerHTML = Array.from({ length: CONV_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
  $('mConvRate').textContent = `${c.cost} ti → ${c.gain} de`;
  $('mConv1').disabled = state.ti < c.cost;
  $('mConvAll').disabled = state.ti < c.cost * 2;
  $('mAiRate').textContent = `${fmt(AI_COST)} ti → 1 ai`;
  $('mAi1').disabled = state.ti < AI_COST;
  $('mAiAll').disabled = state.ti < AI_COST * 2;
  const up = $('mUp');
  if (lv >= CONV_MAX) {
    $('mUpInfo').textContent = 'これ以上は強化できない';
    $('mUpWarn').style.visibility = 'hidden';
    up.textContent = 'MAX';
    up.disabled = true;
    up.classList.remove('armed');
  } else {
    const next = CONV_LV[lv + 1];
    $('mUpInfo').innerHTML = `Lv${lv + 1}：<b>${next.cost} ti → ${next.gain} de</b>　／　${fmt(UPGRADE_COST[lv])} ai`;
    $('mUpWarn').style.visibility = 'visible';
    up.disabled = ai < UPGRADE_COST[lv];
    if (up.disabled) upArmed = false;
    up.textContent = upArmed ? '本当に？' : '強化';
    up.classList.toggle('armed', upArmed);
  }
  $('mTi').textContent = fmt(state.ti);
  $('mDe').textContent = fmt(state.de);
  $('mAi').textContent = fmt(ai);
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

// ===== チュートリアル =====
const TUT = {
  1: { h: 'WASD で歩いてみよう', p: '<kbd>W</kbd> 前　<kbd>A</kbd> 左　<kbd>S</kbd> 後ろ　<kbd>D</kbd> 右　<kbd>Shift</kbd> を押しながらで走る', prog: () => tutMoved / 4 },
  2: { h: 'マウスで周りを見回そう', p: '画面をクリックするとマウスで視点が動きます（<kbd>Esc</kbd> で一時停止）', prog: () => tutLooked / 3 },
  3: { h: 'ここでは時間が ti になる', p: '1 秒ごとに <b>1 ti</b> 貯まっていく。10 ti 貯まるまで待ってみよう', prog: () => state.ti / CONVERT_COST },
  4: { h: '中央の装置で de に変換しよう', p: '装置に近づいて <kbd>E</kbd> を押すと <b>10 ti → 1 de</b>', prog: () => (state.de >= 1 ? 1 : 0) },
  5: { h: 'de が多いほど ti が速く貯まる', p: '1 秒の ti × (1 + 持っている de)。あとは放っておくだけ。', prog: () => tutTimer / 7 },
};
const TUT_LAST = 5;
// タッチ端末では操作の説明だけ差し替える
const TUT_TOUCH = {
  1: { h: '左下のスティックで歩いてみよう', p: 'スティックを指で倒した方向に進みます。<b>走る</b> ボタンで走れます' },
  2: { h: '画面をなぞって見回そう', p: 'スティック以外の場所を指でなぞると、視点が動きます' },
  4: { h: '中央の装置で de に変換しよう', p: '装置に近づいて、右下の <b>変換</b> ボタンで <b>10 ti → 1 de</b>' },
};

function renderTut() {
  const card = $('tut');
  const step = TUT[state.tut];
  $('hudTi').classList.toggle('show', state.tut >= 3);
  $('hudDe').classList.toggle('show', state.tut >= 4);
  if (!step || phase === 'wake') {
    card.classList.remove('show');
    return;
  }
  $('tutKicker').textContent = `TUTORIAL ${String(state.tut).padStart(2, '0')} / ${String(TUT_LAST).padStart(2, '0')}`;
  const text = (IS_TOUCH && TUT_TOUCH[state.tut]) || step;
  $('tutTitle').textContent = text.h;
  $('tutText').innerHTML = text.p;
  $('tutBar').style.width = '0%';
  card.classList.remove('show');
  void card.offsetWidth; // アニメーションをやり直す
  card.classList.add('show');
}

function updateTutorial(dt) {
  const step = TUT[state.tut];
  if (!step || phase === 'wake') return;
  if (state.tut === 5) tutTimer += dt;
  const p = clamp01(step.prog());
  $('tutBar').style.width = p * 100 + '%';
  if (p >= 1) {
    tutDoneWait += dt;
    if (tutDoneWait > 0.7) {
      tutDoneWait = 0;
      tutTimer = 0;
      state.tut++;
      renderTut();
      save();
    }
  }
}

// ===== 目覚めの演出 =====
async function say(text, ms = 1700) {
  const t = $('wakeText');
  t.textContent = text;
  t.classList.add('on');
  await sleep(ms);
  t.classList.remove('on');
  await sleep(500);
}

let wakeToken = 0; // 演出の途中でタイトルへ戻ったら、続きを止めるための番号
async function wakeUp() {
  const my = ++wakeToken;
  const alive = () => my === wakeToken;
  phase = 'wake';
  const w = $('wake');
  w.className = 'show';
  // ベッドで仰向けに寝ている状態
  state.x = BED.x; state.z = BED.z - 0.75; camY = 0.85; yaw = -2.48; pitch = 1.45;
  await sleep(700);
  await say('……');
  if (!alive()) return;
  await say('……ん？');
  if (!alive()) return;
  await say('目が覚めたら、知らない真っ白な部屋にいた。', 2800);
  if (!alive()) return;
  w.className = 'show blinking'; // まばたきしながら目を開ける
  await sleep(2700);
  if (!alive()) return;
  w.className = '';
  // 起き上がってベッドの横に立つ
  const from = { x: state.x, z: state.z };
  await tween(2400, (k) => {
    if (!alive()) return;
    const e = ease(k);
    state.x = lerp(from.x, -3.4, e);
    state.z = lerp(from.z, -4.4, e);
    camY = lerp(0.85, EYE, e);
    pitch = lerp(1.45, 0, e);
  });
  if (!alive()) return;
  phase = 'play';
  state.tut = 1;
  renderTut();
  save();
}

// ===== HUD =====
function updateHud() {
  $('tiVal').textContent = fmt(state.ti);
  $('tiRate').textContent = fmt(rate());
  $('deVal').textContent = fmt(state.de);
  $('mult').textContent = fmt(1 + state.de);
  $('aiVal').textContent = fmt(state.ai || 0);
  $('lvVal').textContent = (state.lv || 0) >= CONV_MAX ? 'MAX' : state.lv || 0;
  // ai は、作れるようになったら（または持っていたら）表示
  $('hudAi').classList.toggle('show', machineUnlocked() && ((state.ai || 0) > 0 || (state.lv || 0) > 0 || state.ti >= AI_COST));
  if (phase === 'menu') renderMachine();

  const prompt = $('prompt');
  const show = phase === 'play' && state.tut >= 4 && nearConverter();
  prompt.classList.toggle('show', show);
  const act = $('touchAct');
  act.classList.toggle('show', show);
  $('btnMachine').style.display = show && machineUnlocked() ? '' : 'none';
  if (show) {
    const c = conv();
    const can = state.ti >= c.cost;
    const rateTxt = `${c.cost} ti → ${c.gain} de`;
    prompt.classList.toggle('off', !can);
    act.classList.toggle('off', !can);
    if (IS_TOUCH) {
      $('promptText').textContent = can ? `${rateTxt} に変換できる` : `あと ${fmt(Math.ceil(c.cost - state.ti))} ti 必要`;
      return;
    }
    const panelHint = machineUnlocked() ? `　<span class="sub"><kbd>F</kbd> 装置を開く</span>` : '';
    $('promptText').innerHTML = (can
      ? `${rateTxt} に変換　<span class="sub"><kbd>Shift</kbd>+<kbd>E</kbd> でまとめて</span>`
      : `あと ${fmt(Math.ceil(c.cost - state.ti))} ti 必要`) + panelHint;
  }
}

// ===== メインループ =====
function frame(now) {
  rafId = requestAnimationFrame(frame);
  // realDt：実際に経過した時間（ti の計算用。重くてもタブが裏でも正確に貯まる）
  // dt：移動・演出用（大きく飛ばないように上限 0.1 秒）
  const realDt = Math.max(0, (now - lastT) / 1000);
  const dt = Math.min(0.1, realDt);
  lastT = now;
  const t = now / 1000;

  // 時間を消して ti を稼ぐ（放置ゲームなので一時停止中も貯まる）
  if (state.tut >= 3) state.ti += rate() * realDt;

  if (phase === 'play') move(dt);
  camera.position.set(state.x, camY, state.z);
  // 走っている間は視野を少し広げる（なめらかに）
  const fovTarget = phase === 'play' && moving && isRunning() ? FOV_RUN : FOV;
  if (Math.abs(camera.fov - fovTarget) > 0.05) {
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 8);
    camera.updateProjectionMatrix();
  }
  camera.rotation.set(pitch, yaw, 0);

  // 時計は逆回転（秒針1周60秒）
  hands.sec.rotation.z = (t / 60) * Math.PI * 2;
  hands.min.rotation.z = (t / 3600) * Math.PI * 2 + 1.2;
  hands.hour.rotation.z = (t / 43200) * Math.PI * 2 + 2.6;
  // 変換装置のアニメーション
  ringPulse = Math.max(0, ringPulse - dt * 2);
  ring.rotation.x = t * 0.7;
  ring.rotation.y = t * 1.1;
  ring.scale.setScalar(1 + ringPulse * 0.5);
  ring.material.emissiveIntensity = 1.2 + ringPulse * 4;
  gem.rotation.y = t * 1.3;
  gem.position.y = 1.6 + Math.sin(t * 2) * 0.05;
  orbs.forEach((o, i) => {
    o.visible = i < (state.lv || 0);
    const a = t * 1.6 + (i / CONV_MAX) * Math.PI * 2;
    o.position.set(Math.cos(a) * 0.32, 1.6 + Math.sin(a * 2) * 0.06, Math.sin(a) * 0.32);
  });

  updateTutorial(dt);
  updateHud();

  saveTimer += dt;
  if (saveTimer > 3) { saveTimer = 0; save(); }

  renderer.render(scene, camera);
}

// ===== セーブ・ロード =====
function save() {
  if (!state) return;
  state.yaw = yaw;
  state.pitch = pitch;
  state.savedAt = Date.now();
  localStorage.setItem(saveKey(), JSON.stringify(state));
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(saveKey()));
    if (!s || typeof s.ti !== 'number') return null;
    return { ...newState(), ...s };
  } catch { return null; }
}
addEventListener('beforeunload', () => { if (phase !== 'off') save(); });

// ===== 一時停止・タイトルへ =====
function pause() {
  phase = 'paused';
  for (const k in keys) keys[k] = false;
  if (window.TDG_resetStick) window.TDG_resetStick();
  $('pause').classList.add('active');
}
function resume() {
  $('pause').classList.remove('active');
  phase = 'play';
  if (!IS_TOUCH) lockPointer();
}
function toTitle() {
  wakeToken++;
  leaving = true;
  $('machine').classList.remove('active');
  save();
  // かるわかGAMES アカウントにログインしていれば、すぐクラウドにも保存
  if (window.KaAccount && KaAccount.isLoggedIn()) KaAccount.saveNow();
  phase = 'off';
  cancelAnimationFrame(rafId);
  $('pause').classList.remove('active');
  if (document.pointerLockElement) document.exitPointerLock();
  show('title'); // タイトル画面側（index.html）の関数
}

// ===== タイトル画面から呼ばれる入口 =====
window.TDG = {
  start(isNew, n = 1) {
    slot = n;
    init();
    if (window.TDG_resetStick) window.TDG_resetStick();
    state = isNew ? newState() : load() || newState();
    yaw = state.yaw; pitch = state.pitch || 0; camY = EYE;
    tutMoved = tutLooked = tutTimer = tutDoneWait = 0;
    leaving = false;
    show('play');
    $('wake').className = '';
    renderTut();
    updateHud();
    lastT = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
    if (isNew || state.tut === 0) {
      wakeUp();
    } else {
      phase = 'play';
      renderTut();
    }
  },
  resume,
  toTitle,
  // 開発用：状態の確認と、フレームを手動で進める（ms ミリ秒ぶん）
  _debug: {
    get state() { return state; },
    get phase() { return phase; },
    get slot() { return slot; },
    tick(ms) { cancelAnimationFrame(rafId); frame(lastT + ms); },
  },
};
