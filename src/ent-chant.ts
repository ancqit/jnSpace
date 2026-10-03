// Original walking chant. The canvas clock is the rite.
// Sound follows that clock only while AudioContext is actually running.

export type HymnRole = 'call' | 'refrain' | 'answer';

export interface HymnLine {
  role: HymnRole;
  kicker: string;
  text: string;
}

export const HYMN: readonly HymnLine[] = [
  { role: 'call', kicker: 'THE CALL', text: 'Other ents, hear the call.' },
  { role: 'call', kicker: 'THE PLEDGE', text: 'The pledge we kept for the planet is broken.' },
  { role: 'call', kicker: 'LOCALITY', text: 'We set our place beside the other animals.' },
  { role: 'call', kicker: 'LOCALITY', text: 'Root by paw, bough by wing, at junction.monster.' },
  { role: 'refrain', kicker: 'THE SLOGAN', text: 'The wind is in the west.' },
  { role: 'refrain', kicker: 'THE SLOGAN', text: 'My land is best.' },
  { role: 'call', kicker: 'THE BURNING', text: 'The jungles were burnt in anger.' },
  { role: 'call', kicker: 'THE BURNING', text: 'The burning came with the wrath named Saruman.' },
  { role: 'call', kicker: 'THE BURNING', text: 'Ash where the canopy stood. Smoke where the green was.' },
  { role: 'call', kicker: 'WHAT AN ENT IS', text: 'To be an ent is to stay, to keep, and to answer.' },
  { role: 'call', kicker: 'THE CARRIER', text: 'A satellite carries this word over the scar.' },
  { role: 'call', kicker: 'THE CARRIER', text: 'It must reach the host. It must reach the boss.' },
  { role: 'answer', kicker: 'THE ONE WHO SLEPT', text: 'One who slept a long age takes the call.' },
  { role: 'answer', kicker: 'THE ONE WHO SLEPT', text: 'Jiraiya, fuji kunal, and rarrow take the slogan.' },
  { role: 'refrain', kicker: 'THE SLOGAN', text: 'The wind is in the west.' },
  { role: 'refrain', kicker: 'THE SLOGAN', text: 'My land is best.' },
];

export type ChantAudio = 'pending' | 'playing' | 'blocked' | 'paused';

export interface ChantStatus {
  walking: boolean;
  audio: ChantAudio;
  canSound: boolean;
  line: string;
  kicker: string;
  index: number;
  meter: number;
}

const BPM = 52;
const QUARTER = 60 / BPM;
const LINE_BEATS = 4;
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
  kind: 'ember' | 'ash';
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
    this.stopScheduler();
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
    this.schedule();
  }

  private ensureGraph(): void {
    if (this.graphReady || !this.audio) return;
    const audio = this.audio;
    this.graphReady = true;
    const master = audio.createGain();
    master.gain.value = 0.0001;
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    const droneBus = audio.createBiquadFilter();
    droneBus.type = 'lowpass';
    droneBus.frequency.value = 320;
    droneBus.connect(master);
    master.connect(analyser);
    analyser.connect(audio.destination);
    this.master = master;
    this.analyser = analyser;
    this.timeData = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    const lfo = audio.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = audio.createGain();
    lfoGain.gain.value = 48;
    lfo.connect(lfoGain);
    lfoGain.connect(droneBus.frequency);
    lfo.start();
    this.nodes.push(lfo);

    this.drone(droneBus, 73.42, 'sine', 0.14, 0);
    this.drone(droneBus, 73.42, 'triangle', 0.045, 7);
    this.drone(droneBus, 110, 'sine', 0.035, -5);
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
    gain.linearRampToValueAtTime(0.7, now + 0.45);
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
    const lineIndex = Math.floor(visualTime / LINE_SECONDS) % HYMN.length;
    const beat = Math.floor((visualTime % LINE_SECONDS) / QUARTER + 0.001) % LINE_BEATS;
    const line = HYMN[lineIndex];
    const motifs = MOTIFS[line.role];
    const motif = motifs[lineIndex % motifs.length];
    const freq = DORIAN[motif[beat] ?? 0];
    const peak = line.role === 'refrain' ? 0.2 : 0.14;
    this.pluck(when, freq, peak);
    if (line.role === 'refrain') this.pluck(when, freq / 2, 0.07);
    if (beat % 2 === 0) this.knock(when, beat === 0 ? 0.16 : 0.09);
  }

  private pluck(when: number, freq: number, peak: number): void {
    if (!this.audio || !this.master) return;
    const start = Math.max(when, this.audio.currentTime);
    const osc = this.audio.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);
    const filter = this.audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, start);
    filter.frequency.exponentialRampToValueAtTime(420, start + 0.45);
    const gain = this.audio.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.05);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + 1.15);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  private knock(when: number, peak: number): void {
    if (!this.audio || !this.master) return;
    const start = Math.max(when, this.audio.currentTime);
    const osc = this.audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(168, start);
    osc.frequency.exponentialRampToValueAtTime(54, start + 0.09);
    const gain = this.audio.createGain();
    gain.gain.setValueAtTime(Math.max(0.0002, peak), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + 0.16);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  private frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(48, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    if (!this.paused) this.elapsedMs += dt;
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

  private updateMotes(dt: number): void {
    const line = this.currentLine();
    const burning = line.kicker === 'THE BURNING';
    if (dt > 0 && this.cssW > 2) {
      const ground = this.cssH * 0.8;
      if (Math.random() < dt / 70) {
        this.motes.push({
          x: this.cssW / 2 + (Math.random() - 0.5) * 18,
          y: ground - 24,
          vx: (Math.random() - 0.5) * 14,
          vy: -18 - Math.random() * 36,
          life: 1,
          kind: 'ember',
        });
      }
      if (burning && Math.random() < dt / 40) {
        this.motes.push({
          x: Math.random() * this.cssW,
          y: this.cssH * (0.2 + Math.random() * 0.45),
          vx: -8 - Math.random() * 16,
          vy: 6 + Math.random() * 12,
          life: 1,
          kind: 'ash',
        });
      }
    }
    const step = dt / 1000;
    for (const mote of this.motes) {
      mote.x += mote.vx * step;
      mote.y += mote.vy * step;
      mote.life -= step * (mote.kind === 'ash' ? 0.28 : 0.55);
    }
    if (this.motes.length > 180) this.motes.splice(0, this.motes.length - 180);
    this.motes = this.motes.filter((mote) => mote.life > 0);
  }

  private currentIndex(): number {
    return Math.floor(this.elapsedMs / 1000 / LINE_SECONDS) % HYMN.length;
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

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#07110e');
    sky.addColorStop(0.55, '#0c1b16');
    sky.addColorStop(1, '#140e0b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    if (line.kicker === 'THE BURNING') {
      ctx.fillStyle = 'rgba(92, 28, 12, 0.2)';
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

    this.drawRidge(ctx, w, ground);
    const sat = this.drawSatellite(ctx, w, motion, line.kicker === 'THE CARRIER', ground);
    this.drawSignal(ctx, sat.x, sat.y, w / 2, ground - 70, line.kicker === 'THE CARRIER');

    const mood = line.role === 'refrain' ? 1 : line.role === 'answer' ? 0.4 : 0;
    for (const ent of ENTS) {
      this.drawEnt(ctx, ent.x * w, ground, h * ent.h, motion, ent.seed, mood);
    }

    if (line.role === 'answer' && !this.reduce) {
      this.drawPollen(ctx, w / 2, ground - h * 0.16, motion);
    }

    this.drawFlame(ctx, w / 2, ground, motion, this.energy);
    this.drawMotes(ctx);
    this.drawGround(ctx, w, h, ground, motion);
    this.drawLocality(ctx, w, ground);
    this.drawHymn(ctx, w, h, line, this.reduce ? 1 : Math.min(1, progress / 0.34));
    this.drawProgress(ctx, w, h, this.currentIndex(), progress);
  }

  private drawRidge(ctx: CanvasRenderingContext2D, w: number, ground: number): void {
    ctx.fillStyle = '#0c1f18';
    ctx.beginPath();
    ctx.moveTo(0, ground - 20);
    for (let x = 0; x <= w; x += 28) {
      const y = ground - 36 - Math.sin(x * 0.01) * 16 - (x % 56 === 0 ? 22 : 0);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, ground);
    ctx.lineTo(0, ground);
    ctx.fill();
    ctx.fillStyle = '#10281e';
    for (let i = 0; i < 18; i += 1) {
      const x = (i + 0.5) * (w / 18);
      const trunk = 16 + (i % 3) * 8;
      ctx.fillRect(x, ground - 24 - trunk, 3, trunk);
    }
  }

  private drawSatellite(
    ctx: CanvasRenderingContext2D,
    w: number,
    motion: number,
    carrying: boolean,
    _ground: number,
  ): { x: number; y: number } {
    const u = this.reduce ? 0.62 : (motion * 0.025) % 1;
    const x = w * (0.12 + 0.76 * u);
    const y = 48 + Math.sin(u * Math.PI) * 28;
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
    mood: number,
  ): void {
    const sway = Math.sin(motion * 0.45 + seed) * height * 0.025;
    ctx.save();
    ctx.translate(x + sway, ground);
    ctx.rotate(Math.sin(motion * 0.18 + seed) * 0.02);
    const trunk = height * 0.09;
    ctx.fillStyle = '#10241b';
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

    const lift = Math.sin(motion * 0.55 + seed) * 0.08 + mood * 0.28;
    this.drawBranch(ctx, -trunk * 0.1, -height * 0.62, -1, height * 0.34, lift);
    this.drawBranch(ctx, trunk * 0.08, -height * 0.7, 1, height * 0.3, lift * 0.85);

    ctx.fillStyle = '#173528';
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.ellipse(
        Math.sin(seed + i) * trunk,
        -height * (0.8 + i * 0.055),
        height * (0.16 - i * 0.02),
        height * 0.045,
        (i - 1.5) * 0.28,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    const blink = !this.reduce && Math.sin(motion * 0.7 + seed * 3) > 0.97 ? 0.15 : 1;
    ctx.globalAlpha = 0.9 * blink;
    ctx.fillStyle = mood > 0 ? '#f0c48a' : '#e2b56a';
    const eyeY = -height * 0.74;
    ctx.beginPath();
    ctx.ellipse(-trunk * 0.18, eyeY, 2.1, 1.15, 0, 0, Math.PI * 2);
    ctx.ellipse(trunk * 0.32, eyeY, 2.1, 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBranch(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dir: number,
    length: number,
    lift: number,
  ): void {
    ctx.strokeStyle = '#163026';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, length * 0.07);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const endX = x + dir * length;
    const endY = y - length * (0.18 + lift);
    ctx.quadraticCurveTo(x + dir * length * 0.45, y + length * 0.05, endX, endY);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, length * 0.035);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX + dir * length * 0.28, endY - length * 0.22);
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX + dir * length * 0.04, endY - length * 0.3);
    ctx.stroke();
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
  ): void {
    const height = 78 + Math.sin(motion * 8) * 8 + Math.min(36, energy * 180);
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
      ctx.globalAlpha = Math.max(0, mote.life);
      ctx.fillStyle = mote.kind === 'ash' ? '#b9aea4' : '#f3c27a';
      ctx.fillRect(mote.x, mote.y, mote.kind === 'ash' ? 2 : 2.4, mote.kind === 'ash' ? 2 : 2.4);
    }
    ctx.globalAlpha = 1;
  }

  private drawGround(ctx: CanvasRenderingContext2D, w: number, h: number, ground: number, motion: number): void {
    ctx.fillStyle = '#0b1914';
    ctx.fillRect(0, ground, w, h - ground);
    const pool = ctx.createRadialGradient(w / 2, ground + 4, 10, w / 2, ground + 8, w * 0.42);
    pool.addColorStop(0, 'rgba(52, 140, 132, 0.28)');
    pool.addColorStop(1, 'rgba(52, 140, 132, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(w / 2, ground + 8, w * 0.38, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(122, 196, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(w / 2, ground + 4, w * 0.3, 9 + Math.sin(motion) * 1.5, 0, Math.PI, 0);
    ctx.stroke();
    setLetterSpacing(ctx, '0.14em');
    ctx.font = '500 9px "DM Mono", ui-monospace, monospace';
    ctx.fillStyle = '#8eaa9c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('THE NEARBY SUN', w / 2, ground - 8);
    ctx.fillText('THE DEEP MEMORY', w / 2, ground + 36);
    setLetterSpacing(ctx, '0px');
  }

  private drawLocality(ctx: CanvasRenderingContext2D, w: number, ground: number): void {
    const marks: { x: number; label: string; kind: 'paw' | 'wing' | 'hoof' | 'root' }[] = [
      { x: w * 0.16, label: 'PAW', kind: 'paw' },
      { x: w * 0.3, label: 'WING', kind: 'wing' },
      { x: w * 0.7, label: 'HOOF', kind: 'hoof' },
      { x: w * 0.84, label: 'ROOT', kind: 'root' },
    ];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    setLetterSpacing(ctx, '0.12em');
    ctx.font = '500 8px "DM Mono", ui-monospace, monospace';
    for (const mark of marks) {
      ctx.strokeStyle = 'rgba(214, 176, 122, 0.7)';
      ctx.fillStyle = 'rgba(214, 176, 122, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(mark.x, ground - 46, 11, 0, Math.PI * 2);
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

    const size = line.role === 'refrain' ? Math.min(52, w * 0.048) : Math.min(34, w * 0.034);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    setLetterSpacing(ctx, '0.22em');
    ctx.font = '500 11px "DM Mono", ui-monospace, monospace';
    ctx.fillStyle = '#d8995f';
    const kickerY = h * 0.2;
    ctx.fillText(line.kicker, w / 2, kickerY);
    setLetterSpacing(ctx, '0px');

    ctx.font = `${line.role === 'refrain' ? 'italic ' : ''}500 ${size}px "Playfair Display", Georgia, serif`;
    const lines = wrapText(ctx, line.text, Math.min(780, w * 0.8));
    const lineHeight = size * 1.28;
    const blockH = lines.length * lineHeight;
    const top = kickerY + 28;

    ctx.save();
    ctx.beginPath();
    ctx.rect(w * 0.06, top - lineHeight, w * 0.88 * Math.max(0.02, reveal), blockH + lineHeight);
    ctx.clip();
    lines.forEach((part, index) => {
      const y = top + index * lineHeight;
      ctx.fillStyle = line.role === 'refrain' ? 'rgba(240, 196, 138, 0.35)' : 'rgba(8, 16, 13, 0.65)';
      ctx.fillText(part, w / 2 + 1.5, y + 2);
      ctx.fillStyle = line.role === 'refrain' ? '#f3c48a' : line.role === 'answer' ? '#d7e7d2' : '#eef3ea';
      ctx.fillText(part, w / 2, y);
    });
    ctx.restore();

    const barW = Math.min(220, w * 0.24) * reveal;
    ctx.strokeStyle = 'rgba(216, 137, 95, 0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - barW / 2, top + blockH + 8);
    ctx.lineTo(w / 2 + barW / 2, top + blockH + 8);
    ctx.stroke();
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
    return {
      walking: !this.paused,
      audio,
      canSound: this.canSound,
      line: line.text,
      kicker: line.kicker,
      index: this.currentIndex(),
      meter: Math.min(1, this.energy * 5.5),
    };
  }

  private emit(force: boolean): void {
    const status = this.status();
    const key = `${status.walking}|${status.audio}|${status.index}|${status.canSound}|${Math.round(status.meter * 20)}`;
    if (!force && key === this.lastEmitKey) return;
    this.lastEmitKey = key;
    this.onChange(status);
  }
}
