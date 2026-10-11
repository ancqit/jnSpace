import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { LucideAngularModule, Pause, Play } from 'lucide-angular';
import { ChantAudio, ChantStatus, EntChant, HYMN } from './ent-chant';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="page" [class.is-paused]="!walking">
      <header class="top">
        <a class="brand" href="/">
          <img src="assets/jearth-logo.svg" width="34" height="34" alt="" />
          <span>
            <strong>jEarth</strong>
            <small>The rite</small>
          </span>
        </a>
        <button
          class="button button--secondary"
          type="button"
          (click)="onPrimary()"
          [attr.aria-label]="primaryLabel + '. ' + note"
        >
          <lucide-icon [img]="showPause ? pauseIcon : playIcon" [size]="16"></lucide-icon>
          <span>{{ primaryLabel }}</span>
        </button>
      </header>

      <main>
        <p class="kicker">An entish song</p>
        <h1 id="title">The rite that saves the jungle</h1>
        <p class="lede">
          The song is slow, because an entish song does not hurry. The ents name the burnt canopy, gather root by root,
          raise their arms, and pour the water kept under the stone. The leaves open. The jungle stands.
        </p>

        <ul class="scope" aria-label="The rite">
          <li><span>Scar</span> The canopy was burnt. The ents name it.</li>
          <li><span>Raising</span> Each arm lifts, and the rite waits for the last.</li>
          <li><span>Pouring</span> Deep water climbs the bark into the scar.</li>
          <li><span>Saving</span> The leaves return, and the ents remain to keep them.</li>
        </ul>

        <div class="transport">
          <button class="button button--primary" type="button" (click)="onPrimary()" [attr.aria-label]="primaryLabel + '. ' + note">
            <lucide-icon [img]="showPause ? pauseIcon : playIcon" [size]="16"></lucide-icon>
            <span>{{ primaryLabel }}</span>
          </button>
          @if (walking && audio === 'blocked' && canSound) {
            <button class="button button--secondary" type="button" (click)="pauseRite()">Pause the rite</button>
          }
        </div>
        <p class="transport-note" [attr.data-audio]="audio" [attr.data-walking]="walking ? 'yes' : 'no'" aria-live="polite">
          {{ note }}
        </p>
        <p class="live-line"><span>{{ kicker }}</span> {{ sung }}</p>
        <p class="gloss">{{ line }}</p>
        <div class="meter" aria-hidden="true"><i [style.width.%]="meter"></i></div>
        <p class="grove-note"><span>The jungle</span> {{ groveLabel }}</p>
        <div class="meter grove" aria-hidden="true"><i [style.width.%]="grove"></i></div>

        <aside class="register" [attr.data-registered]="registered && audio === 'playing' ? 'yes' : 'no'" [attr.data-hearing]="hearing ? 'yes' : 'no'">
          <p class="kicker">The code</p>
          <p>{{ codeNote }}</p>
          <ol class="marks" aria-hidden="true">
            @for (mark of marks; track mark) {
              <li [class.on]="mark <= codeMarks && audio === 'playing'"></li>
            }
          </ol>
          @if (audio === 'playing' && registered) {
            <p class="meaning">
              the very people no one imagines anything of, who do the things no one can imagine.
            </p>
          }
        </aside>

        <div class="chant-frame">
          <canvas #chantCanvas role="img" [attr.aria-label]="kicker + '. ' + sung + '. ' + line"></canvas>
        </div>

        <section class="plain" id="junction" aria-label="What this call means">
          <article class="wide">
            <h2>The rite</h2>
            <p>
              The ents stand in the scar and do the rite together. They do not move as one hurry. One arm rises, then
              the next, until the last is high. Water comes up through them. A young tree stands where the fire was,
              the canopy closes, and the paw, the wing, the hoof, and the root take their places again.
            </p>
          </article>
          <article class="wide">
            <h2>The name</h2>
            <p>
              Junction is the sun. The extra n is the chant sent into space. The two inner places with the sun are
              Mercury and Venus. Sun, Mercury, Venus, .space is junctionn.space.
            </p>
          </article>
          <article>
            <h2>The pledge</h2>
            <p>
              Ents pledge their locality alongside the other animals at
              <a href="https://junction.monster">junction.monster</a>. The pledge is to the planet. A satellite must
              carry the message to the host and to the boss.
            </p>
          </article>
          <article>
            <h2>The call</h2>
            <p>
              The jungles were burnt in anger. The anger is Saruman's, the will that fells the green. The rite is the
              answer: the ents stay, keep the place, and sing the canopy back.
            </p>
          </article>
          <article class="wide">
            <h2>The sleeper</h2>
            <p>
              A spokesperson who slept a long time takes the call and the slogan. That voice is fuji kunal and rarrow.
              The slogan they carry is the carrier's song: the wind is in the west, and my land is best.
            </p>
          </article>
          <details class="words">
            <summary>Read the song</summary>
            <ol>
              @for (verse of hymn; track $index) {
                <li [class]="'role-' + verse.role">
                  <span>{{ verse.kicker }}</span>
                  <em>{{ verse.sung }}</em>
                  {{ verse.text }}
                </li>
              }
            </ol>
          </details>
        </section>
      </main>

      <footer class="foot">
        <p>junctionn.space · sun, Mercury, Venus</p>
        <p class="copyright">© {{ year }} Sunskriti Data Management Company</p>
      </footer>
    </div>
  `,
  styles: [''],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chantCanvas') private chantCanvas?: ElementRef<HTMLCanvasElement>;

  protected readonly hymn = HYMN;
  protected readonly playIcon = Play;
  protected readonly pauseIcon = Pause;
  protected readonly year = new Date().getFullYear();
  protected walking = true;
  protected audio: ChantAudio = 'pending';
  protected canSound = true;
  protected readonly marks = [1, 2, 3, 4];
  protected line = HYMN[0].text;
  protected sung = HYMN[0].sung;
  protected kicker = HYMN[0].kicker;
  protected grove = 0;
  protected meter = 0;
  protected codeMarks = 0;
  protected hearing = false;
  protected registered = false;

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
    if (!this.walking) return 'The rite is paused. Press play to walk it again.';
    if (!this.canSound) return 'The rite is walking on the canvas. This browser cannot sound the song.';
    if (this.audio === 'playing') return 'The rite is walking, and the entish song is sounding.';
    if (this.audio === 'blocked') {
      return 'The rite is walking on the canvas. This browser held the song back. Press play and it starts for real.';
    }
    return 'The rite is walking.';
  }

  protected get groveLabel(): string {
    if (!this.walking) return 'The rite is paused.';
    if (this.grove >= 92) return 'The jungle stands. The ents keep it.';
    if (this.grove >= 45) return 'The deep water is entering the scar.';
    if (this.grove >= 8) return 'The arms are rising. The green is beginning.';
    return 'The jungle is burnt. The ents begin the rite.';
  }

  protected get codeNote(): string {
    if (this.audio !== 'playing') {
      return 'An ent is listening for the closing tones. They mark the jungle saved only while the song is sounding.';
    }
    if (this.registered) return 'An ent heard the closing tones and marked the jungle saved.';
    if (this.hearing) return 'An ent hears the closing tones.';
    return 'The ents are singing. The closing tones come when the jungle stands.';
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
    this.sung = status.sung;
    this.kicker = status.kicker;
    this.grove = Math.round(status.heal * 100);
    this.meter = Math.round(status.meter * 100);
    this.codeMarks = status.codeMarks;
    this.hearing = status.hearing;
    this.registered = status.registered;
  }
}
