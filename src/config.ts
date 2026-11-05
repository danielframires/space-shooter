export const CONFIG = {
  seed: 73129,
  fixedStep: 1 / 60,
  player: { minSpeed: 12, cruiseSpeed: 35, maxSpeed: 90, acceleration: 35, braking: 55, turnRate: 1.65, maxHealth: 200, invulnerability: 0.5, shieldProtection: 3, radius: 2.5 },
  camera: { distance: 17, height: 4.2, positionFollow: 5.2, rotationFollow: 3.2, orbitReturn: 7, fov: 67, aimDistance: 85 },
  laser: { rate: 8, speed: 240, range: 600, maxLevel: 20, convergence: 85, hitRadius: 0.9 },
  enemy: { spawnInterval: 2.2, spawnMin: 100, spawnMax: 185, detectDistance: 105, disengageDistance: 170, patrolRadius: 55, patrolSpeed: 0.38, despawn: 520, maxCount: 20, attackSlots: 3 },
  specialAI: {
    hammer: { prepare: 0.6, charge: 1.5, recover: 2, chargeSpeed: 78, chargeTurn: 0.4, approachSpeed: 68, prepareSpeed: 50, recoverSpeed: 34, chargeMinDistance: 24, chargeMaxDistance: 64, alignment: 0.78, maxLead: 1.5 },
    mine: { arm: 0.8, life: 28, maxCount: 32, baseLaser1Hits: 6, healthMultiplier: 1.3, healthGrowthEveryPhases: 5, healthGrowthFactor: 1.5, maxHealth: 256, spacing: 16, minPlayerDistance: 13, triggerRadius: 7.5, blastRadius: 13.8, proximityFuse: 0.22, laserFuse: 0.12 },
    pursuer: { maxSpeed: 100, attackTurn: 1.9, attackDuration: 3, passDuration: 2.3, passAlignTime: 1.8, passTurn: 1.9, repositionDuration: 2, repositionTurn: 1.1, repositionSpeed: 78, attackRange: 75, alignment: 0.72, disengageDistance: 400, timerJitter: 0.25 },
  },
  world: { originShift: 800, stars: 1100, starRadius: 440, asteroidStreamRadius: 360, nebulaStreamRadius: 500, maxSplitAsteroids: 48 },
  powerups: { lifetime: 20, ambientInterval: 18, dropChance: 0.22, criticalBonus: 0.2, maxShields: 3 },
  effects: { maxParticles: 220, maxProjectiles: 240 },
  phaseKills: 15,
} as const;

export type EnemyKind = 'interceptor' | 'fighter' | 'bomber' | 'miner' | 'hammer' | 'pursuer';
export type PowerKind = 'health' | 'special' | 'laser' | 'shield';

export const ENEMY_STATS: Record<EnemyKind, { health: number; damage: number; speed: number; turn: number; radius: number; cooldown: number; color: number }> = {
  interceptor: { health: 0.6, damage: 0.5, speed: 49, turn: 2.5, radius: 2.2, cooldown: 1.45, color: 0xff637d },
  fighter: { health: 1, damage: 1, speed: 35, turn: 1.7, radius: 3, cooldown: 1.8, color: 0xffae59 },
  bomber: { health: 2.5, damage: 1.5, speed: 23, turn: 0.9, radius: 4.7, cooldown: 2.8, color: 0xc28dff },
  miner: { health: 1.4, damage: 1.2, speed: 43, turn: 1.9, radius: 3.1, cooldown: 2.4, color: 0x65ecb3 },
  hammer: { health: 4, damage: 2.5, speed: 39, turn: 1.1, radius: 5.6, cooldown: 0, color: 0xff9a67 },
  pursuer: { health: 1.1, damage: 1, speed: 66, turn: 2.7, radius: 2.5, cooldown: 1.3, color: 0x69c7ff },
};

export function enemyKindForPhase(phase: number, roll: number): EnemyKind {
  if (phase < 2) return roll < 0.7 ? 'interceptor' : 'fighter';
  if (phase < 4) return roll < 0.42 ? 'interceptor' : roll < 0.85 ? 'fighter' : 'bomber';
  if (phase < 5) return roll < 0.3 ? 'interceptor' : roll < 0.68 ? 'fighter' : 'bomber';
  return roll < 0.18 ? 'interceptor' : roll < 0.34 ? 'fighter' : roll < 0.49 ? 'bomber' : roll < 0.67 ? 'miner' : roll < 0.83 ? 'hammer' : 'pursuer';
}

export function phaseForKills(kills: number): number { return 1 + Math.floor(kills / CONFIG.phaseKills); }
export function enemyHealth(phase: number, kind: EnemyKind): number { return Math.max(1, Math.round(Math.ceil(12 * 1.5 ** (phase - 1)) * ENEMY_STATS[kind].health)); }
export function enemyDamage(phase: number, kind: EnemyKind): number { return Math.max(1, Math.round(2 ** phase * ENEMY_STATS[kind].damage)); }
export function laserDamage(level: number): number { return 2 ** level; }
export function laserColor(level: number, maxLevel: number = CONFIG.laser.maxLevel): number {
  const stops = [0, 20, 43, 60, 93, 135, 177, 227, 257];
  const t = (Math.max(1, Math.min(maxLevel, level)) - 1) / (maxLevel - 1) * (stops.length - 1);
  const i = Math.floor(t), hue = stops[i] + (stops[Math.min(stops.length - 1, i + 1)] - stops[i]) * (t - i);
  const s = 1, l = 0.58;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return ((Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255));
}
