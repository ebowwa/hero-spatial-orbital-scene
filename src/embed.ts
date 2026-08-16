// ---------------------------------------------------------------------------
// embed config — host-settable knobs, written by mountHero() BEFORE the app
// modules are imported, and read by modules that also run standalone. The
// defaults below are the standalone behavior (index.html -> main.ts never
// touches this module).
// ---------------------------------------------------------------------------

export const embedConfig = {
  // true once a host mounts the hero via mountHero() — standalone behavior
  // (index.html -> main.ts) leaves this false
  embedded: false,

  // debug keyboard shortcuts: 'e' cycles environments, 'c' skips to the next
  // rig. Off when embedded — host pages have real users typing, and bare
  // single-letter shortcuts (and Cmd/Ctrl+C!) would fire on them.
  debugKeys: true,

  // renderer pixel-ratio cap — the engine uses min(devicePixelRatio, cap).
  // A host can drop this to 1 on low-power/mobile screens instead of
  // shadowing window.devicePixelRatio around the mount.
  maxPixelRatio: 1.5,

  // pause the render loop automatically while the canvas is offscreen
  // (IntersectionObserver). On everywhere by default — the canvas is the
  // whole viewport standalone, so it simply never triggers there.
  autoPause: true,

  // prefix for asset URLs ('' = site root). A host mounting under a
  // sub-path — or serving GLBs from a CDN — passes e.g. '/landing/' or
  // 'https://cdn.example.com/' via mountHero(); loading.ts applies it.
  assetBase: '',
}

// key handlers must stay quiet while the user is typing in the host page
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}
