// ---------------------------------------------------------------------------
// default environment registry — the swappable, crossfade-blendable worlds.
//
// Data lives here, geometry lives in environment.ts: each scene is a PALETTE
// (plain color knobs) fed to an exported builder. The three legacy looks
// (void / grid-hall / dusk) are dome- and texture-rooms; the six role scenes
// are PLACES built from real props (studs, lumber, ducts, panel cabinets,
// scaffold) — palettes tune their materials, they don't fake walls.
//
// Two override layers (see plan): registry-level (a host supplies its own
// environments[]) and palette-level (the consts below are exported, so a
// host retunes colors without writing THREE code).
// ---------------------------------------------------------------------------

import type { EnvironmentDef, VoidPalette } from '../environment.ts'
import {
  buildVoidLike,
  buildRoom,
  buildCircuitBay,
  buildWorkshop,
  buildWoodShop,
  buildSolarRoof,
  buildMuralWall,
  buildMechRoom,
  gridTexture,
} from '../environment.ts'

// --- palette shapes (role scenes) ------------------------------------------

export interface CircuitBayPalette {
  slab: number
  sideSlab: number
  shell: number
  floor: number
  steel: number
  doorSteel: number
  led: number
  conduit: number
  tray: number
  ambient: [color: number, intensity: number]
  key: [color: number, intensity: number]
  task: [color: number, intensity: number]
  warm: [color: number, intensity: number]
}

export interface WorkshopPalette {
  slab: number
  shell: number
  floor: number
  frameWood: number
  pegBg: string
  pegHole: string
  benchWood: number
  toolbox: number
  tray: number
  ladder: number
  lamp: number
  ambient: [color: number, intensity: number]
  key: [color: number, intensity: number]
}

export interface WoodShopPalette {
  floor: number
  shell: number
  stud: number
  lumber: number[]
  plank: number
  lamp: number
  ambient: [color: number, intensity: number]
  key: [color: number, intensity: number]
}

export interface SolarPalette {
  skyStops: [number, string][]
  skyCx: number
  skyCy: number
  roof: number
  parapet: number
  frame: number
  panelFace: string
  panelCell: string
  unit: number
  unitFan: number
  ambient: [color: number, intensity: number]
  sun: [color: number, intensity: number]
  warm: [color: number, intensity: number]
}

export interface MuralPalette {
  skyStops: [number, string][]
  skyCx: number
  skyCy: number
  floor: number
  wall: number
  brick: string
  mortar: string
  sprays: string[]
  steel: number
  plank: number
  bucketMetal: number
  ambient: [color: number, intensity: number]
  key: [color: number, intensity: number]
  glowA: [color: number, intensity: number]
  glowB: [color: number, intensity: number]
}

export interface MechRoomPalette {
  floor: number
  slab: number
  sideSlab: number
  shell: number
  duct: number
  louver: number
  fixture: number
  ambient: [color: number, intensity: number]
  key: [color: number, intensity: number]
  tube: [color: number, intensity: number]
}

/** the original walled room (grid-hall) — grid wall/floor textures + lights */
export interface RoomPalette {
  wall: [bg: string, line: string, cells: number, repeat: [number, number]]
  floor: [bg: string, line: string, cells: number, repeat: [number, number]]
  ambient: [color: number, intensity: number]
  key: [color: number, intensity: number, x: number, y: number, z: number]
  accents: [color: number, intensity: number, x: number, y: number, z: number][]
}

// --- factories — palette in, build() out -----------------------------------

export function voidEnv(p: VoidPalette): EnvironmentDef['build'] {
  return () => buildVoidLike(p)
}

export function roomEnv(p: RoomPalette): EnvironmentDef['build'] {
  return () =>
    buildRoom({
      wall: gridTexture(...p.wall),
      floor: gridTexture(...p.floor),
      ambient: p.ambient,
      key: p.key,
      accents: p.accents,
    })
}

export function circuitEnv(p: CircuitBayPalette): EnvironmentDef['build'] {
  return () => buildCircuitBay(p)
}

export function workshopEnv(p: WorkshopPalette): EnvironmentDef['build'] {
  return () => buildWorkshop(p)
}

export function woodShopEnv(p: WoodShopPalette): EnvironmentDef['build'] {
  return () => buildWoodShop(p)
}

export function solarEnv(p: SolarPalette): EnvironmentDef['build'] {
  return () => buildSolarRoof(p)
}

export function muralEnv(p: MuralPalette): EnvironmentDef['build'] {
  return () => buildMuralWall(p)
}

export function mechRoomEnv(p: MechRoomPalette): EnvironmentDef['build'] {
  return () => buildMechRoom(p)
}

// --- palettes (exported so hosts retune without touching builders) ---------

export const VOID_PALETTE: VoidPalette = {
  dome: [[0, '#1a6472'], [0.45, '#0a3540'], [1, '#020e12']],
  disc: [[0, 'rgba(80, 220, 235, 0.55)'], [0.5, 'rgba(30, 120, 135, 0.18)'], [1, 'rgba(0, 0, 0, 0)']],
  ambient: [0x1c3f4a, 0.45],
  rim: [0x9fe8ff, 0.7],
  under: [0x1e7d8c, 2.5],
}

export const DUSK_PALETTE: VoidPalette = {
  dome: [[0, '#8a5424'], [0.45, '#3d2410'], [1, '#0d0603']],
  disc: [[0, 'rgba(255, 190, 110, 0.5)'], [0.5, 'rgba(150, 90, 40, 0.16)'], [1, 'rgba(0, 0, 0, 0)']],
  ambient: [0x4a2c14, 0.5],
  rim: [0xffc98a, 0.7],
  under: [0x8c5a1e, 2.5],
}

export const GRID_HALL_PALETTE: RoomPalette = {
  wall: ['#051e25', '#0f4d5c', 8, [4, 2]],
  floor: ['#04161c', '#0c4350', 8, [6, 6]],
  ambient: [0x16333c, 0.5],
  key: [0xcfeff8, 0.55, 3, 7, 2],
  accents: [
    [0x2fd4e8, 2, -5, 2.5, -5],
    [0x2fd4e8, 2, 5, 2.5, 5],
  ],
}

export const CIRCUIT_PALETTE: CircuitBayPalette = {
  slab: 0x18262e,
  sideSlab: 0x14222a,
  shell: 0x0d161c,
  floor: 0x131a1f,
  steel: 0x8f9aa3,
  doorSteel: 0xa5b0b8,
  led: 0x2fd4e8,
  conduit: 0x9aa5ad,
  tray: 0x6f7d86,
  ambient: [0x16333c, 0.5],
  key: [0xd8f6ff, 0.6],
  task: [0x2fd4e8, 1.4],
  warm: [0xffa54d, 1.1],
}

export const WORKSHOP_PALETTE: WorkshopPalette = {
  slab: 0x1c262c,
  shell: 0x10161a,
  floor: 0x15191c,
  frameWood: 0x5d4a30,
  pegBg: '#0a2530',
  pegHole: '#12505f',
  benchWood: 0x7a5c3a,
  toolbox: 0xb23b3b,
  tray: 0x5d8b93,
  ladder: 0x9fb0ba,
  lamp: 0xffd9a0,
  ambient: [0x2a2418, 0.6],
  key: [0xfff1d6, 0.55],
}

export const WOOD_SHOP_PALETTE: WoodShopPalette = {
  floor: 0x201509,
  shell: 0x120b06,
  stud: 0x9a7a50,
  lumber: [0x9c7a4f, 0x8a6a44, 0xa9885c, 0x7d5f3d, 0x93714a],
  plank: 0xa9885c,
  lamp: 0xffd9a0,
  ambient: [0x3d2c17, 0.6],
  key: [0xffe0b0, 0.6],
}

export const SOLAR_PALETTE: SolarPalette = {
  skyStops: [[0, '#ffd9a6'], [0.3, '#d18a44'], [0.6, '#4a4526'], [1, '#0e1a1d']],
  skyCx: 390,
  skyCy: 130,
  roof: 0x12161a,
  parapet: 0x232a2e,
  frame: 0x30404a,
  panelFace: '#0b3d4d',
  panelCell: '#175060',
  unit: 0x77828a,
  unitFan: 0x39444c,
  ambient: [0x574a2e, 0.55],
  sun: [0xffc27d, 1.0],
  warm: [0xff9d4d, 1.0],
}

export const MURAL_PALETTE: MuralPalette = {
  skyStops: [[0, '#b8ccd4'], [0.35, '#5d7884'], [0.7, '#20303a'], [1, '#0d161c']],
  skyCx: 140,
  skyCy: 120,
  floor: 0x17191b,
  wall: 0x2a3438,
  brick: '#1c2a30',
  mortar: '#0f1c22',
  sprays: ['#6ff2ff', '#ffb35c', '#ff5a8a'],
  steel: 0x6f7d86,
  plank: 0x8a6a44,
  bucketMetal: 0xd8dde0,
  ambient: [0x2b3a40, 0.55],
  key: [0xe8f2f8, 0.7],
  glowA: [0x6ff2ff, 1.0],
  glowB: [0xff5a8a, 0.8],
}

export const MECH_ROOM_PALETTE: MechRoomPalette = {
  floor: 0x11161a,
  slab: 0x141f26,
  sideSlab: 0x111b22,
  shell: 0x0a1116,
  duct: 0x7f8b93,
  louver: 0x0e2a33,
  fixture: 0xdff4ff,
  ambient: [0x17333b, 0.5],
  key: [0xd0e8f0, 0.5],
  tube: [0xcfeaf5, 1.2],
}

// --- the registry — role ids match the deck's per-occupation scene keys 1:1

export const DEFAULT_ENVIRONMENTS: EnvironmentDef[] = [
  {
    id: 'void',
    label: 'VOID',
    bg: 0x03181f,
    fogColor: 0x06262e,
    fogDensity: 0.055,
    build: voidEnv(VOID_PALETTE),
  },
  {
    id: 'grid-hall',
    label: 'GRID HALL',
    bg: 0x020a0d,
    fogColor: 0x04161b,
    fogDensity: 0.07,
    build: roomEnv(GRID_HALL_PALETTE),
  },
  {
    id: 'dusk',
    label: 'DUSK',
    bg: 0x180d05,
    fogColor: 0x2a1708,
    fogDensity: 0.05,
    build: voidEnv(DUSK_PALETTE),
  },

  // scenes by job role — the deck drives the world as each card fronts
  {
    id: 'circuit',
    label: 'CIRCUIT BAY',
    bg: 0x03141b,
    fogColor: 0x05222b,
    fogDensity: 0.06,
    build: circuitEnv(CIRCUIT_PALETTE),
  },
  {
    id: 'pegboard',
    label: 'WORKSHOP',
    bg: 0x081c22,
    fogColor: 0x0c2831,
    fogDensity: 0.06,
    build: workshopEnv(WORKSHOP_PALETTE),
  },
  {
    id: 'wood',
    label: 'WOOD SHOP',
    bg: 0x140d06,
    fogColor: 0x241708,
    fogDensity: 0.06,
    build: woodShopEnv(WOOD_SHOP_PALETTE),
  },
  {
    id: 'solar',
    label: 'ROOFTOP SOLAR',
    bg: 0x0d222b,
    fogColor: 0x16333c,
    fogDensity: 0.045,
    build: solarEnv(SOLAR_PALETTE),
  },
  {
    id: 'mural',
    label: 'MURAL WALL',
    bg: 0x101a1e,
    fogColor: 0x18262c,
    fogDensity: 0.06,
    build: muralEnv(MURAL_PALETTE),
  },
  {
    id: 'vent',
    label: 'MECH ROOM',
    bg: 0x07161c,
    fogColor: 0x0a2530,
    fogDensity: 0.07,
    build: mechRoomEnv(MECH_ROOM_PALETTE),
  },
]
