import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { embedConfig } from './embed.ts'

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
  // hosts mounting under a sub-path (or off a CDN) set assetBase via
  // mountHero(); '' keeps the site-root URLs unchanged
  const resolved = embedConfig.assetBase
    ? embedConfig.assetBase + url.replace(/^\//, '')
    : url
  return new Promise((resolve, reject) => {
    // name the asset in the error — a 404 here usually means the host's
    // copied assets drifted from the pinned hero version
    gltfLoader.load(resolved, resolve, undefined, () =>
      reject(new Error(`failed to load ${resolved}`)),
    )
  })
}

export function hideLoader() {
  loaderEl.classList.add('done')
}

export function markLoadFailed() {
  loaderPct.textContent = 'FAILED TO LOAD ASSETS'
}
