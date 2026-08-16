import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { embedConfig } from './embed.ts'

// ---------------------------------------------------------------------------
// engine — core singletons (renderer/scene/camera/composer/clock), the shared
// per-frame scratch pool, and the resize registry. Every other module imports
// these.
// ---------------------------------------------------------------------------

export const MODEL_HEIGHT = 2.4 // normalized height of the figure, world units

const BG_COLOR = new THREE.Color('#03181f')
const FOG_COLOR = new THREE.Color('#06262e')

// ---------------------------------------------------------------------------
// renderer / scene / camera
// ---------------------------------------------------------------------------

export const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
// cap is host-configurable via mountHero() (embed.ts); standalone keeps 1.5
renderer.setPixelRatio(Math.min(window.devicePixelRatio, embedConfig.maxPixelRatio))
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
  0.22, // strength
  0.7, // radius
  1.1, // threshold — lit skin (key + rim + ambient) stays just under it; a
  // key light swinging close must not bloom Joe's hair away into a "glowing
  // bald dome" (the lens dots and LEDs clear it as HDR emissives, see rigs)
)
composer.addPass(bloom)
composer.addPass(new OutputPass())

// ---------------------------------------------------------------------------
// base lighting — none here anymore. The walls/floor/backdrop/lights live in
// environment.ts as a swappable, blendable registry (same pattern as the
// camera rigs); initEnvironment() populates the scene. The flyers carry the
// key lights.
// ---------------------------------------------------------------------------

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
