import neonUrgencyUrl from './assets/neon-urgency.mp3?url';
import type { MusicState } from './music';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export class AudioManager {
  muted = false;
  private context?: AudioContext;
  private lastShot = 0;
  private engine?: { osc: OscillatorNode; gain: GainNode };
  private music?: HTMLAudioElement;
  private musicFilter?: BiquadFilterNode;
  private musicGain?: GainNode;
  private musicPlaying = false;
  private musicPaused = false;
  private lastMusicControl = -1;
  private ctx(): AudioContext | undefined {
    if (this.muted) return;
    try { this.context ??= new AudioContext(); if (this.context.state === 'suspended') void this.context.resume(); return this.context; } catch { return; }
  }
  setMuted(value: boolean): void {
    this.muted = value;
    if (this.engine) this.engine.gain.gain.value = value ? 0 : 0.012;
    if (value) this.music?.pause();
    else if (this.musicPlaying && !this.musicPaused) this.resumeMusic();
  }
  private ensureMusic(ctx: AudioContext): HTMLAudioElement {
    if (this.music) return this.music;
    const music = new Audio(neonUrgencyUrl);
    music.preload = 'auto';
    music.loop = true;
    const source = ctx.createMediaElementSource(music);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 15000;
    const gain = ctx.createGain(); gain.gain.value = 0.82;
    source.connect(filter).connect(gain).connect(ctx.destination);
    this.music = music; this.musicFilter = filter; this.musicGain = gain;
    return music;
  }
  private playMusic(music: HTMLAudioElement): void {
    void music.play().catch(error => console.warn('Não foi possível reproduzir a trilha sonora.', error));
  }
  startMusic(): void {
    this.musicPlaying = true;
    this.musicPaused = false;
    const ctx = this.ctx();
    if (!ctx) return;
    const music = this.ensureMusic(ctx);
    music.currentTime = 0;
    this.lastMusicControl = -1;
    this.playMusic(music);
  }
  pauseMusic(): void { this.musicPaused = true; this.music?.pause(); }
  resumeMusic(): void {
    if (!this.musicPlaying) return;
    this.musicPaused = false;
    const ctx = this.ctx();
    if (!ctx) return;
    this.playMusic(this.ensureMusic(ctx));
  }
  stopMusic(): void { this.musicPlaying = false; this.musicPaused = false; this.music?.pause(); if (this.music) this.music.currentTime = 0; }
  updateMusic(state: MusicState): void {
    if (!this.musicPlaying || this.musicPaused || this.muted) return;
    const ctx = this.context;
    if (!ctx || !this.musicGain || !this.musicFilter || ctx.currentTime - this.lastMusicControl < 0.1) return;
    const intensity = clamp(
      clamp(state.speedRatio, 0, 1) * 0.4
      + clamp(state.nearbyEnemies / 5, 0, 1) * 0.25
      + clamp((state.phase - 1) / 12, 0, 1) * 0.12
      + (state.firing ? 0.08 : 0)
      + (1 - clamp(state.healthRatio, 0, 1)) * 0.15,
      0, 1,
    );
    this.musicGain.gain.setTargetAtTime(0.77 + intensity * 0.16, ctx.currentTime, 0.35);
    this.musicFilter.frequency.setTargetAtTime(11500 + intensity * 6500, ctx.currentTime, 0.5);
    this.lastMusicControl = ctx.currentTime;
  }
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
