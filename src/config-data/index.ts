// ---------------------------------------------------------------------------
// scene config — the single aggregated default a host overrides via
// mountHero({ scene }) / configureScene() (override wiring is the next
// step; the defaults here are already the source of truth for the
// environment registry, and the deck/labels/rigs data mirrors the behavior
// modules byte-for-byte).
// ---------------------------------------------------------------------------

import type { SceneConfig } from './types.ts'
import { DEFAULT_DECKS } from './decks.ts'
import { DEFAULT_ENVIRONMENTS } from './environments.ts'
import { DEFAULT_LABELS } from './labels.ts'
import { DEFAULT_RIGS } from './rigs.ts'

export const sceneConfig: SceneConfig = {
  decks: DEFAULT_DECKS,
  environments: DEFAULT_ENVIRONMENTS,
  rigs: DEFAULT_RIGS,
  labels: DEFAULT_LABELS,
}

export * from './types.ts'
