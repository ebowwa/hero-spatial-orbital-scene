import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { viewCam, canvas, tmpMat, tmpQuat, tmpVecA, tmpVecB, MODEL_HEIGHT } from './engine.ts'
import { flyers , layoutFeeds } from './flyers.ts'
import { setDeckVisibility } from './deck.ts'
import { embedConfig, isEditableTarget } from './embed.ts'

// ---------------------------------------------------------------------------
// camera director — always following SOME rig. It dwells on one, then drifts
// on its own way until it comes across another rig and picks that one up.
// The user can grab the scene at any time; on release the camera coasts off
// and resumes the hunt. No buttons.
// ---------------------------------------------------------------------------

type CamState = 'follow' | 'blend' | 'drag' | 'wander' | 'scroll'

const FOLLOW_SECONDS = 16 // dwell time on each rig
const WANDER_MAX_SECONDS = 14 // failsafe: never drift longer than this
const RIG_IGNORE_MS = 7000 // after leaving a rig, don't re-acquire it instantly
const ENCOUNTER_DIST = 1.5 // how close a drift must pass to count as "came across"
const WANDER_SPEED = 0.85
const BLEND_SECONDS = 1.6 // transition duration when acquiring a rig

const modeChip = document.querySelector<HTMLDivElement>('#mode-chip')!
const copyEl = document.querySelector<HTMLDivElement>('.hud-copy')!
const feedsEl = document.querySelector<HTMLDivElement>('#feeds')!

let camState: CamState = 'follow'
let followTimer = 0
let wanderTimer = 0
let blendT = 0
const blendFromPos = new THREE.Vector3()
const blendFromQuat = new THREE.Quaternion()
const wanderVel = new THREE.Vector3()
const prevCamPos = new THREE.Vector3()
const rigIgnoreUntil = new Map<number, number>()
let followIndex = 0 // which flyer the view cam chases
let povIndex = -1 // the face-mounted glasses rig (resolved after setup)

const controls = new OrbitControls(viewCam, canvas)
// OrbitControls writes touch-action: none on the canvas; that traps touch
// scrolling over this full-viewport canvas and makes the scroll story
// unreachable on mobile. pan-y lets vertical swipes scroll the page while
// horizontal drags still orbit. (Hosts no longer need to override this.)
canvas.style.touchAction = 'pan-y'
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.enablePan = false
controls.enableZoom = false // wheel must scroll the page (scroll story), not dolly
controls.minDistance = 0.6
controls.maxDistance = 9
controls.target.set(0, MODEL_HEIGHT * 0.55, 0)
controls.enabled = true // always on — the director yields to it in 'drag'

function chip(text: string) {
  modeChip.textContent = text
}

export function enterFollow(idx: number) {
  followIndex = idx
  camState = 'follow'
  followTimer = 0
  chip(`FOLLOWING ${flyers[idx].def.label}`)
}

function blendToRig(idx: number) {
  blendFromPos.copy(viewCam.position)
  blendFromQuat.copy(viewCam.quaternion)
  blendT = 0
  followIndex = idx
  camState = 'blend'
  chip(`ACQUIRING ${flyers[idx].def.label}`)
}

/** sideways push that keeps a drifting camera orbiting the figure */
function tangentialAt(p: THREE.Vector3, out: THREE.Vector3) {
  const radial = new THREE.Vector3(p.x, 0, p.z)
  if (radial.lengthSq() < 1e-4) radial.set(0, 0, 1)
  radial.normalize()
  return out.set(-radial.z, 0.12, radial.x).normalize().multiplyScalar(WANDER_SPEED)
}

function enterWander(seed?: THREE.Vector3) {
  rigIgnoreUntil.set(followIndex, performance.now() + RIG_IGNORE_MS)
  camState = 'wander'
  wanderTimer = 0
  if (seed && seed.lengthSq() > 1e-6) {
    wanderVel.copy(seed).clampLength(0.4, WANDER_SPEED * 1.4)
  } else {
    tangentialAt(viewCam.position, wanderVel)
  }
  chip('DRIFTING')
}

/** resolve the face-mounted glasses rig once the fleet is built */
export function resolvePov() {
  povIndex = flyers.findIndex((f) => f.pov)
}

controls.addEventListener('start', () => {
  controls.target.set(0, MODEL_HEIGHT * 0.55, 0)
  camState = 'drag'
  chip('MANUAL CONTROL')
})
controls.addEventListener('end', () => {
  // hand the camera's last motion to the wanderer and let it coast
  enterWander(viewCam.position.clone().sub(prevCamPos).multiplyScalar(20))
})

window.addEventListener('keydown', (e) => {
  // skip to next rig — gated so it never fires on a host page (Cmd+C is copy)
  if (!embedConfig.debugKeys) return
  if (e.key !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return
  if (isEditableTarget(e.target)) return
  blendToRig((followIndex + 1) % flyers.length)
})

// ---------------------------------------------------------------------------
// scroll story — scrolling guides the camera to joe's face, then through his
// eye into the glasses POV, and the next section slides over that as the wipe
// ---------------------------------------------------------------------------

const trackEl = document.querySelector<HTMLDivElement>('.scroll-track')!
// the blink — full-frame eyelid for the eye pass-through (see updateViewCam);
// appended last and z-raised above the HUD so nothing paints through it
const blinkEl = document.createElement('div')
blinkEl.className = 'hud blink'
trackEl.parentElement!.appendChild(blinkEl)
let scrollP = 0
let lastAppliedFeedScale = 1
const scrollEntryPos = new THREE.Vector3()
const scrollEntryQuat = new THREE.Quaternion()
// bezier control that bows the phase-1 glide AROUND joe instead of through
// him: a straight lerp from a behind-him entry slices the skull, and the
// near plane + backface culling then make his head vanish mid-flight
const scrollBowCtrl = new THREE.Vector3()

// hosts read the story progress here instead of re-deriving it from their
// own copy of the track geometry (the handoff math stays in sync by
// construction). cb fires immediately with the current value, and returns
// an unsubscribe.
const scrollProgressCbs = new Set<(p: number) => void>()

export function onScrollProgress(cb: (p: number) => void): () => void {
  scrollProgressCbs.add(cb)
  cb(scrollP)
  return () => scrollProgressCbs.delete(cb)
}

/** px of scrollY between story start and scrollP = 1 (track minus viewport) */
export function getScrollRange(): number {
  return Math.max(trackEl.offsetHeight - window.innerHeight, 0)
}

window.addEventListener(
  'scroll',
  () => {
    const range = getScrollRange()
    scrollP = range > 0 ? Math.min(Math.max(window.scrollY / range, 0), 1) : 0
    for (const cb of scrollProgressCbs) cb(scrollP)
  },
  { passive: true },
)

const smooth01 = (t: number) => {
  t = Math.min(Math.max(t, 0), 1)
  return t * t * (3 - 2 * t)
}

// debug: ?scroll=0.75 jumps to a scroll-story position on load
const debugScroll = new URLSearchParams(location.search).has('scroll')
if (debugScroll) {
  const p = new URLSearchParams(location.search).get('scroll')!
  window.addEventListener('load', () => {
    const range = trackEl.offsetHeight - window.innerHeight
    window.scrollTo(0, parseFloat(p) * range)
  })
}

// ---------------------------------------------------------------------------
// per-frame update
// ---------------------------------------------------------------------------

// per-frame scratch (reused — no allocations in the hot loop)
const shakeEuler = new THREE.Euler()
const shakeQuat = new THREE.Quaternion()
const rideQuat = new THREE.Quaternion()
const wanderRadial = new THREE.Vector3()
const wanderTan = new THREE.Vector3()
const wanderGaze = new THREE.Vector3()

export function updateViewCam(dt: number, elapsed: number) {
  const followed = flyers[followIndex]
  const pov = flyers[povIndex]

  // scroll story takes the camera when the page scrolls, hands it back at top
  if (scrollP > 0.02 && camState !== 'scroll') {
    scrollEntryPos.copy(viewCam.position)
    scrollEntryQuat.copy(viewCam.quaternion)
    // bow control: pushed away from joe's head from the entry→approach
    // midpoint, so the glide always arcs around him, never through him
    if (pov) {
      const bowFwd = tmpVecA.set(0, 0, -1).applyQuaternion(pov.quat)
      const approach = tmpVecB.copy(pov.pos).addScaledVector(bowFwd, 0.85)
      scrollBowCtrl.copy(scrollEntryPos).add(approach).multiplyScalar(0.5)
      scrollBowCtrl.sub(pov.pos).setY(Math.max(scrollBowCtrl.y, 0.35))
      if (scrollBowCtrl.lengthSq() < 1e-6) scrollBowCtrl.set(0, 1, 0)
      scrollBowCtrl.normalize().multiplyScalar(1.15).add(pov.pos)
    }
    camState = 'scroll'
    controls.enabled = false
  } else if (scrollP <= 0.02 && camState === 'scroll') {
    controls.enabled = true
    blinkEl.style.opacity = '0'
    // restore the working near plane (the approach tightens it — see below)
    if (viewCam.near !== 0.05) {
      viewCam.near = 0.05
      viewCam.updateProjectionMatrix()
    }
    blendToRig(followIndex)
  }

  // deck rides the scroll: slides in early, exits as we enter his head
  const deckVis = smooth01((scrollP - 0.04) / 0.08) * (1 - smooth01((scrollP - 0.55) / 0.15))
  setDeckVisibility(deckVis)
  // hero copy bows out as the guided shot begins
  const copyVis = 1 - smooth01((scrollP - 0.03) / 0.15)
  copyEl.style.opacity = String(copyVis)
  // feed boxes shrink once joe's cards enter, back to full size at the top
  const targetFeedScale = 1 - 0.4 * smooth01((scrollP - 0.04) / 0.16)
  if (Math.abs(targetFeedScale - lastAppliedFeedScale) > 0.002) {
    lastAppliedFeedScale = targetFeedScale
    layoutFeeds(targetFeedScale)
  }
  // feeds dim (not vanish) once we become joe's pov — the tracking HUD is
  // the story's payoff and must stay legible until the host's handoff slides
  // over; cutting it to zero at 0.8 read as a UI-state bug, not a beat
  const feedsVis = 1 - 0.65 * smooth01((scrollP - 0.6) / 0.2)
  feedsEl.style.opacity = String(feedsVis)

  // handheld micro-shake, only while locked onto a rig
  shakeEuler.set(
    Math.sin(elapsed * 0.9) * 0.006 + Math.sin(elapsed * 2.3) * 0.002,
    Math.cos(elapsed * 0.7) * 0.006,
    Math.sin(elapsed * 0.5) * 0.004,
  )
  shakeQuat.setFromEuler(shakeEuler)
  rideQuat.copy(followed.chaseQuat).multiply(shakeQuat)

  if (camState === 'scroll') {
    // phase 1: glide from wherever we were to just in front of his face —
    //          on a bezier that bows AROUND joe (see scrollBowCtrl)
    // phase 2: pass through his eye — the viewport becomes the glasses feed
    const fwd = tmpVecA.set(0, 0, -1).applyQuaternion(pov.quat)
    const approach = tmpVecB.copy(pov.pos).addScaledVector(fwd, 0.85)
    const t1 = smooth01((scrollP - 0.06) / 0.49)
    const t2 = smooth01((scrollP - 0.64) / 0.3)

    // quadratic bezier: entry → bow control → approach, expanded by scalars
    // (the two shared scratch vectors are still live: fwd feeds phase 2)
    const u = 1 - t1
    const b0 = u * u
    const b1 = 2 * u * t1
    const b2 = t1 * t1
    viewCam.position.set(
      b0 * scrollEntryPos.x + b1 * scrollBowCtrl.x + b2 * approach.x,
      b0 * scrollEntryPos.y + b1 * scrollBowCtrl.y + b2 * approach.y,
      b0 * scrollEntryPos.z + b1 * scrollBowCtrl.z + b2 * approach.z,
    )
    viewCam.position.lerp(tmpVecB.copy(pov.pos).addScaledVector(fwd, 0.03), t2)

    // near plane: the approach ends 3cm from his eye, but the working near
    // plane is 5cm — everything closer than that is clipped, which sheared
    // off his hair first (bald joe), then his face (headless joe, glasses
    // floating — they're the only doubleSided parts), and left a see-through
    // hole where rigs behind him shone through his body. Tighten to 1.2cm
    // as we close in; depth precision at this scene's scale is unaffected.
    const targetNear = 0.05 - 0.038 * smooth01((scrollP - 0.5) / 0.42)
    if (Math.abs(viewCam.near - targetNear) > 1e-4) {
      viewCam.near = targetNear
      viewCam.updateProjectionMatrix()
    }

    tmpMat.lookAt(viewCam.position, pov.pos, viewCam.up)
    tmpQuat.setFromRotationMatrix(tmpMat)
    tmpQuat.slerp(pov.quat, smooth01((t2 - 0.88) / 0.12))
    viewCam.quaternion.slerpQuaternions(scrollEntryQuat, tmpQuat, t1)

    // the blink: a full-frame eyelid that closes as we reach his eye and
    // opens on his POV, covering the ~180° orientation swap above (arrived
    // looking AT joe, leave looking WITH him — running that turn across all
    // of t2 aimed the camera sideways into an empty room mid-turn while
    // joe slid out of frame)
    blinkEl.style.opacity = String(
      Math.min(smooth01((t2 - 0.8) / 0.1), 1 - smooth01((t2 - 0.94) / 0.06)),
    )

    chip(t2 > 0.6 ? "JOE'S POV" : 'GUIDED TO JOE')
  } else if (camState === 'follow') {
    followTimer += dt
    const k = 1 - Math.exp(-dt * 5.5)
    viewCam.position.lerp(followed.chasePos, k)
    viewCam.quaternion.slerp(rideQuat, k)
    if (followTimer > FOLLOW_SECONDS) enterWander()
  } else if (camState === 'blend') {
    blendT += dt / BLEND_SECONDS
    const e = smooth01(Math.min(blendT, 1))
    viewCam.position.lerpVectors(blendFromPos, followed.chasePos, e)
    viewCam.quaternion.slerpQuaternions(blendFromQuat, rideQuat, e)
    if (blendT >= 1) enterFollow(followIndex)
  } else if (camState === 'drag') {
    controls.update()
  } else {
    // wander: cruise with gentle orbit steering inside a shell around the figure
    wanderTimer += dt
    const p = viewCam.position
    wanderRadial.set(p.x, 0, p.z)
    const r = wanderRadial.length() || 1
    wanderRadial.divideScalar(r)

    if (r < 1.6) wanderVel.addScaledVector(wanderRadial, dt * 3) // too close — push out
    else if (r > 8) wanderVel.addScaledVector(wanderRadial, -dt * 3) // too far — pull in
    wanderTan.set(-wanderRadial.z, 0, wanderRadial.x)
    wanderVel.addScaledVector(wanderTan, dt * 0.35)
    wanderVel.y += Math.sin(elapsed * 0.45) * dt * 0.12
    wanderVel.multiplyScalar(Math.exp(-dt * 0.25))
    wanderVel.clampLength(0.25, 1.1)
    p.addScaledVector(wanderVel, dt)

    // gaze drifts around the figure
    wanderGaze.set(
      Math.sin(elapsed * 0.21) * 0.5,
      MODEL_HEIGHT * (0.45 + 0.15 * Math.sin(elapsed * 0.17)),
      Math.cos(elapsed * 0.19) * 0.5,
    )
    tmpMat.lookAt(p, wanderGaze, viewCam.up)
    tmpQuat.setFromRotationMatrix(tmpMat)
    viewCam.quaternion.slerp(tmpQuat, 1 - Math.exp(-dt * 2.2))

    // did the drift come across a rig?
    const now = performance.now()
    for (let i = 0; i < flyers.length; i++) {
      if (now < (rigIgnoreUntil.get(i) ?? 0)) continue
      if (p.distanceTo(flyers[i].pos) < ENCOUNTER_DIST) {
        blendToRig(i)
        break
      }
    }
    // failsafe: never wander forever — visit the next rig in line
    if (camState === 'wander' && wanderTimer > WANDER_MAX_SECONDS) {
      blendToRig((followIndex + 1) % flyers.length)
    }
  }

  prevCamPos.copy(viewCam.position)

  if (debugScroll) {
    document.title = `p=${scrollP.toFixed(2)} y=${Math.round(window.scrollY)} ${camState}`
  }
}
