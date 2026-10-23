export class AudioManager {
  muted = false;
  private context?: AudioContext;
  private lastShot = 0;
  private engine?: { osc: OscillatorNode; gain: GainNode };
  private ctx(): AudioContext | undefined {
    if (this.muted) return;
    try { this.context ??= new AudioContext(); if (this.context.state === 'suspended') void this.context.resume(); return this.context; } catch { return; }
  }
  setMuted(value: boolean): void { this.muted = value; if (this.engine) this.engine.gain.gain.value = value ? 0 : 0.012; }
  tone(freq: number, duration: number, type: OscillatorType = 'sawtooth', volume = 0.05, sweep = 0): void {
    const ctx = this.ctx(); if (!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain(), now = ctx.currentTime;
    osc.type = type; osc.frequency.setValueAtTime(freq, now); if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), now + duration);
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(ctx.destination); osc.start(now); osc.stop(now + duration);
  }
  shot(): void { const t = performance.now(); if (t - this.lastShot < 65) return; this.lastShot = t; this.tone(580, 0.1, 'sawtooth', 0.026, -430); }
  hit(): void { this.tone(120, 0.13, 'triangle', 0.045, -80); }
  explosion(): void { this.tone(180, 0.5, 'sawtooth', 0.08, -150); this.tone(78, 0.65, 'triangle', 0.06, -50); }
  pickup(): void { this.tone(440, 0.18, 'sine', 0.06, 400); setTimeout(() => this.tone(690, 0.23, 'sine', 0.05, 350), 90); }
  phase(): void { for (let i = 0; i < 3; i++) setTimeout(() => this.tone(330 * 2 ** (i * 0.25), 0.2, 'sine', 0.06), i * 115); }
  gameOver(): void { for (let i = 0; i < 3; i++) setTimeout(() => this.tone(250 - i * 55, 0.32, 'triangle', 0.07), i * 200); }
  engineSound(speedRatio: number): void {
    const ctx = this.ctx(); if (!ctx) return;
    if (!this.engine) { const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = 'sawtooth'; gain.gain.value = 0.012; osc.connect(gain).connect(ctx.destination); osc.start(); this.engine = { osc, gain }; }
    this.engine.osc.frequency.setTargetAtTime(47 + speedRatio * 75, ctx.currentTime, 0.15);
    this.engine.gain.gain.setTargetAtTime(this.muted ? 0 : 0.005 + speedRatio * 0.012, ctx.currentTime, 0.15);
  }
  stopEngine(): void { if (this.engine) { this.engine.gain.gain.value = 0; this.engine.osc.stop(); this.engine = undefined; } }
}
