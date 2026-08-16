import * as THREE from 'three'
import { scene, renderer, viewCam, MODEL_HEIGHT, tmpMat, forward, zAxis } from './engine.ts'
import { loadGlb } from './loading.ts'
import { pathCurve, targetCurve } from './choreography.ts'
import { CAMERA_RIGS, buildRig } from './rigs.ts'
import type { CameraRigDef } from './rigs.ts'
import { figureOccludes } from './figure.ts'

// ---------------------------------------------------------------------------
// flyers — every rig in the registry flies at once, each on its own
// phase-shifted loop, each carrying a key light, each with a feed window
// ---------------------------------------------------------------------------

const PATH_PERIOD = 46 // seconds for one full loop
const TARGET_PERIOD = 29 // seconds for the look-target loop (de-synced on purpose)

const bankQuat = new THREE.Quaternion() // per-flyer banking scratch (updateFlyer)

export interface Flyer {
  def: CameraRigDef
  group: THREE.Group // rig + lights, moved along the path
  cam: THREE.PerspectiveCamera // what this flyer sees
  rt: THREE.WebGLRenderTarget // its feed, re-rendered at FEED_FPS
  quad: THREE.Mesh // screen-space quad displaying rt every frame
  spotTarget: THREE.Object3D
  keySpot?: THREE.SpotLight // feathered by proximity to joe in updateFlyer
  fillPoint?: THREE.PointLight
  feedEl: HTMLDivElement // its CAMERA FEED box
  feedRect: { x: number; y: number; w: number; h: number }
  detectionEl: HTMLDivElement // Joe detector overlay inside this rig's feed
  detectionBoxEl: HTMLDivElement
  feedTracksEl: HTMLDivElement // OC-SORT rig brackets inside this feed
  feedTrackEls: { target: Flyer; el: HTMLDivElement }[] // one bracket per trackable rig
  rigTrackEl: HTMLDivElement | null // OC-SORT overlay in the main viewport
  rigTrackTrailEls: HTMLSpanElement[]
  rigTrackState: RigTrackState
  // flight plan: where on the shared spline this flyer lives
  pathOffset: number
  targetOffset: number
  pathSpread: number // radial multiplier (keeps loops from colliding)
  reverse: boolean
  pov?: boolean // face-mounted rig: fixed pose, no spline, follow == POV
  // per-frame state (reused, no allocs)
  pos: THREE.Vector3
  quat: THREE.Quaternion
  lookPos: THREE.Vector3
  chasePos: THREE.Vector3
  chaseQuat: THREE.Quaternion
}

export const flyers: Flyer[] = []

// full-screen ortho overlay used to composite the feed quads over the main pass
const overlayScene = new THREE.Scene()
const overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
let rigTracksEl: HTMLDivElement | null = null
let rigTrackSafeRightPct = 100
// bottom band (the .hud-bottom strip) kept clear of rig-track brackets so
// tracks never collide with the mode chip or host chrome over that band
const RIG_TRACK_BOTTOM_RESERVE = 76

// Joe's detector observation is projected into each physical camera feed.
let trackedHalfWidth = MODEL_HEIGHT * 0.2
const TRACKED_HALF_DEPTH = MODEL_HEIGHT * 0.1
const projectionCorner = new THREE.Vector3()
const projectionViewCenter = new THREE.Vector3()
const trackCamPos = new THREE.Vector3() // camera world pos for occlusion rays
const TRACK_HISTORY_LENGTH = 7

// which flyers the tracker "locks" (everything a feed can track besides
// itself): physical, flying rigs — virtual POVs and the blender-cam author
// rig are excluded. Built once in setupFlyers.
const trackableFlyers: Flyer[] = []

interface RigTrackState {
  historyX: Float32Array
  historyY: Float32Array
  historyHead: number
  historyCount: number
  lastHistoryAt: number
  // occlusion-vs-figure cache: raycasting a 54k-tri figure per frame is
  // wasteful when the answer barely changes — recheck at 10Hz
  lastOccAt: number
  occluded: boolean
}

// Scratch result from projectWorldBox; reused synchronously by both overlay
// paths so the render loop does not allocate a result object per projection.
let projectedCx = 0
let projectedCy = 0
let projectedWidth = 0
let projectedHeight = 0

function positionBox(el: HTMLDivElement, cx: number, cy: number, width: number, height: number) {
  el.style.left = `${(cx - width * 0.5).toFixed(2)}%`
  el.style.top = `${(cy - height * 0.5).toFixed(2)}%`
  el.style.width = `${width.toFixed(2)}%`
  el.style.height = `${height.toFixed(2)}%`
}

function projectWorldBox(
  camera: THREE.PerspectiveCamera,
  cx: number,
  cy: number,
  cz: number,
  halfX: number,
  halfY: number,
  halfZ: number,
): boolean {
  projectionViewCenter.set(cx, cy, cz).applyMatrix4(camera.matrixWorldInverse)
  if (projectionViewCenter.z >= -camera.near) return false

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < 8; i++) {
    projectionCorner
      .set(
        cx + (i & 1 ? halfX : -halfX),
        cy + (i & 2 ? halfY : -halfY),
        cz + (i & 4 ? halfZ : -halfZ),
      )
      .project(camera)
    minX = Math.min(minX, projectionCorner.x)
    minY = Math.min(minY, projectionCorner.y)
    maxX = Math.max(maxX, projectionCorner.x)
    maxY = Math.max(maxY, projectionCorner.y)
  }

  if (maxX <= -1 || minX >= 1 || maxY <= -1 || minY >= 1) return false
  minX = Math.max(minX, -1)
  maxX = Math.min(maxX, 1)
  minY = Math.max(minY, -1)
  maxY = Math.min(maxY, 1)
  projectedCx = (minX + maxX + 2) * 25
  projectedCy = (2 - minY - maxY) * 25
  projectedWidth = (maxX - minX) * 50
  projectedHeight = (maxY - minY) * 50
  return projectedWidth > 0 && projectedHeight > 0
}

function pushRigTrackHistory(f: Flyer, elapsed: number) {
  const state = f.rigTrackState
  if (elapsed - state.lastHistoryAt < 0.1) return
  state.lastHistoryAt = elapsed
  state.historyX[state.historyHead] = projectedCx
  state.historyY[state.historyHead] = projectedCy
  state.historyHead = (state.historyHead + 1) % TRACK_HISTORY_LENGTH
  state.historyCount = Math.min(state.historyCount + 1, TRACK_HISTORY_LENGTH)

  for (let age = 0; age < TRACK_HISTORY_LENGTH; age++) {
    const dot = f.rigTrackTrailEls[age]
    if (age >= state.historyCount) {
      dot.hidden = true
      continue
    }
    const index = (state.historyHead - 1 - age + TRACK_HISTORY_LENGTH) % TRACK_HISTORY_LENGTH
    dot.hidden = false
    dot.style.left = `${state.historyX[index].toFixed(2)}%`
    dot.style.top = `${state.historyY[index].toFixed(2)}%`
    dot.style.opacity = String(0.72 * (1 - age / TRACK_HISTORY_LENGTH))
  }
}

export function setTrackedSubjectWidth(halfWidth: number) {
  trackedHalfWidth = halfWidth
}

function updateFeedDetection(f: Flyer) {
  f.cam.updateMatrixWorld()
  if (f.pov) {
    // Joe cannot appear inside his own glasses-mounted POV.
    return
  }
  if (
    projectWorldBox(
      f.cam,
      0,
      MODEL_HEIGHT * 0.5,
      0,
      trackedHalfWidth,
      MODEL_HEIGHT * 0.5,
      TRACKED_HALF_DEPTH,
    )
  ) {
    positionBox(f.detectionBoxEl, projectedCx, projectedCy, projectedWidth, projectedHeight)
    f.detectionBoxEl.hidden = false
    // when the subject fills the frame the box collapses into the feed's own
    // border and reads as a styling bug — fade to a "partial / too close"
    // state instead of drawing a full-tile marquee
    const degenerate = projectedWidth > 92 || projectedHeight > 92
    f.detectionBoxEl.style.opacity = degenerate ? '0.28' : '1'
  } else {
    f.detectionBoxEl.hidden = true
  }
}

/**
 * Project every trackable rig (except this feed's own rig) into this feed
 * as a DOM bracket box — the same cyan language as the main-viewport tracks.
 * Runs for ALL feeds including Joe's glasses POV: the tracker's world model
 * seen from that camera. A rig occluded by the figure from this camera
 * drops its bracket (line-of-sight lost), matching tracker behavior.
 * (The earlier world-space LineSegments cages were depth-correct but drew
 * sub-pixel 1px lines at 480x270 — effectively invisible.)
 */
function updateFeedTracks(f: Flyer) {
  f.cam.updateMatrixWorld()
  f.cam.getWorldPosition(trackCamPos)
  for (const t of f.feedTrackEls) {
    const target = t.target
    if (figureOccludes(trackCamPos, target.pos)) {
      t.el.hidden = true
      continue
    }
    const half = Math.max(target.def.size * 0.62, 0.1)
    if (projectWorldBox(f.cam, target.pos.x, target.pos.y, target.pos.z, half, half, half)) {
      positionBox(t.el, projectedCx, projectedCy, projectedWidth, projectedHeight)
      t.el.hidden = false
      const degenerate = projectedWidth > 92 || projectedHeight > 92
      t.el.style.opacity = degenerate ? '0.28' : '1'
    } else {
      t.el.hidden = true
    }
  }
}

// main-viewport brackets are gated by the director: once the scroll story
// dives into joe's face, a legitimate track fills the frame over him and
// reads as noise, not perception
let mainTracksEnabled = true

export function setMainRigTracksEnabled(enabled: boolean) {
  if (mainTracksEnabled === enabled) return
  mainTracksEnabled = enabled
  if (!enabled) {
    for (const f of flyers) {
      if (!f.rigTrackEl) continue
      f.rigTrackEl.hidden = true
      f.rigTrackState.historyCount = 0
      for (const dot of f.rigTrackTrailEls) dot.hidden = true
    }
  }
}

/** Project each OC-SORT-eligible external rig into the main hero HUD. */
export function updateRigTracks(elapsed: number) {
  if (!mainTracksEnabled) return
  viewCam.updateMatrixWorld()
  viewCam.getWorldPosition(trackCamPos)
  for (const f of flyers) {
    if (!f.rigTrackEl) continue // virtual POV rigs (Joe's glasses) are excluded
    if (elapsed - f.rigTrackState.lastOccAt > 0.1) {
      f.rigTrackState.lastOccAt = elapsed
      f.rigTrackState.occluded = figureOccludes(trackCamPos, f.pos)
    }
    const half = Math.max(f.def.size * 0.62, 0.1)
    if (
      !f.rigTrackState.occluded &&
      projectWorldBox(viewCam, f.pos.x, f.pos.y, f.pos.z, half, half, half) &&
      projectedCx + projectedWidth * 0.5 < rigTrackSafeRightPct
    ) {
      f.rigTrackEl.hidden = false
      positionBox(f.rigTrackEl, projectedCx, projectedCy, projectedWidth, projectedHeight)
      const degenerate = projectedWidth > 92 || projectedHeight > 92
      f.rigTrackEl.style.opacity = degenerate ? '0.28' : '1'
      pushRigTrackHistory(f, elapsed)
    } else {
      // out of frame, clipped by the feed column, or behind Joe: track lost
      f.rigTrackEl.hidden = true
      f.rigTrackState.historyCount = 0
      for (const dot of f.rigTrackTrailEls) dot.hidden = true
    }
  }
}

export async function setupFlyers() {
  const feedsEl = document.querySelector<HTMLDivElement>('#feeds')!
  const hudRoot = feedsEl.parentElement!

  rigTracksEl = document.createElement('div')
  rigTracksEl.className = 'hud rig-tracks'
  hudRoot.appendChild(rigTracksEl)

  for (let i = 0; i < CAMERA_RIGS.length; i++) {
    const def = CAMERA_RIGS[i]
    const group = def.virtual ? new THREE.Group() : await buildRig(def, loadGlb)

    let povState:
      | { pos: THREE.Vector3; quat: THREE.Quaternion }
      | undefined
    const spotTarget = new THREE.Object3D()
    scene.add(spotTarget)
    let spot: THREE.SpotLight | undefined
    let fillPoint: THREE.PointLight | undefined

    if (def.virtual) {
      // glasses POV: mount at his LEFT lens (Meta camera side), facing +Z
      // (color ×1.6 = HDR emissive so the recording LED still blooms)
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 12, 12),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(def.lensColor ?? 0xff5a4a).multiplyScalar(1.6),
        }),
      )
      group.add(dot)
      const pos = new THREE.Vector3(-0.075, MODEL_HEIGHT * 0.926, 0.15)
      const quat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI, // three cameras look down -Z; he faces +Z
      )
      group.position.copy(pos)
      group.quaternion.copy(quat)
      povState = { pos, quat }
    } else {
      // the key light this flyer carries — it lights whatever the flyer films
      // (intensity is feathered by proximity to joe in updateFlyer)
      spot = new THREE.SpotLight(0xd8fbff, 6, 30, Math.PI / 4.2, 0.65, 1.4)
      group.add(spot)
      spot.target = spotTarget
      fillPoint = new THREE.PointLight(0x66e5f2, 0.8, 4, 2)
      group.add(fillPoint)
    }
    scene.add(group)

    // its feed: an offscreen target + a quad that shows it
    const rt = new THREE.WebGLRenderTarget(480, 270, { samples: 2 })
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: rt.texture,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    overlayScene.add(quad)

    // its feed window
    const feedEl = document.createElement('div')
    feedEl.className = 'feed-box'
    const label = document.createElement('div')
    label.className = 'feed-label'
    // the label dot matches the rig's physical LED — cyan, amber, red
    const led = def.lensColor ?? 0x6ff2ff
    label.innerHTML = `<span style="color:#${led.toString(16).padStart(6, '0')}">◉</span> ${def.label}`
    feedEl.appendChild(label)

    const detectionEl = document.createElement('div')
    detectionEl.className = 'feed-detection'
    detectionEl.hidden = def.virtual === true
    const detectionBoxEl = document.createElement('div')
    detectionBoxEl.className = 'feed-detection-box'
    detectionBoxEl.hidden = true
    detectionEl.appendChild(detectionBoxEl)
    feedEl.appendChild(detectionEl)

    // rig-track brackets (filled in the pass after all flyers exist — each
    // feed tracks every OTHER trackable rig). Lives on every feed including
    // the glasses POV: the tracker's world model seen from that camera.
    const feedTracksEl = document.createElement('div')
    feedTracksEl.className = 'feed-tracks'
    feedEl.appendChild(feedTracksEl)
    feedsEl.appendChild(feedEl)

    let rigTrackEl: HTMLDivElement | null = null
    const rigTrackTrailEls: HTMLSpanElement[] = []
    if (!def.virtual && def.id !== 'blender-cam') {
      rigTrackEl = document.createElement('div')
      rigTrackEl.className = 'hud rig-track-box'
      rigTrackEl.hidden = true
      if (def.tag) rigTrackEl.dataset.tag = def.tag
      for (let j = 0; j < TRACK_HISTORY_LENGTH; j++) {
        const dot = document.createElement('span')
        dot.className = 'rig-track-trail'
        dot.hidden = true
        rigTrackTrailEls.push(dot)
        rigTrackEl.appendChild(dot)
      }
      rigTracksEl.appendChild(rigTrackEl)
    }

    flyers.push({
      def,
      group,
      // Meta glasses shoot ultra-wide — give the POV a matching fov
      cam: new THREE.PerspectiveCamera(def.virtual ? 68 : 50, 16 / 9, 0.05, 100),
      rt,
      quad,
      spotTarget,
      keySpot: spot,
      fillPoint,
      feedEl,
      feedRect: { x: 0, y: 0, w: 320, h: 180 },
      detectionEl,
      detectionBoxEl,
      feedTracksEl,
      feedTrackEls: [],
      rigTrackEl,
      rigTrackTrailEls,
      rigTrackState: {
        historyX: new Float32Array(TRACK_HISTORY_LENGTH),
        historyY: new Float32Array(TRACK_HISTORY_LENGTH),
        historyHead: 0,
        historyCount: 0,
        lastHistoryAt: -Infinity,
        lastOccAt: -Infinity,
        occluded: false,
      },
      pathOffset: i === 0 ? 0 : 0.45,
      targetOffset: i === 0 ? 0 : 0.5,
      pathSpread: i === 0 ? 1 : 1.22,
      reverse: i !== 0, // second flyer runs the loop backwards
      pov: def.virtual,
      pos: povState ? povState.pos.clone() : new THREE.Vector3(),
      quat: povState ? povState.quat.clone() : new THREE.Quaternion(),
      lookPos: povState
        ? povState.pos.clone().add(new THREE.Vector3(0, 0, 4)) // out his gaze
        : new THREE.Vector3(),
      chasePos: povState ? povState.pos.clone() : new THREE.Vector3(),
      chaseQuat: povState ? povState.quat.clone() : new THREE.Quaternion(),
    })
  }

  // Feed-level OC-SORT: DOM bracket boxes inside each feed element, in the
  // same cyan corner-bracket language as the main-viewport tracks. (The
  // earlier approach — depth-tested world-space LineSegments cages rendered
  // into each feed's render target — was occlusion-correct but drew sub-pixel
  // 1px lines at 480x270 and was effectively invisible; a tracker HUD box is
  // an overlay, not world geometry, so DOM is the honest representation.)
  // Every feed tracks every trackable rig except itself — including Joe's
  // glasses POV, which is the point: the tracker sees the drone from Joe.
  for (const f of flyers) {
    if (!f.pov && f.def.id !== 'blender-cam') trackableFlyers.push(f)
  }
  for (const f of flyers) {
    for (const target of trackableFlyers) {
      if (target === f) continue // a feed never tracks its own rig
      const el = document.createElement('div')
      el.className = 'feed-track-box'
      el.hidden = true
      if (target.def.tag) el.dataset.tag = target.def.tag
      f.feedTracksEl.appendChild(el)
      f.feedTrackEls.push({ target, el })
    }
  }
}

// ---------------------------------------------------------------------------
// camera feeds — each flyer renders into a small offscreen target at FEED_FPS;
// an overlay scene composites the textures over the main pass every frame
// ---------------------------------------------------------------------------

const FEED_BASE_W = 300
const FEED_BASE_H = 169
const FEED_GAP = 10
const FEED_TOP = 64
const FEED_RIGHT = 28
let lastFeedScale = 1

/** size + place every feed box analytically (CSS px), quads included */
export function layoutFeeds(scale: number) {
  lastFeedScale = scale
  const w = Math.round(FEED_BASE_W * scale)
  const h = Math.round(FEED_BASE_H * scale)
  for (let i = 0; i < flyers.length; i++) {
    const f = flyers[i]
    f.feedEl.style.width = `${w}px`
    f.feedEl.style.height = `${h}px`

    f.feedRect.x = window.innerWidth - FEED_RIGHT - w
    f.feedRect.y = FEED_TOP + i * (h + FEED_GAP)
    f.feedRect.w = w
    f.feedRect.h = h
    f.cam.aspect = w / h
    f.cam.updateProjectionMatrix()

    // place the quad over the feed box (CSS px → NDC)
    const x0 = (f.feedRect.x / window.innerWidth) * 2 - 1
    const x1 = ((f.feedRect.x + w) / window.innerWidth) * 2 - 1
    const y1 = 1 - (f.feedRect.y / window.innerHeight) * 2
    const y0 = 1 - ((f.feedRect.y + h) / window.innerHeight) * 2
    f.quad.scale.set(x1 - x0, y1 - y0, 1)
    f.quad.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0)
  }

  // Main-canvas rig tracks must never paint over the camera-feed column or
  // the bottom HUD band (mode-chip strip — and, when embedded, whatever host
  // chrome rides over that band). Clip the shared full-viewport HUD layer at
  // the feeds' live left edge with a bottom reserve; this follows responsive
  // sizing and the scroll story's feed scaling. Tracks clipped at a frame
  // edge is exactly how real tracking UIs behave, so no visibility change.
  if (rigTracksEl && flyers.length > 0) {
    let feedLeft = window.innerWidth
    for (const f of flyers) feedLeft = Math.min(feedLeft, f.feedRect.x)
    const rightInset = Math.max(window.innerWidth - feedLeft, 0)
    rigTrackSafeRightPct = (feedLeft / window.innerWidth) * 100
    rigTracksEl.style.clipPath = `inset(${RIG_TRACK_BOTTOM_RESERVE}px ${rightInset}px 0 0)`
  }
}

export function measureFeeds() {
  layoutFeeds(lastFeedScale)
}

/** slow path: re-render each flyer's feed into its render target */
export function renderFeeds() {
  for (let feedIndex = 0; feedIndex < flyers.length; feedIndex++) {
    const f = flyers[feedIndex]
    f.group.visible = false // the feed is FROM this flyer — it can't see itself
    f.cam.position.copy(f.pos)
    f.cam.quaternion.copy(f.quat)
    updateFeedDetection(f)
    updateFeedTracks(f)
    renderer.setRenderTarget(f.rt)
    renderer.render(scene, f.cam)
    f.group.visible = true
  }
  renderer.setRenderTarget(null)
}

/** fast path: draw the latest feed textures over the main render */
export function compositeFeeds() {
  renderer.autoClear = false
  renderer.render(overlayScene, overlayCam)
  renderer.autoClear = true
}

export function updateFlyer(f: Flyer, elapsed: number) {
  if (f.pov) return // face-mounted: pose is fixed at the glasses mount
  let t = (elapsed / PATH_PERIOD + f.pathOffset) % 1
  if (f.reverse) t = 1 - t
  const tt = (elapsed / TARGET_PERIOD + f.targetOffset) % 1

  pathCurve.getPointAt(t, f.pos)
  // spread the loop radially (not vertically) so the fleet doesn't collide
  f.pos.x *= f.pathSpread
  f.pos.z *= f.pathSpread
  targetCurve.getPointAt(tt, f.lookPos)

  f.group.position.copy(f.pos)
  tmpMat.lookAt(f.pos, f.lookPos, f.group.up)
  f.quat.setFromRotationMatrix(tmpMat)
  // gentle banking so the flyer doesn't feel bolted to a rail
  const bank = Math.sin(elapsed * 0.6 + f.pathOffset * 7) * 0.05
  f.quat.multiply(bankQuat.setFromAxisAngle(zAxis, bank))
  f.group.quaternion.copy(f.quat)

  // chase position: trail the flyer so it stays visible in the follow shot
  forward.subVectors(f.lookPos, f.pos).normalize()
  f.chasePos.copy(f.pos).addScaledVector(forward, -1.55)
  f.chasePos.y += 0.45
  tmpMat.lookAt(f.chasePos, f.lookPos, f.group.up)
  f.chaseQuat.setFromRotationMatrix(tmpMat)

  f.spotTarget.position.copy(f.lookPos)

  // Constant-exposure key light + gaffer assignment. The scalp blowouts
  // ("bald glowing dome") came from spot irradiance rising as a rig's orbit
  // closes in: intensity 6 at 1.4m hits ~3x harder than the 3m reference
  // the scene was lit for, and two rigs near simultaneously stack. So:
  //   - each spot's intensity scales with d^1.4 (its decay), holding the
  //     subject's irradiance at the 3m reference no matter the distance,
  //     capped at 6 so far rigs don't exceed the classic look;
  //   - only the closest rig is the KEY each frame; the other drops to a
  //     fill (x0.25) so stacked keys are impossible.
  if (f.keySpot) {
    const dy = Math.min(Math.max(f.pos.y, 0), MODEL_HEIGHT)
    const d = Math.sqrt(
      f.pos.x * f.pos.x + f.pos.z * f.pos.z + (f.pos.y - dy) * (f.pos.y - dy),
    )
    // frame-scoped min tracker (one-frame lag is invisible)
    if (gafferFrame !== elapsed) {
      gafferFrame = elapsed
      gafferPrevMin = gafferMin
      gafferMin = Infinity
    }
    if (d < gafferMin) gafferMin = d
    const isKey = d <= gafferPrevMin + 1e-9
    const key = Math.min(1.3 * Math.pow(d, 1.4), 6)
    f.keySpot.intensity = isKey ? key : key * 0.25
    if (f.fillPoint) f.fillPoint.intensity = isKey ? 0.6 : 0.15
  }
}

let gafferFrame = -1
let gafferMin = Infinity
let gafferPrevMin = Infinity
