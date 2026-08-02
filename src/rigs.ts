import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

// ---------------------------------------------------------------------------
// camera-rig primitive
//
// A CameraRigDef is everything needed to turn a GLB into a flyable "camera"
// for the drone system: normalize it to a world size, face it down -Z (the
// drone group's look direction), optionally restyle its materials, and mark
// its lens. Add a new entry to CAMERA_RIGS and it becomes swappable at
// runtime — the choreography, spotlight, PiP feed, and follow/free modes all
// operate on the drone group and don't care which rig is attached.
// ---------------------------------------------------------------------------

export interface CameraRigDef {
  /** unique id, used by swap logic */
  id: string
  /** HUD label */
  label: string
  /** GLB url (served from public/) */
  url: string
  /** max world-space dimension after normalization */
  size: number
  /** lens glow-dot position in rig-local units (after normalization) */
  lensOffset: [number, number, number]
  lensRadius?: number
  lensColor?: number
  /** yaw (radians) to bring the model's front onto -Z */
  rotationY?: number
  /** no GLB — the rig lives on the figure's face (glasses POV camera) */
  virtual?: boolean
  /** optional per-rig material treatment, applied after defaultStylize */
  stylize?: (root: THREE.Group) => void
}

type GlbLoader = (url: string) => Promise<GLTF>

/** neutral treatment every rig gets: kill self-lit materials, tame env light */
function defaultStylize(root: THREE.Group) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mat = obj.material as THREE.MeshStandardMaterial
      if (mat && mat.isMeshStandardMaterial) {
        if (mat.emissiveMap) {
          mat.emissive.setScalar(0)
          mat.emissiveMap = null
        }
        mat.envMapIntensity = 0.6
      }
    }
  })
}

export async function buildRig(def: CameraRigDef, loadGlb: GlbLoader): Promise<THREE.Group> {
  const gltf = await loadGlb(def.url)
  const rig = gltf.scene

  // normalize: uniform scale so the largest dimension == def.size
  const box = new THREE.Box3().setFromObject(rig)
  const dims = box.getSize(new THREE.Vector3())
  rig.scale.setScalar(def.size / Math.max(dims.x, dims.y, dims.z))

  // recenter on its own origin so the drone pivots around the rig's middle
  box.setFromObject(rig)
  rig.position.sub(box.getCenter(new THREE.Vector3()))

  if (def.rotationY) rig.rotation.y = def.rotationY

  defaultStylize(rig)
  def.stylize?.(rig)

  // lens marker so the rig's facing reads from across the scene
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(def.lensRadius ?? 0.032, 16, 16),
    new THREE.MeshBasicMaterial({ color: def.lensColor ?? 0x7fdce8 }),
  )
  lens.position.set(...def.lensOffset)

  const group = new THREE.Group()
  group.name = `rig:${def.id}`
  group.add(rig, lens)
  return group
}

// ---------------------------------------------------------------------------
// the registry — new camera models go here
// ---------------------------------------------------------------------------

export const CAMERA_RIGS: CameraRigDef[] = [
  {
    id: 'blender-cam',
    label: 'BLENDER CAMERA',
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
    label: 'DRONE—TOM',
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
    label: 'GLASSES CAM',
    url: '',
    size: 0,
    virtual: true,
    lensOffset: [0, 0, 0],
  },
]
