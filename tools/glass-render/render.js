// Renders the per-page glass backdrops in assets/glass/.
//
// How to run: start `node server.mjs` (saves to out/ on 127.0.0.1:4031), open
// any page in a browser with WebGL, and run this file's contents in the
// console (top-level await). Then copy out/*.jpg to assets/glass/ with
// `ffmpeg -i out/<name>.jpg -q:v 4 ../../assets/glass/<name>.jpg`.
//
// Note: three.js only refracts OPAQUE objects through transmissive ones, so
// the glow and streaks behind the glass are painted onto one opaque plane.

const THREE = await import('https://unpkg.com/three@0.170.0/build/three.module.js?module');
const { RoomEnvironment } = await import('https://unpkg.com/three@0.170.0/examples/jsm/environments/RoomEnvironment.js?module');
const { RoundedBoxGeometry } = await import('https://unpkg.com/three@0.170.0/examples/jsm/geometries/RoundedBoxGeometry.js?module');

const W = 1179, H = 2556;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.02).texture;

const glass = (o = {}) => new THREE.MeshPhysicalMaterial({
  color: 0xffffff, metalness: 0, roughness: 0, transmission: 1, thickness: 0.9, ior: 1.5,
  dispersion: 10, envMapIntensity: 1.3, clearcoat: 1, clearcoatRoughness: 0,
  iridescence: 0.35, iridescenceIOR: 1.3, ...o,
});

function backdropTex(draw) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#050506';
  x.fillRect(0, 0, W, H);
  draw(x);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glow(x, cx, cy, r, a) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(205,210,220,${a})`);
  g.addColorStop(0.45, `rgba(120,124,134,${a * 0.45})`);
  g.addColorStop(1, 'rgba(5,5,6,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
}
function streak(x, x0, y0, x1, y1, w, a) {
  x.strokeStyle = `rgba(255,255,255,${a})`;
  x.lineWidth = w;
  x.lineCap = 'round';
  x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
}

/** Scene with a full-frame opaque backdrop: soft glow at (cx, cy) plus streaks. */
function makeScene(cx, cy, extra) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050506);
  scene.environment = env;
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
  cam.position.set(0, 0, 16);
  const dist = 22, hh = 2 * Math.tan(THREE.MathUtils.degToRad(15)) * dist, ww = hh * W / H;
  const tex = backdropTex((x) => { glow(x, cx, cy, 620, 0.55); extra(x); });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(ww, hh), new THREE.MeshBasicMaterial({ map: tex }));
  bg.position.z = -6;
  scene.add(bg);
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-4, 7, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(6, -3, -4); scene.add(rim);
  const group = new THREE.Group();
  scene.add(group);
  return { scene, cam, group };
}

const builders = {
  // Today: a glass torus (the "ring" of your day).
  today() {
    const s = makeScene(960, 260, (x) => { streak(x, 830, 410, 1179, 30, 22, 0.8); streak(x, 930, 430, 1179, 200, 7, 0.45); });
    const t = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.44, 200, 360), glass({ thickness: 1.3 }));
    t.rotation.set(1.05, 0.5, -0.55);
    s.group.add(t); s.group.position.set(0.85, 2.15, 0.5);
    return s;
  },
  // Habits: two linked loops (repetition, chained days).
  habits() {
    const s = makeScene(960, 260, (x) => { streak(x, 830, 410, 1179, 30, 22, 0.8); streak(x, 930, 430, 1179, 200, 7, 0.45); });
    const a = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.27, 160, 300), glass());
    const b = new THREE.Mesh(a.geometry, glass());
    a.rotation.set(0.25, 0.95, 0.3); b.rotation.set(1.45, 0.2, 0.9); b.position.set(0.8, -0.25, 0);
    s.group.add(a, b); s.group.position.set(0.15, 2.5, 0.5); s.group.rotation.z = -0.25;
    return s;
  },
  // Progress: a triangular prism splitting light.
  progress() {
    const s = makeScene(960, 260, (x) => { streak(x, 830, 410, 1179, 30, 22, 0.8); streak(x, 930, 430, 1179, 200, 7, 0.45); });
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.4, 3, 1), glass({ thickness: 1.4, flatShading: true }));
    p.rotation.set(0.35, 0.6, -0.95);
    s.group.add(p); s.group.position.set(0.55, 2.3, 0.8);
    return s;
  },
  // Rewards: a glass coin.
  rewards() {
    const s = makeScene(960, 260, (x) => { streak(x, 830, 410, 1179, 30, 22, 0.8); streak(x, 930, 430, 1179, 200, 7, 0.45); });
    const pts = [];
    const R = 0.95, T = 0.24;
    for (let i = 0; i <= 32; i++) { const a = -Math.PI / 2 + (i / 32) * Math.PI; pts.push(new THREE.Vector2(R + Math.cos(a) * T, Math.sin(a) * T)); }
    pts.unshift(new THREE.Vector2(0, -T)); pts.push(new THREE.Vector2(0, T));
    const coin = new THREE.Mesh(new THREE.LatheGeometry(pts, 256), glass({ thickness: 0.7 }));
    coin.rotation.set(1.05, 0, 0.55);
    s.group.add(coin); s.group.position.set(0.95, 2.05, 0.8);
    return s;
  },
  // Lock in: a thick glass slab, low on the screen behind the timer.
  lockin() {
    const s = makeScene(960, 260, (x) => { streak(x, 830, 410, 1179, 30, 22, 0.8); streak(x, 930, 430, 1179, 200, 7, 0.45); });
    const slab = new THREE.Mesh(new RoundedBoxGeometry(1.8, 2.3, 0.55, 10, 0.25), glass({ thickness: 1.0 }));
    slab.rotation.set(0.25, -0.55, 0.55);
    s.group.add(slab); s.group.position.set(-0.3, -2.2, 1);
    return s;
  },
};

// Every shape sits top-right, beside the page title and clear of the cards.
const PLACE = { today: [1.3, 3.45], habits: [1.1, 3.5], progress: [1.25, 3.45], rewards: [1.35, 3.45], lockin: [1.25, 3.45] };
for (const name of Object.keys(builders)) {
  const { scene, cam, group } = builders[name]();
  group.position.x = PLACE[name][0];
  group.position.y = PLACE[name][1];
  group.scale.setScalar(0.64);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/jpeg', 0.9);
  await fetch(`http://127.0.0.1:4031/save?name=${name}.jpg`, { method: 'POST', body: url });
  console.log(`saved ${name}`);
}
