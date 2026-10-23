import * as THREE from 'three';
import { CONFIG, type EnemyKind, ENEMY_STATS } from './config';

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

export function createPlayerShip(): THREE.Group {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.userData.body = body;
  add(body, hull(8.1, 1.25, 0.9), silver, [0, 0, 0], [1, 1, 1]);
  add(body, hull(6.8, 0.82, 0.65), dark, [0, -0.3, 0.45], [1, 1, 1]);
  add(body, sphere, glass, [0, 0.66, -1.13], [0.75, 0.53, 1.55]);
  const wingGeo = wingShape(5.5, 1.7, 3.0);
  for (const side of [-1, 1]) {
    const wing = add(body, wingGeo, edge, [side * 0.78, -0.18, 0.4], [side, 1, 1]); (wing.material as THREE.Material).side = THREE.DoubleSide;
    add(body, box, silver, [side * 3.3, -0.07, 0.5], [2.9, 0.08, 0.12], [0, 0, side * 0.06]);
    add(body, box, glow(0x3ddcff), [side * 3.64, 0.02, -0.73], [1.6, 0.035, 0.08]);
    add(body, cylinder, dark, [side * 4.25, -0.14, -1.32], [0.18, 1.45, 0.18], [Math.PI / 2, 0, 0]);
    add(body, cylinder, glow(0xa8efff), [side * 4.25, -0.14, -2.1], [0.07, 0.06, 0.07], [Math.PI / 2, 0, 0]);
    add(body, box, silver, [side * 0.92, 0.32, 2.33], [0.23, 1.05, 1.4], [0, 0, side * 0.12]);
    add(body, cylinder, dark, [side * 0.74, -0.17, 2.92], [0.48, 0.55, 0.48], [Math.PI / 2, 0, 0]);
    add(body, cylinder, glow(0x45cfff), [side * 0.74, -0.17, 3.25], [0.29, 0.05, 0.29], [Math.PI / 2, 0, 0]);
  }
  add(body, box, glow(0x42cfff), [0, 0.05, -3.5], [0.13, 0.08, 1.1]);
  return root;
}

export function createEnemyShip(kind: EnemyKind): THREE.Group {
  const root = new THREE.Group(); const color = ENEMY_STATS[kind].color; const primary = metal(kind === 'interceptor' ? 0x5c2739 : kind === 'fighter' ? 0x624536 : 0x564166, color); const secondary = metal(kind === 'bomber' ? 0x9b8bad : 0xa98b85);
  const size = kind === 'interceptor' ? 0.76 : kind === 'bomber' ? 1.35 : 1;
  add(root, hull(kind === 'bomber' ? 6 : 5.5, kind === 'bomber' ? 1.75 : 0.9, 0.75), primary, [0, 0, 0], [size, size, size]);
  add(root, sphere, glass, [0, 0.45 * size, -0.58 * size], [0.55 * size, 0.35 * size, 0.9 * size]);
  for (const side of [-1, 1]) {
    if (kind === 'interceptor') {
      add(root, box, secondary, [side * 1.45, 0.05, 0.2], [2.7, 0.11, 1.3], [0, side * 0.4, side * 0.1]);
      add(root, box, primary, [side * 2.5, 0.14, -0.2], [0.13, 0.65, 1.1], [0, 0, side * 0.16]);
    } else if (kind === 'fighter') {
      add(root, wingShape(3.1, 0.7, 2.3), primary, [side * 0.75, -0.08, 0.2], [side, 1, 1]);
      add(root, box, secondary, [side * 2.6, 0.35, 1], [0.16, 0.95, 1.25]);
    } else {
      add(root, box, secondary, [side * 2.25, 0, 0.25], [2.8, 0.4, 2.45]);
      add(root, box, primary, [side * 3.65, 0.5, 0.6], [0.38, 1.2, 2.3]);
      add(root, box, dark, [side * 2.35, -0.45, -0.4], [1.1, 0.55, 1.7]);
    }
    add(root, cylinder, dark, [side * (kind === 'bomber' ? 2.5 : 1), -0.08, 2.2], [0.38, 0.5, 0.38], [Math.PI / 2, 0, 0]);
    add(root, cylinder, glow(color), [side * (kind === 'bomber' ? 2.5 : 1), -0.08, 2.47], [0.25, 0.06, 0.25], [Math.PI / 2, 0, 0]);
  }
  return root;
}

export interface Asteroid { mesh: THREE.Mesh; radius: number; health: number; spin: THREE.Vector3; }

export class World {
  stars: THREE.Points; nebulas: THREE.Sprite[] = []; asteroids: Asteroid[] = [];
  private starPositions: Float32Array;
  private rockMaterial = metal(0x65748a);
  constructor(private scene: THREE.Scene, private rng: RNG) {
    const positions = new Float32Array(CONFIG.world.stars * 3), colors = new Float32Array(CONFIG.world.stars * 3);
    for (let i = 0; i < CONFIG.world.stars; i++) {
      const dir = rng.direction().multiplyScalar(rng.range(75, CONFIG.world.starRadius)); positions.set([dir.x, dir.y, dir.z], i * 3);
      const tint = rng.next(); colors.set(tint < 0.65 ? [0.65, 0.8, 1] : tint < 0.82 ? [1, 0.82, 0.64] : [0.58, 0.83, 1], i * 3);
    }
    this.starPositions = positions;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.24, vertexColors: true, transparent: true, opacity: 0.87, sizeAttenuation: true, depthWrite: false })); scene.add(this.stars);
    for (let i = 0; i < 7; i++) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; const ctx = canvas.getContext('2d')!;
      const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64); const color = rng.pick(['82,81,169', '36,120,165', '133,60,137']); grad.addColorStop(0, `rgba(${color},0.15)`); grad.addColorStop(0.38, `rgba(${color},0.07)`); grad.addColorStop(1, `rgba(${color},0)`); ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sprite.position.copy(rng.direction().multiplyScalar(rng.range(230, 360))); sprite.scale.setScalar(rng.range(150, 250)); scene.add(sprite); this.nebulas.push(sprite);
    }
    for (let i = 0; i < CONFIG.world.asteroids; i++) this.spawnAsteroid(new THREE.Vector3());
  }
  spawnAsteroid(center: THREE.Vector3): Asteroid {
    const radius = this.rng.range(2.2, 7.5), geo = new THREE.IcosahedronGeometry(radius, 1); const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const scale = this.rng.range(0.75, 1.15); p.setXYZ(i, p.getX(i) * scale, p.getY(i) * scale, p.getZ(i) * scale); } geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.rockMaterial); mesh.position.copy(center).add(this.rng.direction().multiplyScalar(this.rng.range(70, CONFIG.world.asteroidRadius))); this.scene.add(mesh);
    const asteroid = { mesh, radius, health: radius * 5, spin: new THREE.Vector3(this.rng.range(-0.2, 0.2), this.rng.range(-0.2, 0.2), this.rng.range(-0.2, 0.2)) }; this.asteroids.push(asteroid); return asteroid;
  }
  update(dt: number, player: THREE.Vector3): void {
    const starAttr = this.stars.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < CONFIG.world.stars; i++) {
      const k = i * 3, dx = this.starPositions[k] - player.x, dy = this.starPositions[k + 1] - player.y, dz = this.starPositions[k + 2] - player.z;
      if (dx * dx + dy * dy + dz * dz > CONFIG.world.starRadius ** 2) { const v = this.rng.direction().multiplyScalar(this.rng.range(240, CONFIG.world.starRadius)).add(player); this.starPositions.set([v.x, v.y, v.z], k); }
    }
    starAttr.needsUpdate = true;
    for (const nebula of this.nebulas) if (nebula.position.distanceToSquared(player) > 500 ** 2) nebula.position.copy(this.rng.direction().multiplyScalar(330).add(player));
    for (const a of this.asteroids) { a.mesh.rotation.x += a.spin.x * dt; a.mesh.rotation.y += a.spin.y * dt; a.mesh.rotation.z += a.spin.z * dt; if (a.mesh.position.distanceToSquared(player) > 360 ** 2) { a.mesh.position.copy(this.rng.direction().multiplyScalar(this.rng.range(100, CONFIG.world.asteroidRadius)).add(player)); a.health = a.radius * 5; } }
  }
  shift(offset: THREE.Vector3): void {
    for (let i = 0; i < this.starPositions.length; i += 3) { this.starPositions[i] -= offset.x; this.starPositions[i + 1] -= offset.y; this.starPositions[i + 2] -= offset.z; }
    (this.stars.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    for (const n of this.nebulas) n.position.sub(offset); for (const a of this.asteroids) a.mesh.position.sub(offset);
  }
  destroyAsteroid(a: Asteroid, center: THREE.Vector3): void { a.mesh.position.copy(this.rng.direction().multiplyScalar(this.rng.range(100, CONFIG.world.asteroidRadius)).add(center)); a.health = a.radius * 5; }
}
