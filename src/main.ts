import './style.css'
import { hideLoader, markLoadFailed } from './loading.ts'
import { viewCam, renderer, clock, composer, addResize } from './engine.ts'
import {
  flyers,
  setupFlyers,
  measureFeeds,
  renderFeeds,
  compositeFeeds,
  updateFlyer,
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

const FEED_FPS = 15 // feed boxes are small — re-render them at a reduced rate

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
    if (e.key === 'e' && !e.metaKey && !e.ctrlKey) cycleEnvironment()
  })
  ;(window as unknown as { env: unknown }).env = {
    list: () => ENVIRONMENTS.map((e) => e.id),
    set: (id: string, seconds?: number) => transitionTo(id, seconds),
    mesh: (a: string, b: string, t?: number) => meshEnvironments(a, b, t),
  }

  const [halfArmSpan] = await Promise.all([setupFigure(), setupFlyers()])
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
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05)
    const elapsed = clock.elapsedTime
    for (const f of flyers) updateFlyer(f, elapsed)
    updateEnvironment(dt)
    updateViewCam(dt, elapsed)
    updateNametag()
    composer.render()
    feedAccum += dt
    if (feedAccum >= 1 / FEED_FPS) {
      feedAccum = 0
      renderFeeds()
    }
    compositeFeeds()
  })
}

addResize(measureFeeds)

boot().catch((err) => {
  markLoadFailed()
  console.error(err)
})
