import type { EnemyKind } from './config';

export type ShipKind = 'Caos' | 'Vespa' | 'Flecha' | 'Tanque' | 'Dominadora' | 'Suprema' | 'Rinoceronte' | 'Leopardo' | 'Harpia';
export type SkinKind = 'Tech' | 'Espacial' | 'GBL' | 'Trovão' | 'Brasil' | 'Militar' | 'Patricinha' | 'Neon rubro' | 'Neon clube' | 'Neon ouro' | 'Neon cobre' | 'Neon ultravioleta';
export const UPGRADE_KEYS = ['speed', 'turn', 'health', 'armor', 'damage', 'fireRate', 'shields', 'laserLevel'] as const;
export type UpgradeKind = typeof UPGRADE_KEYS[number];
export type ShipUpgrades = Record<UpgradeKind, number>;
export const MAX_UPGRADE_LEVEL = 5;
export const upgradeCost = (currentLevel: number): number => 8 * 2 ** currentLevel;

export function armoredDamage(amount: number, armor: number): number {
  if (armor <= 0) return amount;
  return Math.max(0, amount * (1 - Math.min(armor, 80) / 100) - 1.5 ** armor);
}

export const ECONOMY = {
  enemyPoints: { interceptor: 100, fighter: 175, bomber: 300, miner: 220, hammer: 400, pursuer: 260 } satisfies Record<EnemyKind, number>,
  asteroidPoints: 25,
  powerupPoints: 50,
  entropyDivisor: 1000,
  skins: {
    Tech: { price: 0, primary: 0x859bb4, wing: 0x26415f, trim: 0x859bb4, light: 0x3ddcff, emissive: false, description: 'Titânio e ciano' },
    Espacial: { price: 10, primary: 0x2750c7, wing: 0x9d254a, trim: 0x5978dd, light: 0xff6687, emissive: false, description: 'Cobalto e carmim' },
    GBL: { price: 10, primary: 0x7140ac, wing: 0xe8752b, trim: 0xa16be0, light: 0xffaa58, emissive: false, description: 'Roxo e laranja' },
    Trovão: { price: 10, primary: 0xd8ab4d, wing: 0x151b25, trim: 0xffd779, light: 0xffdc86, emissive: false, description: 'Dourado e preto' },
    Brasil: { price: 15, primary: 0x169447, wing: 0xf2c936, trim: 0x2453b8, light: 0x6edaff, emissive: false, description: 'Verde, amarelo e azul' },
    Militar: { price: 15, primary: 0x263f2c, wing: 0xb3a481, trim: 0x684934, light: 0xd2b585, emissive: false, description: 'Verde escuro, bege e marrom' },
    Patricinha: { price: 15, primary: 0xf8f7fb, wing: 0xf6b9d6, trim: 0xf02491, light: 0xff82c3, emissive: false, description: 'Branco, rosa claro e rosa choque' },
    'Neon rubro': { price: 25, primary: 0xb7133f, wing: 0x830c2d, trim: 0xff315e, light: 0xff315e, emissive: true, description: 'Carmim luminoso' },
    'Neon clube': { price: 25, primary: 0x174cdb, wing: 0x133ba8, trim: 0x4c82ff, light: 0x4c82ff, emissive: true, description: 'Cobalto luminoso' },
    'Neon ouro': { price: 25, primary: 0xe7af17, wing: 0xab790b, trim: 0xffdc4f, light: 0xffdc4f, emissive: true, description: 'Amarelo dourado luminoso' },
    'Neon cobre': { price: 25, primary: 0xe76312, wing: 0xac3e0b, trim: 0xff9c35, light: 0xff9c35, emissive: true, description: 'Laranja intenso luminoso' },
    'Neon ultravioleta': { price: 25, primary: 0x8231dc, wing: 0x5416a6, trim: 0xbd65ff, light: 0xbd65ff, emissive: true, description: 'Roxo intenso luminoso' },
  },
  ships: {
    Caos: { price: 0, maxSpeed: 90, turnMultiplier: 1, baseHealth: 100, extraHealth: 100, healthPickup: 25, armor: 0, damageMultiplier: 1, fireRateMultiplier: 1, maxLaserLevel: 20, shieldSlots: 3, shieldProtection: 3, muzzleCount: 2, description: 'Equilíbrio de velocidade e manobra' },
    Vespa: { price: 80, maxSpeed: 75, turnMultiplier: 1.3, baseHealth: 100, extraHealth: 100, healthPickup: 25, armor: 0, damageMultiplier: 1, fireRateMultiplier: 1, maxLaserLevel: 20, shieldSlots: 3, shieldProtection: 3, muzzleCount: 2, description: 'Máx. 75 · giro +30%' },
    Flecha: { price: 80, maxSpeed: 120, turnMultiplier: 0.7, baseHealth: 100, extraHealth: 100, healthPickup: 25, armor: 0, damageMultiplier: 1, fireRateMultiplier: 1, maxLaserLevel: 20, shieldSlots: 3, shieldProtection: 3, muzzleCount: 2, description: 'Máx. 120 · giro −30%' },
    Tanque: { price: 80, maxSpeed: 90, turnMultiplier: 1, baseHealth: 200, extraHealth: 200, healthPickup: 50, armor: 0, damageMultiplier: 0.5, fireRateMultiplier: 0.5, maxLaserLevel: 20, shieldSlots: 5, shieldProtection: 3, muzzleCount: 2, description: 'Vida 200 + 200 · cura +50 · dano e cadência ×0,5 · 5 escudos' },
    Dominadora: { price: 80, maxSpeed: 90, turnMultiplier: 1, baseHealth: 75, extraHealth: 50, healthPickup: 25, armor: 0, damageMultiplier: 2, fireRateMultiplier: 2, maxLaserLevel: 25, shieldSlots: 3, shieldProtection: 3, muzzleCount: 2, description: 'Vida 75 + 50 · dano e cadência ×2 · laser 25' },
    Suprema: { price: 240, maxSpeed: 110, turnMultiplier: 1.2, baseHealth: 150, extraHealth: 150, healthPickup: 25, armor: 0, damageMultiplier: 1.5, fireRateMultiplier: 1.5, maxLaserLevel: 30, shieldSlots: 4, shieldProtection: 3, muzzleCount: 2, description: 'Vida 150 + 150 · máx. 110 · giro +20% · dano e cadência ×1,5 · laser 30 · 4 escudos' },
    Rinoceronte: { price: 360, maxSpeed: 110, turnMultiplier: 1.2, baseHealth: 150, extraHealth: 150, healthPickup: 25, armor: 10, damageMultiplier: 1.5, fireRateMultiplier: 1.5, maxLaserLevel: 30, shieldSlots: 4, shieldProtection: 6, muzzleCount: 2, description: 'Suprema blindada · blindagem 10 · escudos protegem por 6 s' },
    Leopardo: { price: 360, maxSpeed: 120, turnMultiplier: 1.4, baseHealth: 150, extraHealth: 150, healthPickup: 25, armor: 5, damageMultiplier: 1.5, fireRateMultiplier: 1.5, maxLaserLevel: 30, shieldSlots: 4, shieldProtection: 3, muzzleCount: 2, description: 'Suprema ágil · blindagem 5 · máx. 120 · giro +40%' },
    Harpia: { price: 360, maxSpeed: 110, turnMultiplier: 1.2, baseHealth: 150, extraHealth: 150, healthPickup: 25, armor: 5, damageMultiplier: 1.5, fireRateMultiplier: 2, maxLaserLevel: 30, shieldSlots: 4, shieldProtection: 3, muzzleCount: 4, description: 'Suprema armada · blindagem 5 · cadência ×2 · quatro pontas de disparo' },
  },
} as const;

export interface Progress {
  highScore: number;
  entropy: number;
  ownedSkins: SkinKind[];
  ownedShips: ShipKind[];
  selectedSkin: SkinKind;
  selectedShip: ShipKind;
  upgrades: Record<ShipKind, ShipUpgrades>;
}

const STORAGE_KEY = 'space-shooter-3d-progress-v1';
const skins = Object.keys(ECONOMY.skins) as SkinKind[];
const ships = Object.keys(ECONOMY.ships) as ShipKind[];
const blankUpgrades = (): ShipUpgrades => ({ speed: 0, turn: 0, health: 0, armor: 0, damage: 0, fireRate: 0, shields: 0, laserLevel: 0 });
const allUpgrades = (): Record<ShipKind, ShipUpgrades> => Object.fromEntries(ships.map(ship => [ship, blankUpgrades()])) as Record<ShipKind, ShipUpgrades>;
const initial = (): Progress => ({ highScore: 0, entropy: 0, ownedSkins: ['Tech'], ownedShips: ['Caos'], selectedSkin: 'Tech', selectedShip: 'Caos', upgrades: allUpgrades() });
const safeNumber = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

export function loadProgress(): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Progress> | null;
    if (!saved) return initial();
    const ownedSkins = skins.filter(name => name === 'Tech' || saved.ownedSkins?.includes(name));
    const ownedShips = ships.filter(name => name === 'Caos' || saved.ownedShips?.includes(name));
    const upgrades = allUpgrades();
    for (const ship of ships) for (const key of UPGRADE_KEYS) upgrades[ship][key] = Math.min(MAX_UPGRADE_LEVEL, safeNumber(saved.upgrades?.[ship]?.[key]));
    return {
      highScore: safeNumber(saved.highScore), entropy: safeNumber(saved.entropy), ownedSkins, ownedShips,
      selectedSkin: ownedSkins.includes(saved.selectedSkin as SkinKind) ? saved.selectedSkin as SkinKind : 'Tech',
      selectedShip: ownedShips.includes(saved.selectedShip as ShipKind) ? saved.selectedShip as ShipKind : 'Caos',
      upgrades,
    };
  } catch { return initial(); }
}

export function saveProgress(progress: Progress): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* Browser storage may be unavailable. */ }
}

export function pointsForEnemy(kind: EnemyKind, phase: number): number { return ECONOMY.enemyPoints[kind] * Math.max(1, phase); }
export function entropyForScore(score: number): number { return Math.floor(Math.max(0, score) / ECONOMY.entropyDivisor); }

export function finishRun(progress: Progress, score: number): number {
  const earned = entropyForScore(score);
  progress.highScore = Math.max(progress.highScore, score);
  progress.entropy += earned;
  saveProgress(progress);
  return earned;
}

export function buySkin(progress: Progress, skin: SkinKind): boolean {
  const price = ECONOMY.skins[skin].price;
  if (progress.ownedSkins.includes(skin) || progress.entropy < price) return false;
  progress.entropy -= price; progress.ownedSkins.push(skin); progress.selectedSkin = skin; saveProgress(progress); return true;
}
export function buyShip(progress: Progress, ship: ShipKind): boolean {
  const price = ECONOMY.ships[ship].price;
  if (progress.ownedShips.includes(ship) || progress.entropy < price) return false;
  progress.entropy -= price; progress.ownedShips.push(ship); progress.selectedShip = ship; saveProgress(progress); return true;
}
export function selectSkin(progress: Progress, skin: SkinKind): boolean {
  if (!progress.ownedSkins.includes(skin)) return false;
  progress.selectedSkin = skin; saveProgress(progress); return true;
}
export function selectShip(progress: Progress, ship: ShipKind): boolean {
  if (!progress.ownedShips.includes(ship)) return false;
  progress.selectedShip = ship; saveProgress(progress); return true;
}

export function getShipStats(progress: Progress, ship: ShipKind) {
  const base = ECONOMY.ships[ship], levels = progress.upgrades[ship];
  const healthFactor = 1 + levels.health * 0.08;
  return {
    ...base,
    maxSpeed: base.maxSpeed + levels.speed * 5,
    turnMultiplier: base.turnMultiplier * (1 + levels.turn * 0.06),
    baseHealth: Math.round(base.baseHealth * healthFactor),
    extraHealth: Math.round(base.extraHealth * healthFactor),
    armor: base.armor + levels.armor,
    damageMultiplier: base.damageMultiplier * (1 + levels.damage * 0.1),
    fireRateMultiplier: base.fireRateMultiplier * (1 + levels.fireRate * 0.1),
    shieldSlots: base.shieldSlots + levels.shields,
    maxLaserLevel: base.maxLaserLevel + levels.laserLevel,
  };
}


export function purchaseUpgrade(progress: Progress, ship: ShipKind, attribute: UpgradeKind): boolean {
  if (!progress.ownedShips.includes(ship)) return false;
  const current = progress.upgrades[ship][attribute];
  if (current >= MAX_UPGRADE_LEVEL || progress.entropy < upgradeCost(current)) return false;
  progress.entropy -= upgradeCost(current); progress.upgrades[ship][attribute] = current + 1;
  saveProgress(progress); return true;
}
