import * as THREE from 'three';
import { CONFIG, ENEMY_STATS, enemyDamage, enemyHealth, enemyKindForPhase, laserColor, laserDamage, phaseForKills, type EnemyKind, type PowerKind } from './config';
import { AudioManager } from './audio';
import { createEnemyShip, createPlayerShip, RNG, World, type Asteroid } from './procedural';
import { HangarPreview } from './hangar';
import { ShieldAura } from './shieldAura';
import { ECONOMY, MAX_UPGRADE_LEVEL, UPGRADE_KEYS, armoredDamage, buyShip, buySkin, finishRun, getShipStats, loadProgress, pointsForEnemy, purchaseUpgrade, selectShip, selectSkin, upgradeCost, type ShipKind, type SkinKind, type UpgradeKind } from './economy';
import { DEV_CHEATS_ENABLED, installDevCheatGesture, phaseFromCheat, redeemEntropyCode } from './devCheats';
import { SpatialFrame, symbolicCoordinates } from './spatial';
import { SpatialField } from './regions';
import spiralSigil from './assets/sigil-spiral.svg?raw';
import knotSigil from './assets/sigil-knot.svg?raw';
import runeSigil from './assets/sigil-rune.svg?raw';
import './style.css';
import './hangar.css';

type Mode = 'menu' | 'playing' | 'paused' | 'over';
type AIState = 'patrol' | 'detect' | 'pursue' | 'combat' | 'evade' | 'reposition' | 'flee' | 'hammerApproach' | 'hammerPrepare' | 'hammerCharge' | 'hammerRecover' | 'pursuerIntercept' | 'pursuerAttack' | 'pursuerPass' | 'pursuerReposition';
type MineState = 'arming' | 'active' | 'detonating';
interface Enemy { mesh: THREE.Group; kind: EnemyKind; health: number; velocity: THREE.Vector3; state: AIState; stateTime: number; stateDuration: number; lockedDirection: THREE.Vector3; specialHit: boolean; orbitSign: number; warning?: THREE.Mesh; cooldown: number; seed: number; hitFlash: number; engaged: boolean; patrolAnchor: THREE.Vector3; patrolTarget: THREE.Vector3; patrolTimer: number; }
interface Bullet { mesh: THREE.Group; velocity: THREE.Vector3; previous: THREE.Vector3; distance: number; damage: number; friendly: boolean; radius: number; active: boolean; }
interface PowerUp { mesh: THREE.Group; kind: PowerKind; age: number; }
interface Mine { mesh: THREE.Group; coreMaterial: THREE.MeshBasicMaterial; ring: THREE.Mesh; age: number; health: number; damage: number; state: MineState; fuse: number; hitFlash: number; }
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
      <div class="shield-line"><span>ESCUDOS</span><strong id="shield-value">◇ ◇ ◇</strong></div>
      <div class="stat-heading laser-heading"><span>LASER <b id="laser-level">01</b><small id="laser-max"> / 20</small></span><strong id="laser-damage">2 DMG</strong></div>
      <div class="laser-track"><div id="laser-fill"></div></div>
    </div>
    <div class="hud-panel hud-right">
      <div class="hud-eyebrow">SETOR INFINITO</div>
      <div class="phase-line">FASE <strong id="phase-value">01</strong></div>
      <div class="phase-kills"><span id="kills-value">0 / 15 ELIMINAÇÕES</span><span id="total-kills">TOTAL 0</span></div>
      <div class="progress-track"><div id="phase-fill"></div></div>
      <div class="score-line"><span>PONTUAÇÃO</span><strong id="score-value">0</strong></div>
      <div class="coordinate-block" aria-label="Coordenadas espaciais"><span>COORDENADA ESPACIAL</span><div aria-label="Coordenada da espiral"><b class="coordinate-r">${spiralSigil}</b><strong id="coordinate-r">+0</strong></div><div aria-label="Coordenada do nó"><b class="coordinate-g">${knotSigil}</b><strong id="coordinate-g">+0</strong></div><div aria-label="Coordenada da runa"><b class="coordinate-b">${runeSigil}</b><strong id="coordinate-b">+0</strong></div></div>
    </div>
    <div id="reticle"><i class="r-top"></i><i class="r-right"></i><i class="r-bottom"></i><i class="r-left"></i><span></span></div>
    <div id="threats"></div>
    <div id="notification"></div>
    <div class="speed-panel"><div class="speed-label">VELOCIDADE</div><div><strong id="speed-value">035</strong><span>U/S</span></div><div id="throttle-indicator">CRUZEIRO</div></div>
    <div id="control-hint" class="hud-bottom-left">MOUSE · PILOTAR &nbsp; | &nbsp; ESPAÇO · DISPARAR &nbsp; | &nbsp; ESC · PAUSAR</div>
  </div>
  <button id="pause-btn" class="icon-button pause-button hidden" aria-label="Pausar missão" title="Pausar missão">Ⅱ</button>
  <button id="mute-btn" class="icon-button" aria-label="Silenciar áudio" title="Silenciar áudio">♪</button>
  <div id="menu" class="screen visible">
    <div class="menu-grid"></div><div class="menu-glow"></div>
    <div class="menu-content"><div class="eyebrow"><span class="eyebrow-line"></span> MISSÃO EM CURSO <span class="eyebrow-line"></span></div>
      <h1>SPACE<br><em>SHOOTER</em><span>3D</span></h1>
      <p>O universo não tem bordas. A batalha também não.</p>
      <div class="menu-scores"><div><span>HIGH-SCORE</span><strong id="high-score">0</strong></div><div><span>PONTOS DE ENTROPIA</span><strong id="entropy-value">0</strong></div></div>
      <div id="last-run" class="last-run"></div>
      <div class="menu-actions"><button id="start-btn" class="primary-button">INICIAR MISSÃO <span>↗</span></button><button id="hangar-btn" class="secondary-button">HANGAR <span>◆</span></button></div>
      <div id="controls-grid" class="controls-grid"><div><b>MOUSE</b><span>Pilotar em 3D</span></div><div><b>ESPAÇO</b><span>Laser contínuo</span></div><div><b>CLIQUE ESQ./DIR.</b><span>Acelerar / frear</span></div><div><b>BOTÃO CENTRAL</b><span>Orbitar câmera</span></div></div>
    </div>
    <div class="menu-footer">NAVE PROCEDURAL // UNIVERSO CONTÍNUO // COMBATE ARCADE</div>
  </div>
  <div id="hangar" class="screen" role="dialog" aria-label="Hangar"><div class="hangar-panel">
    <div class="hangar-header"><div><div class="eyebrow">ESTAÇÃO DE EQUIPAMENTO // FROTA</div><h2>HANGAR</h2></div><div class="hangar-header-right"><div class="hangar-balance"><span>PONTOS DE ENTROPIA</span><strong id="hangar-entropy">0</strong></div><button id="hangar-close" class="secondary-button">VOLTAR ×</button></div></div>
    <div class="hangar-gallery">
      <div class="hangar-selectors"><button class="hangar-arrow ship-arrow" data-cycle="ship" data-dir="-1" aria-label="Nave anterior"><b>◀</b><span>NAVE</span></button><button class="hangar-arrow skin-arrow" data-cycle="skin" data-dir="-1" aria-label="Cor anterior"><b>◀</b><span>COR</span></button></div>
      <div id="hangar-stage" class="hangar-stage"><span class="stage-caption">PLATAFORMA GIRATÓRIA // VISUALIZAÇÃO 3D</span><div id="hangar-canvas"></div><span id="hangar-stage-status" class="stage-status"></span></div>
      <div class="hangar-selectors"><button class="hangar-arrow ship-arrow" data-cycle="ship" data-dir="1" aria-label="Próxima nave"><b>▶</b><span>NAVE</span></button><button class="hangar-arrow skin-arrow" data-cycle="skin" data-dir="1" aria-label="Próxima cor"><b>▶</b><span>COR</span></button></div>
    </div>
    <div class="hangar-identity"><div><span>MODELO</span><h3 id="hangar-ship-name">CAOS</h3></div><div><span>ACABAMENTO</span><h3 id="hangar-skin-name">TECH</h3><div id="hangar-swatches" class="hangar-swatches"></div></div></div>
    <div id="hangar-ship-description" class="hangar-ship-description"></div>
    <div id="hangar-purchases" class="hangar-purchases"></div>
    <div class="hangar-attribute-head"><span>ATRIBUTOS DA NAVE</span><small>MELHORIAS PERMANENTES · 5 NÍVEIS POR ATRIBUTO</small></div>
    <div id="hangar-attributes" class="hangar-attributes"></div>
  </div></div>
  <div id="pause" class="screen"><div class="modal"><div class="eyebrow">SISTEMA EM ESPERA</div><h2 id="pause-heading">PAUSADO</h2>
    <div id="pause-actions"><p id="pause-message">Pressione Esc para retomar o voo.</p><div class="pause-buttons"><button id="resume-btn" class="primary-button">CONTINUAR <span>↗</span></button><button id="abort-btn" class="abort-button">ABORTAR MISSÃO</button></div></div>
    <div id="abort-confirm" class="abort-confirm" hidden><p>Tem certeza? A pontuação desta partida será salva e poderá gerar high-score e pontos de entropia.</p><div class="confirm-buttons"><button id="abort-cancel-btn" class="secondary-button">CANCELAR</button><button id="abort-yes-btn" class="abort-button confirm">SIM, ABORTAR</button></div></div>
  </div></div>
  <div id="game-over" class="screen"><div class="modal"><div class="eyebrow red">SINAL PERDIDO</div><h2>GAME OVER</h2><div class="results"><div><span>PONTOS</span><strong id="result-score">0</strong></div><div><span>ENTROPIA +</span><strong id="result-entropy">0</strong></div></div><button id="restart-btn" class="primary-button">VOLTAR AO INÍCIO <span>↗</span></button></div></div>
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
const rng = new RNG(CONFIG.seed), spatialFrame = new SpatialFrame(), spatialField = new SpatialField(CONFIG.seed), world = new World(scene, rng, spatialFrame, spatialField), audio = new AudioManager();
const progress = loadProgress();
let activeShipStats = getShipStats(progress, progress.selectedShip);
const shipStats = () => activeShipStats;
const compactDamage = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const coordinateFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
function formatCoordinate(value: number): string { const rounded = Math.round(value); return `${rounded < 0 ? '−' : '+'}${coordinateFormat.format(Math.abs(rounded))}`; }
const shipNames = Object.keys(ECONOMY.ships) as ShipKind[], skinNames = Object.keys(ECONOMY.skins) as SkinKind[];
let hangarShip = progress.selectedShip, hangarSkin = progress.selectedSkin, hangarPreview: HangarPreview | null = null;
let player = createPlayerShip(progress.selectedShip, progress.selectedSkin); scene.add(player); player.position.set(0, 0, 0);
const shieldAura = new ShieldAura(); shieldAura.attach(player);
const playerVelocity = new THREE.Vector3(), forward = new THREE.Vector3(), temp = new THREE.Vector3(), temp2 = new THREE.Vector3(), temp3 = new THREE.Vector3(), targetQuat = new THREE.Quaternion();
const localForward = new THREE.Vector3(0, 0, -1), localUp = new THREE.Vector3(0, 1, 0), localRight = new THREE.Vector3(1, 0, 0);
const spatialZero = new THREE.Vector3();
const qPitch = new THREE.Quaternion(), qYaw = new THREE.Quaternion();
const enemies: Enemy[] = [], bullets: Bullet[] = [], powerups: PowerUp[] = [], mines: Mine[] = [], particles: Particle[] = [];
let mode: Mode = 'menu', health = 100, speed = CONFIG.player.cruiseSpeed, level = 1, kills = 0, phase = 1, phaseOffset = 0, score = 0, shields = 0;
let invuln = 0, shieldProtection = 0, shootTimer = 0, enemySpawnTimer = 0, powerSpawnTimer = 0, shotSide = 0, harpiaMuzzleIndex = 0, gameTime = 0, damageFlash = 0, shieldFlash = 0;
let mouseX = 0, mouseY = 0, leftDown = false, rightDown = false, middleDown = false, firing = false, orbitYaw = 0, orbitPitch = 0, notificationTimer = 0;
let accumulated = 0, lastTime = performance.now();
const clockTarget = new THREE.Vector3(), cameraOffset = new THREE.Vector3(), cameraRigQuat = new THREE.Quaternion(), cameraForward = new THREE.Vector3();
const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
const glowCtx = glowCanvas.getContext('2d')!; const glowGradient = glowCtx.createRadialGradient(32, 32, 1, 32, 32, 32); glowGradient.addColorStop(0, 'rgba(255,255,255,1)'); glowGradient.addColorStop(0.18, 'rgba(255,255,255,.68)'); glowGradient.addColorStop(1, 'rgba(255,255,255,0)'); glowCtx.fillStyle = glowGradient; glowCtx.fillRect(0, 0, 64, 64);
const glowTexture = new THREE.CanvasTexture(glowCanvas);
const bulletGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.25, 6), particleGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
const powerGeo = new THREE.IcosahedronGeometry(1, 1), powerRingGeo = new THREE.TorusGeometry(1.38, 0.055, 5, 28);
const mineCoreGeo = new THREE.IcosahedronGeometry(0.85, 0), mineSpikeGeo = new THREE.ConeGeometry(0.22, 0.78, 5);
for (const geometry of [bulletGeo, particleGeo, powerGeo, powerRingGeo, mineCoreGeo, mineSpikeGeo]) geometry.userData.isShared = true;

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
  const kind = enemyKindForPhase(phase, rng.next());
  const mesh = createEnemyShip(kind); const view = camera.getWorldDirection(new THREE.Vector3()); let dir = rng.direction();
  if (rng.next() < 0.58) { const lateral = rng.direction(); lateral.addScaledVector(view, -lateral.dot(view)).normalize(); dir = view.clone().multiplyScalar(rng.range(0.3, 0.65)).add(lateral).normalize(); }
  else for (let i = 0; i < 10 && dir.dot(view) > 0.65; i++) dir = rng.direction();
  mesh.position.copy(player.position).addScaledVector(dir, rng.range(CONFIG.enemy.spawnMin, CONFIG.enemy.spawnMax));
  for (let attempt = 0; attempt < 12; attempt++) {
    const blockedByEnemy = enemies.some(other => mesh.position.distanceToSquared(other.mesh.position) < (ENEMY_STATS[kind].radius + ENEMY_STATS[other.kind].radius + 5) ** 2);
    const blockedByAsteroid = world.asteroids.some(asteroid => mesh.position.distanceToSquared(asteroid.mesh.position) < (ENEMY_STATS[kind].radius + asteroid.radius + 6) ** 2);
    if (!blockedByEnemy && !blockedByAsteroid) break;
    dir = rng.direction(); mesh.position.copy(player.position).addScaledVector(dir, rng.range(CONFIG.enemy.spawnMin, CONFIG.enemy.spawnMax));
  }
  mesh.quaternion.setFromUnitVectors(localForward, dir.clone().negate()); scene.add(mesh);
  let warning: THREE.Mesh | undefined;
  if (kind === 'hammer') {
    warning = new THREE.Mesh(powerRingGeo, new THREE.MeshBasicMaterial({ color: 0xffbb65, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    warning.position.z = -2.5; warning.scale.setScalar(4.8); warning.visible = false; mesh.add(warning);
  }
  const engaged = mesh.position.distanceTo(player.position) < CONFIG.enemy.detectDistance;
  const cooldown = rng.range(0.5, 2.5), seed = rng.range(0, 100);
  enemies.push({ mesh, kind, health: enemyHealth(phase, kind), velocity: dir.multiplyScalar(-ENEMY_STATS[kind].speed * 0.3), state: engaged ? 'detect' : 'patrol', stateTime: 0, stateDuration: 0, lockedDirection: new THREE.Vector3(), specialHit: false, orbitSign: Math.sin(seed) < 0 ? -1 : 1, warning, cooldown, seed, hitFlash: 0, engaged, patrolAnchor: mesh.position.clone(), patrolTarget: mesh.position.clone().add(rng.direction().multiplyScalar(rng.range(18, CONFIG.enemy.patrolRadius))), patrolTimer: rng.range(4, 8) });
}
function removeEnemy(index: number, destroyed: boolean): void {
  const enemy = enemies[index]; if (destroyed) {
    burst(enemy.mesh.position, ENEMY_STATS[enemy.kind].color, enemy.kind === 'bomber' || enemy.kind === 'hammer' ? 36 : 22, enemy.kind === 'bomber' || enemy.kind === 'hammer' ? 1.6 : 1); audio.explosion(); score += pointsForEnemy(enemy.kind, phase); kills++; const nextPhase = phaseOffset + phaseForKills(kills);
    if (nextPhase !== phase) { phase = nextPhase; announce(`FASE ${String(phase).padStart(2, '0')} · AMEAÇA ELEVADA`, 2.8); audio.phase(); }
    const dropChance = CONFIG.powerups.dropChance + (health < shipStats().baseHealth * 0.35 ? CONFIG.powerups.criticalBonus : 0);
    if (rng.next() < dropChance) spawnPowerup(enemy.mesh.position);
  }
  scene.remove(enemy.mesh); disposeObject(enemy.mesh); enemies.splice(index, 1);
}
function disposeObject(root: THREE.Object3D): void { root.traverse(obj => { if (obj instanceof THREE.Mesh) { if (!obj.geometry.userData.isShared) obj.geometry.dispose(); const materials = Array.isArray(obj.material) ? obj.material : [obj.material]; for (const material of materials) if (!material.userData.isShared) material.dispose(); } else if (obj instanceof THREE.Sprite && !obj.material.userData.isShared) obj.material.dispose(); }); }

function replacePlayerShip(): void {
  const position = player.position.clone(), rotation = player.quaternion.clone(), wasVisible = player.visible;
  shieldAura.detach();
  scene.remove(player); disposeObject(player);
  activeShipStats = getShipStats(progress, progress.selectedShip);
  player = createPlayerShip(progress.selectedShip, progress.selectedSkin);
  player.position.copy(position); player.quaternion.copy(rotation); player.visible = wasVisible; scene.add(player); shieldAura.attach(player);
}
function renderMenuStats(): void {
  $('high-score').textContent = progress.highScore.toLocaleString('pt-BR');
  $('entropy-value').textContent = progress.entropy.toLocaleString('pt-BR');
}
const attributeLabels: Record<UpgradeKind, string> = {
  speed: 'VELOCIDADE', turn: 'MANOBRABILIDADE', health: 'INTEGRIDADE / VIDA', armor: 'BLINDAGEM', damage: 'DANO',
  fireRate: 'CADÊNCIA', shields: 'MÁX. ESCUDOS', laserLevel: 'MÁX. NÍVEL DO LASER',
};
function attributeMetric(stats: ReturnType<typeof getShipStats>, key: UpgradeKind): number {
  if (key === 'speed') return stats.maxSpeed;
  if (key === 'turn') return stats.turnMultiplier;
  if (key === 'health') return stats.baseHealth + stats.extraHealth;
  if (key === 'armor') return stats.armor;
  if (key === 'damage') return stats.damageMultiplier;
  if (key === 'fireRate') return stats.fireRateMultiplier;
  if (key === 'shields') return stats.shieldSlots;
  return stats.maxLaserLevel;
}
function attributeValue(stats: ReturnType<typeof getShipStats>, key: UpgradeKind): string {
  if (key === 'speed') return `${stats.maxSpeed} U/S`;
  if (key === 'turn') return `${Math.round(stats.turnMultiplier * 100)}%`;
  if (key === 'health') return `${stats.baseHealth} + ${stats.extraHealth}`;
  if (key === 'armor') return String(stats.armor);
  if (key === 'damage') return `×${stats.damageMultiplier.toFixed(2).replace('.', ',')}`;
  if (key === 'fireRate') return `×${stats.fireRateMultiplier.toFixed(2).replace('.', ',')}`;
  if (key === 'shields') return String(stats.shieldSlots);
  return String(stats.maxLaserLevel);
}
function renderHangar(): void {
  const ownedShip = progress.ownedShips.includes(hangarShip), ownedSkin = progress.ownedSkins.includes(hangarSkin);
  const stats = getShipStats(progress, hangarShip), base = ECONOMY.ships[hangarShip], palette = ECONOMY.skins[hangarSkin];
  $('hangar-entropy').textContent = progress.entropy.toLocaleString('pt-BR');
  $('hangar-ship-name').textContent = hangarShip.toUpperCase(); $('hangar-skin-name').textContent = hangarSkin.toUpperCase();
  $('hangar-ship-description').textContent = base.description;
  $('hangar-stage-status').textContent = `${ownedShip ? 'NAVE ADQUIRIDA' : 'NAVE BLOQUEADA'} // ${ownedSkin ? 'COR ADQUIRIDA' : 'COR BLOQUEADA'}${palette.emissive ? ' // LUMINOSA' : ''}`;
  $('hangar-swatches').innerHTML = [palette.primary, palette.wing, palette.trim].map(color => `<i class="${palette.emissive ? 'emissive' : ''}" style="--swatch:#${color.toString(16).padStart(6, '0')};background:var(--swatch)"></i>`).join('');
  const purchases: string[] = [];
  if (!ownedShip) purchases.push(`<button data-buy="ship" ${progress.entropy < base.price ? 'disabled' : ''}>COMPRAR ${hangarShip.toUpperCase()} · ${base.price} ◆</button>`);
  if (!ownedSkin) purchases.push(`<button data-buy="skin" ${progress.entropy < palette.price ? 'disabled' : ''}>COMPRAR COR ${hangarSkin.toUpperCase()} · ${palette.price} ◆</button>`);
  $('hangar-purchases').innerHTML = purchases.length ? purchases.join('') : '<span class="hangar-equipped">NAVE E COR ADQUIRIDAS · PRONTAS PARA A PRÓXIMA MISSÃO</span>';
  const limits: Record<UpgradeKind, number> = { speed: 160, turn: 1.9, health: 600, armor: 20, damage: 3.2, fireRate: 3.2, shields: 10, laserLevel: 36 };
  $('hangar-attributes').innerHTML = UPGRADE_KEYS.map(key => {
    const current = progress.upgrades[hangarShip][key], cost = upgradeCost(current), maxed = current >= MAX_UPGRADE_LEVEL;
    const basePercent = Math.min(100, attributeMetric(base, key) / limits[key] * 100);
    const totalPercent = Math.min(100, attributeMetric(stats, key) / limits[key] * 100);
    const disabled = !ownedShip || maxed || progress.entropy < cost;
    const reason = !ownedShip ? 'Adquira a nave para melhorar' : maxed ? 'Nível máximo' : `Melhorar ${attributeLabels[key].toLowerCase()} por ${cost} pontos de entropia`;
    return `<div class="hangar-attribute"><div class="attribute-top"><span>${attributeLabels[key]}</span><strong>${attributeValue(stats, key)}</strong></div><div class="attribute-bottom"><div class="attribute-bar"><i style="width:${basePercent}%"></i><b style="left:${basePercent}%;width:${Math.max(0, totalPercent - basePercent)}%"></b></div><button data-upgrade="${key}" aria-label="${reason}" title="${reason}" ${disabled ? 'disabled' : ''}>+</button></div><div class="attribute-foot"><span>NÍVEL ${current}/${MAX_UPGRADE_LEVEL}</span><span>${maxed ? 'MÁXIMO' : `${cost} ◆`}</span></div></div>`;
  }).join('');
}
function cycleHangar(kind: 'ship' | 'skin', direction: number): void {
  if (kind === 'ship') {
    hangarShip = shipNames[(shipNames.indexOf(hangarShip) + direction + shipNames.length) % shipNames.length];
    if (progress.ownedShips.includes(hangarShip)) { selectShip(progress, hangarShip); replacePlayerShip(); }
  } else {
    hangarSkin = skinNames[(skinNames.indexOf(hangarSkin) + direction + skinNames.length) % skinNames.length];
    if (progress.ownedSkins.includes(hangarSkin)) { selectSkin(progress, hangarSkin); replacePlayerShip(); }
  }
  hangarPreview?.setShip(hangarShip, hangarSkin); renderHangar(); renderMenuStats();
}
function openHangar(): void {
  if (mode !== 'menu') return;
  hangarShip = progress.selectedShip; hangarSkin = progress.selectedSkin;
  $('hangar').classList.add('visible');
  hangarPreview ??= new HangarPreview($('hangar-canvas'));
  hangarPreview.resize(); hangarPreview.setShip(hangarShip, hangarSkin); renderHangar();
}
function closeHangar(): void { $('hangar').classList.remove('visible'); renderMenuStats(); }

function removeMine(index: number, explode = false): void {
  const mine = mines[index]; if (explode) burst(mine.mesh.position, 0x70ffcb, 25, 1);
  scene.remove(mine.mesh); disposeObject(mine.mesh); mines.splice(index, 1);
}
function mineHealthAtPhase(currentPhase: number): number {
  const rules = CONFIG.specialAI.mine;
  const steps = Math.floor(Math.max(0, currentPhase - 5) / rules.healthGrowthEveryPhases);
  return Math.min(rules.maxHealth, Math.round(laserDamage(1) * rules.baseLaser1Hits * rules.healthGrowthFactor ** steps)) * rules.healthMultiplier;
}
function beginMineDetonation(mine: Mine, fuse: number): void {
  if (mine.state === 'detonating') return;
  mine.state = 'detonating'; mine.fuse = fuse;
  mine.coreMaterial.color.setHex(0xff8a66);
  (mine.ring.material as THREE.MeshBasicMaterial).color.setHex(0xffbb72);
}
function spawnMine(enemy: Enemy): void {
  const rules = CONFIG.specialAI.mine;
  const towardPlayer = player.position.clone().sub(enemy.mesh.position).normalize();
  const position = enemy.mesh.position.clone().addScaledVector(towardPlayer, 5.5);
  if (position.distanceToSquared(player.position) < rules.minPlayerDistance ** 2) return;
  if (mines.some(mine => mine.mesh.position.distanceToSquared(position) < rules.spacing ** 2)) return;
  if (world.asteroids.some(asteroid => asteroid.mesh.position.distanceToSquared(position) < (asteroid.radius + 3) ** 2)) return;
  if (mines.length >= rules.maxCount) {
    const oldestSafe = mines.findIndex(mine => mine.state !== 'detonating');
    if (oldestSafe < 0) return;
    removeMine(oldestSafe);
  }
  const mesh = new THREE.Group(), coreMat = new THREE.MeshBasicMaterial({ color: 0x54f5c2, toneMapped: false });
  mesh.add(new THREE.Mesh(mineCoreGeo, coreMat));
  for (const direction of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)]) {
    const spike = new THREE.Mesh(mineSpikeGeo, coreMat); spike.position.copy(direction).multiplyScalar(1.08); spike.quaternion.setFromUnitVectors(localUp, direction); mesh.add(spike);
  }
  const ring = new THREE.Mesh(powerRingGeo, new THREE.MeshBasicMaterial({ color: 0x99ffd9, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  ring.scale.setScalar(0.75); mesh.add(ring);
  mesh.position.copy(position); scene.add(mesh);
  mines.push({ mesh, coreMaterial: coreMat, ring, age: 0, health: mineHealthAtPhase(phase), damage: enemyDamage(phase, 'miner'), state: 'arming', fuse: 0, hitFlash: 0 });
}
function updateMines(dt: number): void {
  const rules = CONFIG.specialAI.mine;
  for (let i = mines.length - 1; i >= 0; i--) {
    const mine = mines[i]; mine.age += dt; mine.hitFlash = Math.max(0, mine.hitFlash - dt);
    mine.mesh.rotation.y += dt * 1.4; mine.mesh.rotation.z += dt * 0.8;
    if (mine.state !== 'detonating' && (mine.age > rules.life || mine.mesh.position.distanceToSquared(player.position) > 470 ** 2)) { removeMine(i); continue; }
    const ringMat = mine.ring.material as THREE.MeshBasicMaterial;
    if (mine.state === 'arming' && mine.age >= rules.arm) mine.state = 'active';
    if (mine.state === 'active' && mine.mesh.position.distanceToSquared(player.position) < rules.triggerRadius ** 2) beginMineDetonation(mine, rules.proximityFuse);
    if (mine.state === 'detonating') {
      mine.fuse -= dt;
      mine.ring.scale.setScalar(rules.blastRadius / 1.38);
      ringMat.opacity = 0.45 + 0.4 * Math.abs(Math.sin(mine.fuse * 24));
      if (mine.fuse <= 0) {
        const inBlast = mine.mesh.position.distanceToSquared(player.position) < rules.blastRadius ** 2;
        if (inBlast) damagePlayer(mine.damage);
        removeMine(i, true); audio.explosion();
        if (mode !== 'playing') return;
      }
    } else if (mine.state === 'arming') {
      const progress = mine.age / rules.arm;
      mine.ring.scale.setScalar(0.75 + (rules.blastRadius / 1.38 - 0.75) * progress);
      ringMat.opacity = 0.12 + 0.16 * progress;
      mine.coreMaterial.color.setHex(mine.hitFlash > 0 ? 0xffffff : 0x54f5c2);
    } else {
      mine.ring.scale.setScalar(rules.blastRadius / 1.38);
      ringMat.opacity = 0.2 + 0.08 * Math.sin(mine.age * 5);
      mine.coreMaterial.color.setHex(mine.hitFlash > 0 ? 0xffffff : 0xa6ffbd);
    }
  }
}

function spawnPowerup(position?: THREE.Vector3): void {
  const roll = rng.next(); const kind: PowerKind = health < shipStats().baseHealth * 0.5 ? (roll < 0.38 ? 'health' : roll < 0.55 ? 'special' : roll < 0.77 ? 'shield' : 'laser') : (roll < 0.23 ? 'health' : roll < 0.4 ? 'special' : roll < 0.65 ? 'shield' : 'laser');
  const color = kind === 'health' ? 0x5dff9b : kind === 'special' ? 0xffd566 : kind === 'shield' ? 0x48e5ff : 0x897bff;
  const mesh = new THREE.Group(); const orb = new THREE.Mesh(powerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.58, toneMapped: false })); mesh.add(orb);
  const ring = new THREE.Mesh(powerRingGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false })); mesh.add(ring);
  const symbol = new THREE.Group(); const white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  if (kind === 'laser') { const shape = new THREE.Shape(); shape.moveTo(-0.2, 0.8); shape.lineTo(0.15, 0.1); shape.lineTo(0.52, 0.1); shape.lineTo(-0.25, -0.85); shape.lineTo(-0.05, -0.18); shape.lineTo(-0.45, -0.18); shape.closePath(); symbol.add(new THREE.Mesh(new THREE.ShapeGeometry(shape), white)); }
  else if (kind === 'shield') { const shape = new THREE.Shape(); shape.moveTo(0, 0.88); shape.lineTo(0.72, 0.55); shape.lineTo(0.61, -0.28); shape.quadraticCurveTo(0.45, -0.65, 0, -0.92); shape.quadraticCurveTo(-0.45, -0.65, -0.61, -0.28); shape.lineTo(-0.72, 0.55); shape.closePath(); const outline = new THREE.Mesh(new THREE.ShapeGeometry(shape), white); outline.scale.setScalar(0.75); symbol.add(outline); const inset = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0x12627c, toneMapped: false })); inset.scale.setScalar(0.52); inset.position.z = 0.02; symbol.add(inset); }
  else { const h = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 0.1), white), v = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.1), white); symbol.add(h, v); }
  mesh.add(symbol); const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(6, 6, 1); mesh.add(halo);
  mesh.position.copy(position ?? player.position.clone().add(rng.direction().multiplyScalar(rng.range(35, 65)))); scene.add(mesh); powerups.push({ mesh, kind, age: 0 });
}
function collectPowerup(p: PowerUp): void {
  const stats = shipStats();
  if (p.kind === 'health') { health = health > stats.baseHealth ? health : Math.min(stats.baseHealth, health + stats.healthPickup); announce(`INTEGRIDADE +${stats.healthPickup}`, 1.7); }
  else if (p.kind === 'special') { health = Math.min(stats.baseHealth + stats.extraHealth, health + stats.healthPickup); announce(`VIDA ESPECIAL +${stats.healthPickup}`, 1.7); }
  else if (p.kind === 'shield') { shields = Math.min(stats.shieldSlots, shields + 1); announce(shields === stats.shieldSlots ? 'ESCUDOS NO MÁXIMO' : 'ESCUDO +1', 1.7); }
  else { level = Math.min(stats.maxLaserLevel, level + 1); announce(`LASER NÍVEL ${String(level).padStart(2, '0')}`, 1.7); }
  score += ECONOMY.powerupPoints;
  burst(p.mesh.position, p.kind === 'health' ? 0x5dff9b : p.kind === 'special' ? 0xffd566 : p.kind === 'shield' ? 0x48e5ff : 0x897bff, 13, 0.5); audio.pickup();
}
function damagePlayer(amount: number): void {
  if (mode !== 'playing' || invuln > 0 || shieldProtection > 0) return;
  if (shields > 0) { shields--; shieldProtection = shipStats().shieldProtection; shieldFlash = 0.75; shieldAura.update(shieldProtection, gameTime); burst(player.position, 0x48e5ff, 14, 0.7); audio.hit(); announce(`ESCUDO ATIVO · ${shipStats().shieldProtection} SEGUNDOS DE PROTEÇÃO`, 2); return; }
  invuln = CONFIG.player.invulnerability;
  const applied = armoredDamage(amount, shipStats().armor);
  if (applied <= 0) { shieldFlash = 0.35; burst(player.position, 0x69d9ff, 7, 0.35); audio.hit(); return; }
  health = Math.max(0, health - applied); damageFlash = 0.65; burst(player.position, 0xff5670, 10, 0.6); audio.hit();
  if (health <= 0) gameOver();
}
function recordRun(label: string): number {
  const earned = finishRun(progress, score);
  $('last-run').textContent = `${label} · ${score.toLocaleString('pt-BR')} PONTOS · +${earned} ENTROPIA`;
  renderMenuStats();
  return earned;
}
function gameOver(): void {
  if (mode !== 'playing') return;
  mode = 'over'; audio.stopEngine(); audio.stopMusic(); audio.gameOver(); burst(player.position, 0xff7396, 55, 1.8); player.visible = false;
  $('pause-btn').classList.add('hidden');
  const earned = recordRun('ÚLTIMA PARTIDA');
  $('result-score').textContent = score.toLocaleString('pt-BR'); $('result-entropy').textContent = String(earned);
  $('game-over').classList.add('visible'); hud.classList.add('hidden');
  window.setTimeout(() => { if (mode === 'over') returnToMenu(); }, 1500);
}
function announce(message: string, seconds: number): void { $('notification').textContent = message; $('notification').classList.add('shown'); notificationTimer = seconds; }

function clearStage(): void {
  for (let i = enemies.length - 1; i >= 0; i--) removeEnemy(i, false);
  for (let i = mines.length - 1; i >= 0; i--) removeMine(i);
  for (const b of bullets) deactivateBullet(b);
  for (const p of powerups) { scene.remove(p.mesh); disposeObject(p.mesh); } powerups.length = 0;
  for (const p of particles) { p.active = false; p.mesh.visible = false; }
}
function returnToMenu(): void {
  audio.stopMusic(); audio.stopEngine();
  $('pause-btn').classList.add('hidden');
  shieldProtection = 0; invuln = 0; shieldAura.update(0, gameTime); showAbortConfirmation(false);
  clearStage(); world.shift(player.position); player.position.set(0, 0, 0); spatialFrame.reset(); world.reset(); player.quaternion.identity(); (player.userData.body as THREE.Group).rotation.set(0, 0, 0); player.visible = true;
  mode = 'menu'; $('game-over').classList.remove('visible'); $('pause').classList.remove('visible'); $('menu').classList.add('visible'); hud.classList.add('hidden');
  renderMenuStats();
}
function resetGame(): void {
  clearStage(); closeHangar();
  world.shift(player.position); player.position.set(0, 0, 0); spatialFrame.reset(); world.reset(); player.quaternion.identity(); (player.userData.body as THREE.Group).rotation.set(0, 0, 0); player.visible = true;
  health = shipStats().baseHealth; speed = CONFIG.player.cruiseSpeed; level = 1; kills = 0; phase = 1; phaseOffset = 0; score = 0; shields = 0; invuln = 0; shieldProtection = 0; shieldAura.update(0, 0); shootTimer = 0; enemySpawnTimer = 0; powerSpawnTimer = 0; shotSide = 0; harpiaMuzzleIndex = 0; gameTime = 0; damageFlash = 0; shieldFlash = 0; playerVelocity.set(0, 0, -speed); mouseX = mouseY = 0; orbitYaw = orbitPitch = 0; leftDown = rightDown = middleDown = firing = false;
  cameraRigQuat.identity(); camera.position.set(0, CONFIG.camera.height, CONFIG.camera.distance); camera.lookAt(0, 0, -CONFIG.camera.aimDistance); clockTarget.set(0, 0, -CONFIG.camera.aimDistance);
  mode = 'playing'; audio.startMusic(); $('pause-btn').classList.remove('hidden'); $('menu').classList.remove('visible'); $('pause').classList.remove('visible'); $('game-over').classList.remove('visible'); hud.classList.remove('hidden'); renderer.domElement.focus();
  for (let i = 0; i < 3; i++) spawnEnemy(); updateHud();
}
function showAbortConfirmation(visible: boolean): void { $('pause-actions').hidden = visible; $('abort-confirm').hidden = !visible; }
function abortMission(): void { if (mode !== 'paused' || $('abort-confirm').hidden) return; recordRun('MISSÃO ABORTADA'); returnToMenu(); }
// DEV CHEATS: remove this function together with the registration block below for final release.
function usePhaseCode(): void {
  if (mode !== 'paused' || !$('abort-confirm').hidden) return;
  const code = window.prompt('Código de fase (ex.: FASE+1 ou FASE5):');
  if (code === null) return;
  const target = phaseFromCheat(code, phase);
  if (target === null) { $('pause-message').textContent = 'Código inválido ou fase já alcançada.'; return; }
  phaseOffset = target - phaseForKills(kills);
  phase = target;
  for (let i = enemies.length - 1; i >= 0; i--) removeEnemy(i, false);
  for (let i = mines.length - 1; i >= 0; i--) removeMine(i);
  for (let i = 0; i < 3; i++) spawnEnemy();
  enemySpawnTimer = 0;
  $('pause-message').textContent = `Fase ${String(phase).padStart(2, '0')} ativada.`;
  announce(`FASE ${String(phase).padStart(2, '0')} · CÓDIGO ATIVADO`, 2.8);
  audio.phase();
  updateHud();
}
function setPaused(value: boolean): void { if (value && mode === 'playing') { mode = 'paused'; showAbortConfirmation(false); $('pause-message').textContent = 'Pressione Esc para retomar o voo.'; $('pause-btn').classList.add('hidden'); $('pause').classList.add('visible'); audio.stopEngine(); audio.pauseMusic(); leftDown = rightDown = firing = false; if (touchMode) mouseX = mouseY = 0; } else if (!value && mode === 'paused') { mode = 'playing'; showAbortConfirmation(false); $('pause-btn').classList.remove('hidden'); audio.resumeMusic(); $('pause').classList.remove('visible'); lastTime = performance.now(); } }

function updatePlayer(dt: number): void {
  const nx = Math.max(-1, Math.min(1, mouseX)), ny = Math.max(-1, Math.min(1, mouseY));
  if (!middleDown) {
    const turnRate = CONFIG.player.turnRate * shipStats().turnMultiplier;
    qYaw.setFromAxisAngle(localUp, -nx * turnRate * dt); qPitch.setFromAxisAngle(localRight, -ny * turnRate * dt);
    player.quaternion.multiply(qYaw).multiply(qPitch).normalize();
    const body = player.userData.body as THREE.Group; body.rotation.z += ((-nx * 0.42) - body.rotation.z) * Math.min(1, dt * 5); body.rotation.x += ((-ny * 0.08) - body.rotation.x) * Math.min(1, dt * 5);
  } else { orbitYaw *= 1; }
  const maxSpeed = shipStats().maxSpeed;
  const desired = leftDown ? maxSpeed : rightDown ? CONFIG.player.minSpeed : CONFIG.player.cruiseSpeed;
  const rate = rightDown ? CONFIG.player.braking : leftDown ? CONFIG.player.acceleration : 18; speed += Math.sign(desired - speed) * Math.min(Math.abs(desired - speed), rate * dt);
  forward.copy(localForward).applyQuaternion(player.quaternion); playerVelocity.lerp(temp2.copy(forward).multiplyScalar(speed), 1 - Math.exp(-dt * 6)); player.position.addScaledVector(playerVelocity, dt);
  if (player.position.length() > CONFIG.world.originShift) { const offset = player.position.clone(); spatialFrame.shift(offset); player.position.set(0, 0, 0); camera.position.sub(offset); clockTarget.sub(offset); world.shift(offset); for (const e of enemies) { e.mesh.position.sub(offset); e.patrolAnchor.sub(offset); e.patrolTarget.sub(offset); } for (const b of bullets) b.mesh.position.sub(offset), b.previous.sub(offset); for (const p of powerups) p.mesh.position.sub(offset); for (const mine of mines) mine.mesh.position.sub(offset); for (const p of particles) p.mesh.position.sub(offset); }
  if (invuln > 0) invuln = Math.max(0, invuln - dt);
  if (shieldProtection > 0) shieldProtection = Math.max(0, shieldProtection - dt);
  shieldAura.update(shieldProtection, gameTime);
  player.visible = invuln > 0 ? Math.floor(gameTime * 20) % 2 === 0 : true;
  audio.engineSound(speed / maxSpeed);
}
function updateCamera(dt: number): void {
  if (!middleDown) { const k = 1 - Math.exp(-dt * CONFIG.camera.orbitReturn); orbitYaw += (0 - orbitYaw) * k; orbitPitch += (0 - orbitPitch) * k; }
  cameraRigQuat.slerp(player.quaternion, 1 - Math.exp(-dt * CONFIG.camera.rotationFollow));
  const boost = (speed - CONFIG.player.cruiseSpeed) / (shipStats().maxSpeed - CONFIG.player.cruiseSpeed);
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
    shootTimer += 1 / (CONFIG.laser.rate * shipStats().fireRateMultiplier);
    const converge = new THREE.Vector3(0, 0, -CONFIG.laser.convergence).applyQuaternion(player.quaternion).add(player.position);
    let localMuzzle: THREE.Vector3;
    if (shipStats().muzzleCount === 4) {
      const muzzles = player.userData.muzzles as THREE.Vector3[];
      localMuzzle = muzzles[harpiaMuzzleIndex];
      harpiaMuzzleIndex = (harpiaMuzzleIndex + 1) % muzzles.length;
    } else {
      shotSide = 1 - shotSide;
      localMuzzle = new THREE.Vector3((shotSide ? 1 : -1) * (player.userData.muzzleX as number), -0.14, player.userData.muzzleZ as number);
    }
    const muzzle = localMuzzle.clone().applyQuaternion(player.quaternion).add(player.position);
    const dir = converge.clone().sub(muzzle).normalize();
    spawnBullet(muzzle, dir, true, laserDamage(level) * shipStats().damageMultiplier, laserColor(level, shipStats().maxLaserLevel), playerVelocity);
    audio.shot();
  }
}
function avoidObstacles(enemy: Enemy): THREE.Vector3 {
  const avoidance = new THREE.Vector3(), lookahead = 0.7;
  const selfFuture = enemy.mesh.position.clone().addScaledVector(enemy.velocity, lookahead);
  const radius = ENEMY_STATS[enemy.kind].radius;
  const steer = (position: THREE.Vector3, velocity: THREE.Vector3, clearance: number): void => {
    const future = position.clone().addScaledVector(velocity, lookahead);
    const offset = selfFuture.clone().sub(future);
    const distance = offset.length();
    if (distance >= clearance) return;
    if (distance < 0.001) offset.set(Math.sin(enemy.seed), Math.cos(enemy.seed), 0);
    avoidance.addScaledVector(offset.normalize(), (1 - distance / clearance) ** 2);
  };
  for (const other of enemies) if (other !== enemy) steer(other.mesh.position, other.velocity, radius + ENEMY_STATS[other.kind].radius + 14);
  for (const asteroid of world.asteroids) steer(asteroid.mesh.position, asteroid.velocity, radius + asteroid.radius + 11);
  return avoidance;
}
function separateEnemy(enemy: Enemy): void {
  const position = enemy.mesh.position, radius = ENEMY_STATS[enemy.kind].radius;
  const separate = (other: THREE.Vector3, clearance: number): void => {
    const offset = position.clone().sub(other);
    const distance = offset.length();
    if (distance >= clearance) return;
    if (distance < 0.001) offset.set(Math.sin(enemy.seed), Math.cos(enemy.seed), 0);
    offset.normalize(); position.addScaledVector(offset, clearance - distance);
    const inward = enemy.velocity.dot(offset);
    if (inward < 0) enemy.velocity.addScaledVector(offset, -inward);
  };
  for (const other of enemies) if (other !== enemy) separate(other.mesh.position, radius + ENEMY_STATS[other.kind].radius + 0.5);
  for (const asteroid of world.asteroids) separate(asteroid.mesh.position, radius + asteroid.radius + 0.5);
}
function setSpecialState(enemy: Enemy, state: AIState, duration = 0): void {
  enemy.state = state; enemy.stateTime = 0; enemy.stateDuration = duration;
}
function interceptDirection(enemy: Enemy, speed: number, maxLead: number): THREE.Vector3 {
  const relative = player.position.clone().sub(enemy.mesh.position);
  const a = playerVelocity.lengthSq() - speed * speed;
  const b = 2 * relative.dot(playerVelocity);
  const c = relative.lengthSq();
  let lead = Math.min(maxLead, Math.sqrt(c) / speed);
  const discriminant = b * b - 4 * a * c;
  if (discriminant >= 0 && Math.abs(a) > 0.0001) {
    const root = Math.sqrt(discriminant);
    const first = (-b - root) / (2 * a), second = (-b + root) / (2 * a);
    const earliest = Math.min(first > 0 ? first : Infinity, second > 0 ? second : Infinity);
    if (Number.isFinite(earliest)) lead = Math.min(maxLead, earliest);
  }
  return relative.addScaledVector(playerVelocity, lead).normalize();
}
function hammerChargeAim(enemy: Enemy): { direction: THREE.Vector3; distance: number; lead: number } {
  const rules = CONFIG.specialAI.hammer;
  const relative = player.position.clone().sub(enemy.mesh.position);
  const a = playerVelocity.lengthSq() - rules.chargeSpeed ** 2;
  const b = 2 * relative.dot(playerVelocity);
  const c = relative.lengthSq();
  let time = Infinity;
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) > 1e-6) time = -c / b;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      time = Math.min(...[(-b - root) / (2 * a), (-b + root) / (2 * a)].filter(t => t >= 0));
    }
  }
  if (!Number.isFinite(time) || time < 0) time = Math.sqrt(c) / rules.chargeSpeed;
  const lead = Math.min(rules.maxLead, time);
  const aim = relative.addScaledVector(playerVelocity, lead);
  const distance = aim.length();
  const direction = distance > 1e-6 ? aim.divideScalar(distance) : localForward.clone().applyQuaternion(enemy.mesh.quaternion);
  return { direction, distance, lead };
}
function chargePathClear(enemy: Enemy, direction: THREE.Vector3, distance: number): boolean {
  const end = enemy.mesh.position.clone().addScaledVector(direction, distance);
  const radius = ENEMY_STATS[enemy.kind].radius;
  for (const asteroid of world.asteroids) if (segmentHit(enemy.mesh.position, end, asteroid.mesh.position, radius + asteroid.radius + 2)) return false;
  for (const other of enemies) if (other !== enemy && segmentHit(enemy.mesh.position, end, other.mesh.position, radius + ENEMY_STATS[other.kind].radius + 1)) return false;
  return true;
}
function updateEnemies(dt: number): void {
  const sorted = enemies.filter(e => e.engaged && e.kind !== 'miner' && e.kind !== 'hammer').map(e => ({ e, d: e.mesh.position.distanceToSquared(player.position) })).sort((a, b) => a.d - b.d);
  const attackSet = new Set(sorted.slice(0, CONFIG.enemy.attackSlots + Math.floor((phase - 1) / 4)).map(x => x.e));
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], stats = ENEMY_STATS[e.kind]; const distance = e.mesh.position.distanceTo(player.position);
    if (distance > CONFIG.enemy.despawn) { removeEnemy(i, false); continue; }
    e.stateTime += dt; e.cooldown -= dt; e.patrolTimer -= dt; e.hitFlash = Math.max(0, e.hitFlash - dt);
    const disengage = e.kind === 'pursuer' ? CONFIG.specialAI.pursuer.disengageDistance : CONFIG.enemy.disengageDistance;
    if (e.engaged && distance >= disengage) {
      e.engaged = false; e.patrolAnchor.copy(e.mesh.position); e.patrolTimer = 0;
    } else if (!e.engaged && distance <= CONFIG.enemy.detectDistance) {
      e.engaged = true; e.stateTime = 0;
    }
    let desired: THREE.Vector3, targetSpeed = stats.speed, turnRate = stats.turn, useAvoidance = true;
    if (!e.engaged) {
      e.state = 'patrol';
      if (e.patrolTimer <= 0 || e.mesh.position.distanceToSquared(e.patrolTarget) < 10 ** 2) {
        e.patrolTarget.copy(e.patrolAnchor).add(rng.direction().multiplyScalar(rng.range(18, CONFIG.enemy.patrolRadius)));
        e.patrolTimer = rng.range(4, 8);
      }
      desired = e.patrolTarget.clone().sub(e.mesh.position).normalize();
      targetSpeed = stats.speed * CONFIG.enemy.patrolSpeed;
    } else if (e.kind === 'miner') {
      e.state = 'flee'; desired = e.mesh.position.clone().sub(player.position).normalize();
      desired.add(new THREE.Vector3(Math.sin(e.seed + gameTime * 0.9), Math.cos(e.seed + gameTime * 0.7), Math.sin(e.seed * 0.3 + gameTime * 0.5)).multiplyScalar(0.23)).normalize();
      targetSpeed = 55;
    } else if (e.kind === 'hammer') {
      const rules = CONFIG.specialAI.hammer;
      if (!e.state.startsWith('hammer')) setSpecialState(e, 'hammerApproach');
      if (e.state === 'hammerApproach') {
        const aim = hammerChargeAim(e);
        const aligned = localForward.clone().applyQuaternion(e.mesh.quaternion).dot(aim.direction) >= rules.alignment;
        if (distance >= rules.chargeMinDistance && distance <= rules.chargeMaxDistance && aligned && chargePathClear(e, aim.direction, Math.min(rules.chargeSpeed * rules.charge, aim.distance + 12))) setSpecialState(e, 'hammerPrepare', rules.prepare);
      }
      if (e.state === 'hammerPrepare' && e.stateTime >= e.stateDuration) {
        const aim = hammerChargeAim(e);
        if (chargePathClear(e, aim.direction, Math.min(rules.chargeSpeed * rules.charge, aim.distance + 12))) {
          e.lockedDirection.copy(aim.direction); e.specialHit = false;
          setSpecialState(e, 'hammerCharge', rules.charge);
        } else setSpecialState(e, 'hammerApproach');
      }
      if (e.state === 'hammerCharge' && e.stateTime >= e.stateDuration) setSpecialState(e, 'hammerRecover', rules.recover);
      if (e.state === 'hammerRecover' && e.stateTime >= e.stateDuration) setSpecialState(e, 'hammerApproach');
      if (e.state === 'hammerApproach') {
        desired = hammerChargeAim(e).direction; targetSpeed = rules.approachSpeed;
      } else if (e.state === 'hammerPrepare') {
        desired = hammerChargeAim(e).direction; targetSpeed = rules.prepareSpeed;
      } else if (e.state === 'hammerCharge') {
        desired = e.lockedDirection.clone(); targetSpeed = rules.chargeSpeed; turnRate = rules.chargeTurn; useAvoidance = false;
      } else {
        desired = hammerChargeAim(e).direction.addScaledVector(localRight.clone().applyQuaternion(e.mesh.quaternion), e.orbitSign * 0.8).normalize();
        targetSpeed = rules.recoverSpeed;
      }
    } else if (e.kind === 'pursuer') {
      const rules = CONFIG.specialAI.pursuer;
      if (!e.state.startsWith('pursuer')) setSpecialState(e, 'pursuerIntercept');
      if (e.state === 'pursuerIntercept' && distance <= rules.attackRange && localForward.clone().applyQuaternion(e.mesh.quaternion).dot(player.position.clone().sub(e.mesh.position).normalize()) >= rules.alignment) {
        setSpecialState(e, 'pursuerAttack', rules.attackDuration + rng.range(-rules.timerJitter, rules.timerJitter));
      }
      if (e.state === 'pursuerAttack' && e.stateTime >= e.stateDuration) {
        e.lockedDirection.copy(interceptDirection(e, rules.maxSpeed, 0.5));
        setSpecialState(e, 'pursuerPass', rules.passDuration + rng.range(-rules.timerJitter, rules.timerJitter));
      }
      if (e.state === 'pursuerPass' && e.stateTime >= e.stateDuration) setSpecialState(e, 'pursuerReposition', rules.repositionDuration + rng.range(-rules.timerJitter, rules.timerJitter));
      if (e.state === 'pursuerReposition' && e.stateTime >= e.stateDuration) setSpecialState(e, 'pursuerIntercept');
      if (e.state === 'pursuerIntercept') {
        desired = interceptDirection(e, rules.maxSpeed, 0.8); targetSpeed = distance > 35 ? rules.maxSpeed : 70;
      } else if (e.state === 'pursuerAttack') {
        desired = player.position.clone().sub(e.mesh.position).normalize();
        targetSpeed = distance > 35 ? rules.maxSpeed : 70; turnRate = rules.attackTurn;
      } else if (e.state === 'pursuerPass') {
        desired = e.lockedDirection.clone(); targetSpeed = rules.maxSpeed; turnRate = e.stateTime < rules.passAlignTime ? rules.passTurn : 0; useAvoidance = false;
      } else {
        desired = player.position.clone().sub(e.mesh.position).normalize().addScaledVector(localRight.clone().applyQuaternion(e.mesh.quaternion), e.orbitSign * 0.9).addScaledVector(e.lockedDirection, 0.2).normalize();
        targetSpeed = rules.repositionSpeed; turnRate = rules.repositionTurn;
      }
    } else {
      if (e.stateTime < 0.45) e.state = 'detect'; else if (distance > 55) e.state = 'pursue'; else if (distance < 25) e.state = 'reposition'; else if (e.health < enemyHealth(phase, e.kind) * 0.35 && e.kind === 'interceptor' && Math.sin(gameTime * 2 + e.seed) > 0.25) e.state = 'evade'; else e.state = 'combat';
      desired = player.position.clone().sub(e.mesh.position).normalize();
      if (e.state === 'evade' || e.state === 'reposition') desired.addScaledVector(new THREE.Vector3(Math.sin(e.seed + gameTime * 1.7), Math.cos(e.seed + gameTime * 1.3), 0).applyQuaternion(e.mesh.quaternion), e.state === 'evade' ? 1.4 : 0.8).normalize();
      targetSpeed = stats.speed * (e.state === 'combat' ? 0.7 : 1);
    }
    if (useAvoidance) {
      const avoidance = avoidObstacles(e);
      if (avoidance.lengthSq() > 0) desired.addScaledVector(avoidance, 4.5).normalize();
    }
    targetQuat.setFromUnitVectors(localForward, desired);
    if (e.kind === 'hammer' || e.kind === 'pursuer') e.mesh.quaternion.rotateTowards(targetQuat, dt * turnRate);
    else e.mesh.quaternion.slerp(targetQuat, Math.min(1, dt * turnRate));
    const forwardEnemy = localForward.clone().applyQuaternion(e.mesh.quaternion);
    e.velocity.lerp(forwardEnemy.multiplyScalar(targetSpeed), 1 - Math.exp(-dt * 2.2)); e.mesh.position.addScaledVector(e.velocity, dt); separateEnemy(e);
    e.mesh.children.forEach(child => { if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) child.material.emissiveIntensity = e.hitFlash > 0 ? 1.8 : 0.48; });
    if (e.warning) {
      e.warning.visible = e.state === 'hammerPrepare' || e.state === 'hammerCharge';
      if (e.warning.visible) {
        const material = e.warning.material as THREE.MeshBasicMaterial;
        material.color.setHex(e.state === 'hammerCharge' ? 0xff5e53 : 0xffbb65);
        material.opacity = e.state === 'hammerCharge' ? 0.82 : 0.3 + 0.5 * Math.abs(Math.sin(e.stateTime * 11));
      }
    }
    if (e.kind === 'miner' && e.engaged && e.cooldown <= 0) { spawnMine(e); e.cooldown = Math.max(1.35, stats.cooldown - Math.min(0.7, (phase - 5) * 0.06)) + rng.range(-0.2, 0.4); }
    if (attackSet.has(e) && (e.state === 'combat' || e.state === 'pursue' || e.state === 'pursuerAttack') && distance < 110 && e.cooldown <= 0) {
      e.cooldown = stats.cooldown / Math.min(1.8, 1 + (phase - 1) * 0.05) + rng.range(-0.25, 0.4);
      const aim = player.position.clone().addScaledVector(playerVelocity, distance / 95 * (0.58 + Math.min(0.3, phase * 0.025)));
      aim.add(rng.direction().multiplyScalar(Math.max(2.5, 11 - phase * 0.4) * (e.kind === 'bomber' ? 1.2 : 1)));
      const dir = aim.sub(e.mesh.position).normalize(); spawnBullet(e.mesh.position.clone().addScaledVector(dir, stats.radius + 1), dir, false, enemyDamage(phase, e.kind), stats.color, e.velocity);
    }
    if (distance < stats.radius + CONFIG.player.radius && invuln <= 0 && shieldProtection <= 0) {
      if (e.kind === 'hammer') {
        if (!e.specialHit) { e.specialHit = true; damagePlayer(Math.max(2, enemyDamage(phase, e.kind))); setSpecialState(e, 'hammerRecover', CONFIG.specialAI.hammer.recover); }
      } else damagePlayer(Math.max(2, enemyDamage(phase, e.kind)));
      if (mode !== 'playing') return;
    }
  }
}
function updateBullets(dt: number): void {
  for (const b of bullets) { if (mode !== 'playing') return; if (!b.active) continue; b.previous.copy(b.mesh.position); b.mesh.position.addScaledVector(b.velocity, dt); b.distance += b.velocity.length() * dt;
    if (b.distance > (b.friendly ? CONFIG.laser.range : 260)) { deactivateBullet(b); continue; }
    if (b.friendly) {
      let hit = false;
      for (let i = enemies.length - 1; i >= 0; i--) { const e = enemies[i]; if (segmentHit(b.previous, b.mesh.position, e.mesh.position, ENEMY_STATS[e.kind].radius + b.radius)) { e.health -= b.damage; e.hitFlash = 0.11; burst(b.mesh.position, ENEMY_STATS[e.kind].color, 5, 0.35); audio.hit(); if (e.health <= 0) removeEnemy(i, true); hit = true; break; } }
      if (!hit) for (let i = mines.length - 1; i >= 0; i--) {
        const mine = mines[i]; if (mine.state === 'detonating') continue;
        if (segmentHit(b.previous, b.mesh.position, mine.mesh.position, 1.75 + b.radius)) {
          mine.health -= b.damage; mine.hitFlash = 0.12;
          if (mine.health <= 0) beginMineDetonation(mine, CONFIG.specialAI.mine.laserFuse);
          audio.hit(); hit = true; break;
        }
      }
      if (!hit) for (const a of world.asteroids) if (segmentHit(b.previous, b.mesh.position, a.mesh.position, a.radius + b.radius)) { a.health -= b.damage; burst(b.mesh.position, 0xa0bbd6, 5, 0.35); if (a.health <= 0) { burst(a.mesh.position, 0xa0bbd6, 19, a.radius / 5); score += ECONOMY.asteroidPoints; world.destroyAsteroid(a, player.position); } hit = true; break; }
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
function updateAsteroidCollisions(): void {
  for (let i = world.asteroids.length - 1; i >= 0; i--) {
    const a = world.asteroids[i];
    if (a.mesh.position.distanceToSquared(player.position) >= (a.radius + CONFIG.player.radius * 0.7) ** 2 || invuln > 0 || shieldProtection > 0) continue;
    damagePlayer(Math.round(a.radius * 1.3)); if (mode !== 'playing') return;
    a.health -= 4;
    if (a.health <= 0) { score += ECONOMY.asteroidPoints; world.destroyAsteroid(a, player.position); }
  }
}

function updateHud(): void {
  const stats = shipStats(), color = laserColor(level, stats.maxLaserLevel);
  $('health-value').textContent = String(Math.ceil(health)); $('health-normal').style.width = `${Math.min(100, health / stats.baseHealth * 100)}%`; $('health-extra').style.width = `${Math.max(0, (health - stats.baseHealth) / stats.extraHealth * 100)}%`;
  $('shield-value').textContent = `${'◆ '.repeat(shields)}${'◇ '.repeat(stats.shieldSlots - shields)}`.trim();
  const damage = laserDamage(level) * stats.damageMultiplier;
  $('laser-level').textContent = String(level).padStart(2, '0'); $('laser-max').textContent = ` / ${stats.maxLaserLevel}`; $('laser-level').style.color = `#${color.toString(16).padStart(6, '0')}`; $('laser-damage').textContent = `${compactDamage.format(damage)} DMG`; $('laser-damage').title = `${damage.toLocaleString('pt-BR')} de dano por disparo`; $('laser-fill').style.width = `${level / stats.maxLaserLevel * 100}%`; $('laser-fill').style.background = `#${color.toString(16).padStart(6, '0')}`;
  $('phase-value').textContent = String(phase).padStart(2, '0'); $('kills-value').textContent = `${kills % CONFIG.phaseKills} / ${CONFIG.phaseKills} ELIMINAÇÕES`; $('total-kills').textContent = `TOTAL ${kills}`; $('phase-fill').style.width = `${kills % CONFIG.phaseKills / CONFIG.phaseKills * 100}%`;
  $('score-value').textContent = score.toLocaleString('pt-BR');
  const coordinates = symbolicCoordinates(spatialFrame.toGlobal(player.position));
  $('coordinate-r').textContent = formatCoordinate(coordinates.spiral); $('coordinate-g').textContent = formatCoordinate(coordinates.knot); $('coordinate-b').textContent = formatCoordinate(coordinates.rune);
  $('speed-value').textContent = String(Math.round(speed)).padStart(3, '0'); $('throttle-indicator').textContent = leftDown ? 'ACELERANDO' : rightDown ? 'FREANDO' : 'CRUZEIRO'; $('throttle-indicator').className = leftDown ? 'boost' : rightDown ? 'brake' : '';
  $('damage-flash').classList.toggle('shield', shieldFlash > damageFlash);
  $('damage-flash').style.opacity = String(Math.max(0, damageFlash, shieldFlash));
  const point = player.position.clone().addScaledVector(forward, CONFIG.laser.convergence).project(camera);
  const reticle = $('reticle'); reticle.style.left = `${(point.x * 0.5 + 0.5) * innerWidth}px`; reticle.style.top = `${(-point.y * 0.5 + 0.5) * innerHeight}px`;
  const threats = $('threats'); threats.replaceChildren(); let shown = 0;
  for (const e of enemies) { if (shown >= 6) break; const screen = e.mesh.position.clone().project(camera); if (screen.z > 1 || Math.abs(screen.x) > 0.88 || Math.abs(screen.y) > 0.82) { const x = Math.max(32, Math.min(innerWidth - 32, (screen.x * 0.5 + 0.5) * innerWidth)); const y = Math.max(62, Math.min(innerHeight - 65, (-screen.y * 0.5 + 0.5) * innerHeight)); const mark = document.createElement('div'); mark.className = 'threat'; mark.style.left = `${x}px`; mark.style.top = `${y}px`; mark.textContent = '◆'; threats.appendChild(mark); shown++; } }
}
function tick(dt: number): void {
  gameTime += dt; updatePlayer(dt); updateCamera(dt); shootPlayer(dt); updateEnemies(dt); if (mode !== 'playing') return;
  updateBullets(dt); if (mode !== 'playing') return;
  updateMines(dt); if (mode !== 'playing') return;
  updatePowerups(dt); updateParticles(dt); updateAsteroidCollisions(); if (mode !== 'playing') return;
  world.update(dt, player.position);
  enemySpawnTimer += dt; if (enemySpawnTimer >= CONFIG.enemy.spawnInterval) { enemySpawnTimer = 0; spawnEnemy(); }
  audio.updateMusic({
    speedRatio: speed / shipStats().maxSpeed,
    phase,
    healthRatio: health / shipStats().baseHealth,
    firing: firing || touchMode,
    nearbyEnemies: enemies.reduce((count, enemy) => count + Number(enemy.mesh.position.distanceToSquared(player.position) < 10000), 0),
  });
  damageFlash = Math.max(0, damageFlash - dt * 1.55); shieldFlash = Math.max(0, shieldFlash - dt * 1.9); notificationTimer -= dt; if (notificationTimer <= 0) $('notification').classList.remove('shown');
}
function frame(now: number): void { requestAnimationFrame(frame); const delta = Math.min((now - lastTime) / 1000, 0.1); lastTime = now; const hangarOpen = !!hangarPreview && $('hangar').classList.contains('visible');
  if (mode === 'playing') { accumulated += delta; let steps = 0; while (mode === 'playing' && accumulated >= CONFIG.fixedStep && steps++ < 5) { tick(CONFIG.fixedStep); accumulated -= CONFIG.fixedStep; } if (steps >= 5) accumulated = 0; if (mode === 'playing') updateHud(); }
  else if (mode === 'menu' && !hangarOpen) { player.rotation.y += delta * 0.08; player.position.y = Math.sin(now * 0.0007) * 0.18; camera.position.set(12, 7, 20); camera.lookAt(0, 0, 0); world.update(delta, spatialZero); }
  else if (mode === 'over') updateParticles(delta);
  if (hangarOpen) hangarPreview!.render(delta);
  else renderer.render(scene, camera);
}
requestAnimationFrame(frame);

renderer.domElement.tabIndex = 0;
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8)); hangarPreview?.resize(); });
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
window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); if (mode === 'playing') firing = true; } if (e.code === 'Escape') { e.preventDefault(); if ($('hangar').classList.contains('visible')) closeHangar(); else if (mode === 'playing') setPaused(true); else if (mode === 'paused' && !$('abort-confirm').hidden) showAbortConfirmation(false); else if (mode === 'paused') setPaused(false); } });
window.addEventListener('keyup', e => { if (e.code === 'Space') { e.preventDefault(); firing = false; } });
window.addEventListener('blur', () => { if (mode === 'playing') setPaused(true); });
$('start-btn').addEventListener('click', resetGame); $('restart-btn').addEventListener('click', returnToMenu); $('resume-btn').addEventListener('click', () => setPaused(false));
$('pause-btn').addEventListener('click', () => setPaused(true));
$('abort-btn').addEventListener('click', () => { if (mode === 'paused') showAbortConfirmation(true); });
$('abort-cancel-btn').addEventListener('click', () => showAbortConfirmation(false));
$('abort-yes-btn').addEventListener('click', abortMission);
$('hangar-btn').addEventListener('click', openHangar); $('hangar-close').addEventListener('click', closeHangar);
// DEV CHEATS: switch DEV_CHEATS_ENABLED off, then remove this block and src/devCheats.ts for final release.
if (DEV_CHEATS_ENABLED) {
  installDevCheatGesture($('hangar-entropy'), () => {
    if (!$('hangar').classList.contains('visible')) return;
    const code = window.prompt('Código de teste:');
    if (code === null) return;
    if (redeemEntropyCode(progress, code)) { renderHangar(); renderMenuStats(); $('hangar-stage-status').textContent = 'CÓDIGO ACEITO · +5.000 PONTOS DE ENTROPIA'; }
    else $('hangar-stage-status').textContent = 'CÓDIGO INVÁLIDO';
  });
  installDevCheatGesture($('pause-heading'), usePhaseCode);
}
$('hangar').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button || button.disabled) return;
  if (button.dataset.cycle === 'ship' || button.dataset.cycle === 'skin') { cycleHangar(button.dataset.cycle, Number(button.dataset.dir)); return; }
  if (button.dataset.buy === 'ship') { if (buyShip(progress, hangarShip)) { replacePlayerShip(); renderHangar(); renderMenuStats(); } return; }
  if (button.dataset.buy === 'skin') { if (buySkin(progress, hangarSkin)) { replacePlayerShip(); renderHangar(); renderMenuStats(); } return; }
  if (button.dataset.upgrade && UPGRADE_KEYS.includes(button.dataset.upgrade as UpgradeKind)) {
    if (purchaseUpgrade(progress, hangarShip, button.dataset.upgrade as UpgradeKind)) { activeShipStats = getShipStats(progress, progress.selectedShip); renderHangar(); renderMenuStats(); }
  }
});
$('mute-btn').addEventListener('click', () => { audio.setMuted(!audio.muted); $('mute-btn').textContent = audio.muted ? '♪̸' : '♪'; $('mute-btn').setAttribute('aria-label', audio.muted ? 'Ativar áudio' : 'Silenciar áudio'); });
renderMenuStats();
