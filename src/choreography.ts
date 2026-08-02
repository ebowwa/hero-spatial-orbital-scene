import * as THREE from 'three'
import { MODEL_HEIGHT } from './engine.ts'

// ---------------------------------------------------------------------------
// choreography — two de-synced closed splines:
// one for where a camera IS, one for what it looks AT
// ---------------------------------------------------------------------------

function v(x: number, y: number, z: number) {
  return new THREE.Vector3(x, y, z)
}

export let pathCurve: THREE.CatmullRomCurve3
export let targetCurve: THREE.CatmullRomCurve3

export function buildChoreography(halfArmSpan: number) {
  const h = MODEL_HEIGHT
  const a = halfArmSpan

  pathCurve = new THREE.CatmullRomCurve3(
    [
      v(0.0, 0.62 * h, 3.0 * h), // wide frontal reveal
      v(0.65 * h, 0.52 * h, 1.15 * h), // close on the torso
      v(a * 1.35, 0.86 * h, 0.75), // out along the outstretched arm
      v(0.35 * h, 1.0 * h, 0.85 * h), // tight on the head
      v(-0.85 * h, 0.74 * h, -1.25 * h), // sweep behind, left
      v(0.0, 1.25 * h, -2.0 * h), // high rear, looking down
      v(-0.6 * h, 0.16 * h, 1.15 * h), // low across the legs
      v(0.1 * h, 0.08 * h, 2.1 * h), // ground-level front
    ],
    true,
    'centripetal',
    0.4,
  )

  targetCurve = new THREE.CatmullRomCurve3(
    [
      v(0, 0.55 * h, 0), // hips/chest
      v(a * 0.85, 0.86 * h, 0), // right hand
      v(0, 0.94 * h, 0), // head
      v(-a * 0.5, 0.8 * h, 0), // left arm
      v(0, 0.3 * h, 0), // legs
    ],
    true,
    'centripetal',
    0.5,
  )
}
