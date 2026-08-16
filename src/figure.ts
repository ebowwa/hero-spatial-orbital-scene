import * as THREE from 'three'
import { scene, MODEL_HEIGHT } from './engine.ts'
import { loadGlb } from './loading.ts'

// ---------------------------------------------------------------------------
// the anthropoid — normalize orientation / scale / footing at runtime
// ---------------------------------------------------------------------------

const figure = new THREE.Group()
scene.add(figure)

export async function setupFigure(): Promise<number> {
  const gltf = await loadGlb('/assets/person.glb')
  const root = gltf.scene

  // normalize: stand the figure on y=0 at MODEL_HEIGHT, centered on origin
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const scale = MODEL_HEIGHT / size.y
  root.scale.setScalar(scale)

  box.setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y

  box.setFromObject(root)
  const halfArmSpan = box.getSize(new THREE.Vector3()).x / 2

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      // never frustum-cull figure meshes: the export's bounding spheres are
      // unreliable, which dropped the HAIR (and only the hair) whenever the
      // camera got close enough for the head to fill the screen — Joe went
      // bald at mid-range and during the eye dive. The figure is the subject
      // and is always in frame, so culling buys nothing anyway.
      obj.frustumCulled = false
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of mats) {
        if (mat && mat.isMeshStandardMaterial) {
          // strip any fully self-lit materials (same emissive-map trap as the
          // anthropoid) but keep the realistic PBR look — skin, cloth, glass
          if (mat.emissiveMap) {
            mat.emissive.setScalar(0)
            mat.emissiveMap = null
          }
          mat.envMapIntensity = 0.45
          // his glasses ship with OPAQUE lens materials — the scroll story's
          // eye dive ends centimeters behind that lens, so an opaque sheet
          // filled the frame where his face should be (read as a missing
          // head). Real lenses are see-through; make them translucent and
          // keep them out of the depth write so they never occlude the eye.
          if (/glass|lens/i.test(mat.name)) {
            mat.transparent = true
            mat.opacity = Math.min(mat.opacity, 0.16)
            mat.depthWrite = false
          }
        }
      }
    }
  })

  figure.add(root)
  return halfArmSpan
}

// ---------------------------------------------------------------------------
// occlusion query — the one depth question DOM tracking overlays can't answer
// themselves: is the segment from one point to another blocked by the figure?
// Used by the OC-SORT overlays so a rig flying behind Joe drops its bracket
// instead of painting the box over his body.
// ---------------------------------------------------------------------------

const occRay = new THREE.Raycaster()
const occDir = new THREE.Vector3()

/** true when the segment from→to intersects the figure before reaching `to` */
export function figureOccludes(from: THREE.Vector3, to: THREE.Vector3): boolean {
  occDir.subVectors(to, from)
  const dist = occDir.length()
  if (dist < 1e-4) return false
  occRay.set(from, occDir.normalize())
  occRay.near = 0
  occRay.far = dist - 0.05 // hits strictly closer than the target are occluders
  return occRay.intersectObject(figure, true).length > 0
}
