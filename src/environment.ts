import * as THREE from 'three'
import { scene } from './engine.ts'

// ---------------------------------------------------------------------------
// environment primitive — walls/floor/backdrop as a swappable, blendable unit
// (same registry pattern as the camera rigs in rigs.ts)
//
// An EnvironmentDef is everything needed to dress the empty scene: background
// + fog params, and a build() that returns the geometry/lights. Every built
// env exposes fade setters (material opacity, light intensity) so two envs can
// coexist at arbitrary weights — transitionTo() crossfades over time,
// meshEnvironments() holds a static mix (e.g. void walls + grid-hall at 50%).
//
// Add a new entry to ENVIRONMENTS and it works with all of it.
// ---------------------------------------------------------------------------

export interface EnvironmentDef {
  id: string
  label: string
  bg: number
  fogColor: number
  fogDensity: number
  build(): BuiltEnvironment
}

export interface BuiltEnvironment {
  group: THREE.Group
  /** weight setters: 0 = fully gone, 1 = full presence */
  fades: ((w: number) => void)[]
  dispose(): void
}

// ---------------------------------------------------------------------------
// shared texture helpers
// ---------------------------------------------------------------------------

function radialTexture(
  stops: [number, string][],
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  size = 512,
): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1)
  for (const [o, col] of stops) g.addColorStop(o, col)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function gridTexture(bg: string, line: string, cells: number, repeat: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 512, 512)
  ctx.strokeStyle = line
  ctx.lineWidth = 2
  ctx.shadowColor = line
  ctx.shadowBlur = 6
  const step = 512 / cells
  ctx.beginPath()
  for (let i = 0; i <= cells; i++) {
    const p = Math.round(i * step) + 0.5
    ctx.moveTo(p, 0)
    ctx.lineTo(p, 512)
    ctx.moveTo(0, p)
    ctx.lineTo(512, p)
  }
  ctx.stroke()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat[0], repeat[1])
  return tex
}

// ---------------------------------------------------------------------------
// build helpers
// ---------------------------------------------------------------------------

/** every material becomes fadeable; lights fade by intensity */
function makeFadeable(group: THREE.Group): ((w: number) => void)[] {
  const fades: ((w: number) => void)[] = []
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const m of mats) {
        m.transparent = true
        const base = m.opacity
        fades.push((w) => {
          m.opacity = base * w
        })
      }
    } else if (obj instanceof THREE.Light) {
      const base = obj.intensity
      fades.push((w) => {
        obj.intensity = base * w
      })
    }
  })
  return fades
}

function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const m of mats) {
        if (m.map) m.map.dispose()
        m.dispose()
      }
    }
  })
}

interface VoidPalette {
  dome: [number, string][]
  disc: [number, string][]
  ambient: [color: number, intensity: number]
  rim: [color: number, intensity: number]
  under: [color: number, intensity: number]
}

/** the signature look: gradient dome + glow disc under the figure + 3-point teal */
function buildVoidLike(p: VoidPalette): BuiltEnvironment {
  const group = new THREE.Group()

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(28, 32, 24),
    new THREE.MeshBasicMaterial({ map: radialTexture(p.dome, 256, 210, 40, 340), side: THREE.BackSide, fog: false }),
  )
  dome.position.y = 2
  group.add(dome)

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 48),
    new THREE.MeshBasicMaterial({
      map: radialTexture(p.disc, 128, 128, 0, 128, 256),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  disc.rotation.x = -Math.PI / 2
  disc.position.y = 0.005
  group.add(disc)

  group.add(new THREE.AmbientLight(p.ambient[0], p.ambient[1]))
  const rim = new THREE.DirectionalLight(p.rim[0], p.rim[1])
  rim.position.set(-4, 6, -5)
  group.add(rim)
  const under = new THREE.PointLight(p.under[0], p.under[1], 9, 1.8)
  under.position.set(0, 0.15, 0)
  group.add(under)

  const fades = makeFadeable(group)
  return { group, fades, dispose: () => disposeGroup(group) }
}

/** a walled room — actual mesh walls the void doesn't have */
function buildGridHall(): BuiltEnvironment {
  const group = new THREE.Group()

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(26, 9, 26),
    new THREE.MeshBasicMaterial({ map: gridTexture('#051e25', '#0f4d5c', 8, [4, 2]), side: THREE.BackSide }),
  )
  room.position.y = 4.5
  group.add(room)

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(13, 48),
    new THREE.MeshBasicMaterial({ map: gridTexture('#04161c', '#0c4350', 8, [6, 6]) }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.002 // under the void's glow disc when meshed
  group.add(floor)

  group.add(new THREE.AmbientLight(0x16333c, 0.5))
  const key = new THREE.DirectionalLight(0xcfeff8, 0.55)
  key.position.set(3, 7, 2)
  group.add(key)
  for (const [x, z] of [[-5, -5], [5, 5]] as const) {
    const accent = new THREE.PointLight(0x2fd4e8, 2, 12, 1.8)
    accent.position.set(x, 2.5, z)
    group.add(accent)
  }

  const fades = makeFadeable(group)
  return { group, fades, dispose: () => disposeGroup(group) }
}

// ---------------------------------------------------------------------------
// the registry — new environments go here
// ---------------------------------------------------------------------------

export const ENVIRONMENTS: EnvironmentDef[] = [
  {
    // the current look, unchanged
    id: 'void',
    label: 'VOID',
    bg: 0x03181f,
    fogColor: 0x06262e,
    fogDensity: 0.055,
    build: () =>
      buildVoidLike({
        dome: [[0, '#1a6472'], [0.45, '#0a3540'], [1, '#020e12']],
        disc: [[0, 'rgba(80, 220, 235, 0.55)'], [0.5, 'rgba(30, 120, 135, 0.18)'], [1, 'rgba(0, 0, 0, 0)']],
        ambient: [0x1c3f4a, 0.45],
        rim: [0x9fe8ff, 0.7],
        under: [0x1e7d8c, 2.5],
      }),
  },
  {
    id: 'grid-hall',
    label: 'GRID HALL',
    bg: 0x020a0d,
    fogColor: 0x04161b,
    fogDensity: 0.07,
    build: buildGridHall,
  },
  {
    id: 'dusk',
    label: 'DUSK',
    bg: 0x180d05,
    fogColor: 0x2a1708,
    fogDensity: 0.05,
    build: () =>
      buildVoidLike({
        dome: [[0, '#8a5424'], [0.45, '#3d2410'], [1, '#0d0603']],
        disc: [[0, 'rgba(255, 190, 110, 0.5)'], [0.5, 'rgba(150, 90, 40, 0.16)'], [1, 'rgba(0, 0, 0, 0)']],
        ambient: [0x4a2c14, 0.5],
        rim: [0xffc98a, 0.7],
        under: [0x8c5a1e, 2.5],
      }),
  },
]

// ---------------------------------------------------------------------------
// manager — two slots (current + incoming) with weights; scene bg/fog lerp
// ---------------------------------------------------------------------------

interface ActiveEnv {
  def: EnvironmentDef
  built: BuiltEnvironment
  weight: number
}

let envA: ActiveEnv | null = null // primary
let envB: ActiveEnv | null = null // blending in
let blendSeconds = 0

const tmpColorA = new THREE.Color()
const tmpColorB = new THREE.Color()

function buildActive(def: EnvironmentDef, weight: number): ActiveEnv {
  const built = def.build()
  scene.add(built.group)
  const active = { def, built, weight }
  applyWeight(active)
  return active
}

function applyWeight(env: ActiveEnv) {
  for (const f of env.built.fades) f(env.weight)
}

function removeActive(env: ActiveEnv) {
  scene.remove(env.built.group)
  env.built.dispose()
}

function applySceneParams() {
  if (!envA) return
  const bg = scene.background as THREE.Color
  const fog = scene.fog as THREE.FogExp2
  if (envB) {
    const t = envB.weight
    bg.copy(tmpColorA.set(envA.def.bg)).lerp(tmpColorB.set(envB.def.bg), t)
    fog.color.copy(tmpColorA.set(envA.def.fogColor)).lerp(tmpColorB.set(envB.def.fogColor), t)
    fog.density = envA.def.fogDensity * (1 - t) + envB.def.fogDensity * t
  } else {
    bg.set(envA.def.bg)
    fog.color.set(envA.def.fogColor)
    fog.density = envA.def.fogDensity
  }
}

function findDef(id: string): EnvironmentDef {
  return ENVIRONMENTS.find((e) => e.id === id) ?? ENVIRONMENTS[0]
}

/** set the environment instantly (boot) */
export function initEnvironment(id = 'void') {
  if (envA) removeActive(envA)
  if (envB) removeActive(envB)
  envA = buildActive(findDef(id), 1)
  envB = null
  blendSeconds = 0
  applySceneParams()
}

/** crossfade to another environment over `seconds` */
export function transitionTo(id: string, seconds = 2.5) {
  const def = findDef(id)
  if (envB?.def === def || (!envB && envA?.def === def)) return
  if (envB) {
    // mid-blend: promote whatever is coming in, then start the new blend
    removeActive(envA!)
    envA = envB
    envA.weight = 1
    applyWeight(envA)
    envB = null
  }
  if (!envA) return initEnvironment(id)
  envB = buildActive(def, 0)
  blendSeconds = Math.max(0.01, seconds)
}

/** hold a static mix of two environments — the "meshed walls" state */
export function meshEnvironments(idA: string, idB: string, t = 0.5) {
  if (envA) removeActive(envA)
  if (envB) removeActive(envB)
  envA = buildActive(findDef(idA), 1 - t)
  envB = buildActive(findDef(idB), t)
  blendSeconds = 0 // static — updateEnvironment leaves it alone
  applySceneParams()
}

export function currentEnvironmentId(): string {
  return (envB ?? envA)?.def.id ?? 'void'
}

/** cycle to the next environment in the registry (hotkey) */
export function cycleEnvironment(seconds = 2.5) {
  const cur = ENVIRONMENTS.indexOf(findDef(currentEnvironmentId()))
  const next = ENVIRONMENTS[(cur + 1) % ENVIRONMENTS.length]
  transitionTo(next.id, seconds)
  return next.id
}

export function updateEnvironment(dt: number) {
  if (!envA || !envB || blendSeconds === 0) return
  envB.weight = Math.min(1, envB.weight + dt / blendSeconds)
  envA.weight = 1 - envB.weight
  applyWeight(envA)
  applyWeight(envB)
  applySceneParams()
  if (envB.weight >= 1) {
    removeActive(envA)
    envA = envB
    envB = null
    blendSeconds = 0
  }
}
