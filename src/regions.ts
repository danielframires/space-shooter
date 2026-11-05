import type { Position3 } from './spatial';

export interface Cell3 { x: number; y: number; z: number }
export interface RegionAttributes {
  asteroidDensity: number;
  nebulaDensity: number;
}
export interface SpatialSite {
  id: string;
  position: Position3;
  seed: number;
}

export const ASTEROID_CELL_SIZE = 140;
export const NEBULA_CELL_SIZE = 300;

export function cellAt(position: Position3, size: number): Cell3 {
  return { x: Math.floor(position.x / size), y: Math.floor(position.y / size), z: Math.floor(position.z / size) };
}
export function cellKey(cell: Cell3): string { return `${cell.x}:${cell.y}:${cell.z}`; }

function hash(seed: number, x: number, y: number, z: number, salt: number): number {
  let value = (seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}
const unit = (value: number): number => value / 0x100000000;
const smooth = (value: number): number => value * value * (3 - 2 * value);

export class SpatialField {
  readonly seed: number;
  constructor(seed: number) { this.seed = seed; }

  private noise(position: Position3, wavelength: number, salt: number): number {
    const x = position.x / wavelength, y = position.y / wavelength, z = position.z / wavelength;
    const cell = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
    const fx = smooth(x - cell.x), fy = smooth(y - cell.y), fz = smooth(z - cell.z);
    let sum = 0;
    for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) for (let dz = 0; dz <= 1; dz++) {
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
      sum += weight * unit(hash(this.seed, cell.x + dx, cell.y + dy, cell.z + dz, salt));
    }
    return sum;
  }

  regionAt(position: Position3): RegionAttributes {
    return {
      asteroidDensity: 0.8 + this.noise(position, 900, 0x31a5) * 0.4,
      nebulaDensity: 0.75 + this.noise(position, 1300, 0x7e91) * 0.5,
    };
  }

  asteroidSite(cell: Cell3): SpatialSite | undefined {
    const seed = hash(this.seed, cell.x, cell.y, cell.z, 0xa57e);
    const position = {
      x: (cell.x + unit(hash(seed, 1, 0, 0, 0x11))) * ASTEROID_CELL_SIZE,
      y: (cell.y + unit(hash(seed, 0, 1, 0, 0x22))) * ASTEROID_CELL_SIZE,
      z: (cell.z + unit(hash(seed, 0, 0, 1, 0x33))) * ASTEROID_CELL_SIZE,
    };
    if (Math.hypot(position.x, position.y, position.z) < 70) return;
    if (unit(hash(seed, 0, 0, 0, 0x44)) >= 0.35 * this.regionAt(position).asteroidDensity) return;
    return { id: `asteroid:${cellKey(cell)}`, position, seed };
  }

  nebulaSite(cell: Cell3): SpatialSite | undefined {
    const seed = hash(this.seed, cell.x, cell.y, cell.z, 0xb917);
    const position = {
      x: (cell.x + unit(hash(seed, 1, 0, 0, 0x55))) * NEBULA_CELL_SIZE,
      y: (cell.y + unit(hash(seed, 0, 1, 0, 0x66))) * NEBULA_CELL_SIZE,
      z: (cell.z + unit(hash(seed, 0, 0, 1, 0x77))) * NEBULA_CELL_SIZE,
    };
    if (unit(hash(seed, 0, 0, 0, 0x88)) >= 0.42 * this.regionAt(position).nebulaDensity) return;
    return { id: `nebula:${cellKey(cell)}`, position, seed };
  }
}
