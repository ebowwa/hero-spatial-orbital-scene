// ---------------------------------------------------------------------------
// default UI labels — branding, identity, and the director's chip words.
// Every visible string that isn't generated from a registry lives here so a
// host can retitle the scene without rewriting the DOM.
// ---------------------------------------------------------------------------

import type { Labels } from './types.ts'

export const DEFAULT_LABELS: Labels = {
  // branding (the old HeroBranding fields)
  loaderTitle: 'IMTA / XR-04',
  headline: 'A figure made<br />of fragments.',
  subline:
    'An XR capture in flight — the camera orbits the specimen.<br />Grab the scene to take control. Let go, and the camera resumes.',

  // identity
  figureName: 'JOE',
  section02: 'SECTION 02',

  // director chip — the rig label is interpolated onto the prefixes
  chipFollowingPrefix: 'FOLLOWING',
  chipAcquiringPrefix: 'ACQUIRING',
  chipDrifting: 'DRIFTING',
  chipManual: 'MANUAL CONTROL',
  chipPov: "JOE'S POV",
  chipGuided: 'GUIDED TO JOE',
}
