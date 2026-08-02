import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { CAMERA_RIGS, buildRig } from './rigs.ts'
import type { CameraRigDef } from './rigs.ts'

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const MODEL_HEIGHT = 2.4 // normalized height of the anthropoid, world units
const PATH_PERIOD = 46 // seconds for one full loop
const TARGET_PERIOD = 29 // seconds for the look-target loop (de-synced on purpose)
const BLEND_SECONDS = 1.6 // transition duration when acquiring a rig

const BG_COLOR = new THREE.Color('#03181f')
const FOG_COLOR = new THREE.Color('#06262e')

const FEED_FPS = 15 // feed boxes are small — re-render them at a reduced rate

// ---------------------------------------------------------------------------
// renderer / scene / camera
// ---------------------------------------------------------------------------

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.85

const scene = new THREE.Scene()
scene.background = BG_COLOR
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.055)

const viewCam = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.05,
  100,
)
viewCam.position.set(0, 1.4, 5)

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

// ---------------------------------------------------------------------------
// post-processing (the glow in the reference footage)
// ---------------------------------------------------------------------------

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, viewCam))
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.3, // strength
  0.7, // radius
  0.78, // threshold
)
composer.addPass(bloom)
composer.addPass(new OutputPass())

// ---------------------------------------------------------------------------
// base lighting — the flyers carry the key lights
// ---------------------------------------------------------------------------

// luminous teal backdrop — the gradient void the figure floats in
{
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(256, 210, 40, 256, 256, 340)
  g.addColorStop(0, '#1a6472')
  g.addColorStop(0.45, '#0a3540')
  g.addColorStop(1, '#020e12')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 512)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(28, 32, 24),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  )
  dome.position.y = 2
  scene.add(dome)
}

scene.add(new THREE.AmbientLight(0x1c3f4a, 0.45))

const rimLight = new THREE.DirectionalLight(0x9fe8ff, 0.7)
rimLight.position.set(-4, 6, -5)
scene.add(rimLight)

const underGlow = new THREE.PointLight(0x1e7d8c, 2.5, 9, 1.8)
underGlow.position.set(0, 0.15, 0)
scene.add(underGlow)

// soft radial glow disc under the figure
{
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(80, 220, 235, 0.55)')
  g.addColorStop(0.5, 'rgba(30, 120, 135, 0.18)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(c)
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 48),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  disc.rotation.x = -Math.PI / 2
  disc.position.y = 0.005
  scene.add(disc)
}

// ---------------------------------------------------------------------------
// loading
// ---------------------------------------------------------------------------

const loaderEl = document.querySelector<HTMLDivElement>('#loader')!
const loaderFill = document.querySelector<HTMLDivElement>('#loader-fill')!
const loaderPct = document.querySelector<HTMLDivElement>('#loader-pct')!

const manager = new THREE.LoadingManager()
manager.onProgress = (_url, loaded, total) => {
  const pct = Math.round((loaded / total) * 100)
  loaderFill.style.width = `${pct}%`
  loaderPct.textContent = `${pct}%`
}

const gltfLoader = new GLTFLoader(manager)

function loadGlb(url: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject)
  })
}

// ---------------------------------------------------------------------------
// the anthropoid — normalize orientation / scale / footing at runtime
// ---------------------------------------------------------------------------

const figure = new THREE.Group()
scene.add(figure)

let halfArmSpan = 1.1

async function setupFigure() {
  const gltf = await loadGlb('/assets/person.glb')
  const root = gltf.scene

  // normalize: stand the figure on y=0 at MODEL_HEIGHT, centered on origin
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const scale = MODEL_HEIGHT / size.y
  root.scale.setScalar(scale)

  box.setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y

  box.setFromObject(root)
  halfArmSpan = box.getSize(new THREE.Vector3()).x / 2

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of mats) {
        if (mat && mat.isMeshStandardMaterial) {
          // strip any fully self-lit materials (same emissive-map trap as the
          // anthropoid) but keep the realistic PBR look — skin, cloth, glass
          if (mat.emissiveMap) {
            mat.emissive.setScalar(0)
            mat.emissiveMap = null
          }
          mat.envMapIntensity = 0.45
        }
      }
    }
  })

  figure.add(root)
}

// ---------------------------------------------------------------------------
// flyers — every rig in the registry flies at once, each on its own
// phase-shifted loop, each carrying a key light, each with a feed window
// ---------------------------------------------------------------------------

interface Flyer {
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

const flyers: Flyer[] = []
let followIndex = 0 // which flyer the view cam chases
let povIndex = -1 // the face-mounted glasses rig (resolved after setup)

// full-screen ortho overlay used to composite the feed quads over the main pass
const overlayScene = new THREE.Scene()
const overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

async function setupFlyers() {
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
// choreography — two de-synced closed splines:
// one for where a camera IS, one for what it looks AT
// ---------------------------------------------------------------------------

function v(x: number, y: number, z: number) {
  return new THREE.Vector3(x, y, z)
}

let pathCurve: THREE.CatmullRomCurve3
let targetCurve: THREE.CatmullRomCurve3

function buildChoreography() {
  const h = MODEL_HEIGHT
  const a = halfArmSpan

  pathCurve = new THREE.CatmullRomCurve3(
    [
      v(0.0, 0.62 * h, 3.0 * h), // wide frontal reveal
      v(0.65 * h, 0.52 * h, 1.15 * h), // close on the torso
      v(a * 1.35, 0.86 * h, 0.75), // out along the outstretched arm
      v(0.35 * h, 1.0 * h, 0.85 * h), // tight on the head
      v(-0.85 * h, 0.74 * h, -1.25 * h), // sweep behind, left
      v(0.0, 1.25 * h, -2.0 * h), // high rear, looking down
      v(-0.6 * h, 0.16 * h, 1.15 * h), // low across the legs
      v(0.1 * h, 0.08 * h, 2.1 * h), // ground-level front
    ],
    true,
    'centripetal',
    0.4,
  )

  targetCurve = new THREE.CatmullRomCurve3(
    [
      v(0, 0.55 * h, 0), // hips/chest
      v(a * 0.85, 0.86 * h, 0), // right hand
      v(0, 0.94 * h, 0), // head
      v(-a * 0.5, 0.8 * h, 0), // left arm
      v(0, 0.3 * h, 0), // legs
    ],
    true,
    'centripetal',
    0.5,
  )
}

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

const modeChip = document.querySelector<HTMLDivElement>('#mode-chip')!

let camState: CamState = 'follow'
let followTimer = 0
let wanderTimer = 0
let blendT = 0
const blendFromPos = new THREE.Vector3()
const blendFromQuat = new THREE.Quaternion()
const wanderVel = new THREE.Vector3()
const prevCamPos = new THREE.Vector3()
const rigIgnoreUntil = new Map<number, number>()

const controls = new OrbitControls(viewCam, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.enablePan = false
controls.minDistance = 0.6
controls.maxDistance = 9
controls.target.set(0, MODEL_HEIGHT * 0.55, 0)
controls.enabled = true // always on — the director yields to it in 'drag'

function chip(text: string) {
  modeChip.textContent = text
}

function enterFollow(idx: number) {
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
  if (e.key === 'c') blendToRig((followIndex + 1) % flyers.length) // skip to next rig
})

// ---------------------------------------------------------------------------
// scroll story — scrolling guides the camera to joe's face, then through his
// eye into the glasses POV, and the next section slides over that as the wipe
// ---------------------------------------------------------------------------

const trackEl = document.querySelector<HTMLDivElement>('.scroll-track')!
const deckEl = document.querySelector<HTMLDivElement>('#deck')!
let scrollP = 0
const scrollEntryPos = new THREE.Vector3()
const scrollEntryQuat = new THREE.Quaternion()

window.addEventListener(
  'scroll',
  () => {
    const range = trackEl.offsetHeight - window.innerHeight
    scrollP = range > 0 ? Math.min(Math.max(window.scrollY / range, 0), 1) : 0
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
// camera feeds — each flyer renders into a small offscreen target at FEED_FPS;
// an overlay scene composites the textures over the main pass every frame
// ---------------------------------------------------------------------------

function measureFeeds() {
  for (const f of flyers) {
    const r = f.feedEl.getBoundingClientRect()
    f.feedRect.x = r.left
    f.feedRect.y = r.top
    f.feedRect.w = r.width
    f.feedRect.h = r.height
    f.cam.aspect = r.width / r.height
    f.cam.updateProjectionMatrix()

    // place the quad over the feed box (CSS px → NDC)
    const x0 = (r.left / window.innerWidth) * 2 - 1
    const x1 = ((r.left + r.width) / window.innerWidth) * 2 - 1
    const y1 = 1 - (r.top / window.innerHeight) * 2
    const y0 = 1 - ((r.top + r.height) / window.innerHeight) * 2
    f.quad.scale.set(x1 - x0, y1 - y0, 1)
    f.quad.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0)
  }
}

/** slow path: re-render each flyer's feed into its render target */
function renderFeeds() {
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
function compositeFeeds() {
  renderer.autoClear = false
  renderer.render(overlayScene, overlayCam)
  renderer.autoClear = true
}

// ---------------------------------------------------------------------------
// per-frame update
// ---------------------------------------------------------------------------

const clock = new THREE.Clock()
const tmpMat = new THREE.Matrix4()
const tmpQuat = new THREE.Quaternion()
const tmpVecA = new THREE.Vector3()
const tmpVecB = new THREE.Vector3()
const forward = new THREE.Vector3()
const zAxis = new THREE.Vector3(0, 0, 1)
const easeInOut = (t: number) => t * t * (3 - 2 * t)

function updateFlyer(f: Flyer, elapsed: number) {
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
  f.quat.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, bank))
  f.group.quaternion.copy(f.quat)

  // chase position: trail the flyer so it stays visible in the follow shot
  forward.subVectors(f.lookPos, f.pos).normalize()
  f.chasePos.copy(f.pos).addScaledVector(forward, -1.55)
  f.chasePos.y += 0.45
  tmpMat.lookAt(f.chasePos, f.lookPos, f.group.up)
  f.chaseQuat.setFromRotationMatrix(tmpMat)

  f.spotTarget.position.copy(f.lookPos)
}

function updateViewCam(dt: number, elapsed: number) {
  const followed = flyers[followIndex]
  const pov = flyers[povIndex]

  // scroll story takes the camera when the page scrolls, hands it back at top
  if (scrollP > 0.02 && camState !== 'scroll') {
    scrollEntryPos.copy(viewCam.position)
    scrollEntryQuat.copy(viewCam.quaternion)
    camState = 'scroll'
    controls.enabled = false
  } else if (scrollP <= 0.02 && camState === 'scroll') {
    controls.enabled = true
    blendToRig(followIndex)
  }

  // deck rides the scroll: slides in early, exits as we enter his head
  const deckVis = smooth01((scrollP - 0.04) / 0.08) * (1 - smooth01((scrollP - 0.55) / 0.15))
  deckEl.style.opacity = String(deckVis)
  deckEl.style.transform = `translateY(${(1 - deckVis) * 24}px)`

  // handheld micro-shake, only while locked onto a rig
  const shake = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      Math.sin(elapsed * 0.9) * 0.006 + Math.sin(elapsed * 2.3) * 0.002,
      Math.cos(elapsed * 0.7) * 0.006,
      Math.sin(elapsed * 0.5) * 0.004,
    ),
  )
  const rideQuat = followed.chaseQuat.clone().multiply(shake)

  if (camState === 'scroll') {
    // phase 1: glide from wherever we were to just in front of his face
    // phase 2: pass through his eye — the viewport becomes the glasses feed
    const fwd = tmpVecA.set(0, 0, -1).applyQuaternion(pov.quat)
    const approach = tmpVecB.copy(pov.pos).addScaledVector(fwd, 0.85)
    const t1 = smooth01((scrollP - 0.06) / 0.49)
    const t2 = smooth01((scrollP - 0.55) / 0.37)

    viewCam.position.lerpVectors(scrollEntryPos, approach, t1)
    viewCam.position.lerp(tmpVecB.copy(pov.pos).addScaledVector(fwd, 0.03), t2)

    tmpMat.lookAt(viewCam.position, pov.pos, viewCam.up)
    tmpQuat.setFromRotationMatrix(tmpMat)
    tmpQuat.slerp(pov.quat, t2)
    viewCam.quaternion.slerpQuaternions(scrollEntryQuat, tmpQuat, t1)

    chip(t2 > 0.6 ? "JOE'S POV" : 'GUIDED TO JOE')
  } else if (camState === 'follow') {
    followTimer += dt
    const k = 1 - Math.exp(-dt * 5.5)
    viewCam.position.lerp(followed.chasePos, k)
    viewCam.quaternion.slerp(rideQuat, k)
    if (followTimer > FOLLOW_SECONDS) enterWander()
  } else if (camState === 'blend') {
    blendT += dt / BLEND_SECONDS
    const e = easeInOut(Math.min(blendT, 1))
    viewCam.position.lerpVectors(blendFromPos, followed.chasePos, e)
    viewCam.quaternion.slerpQuaternions(blendFromQuat, rideQuat, e)
    if (blendT >= 1) enterFollow(followIndex)
  } else if (camState === 'drag') {
    controls.update()
  } else {
    // wander: cruise with gentle orbit steering inside a shell around the figure
    wanderTimer += dt
    const p = viewCam.position
    const radialN = new THREE.Vector3(p.x, 0, p.z)
    const r = radialN.length() || 1
    radialN.divideScalar(r)

    if (r < 1.6) wanderVel.addScaledVector(radialN, dt * 3) // too close — push out
    else if (r > 8) wanderVel.addScaledVector(radialN, -dt * 3) // too far — pull in
    wanderVel.addScaledVector(new THREE.Vector3(-radialN.z, 0, radialN.x), dt * 0.35)
    wanderVel.y += Math.sin(elapsed * 0.45) * dt * 0.12
    wanderVel.multiplyScalar(Math.exp(-dt * 0.25))
    wanderVel.clampLength(0.25, 1.1)
    p.addScaledVector(wanderVel, dt)

    // gaze drifts around the figure
    const gaze = new THREE.Vector3(
      Math.sin(elapsed * 0.21) * 0.5,
      MODEL_HEIGHT * (0.45 + 0.15 * Math.sin(elapsed * 0.17)),
      Math.cos(elapsed * 0.19) * 0.5,
    )
    tmpMat.lookAt(p, gaze, viewCam.up)
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
}

// ---------------------------------------------------------------------------
// card deck — joe's field ID + the trades the platform onboards.
// every card has its own scene backdrop instead of flat blue.
// ---------------------------------------------------------------------------

// scene backdrops — small inline SVG worlds, one per occupation
const SCENES: Record<string, string> = {
  circuit: `<svg viewBox="0 0 280 84" preserveAspectRatio="xMidYMid slice"><rect width="280" height="84" fill="#04222b"/><defs><pattern id="grid" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0v14" fill="none" stroke="#0e3540" stroke-width="0.7"/></pattern></defs><rect width="280" height="84" fill="url(#grid)"/><path d="M24 64h56V44h40V28h48v-8h40" stroke="#6ff2ff" fill="none" stroke-width="1.5" opacity="0.85"/><path d="M60 76h40v-14h52" stroke="#ffb35c" fill="none" stroke-width="1.2" opacity="0.7"/><circle cx="24" cy="64" r="3" fill="#6ff2ff"/><circle cx="208" cy="20" r="3" fill="#ffb35c"/><circle cx="152" cy="62" r="2.5" fill="#ffb35c"/></svg>`,
  pegboard: `<svg viewBox="0 0 280 84" preserveAspectRatio="xMidYMid slice"><rect width="280" height="84" fill="#0a2530"/><defs><pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="1.6" fill="#12505f"/></pattern></defs><rect width="280" height="84" fill="url(#dots)"/><path d="M108 20l10 10-6 6 26 26 8-8-26-26 6-6z" fill="#6ff2ff" opacity="0.9"/><path d="M160 24h14v8h-14z M164 32h6v30h-6z" fill="#ffb35c" opacity="0.9"/><rect x="196" y="52" width="46" height="7" rx="3" fill="#8a5a2b"/><rect x="232" y="42" width="10" height="17" rx="2" fill="#5d8b93"/></svg>`,
  wood: `<svg viewBox="0 0 280 84" preserveAspectRatio="xMidYMid slice"><rect width="280" height="84" fill="#1d130a"/><rect y="0" width="280" height="20" fill="#2b1c0e"/><rect y="22" width="280" height="20" fill="#332213"/><rect y="44" width="280" height="20" fill="#241708"/><rect y="66" width="280" height="18" fill="#2e1e0f"/><path d="M10 10q40 4 90 0t110 2 M30 32q50 5 100 0t120 2 M10 54q60 4 110 0t130 2 M40 74q40 3 90 0t110 1" stroke="#4a3a2a" stroke-width="1" fill="none" opacity="0.8"/><path d="M196 16l60 52-8 6-58-52z" fill="#5d8b93" opacity="0.85"/><rect x="188" y="12" width="14" height="10" rx="2" fill="#8a5a2b"/></svg>`,
  solar: `<svg viewBox="0 0 280 84" preserveAspectRatio="xMidYMid slice"><rect width="280" height="84" fill="#06303a"/><circle cx="236" cy="20" r="11" fill="#ffb35c" opacity="0.95"/><circle cx="236" cy="20" r="17" fill="#ffb35c" opacity="0.15"/><path d="M-10 84 L120 26 L290 84 Z" fill="#082832"/><g transform="translate(104 36) skewX(-38)"><rect width="120" height="34" fill="#0b3d4d" stroke="#175060"/><path d="M0 11.3h120 M0 22.6h120 M24 0v34 M48 0v34 M72 0v34 M96 0v34" stroke="#175060" stroke-width="1"/><rect width="120" height="8" fill="#ffffff" opacity="0.05"/></g></svg>`,
  mural: `<svg viewBox="0 0 280 84" preserveAspectRatio="xMidYMid slice"><rect width="280" height="84" fill="#1c2a30"/><defs><pattern id="brick" width="36" height="18" patternUnits="userSpaceOnUse"><path d="M0 0h36M0 18h36M18 0v9M0 9v9M36 9v9" stroke="#0f1c22" stroke-width="1.4" fill="none"/></pattern></defs><rect width="280" height="84" fill="url(#brick)"/><path d="M-10 66 Q50 26 110 46 T290 34" stroke="#6ff2ff" stroke-width="11" fill="none" opacity="0.5" stroke-linecap="round"/><path d="M-10 44 Q70 68 150 40 T290 56" stroke="#ffb35c" stroke-width="7" fill="none" opacity="0.45" stroke-linecap="round"/><path d="M40 84 Q90 50 160 62 T290 48" stroke="#ff5a8a" stroke-width="5" fill="none" opacity="0.4" stroke-linecap="round"/></svg>`,
  vent: `<svg viewBox="0 0 280 84" preserveAspectRatio="xMidYMid slice"><rect width="280" height="84" fill="#0a2530"/><g><rect x="30" y="10" width="220" height="8" rx="4" fill="#12505f"/><rect x="30" y="24" width="220" height="8" rx="4" fill="#0e4250"/><rect x="30" y="38" width="220" height="8" rx="4" fill="#12505f"/><rect x="30" y="52" width="220" height="8" rx="4" fill="#0e4250"/><rect x="30" y="66" width="220" height="8" rx="4" fill="#12505f"/></g><path d="M60 0v84 M140 0v84 M220 0v84" stroke="#082832" stroke-width="2" opacity="0.6"/></svg>`,
}

interface OccCard {
  role: string
  sub: string
  note: string
  scene: keyof typeof SCENES
  joe?: boolean
}

const OCCUPATIONS: OccCard[] = [
  { role: 'DIY MAKER', sub: 'first real build', note: 'a mentor watching every cut', scene: 'pegboard' },
  { role: 'CARPENTER', sub: 'apprentice — week 2', note: 'measure twice, verified once', scene: 'wood' },
  { role: 'SOLAR INSTALLER', sub: 'trainee — week 1', note: 'onboarded before the ladder goes up', scene: 'solar' },
  { role: 'MURALIST', sub: 'first commissioned wall', note: 'composition notes from artists who\'ve been there', scene: 'mural' },
  { role: 'ELECTRICIAN', sub: 'apprentice — day 3', note: 'expert eyes reviewing panel work', scene: 'circuit' },
  { role: 'HVAC TECH', sub: 'new hire — day 1', note: 'guided install, step by step', scene: 'vent' },
]

const JOE_CARD: OccCard = {
  role: 'WIRING TECH',
  sub: 'this is joe — day 1',
  note: 'three feeds watching his back',
  scene: 'circuit',
  joe: true,
}

const deckFront = document.querySelector<HTMLDivElement>('#deck-front')!
let occIdx = -1
let deckTick = 0

function renderCard(o: OccCard) {
  if (o.joe) {
    deckFront.innerHTML = `
      <div class="dc-scene">${SCENES[o.scene]}</div>
      <div class="dc-joe">
        <div class="sc-head">
          <div class="sc-title">FIELD ID — JOE</div>
          <div class="sc-badge">NEW HIRE</div>
        </div>
        <div class="sc-row"><span>ROLE</span><b>WIRING TECH — RESIDENTIAL</b></div>
        <div class="sc-row"><span>SITE</span><b>JOB 114-B · DAY 1</b></div>
        <div class="sc-row"><span>STATUS</span><b class="warn">NEEDS ASSISTANCE</b></div>
        <div class="sc-bars">
          <div class="sc-bar"><label>EXPERIENCE</label><div class="bar"><i style="width:12%"></i></div><em>12%</em></div>
          <div class="sc-bar"><label>TRAINING</label><div class="bar"><i style="width:34%"></i></div><em>34%</em></div>
          <div class="sc-bar"><label>COVERAGE</label><div class="bar full"><i style="width:100%"></i></div><em>100%</em></div>
        </div>
        <div class="sc-row"><span>EXPERT EYES</span><b class="ok">CONNECTED — 3 FEEDS</b></div>
        <div class="sc-foot">CLAUDE CODE FOR DIY IRL</div>
      </div>`
  } else {
    deckFront.innerHTML = `
      <div class="dc-scene">${SCENES[o.scene]}</div>
      <div class="dc-role">${o.role}</div>
      <div class="dc-sub">${o.sub}</div>
      <div class="dc-note">${o.note}</div>`
  }
}

function shuffleDeck() {
  deckFront.classList.add('out')
  window.setTimeout(() => {
    deckTick++
    // joe is the protagonist — his card comes back around every third shuffle
    if (deckTick % 3 === 0) {
      renderCard(JOE_CARD)
    } else {
      occIdx = (occIdx + 1) % OCCUPATIONS.length
      renderCard(OCCUPATIONS[occIdx])
    }
    deckFront.classList.remove('out')
    deckFront.classList.add('in')
    window.setTimeout(() => deckFront.classList.remove('in'), 400)
  }, 360)
}

renderCard(JOE_CARD) // open on joe

// ---------------------------------------------------------------------------
// name tag — HTML chip projected onto the figure's head position
// ---------------------------------------------------------------------------

const nametagEl = document.querySelector<HTMLDivElement>('#nametag')!
const nametagWorld = new THREE.Vector3(0, MODEL_HEIGHT * 1.06, 0)
const nametagProj = new THREE.Vector3()

function updateNametag() {
  nametagProj.copy(nametagWorld).project(viewCam)
  if (nametagProj.z > 1) {
    nametagEl.style.display = 'none' // behind the camera
    return
  }
  nametagEl.style.display = 'block'
  nametagEl.style.left = `${(nametagProj.x * 0.5 + 0.5) * window.innerWidth}px`
  nametagEl.style.top = `${(-nametagProj.y * 0.5 + 0.5) * window.innerHeight}px`
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

async function boot() {
  await Promise.all([setupFigure(), setupFlyers()])
  povIndex = flyers.findIndex((f) => f.pov)
  buildChoreography()

  // start framing: already riding behind the first flyer
  for (const f of flyers) updateFlyer(f, 0)
  viewCam.position.copy(flyers[0].chasePos)
  viewCam.quaternion.copy(flyers[0].chaseQuat)
  enterFollow(0)

  loaderEl.classList.add('done')
  measureFeeds()
  window.setInterval(shuffleDeck, 3400)

  let feedAccum = 0
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05)
    const elapsed = clock.elapsedTime
    for (const f of flyers) updateFlyer(f, elapsed)
    updateViewCam(dt, elapsed)
    updateNametag()
    composer.render()
    if (debugScroll) {
      document.title = `p=${scrollP.toFixed(2)} y=${Math.round(window.scrollY)} ${camState}`
    }
    feedAccum += dt
    if (feedAccum >= 1 / FEED_FPS) {
      feedAccum = 0
      renderFeeds()
    }
    compositeFeeds()
  })
}

window.addEventListener('resize', () => {
  viewCam.aspect = window.innerWidth / window.innerHeight
  viewCam.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
  measureFeeds()
})

boot().catch((err) => {
  loaderPct.textContent = 'FAILED TO LOAD ASSETS'
  console.error(err)
})
