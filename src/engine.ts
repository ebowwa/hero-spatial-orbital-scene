import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// ---------------------------------------------------------------------------
// engine — core singletons (renderer/scene/camera/composer/clock), the shared
// per-frame scratch pool, the environment, and the resize registry. Every
// other module imports these.
// ---------------------------------------------------------------------------

export const MODEL_HEIGHT = 2.4 // normalized height of the figure, world units

const BG_COLOR = new THREE.Color('#03181f')
const FOG_COLOR = new THREE.Color('#06262e')

// ---------------------------------------------------------------------------
// renderer / scene / camera
// ---------------------------------------------------------------------------

export const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.85

export const scene = new THREE.Scene()
scene.background = BG_COLOR
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.055)

export const viewCam = new THREE.PerspectiveCamera(
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

export const composer = new EffectComposer(renderer)
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
// per-frame scratch pool — shared, reused every frame (no allocs). Safe because
// updateFlyer finishes before updateViewCam runs each frame (no reentrancy).
// ---------------------------------------------------------------------------

export const clock = new THREE.Clock()
export const tmpMat = new THREE.Matrix4()
export const tmpQuat = new THREE.Quaternion()
export const tmpVecA = new THREE.Vector3()
export const tmpVecB = new THREE.Vector3()
export const forward = new THREE.Vector3()
export const zAxis = new THREE.Vector3(0, 0, 1)

// ---------------------------------------------------------------------------
// resize — engine resizes its own singletons, then fans out to subscribers
// (flyers re-measure their feed boxes)
// ---------------------------------------------------------------------------

const resizeCbs = new Set<() => void>()
export function addResize(cb: () => void) {
  resizeCbs.add(cb)
}
window.addEventListener('resize', () => {
  viewCam.aspect = window.innerWidth / window.innerHeight
  viewCam.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
  for (const cb of resizeCbs) cb()
})
