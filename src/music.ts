export interface MusicState {
  speedRatio: number;
  phase: number;
  healthRatio: number;
  firing: boolean;
  nearbyEnemies: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
const MUSIC_GAIN = 2.5;

// Original modal harmony: suspended space pads behind a steady dance pulse.
const chords = [
  { root: 38, pad: [0, 7, 14], keys: [0, 3, 7], lead: [0, 3, 7] }, // Dm add9
  { root: 43, pad: [0, 7, 14], keys: [0, 4, 7], lead: [0, 4, 7] }, // G add9
  { root: 36, pad: [0, 7, 11], keys: [0, 4, 11], lead: [0, 4, 7] }, // Cmaj7
  { root: 45, pad: [0, 7, 14], keys: [0, 5, 7], lead: [0, 5, 7] }, // Asus2/4
];

export class ProceduralMusic {
  private readonly output: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly keysFilter: BiquadFilterNode;
  private readonly melodicBus: GainNode;
  private readonly pad: OscillatorNode[] = [];
  private readonly noise: AudioBuffer;
  private readonly theremin: OscillatorNode;
  private readonly thereminGain: GainNode;
  private active = false;
  private muted = false;
  private nextBeat = 0;
  private beat = 0;
  private chord = 0;
  private lastControl = -1;
  private randomState = 0x51ace;
  private mood: MusicState = { speedRatio: 0.3, phase: 1, healthRatio: 1, firing: false, nearbyEnemies: 0 };

  constructor(private readonly context: AudioContext) {
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.output.connect(context.destination);
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 600;
    this.filter.Q.value = 0.25;
    this.filter.connect(this.output);
    this.melodicBus = context.createGain(); this.melodicBus.connect(this.output);
    const delay = context.createDelay(0.8), feedback = context.createGain(), echo = context.createGain();
    delay.delayTime.value = 0.29; feedback.gain.value = 0.14; echo.gain.value = 0.18;
    this.melodicBus.connect(delay); delay.connect(feedback).connect(delay); delay.connect(echo).connect(this.output);
    this.keysFilter = context.createBiquadFilter(); this.keysFilter.type = 'lowpass'; this.keysFilter.frequency.value = 1250;
    this.keysFilter.connect(this.melodicBus);
    this.noise = context.createBuffer(1, Math.floor(context.sampleRate * 0.36), context.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = this.random() * 2 - 1;
    for (let i = 0; i < 3; i++) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = i === 1 ? 'triangle' : 'sine';
      oscillator.frequency.value = hz(50 + chords[0].pad[i]);
      gain.gain.value = i === 1 ? 0.005 : 0.008;
      oscillator.connect(gain).connect(this.filter);
      oscillator.start();
      this.pad.push(oscillator);
    }
    this.theremin = context.createOscillator(); this.theremin.type = 'triangle'; this.theremin.frequency.value = hz(57);
    this.thereminGain = context.createGain(); this.thereminGain.gain.value = 0;
    const thereminFilter = context.createBiquadFilter(); thereminFilter.type = 'lowpass'; thereminFilter.frequency.value = 630;
    this.theremin.connect(this.thereminGain).connect(thereminFilter).connect(this.melodicBus); this.theremin.start();
    const vibrato = context.createOscillator(), vibratoDepth = context.createGain();
    vibrato.frequency.value = 4.4; vibratoDepth.gain.value = 1.5;
    vibrato.connect(vibratoDepth).connect(this.theremin.frequency); vibrato.start();
  }

  start(): void {
    const now = this.context.currentTime;
    this.active = true;
    this.beat = 0;
    this.chord = 0;
    this.lastControl = -1;
    this.mood = { speedRatio: 0.3, phase: 1, healthRatio: 1, firing: false, nearbyEnemies: 0 };
    this.nextBeat = now + 0.15;
    this.thereminGain.gain.cancelScheduledValues(now);
    this.thereminGain.gain.setValueAtTime(0, now);
    this.setChord(now);
    this.fadeTo(this.muted ? 0 : MUSIC_GAIN, 0.8);
  }

  pause(): void { this.active = false; this.fadeTo(0, 0.18); }

  resume(): void {
    this.active = true;
    this.nextBeat = this.context.currentTime + 0.12;
    this.fadeTo(this.muted ? 0 : MUSIC_GAIN, 0.35);
  }

  stop(): void { this.active = false; this.fadeTo(0, 0.65); }

  setMuted(value: boolean): void {
    this.muted = value;
    this.fadeTo(value || !this.active ? 0 : MUSIC_GAIN, 0.12);
  }

  update(state: MusicState): void {
    if (!this.active) return;
    const now = this.context.currentTime;
    if (now - this.lastControl >= 0.1) {
      this.mood = {
        speedRatio: clamp(state.speedRatio, 0, 1),
        phase: Math.max(1, Math.floor(state.phase)),
        healthRatio: clamp(state.healthRatio, 0, 1),
        firing: state.firing,
        nearbyEnemies: Math.max(0, state.nearbyEnemies),
      };
      const danger = clamp(this.mood.nearbyEnemies / 5, 0, 1);
      const brightness = 500 + this.mood.speedRatio * 230 + danger * 130;
      this.filter.frequency.setTargetAtTime(brightness, now, 0.8);
      this.keysFilter.frequency.setTargetAtTime(980 + this.mood.speedRatio * 430 + danger * 190 + (this.mood.firing ? 80 : 0), now, 0.45);
      this.lastControl = now;
    }
    if (this.nextBeat < now - 0.3) this.nextBeat = now + 0.03;
    let scheduled = 0;
    while (this.nextBeat < now + 0.16 && scheduled++ < 2) {
      const tempo = clamp(108 + this.mood.speedRatio * 8 + Math.min(this.mood.phase - 1, 12) * 0.6 + Math.min(this.mood.nearbyEnemies, 6) * 1.1, 108, 126);
      const beatDuration = 60 / tempo;
      this.scheduleBeat(this.nextBeat, beatDuration);
      this.nextBeat += beatDuration;
    }
  }

  private fadeTo(target: number, seconds: number): void {
    const gain = this.output.gain, now = this.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(target, now, Math.max(0.02, seconds / 3));
  }

  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }

  private transpose(): number { return [0, 2, 5, 7][Math.floor((this.mood.phase - 1) / 3) % 4]; }

  private setChord(time: number): void {
    const chord = chords[this.chord], transpose = this.transpose();
    this.pad.forEach((oscillator, i) => oscillator.frequency.setTargetAtTime(hz(50 + chord.pad[i] + transpose + chord.root - 38), time, 1.1));
  }

  private scheduleBeat(time: number, beatDuration: number): void {
    if (this.beat > 0 && this.beat % 8 === 0) {
      this.chord = (this.chord + 1) % chords.length;
      this.setChord(time);
    }
    const chord = chords[this.chord], danger = clamp(this.mood.nearbyEnemies / 5, 0, 1);
    const lowHealth = 1 - this.mood.healthRatio;
    // Four-on-the-floor pulse, backbeat and offbeat hats; small fills follow danger.
    this.kick(time, 0.039 + danger * 0.005);
    if (this.beat % 2 === 1) {
      this.noiseDrum(time, 0.15, 0.019, 'bandpass', 1700);
      this.noiseDrum(time + 0.025, 0.09, 0.006, 'highpass', 2800);
    }
    this.noiseDrum(time + beatDuration * 0.5, 0.065, 0.007, 'highpass', 5600);
    if (danger > 0.35 && this.beat % 4 === 3) this.noiseDrum(time + beatDuration * 0.75, 0.04, 0.003, 'highpass', 6400);

    // The bass and keyboard answer the kick rather than sustaining sad chords.
    const offbeat = time + beatDuration * 0.5;
    this.bass(hz(chord.root + 12 + (this.beat % 8 === 7 ? 7 : 0) + this.transpose()), offbeat, 0.025 + lowHealth * 0.005);
    if ([0, 2, 3, 4, 6].includes(this.beat % 8)) this.keyboard(chord, offbeat, 0.008);
    if (this.mood.firing && this.beat % 8 === 7) this.keyboard(chord, time + beatDuration * 0.75, 0.004);

    // Two lower, longer theremin phrases per eight-beat harmony cycle.
    if (this.beat % 8 === 0 || this.beat % 8 === 4) {
      const interval = chord.lead[(this.chord + (this.beat % 8 === 4 ? 1 : 0) + Math.floor(this.random() * 2)) % chord.lead.length];
      let pitch = chord.root + interval + 12 + this.transpose();
      if (pitch < 53) pitch += 12;
      if (pitch > 66) pitch -= 12;
      const gain = this.thereminGain.gain;
      this.theremin.frequency.setTargetAtTime(hz(pitch), time, 0.3);
      gain.cancelScheduledValues(time);
      gain.setValueAtTime(0.0001, time);
      gain.linearRampToValueAtTime(0.012 + danger * 0.002, time + 0.27);
      gain.setValueAtTime(0.012 + danger * 0.002, time + beatDuration * 2.4);
      gain.exponentialRampToValueAtTime(0.0001, time + beatDuration * 3.6);
    }
    this.beat++;
  }

  private keyboard(chord: typeof chords[number], time: number, volume: number): void {
    for (const interval of chord.keys) {
      this.note(hz(chord.root + interval + 24 + this.transpose()), time, 0.3, volume, 'sawtooth', this.keysFilter, 0.008);
    }
  }

  private bass(frequency: number, time: number, volume: number): void {
    const oscillator = this.context.createOscillator(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
    oscillator.type = 'sawtooth'; oscillator.frequency.setValueAtTime(frequency, time);
    filter.type = 'lowpass'; filter.frequency.value = 290;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
    oscillator.connect(filter).connect(gain).connect(this.output);
    oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
    oscillator.start(time); oscillator.stop(time + 0.26);
  }

  private kick(time: number, volume: number): void {
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(155, time);
    oscillator.frequency.exponentialRampToValueAtTime(55, time + 0.19);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.27);
    oscillator.connect(gain).connect(this.output);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(time); oscillator.stop(time + 0.28);
  }

  private noiseDrum(time: number, duration: number, volume: number, type: BiquadFilterType, frequency: number): void {
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
    source.buffer = this.noise; filter.type = type; filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(gain).connect(this.output);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(time); source.stop(time + duration);
  }

  private note(frequency: number, time: number, duration: number, volume: number, type: OscillatorType, destination: AudioNode, attack = 0.07): void {
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }
}
