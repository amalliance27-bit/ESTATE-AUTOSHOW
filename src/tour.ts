/**
 * Châteaux Loire Estate — 3D Cinematic Auto-Tour & Doorbell System
 * Controls scroll simulation, Web Audio doorbell synthesis, room showcase pauses,
 * 7-second finale pause, and gallery auto-scroll bounce back.
 */

// Web Audio Doorbell Synthesizer (Realistic Two-Tone Luxury Estate Brass Chime)
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playDoorbellChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // Master output with subtle reverb-like delay & filtering - lowered volume to half
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.35, now); // Halved from 0.70 to 0.35
      masterGain.connect(ctx.destination);

      // Create a single chime strike with rich acoustic tubular bell harmonics
      const playChimeTone = (freq: number, startTime: number, duration: number, peakGain: number) => {
        // Harmonic partial ratios for tubular brass bells
        const partials = [
          { mult: 1.0, gain: 1.0, decay: duration },
          { mult: 2.0, gain: 0.5, decay: duration * 0.8 },
          { mult: 2.76, gain: 0.35, decay: duration * 0.6 },
          { mult: 4.0, gain: 0.2, decay: duration * 0.45 },
          { mult: 5.4, gain: 0.12, decay: duration * 0.3 },
        ];

        partials.forEach(({ mult, gain: pGain, decay }) => {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq * mult, startTime);

          // Fast strike attack, then exponential decay
          gainNode.gain.setValueAtTime(0.0001, startTime);
          gainNode.gain.exponentialRampToValueAtTime(peakGain * pGain, startTime + 0.008);
          gainNode.gain.exponentialRampToValueAtTime(0.00001, startTime + decay);

          osc.connect(gainNode);
          gainNode.connect(masterGain);

          osc.start(startTime);
          osc.stop(startTime + decay + 0.1);
        });

        // Sharp metallic strike transient (hammer impact)
        const clickOsc = ctx.createOscillator();
        const clickGain = ctx.createGain();
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(freq * 4.5, startTime);
        clickGain.gain.setValueAtTime(0.12 * peakGain, startTime);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.035);
        clickOsc.connect(clickGain);
        clickGain.connect(masterGain);
        clickOsc.start(startTime);
        clickOsc.stop(startTime + 0.05);
      };

      // Tone 1 ("Ding"): E5 (659.25 Hz) - half volume
      playChimeTone(659.25, now, 2.4, 0.35);

      // Tone 2 ("Dong"): C5 (523.25 Hz), struck 420ms later - half volume
      playChimeTone(523.25, now + 0.42, 2.8, 0.38);

      setTimeout(() => {
        resolve();
      }, 2800);
    } catch (e) {
      console.warn('[EstateTour] Web Audio playback failed:', e);
      resolve();
    }
  });
}

// Tour Stops Definition - relaxed showcase durations for slow cinematic pace
export interface TourStop {
  id: string;
  name: string;
  subtitle: string;
  t: number; // progress 0..1 in 1050vh video container
  pauseDurationSec: number;
}

export const TOUR_STOPS: TourStop[] = [
  {
    id: 'backyard',
    name: 'The Grounds & Backyard Pool',
    subtitle: 'Pool & Spa · Fire-Pit Lounge · Outdoor BBQ Kitchen',
    t: 0.21,
    pauseDurationSec: 5.5,
  },
  {
    id: 'court',
    name: 'Beyond The Water',
    subtitle: 'Full-Size Tennis Court · Mountain Views',
    t: 0.28,
    pauseDurationSec: 5.0,
  },
  {
    id: 'facade-entry',
    name: 'French Chateau Entrance',
    subtitle: 'Built 1989 · 24-Hour Guard Gated Community',
    t: 0.37,
    pauseDurationSec: 5.0,
  },
  {
    id: 'living',
    name: 'Formal Living Room',
    subtitle: 'Artisan Millwork · Rich Hardwood · Tray Ceilings',
    t: 0.48,
    pauseDurationSec: 5.5,
  },
  {
    id: 'kitchen',
    name: "Gourmet Chef's Kitchen",
    subtitle: 'Carrara Marble · Thermador Appliances · Custom Cabinetry',
    t: 0.585,
    pauseDurationSec: 5.5,
  },
  {
    id: 'theater',
    name: 'Theater & Game Lounge',
    subtitle: 'Projection Screen · Billiards · Entertaining Wing',
    t: 0.685,
    pauseDurationSec: 5.0,
  },
  {
    id: 'bath',
    name: 'Primary Bath Suite',
    subtitle: 'Marble Throughout · Bay Window Soaking Tub',
    t: 0.775,
    pauseDurationSec: 5.0,
  },
  {
    id: 'foyer',
    name: 'Grand Two-Story Entry',
    subtitle: 'Two Stories · Sweeping Curved Staircase',
    t: 0.855,
    pauseDurationSec: 5.0,
  },
  {
    id: 'chateau',
    name: 'Châteaux Loire Estate',
    subtitle: '$4,795,000 · MLS CL26653237 · Indian Springs',
    t: 0.925,
    pauseDurationSec: 4.5,
  },
];

// Target position for "Experience The Estate" (the exact view in user screenshot)
export const START_FINISH_T = 0.985;

class EstateTourController {
  private isTourRunning = false;
  private isPaused = false;
  private currentStopIndex = -1;
  private animFrameId: number | null = null;
  private pauseTimer: number | null = null;
  private pauseSecondsRemaining = 0;
  private pauseCountdownInterval: number | null = null;
  private speed = 1.0;
  private hudElement: HTMLElement | null = null;
  private userInteractionLocked = false;
  private formButtonInjected = false;

  constructor() {
    this.init();
  }

  private getContainer(): HTMLElement | null {
    return document.querySelector('div[style*="1050vh"]') as HTMLElement | null;
  }

  private getMaxScroll(): number {
    const container = this.getContainer();
    if (!container) return Math.max(1, (10.5 - 1) * window.innerHeight);
    return Math.max(1, container.offsetHeight - window.innerHeight);
  }

  private getCurrentT(): number {
    const maxScroll = this.getMaxScroll();
    return Math.min(1, Math.max(0, window.scrollY / maxScroll));
  }

  private setScrollPosition(y: number, immediate = false) {
    if ((window as unknown as { lenis?: { scrollTo: (y: number, opts?: { immediate?: boolean }) => void } }).lenis) {
      try {
        (window as unknown as { lenis: { scrollTo: (y: number, opts?: { immediate?: boolean }) => void } }).lenis.scrollTo(y, {
          immediate,
        });
        return;
      } catch {
        // Fallback to window.scrollTo
      }
    }
    window.scrollTo({
      top: y,
      behavior: immediate ? 'instant' : 'auto',
    });
  }

  public init() {
    // 1. Initial positioning: Start this website HERE (at Experience The Estate)
    const positionAtStart = () => {
      const maxScroll = this.getMaxScroll();
      const targetY = maxScroll * START_FINISH_T;
      
      // Perform initial jump to Experience The Estate
      this.setScrollPosition(targetY, true);
      
      // Reveal the Experience The Estate overlay if it had opacity 0
      const expOverlay = document.querySelector('div.absolute.inset-0.overflow-y-auto') as HTMLElement | null;
      if (expOverlay) {
        expOverlay.style.opacity = '1';
        expOverlay.style.pointerEvents = 'auto';
      }

      // Hide loading spinner if present
      const loader = document.querySelector('div.estate-shimmer')?.parentElement as HTMLElement | null;
      if (loader) {
        loader.style.opacity = '0';
        loader.style.pointerEvents = 'none';
        loader.style.display = 'none';
      }
    };

    // Run positioning once DOM is ready and retry after short delay to handle video layout
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', positionAtStart);
    } else {
      positionAtStart();
    }
    setTimeout(positionAtStart, 150);
    setTimeout(positionAtStart, 500);

    // Setup global hooks
    (window as unknown as { __startEstateTour: () => void }).__startEstateTour = () => this.startTourFromBackyard();
    (window as unknown as { __estateTourController: EstateTourController }).__estateTourController = this;

    // Build HUD & Watch DOM for form injection
    this.createHud();
    this.injectFormDoorbellButton();

    // Prevent mouse wheel and gesture sensitivity from interrupting or fighting the drone tour
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.isTourRunning && this.userInteractionLocked) {
          e.preventDefault();
        }
      },
      { passive: false }
    );
    window.addEventListener(
      'touchmove',
      (e) => {
        if (this.isTourRunning && this.userInteractionLocked) {
          e.preventDefault();
        }
      },
      { passive: false }
    );
  }

  // Inject Doorbell button directly into the "Experience The Estate" showing form
  private injectFormDoorbellButton() {
    const form = document.querySelector('form.space-y-3');
    if (!form || form.querySelector('#estate-form-doorbell-btn')) return;

    const requestBtn = form.querySelector('button[type="submit"]');
    if (!requestBtn) return;

    // Container for action buttons
    const btnRow = document.createElement('div');
    btnRow.id = 'estate-form-doorbell-btn';
    btnRow.className = 'mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full';

    // Move request button inside the flex row
    requestBtn.parentNode?.insertBefore(btnRow, requestBtn);
    btnRow.appendChild(requestBtn);

    // Create the Doorbell Tour Button
    const doorbellBtn = document.createElement('button');
    doorbellBtn.type = 'button';
    doorbellBtn.className =
      'group relative flex items-center justify-center gap-2.5 rounded-none border border-amber-300/60 bg-gradient-to-r from-amber-500/20 via-amber-400/25 to-amber-600/20 px-6 py-3 font-sans text-[0.62rem] uppercase tracking-[0.38em] text-amber-200 transition-all duration-300 hover:border-amber-300 hover:bg-amber-400/30 hover:text-white hover:shadow-[0_0_25px_rgba(251,191,36,0.35)] active:scale-95 cursor-pointer';

    doorbellBtn.innerHTML = `
      <span class="relative flex h-2.5 w-2.5 shrink-0">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-300"></span>
      </span>
      <svg class="h-4 w-4 text-amber-300 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      <span class="font-medium tracking-[0.34em]">Ring Doorbell · Start 3D Tour</span>
    `;

    doorbellBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.startTourFromBackyard();
    });

    btnRow.appendChild(doorbellBtn);
    this.formButtonInjected = true;
  }

  // Create floating luxury Auto-Tour HUD (minimalist, less business, anti-slop)
  private createHud() {
    if (this.hudElement) return;

    const hud = document.createElement('div');
    hud.id = 'estate-tour-hud';
    hud.className = 'pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center justify-center px-4 transition-all duration-500 opacity-100';
    hud.innerHTML = `
      <!-- Persistent Floating Doorbell Launcher when Tour is idle -->
      <div id="hud-idle-banner" class="pointer-events-auto flex items-center gap-3 rounded-full border border-amber-400/35 bg-black/80 px-6 py-2.5 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] transition-all hover:border-amber-300 hover:bg-black/90">
        <button id="hud-doorbell-ring-btn" type="button" class="group flex items-center gap-2.5 font-sans text-[0.62rem] uppercase tracking-[0.34em] text-amber-200 transition hover:text-white cursor-pointer">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-300"></span>
          </span>
          <svg class="h-3.5 w-3.5 text-amber-300 transition-transform group-hover:scale-110 group-hover:rotate-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <span class="font-medium">Ring Doorbell to Start Drone Tour</span>
        </button>
      </div>

      <!-- Active Tour: Minimalist Single-Line Status Pill (Less Business) -->
      <div id="hud-active-panel" class="hidden pointer-events-auto flex items-center gap-3.5 rounded-full border border-white/20 bg-black/85 px-6 py-2.5 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] animate-fade-in">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-300"></span>
        </span>
        <span id="hud-room-title" class="font-serif text-sm tracking-wide text-white font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">The Grounds & Backyard Pool</span>
        <span class="text-white/30 text-xs">·</span>
        <span id="hud-room-step" class="font-sans text-[0.62rem] uppercase tracking-[0.28em] text-amber-300/90 font-medium">1/9</span>
        <span class="text-white/30 text-xs" id="hud-countdown-dot">·</span>
        <span id="hud-countdown-text" class="font-sans text-[0.62rem] uppercase tracking-[0.2em] text-white/85">5s</span>
        <button id="hud-exit-btn" type="button" title="Exit Drone Tour" class="ml-1 rounded-full p-1 text-white/40 hover:text-white transition cursor-pointer">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(hud);
    this.hudElement = hud;

    // Attach HUD events
    document.getElementById('hud-doorbell-ring-btn')?.addEventListener('click', () => this.startTourFromBackyard());
    document.getElementById('hud-exit-btn')?.addEventListener('click', () => this.stopTour());
  }

  private updateHud(state: {
    isRunning: boolean;
    isPaused: boolean;
    stopIndex?: number;
    customTitle?: string;
    customSubtitle?: string;
    statusText?: string;
    secondsRemaining?: number;
  }) {
    const idleBanner = document.getElementById('hud-idle-banner');
    const activePanel = document.getElementById('hud-active-panel');

    if (!state.isRunning) {
      idleBanner?.classList.remove('hidden');
      activePanel?.classList.add('hidden');
      return;
    }

    idleBanner?.classList.add('hidden');
    activePanel?.classList.remove('hidden');

    const stepLabel = document.getElementById('hud-room-step');
    const titleEl = document.getElementById('hud-room-title');
    const countdownEl = document.getElementById('hud-countdown-text');
    const countdownDot = document.getElementById('hud-countdown-dot');

    if (state.customTitle && titleEl) {
      titleEl.textContent = state.customTitle;
      if (stepLabel) stepLabel.textContent = 'Finale';
    } else if (typeof state.stopIndex === 'number' && TOUR_STOPS[state.stopIndex]) {
      const stop = TOUR_STOPS[state.stopIndex];
      if (stepLabel) stepLabel.textContent = `${state.stopIndex + 1}/${TOUR_STOPS.length}`;
      if (titleEl) titleEl.textContent = stop.name;
    }

    if (typeof state.secondsRemaining === 'number') {
      if (countdownEl) {
        countdownEl.textContent = state.secondsRemaining > 0 ? `${state.secondsRemaining}s` : 'Gliding...';
      }
      countdownDot?.classList.remove('hidden');
      countdownEl?.classList.remove('hidden');
    } else {
      countdownDot?.classList.add('hidden');
      countdownEl?.classList.add('hidden');
    }
  }

  // Ring doorbell chime & initiate tour at the backyard
  public async startTourFromBackyard() {
    this.stopTour();
    this.isTourRunning = true;
    this.isPaused = false;
    this.userInteractionLocked = true;

    // 1. Play realistic doorbell sound
    playDoorbellChime();

    // Show visual ringing feedback
    this.updateHud({
      isRunning: true,
      isPaused: false,
      customTitle: 'Doorbell Chime Ringing',
      customSubtitle: 'Welcoming guests · Gliding to the Backyard Grounds...',
      statusText: '🔔 Chime Active',
    });

    // Brief pause as chime sounds, then slow serene glide to Backyard (t ≈ 0.20)
    await new Promise((r) => setTimeout(r, 900));

    const maxScroll = this.getMaxScroll();
    const backyardTargetY = maxScroll * TOUR_STOPS[0].t;

    // Real slow, majestic camera glide to backyard
    await this.smoothScrollTo(backyardTargetY, 4400);

    this.currentStopIndex = 0;
    this.runStopSequence(0);
  }

  // Handle individual room stop and pause sequence
  private async runStopSequence(index: number) {
    if (!this.isTourRunning || this.isPaused) return;

    if (index >= TOUR_STOPS.length) {
      // Reached end of tour: arrive at "Experience The Estate"
      this.runFinaleSequence();
      return;
    }

    this.currentStopIndex = index;
    const stop = TOUR_STOPS[index];
    const duration = Math.max(1, Math.round(stop.pauseDurationSec / this.speed));

    this.pauseSecondsRemaining = duration;
    this.updateHud({
      isRunning: true,
      isPaused: false,
      stopIndex: index,
      statusText: 'Showcasing Room (Slow Pace)',
      secondsRemaining: this.pauseSecondsRemaining,
    });

    // Countdown interval during room pause
    if (this.pauseCountdownInterval) clearInterval(this.pauseCountdownInterval);
    this.pauseCountdownInterval = window.setInterval(() => {
      if (this.isPaused) return;
      this.pauseSecondsRemaining -= 1;
      this.updateHud({
        isRunning: true,
        isPaused: this.isPaused,
        stopIndex: index,
        secondsRemaining: Math.max(0, this.pauseSecondsRemaining),
      });
      if (this.pauseSecondsRemaining <= 0) {
        if (this.pauseCountdownInterval) clearInterval(this.pauseCountdownInterval);
      }
    }, 1000);

    // Pause for the specified room duration
    await new Promise((resolve) => {
      this.pauseTimer = window.setTimeout(resolve, duration * 1000);
    });

    if (!this.isTourRunning || this.isPaused) return;

    // Simulate mouse scroll advancing to next stop - real slow and fluid
    const nextIndex = index + 1;
    if (nextIndex < TOUR_STOPS.length) {
      const nextStop = TOUR_STOPS[nextIndex];
      const maxScroll = this.getMaxScroll();
      const targetY = maxScroll * nextStop.t;

      this.updateHud({
        isRunning: true,
        isPaused: false,
        stopIndex: index,
        statusText: 'Simulating Slow Scroll → Next Room',
      });

      // Real slow mouse scroll simulation (5600ms per stop transition)
      const travelDuration = Math.round(5600 / this.speed);
      await this.simulateMouseScrollTo(targetY, travelDuration);

      if (this.isTourRunning && !this.isPaused) {
        this.runStopSequence(nextIndex);
      }
    } else {
      // Transition to final destination
      this.runFinaleSequence();
    }
  }

  /**
   * The Finale:
   * "end up riight here pause for 7 sec and auto scroll down and bounce back"
   */
  private async runFinaleSequence() {
    if (!this.isTourRunning) return;

    this.updateHud({
      isRunning: true,
      isPaused: false,
      customTitle: 'Returning to Experience The Estate',
      customSubtitle: 'Slowly gliding to Private Showings Suite...',
      statusText: 'Simulating Slow Scroll → Final Stop',
    });

    const maxScroll = this.getMaxScroll();
    const finalDestinationY = maxScroll * START_FINISH_T;

    // Real slow mouse wheel scroll simulation to Experience The Estate view (5200ms)
    await this.simulateMouseScrollTo(finalDestinationY, 5200);

    if (!this.isTourRunning) return;

    // Ensure Experience The Estate overlay is fully visible
    const expOverlay = document.querySelector('div.absolute.inset-0.overflow-y-auto') as HTMLElement | null;
    if (expOverlay) {
      expOverlay.style.opacity = '1';
      expOverlay.style.pointerEvents = 'auto';
    }

    // PAUSE FOR EXACTLY 7 SECONDS as requested by the user
    let secondsLeft = 7;
    this.updateHud({
      isRunning: true,
      isPaused: false,
      customTitle: 'Experience The Estate',
      customSubtitle: 'Pausing 7 seconds at private showing suite before photo gallery showcase...',
      statusText: 'Final Room Pause (7s)',
      secondsRemaining: secondsLeft,
    });

    if (this.pauseCountdownInterval) clearInterval(this.pauseCountdownInterval);
    await new Promise<void>((resolve) => {
      this.pauseCountdownInterval = window.setInterval(() => {
        secondsLeft -= 1;
        this.updateHud({
          isRunning: true,
          isPaused: false,
          customTitle: 'Experience The Estate',
          customSubtitle: `Pausing at showing suite... Gallery showcase in ${secondsLeft}s`,
          statusText: `Pause 7s (${secondsLeft}s left)`,
          secondsRemaining: Math.max(0, secondsLeft),
        });

        if (secondsLeft <= 0) {
          if (this.pauseCountdownInterval) clearInterval(this.pauseCountdownInterval);
          resolve();
        }
      }, 1000);
    });

    if (!this.isTourRunning) return;

    // AUTO SCROLL DOWN into the 38 photographs gallery (slow glide 4600ms)
    this.updateHud({
      isRunning: true,
      isPaused: false,
      customTitle: '38 Photographs Gallery',
      customSubtitle: 'Slowly auto-scrolling down through full estate photography...',
      statusText: 'Slow Auto-Scroll Down ↓',
    });

    // Scroll into the gallery section
    const gallerySection = document.getElementById('gallery');
    const galleryTargetY = gallerySection
      ? gallerySection.offsetTop + 180
      : maxScroll + window.innerHeight * 0.8;

    await this.smoothScrollTo(galleryTargetY, 4600);

    if (!this.isTourRunning) return;

    // Relaxed linger in photo gallery for 3 seconds to showcase photos
    await new Promise((r) => setTimeout(r, 3000));

    if (!this.isTourRunning) return;

    // AND BOUNCE BACK UP to "Experience The Estate" - slow elastic rise (4200ms)
    this.updateHud({
      isRunning: true,
      isPaused: false,
      customTitle: 'Bouncing Back to Experience The Estate',
      customSubtitle: 'Slowly springing back to private showing request...',
      statusText: 'Slow Bounce Back ↑',
    });

    // Gentle spring/bounce scroll curve back to Experience The Estate
    await this.bounceScrollTo(finalDestinationY, 4200);

    // Conclude Tour
    this.updateHud({
      isRunning: true,
      isPaused: false,
      customTitle: 'Tour Concluded',
      customSubtitle: 'You may now request a showing or ring the doorbell to replay.',
      statusText: '✓ Tour Complete',
    });

    setTimeout(() => {
      this.stopTour();
    }, 4500);
  }

  // Simulates incremental mouse wheel rotation with natural easing & micro-inertia
  private simulateMouseScrollTo(targetY: number, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const startY = window.scrollY;
      const distance = targetY - startY;
      const startTime = performance.now();

      const easeInOutCubic = (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const step = (now: number) => {
        if (!this.isTourRunning || this.isPaused) {
          resolve();
          return;
        }

        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = easeInOutCubic(progress);

        // Add micro-tick variation to mimic discrete mouse wheel detents
        const currentY = startY + distance * eased;
        this.setScrollPosition(currentY, false);

        if (progress < 1) {
          this.animFrameId = requestAnimationFrame(step);
        } else {
          this.setScrollPosition(targetY, true);
          resolve();
        }
      };

      this.animFrameId = requestAnimationFrame(step);
    });
  }

  // Smooth scroll with custom duration
  private smoothScrollTo(targetY: number, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const startY = window.scrollY;
      const distance = targetY - startY;
      const startTime = performance.now();

      const easeOutQuart = (x: number): number => 1 - Math.pow(1 - x, 4);

      const step = (now: number) => {
        if (!this.isTourRunning && this.animFrameId === null) {
          resolve();
          return;
        }

        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = easeOutQuart(progress);

        this.setScrollPosition(startY + distance * eased, false);

        if (progress < 1) {
          this.animFrameId = requestAnimationFrame(step);
        } else {
          this.setScrollPosition(targetY, true);
          resolve();
        }
      };

      this.animFrameId = requestAnimationFrame(step);
    });
  }

  // Elastic bounce-back scroll animation
  private bounceScrollTo(targetY: number, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const startY = window.scrollY;
      const distance = targetY - startY;
      const startTime = performance.now();

      // Cubic overshoot curve creating the luxury spring/bounce feeling
      const bounceEase = (x: number): number => {
        const c4 = (2 * Math.PI) / 3;
        return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
      };

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = bounceEase(progress);

        this.setScrollPosition(startY + distance * eased, false);

        if (progress < 1) {
          this.animFrameId = requestAnimationFrame(step);
        } else {
          this.setScrollPosition(targetY, true);
          resolve();
        }
      };

      this.animFrameId = requestAnimationFrame(step);
    });
  }

  public togglePause() {
    if (!this.isTourRunning) return;
    if (this.isPaused) {
      this.resumeTour();
    } else {
      this.pauseTour(false);
    }
  }

  public pauseTour(isUserInterrupted = false) {
    this.isPaused = true;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    this.updateHud({
      isRunning: true,
      isPaused: true,
      statusText: isUserInterrupted ? 'Paused by User Scroll' : 'Tour Paused',
    });
  }

  public resumeTour() {
    if (!this.isTourRunning || !this.isPaused) return;
    this.isPaused = false;
    this.updateHud({
      isRunning: true,
      isPaused: false,
      statusText: 'Resuming Tour...',
    });

    // Find nearest stop ahead of current position or continue
    const currentT = this.getCurrentT();
    const nextStopIndex = TOUR_STOPS.findIndex((s) => s.t > currentT + 0.02);
    if (nextStopIndex !== -1) {
      const targetY = this.getMaxScroll() * TOUR_STOPS[nextStopIndex].t;
      this.simulateMouseScrollTo(targetY, 1500).then(() => {
        this.runStopSequence(nextStopIndex);
      });
    } else {
      this.runFinaleSequence();
    }
  }

  public skipToNextStop() {
    if (!this.isTourRunning) return;
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    if (this.pauseCountdownInterval) clearInterval(this.pauseCountdownInterval);
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

    const nextIndex = this.currentStopIndex + 1;
    if (nextIndex < TOUR_STOPS.length) {
      const targetY = this.getMaxScroll() * TOUR_STOPS[nextIndex].t;
      this.smoothScrollTo(targetY, 1000).then(() => {
        this.runStopSequence(nextIndex);
      });
    } else {
      this.runFinaleSequence();
    }
  }

  public toggleSpeed() {
    this.speed = this.speed === 1.0 ? 0.7 : this.speed === 0.7 ? 1.4 : 1.0;
    const speedBtn = document.getElementById('hud-speed-btn');
    if (speedBtn) {
      speedBtn.textContent =
        this.speed === 0.7 ? '0.7x (Ultra Slow)' : this.speed === 1.0 ? '1.0x (Cinematic Slow)' : '1.4x (Standard)';
    }
  }

  public stopTour() {
    this.isTourRunning = false;
    this.isPaused = false;
    this.userInteractionLocked = false;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    if (this.pauseCountdownInterval) clearInterval(this.pauseCountdownInterval);
    this.updateHud({ isRunning: false, isPaused: false });
  }
}

// Auto-instantiate singleton controller on load
new EstateTourController();
