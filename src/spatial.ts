export interface Position3 { x: number; y: number; z: number }

export interface SpatialTarget {
  id: string;
  name: string;
  position: Position3;
}

export interface PersistentAnchor extends SpatialTarget {
  kind: 'boss' | 'mothership' | 'abandonedStation' | 'portal';
  modelId?: string;
  destinationId?: string;
}

export interface SpatialRelation {
  offset: Position3;
  direction: Position3;
  distance: number;
}

export interface SymbolicCoordinates { spiral: number; knot: number; rune: number }

// Fixed orthonormal basis. No displayed component is the engine's vertical axis.
export function symbolicCoordinates(position: Position3): SymbolicCoordinates {
  return {
    spiral: (position.x + position.y + position.z) / Math.sqrt(3),
    knot: (position.x - position.y) / Math.sqrt(2),
    rune: (position.x + position.y - 2 * position.z) / Math.sqrt(6),
  };
}

export function positionFromSymbolic(coordinates: SymbolicCoordinates): Position3 {
  const { spiral, knot, rune } = coordinates;
  return {
    x: spiral / Math.sqrt(3) + knot / Math.sqrt(2) + rune / Math.sqrt(6),
    y: spiral / Math.sqrt(3) - knot / Math.sqrt(2) + rune / Math.sqrt(6),
    z: spiral / Math.sqrt(3) - 2 * rune / Math.sqrt(6),
  };
}

export function spatialRelation(from: Position3, to: Position3): SpatialRelation {
  const offset = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const distance = Math.hypot(offset.x, offset.y, offset.z);
  const direction = distance > 0
    ? { x: offset.x / distance, y: offset.y / distance, z: offset.z / distance }
    : { x: 0, y: 0, z: 0 };
  return { offset, direction, distance };
}

export class SpatialFrame {
  private origin = { x: 0, y: 0, z: 0 };

  getOrigin(): Position3 { return { ...this.origin }; }
  setOrigin(position: Position3): void { this.origin = { ...position }; }
  reset(): void { this.origin = { x: 0, y: 0, z: 0 }; }
  shift(localOffset: Position3): void {
    this.origin.x += localOffset.x;
    this.origin.y += localOffset.y;
    this.origin.z += localOffset.z;
  }
  toGlobal(local: Position3): Position3 {
    return { x: this.origin.x + local.x, y: this.origin.y + local.y, z: this.origin.z + local.z };
  }
  toLocal(global: Position3): Position3 {
    return { x: global.x - this.origin.x, y: global.y - this.origin.y, z: global.z - this.origin.z };
  }
}

export class AnchorRegistry<T extends SpatialTarget = PersistentAnchor> {
  private readonly anchors = new Map<string, T>();

  register(anchor: T): void {
    if (this.anchors.has(anchor.id)) throw new Error(`Âncora espacial duplicada: ${anchor.id}`);
    this.anchors.set(anchor.id, { ...anchor, position: { ...anchor.position } });
  }
  get(id: string): T | undefined { return this.anchors.get(id); }
  remove(id: string): boolean { return this.anchors.delete(id); }
  nearest(from: Position3, matches: (anchor: T) => boolean = () => true): { target: T; relation: SpatialRelation } | undefined {
    let closest: { target: T; relation: SpatialRelation } | undefined;
    for (const target of this.anchors.values()) {
      if (!matches(target)) continue;
      const relation = spatialRelation(from, target.position);
      if (!closest || relation.distance < closest.relation.distance) closest = { target, relation };
    }
    return closest;
  }
}
