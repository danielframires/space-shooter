import * as THREE from 'three';
import { CONFIG, type EnemyKind, ENEMY_STATS } from './config';
import { ECONOMY, type ShipKind, type SkinKind } from './economy';
import { SpatialFrame, type Position3 } from './spatial';
import { ASTEROID_CELL_SIZE, NEBULA_CELL_SIZE, SpatialField, cellAt, cellKey, type SpatialSite } from './regions';

export class RNG {
  constructor(public state: number) { this.state = state >>> 0 || 1; }
  next(): number { let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state = x >>> 0; return this.state / 4294967296; }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  pick<T>(values: T[]): T { return values[Math.floor(this.next() * values.length)]; }
  direction(): THREE.Vector3 { const z = this.range(-1, 1), a = this.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z); return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z); }
}

const metal = (color: number, emissive = 0) => new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.32, emissive, emissiveIntensity: 0.48, flatShading: true });
const glow = (color: number) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
const dark = metal(0x101d31), silver = metal(0x859bb4), edge = metal(0x26415f), glass = new THREE.MeshPhysicalMaterial({ color: 0x5fd3ff, metalness: 0.25, roughness: 0.12, transparent: true, opacity: 0.78, emissive: 0x064f80, emissiveIntensity: 0.4 });
const box = new THREE.BoxGeometry(1, 1, 1), sphere = new THREE.SphereGeometry(1, 12, 8), cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
for (const resource of [dark, silver, edge, glass, box, sphere, cylinder]) resource.userData.isShared = true;

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale: [number, number, number], rot?: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...pos); mesh.scale.set(...scale); if (rot) mesh.rotation.set(...rot); parent.add(mesh); return mesh;
}

function hull(length: number, width: number, height: number): THREE.BufferGeometry {
  const rings = [
    { z: -length * 0.62, w: 0.04, h: 0.04 }, { z: -length * 0.27, w: width * 0.63, h: height * 0.6 },
    { z: length * 0.22, w: width, h: height }, { z: length * 0.5, w: width * 0.68, h: height * 0.75 },
  ];
  const pts: number[] = [], idx: number[] = [];
  for (const ring of rings) for (const [x, y] of [[0, ring.h], [ring.w, 0], [0, -ring.h], [-ring.w, 0]]) pts.push(x, y, ring.z);
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < 4; k++) { const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = (i + 1) * 4 + k, d = (i + 1) * 4 + (k + 1) % 4; idx.push(a, b, c, b, d, c); }
  idx.push(12, 13, 14, 12, 14, 15);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function wingShape(span: number, sweep: number, chord: number): THREE.BufferGeometry {
  const s = new THREE.Shape(); s.moveTo(0, -chord * 0.5); s.lineTo(span * 0.88, -chord * 0.5 - sweep); s.lineTo(span, -chord * 0.24 - sweep); s.lineTo(span * 0.75, chord * 0.5 - sweep); s.lineTo(0, chord * 0.5); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(Math.PI / 2); return g;
}

export function createPlayerShip(ship: ShipKind = 'Caos', skin: SkinKind = 'Tech'): THREE.Group {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.userData.body = body;
  const palette = ECONOMY.skins[skin];
  const finish = (color: number): THREE.MeshStandardMaterial => {
    const material = metal(color, palette.emissive ? color : 0);
    if (palette.emissive) material.emissiveIntensity = 1.05;
    return material;
  };
  const primary = finish(palette.primary), wingMat = finish(palette.wing), trim = finish(palette.trim), light = glow(palette.light);
  if (palette.emissive) root.add(new THREE.PointLight(palette.light, 1.5, 12, 2));
  wingMat.side = THREE.DoubleSide;
  const isVespa = ship === 'Vespa', isFlecha = ship === 'Flecha', isTank = ship === 'Tanque', isDominadora = ship === 'Dominadora', isSuprema = ship === 'Suprema' || ship === 'Rinoceronte' || ship === 'Leopardo' || ship === 'Harpia';
  const hullLength = isFlecha ? 10 : isVespa ? 6.7 : isTank ? 8.9 : isDominadora ? 8.5 : isSuprema ? 9.6 : 8.1;
  const span = isFlecha ? 6.1 : isVespa ? 4.2 : isTank ? 6.2 : isDominadora ? 5.7 : isSuprema ? 6.7 : 5.5;
  const muzzleX = isFlecha ? 4.55 : isVespa ? 3.3 : isTank ? 4.7 : isDominadora ? 4.35 : isSuprema ? 5 : 4.25;
  root.userData.muzzleX = muzzleX; root.userData.muzzleZ = isFlecha ? -2.8 : isVespa ? -1.7 : isSuprema ? -2.9 : isDominadora ? -2.4 : -2.1;
  add(body, hull(hullLength, isTank ? 1.85 : isVespa ? 1.05 : isSuprema ? 1.4 : 1.25, isTank ? 1.22 : isFlecha ? 0.7 : 0.9), primary, [0, 0, 0], [1, 1, 1]);
  add(body, hull(6.8, 0.82, 0.65), dark, [0, -0.3, 0.45], [1, 1, 1]);
  add(body, sphere, glass, [0, 0.66, -1.13], [0.75, 0.53, 1.55]);
  const wingGeo = wingShape(span, isFlecha ? 2.5 : isVespa ? 0.9 : isTank ? 0.65 : isSuprema ? 2.2 : 1.7, isFlecha ? 2.4 : isVespa ? 2.6 : isTank ? 3.8 : 3.0);
  for (const side of [-1, 1]) {
    add(body, wingGeo, wingMat, [side * 0.78, -0.18, 0.4], [side, 1, 1]);
    add(body, box, primary, [side * (muzzleX - 0.9), -0.07, 0.5], [isVespa ? 2.2 : 2.9, 0.08, 0.12], [0, 0, side * 0.06]);
    add(body, box, light, [side * (muzzleX - 0.61), 0.02, -0.73], [isVespa ? 1.1 : 1.6, 0.035, 0.08]);
    add(body, cylinder, dark, [side * muzzleX, -0.14, root.userData.muzzleZ + 0.78], [0.18, 1.45, 0.18], [Math.PI / 2, 0, 0]);
    add(body, cylinder, light, [side * muzzleX, -0.14, root.userData.muzzleZ], [0.07, 0.06, 0.07], [Math.PI / 2, 0, 0]);
    add(body, box, trim, [side * 0.92, 0.32, 2.33], [0.23, 1.05, 1.4], [0, 0, side * 0.12]);
    add(body, cylinder, dark, [side * 0.74, -0.17, 2.92], [0.48, 0.55, 0.48], [Math.PI / 2, 0, 0]);
    add(body, cylinder, light, [side * 0.74, -0.17, 3.25], [0.29, 0.05, 0.29], [Math.PI / 2, 0, 0]);
  }
  if (isVespa) for (const side of [-1, 1]) add(body, box, wingMat, [side * 1.9, 0.55, 2.1], [0.12, 0.85, 1.5], [0, 0, side * 0.2]);
  if (isFlecha) add(body, hull(5.4, 0.28, 0.22), trim, [0, 0.2, -2.1], [1, 1, 1]);
  if (isTank) for (const side of [-1, 1]) {
    add(body, box, trim, [side * 1.55, 0.65, 0.6], [1.05, 0.65, 5.1]);
    add(body, box, wingMat, [side * 4.3, 0.17, 0.75], [0.55, 0.6, 2.7]);
    add(body, box, light, [side * 1.6, 1.02, -0.8], [0.35, 0.08, 1.8]);
  }
  if (isDominadora) for (const side of [-1, 1]) {
    add(body, hull(4.9, 0.36, 0.35), trim, [side * 2.8, 0.45, -1.4], [1, 1, 1], [0, side * 0.15, 0]);
    add(body, box, wingMat, [side * 2.2, 0.9, 1.8], [0.18, 1.5, 1.7], [0, 0, side * 0.28]);
  }
  if (isSuprema) {
    add(body, hull(6.6, 0.35, 0.28), trim, [0, 0.32, -2.3], [1, 1, 1]);
    for (const side of [-1, 1]) {
      add(body, box, trim, [side * 2.55, 0.55, 1.6], [0.16, 1.15, 2.2], [0, 0, side * 0.24]);
      add(body, box, light, [side * 2.7, 0.18, -1.7], [1.8, 0.045, 0.08], [0, side * 0.15, 0]);
    }
  }
  if (ship === 'Rinoceronte') {
    add(body, hull(5.9, 0.9, 0.6), trim, [0, 0.18, -3], [1, 1, 1]);
    for (const side of [-1, 1]) add(body, box, wingMat, [side * 1.65, 0.53, -0.4], [0.78, 0.47, 5.7]);
  }
  if (ship === 'Leopardo') {
    add(body, hull(5.3, 0.24, 0.2), trim, [0, 0.33, -3.2], [1, 1, 1]);
    for (const side of [-1, 1]) add(body, box, light, [side * 3.7, 0.3, 1.5], [0.12, 0.8, 2.1], [0, 0, side * 0.28]);
  }
  if (ship === 'Harpia') {
    const innerX = 2.35, innerZ = -3.05;
    for (const side of [-1, 1]) {
      add(body, cylinder, dark, [side * innerX, -0.14, innerZ + 0.74], [0.16, 1.4, 0.16], [Math.PI / 2, 0, 0]);
      add(body, cylinder, light, [side * innerX, -0.14, innerZ], [0.07, 0.06, 0.07], [Math.PI / 2, 0, 0]);
    }
    root.userData.muzzles = [-muzzleX, -innerX, innerX, muzzleX].map((x, index) => new THREE.Vector3(x, -0.14, index === 0 || index === 3 ? root.userData.muzzleZ : innerZ));
  }
  add(body, box, light, [0, 0.05, isFlecha ? -4.5 : -3.5], [0.13, 0.08, 1.1]);
  return root;
}

export function createEnemyShip(kind: EnemyKind): THREE.Group {
  const root = new THREE.Group(); const color = ENEMY_STATS[kind].color;
  const primary = metal(kind === 'interceptor' ? 0x5c2739 : kind === 'fighter' ? 0x624536 : kind === 'bomber' ? 0x564166 : kind === 'miner' ? 0x235b4b : kind === 'hammer' ? 0x703d32 : 0x284d73, color);
  const secondary = metal(kind === 'bomber' ? 0x9b8bad : kind === 'miner' ? 0x7dbda5 : kind === 'hammer' ? 0xb59480 : kind === 'pursuer' ? 0x86b9d6 : 0xa98b85);
  const size = kind === 'interceptor' ? 0.76 : kind === 'bomber' ? 1.35 : kind === 'hammer' ? 1.55 : kind === 'pursuer' ? 0.88 : 1;
  add(root, hull(kind === 'bomber' || kind === 'hammer' ? 6 : 5.5, kind === 'bomber' || kind === 'hammer' ? 1.75 : 0.9, kind === 'hammer' ? 1.2 : 0.75), primary, [0, 0, 0], [size, size, size]);
  add(root, sphere, glass, [0, 0.45 * size, -0.58 * size], [0.55 * size, 0.35 * size, 0.9 * size]);
  for (const side of [-1, 1]) {
    if (kind === 'interceptor') {
      add(root, box, secondary, [side * 1.45, 0.05, 0.2], [2.7, 0.11, 1.3], [0, side * 0.4, side * 0.1]);
      add(root, box, primary, [side * 2.5, 0.14, -0.2], [0.13, 0.65, 1.1], [0, 0, side * 0.16]);
    } else if (kind === 'fighter') {
      add(root, wingShape(3.1, 0.7, 2.3), primary, [side * 0.75, -0.08, 0.2], [side, 1, 1]);
      add(root, box, secondary, [side * 2.6, 0.35, 1], [0.16, 0.95, 1.25]);
    } else if (kind === 'bomber') {
      add(root, box, secondary, [side * 2.25, 0, 0.25], [2.8, 0.4, 2.45]);
      add(root, box, primary, [side * 3.65, 0.5, 0.6], [0.38, 1.2, 2.3]);
      add(root, box, dark, [side * 2.35, -0.45, -0.4], [1.1, 0.55, 1.7]);
    } else if (kind === 'miner') {
      add(root, box, secondary, [side * 2.25, -0.15, 1], [2.7, 0.16, 1.1], [0, side * 0.32, 0]);
      add(root, box, primary, [side * 1.8, 0.5, 1.85], [0.2, 1.15, 1.6], [0, 0, side * 0.2]);
      add(root, sphere, glow(color), [side * 1.7, -0.35, 2.25], [0.31, 0.31, 0.31]);
    } else if (kind === 'hammer') {
      add(root, box, secondary, [side * 2.65, 0.02, -0.9], [3.5, 0.95, 2.5]);
      add(root, box, primary, [side * 4.25, 0.35, -1.6], [0.65, 1.9, 2.1]);
      add(root, box, glow(color), [side * 2.7, 0.56, -2.25], [2.7, 0.09, 0.13]);
    } else {
      add(root, wingShape(4.3, 2.2, 1.9), primary, [side * 0.65, -0.08, 0.3], [side, 1, 1]);
      add(root, box, secondary, [side * 3.1, 0.36, 1.15], [0.12, 0.95, 1.65], [0, 0, side * 0.28]);
      add(root, box, glow(color), [side * 2.6, -0.03, -0.85], [1.05, 0.04, 0.08]);
    }
    const engineX = kind === 'bomber' || kind === 'hammer' ? 2.5 : 1;
    add(root, cylinder, dark, [side * engineX, -0.08, 2.2], [0.38, 0.5, 0.38], [Math.PI / 2, 0, 0]);
    add(root, cylinder, glow(color), [side * engineX, -0.08, 2.47], [0.25, 0.06, 0.25], [Math.PI / 2, 0, 0]);
  }
  return root;
}

export interface Asteroid {
  mesh: THREE.Mesh;
  radius: number;
  baseRadius: number;
  health: number;
  spin: THREE.Vector3;
  velocity: THREE.Vector3;
  longAxis: 0 | 1 | 2 | null;
  ephemeral: boolean;
  site?: { id: string; position: Position3; axis: THREE.Vector3; amplitude: number; rate: number; phase: number };
}

function galaxyTexture(rng: RNG, inner: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.save(); ctx.translate(128, 128); ctx.scale(1, 0.68);
  const haze = ctx.createRadialGradient(0, 0, 0, 0, 0, 122);
  haze.addColorStop(0, `${inner}55`); haze.addColorStop(0.28, `${outer}27`); haze.addColorStop(0.72, `${outer}0e`); haze.addColorStop(1, `${outer}00`);
  ctx.fillStyle = haze; ctx.beginPath(); ctx.arc(0, 0, 122, 0, Math.PI * 2); ctx.fill();
  for (let arm = 0; arm < 3; arm++) for (let i = 0; i < 65; i++) {
    const radius = rng.range(8, 107), angle = arm * Math.PI * 2 / 3 + radius * 0.034 + rng.range(-0.4, 0.4);
    const x = Math.cos(angle) * radius + rng.range(-8, 8), y = Math.sin(angle) * radius + rng.range(-8, 8);
    const blur = rng.range(9, 22), cloud = ctx.createRadialGradient(x, y, 0, x, y, blur);
    cloud.addColorStop(0, `${arm === 1 ? inner : outer}24`); cloud.addColorStop(1, `${outer}00`);
    ctx.fillStyle = cloud; ctx.beginPath(); ctx.arc(x, y, blur, 0, Math.PI * 2); ctx.fill();
  }
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 38);
  core.addColorStop(0, 'rgba(235,244,255,.46)'); core.addColorStop(0.28, `${inner}57`); core.addColorStop(1, `${inner}00`);
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export class World {
  stars: THREE.Points; nebulas: THREE.Sprite[] = []; asteroids: Asteroid[] = [];
  galaxies: { sprite: THREE.Sprite; direction: THREE.Vector3; distance: number }[] = [];
  private starPositions: Float32Array;
  private rockMaterial = metal(0x65748a);
  private lastPlayer = new THREE.Vector3(); private travel = new THREE.Vector3(); private displacement = new THREE.Vector3(); private parallax = new THREE.Vector3();
  private elapsed = 0;
  private asteroidCell = '';
  private nebulaCell = '';
  private lastAsteroidSync?: Position3;
  private lastNebulaSync?: Position3;
  private activeAsteroids = new Map<string, Asteroid>();
  private activeNebulas = new Map<string, THREE.Sprite>();
  private destroyedAsteroids = new Set<string>();
  private nebulaTextures: THREE.CanvasTexture[] = [];
  constructor(private scene: THREE.Scene, private rng: RNG, private frame: SpatialFrame, private field: SpatialField) {
    const positions = new Float32Array(CONFIG.world.stars * 3), colors = new Float32Array(CONFIG.world.stars * 3);
    for (let i = 0; i < CONFIG.world.stars; i++) {
      const dir = rng.direction().multiplyScalar(rng.range(75, CONFIG.world.starRadius)); positions.set([dir.x, dir.y, dir.z], i * 3);
      const tint = rng.next(); colors.set(tint < 0.65 ? [0.65, 0.8, 1] : tint < 0.82 ? [1, 0.82, 0.64] : [0.58, 0.83, 1], i * 3);
    }
    this.starPositions = positions;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.24, vertexColors: true, transparent: true, opacity: 0.87, sizeAttenuation: true, depthWrite: false })); scene.add(this.stars);
    for (const color of ['82,81,169', '36,120,165', '133,60,137']) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; const ctx = canvas.getContext('2d')!;
      const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64); grad.addColorStop(0, `rgba(${color},0.15)`); grad.addColorStop(0.38, `rgba(${color},0.07)`); grad.addColorStop(1, `rgba(${color},0)`); ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
      this.nebulaTextures.push(new THREE.CanvasTexture(canvas));
    }
    const palettes = [
      ['#a2d8ff', '#5977d9'], ['#dcc5f8', '#835da8'], ['#f2ceb4', '#a86679'], ['#a9e7df', '#4c8caa'],
    ] as const;
    const textures = palettes.map(([inner, outer]) => galaxyTexture(this.rng, inner, outer));
    const galaxyCount = 36;
    for (let i = 0; i < galaxyCount; i++) {
      const y = 1 - 2 * (i + 0.5) / galaxyCount, azimuth = i * 2.399963229728653 + 0.38;
      const radius = Math.sqrt(1 - y * y), direction = new THREE.Vector3(radius * Math.cos(azimuth), y, radius * Math.sin(azimuth));
      const distance = this.rng.range(940, 1070), size = this.rng.range(65, 115);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures[i % textures.length], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: this.rng.range(0.25, 0.42), rotation: this.rng.range(-1.3, 1.3) }));
      sprite.scale.set(size, size, 1); sprite.position.copy(direction).multiplyScalar(distance);
      scene.add(sprite); this.galaxies.push({ sprite, direction, distance });
    }
    this.syncSpatial(new THREE.Vector3());
  }
  private spawnAsteroid(site: SpatialSite): Asteroid {
    const localRng = new RNG(site.seed), axis = localRng.direction();
    const amplitude = localRng.range(7, 18), rate = localRng.range(0.08, 0.14), phase = localRng.range(0, Math.PI * 2);
    const start = this.frame.toLocal(site.position);
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), this.rockMaterial);
    const asteroid: Asteroid = { mesh, radius: 1, baseRadius: 1, health: 1, spin: new THREE.Vector3(), velocity: new THREE.Vector3(), longAxis: null, ephemeral: false,
      site: { id: site.id, position: site.position, axis, amplitude, rate, phase } };
    const longAxis = localRng.next() < 0.18 ? Math.floor(localRng.next() * 3) as 0 | 1 | 2 : null;
    this.configureAsteroid(asteroid, new THREE.Vector3(start.x, start.y, start.z), localRng.range(2.2, 7.5), longAxis, new THREE.Vector3(), localRng);
    this.scene.add(mesh); this.asteroids.push(asteroid); this.activeAsteroids.set(site.id, asteroid); return asteroid;
  }
  private spawnNebula(site: SpatialSite): void {
    const localRng = new RNG(site.seed), local = this.frame.toLocal(site.position);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.nebulaTextures[Math.floor(localRng.next() * this.nebulaTextures.length)], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const size = localRng.range(150, 250);
    sprite.position.set(local.x, local.y, local.z);
    sprite.scale.set(size * localRng.range(0.65, 1.25), size * localRng.range(0.65, 1.25), 1);
    this.scene.add(sprite); this.nebulas.push(sprite); this.activeNebulas.set(site.id, sprite);
  }
  private configureAsteroid(a: Asteroid, position: THREE.Vector3, radius: number, longAxis: 0 | 1 | 2 | null, velocity: THREE.Vector3, rng = this.rng): void {
    const geometry = new THREE.IcosahedronGeometry(radius, 1), points = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < points.count; i++) { const roughness = rng.range(0.75, 1.15); points.setXYZ(i, points.getX(i) * roughness, points.getY(i) * roughness, points.getZ(i) * roughness); }
    geometry.computeVertexNormals();
    a.mesh.geometry.dispose(); a.mesh.geometry = geometry;
    a.mesh.position.copy(position); a.mesh.scale.set(1, 1, 1);
    if (longAxis !== null) a.mesh.scale.setComponent(longAxis, 2);
    a.mesh.rotation.set(rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2));
    a.baseRadius = radius; a.radius = radius * (longAxis === null ? 1 : 1.8); a.health = radius * 5 * (longAxis === null ? 1 : 1.8);
    a.longAxis = longAxis; a.velocity.copy(velocity);
    a.spin.set(rng.range(-0.23, 0.23), rng.range(-0.23, 0.23), rng.range(-0.23, 0.23));
  }
  private removeAsteroid(a: Asteroid): void {
    const index = this.asteroids.indexOf(a); if (index < 0) return;
    if (a.site) this.activeAsteroids.delete(a.site.id);
    this.asteroids.splice(index, 1); this.scene.remove(a.mesh); a.mesh.geometry.dispose();
  }
  private removeNebula(id: string, sprite: THREE.Sprite): void {
    this.activeNebulas.delete(id);
    const index = this.nebulas.indexOf(sprite); if (index >= 0) this.nebulas.splice(index, 1);
    this.scene.remove(sprite); (sprite.material as THREE.Material).dispose();
  }
  private syncSpatial(player: THREE.Vector3): void {
    const global = this.frame.toGlobal(player);
    const asteroidCenter = cellAt(global, ASTEROID_CELL_SIZE), asteroidCell = cellKey(asteroidCenter);
    if (asteroidCell !== this.asteroidCell || !this.lastAsteroidSync || Math.hypot(global.x - this.lastAsteroidSync.x, global.y - this.lastAsteroidSync.y, global.z - this.lastAsteroidSync.z) > 50) {
      const visible = new Set<string>();
      for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) {
        const site = this.field.asteroidSite({ x: asteroidCenter.x + x, y: asteroidCenter.y + y, z: asteroidCenter.z + z });
        if (!site || Math.hypot(site.position.x - global.x, site.position.y - global.y, site.position.z - global.z) > CONFIG.world.asteroidStreamRadius) continue;
        visible.add(site.id);
        if (!this.activeAsteroids.has(site.id) && !this.destroyedAsteroids.has(site.id)) this.spawnAsteroid(site);
      }
      for (const [id, asteroid] of this.activeAsteroids) if (!visible.has(id)) this.removeAsteroid(asteroid);
      this.asteroidCell = asteroidCell;
      this.lastAsteroidSync = { ...global };
    }
    const nebulaCenter = cellAt(global, NEBULA_CELL_SIZE), nebulaCell = cellKey(nebulaCenter);
    if (nebulaCell !== this.nebulaCell || !this.lastNebulaSync || Math.hypot(global.x - this.lastNebulaSync.x, global.y - this.lastNebulaSync.y, global.z - this.lastNebulaSync.z) > 100) {
      const visible = new Set<string>();
      for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) {
        const site = this.field.nebulaSite({ x: nebulaCenter.x + x, y: nebulaCenter.y + y, z: nebulaCenter.z + z });
        if (!site || Math.hypot(site.position.x - global.x, site.position.y - global.y, site.position.z - global.z) > CONFIG.world.nebulaStreamRadius) continue;
        visible.add(site.id);
        if (!this.activeNebulas.has(site.id)) this.spawnNebula(site);
      }
      for (const [id, sprite] of this.activeNebulas) if (!visible.has(id)) this.removeNebula(id, sprite);
      this.nebulaCell = nebulaCell;
      this.lastNebulaSync = { ...global };
    }
  }
  reset(): void {
    for (let i = this.asteroids.length - 1; i >= 0; i--) this.removeAsteroid(this.asteroids[i]);
    for (const [id, sprite] of this.activeNebulas) this.removeNebula(id, sprite);
    this.destroyedAsteroids.clear(); this.asteroidCell = this.nebulaCell = ''; this.lastAsteroidSync = this.lastNebulaSync = undefined;
    this.elapsed = 0; this.lastPlayer.set(0, 0, 0); this.travel.set(0, 0, 0); this.parallax.set(0, 0, 0);
    this.syncSpatial(new THREE.Vector3());
  }
  update(dt: number, player: THREE.Vector3): void {
    this.elapsed += dt;
    this.syncSpatial(player);
    this.travel.add(this.displacement.subVectors(player, this.lastPlayer)); this.lastPlayer.copy(player);
    this.parallax.set(Math.sin(this.travel.x * 0.00045) * 9, Math.sin(this.travel.y * 0.00045) * 7, Math.sin(this.travel.z * 0.00045) * 9);
    for (const galaxy of this.galaxies) galaxy.sprite.position.copy(player).addScaledVector(galaxy.direction, galaxy.distance).add(this.parallax);
    const starAttr = this.stars.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < CONFIG.world.stars; i++) {
      const k = i * 3, dx = this.starPositions[k] - player.x, dy = this.starPositions[k + 1] - player.y, dz = this.starPositions[k + 2] - player.z;
      if (dx * dx + dy * dy + dz * dz > CONFIG.world.starRadius ** 2) { const v = this.rng.direction().multiplyScalar(this.rng.range(240, CONFIG.world.starRadius)).add(player); this.starPositions.set([v.x, v.y, v.z], k); }
    }
    starAttr.needsUpdate = true;
    const origin = this.frame.getOrigin();
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      if (a.site) {
        const wave = a.site.phase + this.elapsed * a.site.rate;
        const offset = a.site.amplitude * Math.sin(wave);
        a.mesh.position.set(a.site.position.x + a.site.axis.x * offset - origin.x, a.site.position.y + a.site.axis.y * offset - origin.y, a.site.position.z + a.site.axis.z * offset - origin.z);
        a.velocity.copy(a.site.axis).multiplyScalar(a.site.amplitude * a.site.rate * Math.cos(wave));
      } else a.mesh.position.addScaledVector(a.velocity, dt);
      a.mesh.rotation.x += a.spin.x * dt; a.mesh.rotation.y += a.spin.y * dt; a.mesh.rotation.z += a.spin.z * dt;
      if (a.ephemeral && a.mesh.position.distanceToSquared(player) > CONFIG.world.asteroidStreamRadius ** 2) this.removeAsteroid(a);
    }
  }
  shift(offset: THREE.Vector3): void {
    for (let i = 0; i < this.starPositions.length; i += 3) { this.starPositions[i] -= offset.x; this.starPositions[i + 1] -= offset.y; this.starPositions[i + 2] -= offset.z; }
    (this.stars.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    for (const n of this.nebulas) n.position.sub(offset); for (const a of this.asteroids) a.mesh.position.sub(offset);
    for (const galaxy of this.galaxies) galaxy.sprite.position.sub(offset); this.lastPlayer.sub(offset);
  }
  destroyAsteroid(a: Asteroid, center: THREE.Vector3): void {
    if (!this.asteroids.includes(a)) return;
    if (a.site) { this.destroyedAsteroids.add(a.site.id); this.activeAsteroids.delete(a.site.id); a.site = undefined; }
    if (a.longAxis !== null) {
      const axis = new THREE.Vector3().setComponent(a.longAxis, 1).applyQuaternion(a.mesh.quaternion).normalize();
      const origin = a.mesh.position.clone(), radius = Math.max(2.2, a.baseRadius * 0.72), offset = radius * 1.25;
      const drift = a.velocity.clone(), ejection = axis.clone().multiplyScalar(this.rng.range(3.2, 4.8));
      this.configureAsteroid(a, origin.clone().addScaledVector(axis, -offset), radius, null, drift.clone().sub(ejection));
      a.ephemeral = true;
      if (this.asteroids.length >= CONFIG.world.maxSplitAsteroids) {
        const removable = this.asteroids.filter(rock => rock !== a && rock.ephemeral).sort((left, right) => right.mesh.position.distanceToSquared(center) - left.mesh.position.distanceToSquared(center))[0];
        if (removable) this.removeAsteroid(removable);
      }
      const child = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), this.rockMaterial);
      const second: Asteroid = { mesh: child, radius: 1, baseRadius: 1, health: 1, spin: new THREE.Vector3(), velocity: new THREE.Vector3(), longAxis: null, ephemeral: true };
      this.configureAsteroid(second, origin.addScaledVector(axis, offset), radius, null, drift.add(ejection));
      this.scene.add(child); this.asteroids.push(second);
    } else this.removeAsteroid(a);
  }
}
