import './style.css'
import { hideLoader, markLoadFailed } from './loading.ts'
import { viewCam, renderer, clock, composer, canvas, addResize } from './engine.ts'
import {
  flyers,
  setupFlyers,
  measureFeeds,
  renderFeeds,
  compositeFeeds,
  updateFlyer,
  setTrackedSubjectWidth,
  updateRigTracks,
} from './flyers.ts'
import { initDeck } from './deck.ts'
import { updateNametag } from './nametag.ts'
import { setupFigure } from './figure.ts'
import { buildChoreography } from './choreography.ts'
import { enterFollow, resolvePov, updateViewCam } from './director.ts'
import {
  ENVIRONMENTS,
  cycleEnvironment,
  initEnvironment,
  meshEnvironments,
  transitionTo,
  updateEnvironment,
} from './environment.ts'
import { embedConfig, isEditableTarget } from './embed.ts'

const FEED_FPS = 15 // feed boxes are small — re-render them at a reduced rate

// ---------------------------------------------------------------------------
// pause — two independent reasons to stop the loop: a host asking for it
// (setAnimationPaused, via the mountHero handle) and the canvas being
// offscreen (auto-pause). The loop runs only while neither applies. Both
// are safe before boot finishes: the flags stick and the loop starts
// stopped.
// ---------------------------------------------------------------------------

let frame: (() => void) | null = null
let manualPaused = false
let offscreenPaused = false

function applyLoopState() {
  if (frame) renderer.setAnimationLoop(manualPaused || offscreenPaused ? null : frame)
}

export function setAnimationPaused(paused: boolean) {
  manualPaused = paused
  applyLoopState()
}

// ---------------------------------------------------------------------------
// environment control — host-facing API (the `window.env` console playground
// below is gated behind debugKeys). Scenes-by-role: a host crossfades to a
// per-role environment as its content takes over, e.g.
// handle.setEnvironment('solar', 2).
// ---------------------------------------------------------------------------

export function setEnvironment(id: string, seconds?: number) {
  transitionTo(id, seconds)
}

export function listEnvironments(): string[] {
  return ENVIRONMENTS.map((e) => e.id)
}

// scroll-story progress, re-exported for the mountHero handle
export { onScrollProgress, getScrollRange } from './director.ts'

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

async function boot() {
  // walls/floor/backdrop: ?env=<id> picks one, ?mesh=a,b,t holds a static mix
  const params = new URLSearchParams(location.search)
  const meshParam = params.get('mesh')?.split(',')
  if (meshParam && meshParam.length >= 2) {
    meshEnvironments(meshParam[0], meshParam[1], Number(meshParam[2] ?? 0.5))
  } else {
    initEnvironment(params.get('env') ?? 'void')
  }

  // 'e' cycles environments with a crossfade; console API for playing with blends
  window.addEventListener('keydown', (e) => {
    if (!embedConfig.debugKeys) return
    if (e.key !== 'e' || e.metaKey || e.ctrlKey || e.altKey) return
    if (isEditableTarget(e.target)) return
    cycleEnvironment()
  })
  // console playground — standalone only; hosts drive environments through
  // the handle (setEnvironment) instead of a page-wide global
  if (embedConfig.debugKeys) {
    ;(window as unknown as { env: unknown }).env = {
      list: () => ENVIRONMENTS.map((e) => e.id),
      set: (id: string, seconds?: number) => transitionTo(id, seconds),
      mesh: (a: string, b: string, t?: number) => meshEnvironments(a, b, t),
    }
  }

  const [halfArmSpan] = await Promise.all([setupFigure(), setupFlyers()])
  setTrackedSubjectWidth(halfArmSpan)
  resolvePov()
  buildChoreography(halfArmSpan)

  // start framing: already riding behind the first flyer
  for (const f of flyers) updateFlyer(f, 0)
  viewCam.position.copy(flyers[0].chasePos)
  viewCam.quaternion.copy(flyers[0].chaseQuat)
  enterFollow(0)

  hideLoader()
  measureFeeds()
  initDeck()

  let feedAccum = 0
  frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05)
    const elapsed = clock.elapsedTime
    for (const f of flyers) updateFlyer(f, elapsed)
    updateEnvironment(dt)
    updateViewCam(dt, elapsed)
    updateRigTracks(elapsed)
    updateNametag()
    composer.render()
    feedAccum += dt
    if (feedAccum >= 1 / FEED_FPS) {
      feedAccum = 0
      renderFeeds()
    }
    compositeFeeds()
  }

  // auto-pause: drop the frame cost entirely while the canvas is offscreen
  if (embedConfig.autoPause) {
    new IntersectionObserver(([entry]) => {
      offscreenPaused = !entry.isIntersecting
      applyLoopState()
    }).observe(canvas)
  }

  applyLoopState()
}

addResize(measureFeeds)

boot().catch((err) => {
  markLoadFailed()
  console.error(err)
})
