import * as THREE from 'three'
import { scene } from './engine.ts'
import { sceneConfig } from './config-data/index.ts'
import type { WoodShopPalette } from './config-data/environments.ts'

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
// The default registry lives in config-data/environments.ts (palettes +
// factories, aggregated into sceneConfig); add a new entry there and it
// works with all of it.
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

export function gridTexture(bg: string, line: string, cells: number, repeat: [number, number]): THREE.CanvasTexture {
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

export interface VoidPalette {
  dome: [number, string][]
  disc: [number, string][]
  ambient: [color: number, intensity: number]
  rim: [color: number, intensity: number]
  under: [color: number, intensity: number]
}

/** the signature look: gradient dome + glow disc under the figure + 3-point teal */
export function buildVoidLike(p: VoidPalette): BuiltEnvironment {
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

  // ---- the scan stage: a DASHED boundary ring around the glow disc.
  // Without an edge the disc read as spilled light and Joe floated in an
  // undefined void. First pass used a solid ring + 24 separate tick boxes,
  // but at any camera angle the ticks projected onto the ring line itself
  // (invisible as separate elements) — so the tick idea is merged INTO the
  // ring: 24 arc segments with gaps, one material, always legible. Pure
  // primitives (design: Qwen art-direction pass, 2026-08-17). ----
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x3ee6d8,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const SEGMENTS = 24
  const DASH = 0.62 // fraction of each slot the arc fills
  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = (i / SEGMENTS) * Math.PI * 2
    const a1 = a0 + (Math.PI * 2 / SEGMENTS) * DASH
    const arc = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.42, 10, 1, a0, a1 - a0), ringMat)
    arc.rotation.x = -Math.PI / 2
    arc.position.y = 0.02
    group.add(arc)
  }

  // ---- distant vertical light pillars: scale + parallax for the dolly.
  // Six thin additive boxes (~3.3x joe's height) scattered 16-24m behind
  // him at irregular angles — space continues, not a colonnade. Kept off
  // the +x side where the feed panels sit so they never clutter the UI. ----
  const pillarMat = new THREE.MeshBasicMaterial({
    color: 0x14a093,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const pillarGeo = new THREE.BoxGeometry(0.09, 9, 0.09)
  const pillarSpecs: [angleDeg: number, radius: number][] = [
    [150, 11], [118, 13.5], [86, 12],
    [-70, 14], [-105, 11.5], [-140, 12.5],
  ]
  for (const [deg, radius] of pillarSpecs) {
    const a = (deg * Math.PI) / 180
    const pillar = new THREE.Mesh(pillarGeo, pillarMat)
    pillar.position.set(Math.sin(a) * radius, 4, Math.cos(a) * radius)
    group.add(pillar)
  }

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
interface RoomSpec {
  wall: THREE.Texture
  floor: THREE.Texture
  ambient: [color: number, intensity: number]
  key: [color: number, intensity: number, x: number, y: number, z: number]
  accents: [color: number, intensity: number, x: number, y: number, z: number][]
}

export function buildRoom(s: RoomSpec): BuiltEnvironment {
  const group = new THREE.Group()

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(26, 9, 26),
    new THREE.MeshBasicMaterial({ map: s.wall, side: THREE.BackSide }),
  )
  room.position.y = 4.5
  group.add(room)

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(13, 48),
    new THREE.MeshBasicMaterial({ map: s.floor }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.002 // under the void's glow disc when meshed
  group.add(floor)

  group.add(new THREE.AmbientLight(s.ambient[0], s.ambient[1]))
  const key = new THREE.DirectionalLight(s.key[0], s.key[1])
  key.position.set(s.key[2], s.key[3], s.key[4])
  group.add(key)
  for (const [color, intensity, x, y, z] of s.accents) {
    const accent = new THREE.PointLight(color, intensity, 12, 1.8)
    accent.position.set(x, y, z)
    group.add(accent)
  }

  const fades = makeFadeable(group)
  return { group, fades, dispose: () => disposeGroup(group) }
}

// ---------------------------------------------------------------------------
// prop kit — the role scenes are PLACES, not wallpaper: every one is built
// from real geometry (studs, lumber, ducts, panel cabinets, scaffold) in
// MeshStandardMaterial so the lights sculpt it. makeFadeable handles any
// material's opacity, so crossfades still work.
// ---------------------------------------------------------------------------

function std(color: number, roughness = 0.9, metalness = 0.05): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

function emissive(color: number, intensity = 3.2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity })
}

function addBox(
  g: THREE.Group, w: number, h: number, d: number, mat: THREE.Material,
  x: number, y: number, z: number, ry = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.rotation.y = ry
  g.add(m)
  return m
}

function addCyl(
  g: THREE.Group, r: number, h: number, mat: THREE.Material,
  x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y',
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), mat)
  m.position.set(x, y, z)
  if (axis === 'x') m.rotation.z = Math.PI / 2
  if (axis === 'z') m.rotation.x = Math.PI / 2
  g.add(m)
  return m
}

function finish(group: THREE.Group): BuiltEnvironment {
  const fades = makeFadeable(group)
  return { group, fades, dispose: () => disposeGroup(group) }
}

function floorDisc(color: number, r = 13): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), std(color, 0.95))
  m.rotation.x = -Math.PI / 2
  return m
}

/** plain dark enclosure — keeps the void out of frame as the camera orbits;
 *  feature walls and props carry the identity */
function enclosure(color: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(30, 10, 30),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.BackSide }),
  )
  m.position.y = 5
  return m
}

/** exposed framing — studs between top/bottom plates, one row of blocking */
function studWall(width: number, height: number, color = 0x9a7a50): THREE.Group {
  const g = new THREE.Group()
  const lumber = std(color, 0.95)
  const stud = new THREE.BoxGeometry(0.09, height - 0.18, 0.04)
  for (let x = -width / 2; x <= width / 2 + 0.001; x += 0.62) {
    const s = new THREE.Mesh(stud, lumber)
    s.position.set(x, height / 2, 0)
    g.add(s)
  }
  addBox(g, width + 0.09, 0.09, 0.09, lumber, 0, 0.045, 0)
  addBox(g, width + 0.09, 0.09, 0.09, lumber, 0, height - 0.045, 0)
  addBox(g, width + 0.09, 0.09, 0.04, lumber, 0, height * 0.55, 0)
  return g
}

/** stacked lumber on stickers */
function lumberStack(shades = [0x9c7a4f, 0x8a6a44, 0xa9885c, 0x7d5f3d, 0x93714a]): THREE.Group {
  const g = new THREE.Group()
  const plank = new THREE.BoxGeometry(2.4, 0.055, 0.16)
  for (let level = 0; level < 5; level++) {
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(plank, std(shades[(level + i) % shades.length], 0.95))
      m.position.set(((level * 7 + i * 3) % 5 - 2) * 0.02, 0.06 + level * 0.075, (i - 2) * 0.19)
      g.add(m)
    }
  }
  return g
}

function sawhorse(color = 0x8a6a44): THREE.Group {
  const g = new THREE.Group()
  const wood = std(color, 0.95)
  addBox(g, 1.05, 0.07, 0.09, wood, 0, 0.62, 0)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = addBox(g, 0.05, 0.68, 0.07, wood, sx * 0.42, 0.31, sz * 0.16)
      leg.rotation.z = sx * 0.22
      leg.rotation.x = -sz * 0.18
    }
  }
  return g
}

/** hanging work lamp — cord, cone shade, glowing bulb (add a PointLight too) */
function hangingLamp(drop: number, glow = 0xffd9a0): THREE.Group {
  const g = new THREE.Group()
  addCyl(g, 0.008, drop, std(0x22303a, 0.8), 0, -drop / 2, 0)
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.2, 0.14, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2e3d47, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }),
  )
  shade.position.y = -drop - 0.02
  g.add(shade)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), emissive(glow))
  bulb.position.y = -drop - 0.08
  g.add(bulb)
  return g
}

// ---------------------------------------------------------------------------
// scene builders — one per world, palette-driven. Palettes live in
// config-data/environments.ts (host-tunable data); the geometry lives here.
// ---------------------------------------------------------------------------

/** framing going up — stud walls, lumber stack, sawhorses, tungsten lamps */
export function buildWoodShop(p: WoodShopPalette): BuiltEnvironment {
  const g = new THREE.Group()
  g.add(enclosure(p.shell))
  g.add(floorDisc(p.floor))
  const frame1 = studWall(11, 3.5, p.stud)
  frame1.position.z = -7.6
  g.add(frame1)
  const frame2 = studWall(6.5, 3.5, p.stud)
  frame2.position.set(-7.4, 0, -1.5)
  frame2.rotation.y = Math.PI / 2.4
  g.add(frame2)
  const stack = lumberStack(p.lumber)
  stack.position.set(4.6, 0, -5)
  stack.rotation.y = -0.35
  g.add(stack)
  for (const x of [-3.4, -1.2]) {
    const sh = sawhorse(p.lumber[1])
    sh.position.set(x, 0, -4.4)
    g.add(sh)
  }
  addBox(g, 3.4, 0.05, 0.32, std(p.plank, 0.95), -2.3, 0.69, -4.4, 0.03)
  // offcuts around the horses
  addBox(g, 0.7, 0.04, 0.12, std(p.lumber[3], 0.95), -1.6, 0.02, -3.5, 0.4)
  addBox(g, 0.5, 0.04, 0.1, std(p.lumber[0], 0.95), -0.9, 0.02, -3.1, -0.7)
  addBox(g, 0.9, 0.04, 0.12, std(p.lumber[2], 0.95), -2.7, 0.02, -3.2, 1.2)
  // plywood leaning on the open side + a scrap block, so drift shots aren't bare
  const ply = addBox(g, 2.4, 2.8, 0.06, std(p.lumber[2], 0.95), 5, 1.3, 6.8, -2.5)
  ply.rotation.x = -0.15
  addBox(g, 1.2, 0.5, 0.8, std(p.lumber[3], 0.95), -5.5, 0.25, 5.5, 0.4)
  // extension ladder leaning on the back framing
  const ladder = new THREE.Group()
  const ladWood = std(p.stud, 0.9)
  for (const sx of [-0.28, 0.28]) addBox(ladder, 0.06, 3.4, 0.07, ladWood, sx, 1.7, 0)
  for (let i = 1; i <= 9; i++) addBox(ladder, 0.56, 0.045, 0.05, std(p.lumber[2], 0.9), 0, i * 0.34, 0.02)
  ladder.position.set(2.4, 0, -7.05)
  ladder.rotation.x = -0.18
  g.add(ladder)
  // tripod work light aimed back across the bay
  const trip = new THREE.Group()
  const tripSteel = std(0x22303a, 0.6, 0.4)
  for (const [lx, lz, rz, rx] of [[0.28, 0, 0.3, 0], [-0.14, 0.24, -0.15, 0.26], [-0.14, -0.24, -0.15, -0.26]] as const) {
    const leg = addBox(trip, 0.04, 1.5, 0.04, tripSteel, lx, 0.7, lz)
    leg.rotation.z = rz
    leg.rotation.x = rx
  }
  addBox(trip, 0.5, 0.36, 0.12, tripSteel, 0, 1.45, 0)
  addBox(trip, 0.42, 0.28, 0.02, emissive(0xffe6b8, 2.2), 0, 1.45, 0.07)
  trip.position.set(3.2, 0, -2.2)
  trip.rotation.y = 2.5
  g.add(trip)
  const work = new THREE.PointLight(0xffe0b0, 1.5, 12, 1.8)
  work.position.set(2.6, 1.5, -2.6)
  g.add(work)
  // sawdust pile by the horses
  const pile = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.18, 16), std(0xc9a86b, 1))
  pile.position.set(-2.0, 0.09, -3.8)
  g.add(pile)
  for (const [x, z] of [[-2.3, -4.4], [3.8, -3.2]] as const) {
    const lamp = hangingLamp(1.3, p.lamp)
    lamp.position.set(x, 4.4, z)
    g.add(lamp)
    const glow = new THREE.PointLight(p.lamp, 1.2, 10, 1.8)
    glow.position.set(x, 3, z)
    g.add(glow)
  }
  g.add(new THREE.AmbientLight(p.ambient[0], p.ambient[1]))
  const key = new THREE.DirectionalLight(p.key[0], p.key[1])
  key.position.set(3, 7, 2)
  g.add(key)
  return finish(g)
}

// ---------------------------------------------------------------------------
// the registry — the default list lives in config-data/environments.ts
// (palettes + factories), aggregated into sceneConfig; hosts override it
// wholesale via the scene-config layer
// ---------------------------------------------------------------------------

export const ENVIRONMENTS: EnvironmentDef[] = sceneConfig.environments

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
