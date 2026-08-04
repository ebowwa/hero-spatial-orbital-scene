// ---------------------------------------------------------------------------
// default deck content — the occupation cards, the protagonist's "field ID"
// card, the per-occupation SVG backdrops, and the shuffle/crossfade timings.
// Scene keys match environment ids 1:1 so the deck can drive the 3D world.
// ---------------------------------------------------------------------------

import type { DeckContent } from './types.ts'

export const DEFAULT_DECKS: DeckContent = {
  // scene backdrops — small inline SVG worlds, one per occupation
  scenes: {
    circuit: `<svg viewBox="0 0 280 84" preserveAspectRatio="xMidYMid slice"><rect width="280" height="84" fill="#04222b"/><defs><pattern id="grid" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0v14" fill="none" stroke="#0e3540" stroke-width="0.7"/></pattern></defs><rect width="280" height="84" fill="url(#grid)"/><path d="M24 64h56V44h40V28h48v-8h40" stroke="#6ff2ff" fill="none" stroke-width="1.5" opacity="0.85"/><path d="M60 76h40v-14h52" stroke="#ffb35c" fill="none" stroke-width="1.2" opacity="0.7"/><circle cx="24" cy="64" r="3" fill="#6ff2ff"/><circle cx="208" cy="20" r="3" fill="#ffb35c"/><circle cx="152" cy="62" r="2.5" fill="#ffb35c"/></svg>`,
    pegboard: `<svg viewBox="0 0 280 84" preserveAspectRatio="xMidYMid slice"><rect width="280" height="84" fill="#0a2530"/><defs><pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="1.6" fill="#12505f"/></pattern></defs><rect width="280" height="84" fill="url(#dots)"/><path d="M108 20l10 10-6 6 26 26 8-8-26-26 6-6z" fill="#6ff2ff" opacity="0.9"/><path d="M160 24h14v8h-14z M164 32h6v30h-6z" fill="#ffb35c" opacity="0.9"/><rect x="196" y="52" width="46" height="7" rx="3" fill="#8a5a2b"/><rect x="232" y="42" width="10" height="17" rx="2" fill="#5d8b93"/></svg>`,
    wood: `<svg viewBox="0 0 280 84" preserveAspectRatio="xMidYMid slice"><rect width="280" height="84" fill="#1d130a"/><rect y="0" width="280" height="20" fill="#2b1c0e"/><rect y="22" width="280" height="20" fill="#332213"/><rect y="44" width="280" height="20" fill="#241708"/><rect y="66" width="280" height="18" fill="#2e1e0f"/><path d="M10 10q40 4 90 0t110 2 M30 32q50 5 100 0t120 2 M10 54q60 4 110 0t130 2 M40 74q40 3 90 0t110 1" stroke="#4a3a2a" stroke-width="1" fill="none" opacity="0.8"/><path d="M196 16l60 52-8 6-58-52z" fill="#5d8b93" opacity="0.85"/><rect x="188" y="12" width="14" height="10" rx="2" fill="#8a5a2b"/></svg>`,
    solar: `<svg viewBox="0 0 280 84" preserveAspectRatio="xMidYMid slice"><rect width="280" height="84" fill="#06303a"/><circle cx="236" cy="20" r="11" fill="#ffb35c" opacity="0.95"/><circle cx="236" cy="20" r="17" fill="#ffb35c" opacity="0.15"/><path d="M-10 84 L120 26 L290 84 Z" fill="#082832"/><g transform="translate(104 36) skewX(-38)"><rect width="120" height="34" fill="#0b3d4d" stroke="#175060"/><path d="M0 11.3h120 M0 22.6h120 M24 0v34 M48 0v34 M72 0v34 M96 0v34" stroke="#175060" stroke-width="1"/><rect width="120" height="8" fill="#ffffff" opacity="0.05"/></g></svg>`,
    mural: `<svg viewBox="0 0 280 84" preserveAspectRatio="xMidYMid slice"><rect width="280" height="84" fill="#1c2a30"/><defs><pattern id="brick" width="36" height="18" patternUnits="userSpaceOnUse"><path d="M0 0h36M0 18h36M18 0v9M0 9v9M36 9v9" stroke="#0f1c22" stroke-width="1.4" fill="none"/></pattern></defs><rect width="280" height="84" fill="url(#brick)"/><path d="M-10 66 Q50 26 110 46 T290 34" stroke="#6ff2ff" stroke-width="11" fill="none" opacity="0.5" stroke-linecap="round"/><path d="M-10 44 Q70 68 150 40 T290 56" stroke="#ffb35c" stroke-width="7" fill="none" opacity="0.45" stroke-linecap="round"/><path d="M40 84 Q90 50 160 62 T290 48" stroke="#ff5a8a" stroke-width="5" fill="none" opacity="0.4" stroke-linecap="round"/></svg>`,
    vent: `<svg viewBox="0 0 280 84" preserveAspectRatio="xMidYMid slice"><rect width="280" height="84" fill="#0a2530"/><g><rect x="30" y="10" width="220" height="8" rx="4" fill="#12505f"/><rect x="30" y="24" width="220" height="8" rx="4" fill="#0e4250"/><rect x="30" y="38" width="220" height="8" rx="4" fill="#12505f"/><rect x="30" y="52" width="220" height="8" rx="4" fill="#0e4250"/><rect x="30" y="66" width="220" height="8" rx="4" fill="#12505f"/></g><path d="M60 0v84 M140 0v84 M220 0v84" stroke="#082832" stroke-width="2" opacity="0.6"/></svg>`,
  },

  occupations: [
    { role: 'DIY MAKER', sub: 'first real build', note: 'a mentor watching every cut', scene: 'pegboard' },
    { role: 'CARPENTER', sub: 'apprentice — week 2', note: 'measure twice, verified once', scene: 'wood' },
    { role: 'SOLAR INSTALLER', sub: 'trainee — week 1', note: 'onboarded before the ladder goes up', scene: 'solar' },
    { role: 'MURALIST', sub: 'first commissioned wall', note: 'composition notes from artists who\'ve been there', scene: 'mural' },
    { role: 'ELECTRICIAN', sub: 'apprentice — day 3', note: 'expert eyes reviewing panel work', scene: 'circuit' },
    { role: 'HVAC TECH', sub: 'new hire — day 1', note: 'guided install, step by step', scene: 'vent' },
  ],

  joe: {
    role: 'WIRING TECH',
    sub: 'this is joe — day 1',
    note: 'three feeds watching his back',
    scene: 'circuit',
    joe: true,
    content: {
      fieldId: 'FIELD ID — JOE',
      badge: 'NEW HIRE',
      role: 'WIRING TECH — RESIDENTIAL',
      site: 'JOB 114-B · DAY 1',
      status: 'NEEDS ASSISTANCE',
      statusKind: 'warn',
      bars: [
        { label: 'EXPERIENCE', pct: 12 },
        { label: 'TRAINING', pct: 34 },
        { label: 'COVERAGE', pct: 100, full: true },
      ],
      expertEyes: 'CONNECTED — 3 FEEDS',
      expertKind: 'ok',
      foot: 'CLAUDE CODE FOR DIY IRL',
    },
  },

  timings: {
    shuffleMs: 3400,
    crossfadeSeconds: 1.8,
    joeEveryNth: 3,
  },
}
