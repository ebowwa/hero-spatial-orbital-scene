import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { embedConfig } from './embed.ts'

// ---------------------------------------------------------------------------
// loading — manager, loader, the on-screen loader, and the glb helper
//
// Progress is byte-based: the LoadingManager's item-count progress jumps
// 0 -> 33 -> 100 across three assets (and straight to 100 on a warm cache),
// which left the bar dead for seconds and then flashing through. The GLB
// ProgressEvents carry loaded/total bytes; aggregating them gives the bar
// something honest to do while the 6MB drone model streams.
// ---------------------------------------------------------------------------

const loaderEl = document.querySelector<HTMLDivElement>('#loader')!
const loaderFill = document.querySelector<HTMLDivElement>('#loader-fill')!
const loaderPct = document.querySelector<HTMLDivElement>('#loader-pct')!
const loaderStatus = document.querySelector<HTMLDivElement>('#loader-status')!

const fileProgress = new Map<string, { loaded: number; total: number }>()
const loaderShownAt = performance.now()

// hybrid progress: bytes stream smoothly on a cold network, but the host
// page preloads the GLBs, so fetches often complete at once from cache —
// and the wall-clock gap is then the main-thread GLB PARSE, which has no
// progress events. Items-done (each = fetch + parse of one model) puts a
// step in the bar per rig, and the status line names the rig in flight.
function fileLabel(url: string): string {
  const base = url.split('/').pop() ?? url
  if (base.startsWith('person')) return 'FIGURE'
  if (base.startsWith('dji')) return 'DRONE'
  if (base.startsWith('camera')) return 'CAMERA'
  return base.replace(/\.glb$/i, '').slice(0, 10).toUpperCase()
}

function paintProgress() {
  let loaded = 0
  let total = 0
  let done = 0
  let inflight = ''
  for (const [url, p] of fileProgress) {
    loaded += p.loaded
    if (p.total > 0) total += p.total
    if (p.total > 0 && p.loaded >= p.total) done++
    else if (!inflight) inflight = fileLabel(url)
  }
  const count = fileProgress.size
  const bytePct = total > 0 ? Math.min(loaded / total, 1) : 0
  const itemPct = count > 0 ? done / count : 0
  const pct = Math.round(Math.max(bytePct, itemPct) * 100)
  loaderFill.style.width = `${pct}%`
  loaderPct.textContent = `${pct}%`
  loaderStatus.textContent =
    pct >= 100 ? 'LIVE' : inflight ? `LINKING ${inflight}` : 'CONNECTING RIGS'
}

const manager = new THREE.LoadingManager()
manager.onProgress = paintProgress // item completions refresh too

const gltfLoader = new GLTFLoader(manager)

export function loadGlb(url: string): Promise<GLTF> {
  // hosts mounting under a sub-path (or off a CDN) set assetBase via
  // mountHero(); '' keeps the site-root URLs unchanged
  const resolved = embedConfig.assetBase
    ? embedConfig.assetBase + url.replace(/^\//, '')
    : url
  fileProgress.set(resolved, { loaded: 0, total: 0 })
  return new Promise((resolve, reject) => {
    // name the asset in the error — a 404 here usually means the host's
    // copied assets drifted from the pinned hero version
    gltfLoader.load(
      resolved,
      resolve,
      (ev) => {
        // total is 0 unless the server sends content-length
        const p = fileProgress.get(resolved)!
        p.loaded = ev.loaded
        p.total = ev.total
        paintProgress()
      },
      () => reject(new Error(`failed to load ${resolved}`)),
    )
  })
}

let hid = false
export function hideLoader() {
  if (hid) return
  hid = true
  loaderFill.style.width = '100%'
  loaderPct.textContent = '100%'
  loaderStatus.textContent = 'LIVE'
  // hold the completed state briefly so a warm-cache load reads as a beat,
  // not a strobe; skip the hold entirely if the loader barely painted
  const hold = performance.now() - loaderShownAt < 300 ? 0 : 350
  window.setTimeout(() => {
    loaderEl.classList.add('done')
    // staged HUD entrance (see style.css: *.hero-live reveal rules)
    document
      .querySelectorAll('.hud-copy h1, .hud-copy p, #mode-chip, #feeds .feed-box, #nametag')
      .forEach((el) => el.classList.add('hero-live'))
  }, hold)
}

export function markLoadFailed() {
  loaderPct.textContent = 'FAILED TO LOAD ASSETS'
  loaderStatus.textContent = 'CHECK ASSET PATHS'
}
