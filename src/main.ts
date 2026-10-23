import * as THREE from 'three';
import { CONFIG, ENEMY_STATS, enemyDamage, enemyHealth, laserColor, laserDamage, phaseForKills, type EnemyKind, type PowerKind } from './config';
import { AudioManager } from './audio';
import { createEnemyShip, createPlayerShip, RNG, World, type Asteroid } from './procedural';
import './style.css';

type Mode = 'menu' | 'playing' | 'paused' | 'over';
type AIState = 'patrol' | 'detect' | 'pursue' | 'combat' | 'evade' | 'reposition';
interface Enemy { mesh: THREE.Group; kind: EnemyKind; health: number; velocity: THREE.Vector3; state: AIState; stateTime: number; cooldown: number; seed: number; hitFlash: number; engaged: boolean; patrolAnchor: THREE.Vector3; patrolTarget: THREE.Vector3; patrolTimer: number; }
interface Bullet { mesh: THREE.Group; velocity: THREE.Vector3; previous: THREE.Vector3; distance: number; damage: number; friendly: boolean; radius: number; active: boolean; }
interface PowerUp { mesh: THREE.Group; kind: PowerKind; age: number; }
interface Particle { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; total: number; active: boolean; }

const app = document.querySelector<HTMLDivElement>('#app')!;
const touchMode = window.matchMedia('(pointer: coarse)').matches;
app.innerHTML = `
  <div id="viewport"></div>
  <div class="vignette"></div><div id="damage-flash"></div>
  <div id="hud" class="hidden">
    <div class="hud-panel hud-left">
      <div class="hud-eyebrow">SISTEMAS DA NAVE</div>
      <div class="stat-heading"><span>INTEGRIDADE</span><strong id="health-value">100</strong></div>
      <div class="health-track"><div id="health-normal"></div><div id="health-extra"></div></div>
      <div class="stat-heading laser-heading"><span>LASER <b id="laser-level">01</b><small> / 20</small></span><strong id="laser-damage">2 DMG</strong></div>
      <div class="laser-track"><div id="laser-fill"></div></div>
    </div>
    <div class="hud-panel hud-right">
      <div class="hud-eyebrow">SETOR INFINITO</div>
      <div class="phase-line">FASE <strong id="phase-value">01</strong></div>
      <div class="phase-kills"><span id="kills-value">0 / 15 ELIMINAÇÕES</span><span id="total-kills">TOTAL 0</span></div>
      <div class="progress-track"><div id="phase-fill"></div></div>
    </div>
    <div id="reticle"><i class="r-top"></i><i class="r-right"></i><i class="r-bottom"></i><i class="r-left"></i><span></span></div>
    <div id="threats"></div>
    <div id="notification"></div>
    <div class="speed-panel"><div class="speed-label">VELOCIDADE</div><div><strong id="speed-value">035</strong><span>U/S</span></div><div id="throttle-indicator">CRUZEIRO</div></div>
    <div id="control-hint" class="hud-bottom-left">MOUSE · PILOTAR &nbsp; | &nbsp; ESPAÇO · DISPARAR &nbsp; | &nbsp; ESC · PAUSAR</div>
  </div>
  <button id="mute-btn" class="icon-button" aria-label="Silenciar áudio" title="Silenciar áudio">♪</button>
  <div id="menu" class="screen visible">
    <div class="menu-grid"></div><div class="menu-glow"></div>
    <div class="menu-content"><div class="eyebrow"><span class="eyebrow-line"></span> MISSÃO EM CURSO <span class="eyebrow-line"></span></div>
      <h1>SPACE<br><em>SHOOTER</em><span>3D</span></h1>
      <p>O universo não tem bordas. A batalha também não.</p>
      <button id="start-btn" class="primary-button">INICIAR MISSÃO <span>↗</span></button>
      <div id="controls-grid" class="controls-grid"><div><b>MOUSE</b><span>Pilotar em 3D</span></div><div><b>ESPAÇO</b><span>Laser contínuo</span></div><div><b>CLIQUE ESQ./DIR.</b><span>Acelerar / frear</span></div><div><b>BOTÃO CENTRAL</b><span>Orbitar câmera</span></div></div>
    </div>
    <div class="menu-footer">NAVE PROCEDURAL // UNIVERSO CONTÍNUO // COMBATE ARCADE</div>
  </div>
  <div id="pause" class="screen"><div class="modal"><div class="eyebrow">SISTEMA EM ESPERA</div><h2>PAUSADO</h2><p>Pressione Esc para retomar o voo.</p><button id="resume-btn" class="primary-button">CONTINUAR <span>↗</span></button></div></div>
  <div id="game-over" class="screen"><div class="modal"><div class="eyebrow red">SINAL PERDIDO</div><h2>GAME OVER</h2><p>Sua nave foi destruída.</p><div class="results"><div><span>FASE ALCANÇADA</span><strong id="result-phase">01</strong></div><div><span>INIMIGOS DESTRUÍDOS</span><strong id="result-kills">0</strong></div></div><button id="restart-btn" class="primary-button">JOGAR NOVAMENTE <span>↗</span></button></div></div>
`;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
if (touchMode) {
  document.documentElement.classList.add('touch-mode');
  $('controls-grid').innerHTML = '<div><b>ARRASTAR</b><span>Pilotar em 3D</span></div><div><b>1 DEDO</b><span>Manter para acelerar</span></div><div><b>2 DEDOS</b><span>Manter para frear</span></div><div><b>LASER</b><span>Disparo automático</span></div>';
  $('control-hint').textContent = 'TOQUE · PILOTAR E ACELERAR  |  2 DEDOS · FREAR  |  LASER AUTOMÁTICO';
}
const viewport = $<HTMLDivElement>('viewport'), hud = $<HTMLDivElement>('hud');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8)); renderer.setSize(innerWidth, innerHeight); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
viewport.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x030914);
scene.add(new THREE.AmbientLight(0x799ec3, 1.35));
const sun = new THREE.DirectionalLight(0xc5e8ff, 2.3); sun.position.set(-20, 35, 40); scene.add(sun);
const redLight = new THREE.PointLight(0xff5277, 45, 90); redLight.position.set(30, -12, -35); scene.add(redLight);
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 1200);
const rng = new RNG(CONFIG.seed), world = new World(scene, rng), audio = new AudioManager();
const player = createPlayerShip(); scene.add(player); player.position.set(0, 0, 0);
const playerVelocity = new THREE.Vector3(), forward = new THREE.Vector3(), temp = new THREE.Vector3(), temp2 = new THREE.Vector3(), temp3 = new THREE.Vector3(), targetQuat = new THREE.Quaternion();
const localForward = new THREE.Vector3(0, 0, -1), localUp = new THREE.Vector3(0, 1, 0), localRight = new THREE.Vector3(1, 0, 0);
const qPitch = new THREE.Quaternion(), qYaw = new THREE.Quaternion();
const enemies: Enemy[] = [], bullets: Bullet[] = [], powerups: PowerUp[] = [], particles: Particle[] = [];
let mode: Mode = 'menu', health = 100, speed = CONFIG.player.cruiseSpeed, level = 1, kills = 0, phase = 1;
let invuln = 0, shootTimer = 0, enemySpawnTimer = 0, powerSpawnTimer = 0, shotSide = 0, gameTime = 0, damageFlash = 0;
let mouseX = 0, mouseY = 0, leftDown = false, rightDown = false, middleDown = false, firing = false, orbitYaw = 0, orbitPitch = 0, notificationTimer = 0;
let accumulated = 0, lastTime = performance.now();
const clockTarget = new THREE.Vector3(), cameraOffset = new THREE.Vector3(), cameraRigQuat = new THREE.Quaternion(), cameraForward = new THREE.Vector3();
const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
const glowCtx = glowCanvas.getContext('2d')!; const glowGradient = glowCtx.createRadialGradient(32, 32, 1, 32, 32, 32); glowGradient.addColorStop(0, 'rgba(255,255,255,1)'); glowGradient.addColorStop(0.18, 'rgba(255,255,255,.68)'); glowGradient.addColorStop(1, 'rgba(255,255,255,0)'); glowCtx.fillStyle = glowGradient; glowCtx.fillRect(0, 0, 64, 64);
const glowTexture = new THREE.CanvasTexture(glowCanvas);
const bulletGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.25, 6), particleGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
const powerGeo = new THREE.IcosahedronGeometry(1, 1), powerRingGeo = new THREE.TorusGeometry(1.38, 0.055, 5, 28);
for (const geometry of [bulletGeo, particleGeo, powerGeo, powerRingGeo]) geometry.userData.isShared = true;

function makeBullet(): Bullet {
  const mesh = new THREE.Group(); const core = new THREE.Mesh(bulletGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); core.rotation.x = Math.PI / 2; mesh.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xff5555, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); halo.scale.set(2.5, 2.5, 1); mesh.add(halo); mesh.visible = false; scene.add(mesh);
  const bullet = { mesh, velocity: new THREE.Vector3(), previous: new THREE.Vector3(), distance: 0, damage: 0, friendly: true, radius: 0.42, active: false }; bullets.push(bullet); return bullet;
}
function spawnBullet(origin: THREE.Vector3, direction: THREE.Vector3, friendly: boolean, damage: number, color: number, inherited: THREE.Vector3): void {
  const bullet = bullets.find(b => !b.active) ?? (bullets.length < CONFIG.effects.maxProjectiles ? makeBullet() : null); if (!bullet) return;
  bullet.active = true; bullet.mesh.visible = true; bullet.mesh.position.copy(origin); bullet.previous.copy(origin); bullet.velocity.copy(direction).multiplyScalar(friendly ? CONFIG.laser.speed : 95).add(inherited); bullet.distance = 0; bullet.damage = damage; bullet.friendly = friendly; bullet.radius = friendly ? CONFIG.laser.hitRadius : 0.7;
  bullet.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction); bullet.mesh.scale.setScalar(friendly ? 1 : 1.35);
  ((bullet.mesh.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(color);
  ((bullet.mesh.children[1] as THREE.Sprite).material as THREE.SpriteMaterial).color.setHex(color);
}
function deactivateBullet(b: Bullet): void { b.active = false; b.mesh.visible = false; }
function segmentHit(a: THREE.Vector3, b: THREE.Vector3, center: THREE.Vector3, radius: number): boolean {
  temp3.subVectors(b, a); const lengthSq = temp3.lengthSq(); const t = lengthSq > 0 ? Math.max(0, Math.min(1, temp.subVectors(center, a).dot(temp3) / lengthSq)) : 0;
  return temp.copy(a).addScaledVector(temp3, t).distanceToSquared(center) <= radius * radius;
}
function makeParticle(): Particle {
  const mesh = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false })); mesh.visible = false; scene.add(mesh);
  const p = { mesh, velocity: new THREE.Vector3(), life: 0, total: 0, active: false }; particles.push(p); return p;
}
function burst(position: THREE.Vector3, color: number, count: number, scale = 1): void {
  for (let i = 0; i < count; i++) {
    const p = particles.find(x => !x.active) ?? (particles.length < CONFIG.effects.maxParticles ? makeParticle() : null); if (!p) break;
    p.active = true; p.mesh.visible = true; p.mesh.position.copy(position); p.mesh.scale.setScalar(rng.range(0.45, 1.4) * scale); p.velocity.copy(rng.direction()).multiplyScalar(rng.range(9, 33) * scale); p.life = p.total = rng.range(0.35, 0.9); (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color); (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
  }
}
function spawnEnemy(): void {
  const max = Math.min(CONFIG.enemy.maxCount, 5 + Math.floor((phase - 1) * 1.3)); if (enemies.length >= max) return;
  const roll = rng.next(), kind: EnemyKind = phase < 2 ? (roll < 0.7 ? 'interceptor' : 'fighter') : phase < 4 ? (roll < 0.42 ? 'interceptor' : roll < 0.85 ? 'fighter' : 'bomber') : (roll < 0.3 ? 'interceptor' : roll < 0.68 ? 'fighter' : 'bomber');
  const mesh = createEnemyShip(kind); const view = camera.getWorldDirection(new THREE.Vector3()); let dir = rng.direction();
  if (rng.next() < 0.58) { const lateral = rng.direction(); lateral.addScaledVector(view, -lateral.dot(view)).normalize(); dir = view.clone().multiplyScalar(rng.range(0.3, 0.65)).add(lateral).normalize(); }
  else for (let i = 0; i < 10 && dir.dot(view) > 0.65; i++) dir = rng.direction();
  mesh.position.copy(player.position).addScaledVector(dir, rng.range(CONFIG.enemy.spawnMin, CONFIG.enemy.spawnMax)); mesh.quaternion.setFromUnitVectors(localForward, dir.clone().negate()); scene.add(mesh);
  const engaged = mesh.position.distanceTo(player.position) < CONFIG.enemy.detectDistance;
  enemies.push({ mesh, kind, health: enemyHealth(phase, kind), velocity: dir.multiplyScalar(-ENEMY_STATS[kind].speed * 0.3), state: engaged ? 'detect' : 'patrol', stateTime: 0, cooldown: rng.range(0.5, 2.5), seed: rng.range(0, 100), hitFlash: 0, engaged, patrolAnchor: mesh.position.clone(), patrolTarget: mesh.position.clone().add(rng.direction().multiplyScalar(rng.range(18, CONFIG.enemy.patrolRadius))), patrolTimer: rng.range(4, 8) });
}
function removeEnemy(index: number, destroyed: boolean): void {
  const enemy = enemies[index]; if (destroyed) {
    burst(enemy.mesh.position, ENEMY_STATS[enemy.kind].color, enemy.kind === 'bomber' ? 36 : 22, enemy.kind === 'bomber' ? 1.6 : 1); audio.explosion(); kills++; const nextPhase = phaseForKills(kills);
    if (nextPhase !== phase) { phase = nextPhase; announce(`FASE ${String(phase).padStart(2, '0')} · AMEAÇA ELEVADA`, 2.8); audio.phase(); }
    const dropChance = CONFIG.powerups.dropChance + (health < 35 ? CONFIG.powerups.criticalBonus : 0);
    if (rng.next() < dropChance) spawnPowerup(enemy.mesh.position);
  }
  scene.remove(enemy.mesh); disposeObject(enemy.mesh); enemies.splice(index, 1);
}
function disposeObject(root: THREE.Object3D): void { root.traverse(obj => { if (obj instanceof THREE.Mesh) { if (!obj.geometry.userData.isShared) obj.geometry.dispose(); const materials = Array.isArray(obj.material) ? obj.material : [obj.material]; for (const material of materials) if (!material.userData.isShared) material.dispose(); } else if (obj instanceof THREE.Sprite && !obj.material.userData.isShared) obj.material.dispose(); }); }

function spawnPowerup(position?: THREE.Vector3): void {
  const roll = rng.next(); const kind: PowerKind = health < 50 ? (roll < 0.48 ? 'health' : roll < 0.7 ? 'special' : 'laser') : (roll < 0.28 ? 'health' : roll < 0.47 ? 'special' : 'laser');
  const color = kind === 'health' ? 0x5dff9b : kind === 'special' ? 0xffd566 : 0x897bff;
  const mesh = new THREE.Group(); const orb = new THREE.Mesh(powerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.58, toneMapped: false })); mesh.add(orb);
  const ring = new THREE.Mesh(powerRingGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false })); mesh.add(ring);
  const symbol = new THREE.Group(); const white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  if (kind === 'laser') { const shape = new THREE.Shape(); shape.moveTo(-0.2, 0.8); shape.lineTo(0.15, 0.1); shape.lineTo(0.52, 0.1); shape.lineTo(-0.25, -0.85); shape.lineTo(-0.05, -0.18); shape.lineTo(-0.45, -0.18); shape.closePath(); symbol.add(new THREE.Mesh(new THREE.ShapeGeometry(shape), white)); }
  else { const h = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 0.1), white), v = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.1), white); symbol.add(h, v); }
  mesh.add(symbol); const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(6, 6, 1); mesh.add(halo);
  mesh.position.copy(position ?? player.position.clone().add(rng.direction().multiplyScalar(rng.range(35, 65)))); scene.add(mesh); powerups.push({ mesh, kind, age: 0 });
}
function collectPowerup(p: PowerUp): void {
  if (p.kind === 'health') { health = health > 100 ? health : Math.min(100, health + 25); announce('INTEGRIDADE +25', 1.7); }
  else if (p.kind === 'special') { health = Math.min(CONFIG.player.maxHealth, health + 25); announce('VIDA ESPECIAL +25', 1.7); }
  else { level = Math.min(CONFIG.laser.maxLevel, level + 1); announce(`LASER NÍVEL ${String(level).padStart(2, '0')}`, 1.7); }
  burst(p.mesh.position, p.kind === 'health' ? 0x5dff9b : p.kind === 'special' ? 0xffd566 : 0x897bff, 13, 0.5); audio.pickup();
}
function damagePlayer(amount: number): void {
  if (mode !== 'playing' || invuln > 0) return; health = Math.max(0, health - amount); invuln = CONFIG.player.invulnerability; damageFlash = 0.65; burst(player.position, 0xff5670, 10, 0.6); audio.hit();
  if (health <= 0) gameOver();
}
function gameOver(): void { mode = 'over'; audio.stopEngine(); audio.gameOver(); burst(player.position, 0xff7396, 55, 1.8); player.visible = false; $('result-phase').textContent = String(phase).padStart(2, '0'); $('result-kills').textContent = String(kills); $('game-over').classList.add('visible'); hud.classList.add('hidden'); }
function announce(message: string, seconds: number): void { $('notification').textContent = message; $('notification').classList.add('shown'); notificationTimer = seconds; }

function resetGame(): void {
  for (let i = enemies.length - 1; i >= 0; i--) removeEnemy(i, false);
  for (const b of bullets) deactivateBullet(b);
  for (const p of powerups) { scene.remove(p.mesh); disposeObject(p.mesh); } powerups.length = 0;
  for (const p of particles) { p.active = false; p.mesh.visible = false; }
  world.shift(player.position); player.position.set(0, 0, 0); player.quaternion.identity(); (player.userData.body as THREE.Group).rotation.set(0, 0, 0); player.visible = true;
  health = 100; speed = CONFIG.player.cruiseSpeed; level = 1; kills = 0; phase = 1; invuln = 0; shootTimer = 0; enemySpawnTimer = 0; powerSpawnTimer = 0; shotSide = 0; gameTime = 0; damageFlash = 0; playerVelocity.set(0, 0, -speed); mouseX = mouseY = 0; orbitYaw = orbitPitch = 0; leftDown = rightDown = middleDown = firing = false;
  cameraRigQuat.identity(); camera.position.set(0, CONFIG.camera.height, CONFIG.camera.distance); camera.lookAt(0, 0, -CONFIG.camera.aimDistance); clockTarget.set(0, 0, -CONFIG.camera.aimDistance);
  mode = 'playing'; $('menu').classList.remove('visible'); $('pause').classList.remove('visible'); $('game-over').classList.remove('visible'); hud.classList.remove('hidden'); renderer.domElement.focus();
  for (let i = 0; i < 3; i++) spawnEnemy(); updateHud();
}
function setPaused(value: boolean): void { if (value && mode === 'playing') { mode = 'paused'; $('pause').classList.add('visible'); audio.stopEngine(); leftDown = rightDown = firing = false; if (touchMode) mouseX = mouseY = 0; } else if (!value && mode === 'paused') { mode = 'playing'; $('pause').classList.remove('visible'); lastTime = performance.now(); } }

function updatePlayer(dt: number): void {
  const nx = Math.max(-1, Math.min(1, mouseX)), ny = Math.max(-1, Math.min(1, mouseY));
  if (!middleDown) {
    qYaw.setFromAxisAngle(localUp, -nx * CONFIG.player.turnRate * dt); qPitch.setFromAxisAngle(localRight, -ny * CONFIG.player.turnRate * dt);
    player.quaternion.multiply(qYaw).multiply(qPitch).normalize();
    const body = player.userData.body as THREE.Group; body.rotation.z += ((-nx * 0.42) - body.rotation.z) * Math.min(1, dt * 5); body.rotation.x += ((-ny * 0.08) - body.rotation.x) * Math.min(1, dt * 5);
  } else { orbitYaw *= 1; }
  const desired = leftDown ? CONFIG.player.maxSpeed : rightDown ? CONFIG.player.minSpeed : CONFIG.player.cruiseSpeed;
  const rate = rightDown ? CONFIG.player.braking : leftDown ? CONFIG.player.acceleration : 18; speed += Math.sign(desired - speed) * Math.min(Math.abs(desired - speed), rate * dt);
  forward.copy(localForward).applyQuaternion(player.quaternion); playerVelocity.lerp(temp2.copy(forward).multiplyScalar(speed), 1 - Math.exp(-dt * 6)); player.position.addScaledVector(playerVelocity, dt);
  if (player.position.length() > CONFIG.world.originShift) { const offset = player.position.clone(); player.position.set(0, 0, 0); camera.position.sub(offset); clockTarget.sub(offset); world.shift(offset); for (const e of enemies) { e.mesh.position.sub(offset); e.patrolAnchor.sub(offset); e.patrolTarget.sub(offset); } for (const b of bullets) b.mesh.position.sub(offset), b.previous.sub(offset); for (const p of powerups) p.mesh.position.sub(offset); for (const p of particles) p.mesh.position.sub(offset); }
  if (invuln > 0) invuln -= dt;
  player.visible = invuln > 0 ? Math.floor(gameTime * 20) % 2 === 0 : true;
  audio.engineSound(speed / CONFIG.player.maxSpeed);
}
function updateCamera(dt: number): void {
  if (!middleDown) { const k = 1 - Math.exp(-dt * CONFIG.camera.orbitReturn); orbitYaw += (0 - orbitYaw) * k; orbitPitch += (0 - orbitPitch) * k; }
  cameraRigQuat.slerp(player.quaternion, 1 - Math.exp(-dt * CONFIG.camera.rotationFollow));
  const boost = (speed - CONFIG.player.cruiseSpeed) / (CONFIG.player.maxSpeed - CONFIG.player.cruiseSpeed);
  cameraOffset.set(0, CONFIG.camera.height, CONFIG.camera.distance + Math.max(0, boost) * 6);
  cameraOffset.applyAxisAngle(localRight, orbitPitch).applyAxisAngle(localUp, orbitYaw).applyQuaternion(cameraRigQuat);
  camera.position.lerp(temp.copy(player.position).add(cameraOffset), 1 - Math.exp(-dt * CONFIG.camera.positionFollow));
  cameraForward.copy(localForward).applyQuaternion(cameraRigQuat);
  clockTarget.copy(player.position).addScaledVector(cameraForward, middleDown ? 0 : CONFIG.camera.aimDistance); camera.up.copy(localUp).applyQuaternion(cameraRigQuat); camera.lookAt(clockTarget);
  camera.fov += (CONFIG.camera.fov + Math.max(0, boost) * 10 - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
}
function shootPlayer(dt: number): void {
  if (!firing && !touchMode) { shootTimer = 0; return; } shootTimer -= dt;
  while (shootTimer <= 0) {
    shootTimer += 1 / CONFIG.laser.rate; shotSide = 1 - shotSide; const side = shotSide ? 1 : -1;
    const muzzle = new THREE.Vector3(side * 4.25, -0.14, -2.1).applyQuaternion(player.quaternion).add(player.position);
    const converge = new THREE.Vector3(0, 0, -CONFIG.laser.convergence).applyQuaternion(player.quaternion).add(player.position);
    const dir = converge.sub(muzzle).normalize(); spawnBullet(muzzle, dir, true, laserDamage(level), laserColor(level), playerVelocity); audio.shot();
  }
}
function updateEnemies(dt: number): void {
  const sorted = enemies.filter(e => e.engaged).map(e => ({ e, d: e.mesh.position.distanceToSquared(player.position) })).sort((a, b) => a.d - b.d);
  const attackSet = new Set(sorted.slice(0, CONFIG.enemy.attackSlots + Math.floor((phase - 1) / 4)).map(x => x.e));
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], stats = ENEMY_STATS[e.kind]; const distance = e.mesh.position.distanceTo(player.position);
    if (distance > CONFIG.enemy.despawn) { removeEnemy(i, false); continue; }
    e.stateTime += dt; e.cooldown -= dt; e.patrolTimer -= dt; e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.engaged && distance >= CONFIG.enemy.disengageDistance) {
      e.engaged = false; e.patrolAnchor.copy(e.mesh.position); e.patrolTimer = 0;
    } else if (!e.engaged && distance <= CONFIG.enemy.detectDistance) {
      e.engaged = true; e.stateTime = 0;
    }
    let desired: THREE.Vector3;
    if (!e.engaged) {
      e.state = 'patrol';
      if (e.patrolTimer <= 0 || e.mesh.position.distanceToSquared(e.patrolTarget) < 10 ** 2) {
        e.patrolTarget.copy(e.patrolAnchor).add(rng.direction().multiplyScalar(rng.range(18, CONFIG.enemy.patrolRadius)));
        e.patrolTimer = rng.range(4, 8);
      }
      desired = e.patrolTarget.clone().sub(e.mesh.position).normalize();
    } else {
      if (e.stateTime < 0.45) e.state = 'detect'; else if (distance > 55) e.state = 'pursue'; else if (distance < 25) e.state = 'reposition'; else if (e.health < enemyHealth(phase, e.kind) * 0.35 && e.kind === 'interceptor' && Math.sin(gameTime * 2 + e.seed) > 0.25) e.state = 'evade'; else e.state = 'combat';
      desired = player.position.clone().sub(e.mesh.position).normalize();
      if (e.state === 'evade' || e.state === 'reposition') desired.addScaledVector(new THREE.Vector3(Math.sin(e.seed + gameTime * 1.7), Math.cos(e.seed + gameTime * 1.3), 0).applyQuaternion(e.mesh.quaternion), e.state === 'evade' ? 1.4 : 0.8).normalize();
    }
    targetQuat.setFromUnitVectors(localForward, desired); e.mesh.quaternion.slerp(targetQuat, Math.min(1, dt * stats.turn));
    const forwardEnemy = localForward.clone().applyQuaternion(e.mesh.quaternion); const targetSpeed = stats.speed * (e.state === 'patrol' ? CONFIG.enemy.patrolSpeed : e.state === 'combat' ? 0.7 : 1);
    e.velocity.lerp(forwardEnemy.multiplyScalar(targetSpeed), 1 - Math.exp(-dt * 2.2)); e.mesh.position.addScaledVector(e.velocity, dt);
    e.mesh.children.forEach(child => { if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) child.material.emissiveIntensity = e.hitFlash > 0 ? 1.8 : 0.48; });
    if (attackSet.has(e) && (e.state === 'combat' || e.state === 'pursue') && distance < 110 && e.cooldown <= 0) {
      e.cooldown = stats.cooldown / Math.min(1.8, 1 + (phase - 1) * 0.05) + rng.range(-0.25, 0.4);
      const aim = player.position.clone().addScaledVector(playerVelocity, distance / 95 * (0.58 + Math.min(0.3, phase * 0.025)));
      aim.add(rng.direction().multiplyScalar(Math.max(2.5, 11 - phase * 0.4) * (e.kind === 'bomber' ? 1.2 : 1)));
      const dir = aim.sub(e.mesh.position).normalize(); spawnBullet(e.mesh.position.clone().addScaledVector(dir, stats.radius + 1), dir, false, enemyDamage(phase, e.kind), stats.color, e.velocity);
    }
    if (distance < stats.radius + CONFIG.player.radius && invuln <= 0) damagePlayer(Math.max(2, enemyDamage(phase, e.kind)));
  }
}
function updateBullets(dt: number): void {
  for (const b of bullets) { if (!b.active) continue; b.previous.copy(b.mesh.position); b.mesh.position.addScaledVector(b.velocity, dt); b.distance += b.velocity.length() * dt;
    if (b.distance > (b.friendly ? CONFIG.laser.range : 260)) { deactivateBullet(b); continue; }
    if (b.friendly) {
      let hit = false;
      for (let i = enemies.length - 1; i >= 0; i--) { const e = enemies[i]; if (segmentHit(b.previous, b.mesh.position, e.mesh.position, ENEMY_STATS[e.kind].radius + b.radius)) { e.health -= b.damage; e.hitFlash = 0.11; burst(b.mesh.position, ENEMY_STATS[e.kind].color, 5, 0.35); audio.hit(); if (e.health <= 0) removeEnemy(i, true); hit = true; break; } }
      if (!hit) for (const a of world.asteroids) if (segmentHit(b.previous, b.mesh.position, a.mesh.position, a.radius + b.radius)) { a.health -= b.damage; burst(b.mesh.position, 0xa0bbd6, 5, 0.35); if (a.health <= 0) { burst(a.mesh.position, 0xa0bbd6, 19, a.radius / 5); world.destroyAsteroid(a, player.position); } hit = true; break; }
      if (hit) deactivateBullet(b);
    } else if (segmentHit(b.previous, b.mesh.position, player.position, CONFIG.player.radius + b.radius)) { damagePlayer(b.damage); deactivateBullet(b); }
  }
}
function updatePowerups(dt: number): void {
  powerSpawnTimer += dt; if (powerSpawnTimer > CONFIG.powerups.ambientInterval) { powerSpawnTimer = 0; if (powerups.length < 6) spawnPowerup(); }
  for (let i = powerups.length - 1; i >= 0; i--) { const p = powerups[i]; p.age += dt; p.mesh.rotation.y += dt * 1.1; p.mesh.rotation.z = Math.sin(p.age * 2) * 0.15; p.mesh.scale.setScalar(1 + Math.sin(p.age * 4) * 0.08);
    if (p.mesh.position.distanceToSquared(player.position) < 3.9 ** 2) { collectPowerup(p); scene.remove(p.mesh); disposeObject(p.mesh); powerups.splice(i, 1); }
    else if (p.age > CONFIG.powerups.lifetime) { scene.remove(p.mesh); disposeObject(p.mesh); powerups.splice(i, 1); }
  }
}
function updateParticles(dt: number): void { for (const p of particles) { if (!p.active) continue; p.life -= dt; if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; } p.mesh.position.addScaledVector(p.velocity, dt); p.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.7)); (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life / p.total; p.mesh.rotation.x += dt * 5; p.mesh.rotation.y += dt * 4; } }
function updateAsteroidCollisions(): void { for (const a of world.asteroids) if (a.mesh.position.distanceToSquared(player.position) < (a.radius + CONFIG.player.radius * 0.7) ** 2 && invuln <= 0) { damagePlayer(Math.round(a.radius * 1.3)); a.health -= 4; if (a.health <= 0) world.destroyAsteroid(a, player.position); } }

function updateHud(): void {
  $('health-value').textContent = String(Math.ceil(health)); $('health-normal').style.width = `${Math.min(100, health)}%`; $('health-extra').style.width = `${Math.max(0, health - 100)}%`;
  $('laser-level').textContent = String(level).padStart(2, '0'); $('laser-level').style.color = `#${laserColor(level).toString(16).padStart(6, '0')}`; $('laser-damage').textContent = `${laserDamage(level).toLocaleString('pt-BR')} DMG`; $('laser-fill').style.width = `${level / 20 * 100}%`; $('laser-fill').style.background = `#${laserColor(level).toString(16).padStart(6, '0')}`;
  $('phase-value').textContent = String(phase).padStart(2, '0'); $('kills-value').textContent = `${kills % CONFIG.phaseKills} / ${CONFIG.phaseKills} ELIMINAÇÕES`; $('total-kills').textContent = `TOTAL ${kills}`; $('phase-fill').style.width = `${kills % CONFIG.phaseKills / CONFIG.phaseKills * 100}%`;
  $('speed-value').textContent = String(Math.round(speed)).padStart(3, '0'); $('throttle-indicator').textContent = leftDown ? 'ACELERANDO' : rightDown ? 'FREANDO' : 'CRUZEIRO'; $('throttle-indicator').className = leftDown ? 'boost' : rightDown ? 'brake' : '';
  $('damage-flash').style.opacity = String(Math.max(0, damageFlash));
  const point = player.position.clone().addScaledVector(forward, CONFIG.laser.convergence).project(camera);
  const reticle = $('reticle'); reticle.style.left = `${(point.x * 0.5 + 0.5) * innerWidth}px`; reticle.style.top = `${(-point.y * 0.5 + 0.5) * innerHeight}px`;
  const threats = $('threats'); threats.replaceChildren(); let shown = 0;
  for (const e of enemies) { if (shown >= 6) break; const screen = e.mesh.position.clone().project(camera); if (screen.z > 1 || Math.abs(screen.x) > 0.88 || Math.abs(screen.y) > 0.82) { const x = Math.max(32, Math.min(innerWidth - 32, (screen.x * 0.5 + 0.5) * innerWidth)); const y = Math.max(62, Math.min(innerHeight - 65, (-screen.y * 0.5 + 0.5) * innerHeight)); const mark = document.createElement('div'); mark.className = 'threat'; mark.style.left = `${x}px`; mark.style.top = `${y}px`; mark.textContent = '◆'; threats.appendChild(mark); shown++; } }
}
function tick(dt: number): void {
  gameTime += dt; updatePlayer(dt); updateCamera(dt); shootPlayer(dt); updateEnemies(dt); updateBullets(dt); updatePowerups(dt); updateParticles(dt); updateAsteroidCollisions(); world.update(dt, player.position);
  enemySpawnTimer += dt; if (enemySpawnTimer >= CONFIG.enemy.spawnInterval) { enemySpawnTimer = 0; spawnEnemy(); }
  damageFlash = Math.max(0, damageFlash - dt * 1.55); notificationTimer -= dt; if (notificationTimer <= 0) $('notification').classList.remove('shown');
}
function frame(now: number): void { requestAnimationFrame(frame); const delta = Math.min((now - lastTime) / 1000, 0.1); lastTime = now;
  if (mode === 'playing') { accumulated += delta; let steps = 0; while (accumulated >= CONFIG.fixedStep && steps++ < 5) { tick(CONFIG.fixedStep); accumulated -= CONFIG.fixedStep; } if (steps >= 5) accumulated = 0; updateHud(); }
  else if (mode === 'menu') { player.rotation.y += delta * 0.08; player.position.y = Math.sin(now * 0.0007) * 0.18; camera.position.set(12, 7, 20); camera.lookAt(0, 0, 0); world.update(delta, player.position); }
  else if (mode === 'over') updateParticles(delta);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

renderer.domElement.tabIndex = 0;
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8)); });
renderer.domElement.addEventListener('mousemove', e => { if (mode !== 'playing' || touchMode) return; if (middleDown) { orbitYaw -= e.movementX * 0.005; orbitPitch = Math.max(-1.2, Math.min(1.2, orbitPitch - e.movementY * 0.005)); } else { mouseX = (e.clientX - innerWidth / 2) / (innerWidth * 0.38); mouseY = (e.clientY - innerHeight / 2) / (innerHeight * 0.38); } });
renderer.domElement.addEventListener('mousedown', e => { if (mode !== 'playing' || touchMode) return; e.preventDefault(); if (e.button === 0) leftDown = true; if (e.button === 2) rightDown = true; if (e.button === 1) middleDown = true; });
window.addEventListener('mouseup', e => { if (e.button === 0) leftDown = false; if (e.button === 2) rightDown = false; if (e.button === 1) middleDown = false; });
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault()); renderer.domElement.addEventListener('auxclick', e => e.preventDefault());
function updateTouchControls(touches: TouchList): void {
  if (mode !== 'playing') return;
  leftDown = touches.length === 1;
  rightDown = touches.length >= 2;
  if (touches.length === 0) { mouseX = 0; mouseY = 0; return; }
  const touch = touches[0];
  mouseX = (touch.clientX - innerWidth / 2) / (innerWidth * 0.38);
  mouseY = (touch.clientY - innerHeight / 2) / (innerHeight * 0.38);
}
for (const eventName of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) {
  renderer.domElement.addEventListener(eventName, e => { e.preventDefault(); updateTouchControls(e.touches); }, { passive: false });
}
window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); if (mode === 'playing') firing = true; } if (e.code === 'Escape') { e.preventDefault(); if (mode === 'playing') setPaused(true); else if (mode === 'paused') setPaused(false); } });
window.addEventListener('keyup', e => { if (e.code === 'Space') { e.preventDefault(); firing = false; } });
window.addEventListener('blur', () => { if (mode === 'playing') setPaused(true); });
$('start-btn').addEventListener('click', resetGame); $('restart-btn').addEventListener('click', resetGame); $('resume-btn').addEventListener('click', () => setPaused(false));
$('mute-btn').addEventListener('click', () => { audio.setMuted(!audio.muted); $('mute-btn').textContent = audio.muted ? '♪̸' : '♪'; $('mute-btn').setAttribute('aria-label', audio.muted ? 'Ativar áudio' : 'Silenciar áudio'); });
