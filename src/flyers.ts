import * as THREE from 'three'
import { scene, renderer, MODEL_HEIGHT, tmpMat, forward, zAxis } from './engine.ts'
import { loadGlb } from './loading.ts'
import { pathCurve, targetCurve } from './choreography.ts'
import { CAMERA_RIGS, buildRig } from './rigs.ts'
import type { CameraRigDef } from './rigs.ts'

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
  feedEl: HTMLDivElement // its CAMERA FEED box
  feedRect: { x: number; y: number; w: number; h: number }
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

export async function setupFlyers() {
  const feedsEl = document.querySelector<HTMLDivElement>('#feeds')!

  for (let i = 0; i < CAMERA_RIGS.length; i++) {
    const def = CAMERA_RIGS[i]
    const group = def.virtual ? new THREE.Group() : await buildRig(def, loadGlb)

    let povState:
      | { pos: THREE.Vector3; quat: THREE.Quaternion }
      | undefined
    const spotTarget = new THREE.Object3D()
    scene.add(spotTarget)

    if (def.virtual) {
      // glasses POV: mount at his LEFT lens (Meta camera side), facing +Z
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 12, 12),
        new THREE.MeshBasicMaterial({ color: def.lensColor ?? 0xff5a4a }), // recording LED
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
      const spot = new THREE.SpotLight(0xd8fbff, 6, 30, Math.PI / 4.2, 0.65, 1.4)
      group.add(spot)
      spot.target = spotTarget
      group.add(new THREE.PointLight(0x66e5f2, 0.8, 4, 2))
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
    feedsEl.appendChild(feedEl)

    flyers.push({
      def,
      group,
      // Meta glasses shoot ultra-wide — give the POV a matching fov
      cam: new THREE.PerspectiveCamera(def.virtual ? 68 : 50, 16 / 9, 0.05, 100),
      rt,
      quad,
      spotTarget,
      feedEl,
      feedRect: { x: 0, y: 0, w: 320, h: 180 },
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
}

export function measureFeeds() {
  layoutFeeds(lastFeedScale)
}

/** slow path: re-render each flyer's feed into its render target */
export function renderFeeds() {
  for (const f of flyers) {
    f.group.visible = false // the feed is FROM this flyer — it can't see itself
    f.cam.position.copy(f.pos)
    f.cam.quaternion.copy(f.quat)
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
}
