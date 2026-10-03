import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Flame, Droplets, Volume2, VolumeX, ChevronDown, Radio, Sparkles } from 'lucide-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <main class="scene" [class.is-lit]="isLit">
      <div class="grain"></div>
      <header class="topbar">
        <div class="brand"><span class="brand-mark">JN</span><span>JNSPACE</span></div>
        <div class="session"><span class="live-dot"></span> OPENING RITE <span class="slash">/</span> 07:44</div>
        <button class="sound-button" (click)="toggleSound()" [attr.aria-label]="soundOn ? 'Mute ambience' : 'Play ambience'">
          <lucide-icon [img]="soundOn ? Volume2 : VolumeX" [size]="16"></lucide-icon>
          <span>{{ soundOn ? 'AMBIENCE ON' : 'AMBIENCE OFF' }}</span>
        </button>
      </header>

      <section class="hero" aria-labelledby="title">
        <div class="eyebrow"><span class="eyebrow-line"></span> THE FIRST TRANSMISSION <span class="eyebrow-line"></span></div>
        <h1 id="title">THE CALLING<br><em>OF THE ENTS</em></h1>
        <p class="intro">An ancient voice rises from the green dark.<br />The forest remembers. The forest answers.</p>

        <div class="ritual-stage">
          <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
          <div class="moon"><span></span></div>
          <div class="tree tree-left"><i></i><i></i><i></i></div>
          <div class="tree tree-right"><i></i><i></i><i></i></div>
          <div class="fire-wrap" [class.flickering]="isLit">
            <div class="fire-glow"></div><div class="flame flame-back"></div><div class="flame flame-main"></div><div class="ember ember-one"></div><div class="ember ember-two"></div>
          </div>
          <div class="water"><span></span><span></span><span></span></div>
          <div class="stage-label label-fire"><lucide-icon [img]="Flame" [size]="14"></lucide-icon> THE NEARBY SUN</div>
          <div class="stage-label label-water"><lucide-icon [img]="Droplets" [size]="14"></lucide-icon> THE DEEP MEMORY</div>
        </div>

        <button class="enter-button" (click)="beginRite()" [class.active]="isLit">
          <span class="button-icon"><lucide-icon [img]="isLit ? Radio : Sparkles" [size]="16"></lucide-icon></span>
          <span>{{ isLit ? 'THE CHANT IS CARRIED' : 'BEGIN THE CHANT' }}</span>
          <span class="button-arrow">→</span>
        </button>
        <p class="hint"><lucide-icon [img]="ChevronDown" [size]="14"></lucide-icon> A VEDIC HYMN OF THE AGES · LISTEN CLOSELY</p>
      </section>

      <footer class="footer"><span>JNSPACE // CHAPTER 01</span><span>THE JUNCTION AWAITS</span><span>◈ EARTH / MOON / ROOT</span></footer>
      <div class="chant-card" [class.visible]="isLit"><span class="quote-mark">“</span><p>Awake, old roots. Carry the word through leaf and loam. Let every living bough hear: <em>we rise to keep the green.</em></p><span class="quote-source">— THE FIRST BARK OF THORIN OAKENSHIELD</span></div>
    </main>
  `,
  styles: [``]
})
export class AppComponent {
  protected isLit = false;
  protected soundOn = false;
  protected readonly Flame = Flame;
  protected readonly Droplets = Droplets;
  protected readonly Volume2 = Volume2;
  protected readonly VolumeX = VolumeX;
  protected readonly Radio = Radio;
  protected readonly Sparkles = Sparkles;
  protected readonly ChevronDown = ChevronDown;

  beginRite(): void { this.isLit = true; this.soundOn = true; }
  toggleSound(): void { this.soundOn = !this.soundOn; }
}
