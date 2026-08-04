// ---------------------------------------------------------------------------
// scene config types — the shape of every piece of interchangeable content a
// host (e.g. secondsee's landing) can override via mountHero({ scene }) /
// configureScene(). Behavior (THREE builders, the director, the deck render)
// stays in its own modules; this file is pure shape.
//
// EnvironmentDef / CameraRigDef are imported type-only from their behavior
// modules — they carry build()/stylize() closures, so they live there.
// ---------------------------------------------------------------------------

import type { EnvironmentDef } from '../environment.ts'
import type { CameraRigDef } from '../rigs.ts'

// --- deck -----------------------------------------------------------------

export interface OccCard {
  role: string
  sub: string
  note: string
  /** key into DeckContent.scenes AND the matching environment id (1:1) */
  scene: string
  joe?: boolean
}

/** the rich "field ID" content of the protagonist card, lifted out of the
 *  template literal so a host can retitle every line */
export interface JoeCardContent {
  fieldId: string // "FIELD ID — JOE"
  badge: string // "NEW HIRE"
  role: string // "WIRING TECH — RESIDENTIAL"
  site: string // "JOB 114-B · DAY 1"
  status: string // "NEEDS ASSISTANCE"
  statusKind: 'warn' | 'ok' | 'normal'
  bars: { label: string; pct: number; full?: boolean }[]
  expertEyes: string // "CONNECTED — 3 FEEDS"
  expertKind: 'warn' | 'ok' | 'normal'
  foot: string // "CLAUDE CODE FOR DIY IRL"
}

export interface DeckTimings {
  shuffleMs: number
  crossfadeSeconds: number
  joeEveryNth: number
}

export interface DeckContent {
  /** occupation key → inline SVG backdrop (keys match environment ids) */
  scenes: Record<string, string>
  occupations: OccCard[]
  joe: OccCard & { content: JoeCardContent }
  timings: DeckTimings
}

// --- labels ---------------------------------------------------------------

export interface Labels {
  // branding (absorbs the old HeroBranding)
  loaderTitle: string
  headline: string
  subline: string
  // identity
  figureName: string // nametag text ("JOE")
  section02: string // "SECTION 02"
  // director chip — the fixed words; the rig label is interpolated in
  chipFollowingPrefix: string // `FOLLOWING ${label}`
  chipAcquiringPrefix: string // `ACQUIRING ${label}`
  chipDrifting: string // "DRIFTING"
  chipManual: string // "MANUAL CONTROL"
  chipPov: string // "JOE'S POV"
  chipGuided: string // "GUIDED TO JOE"
}

// --- root -----------------------------------------------------------------

export interface SceneConfig {
  decks: DeckContent
  environments: EnvironmentDef[]
  rigs: CameraRigDef[]
  labels: Labels
}

/**
 * recursive partial — the override shape; deep-merged against the defaults.
 * Arrays are replaced wholesale (full element type); objects merge key-by-key.
 */
export type DeepPartial<T> = T extends unknown[]
  ? T // arrays replaced wholesale — host supplies a full array
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T
