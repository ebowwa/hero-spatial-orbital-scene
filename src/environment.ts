import * as THREE from 'three'
import { scene } from './engine.ts'
import { sceneConfig } from './config-data/index.ts'
import type {
  CircuitBayPalette,
  WorkshopPalette,
  WoodShopPalette,
  SolarPalette,
  MuralPalette,
  MechRoomPalette,
} from './config-data/environments.ts'

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
// role-scene wall textures — palettes lifted from the deck's per-occupation
// SCENES so the card backdrop and the 3D world read as one place
// ---------------------------------------------------------------------------

function canvas512(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  draw(c.getContext('2d')!)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** pegboard — workshop wall with a regular hole grid */
function pegboardTexture(bg: string, hole: string): THREE.CanvasTexture {
  return canvas512((ctx) => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 512, 512)
    ctx.fillStyle = hole
    for (let y = 16; y < 512; y += 32) {
      for (let x = 16; x < 512; x += 32) {
        ctx.beginPath()
        ctx.arc(x, y, 4.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  })
}

/** mural wall — brick + wide spray strokes */
function muralTexture(bg: string, mortar: string, sprays: string[]): THREE.CanvasTexture {
  return canvas512((ctx) => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 512, 512)
    ctx.strokeStyle = mortar
    ctx.lineWidth = 3
    const rowH = 42
    for (let y = 0; y <= 512; y += rowH) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(512, y)
      ctx.stroke()
      const off = (y / rowH) % 2 === 0 ? 0 : 48
      for (let x = off; x <= 512; x += 96) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + rowH)
        ctx.stroke()
      }
    }
    ctx.lineCap = 'round'
    sprays.forEach((col, i) => {
      ctx.strokeStyle = col
      ctx.globalAlpha = 0.45
      ctx.lineWidth = 16 - i * 4
      ctx.beginPath()
      ctx.moveTo(-20, 400 - i * 110)
      ctx.bezierCurveTo(150, 260 - i * 70, 330, 470 - i * 120, 540, 300 - i * 50)
      ctx.stroke()
    })
    ctx.globalAlpha = 1
  })
}

/** rooftop solar — panel cell grid */
function panelTexture(face: string, cell: string): THREE.CanvasTexture {
  return canvas512((ctx) => {
    ctx.fillStyle = face
    ctx.fillRect(0, 0, 512, 512)
    ctx.strokeStyle = cell
    ctx.lineWidth = 2
    const step = 512 / 6
    ctx.beginPath()
    for (let i = 0; i <= 6; i++) {
      ctx.moveTo(i * step, 0)
      ctx.lineTo(i * step, 512)
      ctx.moveTo(0, i * step)
      ctx.lineTo(512, i * step)
    }
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.05
    ctx.fillRect(0, 0, 512, 128)
    ctx.globalAlpha = 1
  })
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

/** stage-set wall slab — props mount on these instead of a wallpapered box */
function wallSlab(w: number, h: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), std(color, 0.95))
  m.position.y = h / 2
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

function skyDome(stops: [number, string][], cx: number, cy: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(30, 32, 24),
    new THREE.MeshBasicMaterial({ map: radialTexture(stops, cx, cy, 16, 460), side: THREE.BackSide, fog: false }),
  )
  m.position.y = 2
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

function workbench(wood = 0x7a5c3a, toolbox = 0xb23b3b, tray = 0x5d8b93): THREE.Group {
  const g = new THREE.Group()
  const woodMat = std(wood, 0.9)
  addBox(g, 1.9, 0.09, 0.75, woodMat, 0, 0.86, 0)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) addBox(g, 0.09, 0.86, 0.09, woodMat, sx * 0.85, 0.43, sz * 0.3)
  }
  addBox(g, 1.7, 0.05, 0.6, woodMat, 0, 0.28, 0) // lower shelf
  addBox(g, 0.44, 0.2, 0.24, std(toolbox, 0.6, 0.3), -0.5, 1.0, 0.1) // toolbox
  addBox(g, 0.3, 0.12, 0.18, std(tray, 0.5, 0.4), 0.45, 0.96, -0.15) // parts tray
  return g
}

function stepLadder(color = 0x9fb0ba): THREE.Group {
  const g = new THREE.Group()
  const alu = std(color, 0.4, 0.7)
  for (const s of [-1, 1]) {
    const rail = addBox(g, 0.05, 1.9, 0.07, alu, s * 0.24, 0.95, 0.06)
    rail.rotation.z = -s * 0.12
  }
  for (let i = 1; i <= 4; i++) addBox(g, 0.44, 0.04, 0.1, alu, 0, i * 0.38, 0.06)
  for (const s of [-1, 1]) {
    const rail = addBox(g, 0.05, 1.85, 0.06, alu, s * 0.22, 0.92, -0.26)
    rail.rotation.z = -s * 0.12
    rail.rotation.x = 0.3
  }
  return g
}

/** wall-mounted electrical panel cabinet with a status LED */
function panelCabinet(h = 0.85, body = 0x8f9aa3, door = 0xa5b0b8, led = 0x2fd4e8): THREE.Group {
  const g = new THREE.Group()
  addBox(g, 0.55, h, 0.16, std(body, 0.45, 0.7), 0, h / 2, 0)
  addBox(g, 0.45, h - 0.12, 0.03, std(door, 0.4, 0.7), 0, h / 2, 0.09)
  const ledMesh = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), emissive(led))
  ledMesh.position.set(0.16, h - 0.1, 0.11)
  g.add(ledMesh)
  return g
}

/** conduit — vertical rise, elbow, horizontal carry */
function conduitRun(rise: number, carry: number, color = 0x9aa5ad): THREE.Group {
  const g = new THREE.Group()
  const metal = std(color, 0.35, 0.85)
  addCyl(g, 0.032, rise, metal, 0, rise / 2, 0)
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 12), metal)
  elbow.position.set(0, rise, 0)
  g.add(elbow)
  addCyl(g, 0.032, carry, metal, carry / 2, rise, 0, 'x')
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

/** scaffold tower — posts at two depths, two plank decks, one brace */
function scaffold(width: number, topH: number, steel = 0x6f7d86, plank = 0x8a6a44): THREE.Group {
  const g = new THREE.Group()
  const steelMat = std(steel, 0.5, 0.6)
  const plankMat = std(plank, 0.95)
  for (const sx of [-1, 1]) {
    addCyl(g, 0.028, topH + 0.35, steelMat, (sx * width) / 2, (topH + 0.35) / 2, 0)
    addCyl(g, 0.028, topH + 0.35, steelMat, (sx * width) / 2, (topH + 0.35) / 2, 0.5)
  }
  for (const h of [topH * 0.5, topH]) addBox(g, width + 0.15, 0.045, 0.55, plankMat, 0, h, 0.25)
  const brace = addBox(g, 0.03, topH * 0.75, 0.03, steelMat, 0, topH * 0.44, 0.5)
  brace.rotation.z = 0.6
  return g
}

function bucket(paintColor: number, metal = 0xd8dde0): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.17, 18), std(metal, 0.6, 0.3))
  body.position.y = 0.085
  g.add(body)
  const paint = new THREE.Mesh(new THREE.CircleGeometry(0.088, 18), std(paintColor, 0.4))
  paint.rotation.x = -Math.PI / 2
  paint.position.y = 0.172
  g.add(paint)
  return g
}

/** rectangular duct run with flanges, along local x */
function rectDuct(len: number, color = 0x7f8b93): THREE.Group {
  const g = new THREE.Group()
  const galv = std(color, 0.45, 0.75)
  addBox(g, len, 0.5, 0.6, galv, 0, 0, 0)
  for (let x = -len / 2 + 0.8; x < len / 2; x += 1.6) addBox(g, 0.05, 0.58, 0.68, galv, x, 0, 0)
  return g
}

/** air handler — big box with a louvered face */
function airHandler(body = 0x6d7a83, louver = 0x4a565e): THREE.Group {
  const g = new THREE.Group()
  addBox(g, 1.5, 1.3, 0.9, std(body, 0.55, 0.6), 0, 0.65, 0)
  for (let i = 0; i < 8; i++) addBox(g, 1.2, 0.035, 0.02, std(louver, 0.5, 0.6), 0, 0.3 + i * 0.11, 0.46)
  return g
}

/** rooftop PV module on racking — tilted face, front/back legs */
function solarPanel(frame = 0x30404a, face = '#0b3d4d', cell = '#175060'): THREE.Group {
  const g = new THREE.Group()
  const frameMat = std(frame, 0.5, 0.6)
  const tilt = new THREE.Group()
  tilt.add(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 1.9), frameMat))
  const faceMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.78, 1.78),
    new THREE.MeshStandardMaterial({ map: panelTexture(face, cell), roughness: 0.35, metalness: 0.15 }),
  )
  faceMesh.rotation.x = -Math.PI / 2
  faceMesh.position.y = 0.028
  tilt.add(faceMesh)
  tilt.rotation.x = -Math.PI / 5.2
  tilt.position.y = 0.78
  g.add(tilt)
  for (const sx of [-1.2, 1.2]) {
    addBox(g, 0.05, 0.5, 0.05, frameMat, sx, 0.25, 0.7)
    addBox(g, 0.05, 1.0, 0.05, frameMat, sx, 0.5, -0.75)
  }
  return g
}

function condenserUnit(body = 0x77828a, fan = 0x39444c): THREE.Group {
  const g = new THREE.Group()
  addBox(g, 0.9, 0.75, 0.9, std(body, 0.6, 0.5), 0, 0.375, 0)
  addCyl(g, 0.32, 0.1, std(fan, 0.6, 0.4), 0, 0.78, 0)
  return g
}

// ---------------------------------------------------------------------------
// scene builders — one per world, palette-driven. Palettes live in
// config-data/environments.ts (host-tunable data); the geometry lives here.
// ---------------------------------------------------------------------------

/** electrician's bay — panel cabinets, conduit runs, cable tray */
export function buildCircuitBay(p: CircuitBayPalette): BuiltEnvironment {
  const g = new THREE.Group()
  g.add(enclosure(p.shell))
  g.add(floorDisc(p.floor))
  const back = wallSlab(10, 4.4, p.slab)
  back.position.z = -8.5
  g.add(back)
  const side = wallSlab(7, 4.4, p.sideSlab)
  side.position.set(-8, 0, -2.5)
  side.rotation.y = Math.PI / 2.5
  g.add(side)
  for (const [x, h, y] of [[-2.2, 0.95, 1.25], [0.1, 0.7, 1.45], [1.9, 1.05, 1.1]] as const) {
    const cab = panelCabinet(h, p.steel, p.doorSteel, p.led)
    cab.position.set(x, y, -8.26)
    g.add(cab)
  }
  const rise1 = conduitRun(1.5, 3.2, p.conduit)
  rise1.position.set(-2.45, 2.2, -8.26)
  g.add(rise1)
  const rise2 = conduitRun(1.7, 2.6, p.conduit)
  rise2.position.set(2.15, 2.15, -8.26)
  rise2.rotation.y = Math.PI // carry the other way
  g.add(rise2)
  // coiled extension on the floor by the panels
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.028, 10, 28), std(0x22303a, 0.7))
  coil.rotation.x = Math.PI / 2
  coil.position.set(-3.6, 0.03, -6.8)
  g.add(coil)
  const tray = std(p.tray, 0.5, 0.6)
  addBox(g, 9, 0.05, 0.55, tray, 0, 4.05, -8.2)
  addBox(g, 9, 0.14, 0.04, tray, 0, 4.1, -7.95)
  addBox(g, 9, 0.14, 0.04, tray, 0, 4.1, -8.45)
  const lamp = hangingLamp(1.1, p.warm[0])
  lamp.position.set(3.2, 4.4, -3)
  g.add(lamp)
  g.add(new THREE.AmbientLight(p.ambient[0], p.ambient[1]))
  const key = new THREE.DirectionalLight(p.key[0], p.key[1])
  key.position.set(4, 7, 3)
  g.add(key)
  const task = new THREE.PointLight(p.task[0], p.task[1], 12, 1.8)
  task.position.set(-1, 2.4, -6.5)
  g.add(task)
  const warm = new THREE.PointLight(p.warm[0], p.warm[1], 10, 1.8)
  warm.position.set(3.2, 3.2, -3)
  g.add(warm)
  // rolling cart + cable drum on the open side
  const cart = new THREE.Group()
  const cartSteel = std(p.tray, 0.5, 0.6)
  addBox(cart, 0.9, 0.08, 0.6, cartSteel, 0, 0.5, 0)
  for (const [sx, sz] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]] as const) {
    addBox(cart, 0.05, 0.5, 0.05, cartSteel, sx, 0.25, sz)
  }
  addCyl(cart, 0.35, 0.4, std(p.conduit, 0.6, 0.4), 0, 0.95, 0, 'z')
  cart.position.set(4.8, 0, 6.2)
  cart.rotation.y = -2.6
  g.add(cart)
  return finish(g)
}

/** DIY garage — pegboard wall, workbench, stepladder, hanging lamps */
export function buildWorkshop(p: WorkshopPalette): BuiltEnvironment {
  const g = new THREE.Group()
  g.add(enclosure(p.shell))
  g.add(floorDisc(p.floor))
  const back = wallSlab(10.5, 4.2, p.slab)
  back.position.z = -8
  g.add(back)
  const boardMat = new THREE.MeshStandardMaterial({
    map: pegboardTexture(p.pegBg, p.pegHole), roughness: 0.9,
  })
  for (const x of [-2.4, 0.4, 3.2]) {
    addBox(g, 2.5, 1.6, 0.07, std(p.frameWood, 0.9), x, 2.05, -7.8)
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.34, 1.44), boardMat)
    board.position.set(x, 2.05, -7.76)
    g.add(board)
  }
  const bench = workbench(p.benchWood, p.toolbox, p.tray)
  bench.position.set(-2.6, 0, -5.2)
  bench.rotation.y = 0.25
  g.add(bench)
  const ladder = stepLadder(p.ladder)
  ladder.position.set(3.4, 0, -4.6)
  ladder.rotation.y = -0.5
  g.add(ladder)
  // extension cord coil + a parts box on the floor
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 10, 28), std(0xd96a2b, 0.7))
  cord.rotation.x = Math.PI / 2
  cord.position.set(1.9, 0.035, -3.3)
  g.add(cord)
  addBox(g, 0.5, 0.35, 0.4, std(0x8a6f4d, 0.95), -4.3, 0.175, -3.8, 0.3)
  // parts rack on the open side
  const rack = new THREE.Group()
  for (const sx of [-0.8, 0.8]) addBox(rack, 0.06, 1.8, 0.5, std(p.ladder, 0.5, 0.5), sx, 0.9, 0)
  for (const y of [0.35, 0.9, 1.45]) addBox(rack, 1.7, 0.05, 0.5, std(p.frameWood, 0.9), 0, y, 0)
  addBox(rack, 0.4, 0.25, 0.35, std(p.toolbox, 0.6, 0.3), -0.4, 1.05, 0)
  addBox(rack, 0.5, 0.3, 0.4, std(0x8a6f4d, 0.95), 0.4, 0.5, 0)
  rack.position.set(-5, 0, 5.8)
  rack.rotation.y = 2.6
  g.add(rack)
  for (const [x, z] of [[-2.6, -5.2], [1.6, -4]] as const) {
    const lamp = hangingLamp(1.2, p.lamp)
    lamp.position.set(x, 4.3, z)
    g.add(lamp)
    const glow = new THREE.PointLight(p.lamp, 1.2, 9, 1.8)
    glow.position.set(x, 3, z)
    g.add(glow)
  }
  g.add(new THREE.AmbientLight(p.ambient[0], p.ambient[1]))
  const key = new THREE.DirectionalLight(p.key[0], p.key[1])
  key.position.set(3, 7, 2)
  g.add(key)
  return finish(g)
}

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

/** rooftop array — sky dome, parapet, racked panels, condenser, low sun */
export function buildSolarRoof(p: SolarPalette): BuiltEnvironment {
  const g = new THREE.Group()
  g.add(skyDome(p.skyStops, p.skyCx, p.skyCy))
  g.add(floorDisc(p.roof, 15))
  const parapet = std(p.parapet, 0.95)
  for (const [x, z, ry] of [[0, -14.5, 0], [0, 14.5, 0], [-14.5, 0, Math.PI / 2], [14.5, 0, Math.PI / 2]] as const) {
    addBox(g, 29.5, 0.85, 0.35, parapet, x, 0.42, z, ry)
  }
  for (const x of [-8, -4.8, 4.8, 8]) {
    for (const z of [-5, 0, 5]) {
      const panel = solarPanel(p.frame, p.panelFace, p.panelCell)
      panel.position.set(x, 0, z)
      panel.rotation.y = x < 0 ? 0.15 : -0.15
      g.add(panel)
    }
  }
  const hvac = condenserUnit(p.unit, p.unitFan)
  hvac.position.set(6.2, 0, -7.5)
  g.add(hvac)
  // raceway run from the array to a junction box on the parapet
  addBox(g, 0.32, 0.42, 0.16, std(p.unit, 0.6, 0.5), -6, 1.05, -14.25)
  addCyl(g, 0.04, 9.5, std(p.frame, 0.5, 0.6), -6, 0.3, -9.4, 'z')
  g.add(new THREE.AmbientLight(p.ambient[0], p.ambient[1]))
  const sun = new THREE.DirectionalLight(p.sun[0], p.sun[1])
  sun.position.set(7, 4, -4)
  g.add(sun)
  const bounce = new THREE.PointLight(p.warm[0], p.warm[1], 14, 1.8)
  bounce.position.set(0, 1.2, -4)
  g.add(bounce)
  return finish(g)
}

/** the piece — brick wall with the mural, scaffold, paint buckets */
export function buildMuralWall(p: MuralPalette): BuiltEnvironment {
  const g = new THREE.Group()
  g.add(skyDome(p.skyStops, p.skyCx, p.skyCy))
  g.add(floorDisc(p.floor))
  addBox(g, 13, 5.2, 0.45, std(p.wall, 0.95), 0, 2.6, -8.2)
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(12.4, 4.8),
    new THREE.MeshStandardMaterial({ map: muralTexture(p.brick, p.mortar, p.sprays), roughness: 0.9 }),
  )
  art.position.set(0, 2.5, -7.96)
  g.add(art)
  const sc = scaffold(3.4, 2.7, p.steel, p.plank)
  sc.position.set(-2.4, 0, -6.9)
  g.add(sc)
  // drop cloth at the wall, spray cans up on the deck
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.2), std(0xb9c2c6, 0.95))
  cloth.rotation.x = -Math.PI / 2
  cloth.position.set(-0.5, 0.004, -6.9)
  g.add(cloth)
  for (const [dx, dz, c] of [[-0.5, 0.18, 0], [0.1, 0.3, 1], [0.6, 0.12, 2]] as const) {
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.14, 12),
      std(new THREE.Color(p.sprays[c]).getHex(), 0.5, 0.3),
    )
    can.position.set(-2.4 + dx, 2.8, -6.65 + dz)
    g.add(can)
  }
  for (const [x, z, c] of [[1.6, -6.6, 0], [2.1, -6.25, 1], [2.5, -6.75, 2]] as const) {
    const b = bucket(new THREE.Color(p.sprays[c]).getHex(), p.bucketMetal)
    b.position.set(x, 0, z)
    g.add(b)
  }
  g.add(new THREE.AmbientLight(p.ambient[0], p.ambient[1]))
  const key = new THREE.DirectionalLight(p.key[0], p.key[1])
  key.position.set(4, 8, 3)
  g.add(key)
  const glowA = new THREE.PointLight(p.glowA[0], p.glowA[1], 11, 1.8)
  glowA.position.set(-4, 1.6, -6)
  g.add(glowA)
  const glowB = new THREE.PointLight(p.glowB[0], p.glowB[1], 10, 1.8)
  glowB.position.set(3, 1.3, -5.5)
  g.add(glowB)
  return finish(g)
}

/** mech room — duct runs overhead, round drop, air handler, fluorescents */
export function buildMechRoom(p: MechRoomPalette): BuiltEnvironment {
  const g = new THREE.Group()
  g.add(enclosure(p.shell))
  g.add(floorDisc(p.floor))
  const back = wallSlab(10, 4.6, p.slab)
  back.position.z = -8.4
  g.add(back)
  const side = wallSlab(8, 4.6, p.sideSlab)
  side.position.set(-8.2, 0, -1)
  side.rotation.y = Math.PI / 2.3
  g.add(side)
  const main = rectDuct(13, p.duct)
  main.position.set(0, 3.75, -5)
  g.add(main)
  const cross = rectDuct(9, p.duct)
  cross.position.set(-5.5, 3.35, -0.5)
  cross.rotation.y = Math.PI / 2
  g.add(cross)
  addCyl(g, 0.22, 2.3, std(p.duct, 0.45, 0.75), -3, 2.5, -5)
  const ahu = airHandler(p.duct, p.louver)
  ahu.position.set(-3, 0, -6.3)
  g.add(ahu)
  // hazard marking around the unit
  const stripe = std(0xc9a227, 0.8)
  addBox(g, 2.4, 0.01, 0.12, stripe, -3, 0.006, -5.35)
  addBox(g, 2.4, 0.01, 0.12, stripe, -3, 0.006, -7.25)
  addBox(g, 0.12, 0.01, 2.02, stripe, -4.15, 0.006, -6.3)
  addBox(g, 0.12, 0.01, 2.02, stripe, -1.85, 0.006, -6.3)
  // riser pipes + valve wheel on the open side
  for (const x of [4.6, 5.0]) addCyl(g, 0.06, 4.2, std(p.duct, 0.45, 0.75), x, 2.1, 6.5)
  const valve = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 10, 20), std(0xb23b3b, 0.5, 0.4))
  valve.position.set(4.8, 1.6, 6.42)
  g.add(valve)
  for (let i = 0; i < 7; i++) addBox(g, 2.4, 0.05, 0.06, std(p.louver, 0.6, 0.4), 3.2, 1.3 + i * 0.17, -8.2)
  for (const [x, z] of [[-1.5, -2.5], [2.5, -4.5]] as const) {
    addBox(g, 1.5, 0.05, 0.14, emissive(p.fixture, 1.6), x, 4.35, z)
    const tube = new THREE.PointLight(p.tube[0], p.tube[1], 10, 1.8)
    tube.position.set(x, 4.1, z)
    g.add(tube)
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
