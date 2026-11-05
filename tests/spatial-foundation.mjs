import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import ts from 'typescript';
import { CONFIG } from '../src/config.ts';
import { AnchorRegistry, SpatialFrame, positionFromSymbolic, spatialRelation, symbolicCoordinates } from '../src/spatial.ts';
import { SpatialField, cellAt, cellKey } from '../src/regions.ts';

const frame = new SpatialFrame();
const local = { x: 240, y: -80, z: -810 };
const global = frame.toGlobal(local);
frame.shift(local);
assert.deepEqual(frame.toGlobal({ x: 0, y: 0, z: 0 }), global, 'A origem móvel preserva a posição global');
assert.deepEqual(frame.toLocal(global), { x: 0, y: 0, z: 0 });
const relation = spatialRelation({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 });
assert.equal(relation.distance, 13);
assert.deepEqual(relation.offset, { x: 3, y: 4, z: 12 });
assert.equal(Math.hypot(...Object.values(relation.direction)), 1);
assert.equal(spatialRelation(global, global).distance, 0);
const symbolic = symbolicCoordinates(global), recovered = positionFromSymbolic(symbolic);
assert.ok(Math.hypot(recovered.x - global.x, recovered.y - global.y, recovered.z - global.z) < 1e-10, 'Coordenadas simbólicas são reversíveis');
assert.ok(Object.values(symbolicCoordinates({ x: 0, y: 100, z: 0 })).every(value => value !== 0), 'Nenhum símbolo representa sozinho a vertical interna');
frame.reset();
assert.deepEqual(frame.getOrigin(), { x: 0, y: 0, z: 0 });

const anchors = new AnchorRegistry();
anchors.register({ id: 'boss-1', name: 'Nave-mãe', kind: 'mothership', position: { x: 9000, y: 30, z: 0 } });
anchors.register({ id: 'portal-a', name: 'Portal A', kind: 'portal', destinationId: 'portal-b', position: { x: -2000, y: 0, z: 0 } });
anchors.register({ id: 'portal-b', name: 'Portal B', kind: 'portal', destinationId: 'portal-a', position: { x: 20000, y: 0, z: 0 } });
assert.equal(anchors.nearest({ x: 0, y: 0, z: 0 }).target.id, 'portal-a');
assert.equal(anchors.nearest({ x: 0, y: 0, z: 0 }, anchor => anchor.kind === 'mothership').target.id, 'boss-1');
assert.equal(anchors.get('portal-a').destinationId, 'portal-b');
assert.throws(() => anchors.register({ id: 'portal-a', name: 'Duplicado', kind: 'portal', position: global }));

const field = new SpatialField(CONFIG.seed), otherField = new SpatialField(CONFIG.seed);
assert.deepEqual(field.regionAt({ x: -1234, y: 567, z: -89 }), otherField.regionAt({ x: -1234, y: 567, z: -89 }));
assert.deepEqual(field.asteroidSite({ x: -2, y: 0, z: 3 }), otherField.asteroidSite({ x: -2, y: 0, z: 3 }));
assert.deepEqual(field.nebulaSite({ x: 1, y: -3, z: 2 }), otherField.nebulaSite({ x: 1, y: -3, z: 2 }));
assert.equal(cellKey(cellAt({ x: -0.01, y: 140, z: -141 }, 140)), '-1:1:-2');
const region = field.regionAt({ x: 1200, y: -3400, z: 50 });
assert.ok(region.asteroidDensity >= 0.8 && region.asteroidDensity <= 1.2);
assert.ok(region.nebulaDensity >= 0.75 && region.nebulaDensity <= 1.25);
assert.ok(Math.abs(field.regionAt({ x: 1200.1, y: -3400, z: 50 }).asteroidDensity - region.asteroidDensity) < 0.01, 'Densidade contínua');

const procedural = readFileSync(new URL('../src/procedural.ts', import.meta.url), 'utf8');
const classes = procedural.slice(procedural.indexOf('export class RNG'), procedural.indexOf('const metal'))
  + procedural.slice(procedural.indexOf('export class World'));
const code = ts.transpileModule(classes.replaceAll('export class ', 'class ') + '\nglobalThis.World = World; globalThis.RNG = RNG;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const canvas = () => ({ width: 128, height: 128, getContext: () => ({
  createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
}) });
const sandbox = {
  THREE, CONFIG, SpatialFrame, SpatialField, cellAt, cellKey,
  ASTEROID_CELL_SIZE: 140, NEBULA_CELL_SIZE: 300,
  metal: color => new THREE.MeshStandardMaterial({ color }),
  galaxyTexture: () => new THREE.CanvasTexture(canvas()),
  document: { createElement: canvas },
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const scene = new THREE.Scene(), worldFrame = new SpatialFrame();
const world = new sandbox.World(scene, new sandbox.RNG(CONFIG.seed), worldFrame, field);
const player = new THREE.Vector3();
world.update(0, player);
const initialIds = world.asteroids.map(a => a.site?.id).filter(Boolean).sort();
const initialNebulas = [...world.activeNebulas.keys()].sort();
const initialSceneCount = scene.children.length;
assert.ok(initialIds.length >= 10 && initialIds.length <= 55, 'Quantidade inicial de asteroides controlada');
assert.ok(initialNebulas.length >= 2 && initialNebulas.length <= 25, 'Quantidade inicial de névoas controlada');
const initialShape = new Map(world.asteroids.filter(a => a.site).map(a => [a.site.id, [a.baseRadius, a.longAxis, ...a.spin.toArray()]]));

const asteroid = world.asteroids.find(a => a.site);
const beforeShift = worldFrame.toGlobal(asteroid.mesh.position);
const offset = new THREE.Vector3(810, -220, 450);
worldFrame.shift(offset); world.shift(offset);
const afterShift = worldFrame.toGlobal(asteroid.mesh.position);
assert.ok(Math.hypot(beforeShift.x - afterShift.x, beforeShift.y - afterShift.y, beforeShift.z - afterShift.z) < 1e-8, 'Objeto mantém posição global após recentralização');
worldFrame.shift(offset.clone().negate()); world.shift(offset.clone().negate());

const travelTo = target => {
  const previous = worldFrame.getOrigin();
  const shift = new THREE.Vector3(target.x - previous.x, target.y - previous.y, target.z - previous.z);
  worldFrame.shift(shift); world.shift(shift); world.update(1, player);
};
travelTo({ x: 1500, y: 800, z: -1100 });
travelTo({ x: 0, y: 0, z: 0 });
assert.deepEqual(world.asteroids.map(a => a.site?.id).filter(Boolean).sort(), initialIds, 'Mesma região gera os mesmos asteroides ao retornar');
assert.deepEqual([...world.activeNebulas.keys()].sort(), initialNebulas, 'Mesma região gera as mesmas névoas ao retornar');
assert.equal(scene.children.length, initialSceneCount, 'Streaming não acumula objetos na cena');
for (const a of world.asteroids) if (a.site) assert.deepEqual([a.baseRadius, a.longAxis, ...a.spin.toArray()], initialShape.get(a.site.id));

const target = world.asteroids.find(a => a.site && a.longAxis === null);
const destroyedId = target.site.id;
world.destroyAsteroid(target, player);
assert.ok(!world.asteroids.some(a => a.site?.id === destroyedId));
travelTo({ x: -1300, y: 0, z: 900 });
travelTo({ x: 0, y: 0, z: 0 });
assert.ok(!world.asteroids.some(a => a.site?.id === destroyedId), 'Asteroide destruído não reaparece na mesma partida');
const large = world.asteroids.find(a => a.site && a.longAxis !== null);
assert.ok(large, 'Há um asteroide alongado no setor inicial');
const largeId = large.site.id, countBeforeSplit = world.asteroids.length;
world.destroyAsteroid(large, player);
assert.equal(world.asteroids.length, countBeforeSplit + 1, 'Asteroide alongado gera dois fragmentos');
assert.ok(!world.asteroids.some(a => a.site?.id === largeId));
world.reset();
assert.ok(world.asteroids.some(a => a.site?.id === destroyedId), 'Nova partida restaura geração espacial');
assert.ok(world.asteroids.some(a => a.site?.id === largeId));
assert.equal(scene.children.length, initialSceneCount, 'Nova partida remove fragmentos da missão anterior');

const streamedCounts = [];
for (let i = 1; i <= 12; i++) {
  travelTo({ x: i * 377, y: Math.sin(i) * 530, z: -i * 221 });
  streamedCounts.push({ asteroids: world.asteroids.length, nebulas: world.nebulas.length });
  assert.ok(world.asteroids.length <= 60 && world.nebulas.length <= 25, 'Conteúdo próximo permanece limitado');
}

console.log(JSON.stringify({ asteroids: initialIds.length, nebulas: initialNebulas.length, maxStreamedAsteroids: Math.max(...streamedCounts.map(x => x.asteroids)), maxStreamedNebulas: Math.max(...streamedCounts.map(x => x.nebulas)), region, originShift: 'ok', revisit: 'ok', destruction: 'ok', anchors: 'ok' }));
