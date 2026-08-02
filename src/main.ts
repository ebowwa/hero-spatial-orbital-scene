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
const IDLE_RETURN_MS = 7000 // free-orbit idle time before the camera retakes control
const BLEND_SECONDS = 1.6 // transition duration back into follow mode

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
        new THREE.MeshBasicMaterial({ color: 0xff5a4a }), // recording LED
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
    label.textContent = `◉ ${def.label}`
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
// mode state machine:  FOLLOW ⇄ FREE  (with a smooth BLEND between them)
// ---------------------------------------------------------------------------

type Mode = 'follow' | 'free' | 'blend'

const modeChip = document.querySelector<HTMLDivElement>('#mode-chip')!
const btnFollow = document.querySelector<HTMLButtonElement>('#btn-follow')!
const btnFree = document.querySelector<HTMLButtonElement>('#btn-free')!
const btnRig = document.querySelector<HTMLButtonElement>('#btn-rig')!

let mode: Mode = 'follow'
let lastInteraction = 0 // ms timestamp
let blendT = 0
const blendFromPos = new THREE.Vector3()
const blendFromQuat = new THREE.Quaternion()

const controls = new OrbitControls(viewCam, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.enablePan = false
controls.minDistance = 0.6
controls.maxDistance = 9
controls.target.set(0, MODEL_HEIGHT * 0.55, 0)
controls.enabled = false

function setMode(next: Mode) {
  mode = next
  controls.enabled = next === 'free'
  modeChip.textContent =
    next === 'free'
      ? 'FREE ORBIT — DRAG TO EXPLORE'
      : `FOLLOWING ${flyers[followIndex].def.label}`
  btnFollow.classList.toggle('active', next !== 'free')
  btnFree.classList.toggle('active', next === 'free')
}

function goFree() {
  if (mode === 'free') return
  // keep the orbit target glued to the body so the handoff feels continuous
  controls.target.set(0, MODEL_HEIGHT * 0.55, 0)
  setMode('free')
}

function goFollow() {
  if (mode === 'follow') return
  blendFromPos.copy(viewCam.position)
  blendFromQuat.copy(viewCam.quaternion)
  blendT = 0
  setMode('blend')
}

/** follow the next flyer in the fleet */
function cycleFollowedFlyer() {
  followIndex = (followIndex + 1) % flyers.length
  btnRig.textContent = `⇄ follow: ${flyers[followIndex].def.label}`
  if (mode === 'follow') setMode('follow') // refresh the chip
}

controls.addEventListener('start', () => {
  lastInteraction = performance.now()
  goFree()
})
canvas.addEventListener('pointerdown', () => {
  lastInteraction = performance.now()
  goFree()
})
canvas.addEventListener('wheel', () => {
  lastInteraction = performance.now()
  goFree()
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'f') goFollow()
  if (e.key === 'o') {
    lastInteraction = performance.now()
    goFree()
  }
  if (e.key === 'c') cycleFollowedFlyer()
})

btnRig.addEventListener('click', () => cycleFollowedFlyer())

btnFollow.addEventListener('click', () => goFollow())
btnFree.addEventListener('click', () => {
  lastInteraction = performance.now()
  goFree()
})

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

  // handheld micro-shake, only in follow mode
  const shake = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      Math.sin(elapsed * 0.9) * 0.006 + Math.sin(elapsed * 2.3) * 0.002,
      Math.cos(elapsed * 0.7) * 0.006,
      Math.sin(elapsed * 0.5) * 0.004,
    ),
  )
  const rideQuat = followed.chaseQuat.clone().multiply(shake)

  if (mode === 'follow') {
    const k = 1 - Math.exp(-dt * 5.5)
    viewCam.position.lerp(followed.chasePos, k)
    viewCam.quaternion.slerp(rideQuat, k)
  } else if (mode === 'blend') {
    blendT += dt / BLEND_SECONDS
    const e = easeInOut(Math.min(blendT, 1))
    viewCam.position.lerpVectors(blendFromPos, followed.chasePos, e)
    viewCam.quaternion.slerpQuaternions(blendFromQuat, rideQuat, e)
    if (blendT >= 1) setMode('follow')
  } else {
    controls.update()
    if (performance.now() - lastInteraction > IDLE_RETURN_MS) goFollow()
  }
}

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
  buildChoreography()

  // start framing: already riding behind the first flyer
  for (const f of flyers) updateFlyer(f, 0)
  viewCam.position.copy(flyers[0].chasePos)
  viewCam.quaternion.copy(flyers[0].chaseQuat)
  setMode('follow')

  loaderEl.classList.add('done')
  measureFeeds()

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
