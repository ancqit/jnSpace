import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { LucideAngularModule, Pause, Play } from 'lucide-angular';
import { ChantAudio, ChantStatus, EntChant, HYMN } from './ent-chant';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <main class="scene" [class.is-paused]="!walking">
      <div class="grain"></div>
      <header class="topbar">
        <div class="brand"><span class="brand-mark">JN</span><span>JNSPACE</span></div>
        <div class="session"><span class="live-dot"></span> THE BROKEN PLEDGE <span class="slash">/</span> ENTS</div>
        <button
          class="sound-button"
          type="button"
          (click)="onPrimary()"
          [attr.aria-label]="primaryLabel + '. ' + note"
        >
          <lucide-icon [img]="showPause ? pauseIcon : playIcon" [size]="16"></lucide-icon>
          <span>{{ primaryLabel }}</span>
        </button>
      </header>

      <section class="hero" aria-labelledby="title">
        <div class="eyebrow"><span class="eyebrow-line"></span> A WALKING SONG <span class="eyebrow-line"></span></div>
        <h1 id="title">THE CALLING<br /><em>OF THE ENTS</em></h1>
        <p class="intro">The pledge is broken. The jungles were burnt. This is the call to the other ents.</p>

        <div class="transport">
          <button class="chant-button" type="button" (click)="onPrimary()" [attr.aria-label]="primaryLabel + '. ' + note">
            <span class="button-icon"><lucide-icon [img]="showPause ? pauseIcon : playIcon" [size]="16"></lucide-icon></span>
            <span>{{ primaryLabel }}</span>
          </button>
          @if (walking && audio === 'blocked' && canSound) {
            <button class="quiet-button" type="button" (click)="pauseRite()">Pause the rite</button>
          }
        </div>
        <p class="transport-note" [attr.data-audio]="audio" [attr.data-walking]="walking ? 'yes' : 'no'" aria-live="polite">
          {{ note }}
        </p>
        <p class="live-line"><span>{{ kicker }}</span> {{ line }}</p>
        <div class="meter" aria-hidden="true"><i [style.width.%]="meter"></i></div>

        <div class="chant-frame">
          <canvas #chantCanvas role="img" [attr.aria-label]="kicker + '. ' + line"></canvas>
        </div>
      </section>

      <section class="plain" id="junction" aria-label="What this call means">
        <article class="wide">
          <h2>THE NAME</h2>
          <p>
            Junction is the sun. The extra n is the chant sent into space. The two inner places with the sun are
            Mercury and Venus. Sun, Mercury, Venus, .space is junctionn.space.
          </p>
        </article>
        <article>
          <h2>THE PLEDGE</h2>
          <p>
            Ents pledge their locality alongside the other animals at
            <a href="https://junction.monster">junction.monster</a>. The pledge is to the planet. A satellite must
            carry the message to the host and to the boss.
          </p>
        </article>
        <article>
          <h2>THE CALL</h2>
          <p>
            The jungles were burnt in anger. The anger is Saruman's, the will that fells the green. This page calls
            the other ents, so they hear what it is to be an ent: to stay, to keep a place, and to answer.
          </p>
        </article>
        <article class="wide">
          <h2>THE SLEEPER</h2>
          <p>
            A spokesperson who slept a long time takes the call and the slogan. That voice is Jiraiya, fuji kunal,
            and rarrow. The slogan they carry is the carrier's song: the wind is in the west, and my land is best.
          </p>
        </article>
        <details class="words">
          <summary>Read the hymn</summary>
          <ol>
            @for (verse of hymn; track $index) {
              <li [class]="'role-' + verse.role"><span>{{ verse.kicker }}</span> {{ verse.text }}</li>
            }
          </ol>
        </details>
      </section>

      <footer class="footer">
        <span>JNSPACE // THE BROKEN PLEDGE</span>
        <span>SUN · MERCURY · VENUS</span>
        <span>junctionn.space</span>
      </footer>
    </main>
  `,
  styles: [''],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chantCanvas') private chantCanvas?: ElementRef<HTMLCanvasElement>;

  protected readonly hymn = HYMN;
  protected readonly playIcon = Play;
  protected readonly pauseIcon = Pause;
  protected walking = true;
  protected audio: ChantAudio = 'pending';
  protected canSound = true;
  protected line = HYMN[0].text;
  protected kicker = HYMN[0].kicker;
  protected meter = 0;

  private engine: EntChant | null = null;

  constructor(private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    const canvas = this.chantCanvas?.nativeElement;
    if (!canvas) return;
    this.zone.runOutsideAngular(() => {
      this.engine = new EntChant(canvas, (status) => {
        this.zone.run(() => this.apply(status));
      });
      this.engine.start();
    });
  }

  ngOnDestroy(): void {
    this.engine?.destroy();
  }

  protected get showPause(): boolean {
    return this.walking && (this.audio === 'playing' || !this.canSound);
  }

  protected get primaryLabel(): string {
    if (this.showPause) return 'PAUSE';
    if (this.walking && this.canSound && this.audio !== 'playing') return 'PLAY THE SONG';
    return 'PLAY';
  }

  protected get note(): string {
    if (!this.walking) return 'The chant is paused. Press play to walk it again.';
    if (!this.canSound) return 'The chant is walking on the canvas. This browser cannot sound the song.';
    if (this.audio === 'playing') return 'The chant is walking, and the song is sounding.';
    if (this.audio === 'blocked') {
      return 'The chant is walking on the canvas. This browser held the song back. Press play and it starts for real.';
    }
    return 'The chant is walking.';
  }

  protected onPrimary(): void {
    if (!this.engine) return;
    if (this.showPause) this.engine.pause();
    else this.engine.resume();
  }

  protected pauseRite(): void {
    this.engine?.pause();
  }

  private apply(status: ChantStatus): void {
    this.walking = status.walking;
    this.audio = status.audio;
    this.canSound = status.canSound;
    this.line = status.line;
    this.kicker = status.kicker;
    this.meter = Math.round(status.meter * 100);
  }
}
