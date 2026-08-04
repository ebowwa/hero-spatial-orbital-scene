// ---------------------------------------------------------------------------
// default camera-rig registry — the flyable "cameras" (a movie camera, a DJI
// drone, and the glasses-mounted POV). Labels, URLs, and the per-rig stylize
// treatment live here so a host can swap rigs or relabel a feed.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import type { CameraRigDef } from '../rigs.ts'

export const DEFAULT_RIGS: CameraRigDef[] = [
  {
    id: 'blender-cam',
    label: 'Camera',
    url: '/assets/camera.glb',
    size: 0.2,
    lensOffset: [0, 0, 0.14],
    stylize: (root) => {
      // the untextured export looks best as dark gunmetal with a cyan core
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.material = new THREE.MeshStandardMaterial({
            color: 0x11181c,
            roughness: 0.35,
            metalness: 0.9,
            emissive: 0x1a4a55,
            emissiveIntensity: 0.7,
          })
        }
      })
    },
  },
  {
    id: 'dji-mini-3-pro',
    label: "Tom's Drone",
    url: '/assets/dji_3_mini_pro.glb',
    size: 0.45,
    // model's gimbal sits on +Z — flip so it faces the drone's -Z look dir
    rotationY: Math.PI,
    lensOffset: [0, -0.03, -0.22],
    lensRadius: 0.02,
    lensColor: 0xffc36b, // DJI status-LED amber
  },
  {
    // the Ray-Ban Meta left lens is a camera — this rig is its POV,
    // mounted on the figure's face instead of flying a path
    id: 'glasses-cam',
    label: 'Joe\'s Glasses',
    url: '',
    size: 0,
    virtual: true,
    lensOffset: [0, 0, 0],
    lensColor: 0xff5a4a, // recording-LED red
  },
]
