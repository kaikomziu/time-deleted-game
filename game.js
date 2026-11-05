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
const AI_COST = 100000;                   // 100,000 ti → 1 ai（変換装置2 Lv0 と同じ）
// 変換装置2（ti → ai 専用）
const AI_LV = [
  { cost: 100000, gain: 1 },
  { cost: 150000, gain: 2 },
  { cost: 250000, gain: 4 },
  { cost: 400000, gain: 6 },
  { cost: 600000, gain: 8 },
  { cost: 900000, gain: 10 },
];
const AI_MAX = AI_LV.length - 1;                              // 最大 Lv5
const UNLOCK2_COST = 10000;                                   // 変換装置2の解放にかかる ai
const UPGRADE2_COST = [20000, 40000, 80000, 160000, 320000];  // 変換装置2の強化にかかる ai（強化すると ai は 0 に）
// 変換装置3（ti → me 専用）。me は ti の増え方に ×(1 + me) の倍率
const ME_LV = [
  { cost: 1e10, gain: 1 },
  { cost: 1.5e10, gain: 2 },
  { cost: 2.5e10, gain: 4 },
  { cost: 4e10, gain: 6 },
  { cost: 6e10, gain: 8 },
  { cost: 9e10, gain: 10 },
];
const ME_MAX = ME_LV.length - 1;
const UNLOCK3_COST = 1000000;            // 変換装置3の解放にかかる ai
const UPGRADE3_COST = [2, 4, 8, 16, 32];  // 変換装置3の強化にかかる me（強化すると me は 0 に）
// 自動化機（ON の間、AUTO_INTERVAL 秒ごとに「まとめて」を自動でやる）
const AUTO_COST = { 1: 25, 2: 50000 };   // ai
const AUTO_INTERVAL = 5;
// 眠る（転生）：この周回で SLEEP_MIN ti 消すと眠れる。夢 = floor(√(この周回の ti ÷ SLEEP_MIN))
const SLEEP_MIN = 1e9;
// 装置の置き場所
const MACHINE_POS = { 1: { x: 0, z: 0 }, 2: { x: 3.4, z: 3.2 }, 3: { x: -3.4, z: 3.2 } };
const CONVERTER_R = 0.7;   // 変換装置の当たり判定
const INTERACT_DIST = 1.9; // 変換装置を使える距離
const BED = { x: -4.9, z: -4.7, w: 1.7, d: 2.5 };
const BED_BOX = { minX: BED.x - BED.w / 2, maxX: BED.x + BED.w / 2, minZ: BED.z - BED.d / 2, maxZ: BED.z + BED.d / 2 };
// 家具の当たり判定（箱と円）
const TABLE = { x: 4.7, z: -4.8 }, CHAIR = { x: 3.65, z: -4.8 }, PLANT = { x: -5.4, z: 0.8, r: 0.25 };
const BOXES = [
  BED_BOX,
  { minX: TABLE.x - 0.6, maxX: TABLE.x + 0.6, minZ: TABLE.z - 0.35, maxZ: TABLE.z + 0.35 },
  { minX: CHAIR.x - 0.25, maxX: CHAIR.x + 0.25, minZ: CHAIR.z - 0.25, maxZ: CHAIR.z + 0.25 },
];
const ACCENT = 0xd23a2c;
const INK = 0x141414;

// ===== 状態 =====
let renderer, scene, camera;
let hands = {};
const machines = {}; // 1: 変換装置1、2: 変換装置2（3D の部品と演出の状態）
let state = null;
let phase = 'off';          // off | wake | play | menu（装置パネル）| paused
let yaw = 0, pitch = 0, camY = EYE;
const keys = {};
let lastT = 0, saveTimer = 0, rafId = 0, achTimer = 0;
let tutMoved = 0, tutLooked = 0, tutTimer = 0, tutDoneWait = 0;
let leaving = false, dragging = false;
// タッチ操作の状態
let lookId = null, lookX = 0, lookY = 0;
let runToggle = false, moving = false; // スマホの「走る」ボタン（押すたびに切り替え）・いま動いているか
let stickId = null, stickCX = 0, stickCY = 0, stickX = 0, stickY = 0;

const newStats = () => ({ play: 0, totalTi: 0, bestRate: 0, de: 0, ai: 0, me: 0 });
const newState = () => ({ ti: 0, de: 0, ai: 0, me: 0, lv: 0, c2: false, lv2: 0, c3: false, lv3: 0,
  auto1: false, auto1On: true, auto2: false, auto2On: true,
  yume: 0, sleeps: 0, runTi: 0, ach: [], seen: [], st: newStats(), tut: 0, x: -3.4, z: -4.4, yaw: -2.48, pitch: 0 });
// 1 秒あたりの ti：基本 1 ti × (1 + 持っている de)
// 毎秒の ti = 1 ×（1 + de）×（1 + me）×（1 + 夢）
const rate = () => 1 * (1 + state.de) * (1 + (state.me || 0)) * (1 + (state.yume || 0));
// 眠ったときにもらえる夢
const yumeGain = () => Math.floor(Math.sqrt((state.runTi || 0) / SLEEP_MIN));
// いまの変換装置1の性能
const conv = () => CONV_LV[Math.min(state.lv || 0, CONV_MAX)];
// いまの変換装置2の性能（解放前は装置1のパネルで Lv0 の性能で作れる）
const conv2 = () => AI_LV[Math.min(state.lv2 || 0, AI_MAX)];
const conv3 = () => ME_LV[Math.min(state.lv3 || 0, ME_MAX)];
// 変換装置2・3の設定（パネル・解放・強化を共通の関数で扱う）
const GEN = {
  2: { p: 'm2', unlockedKey: 'c2', lvKey: 'lv2', table: AI_LV, max: AI_MAX, unlockCost: UNLOCK2_COST, unlockUnit: 'ai', unit: 'ai', upCost: UPGRADE2_COST, upUnit: 'ai' },
  3: { p: 'm3', unlockedKey: 'c3', lvKey: 'lv3', table: ME_LV, max: ME_MAX, unlockCost: UNLOCK3_COST, unlockUnit: 'ai', unit: 'me', upCost: UPGRADE3_COST, upUnit: 'me' },
};
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
// 数字の表示（設定の「数字の表示」に合わせる。整形は index.html の formatNum）
function fmt(n) {
  if (window.formatNum) return window.formatNum(n);
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
  buildMachine(1);
  buildMachine(2);
  buildMachine(3);
  buildProps();

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

// ===== 変換装置（1: 部屋の中央 ti → de、2: 手前右 ti → ai） =====
// 床に「CONVERTER 01」などの文字を書くテクスチャ
function floorLabel(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 512, 96);
  x.fillStyle = color;
  x.font = '600 40px Consolas, "Cascadia Mono", monospace';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text.split('').join(' '), 256, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildMachine(id) {
  const { x, z } = MACHINE_POS[id];
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);
  add(new THREE.CylinderGeometry(0.45, 0.55, 0.95, 48), std(0xffffff, { roughness: 0.6 }), 0, 0.475, 0, g);
  add(new THREE.CylinderGeometry(0.47, 0.47, 0.04, 48), std(INK, { roughness: 0.4 }), 0, 0.97, 0, g);
  const glowMat = new THREE.MeshBasicMaterial({ color: ACCENT });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.36, 48), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.995;
  g.add(glow);

  // 浮かぶリング（装置2は2本）
  const ringMat = new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 1.2 });
  const rings = [];
  for (let i = 0; i < id; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.42 - i * 0.09, 0.022, 16, 96), ringMat);
    r.position.y = 1.6;
    g.add(r);
    rings.push(r);
  }

  // 中の宝石（装置1は黒の八面体、装置2は白の二十面体）
  // 装置1は黒の八面体、装置2は白の二十面体、装置3は赤の四面体
  const gem = new THREE.Mesh(
    id === 1 ? new THREE.OctahedronGeometry(0.17) : id === 2 ? new THREE.IcosahedronGeometry(0.15) : new THREE.TetrahedronGeometry(0.2),
    new THREE.MeshStandardMaterial({ color: id === 1 ? INK : id === 2 ? 0xffffff : ACCENT, roughness: 0.25, metalness: id === 1 ? 0.4 : 0.1 })
  );
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

  // 床の名前
  const labelMat = new THREE.MeshBasicMaterial({ map: floorLabel(`CONVERTER 0${id}`, '#141414'), transparent: true, opacity: 0.7, depthWrite: false });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), labelMat);
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, 0.006, 1.25);
  g.add(label);

  // アップグレードしたレベルの数だけ、赤い玉が宝石のまわりを回る
  const orbMat = new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 1.5 });
  const orbs = [];
  for (let i = 0; i < CONV_MAX; i++) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), orbMat);
    o.visible = false;
    g.add(o);
    orbs.push(o);
  }

  const light = new THREE.PointLight(ACCENT, 3, 4, 2);
  light.position.y = 1.5;
  g.add(light);

  // 自動化機（買うと装置の横に現れる小さな黒い箱。ON の間は赤いランプが点滅）
  let auto = null, autoLamp = null;
  if (id <= 2) {
    auto = new THREE.Group();
    auto.position.set(-0.62, 0, 0);
    add(new THREE.BoxGeometry(0.28, 0.55, 0.28), std(INK, { roughness: 0.5 }), 0, 0.275, 0, auto);
    autoLamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 2 }));
    autoLamp.position.y = 0.6;
    auto.add(autoLamp);
    auto.visible = false;
    g.add(auto);
  }

  machines[id] = { id, x, z, g, rings, ringMat, glowMat, gem, orbs, light, labelMat, auto, autoLamp, pulse: 0, locked: null };
}

// 装置2：ロック中は灰色・光らない、解放すると赤く光る
function setMachineLocked(m, locked) {
  if (m.locked === locked) return;
  m.locked = locked;
  const col = locked ? 0xb5b5b5 : ACCENT;
  m.ringMat.color.setHex(col);
  m.ringMat.emissive.setHex(locked ? 0x000000 : ACCENT);
  m.glowMat.color.setHex(locked ? 0x9a9a9a : ACCENT);
  m.light.intensity = locked ? 0 : 3;
  if (m.labelMat.map) m.labelMat.map.dispose();
  m.labelMat.map = floorLabel(locked ? `CONVERTER 0${m.id}  LOCKED` : `CONVERTER 0${m.id}`, locked ? '#888888' : '#141414');
  m.labelMat.needsUpdate = true;
}

// ===== 家具（調べられる物）と、進めると現れる物 =====
const props = {};
function buildProps() {
  const white = std(0xffffff), ink = std(INK, { roughness: 0.5 });
  // テーブルとノート（右奥の角）
  const table = new THREE.Group();
  table.position.set(TABLE.x, 0, TABLE.z);
  scene.add(table);
  add(new THREE.BoxGeometry(1.2, 0.05, 0.7), white, 0, 0.75, 0, table);
  for (const [lx, lz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) add(new THREE.BoxGeometry(0.04, 0.75, 0.04), ink, lx, 0.375, lz, table);
  add(new THREE.BoxGeometry(0.32, 0.025, 0.24), ink, 0.15, 0.79, 0.05, table);
  add(new THREE.BoxGeometry(0.3, 0.01, 0.22), white, 0.15, 0.805, 0.05, table);
  // 椅子（テーブルの左）
  const chair = new THREE.Group();
  chair.position.set(CHAIR.x, 0, CHAIR.z);
  scene.add(chair);
  add(new THREE.BoxGeometry(0.45, 0.05, 0.45), white, 0, 0.46, 0, chair);
  for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) add(new THREE.BoxGeometry(0.035, 0.46, 0.035), ink, lx, 0.23, lz, chair);
  add(new THREE.BoxGeometry(0.04, 0.5, 0.45), white, -0.21, 0.72, 0, chair);
  // 植木鉢（左の壁ぎわ）。眠ったことがあると赤い花が咲く
  const plant = new THREE.Group();
  plant.position.set(PLANT.x, 0, PLANT.z);
  scene.add(plant);
  add(new THREE.CylinderGeometry(0.22, 0.16, 0.36, 32), white, 0, 0.18, 0, plant);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 8), ink, 0, 0.8, 0, plant);
  for (let i = 0; i < 4; i++) {
    const leaf = add(new THREE.BoxGeometry(0.28, 0.015, 0.08), ink, 0, 0.55 + i * 0.16, 0, plant);
    leaf.rotation.y = i * 1.3;
    leaf.rotation.z = 0.35;
    leaf.position.x = Math.cos(i * 1.3) * 0.12;
    leaf.position.z = -Math.sin(i * 1.3) * 0.12;
  }
  props.flower = add(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.4 }), 0, 1.27, 0, plant);
  // 額縁（左の壁。中は真っ白）
  add(new THREE.BoxGeometry(0.04, 0.95, 1.25), ink, -HALF + 0.02, 2.1, -1.6);
  add(new THREE.BoxGeometry(0.045, 0.83, 1.13), white, -HALF + 0.03, 2.1, -1.6);
  // コンセント（右の壁の下）
  add(new THREE.BoxGeometry(0.02, 0.13, 0.09), white, HALF - 0.01, 0.3, 0.6);
  add(new THREE.BoxGeometry(0.025, 0.035, 0.01), ink, HALF - 0.012, 0.3, 0.58);
  add(new THREE.BoxGeometry(0.025, 0.035, 0.01), ink, HALF - 0.012, 0.3, 0.62);

  // 進めると現れる物 ----------------------------------------------------
  // 壁のひび（奥の壁。はじめて ai を作ると現れる）
  const pts = [[-2.4, 3.4], [-2.1, 3.0], [-2.25, 2.7], [-1.85, 2.35], [-1.95, 2.05], [-1.6, 1.75]].map(([x, y]) => new THREE.Vector3(x, y, -HALF + 0.015));
  props.crack = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: INK }));
  const branch = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pts[2], new THREE.Vector3(-2.55, 2.45, -HALF + 0.015)]), new THREE.LineBasicMaterial({ color: INK }));
  props.crack.add(branch);
  scene.add(props.crack);
  // 2つ目の時計（左の壁。変換装置2を解放すると現れる。こっちはすごく速く進む）
  const c2 = new THREE.Group();
  c2.position.set(-HALF + 0.02, 2.6, 3.0);
  c2.rotation.y = Math.PI / 2;
  scene.add(c2);
  c2.add(new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), white));
  c2.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 10, 48), ink));
  const hand2 = (w, len, z, mat) => {
    const pv = new THREE.Group();
    pv.position.z = z;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.01), mat);
    m.position.y = len / 2 - 0.04;
    pv.add(m);
    c2.add(pv);
    return pv;
  };
  props.c2min = hand2(0.03, 0.32, 0.02, ink);
  props.c2sec = hand2(0.01, 0.38, 0.03, std(ACCENT));
  props.clock2 = c2;
  // ドア（右の壁。変換装置3を解放すると現れる。取っ手がない）
  const door = new THREE.Group();
  door.position.set(HALF - 0.03, 0, -1.8);
  scene.add(door);
  add(new THREE.BoxGeometry(0.04, 2.15, 1.0), std(0xebebe9), 0, 1.075, 0, door);
  for (const [w, h, y, z] of [[0.05, 2.2, 1.1, -0.52], [0.05, 2.2, 1.1, 0.52], [0.05, 0.05, 2.18, 0]]) add(new THREE.BoxGeometry(0.05, h, z === 0 ? 1.09 : 0.04), ink, -0.005, y, z, door);
  props.door = door;
}

// 進み具合に合わせて部屋を変える（毎フレーム）
function updateRoom(t) {
  const st = state.st || {};
  props.crack.visible = (st.ai || 0) > 0 || state.c2;
  props.clock2.visible = !!state.c2;
  props.door.visible = !!state.c3;
  props.flower.visible = (state.sleeps || 0) > 0;
  props.c2sec.rotation.z = -(t / 6) * Math.PI * 2;
  props.c2min.rotation.z = -(t / 360) * Math.PI * 2;
}

// ===== 調べられる物（E で一言メッセージ） =====
const hms = (sec) => {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s2 = sec % 60;
  return (h ? `${h}時間` : '') + `${m}分${s2}秒`;
};
const EXAMS = [
  { id: 'clock', name: '時計', x: 2, z: -5.3, show: () => true, msgs: () => [
    `プレイ時間 ${hms(state.st.play)}。`,
    `これまでに消した ti は ${fmt(state.st.totalTi)}。`,
    '針が逆向きに回っている。',
  ] },
  { id: 'bed', name: 'ベッド', x: -3.6, z: -4.7, show: () => true, msgs: () => [
    'ここで目が覚めた。',
    'まだ少し温かい。',
    state.tut >= 6 && yumeGain() >= 1 ? '今なら、眠れば全部消せる気がする。（F で眠る）' : 'まだ眠くない。',
  ] },
  { id: 'note', name: 'ノート', x: 4.6, z: -4.0, show: () => true, msgs: () => [
    '真っ白なノート。何も書かれていない。',
    '最後のページに、小さく「ti」とだけ書いてある。',
    'めくるたびに、白いページが増えている気がする。',
  ] },
  { id: 'chair', name: '椅子', x: 3.65, z: -4.0, show: () => true, msgs: () => [
    '座るにはちょっと硬そう。',
    '誰かが座っていた跡はない。',
  ] },
  { id: 'plant', name: '植木鉢', x: -4.7, z: 0.8, show: () => true, msgs: () => (state.sleeps > 0
    ? ['赤い花が咲いている。眠っている間に咲いたらしい。', '白い鉢に、黒い茎。花だけが赤い。']
    : ['白い鉢に、黒い茎だけの植物。', '水をあげる方法がない。']) },
  { id: 'frame', name: '額縁', x: -5.2, z: -1.6, show: () => true, msgs: () => [
    '何も描かれていない額縁。',
    'じっと見ていると、少しだけ白さが違う気がする。',
  ] },
  { id: 'outlet', name: 'コンセント', x: 5.3, z: 0.6, show: () => true, msgs: () => [
    'コンセント。何もささっていない。',
    'この部屋の装置は、どこから電気をもらっているんだろう。',
  ] },
  { id: 'crack', name: '壁のひび', x: -2.0, z: -5.3, show: () => props.crack.visible, msgs: () => [
    '壁にひびが入っている。さっきまでなかった気がする。',
    'ひびの向こうも、白い。',
  ] },
  { id: 'clock2', name: '2つ目の時計', x: -5.3, z: 3.0, show: () => props.clock2.visible, msgs: () => [
    'いつの間にか、時計が増えている。',
    'こっちはすごい速さで進んでいる。',
  ] },
  { id: 'door', name: 'ドア', x: 5.3, z: -1.8, show: () => props.door.visible, msgs: () => [
    '取っ手のないドア。',
    '押しても引いても動かない。',
    'ドアの向こうから、時計の音が聞こえる気がする。',
  ] },
];
const EXAM_BASE = ['clock', 'bed', 'note', 'chair', 'plant', 'frame', 'outlet'];
const examIdx = {};
// いちばん近くて、だいたい前にある「調べられる物」
function nearExam() {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let best = null, bestD = 1.7;
  for (const e of EXAMS) {
    if (!e.show()) continue;
    const dx = e.x - state.x, dz = e.z - state.z, d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    if (d > 0.6 && (dx * fx + dz * fz) / d < 0.2) continue; // 背中側は調べない
    best = e; bestD = d;
  }
  return best;
}
let msgTimer = 0;
function examine(e) {
  const list = e.msgs();
  const i = (examIdx[e.id] || 0) % list.length;
  examIdx[e.id] = i + 1;
  if (!state.seen.includes(e.id)) state.seen.push(e.id);
  showMsg(e.name, list[i]);
  Sound.play('look');
}
function showMsg(name, text) {
  $('msgName').textContent = name;
  $('msgText').textContent = text;
  const m = $('msg');
  m.classList.remove('show');
  void m.offsetWidth;
  m.classList.add('show');
  msgTimer = 4.5;
}

// ===== 実績 =====
const ACH = [
  { id: 'de1', name: 'はじめての de', desc: 'de を作る', ok: (s) => s.st.de >= 1 },
  { id: 'de1k', name: 'de コレクター', desc: 'de を合計 1,000 作る', ok: (s) => s.st.de >= 1000 },
  { id: 'ai1', name: 'はじめての ai', desc: 'ai を作る', ok: (s) => s.st.ai >= 1 },
  { id: 'lv1max', name: '変換装置1 MAX', desc: '変換装置1を Lv5 にする', ok: (s) => s.lv >= CONV_MAX },
  { id: 'c2', name: '2台目', desc: '変換装置2を解放する', ok: (s) => s.c2 },
  { id: 'lv2max', name: '変換装置2 MAX', desc: '変換装置2を Lv5 にする', ok: (s) => s.lv2 >= AI_MAX },
  { id: 'c3', name: '3台目', desc: '変換装置3を解放する', ok: (s) => s.c3 },
  { id: 'me1', name: 'はじめての me', desc: 'me を作る', ok: (s) => s.st.me >= 1 },
  { id: 'auto', name: 'おまかせ', desc: '自動化機を買う', ok: (s) => s.auto1 || s.auto2 },
  { id: 'ti1m', name: '100万', desc: 'ti を合計 100万 消す', ok: (s) => s.st.totalTi >= 1e6 },
  { id: 'ti1b', name: '10億', desc: 'ti を合計 10億 消す', ok: (s) => s.st.totalTi >= 1e9 },
  { id: 'ti1t', name: '1兆', desc: 'ti を合計 1兆 消す', ok: (s) => s.st.totalTi >= 1e12 },
  { id: 'sleep1', name: 'おやすみ', desc: 'はじめて眠る', ok: (s) => s.sleeps >= 1 },
  { id: 'sleep5', name: 'よく眠る', desc: '5回眠る', ok: (s) => s.sleeps >= 5 },
  { id: 'look', name: '観察', desc: '部屋の物を全部調べる', ok: (s) => EXAM_BASE.every((id) => s.seen.includes(id)) },
  { id: 'hour', name: '1時間', desc: '合計 1時間 遊ぶ', ok: (s) => s.st.play >= 3600 },
];
function checkAch() {
  for (const a of ACH) {
    if (state.ach.includes(a.id) || !a.ok(state)) continue;
    state.ach.push(a.id);
    toast(`実績：${a.name}`);
    Sound.play('ach');
  }
}
function renderAch() {
  $('achCount').textContent = `${state.ach.length} / ${ACH.length}`;
  $('achList').innerHTML = ACH.map((a) => {
    const got = state.ach.includes(a.id);
    return `<div class="ach ${got ? 'got' : ''}"><div class="ach-mark">${got ? '✓' : ''}</div><div><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div></div></div>`;
  }).join('');
}
function renderStats() {
  const st = state.st;
  const rows = [
    ['プレイ時間', hms(st.play)],
    ['これまでに消した ti', fmt(st.totalTi)],
    ['この周回で消した ti', fmt(state.runTi)],
    ['いちばん速かった ti / 秒', fmt(st.bestRate)],
    ['作った de', fmt(st.de)],
    ['作った ai', fmt(st.ai)],
    ['作った me', fmt(st.me)],
    ['眠った回数', fmt(state.sleeps)],
    ['夢', `${fmt(state.yume)}（ti ×${fmt(1 + state.yume)}）`],
    ['実績', `${state.ach.length} / ${ACH.length}`],
  ];
  $('statList').innerHTML = rows.map(([k, v]) => `<div class="srow"><span>${k}</span><b>${v}</b></div>`).join('');
}
function openSub(id) {
  if (id === 'achPanel') renderAch(); else renderStats();
  $('pause').classList.remove('active');
  $(id).classList.add('active');
}
function closeSub() {
  $('achPanel').classList.remove('active');
  $('statsPanel').classList.remove('active');
  $('pause').classList.add('active');
}
const subOpen = () => $('achPanel').classList.contains('active') || $('statsPanel').classList.contains('active');

// ===== 音（Web Audio で作る。ファイルは使わない） =====
const Sound = (() => {
  let ctx = null, bgm = null, se = null, lastTick = -1;
  const vol = () => (window.getSettings ? window.getSettings() : { bgm: 70, se: 70 });
  function ensure() {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        bgm = ctx.createGain(); se = ctx.createGain();
        bgm.connect(ctx.destination); se.connect(ctx.destination);
        ambient();
      }
      if (ctx.state === 'suspended') ctx.resume();
      update();
    } catch {}
  }
  // 環境音：低いうなり（ゆっくり揺れる）＋かすかな空気の音
  function ambient() {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 500; lp.connect(bgm);
    [[55, 0.5], [82.4, 0.28], [110.2, 0.14]].forEach(([f, a], i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = a;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.04;
      const lg = ctx.createGain(); lg.gain.value = a * 0.4;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(lp); o.start(); lfo.start();
    });
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = 0.05;
    n.connect(bp).connect(ng).connect(bgm); n.start();
  }
  function update() {
    if (!ctx) return;
    const v = vol();
    bgm.gain.value = ((v.bgm ?? 70) / 100) * 0.16;
    se.gain.value = ((v.se ?? 70) / 100) * 0.45;
  }
  function tone(freq, dur = 0.14, type = 'sine', when = 0, peak = 0.6, bus = se) {
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  const SFX = {
    de: () => { tone(660, 0.1); tone(990, 0.14, 'sine', 0.05, 0.4); },
    ai: () => { tone(880, 0.1); tone(1320, 0.16, 'sine', 0.06, 0.4); },
    me: () => { tone(523, 0.1); tone(784, 0.1, 'sine', 0.05); tone(1046, 0.2, 'sine', 0.1, 0.4); },
    up: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.07, 0.5)),
    unlock: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.3, 'triangle', i * 0.09, 0.5)),
    ach: () => { tone(784, 0.15, 'triangle'); tone(1175, 0.3, 'triangle', 0.1, 0.5); },
    look: () => tone(440, 0.18, 'triangle', 0, 0.3),
    buy: () => { tone(330, 0.08, 'square', 0, 0.2); tone(660, 0.15, 'triangle', 0.05, 0.4); },
    no: () => tone(150, 0.12, 'square', 0, 0.2),
    sleep: () => [784, 659, 523, 392, 262].forEach((f, i) => tone(f, 0.5, 'sine', i * 0.18, 0.4)),
  };
  return {
    ensure, update,
    play(name) { if (SFX[name]) SFX[name](); },
    // 時計の秒の音（環境音の音量で鳴らす）
    tick(t) {
      const sec = Math.floor(t);
      if (sec === lastTick) return;
      lastTick = sec;
      tone(sec % 2 ? 1900 : 1700, 0.03, 'square', 0, 0.12, bgm);
    },
    suspend() { try { if (ctx) ctx.suspend(); } catch {} },
  };
})();

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
    if (e.code === 'KeyE' && phase === 'play') primaryAction(e.shiftKey);
    if (e.code === 'KeyF') {
      if (phase === 'play') openMachine();
      else if (phase === 'menu') closeMachine();
    }
    if (e.code === 'Escape') {
      if (phase === 'menu') closeMachine();
      else if (phase === 'play' && !isLocked()) pause();
      else if (phase === 'paused') { if (subOpen()) closeSub(); else resume(); }
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
  $('btnAct').addEventListener('click', () => { if (phase === 'play') primaryAction(false); });
  $('btnActAll').addEventListener('click', () => { if (phase === 'play') primaryAction(true); });
  $('btnMachine').addEventListener('click', () => { if (phase === 'play') openMachine(); });

  // ===== 変換装置1のパネル =====
  $('mConv1').addEventListener('click', () => convert(false, true));
  $('mConvAll').addEventListener('click', () => convert(true, true));
  $('mAi1').addEventListener('click', () => makeAi(false));
  $('mAiAll').addEventListener('click', () => makeAi(true));
  $('mUp').addEventListener('click', upgrade);
  $('mClose').addEventListener('click', closeMachine);
  $('machine').addEventListener('click', (e) => { if (e.target.id === 'machine') closeMachine(); });
  $('mAuto').addEventListener('click', () => buyAuto(1));
  // 変換装置2・3のパネル
  for (const id of [2, 3]) {
    const p = GEN[id].p, make = id === 2 ? makeAi : makeMe;
    $(p + 'Unlock').addEventListener('click', () => unlockGen(id));
    $(p + 'Make1').addEventListener('click', () => make(false));
    $(p + 'MakeAll').addEventListener('click', () => make(true));
    $(p + 'Up').addEventListener('click', () => upgradeGen(id));
    $(p + 'Close').addEventListener('click', closeMachine);
    $('machine' + id).addEventListener('click', (e) => { if (e.target.id === 'machine' + id) closeMachine(); });
  }
  $('m2Auto').addEventListener('click', () => buyAuto(2));
  // 眠る
  $('btnSleep').addEventListener('click', trySleep);
  $('sClose').addEventListener('click', closeMachine);
  $('sleepPanel').addEventListener('click', (e) => { if (e.target.id === 'sleepPanel') closeMachine(); });
  // 一時停止メニューの実績・統計
  $('btnAch').addEventListener('click', () => openSub('achPanel'));
  $('btnStats').addEventListener('click', () => openSub('statsPanel'));
  $('achClose').addEventListener('click', closeSub);
  $('statsClose').addEventListener('click', closeSub);
  // 最初の操作で音を鳴らせるようにする（ブラウザの決まり）
  addEventListener('pointerdown', () => { if (phase !== 'off') Sound.ensure(); });
  addEventListener('keydown', () => { if (phase !== 'off') Sound.ensure(); });

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

  // ベッド・テーブル・椅子（箱）から押し出す
  const r = PLAYER_R;
  for (const b of BOXES) {
    if (state.x > b.minX - r && state.x < b.maxX + r && state.z > b.minZ - r && state.z < b.maxZ + r) {
      const push = [
        [b.minX - r - state.x, 0], [b.maxX + r - state.x, 0],
        [0, b.minZ - r - state.z], [0, b.maxZ + r - state.z],
      ].sort((p, q) => Math.hypot(...p) - Math.hypot(...q))[0];
      state.x += push[0];
      state.z += push[1];
    }
  }
  // 植木鉢（円）
  {
    const dx = state.x - PLANT.x, dz = state.z - PLANT.z, d = Math.hypot(dx, dz), min = PLANT.r + r;
    if (d < min && d > 0.0001) { state.x = PLANT.x + (dx / d) * min; state.z = PLANT.z + (dz / d) * min; }
  }

  // 変換装置（円柱）から押し出す
  for (const m of Object.values(machines)) {
    const dx = state.x - m.x, dz = state.z - m.z;
    const d = Math.hypot(dx, dz), min = CONVERTER_R + PLAYER_R;
    if (d < min) {
      state.x = d > 0.0001 ? m.x + (dx / d) * min : m.x + min;
      state.z = d > 0.0001 ? m.z + (dz / d) * min : m.z;
    }
  }
}

// いま近くにある装置（1 / 2 / なし=0）。装置2はチュートリアルが終わってから
function nearMachine() {
  if (Math.hypot(state.x - MACHINE_POS[1].x, state.z - MACHINE_POS[1].z) < INTERACT_DIST) return 1;
  for (const id of [2, 3]) {
    if (machineUnlocked() && Math.hypot(state.x - MACHINE_POS[id].x, state.z - MACHINE_POS[id].z) < INTERACT_DIST) return id;
  }
  return 0;
}
const nearConverter = () => nearMachine() === 1;
// E（スマホは変換ボタン）：近くの装置で、いちばん基本の変換をする
function primaryAction(all) {
  const n = nearMachine();
  if (n === 1) convert(all);
  else if (n === 2 && state.c2) makeAi(all);
  else if (n === 3 && state.c3) makeMe(all);
  else if (!n) {
    const e = nearExam();
    if (e) examine(e);
  }
}

// ===== ti → de 変換 =====
function convert(all, fromPanel = false, quiet = false) {
  if (state.tut < 4 || (!fromPanel && !nearConverter())) return;
  const c = conv();
  const n = all ? Math.floor(state.ti / c.cost) : state.ti >= c.cost ? 1 : 0;
  if (n <= 0) {
    if (quiet) return;
    Sound.play('no');
    const p = $('prompt');
    p.classList.remove('shake');
    void p.offsetWidth;
    p.classList.add('shake');
    return;
  }
  state.ti -= n * c.cost;
  state.de += n * c.gain;
  state.st.de += n * c.gain;
  machines[1].pulse = 1;
  if (quiet) return;
  Sound.play('de');
  toast(`+${fmt(n * c.gain)} de`);
  save();
  if (phase === 'menu') renderMachine();
}

// ===== ti → ai（変換装置2。解放前は装置1のパネルで Lv0 の性能） =====
function makeAi(all, quiet = false) {
  const c = conv2();
  const n = all ? Math.floor(state.ti / c.cost) : state.ti >= c.cost ? 1 : 0;
  if (n <= 0) { if (!quiet) Sound.play('no'); return; }
  state.ti -= n * c.cost;
  state.ai = (state.ai || 0) + n * c.gain;
  state.st.ai += n * c.gain;
  machines[state.c2 ? 2 : 1].pulse = 1;
  if (quiet) return;
  Sound.play('ai');
  toast(`+${fmt(n * c.gain)} ai`);
  save();
  if (phase === 'menu') renderMachine();
}

// ===== ti → me（変換装置3） =====
function makeMe(all) {
  if (!state.c3) return;
  const c = conv3();
  const n = all ? Math.floor(state.ti / c.cost) : state.ti >= c.cost ? 1 : 0;
  if (n <= 0) { Sound.play('no'); return; }
  state.ti -= n * c.cost;
  state.me = (state.me || 0) + n * c.gain;
  state.st.me += n * c.gain;
  machines[3].pulse = 1;
  Sound.play('me');
  toast(`+${fmt(n * c.gain)} me`);
  save();
  if (phase === 'menu') renderMachine();
}

// ===== 自動化機 =====
function buyAuto(id) {
  const key = 'auto' + id;
  if (state[key]) {
    // 買ったあとは ON / OFF の切り替え
    state[key + 'On'] = !state[key + 'On'];
  } else {
    if ((state.ai || 0) < AUTO_COST[id]) return;
    state.ai -= AUTO_COST[id];
    state[key] = true;
    state[key + 'On'] = true;
    Sound.play('buy');
    toast(`自動化機${id} を置いた`);
  }
  save();
  renderMachine();
}
let autoTimer = 0;
function runAutos(realDt) {
  if (!machineUnlocked()) return;
  autoTimer += realDt;
  if (autoTimer < AUTO_INTERVAL) return;
  autoTimer %= AUTO_INTERVAL;
  if (state.auto1 && state.auto1On) convert(true, true, true);
  if (state.auto2 && state.auto2On && state.c2) makeAi(true, true);
}
// パネルの自動化機の行
function renderAuto(id, p) {
  const key = 'auto' + id, b = $(p + 'Auto');
  if (!state[key]) {
    $(p + 'AutoInfo').innerHTML = `${AUTO_INTERVAL}秒ごとに「まとめて」を自動でやる　／　${fmt(AUTO_COST[id])} ai`;
    b.textContent = '買う';
    b.disabled = (state.ai || 0) < AUTO_COST[id];
    b.classList.remove('on');
  } else {
    const on = state[key + 'On'];
    $(p + 'AutoInfo').textContent = on ? `${AUTO_INTERVAL}秒ごとに自動で動いている` : '止めている';
    b.textContent = on ? 'ON' : 'OFF';
    b.disabled = false;
    b.classList.toggle('on', on);
  }
}

// ===== 変換装置2・3の解放 =====
function unlockGen(id) {
  const g = GEN[id];
  if (state[g.unlockedKey] || (state[g.unlockUnit] || 0) < g.unlockCost) return;
  if (!upArmed) { upArmed = true; renderMachine(); return; }
  upArmed = false;
  state[g.unlockUnit] -= g.unlockCost;
  state[g.unlockedKey] = true;
  state[g.lvKey] = 0;
  machines[id].pulse = 1.6;
  Sound.play('unlock');
  toast(`変換装置${id} を解放`);
  save();
  renderMachine();
}

// ===== 変換装置2・3のアップグレード（強化すると、作る資源は 0 になる） =====
function upgradeGen(id) {
  const g = GEN[id], lv = state[g.lvKey] || 0;
  if (!state[g.unlockedKey] || lv >= g.max) return;
  if ((state[g.upUnit] || 0) < g.upCost[lv]) return;
  if (!upArmed) { upArmed = true; renderMachine(); return; }
  upArmed = false;
  state[g.upUnit] -= g.upCost[lv];
  state[g.unit] = 0;
  state[g.lvKey] = lv + 1;
  machines[id].pulse = 1.6;
  Sound.play('up');
  toast(`変換装置${id} Lv${state[g.lvKey]}`);
  save();
  renderMachine();
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
  machines[1].pulse = 1.6;
  Sound.play('up');
  toast(`変換装置1 Lv${state.lv}`);
  save();
  renderMachine();
}

// ===== パネルの開け閉め =====
let openPanel = null; // 'machine'（装置1）か 'machine2'（装置2）
function openMachine() {
  const n = nearMachine();
  if (!machineUnlocked()) return;
  // 装置が近くになければ、ベッドで眠る
  if (!n) {
    const e = nearExam();
    if (e && e.id === 'bed') openSleep();
    return;
  }
  phase = 'menu';
  upArmed = false;
  openPanel = n === 1 ? 'machine' : 'machine' + n;
  for (const k in keys) keys[k] = false;
  if (window.TDG_resetStick) window.TDG_resetStick();
  if (document.pointerLockElement) document.exitPointerLock();
  renderMachine();
  $(openPanel).classList.add('active');
}
function closeMachine() {
  for (const id of ['machine', 'machine2', 'machine3', 'sleepPanel']) $(id).classList.remove('active');
  openPanel = null;
  phase = 'play';
  upArmed = false;
  if (!IS_TOUCH) lockPointer();
}

// パネルの中身（開いている間は毎フレーム更新）
function renderMachine() {
  if (openPanel === 'machine2') renderGen(2);
  else if (openPanel === 'machine3') renderGen(3);
  else if (openPanel === 'sleepPanel') renderSleep();
  else renderMachine1();
}
function lvBar(lv, max) {
  return Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
}
function renderMachine1() {
  const lv = state.lv || 0, c = conv(), ai = state.ai || 0;
  $('mLv').textContent = lv >= CONV_MAX ? 'Lv MAX' : `Lv ${lv}`;
  $('mLvBar').innerHTML = Array.from({ length: CONV_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
  $('mConvRate').textContent = `${c.cost} ti → ${c.gain} de`;
  $('mConv1').disabled = state.ti < c.cost;
  $('mConvAll').disabled = state.ti < c.cost * 2;
  // ai づくりは、変換装置2を解放するまでは装置1で（Lv0 の性能）
  $('mAiRow').style.display = state.c2 ? 'none' : '';
  $('mAiRate').textContent = `${fmt(AI_COST)} ti → 1 ai`;
  $('mAi1').disabled = state.ti < AI_COST;
  $('mAiAll').disabled = state.ti < AI_COST * 2;
  $('mAiMoved').style.display = state.c2 ? '' : 'none';
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
  renderAuto(1, 'm');
  $('mTi').textContent = fmt(state.ti);
  $('mDe').textContent = fmt(state.de);
  $('mAi').textContent = fmt(ai);
}

function renderGen(id) {
  const g = GEN[id], p = g.p;
  const lv = state[g.lvKey] || 0, unlocked = !!state[g.unlockedKey];
  const has = (k) => state[k] || 0;
  $(p + 'Lock').style.display = unlocked ? 'none' : '';
  $(p + 'Body').style.display = unlocked ? '' : 'none';
  $(p + 'Lv').textContent = !unlocked ? 'LOCKED' : lv >= g.max ? 'Lv MAX' : `Lv ${lv}`;
  $(p + 'LvBar').innerHTML = lvBar(unlocked ? lv : 0, g.max);
  if (!unlocked) {
    const b = $(p + 'Unlock');
    b.disabled = has(g.unlockUnit) < g.unlockCost;
    if (b.disabled) upArmed = false;
    b.textContent = upArmed ? '本当に？' : '解放する';
    b.classList.toggle('armed', upArmed);
    $(p + 'UnlockCost').textContent = `${fmt(g.unlockCost)} ${g.unlockUnit}（いま ${fmt(has(g.unlockUnit))} ${g.unlockUnit}）`;
  } else {
    const c = g.table[Math.min(lv, g.max)];
    $(p + 'Rate').textContent = `${fmt(c.cost)} ti → ${c.gain} ${g.unit}`;
    $(p + 'Make1').disabled = state.ti < c.cost;
    $(p + 'MakeAll').disabled = state.ti < c.cost * 2;
    const up = $(p + 'Up');
    if (lv >= g.max) {
      $(p + 'UpInfo').textContent = 'これ以上は強化できない';
      $(p + 'UpWarn').style.visibility = 'hidden';
      up.textContent = 'MAX';
      up.disabled = true;
      up.classList.remove('armed');
    } else {
      const next = g.table[lv + 1];
      $(p + 'UpInfo').innerHTML = `Lv${lv + 1}：<b>${fmt(next.cost)} ti → ${next.gain} ${g.unit}</b>　／　${fmt(g.upCost[lv])} ${g.upUnit}`;
      $(p + 'UpWarn').style.visibility = 'visible';
      up.disabled = has(g.upUnit) < g.upCost[lv];
      if (up.disabled) upArmed = false;
      up.textContent = upArmed ? '本当に？' : '強化';
      up.classList.toggle('armed', upArmed);
    }
    if (id === 2) renderAuto(2, 'm2');
  }
  $(p + 'Ti').textContent = fmt(state.ti);
  $(p + 'Res').textContent = `${fmt(has(g.unit))} ${g.unit}` + (g.unit !== 'ai' ? ` / ${fmt(has('ai'))} ai` : '');
}

// ===== 眠る（転生） =====
function openSleep() {
  phase = 'menu';
  upArmed = false;
  openPanel = 'sleepPanel';
  for (const k in keys) keys[k] = false;
  if (window.TDG_resetStick) window.TDG_resetStick();
  if (document.pointerLockElement) document.exitPointerLock();
  renderSleep();
  $('sleepPanel').classList.add('active');
}
function renderSleep() {
  const gain = yumeGain(), y = state.yume || 0;
  $('sGain').textContent = gain >= 1 ? `+${fmt(gain)}` : '0';
  $('sMult').textContent = `ti ×${fmt(1 + y)} → ×${fmt(1 + y + gain)}`;
  $('sRun').textContent = `この周回で消した ti：${fmt(state.runTi)}（${fmt(SLEEP_MIN)} から眠れる）`;
  const b = $('btnSleep');
  b.disabled = gain < 1;
  if (b.disabled) upArmed = false;
  b.textContent = upArmed ? '本当に？' : '眠る';
  b.classList.toggle('armed', upArmed);
}
function trySleep() {
  if (openPanel !== 'sleepPanel' || yumeGain() < 1) return;
  if (!upArmed) { upArmed = true; renderSleep(); return; }
  upArmed = false;
  sleepAndWake();
}
async function sleepAndWake() {
  const my = ++wakeToken;
  const alive = () => my === wakeToken;
  const gain = yumeGain();
  for (const id of ['machine', 'machine2', 'machine3', 'sleepPanel']) $(id).classList.remove('active');
  openPanel = null;
  phase = 'wake';
  if (document.pointerLockElement) document.exitPointerLock();
  Sound.play('sleep');
  const w = $('wake');
  w.className = 'show';
  await sleep(900);
  if (!alive()) return;
  // ここで時間が消える：資源と装置は 0 に、夢・自動化機・実績・統計は残る
  Object.assign(state, { ti: 0, de: 0, ai: 0, me: 0, lv: 0, c2: false, lv2: 0, c3: false, lv3: 0, runTi: 0 });
  state.yume = (state.yume || 0) + gain;
  state.sleeps = (state.sleeps || 0) + 1;
  state.x = BED.x; state.z = BED.z - 0.75; camY = 0.85; yaw = -2.48; pitch = 1.45;
  save();
  await say('……おやすみ。', 1600);
  if (!alive()) return;
  await say(`夢を ${fmt(gain)} つ見た。`, 1800);
  if (!alive()) return;
  w.className = 'show blinking';
  await sleep(2700);
  if (!alive()) return;
  w.className = '';
  const from = { x: state.x, z: state.z };
  await tween(2000, (k) => {
    if (!alive()) return;
    const e = ease(k);
    state.x = lerp(from.x, -3.4, e);
    state.z = lerp(from.z, -4.4, e);
    camY = lerp(0.85, EYE, e);
    pitch = lerp(1.45, 0, e);
  });
  if (!alive()) return;
  phase = 'play';
  toast(`夢 +${fmt(gain)}`);
  save();
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
  $('meVal').textContent = fmt(state.me || 0);
  $('meMult').textContent = fmt(1 + (state.me || 0));
  $('hudMe').classList.toggle('show', !!state.c3 || (state.me || 0) > 0);
  $('yumeChip').style.display = (state.yume || 0) > 0 ? '' : 'none';
  $('yumeChip').textContent = `夢 ×${fmt(1 + (state.yume || 0))}`;
  const lvTxt = (lv, max) => (lv >= max ? 'MAX' : lv);
  $('lvChip').textContent = `装置1 Lv ${lvTxt(state.lv || 0, CONV_MAX)}` + (state.c2 ? `・装置2 Lv ${lvTxt(state.lv2 || 0, AI_MAX)}` : '') + (state.c3 ? `・装置3 Lv ${lvTxt(state.lv3 || 0, ME_MAX)}` : '');
  // ai は、作れるようになったら（または持っていたら）表示
  $('hudAi').classList.toggle('show', machineUnlocked() && ((state.ai || 0) > 0 || (state.lv || 0) > 0 || state.ti >= AI_COST));
  if (phase === 'menu') renderMachine();

  const prompt = $('prompt');
  const near = phase === 'play' && state.tut >= 4 ? nearMachine() : 0;
  // 装置が近くになければ「調べる」
  const exam = phase === 'play' && !near && state.tut >= 1 ? nearExam() : null;
  const show = near > 0 || !!exam;
  prompt.classList.toggle('show', show);
  const act = $('touchAct');
  act.classList.toggle('show', show);
  act.classList.toggle('exam', !near);
  $('btnMachine').style.display = show && machineUnlocked() && (near || (exam && exam.id === 'bed')) ? '' : 'none';
  $('btnMachine').textContent = near ? '装置' : '眠る';
  if (!show) return;
  $('btnAct').style.display = '';
  if (exam) {
    prompt.classList.remove('off');
    act.classList.remove('off');
    $('btnAct').textContent = '調べる';
    const sleepHint = exam.id === 'bed' && machineUnlocked() ? `　<span class="sub"><kbd>F</kbd> 眠る</span>` : '';
    $('promptText').innerHTML = IS_TOUCH ? `${exam.name}を調べる` : `${exam.name}を調べる　<span class="sub"><kbd>E</kbd></span>${sleepHint}`;
    return;
  }
  const panelHint = machineUnlocked() ? `　<span class="sub"><kbd>F</kbd> 装置を開く</span>` : '';
  // ロック中の変換装置2・3：開いて解放するだけ
  if (near >= 2 && !state[GEN[near].unlockedKey]) {
    const g = GEN[near];
    prompt.classList.add('off');
    act.classList.add('off');
    $('btnAct').style.display = 'none';
    $('promptText').innerHTML = IS_TOUCH ? `変換装置${near}（ロック中・${fmt(g.unlockCost)} ${g.unlockUnit} で解放）` : `変換装置${near}　ロック中（${fmt(g.unlockCost)} ${g.unlockUnit} で解放）${panelHint}`;
    return;
  }
  const c = near === 1 ? conv() : near === 2 ? conv2() : conv3();
  const unit = near === 1 ? 'de' : near === 2 ? 'ai' : 'me';
  $('btnAct').textContent = near === 1 ? '変換' : '作る';
  const can = state.ti >= c.cost;
  const rateTxt = `${fmt(c.cost)} ti → ${c.gain} ${unit}`;
  prompt.classList.toggle('off', !can);
  act.classList.toggle('off', !can);
  if (IS_TOUCH) {
    $('promptText').textContent = can ? `${rateTxt} にできる` : `あと ${fmt(Math.ceil(c.cost - state.ti))} ti 必要`;
    return;
  }
  $('promptText').innerHTML = (can
    ? `${rateTxt}　<span class="sub"><kbd>E</kbd> 1回　<kbd>Shift</kbd>+<kbd>E</kbd> まとめて</span>`
    : `あと ${fmt(Math.ceil(c.cost - state.ti))} ti 必要`) + panelHint;
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
  if (state.tut >= 3 && phase !== 'wake') {
    const r = rate(), gain = r * realDt;
    state.ti += gain;
    state.runTi = (state.runTi || 0) + gain;
    state.st.totalTi += gain;
    if (r > state.st.bestRate) state.st.bestRate = r;
  }
  state.st.play += realDt;
  runAutos(realDt);

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
  setMachineLocked(machines[2], !state.c2);
  setMachineLocked(machines[3], !state.c3);
  for (const m of Object.values(machines)) {
    const lv = m.id === 1 ? state.lv || 0 : m.id === 2 ? (state.c2 ? state.lv2 || 0 : 0) : (state.c3 ? state.lv3 || 0 : 0);
    const speed = m.locked ? 0.25 : 1; // ロック中はゆっくり
    m.pulse = Math.max(0, m.pulse - dt * 2);
    m.rings.forEach((r, i) => {
      r.rotation.x = t * 0.7 * speed + i * 1.2;
      r.rotation.y = t * (1.1 - i * 2.0) * speed;
      r.scale.setScalar(1 + m.pulse * 0.5);
    });
    if (!m.locked) m.ringMat.emissiveIntensity = 1.2 + m.pulse * 4;
    m.gem.rotation.y = t * 1.3 * speed;
    m.gem.position.y = 1.6 + Math.sin(t * 2 + m.id) * 0.05;
    m.orbs.forEach((o, i) => {
      o.visible = i < lv;
      const a = t * 1.6 + (i / CONV_MAX) * Math.PI * 2;
      o.position.set(Math.cos(a) * 0.32, 1.6 + Math.sin(a * 2) * 0.06, Math.sin(a) * 0.32);
    });
    // 自動化機
    if (m.auto) {
      const bought = !!state['auto' + m.id], on = bought && state['auto' + m.id + 'On'];
      m.auto.visible = bought;
      if (bought) m.autoLamp.material.emissiveIntensity = on ? (Math.sin(t * 6) > 0 ? 2.5 : 0.3) : 0;
    }
  }
  updateRoom(t);

  // 調べたときのメッセージを消す
  if (msgTimer > 0) {
    msgTimer -= dt;
    if (msgTimer <= 0) $('msg').classList.remove('show');
  }
  // 実績は1秒に1回チェック
  achTimer += realDt;
  if (achTimer > 1) { achTimer = 0; checkAch(); }
  // 音量の反映と、時計の秒の音
  Sound.update();
  if (phase !== 'off') Sound.tick(t);

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
    const d = { ...newState(), ...s };
    d.st = { ...newStats(), ...(s.st || {}) };
    d.ach = Array.isArray(s.ach) ? s.ach : [];
    d.seen = Array.isArray(s.seen) ? s.seen : [];
    return d;
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
  for (const id of ['machine', 'machine2', 'machine3', 'sleepPanel', 'achPanel', 'statsPanel']) $(id).classList.remove('active');
  $('msg').classList.remove('show');
  openPanel = null;
  save();
  Sound.suspend();
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
    Sound.ensure(); // ボタンを押した直後なので音を鳴らせる
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
