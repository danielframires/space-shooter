import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import ts from 'typescript';
import { CONFIG, ENEMY_STATS, enemyDamage, enemyHealth, laserDamage } from '../src/config.ts';
import { armoredDamage } from '../src/economy.ts';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
function section(from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, 'Seção de produção encontrada: ' + from);
  return source.slice(start, end);
}
const logic = ts.transpileModule([
  section('function segmentHit(', 'function makeParticle('),
  section('function damagePlayer(', 'function recordRun('),
  section('function removeMine(', 'function spawnPowerup('),
  section('function avoidObstacles(', 'function updatePowerups('),
].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function makeRng(seed = 73129) {
  return {
    state: seed >>> 0,
    next() { let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state = x >>> 0; return this.state / 4294967296; },
    range(a, b) { return a + (b - a) * this.next(); },
    direction() { const z = this.range(-1, 1), angle = this.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z); return new THREE.Vector3(r * Math.cos(angle), r * Math.sin(angle), z); },
  };
}
function makeContext(seed = 73129) {
  const ctx = {
    THREE, CONFIG, ENEMY_STATS, enemyDamage, enemyHealth, laserDamage, armoredDamage,
    player: new THREE.Group(), playerVelocity: new THREE.Vector3(),
    enemies: [], mines: [], bullets: [], world: { asteroids: [] }, scene: new THREE.Scene(),
    rng: makeRng(seed), phase: 5, gameTime: 0, mode: 'playing', invuln: 0, shieldProtection: 0, health: 1e9, shields: 0, shipArmor: 0, shieldFlash: 0, damageFlash: 0,
    localForward: new THREE.Vector3(0, 0, -1), localRight: new THREE.Vector3(1, 0, 0), localUp: new THREE.Vector3(0, 1, 0),
    targetQuat: new THREE.Quaternion(), temp: new THREE.Vector3(), temp3: new THREE.Vector3(),
    powerRingGeo: new THREE.TorusGeometry(1.38, 0.055, 5, 28),
    mineCoreGeo: new THREE.IcosahedronGeometry(0.85, 0),
    mineSpikeGeo: new THREE.ConeGeometry(0.22, 0.78, 5),
    currentDamageSource: 'other',
    metrics: { enemyShots: 0, bulletHits: 0, contactHits: 0, mineHits: 0, damage: 0, mineLaserHits: 0, explosions: 0, minesSpawned: 0, maxMines: 0 },
  };
  ctx.audio = { shot() {}, hit() { if (ctx.currentDamageSource === 'bullet') ctx.metrics.mineLaserHits++; }, explosion() { ctx.metrics.explosions++; } };
  ctx.burst = () => {};
  ctx.announce = () => {};
  ctx.shieldAura = { update() {} };
  ctx.shipStats = () => ({ armor: ctx.shipArmor, shieldProtection: 3 });
  ctx.gameOver = () => { ctx.mode = 'over'; };
  ctx.disposeObject = () => {};
  ctx.removeEnemy = i => { ctx.enemies.splice(i, 1); };
  ctx.deactivateBullet = b => { b.active = false; };
  ctx.spawnBullet = (origin, direction, friendly, damage, color, inherited) => {
    const mesh = new THREE.Group(); mesh.position.copy(origin);
    const velocity = direction.clone().multiplyScalar(friendly ? CONFIG.laser.speed : 95).add(inherited);
    ctx.bullets.push({ mesh, velocity, previous: origin.clone(), distance: 0, damage, friendly, radius: friendly ? CONFIG.laser.hitRadius : 0.7, active: true });
    if (!friendly) ctx.metrics.enemyShots++;
  };
  vm.createContext(ctx);
  vm.runInContext(logic, ctx);
  const productionDamagePlayer = ctx.damagePlayer;
  ctx.damagePlayer = amount => {
    const priorHealth = ctx.health, priorShields = ctx.shields;
    productionDamagePlayer(amount);
    if (ctx.health === priorHealth && ctx.shields === priorShields) return;
    ctx.metrics.damage += priorHealth - ctx.health;
    if (ctx.currentDamageSource === 'bullet') ctx.metrics.bulletHits++;
    else if (ctx.currentDamageSource === 'mine') ctx.metrics.mineHits++;
    else ctx.metrics.contactHits++;
  };
  const originalSpawnMine = ctx.spawnMine;
  ctx.spawnMine = enemy => { const before = ctx.mines.length; originalSpawnMine(enemy); if (ctx.mines.length > before) ctx.metrics.minesSpawned++; ctx.metrics.maxMines = Math.max(ctx.metrics.maxMines, ctx.mines.length); };
  return ctx;
}
function makeEnemy(ctx, kind, position, seed = 1) {
  const mesh = new THREE.Group(); mesh.position.copy(position);
  const towardPlayer = ctx.player.position.clone().sub(position).normalize();
  mesh.quaternion.setFromUnitVectors(ctx.localForward, towardPlayer);
  const warning = kind === 'hammer' ? new THREE.Mesh(ctx.powerRingGeo, new THREE.MeshBasicMaterial({ color: 0xffbb65, transparent: true, opacity: 0 })) : undefined;
  if (warning) { warning.visible = false; mesh.add(warning); }
  const enemy = {
    mesh, kind, health: enemyHealth(ctx.phase, kind),
    velocity: towardPlayer.clone().multiplyScalar(ENEMY_STATS[kind].speed * 0.3),
    state: 'detect', stateTime: 0, stateDuration: 0, lockedDirection: new THREE.Vector3(),
    specialHit: false, orbitSign: seed % 2 ? 1 : -1, warning, cooldown: 0.5, seed,
    hitFlash: 0, engaged: true, patrolAnchor: position.clone(),
    patrolTarget: position.clone(), patrolTimer: 4,
  };
  ctx.enemies.push(enemy);
  return enemy;
}
function step(ctx, dt) {
  ctx.gameTime += dt;
  ctx.invuln = Math.max(0, ctx.invuln - dt);
  ctx.currentDamageSource = 'contact'; ctx.updateEnemies(dt);
  ctx.currentDamageSource = 'bullet'; ctx.updateBullets(dt);
  ctx.currentDamageSource = 'mine'; ctx.updateMines(dt);
  ctx.bullets = ctx.bullets.filter(b => b.active);
}
function simulateEnemy(kind, speed, duration, startPosition, motion, seed = 1) {
  const ctx = makeContext(seed);
  const enemy = makeEnemy(ctx, kind, new THREE.Vector3(...startPosition), seed);
  const heading = new THREE.Vector3(0, 0, -1);
  const states = {}, transitions = {}, intervals = {}, transitionDetails = [];
  let previous = enemy.state, stateEntered = 0, minDistance = Infinity;
  let timeBehind = 0, timeSilent = 0, attackTime = 0, attackShots = 0, silentAimTime = 0, offNearTime = 0, minOffAngle = 180, minOffDistance = Infinity, passes = 0, lastAhead = false, warningTime = 0, maxEnemySpeed = 0, maxChargeTurn = 0, maxAttackTurnRate = 0, maxPrepareTurnRate = 0;
  let priorChargeQuaternion = null, priorLockedDirection = null;
  const chargeStartTimes = [], contactTimes = [], chargeAims = [];
  const dt = CONFIG.fixedStep, ticks = Math.round(duration / dt);
  for (let tick = 0; tick < ticks; tick++) {
    const time = tick * dt;
    const currentSpeed = motion(heading, time, dt, enemy) ?? speed;
    ctx.playerVelocity.copy(heading).multiplyScalar(currentSpeed);
    ctx.player.position.addScaledVector(ctx.playerVelocity, dt);
    const shotsBefore = ctx.metrics.enemyShots;
    const contactsBefore = ctx.metrics.contactHits;
    const launchAim = kind === 'hammer' ? ctx.hammerChargeAim(enemy) : null;
    const orientationBefore = enemy.mesh.quaternion.clone();
    step(ctx, dt);
    const state = enemy.state;
    assert.ok(Number.isFinite(enemy.mesh.position.lengthSq()) && Number.isFinite(enemy.velocity.lengthSq()) && Number.isFinite(enemy.mesh.quaternion.lengthSq()), 'Movimento finito');
    if (ctx.metrics.contactHits > contactsBefore) contactTimes.push(+time.toFixed(2));
    if (enemy.warning?.visible) warningTime += dt;
    maxEnemySpeed = Math.max(maxEnemySpeed, enemy.velocity.length());
    if (state === 'hammerCharge' && priorChargeQuaternion) {
      maxChargeTurn = Math.max(maxChargeTurn, enemy.mesh.quaternion.angleTo(priorChargeQuaternion));
      assert.ok(enemy.lockedDirection.distanceTo(priorLockedDirection) < 1e-12, 'Investida não altera a previsão fixa');
    }
    if (state === 'pursuerAttack') maxAttackTurnRate = Math.max(maxAttackTurnRate, enemy.mesh.quaternion.angleTo(orientationBefore) / dt);
    if (state === 'hammerPrepare') maxPrepareTurnRate = Math.max(maxPrepareTurnRate, enemy.mesh.quaternion.angleTo(orientationBefore) / dt);
    priorChargeQuaternion = state === 'hammerCharge' ? enemy.mesh.quaternion.clone() : null;
    priorLockedDirection = state === 'hammerCharge' ? enemy.lockedDirection.clone() : null;
    if (state === 'pursuerPass' || state === 'pursuerReposition') assert.equal(ctx.metrics.enemyShots - shotsBefore, 0, 'Perseguidora não atira fora do ataque');
    states[state] = (states[state] ?? 0) + dt;
    if (state !== previous) {
      transitions[state] = (transitions[state] ?? 0) + 1;
      if (previous) (intervals[previous] ??= []).push(time - stateEntered);
      transitionDetails.push({ at: +time.toFixed(2), state, distance: +enemy.mesh.position.distanceTo(ctx.player.position).toFixed(1), ahead: +enemy.mesh.position.clone().sub(ctx.player.position).dot(heading).toFixed(1) });
      if (state === 'hammerCharge') {
        chargeStartTimes.push(time);
        const angularError = enemy.lockedDirection.angleTo(launchAim.direction);
        assert.ok(angularError < 1e-6, 'Direção travada igual à previsão calculada no lançamento');
        chargeAims.push({ at: +time.toFixed(2), lead: +launchAim.lead.toFixed(4), travelTime: +(launchAim.distance / CONFIG.specialAI.hammer.chargeSpeed).toFixed(4), angularError: +angularError.toFixed(8) });
      }
      previous = state; stateEntered = time;
    }
    minDistance = Math.min(minDistance, enemy.mesh.position.distanceTo(ctx.player.position));
    const longitudinal = enemy.mesh.position.clone().sub(ctx.player.position).dot(ctx.playerVelocity);
    const aheadNow = longitudinal > 0;
    if (aheadNow && !lastAhead) passes++;
    lastAhead = aheadNow;
    if (longitudinal < 0) timeBehind += dt;
    if (state === 'pursuerAttack') { attackTime += dt; attackShots += ctx.metrics.enemyShots - shotsBefore; }
    if (state === 'pursuerPass' || state === 'pursuerReposition') {
      timeSilent += dt;
      const toward = enemy.mesh.position.clone().sub(ctx.player.position).normalize();
      const offDistance = enemy.mesh.position.distanceTo(ctx.player.position);
      const angle = Math.acos(Math.max(-1, Math.min(1, toward.dot(heading)))) * 180 / Math.PI;
      if (offDistance < 120) { offNearTime += dt; minOffAngle = Math.min(minOffAngle, angle); }
      minOffDistance = Math.min(minOffDistance, offDistance);
      if (angle <= 30 && offDistance < 120) silentAimTime += dt;
    }
  }
  return { kind, speed, duration, minDistance: +minDistance.toFixed(2), collisions: ctx.metrics.contactHits, shots: ctx.metrics.enemyShots, bulletHits: ctx.metrics.bulletHits, transitions, states, intervals, transitionDetails, passes, warningTime: +warningTime.toFixed(2), maxEnemySpeed: +maxEnemySpeed.toFixed(2), maxChargeTurn: +maxChargeTurn.toFixed(6), maxAttackTurnRate: +maxAttackTurnRate.toFixed(3), maxPrepareTurnRate: +maxPrepareTurnRate.toFixed(3), chargeStartTimes: chargeStartTimes.map(x => +x.toFixed(2)), contactTimes, chargeAims, timeBehind: +timeBehind.toFixed(2), timeSilent: +timeSilent.toFixed(2), attackTime: +attackTime.toFixed(2), attackShots, silentAimTime: +silentAimTime.toFixed(2), offNearTime: +offNearTime.toFixed(2), minOffAngle: +minOffAngle.toFixed(1), minOffDistance: +minOffDistance.toFixed(1), remaining: ctx.enemies.length };
}
const straight = () => {};
const diagonal = heading => { heading.set(1, 0, -1).normalize(); };
const turnBeforeCharge = (() => {
  let turning = false, elapsed = 0;
  return (heading, _time, dt, enemy) => {
    if (enemy.state === 'hammerPrepare') turning = true;
    if (turning && elapsed < 0.6) { heading.applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.1 * dt).normalize(); elapsed += dt; }
  };
});
const turnAfterCharge = (() => {
  let turning = false, elapsed = 0;
  return (heading, _time, dt, enemy) => {
    if (enemy.state === 'hammerCharge') turning = true;
    if (turning && elapsed < 0.7) { heading.applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.65 * dt).normalize(); elapsed += dt; }
  };
});
const brakeDuringCharge = (_heading, _time, _dt, enemy) => enemy.state === 'hammerCharge' ? 12 : 35;
const tightTurn = (heading, time, dt) => { if (time >= 0.7 && time < 2.2) heading.applyAxisAngle(new THREE.Vector3(0, 1, 0), 2.145 * dt).normalize(); };
const wideTurn = (heading, time, dt) => { if (time >= 1 && time < 4) heading.applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.1 * dt).normalize(); };
const flechaTurn = (heading, time, dt) => { if (time >= 0.5 && time < 4) heading.applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.155 * dt).normalize(); };
const caosDodge = (heading, time, dt) => { if (time >= 1 && time < 2.2) heading.applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.65 * dt).normalize(); if (time >= 4 && time < 5.2) heading.applyAxisAngle(new THREE.Vector3(0, 1, 0), -1.65 * dt).normalize(); };
const hammer = {
  caosReto: simulateEnemy('hammer', 35, 14, [0, 0, 55], straight),
  flechaMax: simulateEnemy('hammer', 120, 10, [0, 0, -60], straight),
  vespaCurva: simulateEnemy('hammer', 75, 14, [0, 0, 55], tightTurn),
  tanqueModerado: simulateEnemy('hammer', 35, 14, [0, 0, 55], straight, 2),
  caosDesvio: simulateEnemy('hammer', 35, 14, [0, 0, 55], tightTurn, 3),
  diagonal: simulateEnemy('hammer', 35, 10, [0, 0, 55], diagonal),
  turnBeforeCharge: simulateEnemy('hammer', 35, 10, [0, 0, 55], turnBeforeCharge()),
  turnAfterCharge: simulateEnemy('hammer', 35, 10, [0, 0, 55], turnAfterCharge()),
  brakeDuringCharge: simulateEnemy('hammer', 35, 10, [0, 0, 55], brakeDuringCharge),
};
const pursuer = {
  caos: simulateEnemy('pursuer', 35, 20, [0, 0, 80], straight),
  caosDesvio: simulateEnemy('pursuer', 35, 20, [0, 0, 80], caosDodge, 6),
  vespa: simulateEnemy('pursuer', 75, 20, [0, 0, 80], tightTurn),
  flecha: simulateEnemy('pursuer', 120, 20, [0, 0, 80], straight),
  flechaCurva: simulateEnemy('pursuer', 120, 20, [0, 0, 80], flechaTurn, 5),
  tanque: simulateEnemy('pursuer', 35, 20, [0, 0, 80], straight, 2),
  dominadora: simulateEnemy('pursuer', 90, 20, [0, 0, 80], wideTurn),
  dominadoraCruzeiro: simulateEnemy('pursuer', 35, 20, [0, 0, 80], wideTurn, 4),
};
function freshMine(phase = 5) {
  const ctx = makeContext(); ctx.phase = phase; ctx.player.position.set(0, 0, 40);
  const launcher = makeEnemy(ctx, 'miner', new THREE.Vector3(0, 0, -5.5));
  ctx.enemies.length = 0;
  ctx.spawnMine(launcher);
  assert.equal(ctx.mines.length, 1);
  assert.ok(ctx.mines[0].mesh.position.length() < 1e-9);
  return ctx;
}
function directMineShots(level, phase = 5, playerDistance = 40) {
  const ctx = freshMine(phase); ctx.player.position.set(0, 0, playerDistance);
  let shots = 0;
  while (ctx.mines[0].state !== 'detonating' && shots < 200) {
    ctx.spawnBullet(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1), true, laserDamage(level), 0, new THREE.Vector3());
    ctx.currentDamageSource = 'bullet'; ctx.updateBullets(CONFIG.fixedStep);
    ctx.bullets.length = 0;
    shots++;
  }
  assert.ok(shots < 200);
  for (let tick = 0; tick < 15 && ctx.mines.length; tick++) {
    ctx.currentDamageSource = 'mine'; ctx.updateMines(CONFIG.fixedStep);
  }
  assert.equal(ctx.mines.length, 0);
  return { level, phase, shots, laserHits: ctx.metrics.mineLaserHits, mineDamageEvents: ctx.metrics.mineHits, explosionEvents: ctx.metrics.explosions };
}
function traverseMine(fire, startDistance = 25) {
  const ctx = freshMine(); ctx.player.position.set(0, 0, startDistance);
  ctx.playerVelocity.set(0, 0, -35);
  let shotsFired = 0, triggered = false, detonationTime = null, triggerTime = null;
  for (let tick = 0; tick < 120; tick++) {
    const dt = CONFIG.fixedStep, time = (tick + 1) * dt;
    ctx.player.position.addScaledVector(ctx.playerVelocity, dt);
    if (fire && tick % 8 === 0) {
      ctx.spawnBullet(ctx.player.position.clone(), new THREE.Vector3(0, 0, -1), true, laserDamage(1), 0, ctx.playerVelocity);
      shotsFired++;
    }
    ctx.currentDamageSource = 'bullet'; ctx.updateBullets(dt);
    ctx.currentDamageSource = 'mine'; ctx.updateMines(dt);
    ctx.bullets = ctx.bullets.filter(b => b.active);
    if (!triggered && ctx.mines[0]?.state === 'detonating') { triggered = true; triggerTime = time; }
    if (triggered && !ctx.mines.length) { detonationTime = time; break; }
  }
  return { fire, startDistance, shotsFired, laserHits: ctx.metrics.mineLaserHits, mineDamageEvents: ctx.metrics.mineHits, triggerTime, detonationTime, triggerToBlast: triggerTime === null || detonationTime === null ? null : +(detonationTime - triggerTime).toFixed(3) };
}

function defendedMineBlast(shields, invuln, armor) {
  const ctx = freshMine(); ctx.player.position.set(0, 0, 8); ctx.health = 1000;
  ctx.shields = shields; ctx.invuln = invuln; ctx.shipArmor = armor;
  ctx.spawnBullet(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1), true, laserDamage(5), 0, new THREE.Vector3());
  ctx.currentDamageSource = 'bullet'; ctx.updateBullets(CONFIG.fixedStep);
  for (let tick = 0; tick < 15 && ctx.mines.length; tick++) {
    ctx.currentDamageSource = 'mine'; ctx.updateMines(CONFIG.fixedStep);
  }
  return { shieldsBefore: shields, shieldsAfter: ctx.shields, healthLost: +(1000 - ctx.health).toFixed(6), shieldProtection: ctx.shieldProtection, mineDamageEvents: ctx.metrics.mineHits, explosions: ctx.metrics.explosions };
}
const mines = {
  phase5: [1, 2, 3, 4, 5, 10].map(level => directMineShots(level)),
  phase10: [1, 2, 3, 4, 5, 10].map(level => directMineShots(level, 10)),
  nearLaser: directMineShots(5, 5, 8),
  farLaser: directMineShots(5, 5, 40),
  insideBlastEdge: directMineShots(5, 5, 13.7),
  outsideBlastEdge: directMineShots(5, 5, 13.9),
  traverseNoFire: traverseMine(false),
  traverseFiring: traverseMine(true),
  traversalGrid: [15, 20, 25, 30, 40, 50].flatMap(distance => [false, true].map(fire => traverseMine(fire, distance))),
  shielded: defendedMineBlast(1, 0, 0),
  invulnerable: defendedMineBlast(0, 1, 0),
  armored: defendedMineBlast(0, 0, 5),
};

const mineStates = (() => {
  const ctx = freshMine(); const mine = ctx.mines[0];
  ctx.player.position.set(0, 0, 0);
  ctx.currentDamageSource = 'mine'; ctx.updateMines(0.5);
  assert.equal(mine.state, 'arming');
  assert.equal(ctx.metrics.mineHits, 0);
  ctx.updateMines(0.3);
  assert.equal(mine.state, 'detonating');
  const ringScale = mine.ring.scale.x;
  assert.ok(Math.abs(ringScale * 1.38 - CONFIG.specialAI.mine.blastRadius) < 1e-9);
  for (let tick = 0; tick < 20 && ctx.mines.length; tick++) ctx.updateMines(CONFIG.fixedStep);
  assert.equal(ctx.metrics.explosions, 1);
  const active = freshMine(); active.player.position.set(0, 0, 40); active.updateMines(CONFIG.specialAI.mine.arm);
  assert.equal(active.mines[0].state, 'active');
  const activeRingRadius = active.mines[0].ring.scale.x * 1.38;
  assert.ok(Math.abs(activeRingRadius - CONFIG.specialAI.mine.blastRadius) < 1e-9);
  const overlap = freshMine(); const priorCount = overlap.mines.length;
  const launcher = makeEnemy(overlap, 'miner', new THREE.Vector3(0, 0, -5.5));
  overlap.enemies.length = 0; overlap.spawnMine(launcher);
  assert.equal(overlap.mines.length, priorCount);
  const expiring = freshMine(); expiring.mines[0].age = CONFIG.specialAI.mine.life - 0.01;
  expiring.beginMineDetonation(expiring.mines[0], CONFIG.specialAI.mine.laserFuse);
  for (let tick = 0; tick < 15 && expiring.mines.length; tick++) expiring.updateMines(CONFIG.fixedStep);
  assert.equal(expiring.metrics.explosions, 1);
  const full = freshMine(); const capLauncher = makeEnemy(full, 'miner', new THREE.Vector3(0, 0, -5.5)); full.enemies.length = 0;
  full.mines = Array.from({ length: CONFIG.specialAI.mine.maxCount }, (_, i) => { const mesh = new THREE.Group(); mesh.position.set(100 + i * 20, 0, 0); return { mesh, state: 'detonating' }; });
  full.spawnMine(capLauncher); assert.equal(full.mines.length, CONFIG.specialAI.mine.maxCount);
  full.mines[1].state = 'active'; full.spawnMine(capLauncher);
  assert.equal(full.mines.length, CONFIG.specialAI.mine.maxCount);
  assert.equal(full.mines.filter(m => m.state === 'detonating').length, CONFIG.specialAI.mine.maxCount - 1);
  return { armingNoDamage: true, activeTriggered: true, activeRingRadius: +activeRingRadius.toFixed(2), ringScaleAtDetonation: +ringScale.toFixed(2), overlapBlocked: true, detonationSurvivesExpiry: true, entityCapRespected: true, pendingExplosionsPreserved: true };
})();
function simulateCombined(seed) {
const combinedCtx = makeContext(seed);
combinedCtx.playerVelocity.set(0, 0, -35);
const combinedEnemies = [
  makeEnemy(combinedCtx, 'hammer', new THREE.Vector3(15, 0, 65), 1),
  makeEnemy(combinedCtx, 'miner', new THREE.Vector3(-45, 0, -25), 2),
  makeEnemy(combinedCtx, 'pursuer', new THREE.Vector3(55, 0, 45), 3),
];
const combinedStates = {};
const started = performance.now();
for (let tick = 0; tick < 1800; tick++) {
  const dt = CONFIG.fixedStep;
  const towardMiner = combinedEnemies[1].mesh.position.clone().sub(combinedCtx.player.position).normalize();
  combinedCtx.playerVelocity.copy(towardMiner).multiplyScalar(35);
  combinedCtx.player.position.addScaledVector(combinedCtx.playerVelocity, dt);
  step(combinedCtx, dt);
  for (const enemy of combinedEnemies) combinedStates[enemy.state] = (combinedStates[enemy.state] ?? 0) + dt;
  for (const enemy of combinedCtx.enemies) assert.ok(Number.isFinite(enemy.mesh.position.lengthSq()) && Number.isFinite(enemy.velocity.lengthSq()));
  assert.ok(combinedCtx.mines.length <= CONFIG.specialAI.mine.maxCount);
}
return { seed, wallMs: +(performance.now() - started).toFixed(1), enemyShots: combinedCtx.metrics.enemyShots, bulletHits: combinedCtx.metrics.bulletHits, contactHits: combinedCtx.metrics.contactHits, mineHits: combinedCtx.metrics.mineHits, minesSpawned: combinedCtx.metrics.minesSpawned, maxMines: combinedCtx.metrics.maxMines, minesRemaining: combinedCtx.mines.length, enemiesRemaining: combinedCtx.enemies.length, states: combinedStates };
}

const obstacleCheck = (() => {
  const ctx = makeContext(); const hammerEnemy = makeEnemy(ctx, 'hammer', new THREE.Vector3(0, 0, 55));
  const asteroid = { mesh: new THREE.Group(), radius: 5, velocity: new THREE.Vector3() };
  asteroid.mesh.position.set(0, 0, 25); ctx.world.asteroids.push(asteroid);
  assert.equal(ctx.chargePathClear(hammerEnemy, new THREE.Vector3(0, 0, -1), 65), false);
  asteroid.mesh.position.set(30, 0, 25);
  assert.equal(ctx.chargePathClear(hammerEnemy, new THREE.Vector3(0, 0, -1), 65), true);
  return { blockedStraightCharge: true, clearAlternatePath: true };
})();
const interceptMath = (() => {
  const ctx = makeContext();
  const enemy = makeEnemy(ctx, 'hammer', new THREE.Vector3());
  const scenarios = [
    { name: 'diagonal', position: [0, 0, -60], velocity: [20, 0, 0], exact: true },
    { name: 'linear', position: [0, 0, -60], velocity: [0, 0, 78], exact: true },
    { name: 'escape', position: [0, 0, -60], velocity: [0, 0, -120], exact: false },
    { name: 'capped', position: [0, 0, -200], velocity: [0, 0, -35], exact: false },
    { name: 'coincident', position: [0, 0, 0], velocity: [0, 0, 0], exact: true },
  ];
  return scenarios.map(scenario => {
    ctx.player.position.set(...scenario.position);
    ctx.playerVelocity.set(...scenario.velocity);
    const aim = ctx.hammerChargeAim(enemy);
    assert.ok(Number.isFinite(aim.lead) && aim.lead >= 0 && aim.lead <= CONFIG.specialAI.hammer.maxLead);
    assert.ok(Number.isFinite(aim.direction.lengthSq()) && Math.abs(aim.direction.length() - 1) < 1e-10);
    const predicted = ctx.player.position.clone().addScaledVector(ctx.playerVelocity, aim.lead);
    assert.ok(Math.abs(aim.distance - predicted.distanceTo(enemy.mesh.position)) < 1e-9);
    if (scenario.exact && aim.distance > 1e-6) assert.ok(Math.abs(aim.distance / CONFIG.specialAI.hammer.chargeSpeed - aim.lead) < 1e-8);
    return { name: scenario.name, lead: +aim.lead.toFixed(5), direction: aim.direction.toArray().map(x => +x.toFixed(5)), exact: scenario.exact };
  });
})();
const combinedRuns = [71, 72, 73, 74, 75].map(simulateCombined);
const combined = combinedRuns[0];

assert.deepEqual(mines.phase5.map(result => result.shots), [8, 4, 2, 1, 1, 1]);
assert.deepEqual(mines.phase10.map(result => result.shots), [12, 6, 3, 2, 1, 1]);
for (const result of [...mines.phase5, ...mines.phase10]) {
  const legacyHealth = Math.min(256, Math.round(laserDamage(1) * CONFIG.specialAI.mine.baseLaser1Hits * CONFIG.specialAI.mine.healthGrowthFactor ** Math.floor(Math.max(0, result.phase - 5) / CONFIG.specialAI.mine.healthGrowthEveryPhases)));
  assert.equal(result.shots, Math.ceil(legacyHealth * 1.3 / laserDamage(result.level)));
}
assert.equal(mines.nearLaser.mineDamageEvents, 1);
assert.equal(mines.farLaser.mineDamageEvents, 0);
assert.equal(mines.insideBlastEdge.mineDamageEvents, 1);
assert.equal(mines.outsideBlastEdge.mineDamageEvents, 0);
assert.equal(mines.shielded.shieldsAfter, 0);
assert.equal(mines.shielded.healthLost, 0);
assert.equal(mines.invulnerable.healthLost, 0);
assert.ok(Math.abs(mines.armored.healthLost - armoredDamage(enemyDamage(5, 'miner'), 5)) < 1e-5);
assert.ok(hammer.caosReto.collisions >= 1);
assert.ok(hammer.diagonal.collisions >= 1);
assert.ok(hammer.diagonal.contactTimes[0] >= hammer.diagonal.chargeStartTimes[0]);
assert.ok(hammer.diagonal.contactTimes[0] < hammer.diagonal.chargeStartTimes[0] + CONFIG.specialAI.hammer.charge);
assert.ok(hammer.turnBeforeCharge.chargeAims.length >= 1);
assert.ok(hammer.turnBeforeCharge.collisions >= 1);
assert.ok(hammer.turnAfterCharge.chargeAims.length >= 1);
assert.ok(hammer.turnAfterCharge.chargeStartTimes.length >= 2);
assert.ok(hammer.turnAfterCharge.contactTimes.every(time => time > hammer.turnAfterCharge.chargeStartTimes[1]), 'A curva após o lançamento esquiva da primeira investida');
assert.ok(hammer.brakeDuringCharge.chargeAims.length >= 1);
assert.ok(hammer.brakeDuringCharge.contactTimes[0] < hammer.brakeDuringCharge.chargeStartTimes[0] + CONFIG.specialAI.hammer.charge);
assert.equal(hammer.vespaCurva.collisions, 0);
assert.equal(hammer.caosDesvio.collisions, 0);
assert.ok(hammer.caosReto.warningTime > 0);
assert.ok(hammer.caosReto.intervals.hammerPrepare.every(x => x <= CONFIG.specialAI.hammer.prepare + 0.05));
assert.ok(hammer.caosReto.intervals.hammerCharge.every(x => x <= CONFIG.specialAI.hammer.charge + 0.05));
assert.ok(hammer.caosReto.intervals.hammerRecover.every(x => x <= CONFIG.specialAI.hammer.recover + 0.1));
assert.ok(hammer.caosReto.maxEnemySpeed <= CONFIG.specialAI.hammer.chargeSpeed + 0.01);
assert.ok(hammer.caosReto.maxChargeTurn <= CONFIG.specialAI.hammer.chargeTurn * CONFIG.fixedStep + 0.001);
assert.ok(hammer.caosReto.maxPrepareTurnRate <= ENEMY_STATS.hammer.turn + 0.001);
for (const scenario of Object.values(hammer)) {
  assert.ok(scenario.maxEnemySpeed <= CONFIG.specialAI.hammer.chargeSpeed + 0.01);
  assert.ok(scenario.maxChargeTurn <= CONFIG.specialAI.hammer.chargeTurn * CONFIG.fixedStep + 0.001);
  for (const [state, limit] of [['hammerPrepare', CONFIG.specialAI.hammer.prepare], ['hammerCharge', CONFIG.specialAI.hammer.charge], ['hammerRecover', CONFIG.specialAI.hammer.recover]]) {
    assert.ok((scenario.intervals[state] ?? []).every(duration => duration <= limit + 0.1), `${state} não fica travado`);
  }
}
assert.ok(pursuer.caos.maxEnemySpeed <= CONFIG.specialAI.pursuer.maxSpeed + 0.01);
assert.ok(pursuer.caos.maxAttackTurnRate <= CONFIG.specialAI.pursuer.attackTurn + 0.001);
assert.ok(pursuer.caos.transitions.pursuerPass >= 1);
assert.ok(pursuer.caos.passes >= 1);
assert.ok(pursuer.caos.intervals.pursuerAttack.every(x => x <= CONFIG.specialAI.pursuer.attackDuration + CONFIG.specialAI.pursuer.timerJitter + 0.05));
assert.ok(pursuer.caos.intervals.pursuerPass.every(x => x <= CONFIG.specialAI.pursuer.passDuration + CONFIG.specialAI.pursuer.timerJitter + 0.05));
assert.ok(pursuer.caos.timeSilent >= 2);
const approvedBaseline = JSON.parse(readFileSync(new URL('./ai-scenarios-baseline.json', import.meta.url), 'utf8'));
for (const [name, expected] of Object.entries(approvedBaseline.pursuer)) {
  for (const [metric, value] of Object.entries(expected)) assert.deepEqual(JSON.parse(JSON.stringify(pursuer[name][metric])), value, `Perseguidora preservada: ${name}.${metric}`);
}
console.log(JSON.stringify({ hammer, pursuer, mines, mineStates, interceptMath, obstacleCheck, combined, combinedRuns }, null, 2));
