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
        }
      }
    }
  })

  figure.add(root)
  return halfArmSpan
}
