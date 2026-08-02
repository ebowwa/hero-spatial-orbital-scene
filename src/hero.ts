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
// Integration-time TODOs (deferred): thread a `baseUrl` for the /assets GLBs
// (so it mounts under a sub-path), scope the hero's CSS (#scene is
// position:fixed, html/body styles are global), and expose this as a package
// entry (package.json "exports") for the host to import.
// ---------------------------------------------------------------------------

const HERO_MARKUP = `<canvas id="scene"></canvas>
    <div id="loader">
      <div class="loader-inner">
        <div class="loader-title">IMTA / XR-04</div>
        <div class="loader-bar"><div id="loader-fill"></div></div>
        <div id="loader-pct">0%</div>
      </div>
    </div>
    <div class="hud hud-copy">
      <h1>A figure made<br />of fragments.</h1>
      <p>An XR capture in flight — the camera orbits the specimen.<br />Grab the scene to take control. Let go, and the camera resumes.</p>
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

export interface HeroHandle {
  /** the container the hero markup was injected into */
  container: HTMLElement
}

let started = false

/**
 * Inject the hero into `container` and boot it. Idempotent for single-mount:
 * a second call returns the container without re-booting (the app module is
 * cached after the first dynamic import).
 */
export async function mountHero(container: HTMLElement): Promise<HeroHandle> {
  container.innerHTML = HERO_MARKUP
  if (!started) {
    started = true
    // dynamic import defers ALL app side effects to this call (not import time)
    await import('./main.ts')
  }
  return { container }
}
