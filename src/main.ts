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

const FEED_FPS = 15 // feed boxes are small — re-render them at a reduced rate

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

async function boot() {
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
