import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

// ---------------------------------------------------------------------------
// loading — manager, loader, the on-screen loader, and the glb helper
// ---------------------------------------------------------------------------

const loaderEl = document.querySelector<HTMLDivElement>('#loader')!
const loaderFill = document.querySelector<HTMLDivElement>('#loader-fill')!
const loaderPct = document.querySelector<HTMLDivElement>('#loader-pct')!

const manager = new THREE.LoadingManager()
manager.onProgress = (_url, loaded, total) => {
  const pct = Math.round((loaded / total) * 100)
  loaderFill.style.width = `${pct}%`
  loaderPct.textContent = `${pct}%`
}

const gltfLoader = new GLTFLoader(manager)

export function loadGlb(url: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject)
  })
}

export function hideLoader() {
  loaderEl.classList.add('done')
}

export function markLoadFailed() {
  loaderPct.textContent = 'FAILED TO LOAD ASSETS'
}
