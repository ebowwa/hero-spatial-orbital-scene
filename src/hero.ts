// ---------------------------------------------------------------------------
// embed entry — mount the hero into a host container on demand.
//
// The standalone app (index.html -> main.ts) is untouched and still boots
// itself exactly as before. This module lets a host (e.g. secondsee's
// landing) do the same thing on demand: inject the hero markup into a
// container, then dynamically import the app so its modules — which query
// #scene / #loader / #feeds / #deck / .scroll-track / ... at import time —
// find that injected DOM and boot against it.
//
// Single-mount by design: the dynamic import is cached by the module system,
// so boot runs once. Full unmount/remount and resource teardown are
// intentional non-goals for now — a landing hero mounts once and lives for
// the page's lifetime. Those become relevant only if the hero must mount/
// unmount on navigation, at which point graduate to the init-based design.
//
// Integration-time TODOs (deferred): expose this as a package entry
// (package.json "exports") for the host to import. The hero's page-global
// CSS is scoped at build time by the host (see the secondsee landing's
// hero-css-scope vite plugin); the hero side stays byte-identical.
// ---------------------------------------------------------------------------

import { embedConfig } from './embed.ts'

// embedded-mode copy — hosts override it via options.branding instead of
// rewriting the DOM after boot (strings are inserted as-is; they're the
// host's own trusted markup, e.g. 'Every angle.<br />Expert insight.')
const DEFAULT_BRANDING = {
  loaderTitle: 'IMTA / XR-04',
  headline: 'A figure made<br />of fragments.',
  subline:
    'An XR capture in flight — the camera orbits the specimen.<br />Grab the scene to take control. Let go, and the camera resumes.',
}

export interface HeroBranding {
  /** wordmark shown while assets load */
  loaderTitle?: string
  /** HUD headline, shown over the scroll story's opening shots */
  headline?: string
  /** HUD subline under the headline */
  subline?: string
}

function heroMarkup(branding: HeroBranding): string {
  const b = { ...DEFAULT_BRANDING, ...branding }
  return `<canvas id="scene"></canvas>
    <div id="loader">
      <div class="loader-inner">
        <div class="loader-title">${b.loaderTitle}</div>
        <div class="loader-bar"><div id="loader-fill"></div></div>
        <div id="loader-pct">0%</div>
      </div>
    </div>
    <div class="hud hud-copy">
      <h1>${b.headline}</h1>
      <p>${b.subline}</p>
    </div>
    <div class="hud hud-bottom">
      <div id="mode-chip" class="chip">FOLLOWING Camera</div>
    </div>
    <div id="feeds" class="hud"></div>
    <div id="nametag" class="hud">JOE</div>
    <div id="deck" class="hud">
      <div class="deck-card ghost g2"></div>
      <div class="deck-card ghost g1"></div>
      <div class="deck-card front" id="deck-front"></div>
    </div>
    <div class="scroll-track"></div>
    <section id="s2"><div class="s2-label">SECTION 02</div></section>`
}

export interface MountHeroOptions {
  /**
   * debug keyboard shortcuts ('e' cycles environments, 'c' skips to the next
   * rig) and the window.env console playground. Standalone default is on;
   * embedded they default OFF, because host pages have real users typing and
   * bare single-letter shortcuts would fire on them (e.g. Cmd+C).
   */
  debugKeys?: boolean
  /**
   * renderer pixel-ratio cap — the engine uses min(devicePixelRatio, cap).
   * Standalone default 1.5; a host can pass 1 for low-power/mobile screens.
   */
  maxPixelRatio?: number
  /**
   * loader wordmark + HUD copy, injected with the markup (replaces
   * post-boot DOM rewrites from the host).
   */
  branding?: HeroBranding
  /**
   * prefix for asset URLs — '/landing/' for sub-path hosting, or a CDN
   * origin like 'https://cdn.example.com/'. Default '' = site root.
   */
  assetBase?: string
  /**
   * pause the render loop while the canvas is offscreen (default true).
   */
  autoPause?: boolean
}

export interface HeroHandle {
  /** the container the hero markup was injected into */
  container: HTMLElement
  /**
   * Stop/resume the render loop without tearing anything down — an explicit
   * host lever alongside the automatic offscreen pause. Safe to call before
   * boot finishes; the choice sticks across boot.
   */
  setPaused(paused: boolean): void
  /**
   * Crossfade to another environment (walls/floor/backdrop/lights). This is
   * the scenes-by-role lever: pair an environment id with each role/section
   * and transition as it takes over.
   */
  setEnvironment(id: string, seconds?: number): void
  /** ids of every registered environment */
  environments(): string[]
  /**
   * Subscribe to the scroll-story progress (0..1, clamped). Fires
   * immediately with the current value; returns an unsubscribe. Hosts drive
   * handoff effects from this instead of re-deriving the math.
   */
  onScrollProgress(cb: (progress: number) => void): () => void
  /** px of scrollY between story start and progress = 1 (track − viewport) */
  getScrollRange(): number
}

let bootPromise: Promise<typeof import('./main.ts')> | null = null

/**
 * Inject the hero into `container` and boot it. Idempotent for single-mount:
 * a second call returns a handle onto the same running app without re-booting
 * (the boot import is memoized).
 */
export async function mountHero(
  container: HTMLElement,
  options: MountHeroOptions = {},
): Promise<HeroHandle> {
  // host config must land before the app modules evaluate (engine reads
  // maxPixelRatio at import time, loading.ts reads assetBase per fetch, key
  // handlers read debugKeys at event time)
  embedConfig.embedded = true
  embedConfig.debugKeys = options.debugKeys ?? false
  embedConfig.maxPixelRatio = options.maxPixelRatio ?? 1.5
  embedConfig.assetBase = options.assetBase ?? ''
  embedConfig.autoPause = options.autoPause ?? true

  container.innerHTML = heroMarkup(options.branding ?? {})
  // dynamic import defers ALL app side effects to this call (not import time)
  bootPromise ??= import('./main.ts')
  const app = await bootPromise
  return {
    container,
    setPaused: app.setAnimationPaused,
    setEnvironment: app.setEnvironment,
    environments: app.listEnvironments,
    onScrollProgress: app.onScrollProgress,
    getScrollRange: app.getScrollRange,
  }
}
