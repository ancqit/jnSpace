// Original entish rite. The canvas clock is the rite.
// Sound follows that clock only while AudioContext is actually running.
// GSAP eases the daily chores. The rite clock seeks that timeline, so the song and the work stay together.

import gsap from 'gsap';

export type HymnRole = 'call' | 'refrain' | 'answer';

export type RitualPhase = 'scar' | 'gather' | 'raise' | 'pour' | 'unfurl' | 'saved';

export interface HymnLine {
  role: HymnRole;
  phase: RitualPhase;
  kicker: string;
  /** Slow tree-song. Spoken and shown as the rite. */
  sung: string;
  /** What the line is doing, in the common tongue. */
  text: string;
}

export const HYMN: readonly HymnLine[] = [
  {
    role: 'call',
    phase: 'scar',
    kicker: 'THE SAINTS',
    sung: 'Roon thal em bar. The old saints.',
    text: 'The old ents are saints. The fire is their first daily chore.',
  },
  {
    role: 'call',
    phase: 'gather',
    kicker: 'THE FIRE',
    sung: 'Bora nal. Tend the hearth.',
    text: 'They keep the fire. It is the work of the day.',
  },
  {
    role: 'call',
    phase: 'raise',
    kicker: 'THE WATER',
    sung: 'Nal eth ruun. Draw the water.',
    text: 'Water is the next chore. They pour it for the roots.',
  },
  {
    role: 'refrain',
    phase: 'raise',
    kicker: 'THE SONG',
    sung: 'Roon el bar. West wind, our land.',
    text: 'The wind is in the west. My land is best.',
  },
  {
    role: 'call',
    phase: 'pour',
    kicker: 'THE POURING',
    sung: 'Nal eth ruun. Pour it out.',
    text: 'The pouring is daily. The bowl and the roots are filled.',
  },
  {
    role: 'call',
    phase: 'unfurl',
    kicker: 'THE LEAVES',
    sung: 'El bar oon. Open the leaves.',
    text: 'Opening the leaves is a chore, the same as the fire.',
  },
  {
    role: 'answer',
    phase: 'saved',
    kicker: 'THE PLACES',
    sung: 'Roon el bar. Paw, wing, hoof, and root.',
    text: 'The other items are the places of the animals. They set them each day.',
  },
  {
    role: 'refrain',
    phase: 'saved',
    kicker: 'THE KEEPING',
    sung: 'Bora nal. The chores are kept.',
    text: 'The fire still burns. The saints remain, and the jungle stands.',
  },
];

export type ChantAudio = 'pending' | 'playing' | 'blocked' | 'paused';

export interface ChantStatus {
  walking: boolean;
  audio: ChantAudio;
  canSound: boolean;
  line: string;
  sung: string;
  kicker: string;
  phase: RitualPhase;
  heal: number;
  index: number;
  meter: number;
  codeMarks: number;
  hearing: boolean;
  registered: boolean;
}

const CODE = [523.25, 659.25, 783.99, 587.33];
const CODE_GAP = 0.3;
const SA = 196;
const PA = 293.66;

const BPM = 46;
const QUARTER = 60 / BPM;
const LINE_BEATS = 5;
const LINE_SECONDS = QUARTER * LINE_BEATS;
const DORIAN = [146.83, 164.81, 174.61, 196, 220, 246.94, 261.63, 293.66];

const MOTIFS: Record<HymnRole, readonly (readonly number[])[]> = {
  call: [
    [0, 2, 3, 5],
    [5, 3, 2, 0],
    [0, 1, 3, 2],
    [2, 4, 3, 1],
  ],
  refrain: [
    [4, 7, 5, 0],
    [0, 4, 7, 4],
  ],
  answer: [
    [7, 5, 3, 0],
    [5, 4, 2, 0],
  ],
};

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  kind: 'ember' | 'ash' | 'leaf' | 'drop';
}

interface EntSpec {
  x: number;
  h: number;
  seed: number;
}

const ENTS: readonly EntSpec[] = [
  { x: 0.08, h: 0.3, seed: 1 },
  { x: 0.2, h: 0.42, seed: 2.2 },
  { x: 0.33, h: 0.34, seed: 3.4 },
  { x: 0.67, h: 0.36, seed: 4.1 },
  { x: 0.8, h: 0.44, seed: 5 },
  { x: 0.93, h: 0.28, seed: 6.2 },
];

function mixHex(from: string, to: string, t: number): string {
  const amount = Math.max(0, Math.min(1, t));
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = parse(from);
  const b = parse(to);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStars(count: number): Star[] {
  const rand = mulberry32(0x5eed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: rand(),
      y: rand() * 0.58,
      r: 0.4 + rand() * 1.25,
      phase: rand() * Math.PI * 2,
    });
  }
  return stars;
}

function createAudioContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor();
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  try {
    spaced.letterSpacing = value;
  } catch {
    // Older canvases ignore tracking.
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export class EntChant {
  private readonly stars = makeStars(90);
  private readonly reduce: boolean;
  private readonly onChange: (status: ChantStatus) => void;
  private ctx2d: CanvasRenderingContext2D | null;
  private audio: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;
  private nodes: OscillatorNode[] = [];
  private graphReady = false;
  private scoreOn = false;
  private paused = false;
  private started = false;
  private destroyed = false;
  private canSound = true;
  private heardState = false;
  private elapsedMs = 0;
  private lastNow = 0;
  private nextNoteVisual = 0;
  private energy = 0;
  private fadeToken = 0;
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private motes: Mote[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private lastEmitKey = '';
  private spokenIndex = -1;
  private heardCode = false;
  private readonly pose = { fire: 0.9, water: 0, leaves: 0, places: 0.15, arm: 0.22, lean: 0.2 };
  private chores: gsap.core.Timeline | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    onChange: (status: ChantStatus) => void,
  ) {
    this.onChange = onChange;
    this.ctx2d = canvas.getContext('2d');
    this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    window.addEventListener('resize', this.resize);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.paused = false;
    this.lastNow = performance.now();
    this.resize();
    this.draw();
    this.emit(true);
    this.raf = requestAnimationFrame(this.frame);
    this.trySound();
  }

  pause(): void {
    if (this.destroyed || this.paused) return;
    this.paused = true;
    this.lastNow = performance.now();
    this.scoreOn = false;
    this.spokenIndex = -1;
    this.heardCode = false;
    this.stopScheduler();
    window.speechSynthesis?.cancel();
    this.fadeAndSuspend();
    this.emit(true);
  }

  resume(): void {
    if (this.destroyed) return;
    this.paused = false;
    this.lastNow = performance.now();
    this.trySound();
    this.emit(true);
  }

  destroy(): void {
    this.destroyed = true;
    this.paused = true;
    this.scoreOn = false;
    this.stopScheduler();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resize);
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
    }
    window.speechSynthesis?.cancel();
    this.chores?.kill();
    void this.audio?.close();
  }

  private trySound(): void {
    if (!this.audio) this.audio = createAudioContext();
    if (!this.audio) {
      this.canSound = false;
      this.heardState = true;
      this.emit(true);
      return;
    }
    const audio = this.audio;
    window.speechSynthesis?.resume();
    if (!audio.onstatechange) {
      audio.onstatechange = () => {
        if (this.destroyed) return;
        if (audio.state === 'running') this.onAudioRunning();
        else {
          this.scoreOn = false;
          this.stopScheduler();
        }
        this.heardState = true;
        this.emit(true);
      };
    }
    // resume() is called in this turn so a click can unlock sound.
    void audio.resume().then(() => {
      if (this.destroyed) return;
      this.heardState = true;
      if (audio.state === 'running') this.onAudioRunning();
      this.emit(true);
    });
    if (audio.state === 'running') this.onAudioRunning();
    window.setTimeout(() => {
      if (this.destroyed) return;
      this.heardState = true;
      if (audio.state === 'running') this.onAudioRunning();
      this.emit(true);
    }, 150);
  }

  private onAudioRunning(): void {
    if (this.paused || this.destroyed || !this.audio) return;
    this.ensureGraph();
    if (this.scoreOn) return;
    this.scoreOn = true;
    this.fadeIn();
    const visualNow = this.elapsedMs / 1000;
    if (this.nextNoteVisual < visualNow) this.nextNoteVisual = visualNow;
    this.spokenIndex = -1;
    this.speakCurrent();
    this.schedule();
  }

  private ensureGraph(): void {
    if (this.graphReady || !this.audio) return;
    const audio = this.audio;
    this.graphReady = true;
    const master = audio.createGain();
    master.gain.value = 0.0001;
    const compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 8;
    compressor.ratio.value = 2.4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    const droneBus = audio.createBiquadFilter();
    droneBus.type = 'lowpass';
    droneBus.frequency.value = 1600;
    droneBus.connect(master);
    master.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(audio.destination);
    this.master = master;
    this.analyser = analyser;
    this.timeData = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    this.drone(droneBus, SA, 'sine', 0.11, 0);
    this.drone(droneBus, SA, 'sine', 0.045, 5);
    this.drone(droneBus, PA, 'sine', 0.05, -4);
    this.drone(droneBus, SA / 2, 'sine', 0.07, 0);
  }

  private drone(
    bus: AudioNode,
    freq: number,
    type: OscillatorType,
    gainValue: number,
    detune: number,
  ): void {
    if (!this.audio) return;
    const osc = this.audio.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const gain = this.audio.createGain();
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(bus);
    osc.start();
    this.nodes.push(osc);
  }

  private fadeIn(): void {
    if (!this.audio || !this.master) return;
    this.fadeToken += 1;
    const now = this.audio.currentTime;
    const gain = this.master.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.0001, gain.value), now);
    gain.linearRampToValueAtTime(1, now + 0.35);
  }

  private fadeAndSuspend(): void {
    if (!this.audio || !this.master) return;
    const token = (this.fadeToken += 1);
    const audio = this.audio;
    const now = audio.currentTime;
    const gain = this.master.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.0001, gain.value), now);
    gain.linearRampToValueAtTime(0.0001, now + 0.07);
    window.setTimeout(() => {
      if (token !== this.fadeToken || !this.paused) return;
      if (audio.state === 'running') void audio.suspend();
    }, 90);
  }

  private schedule = (): void => {
    if (this.destroyed || this.paused || !this.scoreOn || this.audio?.state !== 'running') return;
    const visualNow = this.elapsedMs / 1000;
    const horizon = visualNow + 0.2;
    while (this.nextNoteVisual < horizon) {
      const delay = this.nextNoteVisual - visualNow;
      if (delay < -0.05) {
        this.nextNoteVisual += QUARTER;
        continue;
      }
      this.soundAt(this.audio.currentTime + Math.max(0, delay), this.nextNoteVisual);
      this.nextNoteVisual += QUARTER;
    }
    this.timer = setTimeout(this.schedule, 40);
  };

  private stopScheduler(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private soundAt(when: number, visualTime: number): void {
    if (!this.audio || !this.master) return;
    const lineIndex = this.lineIndexAt(visualTime);
    const beat = Math.floor((visualTime % LINE_SECONDS) / QUARTER + 0.001) % LINE_BEATS;
    const line = HYMN[lineIndex];
    const motifs = MOTIFS[line.role];
    const motif = motifs[lineIndex % motifs.length];
    const bright = Math.round(this.healAmount() * 2);
    const freq = DORIAN[Math.min(DORIAN.length - 1, (motif[beat] ?? 0) + bright)];
    if (beat === 0 || beat === 2) {
      this.call(when, freq, beat === 0 ? 0.2 : 0.16);
      if (line.role === 'refrain') this.respond(when, Math.max(SA / 2, freq / 2), 0.12);
    }
    if (beat === 1) this.respond(when, Math.max(SA, freq * 0.84), 0.11);
    if (beat === 0) this.step(when);
    if (beat === 3 && line.phase === 'saved') this.enigma(when);
  }

  private call(when: number, freq: number, peak: number): void {
    this.voice(when, freq, peak, 'triangle', QUARTER * 0.92, 0.14);
  }

  private respond(when: number, freq: number, peak: number): void {
    this.voice(when, freq, peak, 'sine', QUARTER * 0.88, 0.16);
    this.voice(when, freq * 1.002, peak * 0.7, 'sine', QUARTER * 0.88, 0.16);
    this.voice(when, freq / 2, peak * 0.55, 'sine', QUARTER * 0.8, 0.12);
  }

  private voice(
    when: number,
    freq: number,
    peak: number,
    type: OscillatorType,
    hold: number,
    attack: number,
  ): void {
    if (!this.audio || !this.master) return;
    const start = Math.max(when, this.audio.currentTime);
    const osc = this.audio.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    const filter = this.audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, start);
    filter.frequency.linearRampToValueAtTime(1600, start + hold * 0.5);
    const gain = this.audio.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + hold);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + hold + 0.05);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  private step(when: number): void {
    this.voice(when, SA, 0.1, 'sine', 0.22, 0.02);
  }

  private enigma(when: number): void {
    CODE.forEach((freq, index) => {
      this.bell(when + index * CODE_GAP, freq, 0.52);
    });
  }

  private bell(when: number, freq: number, peak: number): void {
    if (!this.audio || !this.master) return;
    const start = Math.max(when, this.audio.currentTime);
    const osc = this.audio.createOscillator();
    const over = this.audio.createOscillator();
    osc.type = 'sine';
    over.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    over.frequency.setValueAtTime(freq * 2, start);
    const gain = this.audio.createGain();
    const air = this.audio.createGain();
    air.gain.value = 0.35;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
    osc.connect(gain);
    over.connect(air);
    air.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    over.start(start);
    osc.stop(start + 0.6);
    over.stop(start + 0.6);
    osc.onended = () => {
      osc.disconnect();
      over.disconnect();
      air.disconnect();
      gain.disconnect();
    };
  }

  private speakCurrent(): void {
    if (this.paused || this.destroyed || this.audio?.state !== 'running') return;
    const index = this.currentIndex();
    if (index === this.spokenIndex) return;
    this.spokenIndex = index;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const utter = new SpeechSynthesisUtterance(HYMN[index].sung);
    utter.volume = 0.9;
    utter.rate = 0.56;
    utter.pitch = 0.66;
    utter.lang = 'en';
    synth.cancel();
    synth.resume();
    synth.speak(utter);
  }

  private codeState(): { marks: number; hearing: boolean; registered: boolean } {
    const playing = !this.paused && this.audio?.state === 'running';
    if (!playing) return { marks: 0, hearing: false, registered: false };
    if (this.currentLine().phase !== 'saved') {
      return { marks: this.heardCode ? CODE.length : 0, hearing: false, registered: this.heardCode };
    }
    const into = this.lineProgress() * LINE_SECONDS - 3 * QUARTER;
    if (into >= 0 && into < CODE.length * CODE_GAP + 0.35) {
      const marks = Math.min(CODE.length, Math.floor(into / CODE_GAP) + 1);
      if (marks >= CODE.length) this.heardCode = true;
      return { marks, hearing: true, registered: this.heardCode };
    }
    return { marks: this.heardCode ? CODE.length : 0, hearing: false, registered: this.heardCode };
  }

  private frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(48, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    if (!this.paused) this.elapsedMs += dt;
    this.syncChores();
    this.speakCurrent();
    this.sampleEnergy();
    this.updateMotes(this.paused || this.reduce ? 0 : dt);
    this.draw();
    this.emit(false);
    this.raf = requestAnimationFrame(this.frame);
  };

  private sampleEnergy(): void {
    if (!this.analyser || !this.timeData || this.audio?.state !== 'running' || this.paused) {
      this.energy *= 0.86;
      return;
    }
    this.analyser.getByteTimeDomainData(this.timeData);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i += 1) {
      const v = (this.timeData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.timeData.length);
    this.energy = this.energy * 0.72 + rms * 0.28;
  }

  private healAmount(): number {
    const t = this.elapsedMs / 1000;
    const start = 1.15 * LINE_SECONDS;
    const end = 6.05 * LINE_SECONDS;
    if (t >= end) return 1;
    const x = Math.max(0, (t - start) / (end - start));
    return x * x * (3 - 2 * x);
  }

  private eased(progress: number, index: number): number {
    if (this.reduce) return 1;
    const lag = index * 0.08;
    const p = Math.max(0, Math.min(1, (progress - lag) / (1 - lag * 0.5)));
    return p * p * (3 - 2 * p);
  }

  private updateMotes(dt: number): void {
    const heal = this.healAmount();
    if (dt > 0 && this.cssW > 2) {
      const ground = this.cssH * 0.8;
      if (this.pose.fire > 0.45 && Math.random() < dt / 80) {
        this.motes.push({
          x: this.cssW / 2 + (Math.random() - 0.5) * 16,
          y: ground - 18,
          vx: (Math.random() - 0.5) * 10,
          vy: -16 - Math.random() * 28,
          life: 1,
          kind: 'ember',
        });
      }
      if (this.pose.water > 0.45 && Math.random() < dt / 26) {
        this.motes.push({
          x: this.cssW * (0.28 + Math.random() * 0.44),
          y: ground - 70 - Math.random() * 50,
          vx: (Math.random() - 0.5) * 10,
          vy: 28 + Math.random() * 36,
          life: 1,
          kind: 'drop',
        });
      }
      if (this.pose.leaves > 0.35 && Math.random() < dt / 42) {
        this.motes.push({
          x: Math.random() * this.cssW,
          y: ground - 16 - Math.random() * this.cssH * 0.32 * heal,
          vx: -8 - Math.random() * 14,
          vy: -6 - Math.random() * 18,
          life: 1,
          kind: 'leaf',
        });
      }
    }
    const step = dt / 1000;
    for (const mote of this.motes) {
      mote.x += mote.vx * step;
      mote.y += mote.vy * step;
      const fade = mote.kind === 'ash' ? 0.28 : mote.kind === 'leaf' ? 0.22 : mote.kind === 'drop' ? 0.7 : 0.55;
      mote.life -= step * fade;
    }
    if (this.motes.length > 220) this.motes.splice(0, this.motes.length - 220);
    this.motes = this.motes.filter((mote) => mote.life > 0);
  }

  private lineIndexAt(seconds: number): number {
    const length = HYMN.length;
    const raw = Math.floor(seconds / LINE_SECONDS);
    return ((raw % length) + length) % length;
  }

  private syncChores(): void {
    if (!this.chores) this.chores = this.buildChores();
    const duration = this.chores.duration();
    if (duration <= 0) return;
    this.chores.time((this.elapsedMs / 1000) % duration);
  }

  private buildChores(): gsap.core.Timeline {
    const d = LINE_SECONDS;
    const p = this.pose;
    return gsap.timeline({ paused: true })
      .set(p, { fire: 0.9, water: 0, leaves: 0, places: 0.12, arm: 0.22, lean: 0.28 })
      .to(p, { fire: 1, water: 0.05, leaves: 0, places: 0.1, arm: 0.3, lean: 0.62, duration: d, ease: 'sine.inOut' })
      .to(p, { fire: 1, water: 0.08, leaves: 0, places: 0.1, arm: 0.36, lean: 0.84, duration: d, ease: 'sine.inOut' })
      .to(p, { fire: 0.72, water: 0.72, leaves: 0, places: 0.1, arm: 0.88, lean: 0.46, duration: d, ease: 'sine.inOut' })
      .to(p, { fire: 0.64, water: 0.94, leaves: 0.06, arm: 1, lean: 0.34, duration: d, ease: 'sine.inOut' })
      .to(p, { fire: 0.58, water: 1, leaves: 0.12, arm: 0.96, lean: 0.28, duration: d, ease: 'sine.inOut' })
      .to(p, { fire: 0.55, water: 0.32, leaves: 1, places: 0.18, arm: 0.78, lean: 0.16, duration: d, ease: 'sine.inOut' })
      .to(p, { fire: 0.66, water: 0.12, leaves: 0.38, places: 1, arm: 0.6, lean: 0.12, duration: d, ease: 'sine.inOut' })
      .to(p, { fire: 0.9, water: 0.02, leaves: 0.06, places: 0.16, arm: 0.24, lean: 0.3, duration: d, ease: 'sine.inOut' });
  }

  private heldItem(index: number): 'ember' | 'drop' | 'leaf' | null {
    const { fire, water, leaves } = this.pose;
    if (fire >= water && fire >= leaves && fire > 0.55 && (index === 2 || index === 3)) return 'ember';
    if (water >= fire && water >= leaves && water > 0.5 && (index === 1 || index === 4)) return 'drop';
    if (leaves >= fire && leaves >= water && leaves > 0.5 && (index === 0 || index === 5)) return 'leaf';
    return null;
  }

  private currentIndex(): number {
    return this.lineIndexAt(this.elapsedMs / 1000);
  }

  private currentLine(): HymnLine {
    return HYMN[this.currentIndex()];
  }

  private lineProgress(): number {
    const t = (this.elapsedMs / 1000) % LINE_SECONDS;
    return t / LINE_SECONDS;
  }

  private resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = rect.width;
    this.cssH = rect.height;
    const w = Math.max(1, Math.round(rect.width * this.dpr));
    const h = Math.max(1, Math.round(rect.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  };

  private draw(): void {
    const ctx = this.ctx2d;
    if (!ctx || this.cssW < 2 || this.cssH < 2) return;
    const w = this.cssW;
    const h = this.cssH;
    const t = this.elapsedMs / 1000;
    const motion = this.reduce ? 0 : t;
    const line = this.currentLine();
    const progress = this.lineProgress();
    const ground = h * 0.8;
    const heal = this.healAmount();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, mixHex('#1a100c', '#07110e', heal));
    sky.addColorStop(0.55, mixHex('#241610', '#0c1b16', heal));
    sky.addColorStop(1, mixHex('#2a1610', '#10241a', heal));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    if (heal < 0.92) {
      ctx.fillStyle = `rgba(92, 28, 12, ${0.22 * (1 - heal)})`;
      ctx.fillRect(0, 0, w, h);
    }

    const moonGlow = ctx.createRadialGradient(w * 0.78, h * 0.16, 8, w * 0.78, h * 0.16, 90);
    moonGlow.addColorStop(0, 'rgba(214, 222, 204, 0.28)');
    moonGlow.addColorStop(1, 'rgba(214, 222, 204, 0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(w * 0.6, 0, w * 0.4, h * 0.4);
    ctx.fillStyle = '#d7dec7';
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.16, Math.min(22, w * 0.02), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(150, 162, 146, 0.45)';
    ctx.beginPath();
    ctx.arc(w * 0.775, h * 0.15, 4, 0, Math.PI * 2);
    ctx.fill();

    for (const star of this.stars) {
      const twinkle = this.reduce ? 0.75 : 0.45 + Math.sin(motion * 1.4 + star.phase) * 0.35;
      ctx.globalAlpha = Math.max(0.15, twinkle);
      ctx.fillStyle = '#e4ecdf';
      ctx.fillRect(star.x * w, star.y * h, star.r, star.r);
    }
    ctx.globalAlpha = 1;

    this.drawRidge(ctx, w, ground, heal);
    this.drawCanopy(ctx, w, ground, heal, motion);
    const witness = line.phase === 'pour' || line.phase === 'unfurl' || line.phase === 'saved';
    const sat = this.drawSatellite(ctx, w, motion, witness, ground);
    this.drawSignal(ctx, sat.x, sat.y, w / 2, ground - 70, witness);
    this.drawBirds(ctx, w, h, motion, heal);

    const code = this.codeState();
    ENTS.forEach((ent, index) => {
      const lag = this.reduce ? 0 : (1 - this.eased(progress, index)) * 0.16;
      let arm = Math.max(0.08, this.pose.arm - lag);
      let lean = this.pose.lean;
      if (this.pose.fire > 0.8 && this.pose.water < 0.35 && (index === 2 || index === 3)) {
        arm = Math.min(arm, 0.32);
        lean += 0.2;
      }
      const toward = ent.x < 0.5 ? 1 : -1;
      const x = ent.x * w + toward * lean * Math.min(42, w * 0.035);
      this.drawRootLine(ctx, x, ground, w / 2, line.phase, heal);
      this.drawEnt(ctx, x, ground, h * ent.h, motion, ent.seed, arm, heal, line.phase, ent.x < 0.5, index);
      if (index === 4) this.drawRegistration(ctx, x, ground - h * ent.h, code);
    });

    if ((line.phase === 'unfurl' || line.phase === 'saved') && !this.reduce) {
      this.drawPollen(ctx, w / 2, ground - h * 0.2, motion);
    }

    this.drawRitualRing(ctx, w, ground, line.phase, progress, heal);
    this.drawHeart(ctx, w / 2, ground, heal, motion, this.energy);
    this.drawMotes(ctx);
    this.drawGround(ctx, w, h, ground, motion, heal, line.kicker);
    this.drawLocality(ctx, w, ground, this.pose.places);
    this.drawHymn(ctx, w, h, line, this.reduce ? 1 : Math.min(1, 0.72 + progress / 0.2));
    this.drawProgress(ctx, w, h, this.currentIndex(), progress);
  }

  private drawRegistration(
    ctx: CanvasRenderingContext2D,
    x: number,
    crown: number,
    code: { marks: number; hearing: boolean; registered: boolean },
  ): void {
    if (!code.hearing && !code.registered) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(243, 215, 130, 0.9)';
    ctx.fillStyle = '#f3d782';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, crown + 18, 16, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < CODE.length; i += 1) {
      ctx.globalAlpha = i < code.marks ? 1 : 0.28;
      ctx.beginPath();
      ctx.arc(x - 18 + i * 12, crown - 8, i < code.marks ? 3.4 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (code.registered) {
      ctx.font = '700 10px "DM Sans", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('REGISTERED', x, crown - 22);
    }
    ctx.restore();
  }

  private drawRidge(ctx: CanvasRenderingContext2D, w: number, ground: number, heal: number): void {
    ctx.fillStyle = mixHex('#1c1612', '#0c1f18', heal);
    ctx.beginPath();
    ctx.moveTo(0, ground - 20);
    for (let x = 0; x <= w; x += 28) {
      const y = ground - 36 - Math.sin(x * 0.01) * 16 - (x % 56 === 0 ? 22 : 0);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, ground);
    ctx.lineTo(0, ground);
    ctx.fill();
    for (let i = 0; i < 18; i += 1) {
      const x = (i + 0.5) * (w / 18);
      const trunk = 16 + (i % 3) * 8;
      ctx.fillStyle = mixHex('#5c4034', '#10281e', heal);
      ctx.fillRect(x, ground - 24 - trunk, 3, trunk);
      if (heal > 0.05) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, heal);
        ctx.fillStyle = i % 2 === 0 ? '#1c6b3c' : '#145233';
        ctx.beginPath();
        ctx.ellipse(x + 1.5, ground - 28 - trunk - 6 * heal, 8 + 12 * heal, 6 + 8 * heal, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private drawCanopy(
    ctx: CanvasRenderingContext2D,
    w: number,
    ground: number,
    heal: number,
    motion: number,
  ): void {
    if (heal < 0.08) return;
    const crowns = 8;
    for (let i = 0; i < crowns; i += 1) {
      const x = ((i + 0.35) / crowns) * w;
      const rise = (26 + (i % 3) * 16) * heal;
      const bob = this.reduce ? 0 : Math.sin(motion * 0.35 + i) * 2;
      ctx.save();
      ctx.globalAlpha = 0.35 + heal * 0.55;
      ctx.fillStyle = i % 2 === 0 ? '#17693a' : '#0f4e2e';
      ctx.beginPath();
      ctx.ellipse(x, ground - 78 - rise * 0.35 + bob, 26 + heal * 22, 16 + rise * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f8a4a';
      ctx.globalAlpha *= 0.85;
      ctx.beginPath();
      ctx.ellipse(x - 10, ground - 70 - rise * 0.2 + bob, 16 + heal * 8, 10 + heal * 6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawRootLine(
    ctx: CanvasRenderingContext2D,
    x: number,
    ground: number,
    center: number,
    phase: RitualPhase,
    heal: number,
  ): void {
    if (phase !== 'pour' && phase !== 'unfurl' && heal < 0.35) return;
    ctx.save();
    ctx.strokeStyle = `rgba(126, 196, 168, ${0.18 + heal * 0.45})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, ground - 2);
    ctx.quadraticCurveTo((x + center) / 2, ground - 18 - heal * 10, center, ground - 4);
    ctx.stroke();
    ctx.restore();
  }

  private drawRitualRing(
    ctx: CanvasRenderingContext2D,
    w: number,
    ground: number,
    phase: RitualPhase,
    progress: number,
    heal: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = `rgba(214, 176, 122, ${0.2 + heal * 0.45})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(w / 2, ground - 4, w * (0.22 + heal * 0.06), 12 + heal * 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    if ((phase === 'raise' || phase === 'pour') && !this.reduce) {
      ctx.globalAlpha = (1 - progress) * 0.55;
      ctx.strokeStyle = phase === 'pour' ? 'rgba(150, 210, 190, 0.9)' : 'rgba(240, 196, 138, 0.9)';
      ctx.beginPath();
      ctx.ellipse(w / 2, ground - 6, Math.max(12, progress * w * 0.2), 8 + progress * 14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHeart(
    ctx: CanvasRenderingContext2D,
    x: number,
    ground: number,
    heal: number,
    motion: number,
    energy: number,
  ): void {
    const hearth = 0.5 + this.pose.fire * 0.38;
    this.drawFlame(ctx, x, ground, motion, energy * 0.35, hearth);
    this.drawHearthGoods(ctx, x, ground);
    if (heal > 0.12) this.drawSapling(ctx, x - 58, ground, 16 + heal * 72, motion, heal);
  }

  private drawHearthGoods(ctx: CanvasRenderingContext2D, x: number, ground: number): void {
    ctx.save();
    ctx.strokeStyle = '#6a4630';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 18, ground - 14);
    ctx.lineTo(x + 16, ground - 18);
    ctx.moveTo(x - 14, ground - 20);
    ctx.lineTo(x + 18, ground - 12);
    ctx.stroke();
    const bowlX = x + 36;
    ctx.strokeStyle = '#e2c092';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(bowlX, ground - 16, 9, 3.6, 0, 0, Math.PI);
    ctx.stroke();
    if (this.pose.water > 0.08) {
      ctx.fillStyle = `rgba(160, 214, 224, ${0.35 + this.pose.water * 0.55})`;
      ctx.beginPath();
      ctx.ellipse(bowlX, ground - 17, 6.5 * Math.min(1, this.pose.water), 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSapling(
    ctx: CanvasRenderingContext2D,
    x: number,
    ground: number,
    height: number,
    motion: number,
    heal: number,
  ): void {
    const sway = this.reduce ? 0 : Math.sin(motion * 0.55) * 2.2 * heal;
    ctx.save();
    ctx.translate(x + sway, ground);
    ctx.globalAlpha = Math.min(1, heal * 1.3);
    ctx.fillStyle = '#1b3a28';
    ctx.fillRect(-3.2, -height * 0.62, 6.4, height * 0.62);
    const crown = height * (0.26 + heal * 0.16);
    ctx.fillStyle = '#145233';
    ctx.beginPath();
    ctx.ellipse(0, -height * 0.74, crown * 0.78, crown * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f9a52';
    ctx.beginPath();
    ctx.ellipse(-crown * 0.32, -height * 0.66, crown * 0.42, crown * 0.28, -0.45, 0, Math.PI * 2);
    ctx.ellipse(crown * 0.34, -height * 0.68, crown * 0.4, crown * 0.26, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBirds(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    motion: number,
    heal: number,
  ): void {
    if (heal < 0.7 || this.reduce) return;
    ctx.save();
    ctx.strokeStyle = `rgba(226, 236, 220, ${(heal - 0.7) / 0.3})`;
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i += 1) {
      const u = (motion * 0.03 + i * 0.23) % 1;
      const x = u * (w + 40) - 20;
      const y = h * (0.12 + (i % 3) * 0.045) + Math.sin(motion * 2 + i) * 3;
      const span = 7 + (i % 2);
      ctx.beginPath();
      ctx.moveTo(x - span, y);
      ctx.quadraticCurveTo(x - span * 0.35, y - 4, x, y);
      ctx.quadraticCurveTo(x + span * 0.35, y - 4, x + span, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSatellite(
    ctx: CanvasRenderingContext2D,
    w: number,
    motion: number,
    carrying: boolean,
    _ground: number,
  ): { x: number; y: number } {
    const u = this.reduce ? 0.62 : (motion * 0.025) % 1;
    const x = w * (0.08 + 0.84 * u);
    const y = 22 + Math.sin(u * Math.PI) * 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = carrying ? '#f0c48a' : '#d5e0d2';
    ctx.fillStyle = '#c9d4c6';
    ctx.lineWidth = 1;
    ctx.strokeRect(-26, -5, 18, 10);
    ctx.strokeRect(8, -5, 18, 10);
    ctx.fillRect(-6, -4, 12, 8);
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, -12);
    ctx.stroke();
    ctx.fillStyle = carrying || Math.sin(motion * 5) > 0 ? '#e7a15a' : '#8ea194';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return { x, y };
  }

  private drawSignal(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    carrying: boolean,
  ): void {
    ctx.save();
    ctx.strokeStyle = carrying ? 'rgba(240, 196, 138, 0.75)' : 'rgba(226, 168, 96, 0.28)';
    ctx.lineWidth = carrying ? 1.4 : 1;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.moveTo(x1, y1 + 8);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  private drawEnt(
    ctx: CanvasRenderingContext2D,
    x: number,
    ground: number,
    height: number,
    motion: number,
    seed: number,
    arm: number,
    heal: number,
    phase: RitualPhase,
    innerRight: boolean,
    index: number,
  ): void {
    const sway = Math.sin(motion * 0.45 + seed) * height * 0.02;
    const bob = phase === 'gather' ? Math.abs(Math.sin(motion * 0.9 + seed)) * 3 : 0;
    const kept = phase === 'saved' ? Math.sin(motion * 0.4 + seed) * 0.05 : 0;
    ctx.save();
    ctx.translate(x + sway, ground - bob);
    ctx.rotate(Math.sin(motion * 0.18 + seed) * 0.015 + (arm - 0.2) * 0.02);
    const trunk = height * 0.09;
    ctx.fillStyle = mixHex('#3a2c24', '#10241b', heal);
    ctx.beginPath();
    ctx.moveTo(-trunk, 0);
    ctx.bezierCurveTo(-trunk * 0.85, -height * 0.35, -trunk * 0.5, -height * 0.72, -trunk * 0.15, -height);
    ctx.lineTo(trunk * 0.22, -height);
    ctx.bezierCurveTo(trunk * 0.7, -height * 0.7, trunk * 1.05, -height * 0.32, trunk, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(92, 130, 104, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -height * 0.08);
    ctx.quadraticCurveTo(trunk * 0.25, -height * 0.5, 0, -height * 0.9);
    ctx.stroke();

    const lift = Math.max(0, Math.min(1, arm + kept));
    const left = this.drawBranch(ctx, -trunk * 0.1, -height * 0.62, -1, height * 0.36, lift, heal);
    const right = this.drawBranch(ctx, trunk * 0.08, -height * 0.7, 1, height * 0.32, lift * 0.96, heal);
    this.drawLeaves(ctx, left.x, left.y, -1, heal);
    this.drawLeaves(ctx, right.x, right.y, 1, heal);
    const held = innerRight ? right : left;
    this.drawHeldItem(ctx, held.x, held.y, this.heldItem(index));

    const crown = mixHex('#3f4a32', '#173528', Math.min(1, heal * 1.2));
    ctx.fillStyle = heal > 0.55 ? '#1d6b3e' : crown;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.ellipse(
        Math.sin(seed + i) * trunk,
        -height * (0.8 + i * 0.055),
        height * (0.16 - i * 0.02) * (1 + heal * 0.18),
        height * 0.045 * (1 + heal * 0.35),
        (i - 1.5) * 0.28,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    const blink = !this.reduce && Math.sin(motion * 0.7 + seed * 3) > 0.97 ? 0.15 : 1;
    ctx.globalAlpha = 0.9 * blink;
    ctx.fillStyle = arm > 0.45 || heal > 0.6 ? '#f0c48a' : '#c4a27a';
    const eyeY = -height * 0.74;
    ctx.beginPath();
    ctx.ellipse(-trunk * 0.18, eyeY, 2.1, 1.15, 0, 0, Math.PI * 2);
    ctx.ellipse(trunk * 0.32, eyeY, 2.1, 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    this.drawHalo(ctx, -height - 18, motion, seed);
    ctx.restore();
  }

  private drawHalo(ctx: CanvasRenderingContext2D, y: number, motion: number, seed: number): void {
    const glow = 0.82 + Math.sin(motion * 1.1 + seed) * 0.12;
    ctx.save();
    ctx.translate(0, y);
    const wash = ctx.createRadialGradient(0, 0, 1, 0, 0, 26);
    wash.addColorStop(0, `rgba(243, 215, 130, ${0.42 * glow})`);
    wash.addColorStop(1, 'rgba(243, 215, 130, 0)');
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(243, 215, 130, ${0.95 * glow})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 4.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawHeldItem(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    item: 'ember' | 'drop' | 'leaf' | null,
  ): void {
    if (!item) return;
    ctx.save();
    if (item === 'ember') {
      ctx.fillStyle = '#f6d48a';
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e07a32';
      ctx.beginPath();
      ctx.arc(x, y + 1.2, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (item === 'drop') {
      ctx.fillStyle = '#c5e7ef';
      ctx.beginPath();
      ctx.arc(x, y, 3.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#8fd48a';
      ctx.beginPath();
      ctx.ellipse(x, y, 6, 2.6, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBranch(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dir: number,
    length: number,
    lift: number,
    heal: number,
  ): { x: number; y: number } {
    ctx.strokeStyle = mixHex('#4a382c', '#163026', heal);
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, length * 0.07);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const droop = 1 - lift;
    const endX = x + dir * length * (0.42 + lift * 0.7);
    const endY = y + length * 0.95 * droop - length * lift * 1.25;
    ctx.quadraticCurveTo(x + dir * length * 0.45, y + length * (0.4 * droop - 0.2 * lift), endX, endY);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, length * 0.035);
    const tipY = endY + length * 0.2 * droop - length * 0.18 * lift;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX + dir * length * 0.22, tipY);
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX + dir * length * 0.04, tipY - length * 0.08);
    ctx.stroke();
    return { x: endX, y: endY };
  }

  private drawLeaves(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, heal: number): void {
    if (heal < 0.28) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (heal - 0.28) / 0.45);
    ctx.fillStyle = '#3f9a55';
    ctx.beginPath();
    ctx.ellipse(x, y, 6 + heal * 7, 3.2 + heal * 2, dir * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8fd48a';
    ctx.beginPath();
    ctx.ellipse(x + dir * 4, y - 2, 3.5 + heal * 2, 2, dir * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawPollen(ctx: CanvasRenderingContext2D, x: number, y: number, motion: number): void {
    ctx.fillStyle = 'rgba(236, 214, 170, 0.85)';
    for (let i = 0; i < 14; i += 1) {
      const angle = motion * 0.35 + i * 0.45;
      const radius = 70 + (i % 4) * 16;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * radius, y + Math.sin(angle * 1.3) * 22, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFlame(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    motion: number,
    energy: number,
    scale = 1,
  ): void {
    const height = (78 + Math.sin(motion * 8) * 8 + Math.min(36, energy * 180)) * scale;
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, -height * 0.35, 6, 0, -8, 110);
    glow.addColorStop(0, 'rgba(255, 168, 72, 0.5)');
    glow.addColorStop(1, 'rgba(255, 120, 32, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, -24, 78, 52, 0, 0, Math.PI * 2);
    ctx.fill();
    const layers = [
      { width: 28, height: height * 1.12, color: '#9a3412' },
      { width: 18, height: height * 0.82, color: '#e07a32' },
      { width: 9, height: height * 0.5, color: '#f6d48a' },
    ];
    layers.forEach((layer, index) => {
      const wobble = Math.sin(motion * (6 + index) + index) * 5;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(-layer.width * 0.5, 0);
      ctx.bezierCurveTo(
        -layer.width,
        -layer.height * 0.4,
        wobble - layer.width * 0.2,
        -layer.height * 0.75,
        wobble,
        -layer.height,
      );
      ctx.bezierCurveTo(
        wobble + layer.width * 0.35,
        -layer.height * 0.7,
        layer.width,
        -layer.height * 0.35,
        layer.width * 0.55,
        0,
      );
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  private drawMotes(ctx: CanvasRenderingContext2D): void {
    if (this.reduce) return;
    for (const mote of this.motes) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, mote.life);
      if (mote.kind === 'leaf') {
        ctx.translate(mote.x, mote.y);
        ctx.rotate(mote.life * 4);
        ctx.fillStyle = '#8fce78';
        ctx.fillRect(-2.4, -1.1, 4.8, 2.2);
      } else if (mote.kind === 'drop') {
        ctx.fillStyle = '#b7e4ee';
        ctx.beginPath();
        ctx.arc(mote.x, mote.y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = mote.kind === 'ash' ? '#b9aea4' : '#f3c27a';
        ctx.fillRect(mote.x, mote.y, mote.kind === 'ash' ? 2 : 2.4, mote.kind === 'ash' ? 2 : 2.4);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawGround(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    ground: number,
    motion: number,
    heal: number,
    kicker: string,
  ): void {
    ctx.fillStyle = mixHex('#1a1410', '#0b1914', heal);
    ctx.fillRect(0, ground, w, h - ground);
    const moss = ctx.createRadialGradient(w / 2, ground, 8, w / 2, ground, w * (0.12 + heal * 0.36));
    moss.addColorStop(0, `rgba(46, 130, 74, ${0.12 + heal * 0.4})`);
    moss.addColorStop(1, 'rgba(46, 130, 74, 0)');
    ctx.fillStyle = moss;
    ctx.beginPath();
    ctx.ellipse(w / 2, ground + 6, w * (0.16 + heal * 0.26), 16 + heal * 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const pool = ctx.createRadialGradient(w / 2, ground + 4, 10, w / 2, ground + 8, w * 0.42);
    pool.addColorStop(0, `rgba(52, 140, 132, ${0.12 + heal * 0.28})`);
    pool.addColorStop(1, 'rgba(52, 140, 132, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(w / 2, ground + 8, w * 0.38, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(122, 196, 184, ${0.18 + heal * 0.35})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(w / 2, ground + 4, w * 0.3, 9 + Math.sin(motion) * 1.5, 0, Math.PI, 0);
    ctx.stroke();
    const label =
      kicker === 'THE KEEPING' && heal > 0.9
        ? 'THE JUNGLE STANDS'
        : kicker === 'THE SAINTS' || kicker === 'THE FIRE'
          ? 'THE FIRE'
          : kicker === 'THE WATER' || kicker === 'THE POURING' || kicker === 'THE SONG'
            ? 'THE WATER'
            : kicker === 'THE LEAVES'
              ? 'THE LEAVES'
              : 'THE PLACES';
    const labelY = kicker === 'THE SAINTS' || kicker === 'THE FIRE' ? ground - 118 : ground - 10;
    setLetterSpacing(ctx, '0.12em');
    ctx.font = '700 9px "DM Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = heal > 0.92 ? '#d7e7c8' : '#cbbfa8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, w / 2, labelY);
    ctx.fillText('THE DEEP MEMORY', w / 2, ground + 36);
    setLetterSpacing(ctx, '0px');
  }

  private drawLocality(ctx: CanvasRenderingContext2D, w: number, ground: number, places: number): void {
    const marks: { x: number; label: string; kind: 'paw' | 'wing' | 'hoof' | 'root' }[] = [
      { x: w * 0.16, label: 'PAW', kind: 'paw' },
      { x: w * 0.3, label: 'WING', kind: 'wing' },
      { x: w * 0.7, label: 'HOOF', kind: 'hoof' },
      { x: w * 0.84, label: 'ROOT', kind: 'root' },
    ];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    setLetterSpacing(ctx, '0.12em');
    ctx.font = '700 8px "DM Sans", "Segoe UI", sans-serif';
    for (const mark of marks) {
      const lit = 0.45 + places * 0.55;
      ctx.strokeStyle = `rgba(214, 176, 122, ${lit})`;
      ctx.fillStyle = `rgba(214, 176, 122, ${0.55 + places * 0.4})`;
      ctx.lineWidth = places > 0.55 ? 2 : 1.2;
      ctx.beginPath();
      ctx.arc(mark.x, ground - 46, 11 + places * 2, 0, Math.PI * 2);
      ctx.stroke();
      this.drawMark(ctx, mark.x, ground - 46, mark.kind);
      ctx.fillStyle = '#9bb0a2';
      ctx.fillText(mark.label, mark.x, ground - 26);
    }
    setLetterSpacing(ctx, '0px');
  }

  private drawMark(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    kind: 'paw' | 'wing' | 'hoof' | 'root',
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#e2c092';
    ctx.fillStyle = '#e2c092';
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    if (kind === 'paw') {
      ctx.beginPath();
      ctx.ellipse(0, 2, 3.2, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const toe of [-3.2, -1, 1.2, 3.2]) {
        ctx.beginPath();
        ctx.arc(toe, -3, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'wing') {
      ctx.beginPath();
      ctx.moveTo(-5, 1);
      ctx.quadraticCurveTo(0, -6, 5, -1);
      ctx.quadraticCurveTo(0, -1, -5, 1);
      ctx.stroke();
    } else if (kind === 'hoof') {
      ctx.beginPath();
      ctx.moveTo(-3, -4);
      ctx.lineTo(-3, 2);
      ctx.quadraticCurveTo(-3, 5, 0, 5);
      ctx.quadraticCurveTo(3, 5, 3, 2);
      ctx.lineTo(3, -4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(0, 4);
      ctx.moveTo(0, 0);
      ctx.lineTo(-4, 3);
      ctx.moveTo(0, 1);
      ctx.lineTo(4, 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHymn(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    line: HymnLine,
    reveal: number,
  ): void {
    const veil = ctx.createLinearGradient(0, h * 0.08, 0, h * 0.5);
    veil.addColorStop(0, 'rgba(6, 16, 13, 0.05)');
    veil.addColorStop(0.45, 'rgba(6, 16, 13, 0.55)');
    veil.addColorStop(1, 'rgba(6, 16, 13, 0)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, h * 0.08, w, h * 0.42);

    const size = line.role === 'refrain'
      ? Math.min(46, Math.max(22, w * 0.044))
      : Math.min(32, Math.max(20, w * 0.034));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    setLetterSpacing(ctx, '0.14em');
    ctx.font = '700 11px "DM Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = '#d8995f';
    const kickerY = h * 0.16;
    ctx.fillText(line.kicker, w / 2, kickerY);
    setLetterSpacing(ctx, '0.03em');

    ctx.font = `italic 500 ${size}px Georgia, "Times New Roman", serif`;
    const lines = wrapText(ctx, line.sung, Math.min(820, w * 0.84));
    const lineHeight = size * 1.25;
    const blockH = lines.length * lineHeight;
    const top = kickerY + 26;

    ctx.save();
    ctx.globalAlpha = Math.max(0.2, reveal);
    lines.forEach((part, index) => {
      const y = top + index * lineHeight;
      ctx.fillStyle = line.role === 'refrain' ? 'rgba(240, 196, 138, 0.35)' : 'rgba(8, 16, 13, 0.65)';
      ctx.fillText(part, w / 2 + 1.5, y + 2);
      ctx.fillStyle = line.role === 'refrain' ? '#f3c48a' : line.role === 'answer' ? '#d7e7d2' : '#eef3ea';
      ctx.fillText(part, w / 2, y);
    });
    ctx.restore();

    const barW = Math.min(220, w * 0.24) * reveal;
    const barY = top + blockH + 6;
    ctx.strokeStyle = 'rgba(216, 137, 95, 0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - barW / 2, barY);
    ctx.lineTo(w / 2 + barW / 2, barY);
    ctx.stroke();

    setLetterSpacing(ctx, '0px');
    const glossSize = Math.max(12, Math.min(16, w * 0.02));
    ctx.font = `400 ${glossSize}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = 'rgba(226, 232, 220, 0.82)';
    const gloss = wrapText(ctx, line.text, Math.min(640, w * 0.7));
    gloss.forEach((part, index) => {
      ctx.fillText(part, w / 2, barY + 16 + index * (glossSize + 4));
    });
  }

  private drawProgress(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    index: number,
    progress: number,
  ): void {
    const y = h - 18;
    const gap = 14;
    const total = (HYMN.length - 1) * gap;
    const start = w / 2 - total / 2;
    for (let i = 0; i < HYMN.length; i += 1) {
      ctx.beginPath();
      ctx.fillStyle = i === index ? '#f0c48a' : 'rgba(168, 188, 170, 0.35)';
      ctx.arc(start + i * gap, y, i === index ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!this.reduce) {
      ctx.strokeStyle = 'rgba(240, 196, 138, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(start + index * gap, y, 6, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();
    }
  }

  private status(): ChantStatus {
    const line = this.currentLine();
    let audio: ChantAudio;
    if (!this.canSound) audio = this.paused ? 'paused' : 'blocked';
    else if (!this.heardState) audio = 'pending';
    else if (this.paused) audio = 'paused';
    else if (this.audio?.state === 'running') audio = 'playing';
    else audio = 'blocked';
    const code = this.codeState();
    return {
      walking: !this.paused,
      audio,
      canSound: this.canSound,
      line: line.text,
      sung: line.sung,
      kicker: line.kicker,
      phase: line.phase,
      heal: this.healAmount(),
      index: this.currentIndex(),
      meter: Math.min(1, this.energy * 5.5),
      codeMarks: code.marks,
      hearing: code.hearing,
      registered: code.registered,
    };
  }

  private emit(force: boolean): void {
    const status = this.status();
    const key = `${status.walking}|${status.audio}|${status.index}|${status.canSound}|${status.codeMarks}|${status.registered}|${Math.round(status.meter * 20)}|${Math.round(status.heal * 20)}`;
    if (!force && key === this.lastEmitKey) return;
    this.lastEmitKey = key;
    this.onChange(status);
  }
}
