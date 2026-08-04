// ---------------------------------------------------------------------------
// default environment registry — the swappable, crossfade-blendable worlds.
//
// Data lives here, geometry lives in environment.ts: each scene is a PALETTE
// (plain color knobs) fed to an exported builder. The three legacy looks
// (void / grid-hall / dusk) are dome- and texture-rooms; the wood shop is a
// PLACE built from real props (studs, lumber, sawhorses) — palettes tune its
// materials, they don't fake walls.
//
// The other five role scenes (circuit / pegboard / solar / mural / vent)
// live on the `role-scenes-wip` branch until each gets the same per-scene
// polish the wood shop is getting here.
//
// Two override layers (see plan): registry-level (a host supplies its own
// environments[]) and palette-level (the consts below are exported, so a
// host retunes colors without writing THREE code).
// ---------------------------------------------------------------------------

import type { EnvironmentDef, VoidPalette } from '../environment.ts'
import {
  buildVoidLike,
  buildRoom,
  buildWoodShop,
  gridTexture,
} from '../environment.ts'

// --- palette shapes ---------------------------------------------------------

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

export function woodShopEnv(p: WoodShopPalette): EnvironmentDef['build'] {
  return () => buildWoodShop(p)
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

  // scenes by job role — the wood shop ships; the rest are on
  // role-scenes-wip until polished
  {
    id: 'wood',
    label: 'WOOD SHOP',
    bg: 0x140d06,
    fogColor: 0x241708,
    fogDensity: 0.06,
    build: woodShopEnv(WOOD_SHOP_PALETTE),
  },
]
