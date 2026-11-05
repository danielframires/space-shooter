import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/audio.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export class AudioManager', 'class AudioManager');
const script = ts.transpileModule(`const neonUrgencyUrl = '/assets/neon-urgency.mp3';\n${source}\nglobalThis.AudioManager = AudioManager;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

const played = [];
class FakeAudio {
  constructor(url) { this.url = url; this.currentTime = 0; this.playbackRate = 1; played.push(this); }
  play() { this.plays = (this.plays ?? 0) + 1; return Promise.resolve(); }
  pause() { this.pauses = (this.pauses ?? 0) + 1; }
}
const parameter = value => ({ value, calls: [], setTargetAtTime(target, time, smoothing) { this.calls.push({ target, time, smoothing }); } });
class FakeContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sources = 0; }
  createMediaElementSource() { this.sources++; return { connect(next) { return next; } }; }
  createBiquadFilter() { return { frequency: parameter(0), connect(next) { return next; } }; }
  createGain() { return { gain: parameter(0), connect(next) { return next; } }; }
  get destination() { return {}; }
}
const sandbox = { Audio: FakeAudio, AudioContext: FakeContext };
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const manager = new sandbox.AudioManager();

manager.startMusic();
assert.equal(played.length, 1);
assert.equal(played[0].url, '/assets/neon-urgency.mp3');
assert.equal(played[0].loop, true);
assert.equal(played[0].plays, 1);
const context = manager.context;
assert.equal(context.sources, 1);

context.currentTime = 1;
manager.updateMusic({ speedRatio: 0, phase: 1, healthRatio: 1, firing: false, nearbyEnemies: 0 });
const calmGain = manager.musicGain.gain.calls.at(-1).target;
const calmCutoff = manager.musicFilter.frequency.calls.at(-1).target;
context.currentTime = 1.2;
manager.updateMusic({ speedRatio: 1, phase: 20, healthRatio: 0, firing: true, nearbyEnemies: 7 });
assert.ok(manager.musicGain.gain.calls.at(-1).target > calmGain);
assert.ok(manager.musicFilter.frequency.calls.at(-1).target > calmCutoff);
assert.equal(played[0].playbackRate, 1);

manager.pauseMusic();
assert.equal(played[0].pauses, 1);
manager.resumeMusic();
assert.equal(played[0].plays, 2);
manager.setMuted(true);
assert.equal(played[0].pauses, 2);
manager.setMuted(false);
assert.equal(played[0].plays, 3);
manager.stopMusic();
assert.equal(played[0].pauses, 3);
assert.equal(played[0].currentTime, 0);
manager.startMusic();
assert.equal(played[0].plays, 4);
assert.equal(context.sources, 1);

const original = readFileSync(new URL('../src/assets/neon-urgency.mp3', import.meta.url));
const packagedName = readdirSync(new URL('../dist/assets/', import.meta.url)).find(name => /^neon-urgency-.*\.mp3$/.test(name));
assert.ok(packagedName, 'MP3 incluído na compilação');
const packaged = readFileSync(new URL(`../dist/assets/${packagedName}`, import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(original), hash(packaged), 'MP3 da compilação idêntico ao original');
console.log(`Áudio OK: ciclo de vida, reação discreta e MP3 idêntico (${original.length} bytes).`);
