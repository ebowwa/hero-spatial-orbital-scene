import * as THREE from 'three'
import { viewCam, MODEL_HEIGHT } from './engine.ts'

// ---------------------------------------------------------------------------
// name tag — HTML chip projected onto the figure's head position
// ---------------------------------------------------------------------------

const nametagEl = document.querySelector<HTMLDivElement>('#nametag')!
const nametagWorld = new THREE.Vector3(0, MODEL_HEIGHT * 1.06, 0)
const nametagProj = new THREE.Vector3()

export function updateNametag() {
  nametagProj.copy(nametagWorld).project(viewCam)
  if (nametagProj.z > 1) {
    nametagEl.style.display = 'none' // behind the camera
    return
  }
  nametagEl.style.display = 'block'
  nametagEl.style.left = `${(nametagProj.x * 0.5 + 0.5) * window.innerWidth}px`
  nametagEl.style.top = `${(-nametagProj.y * 0.5 + 0.5) * window.innerHeight}px`
}
