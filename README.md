# hero-spatial-orbital-scene

A Three.js **spatial hero scene**: orbital camera rigs — a drone, a camera, and Joe's glasses-mounted POV — film a figure ("Joe") standing in a swappable, crossfade-blendable environment. Built as an interactive landing hero with a scroll story, a card deck, and live picture-in-picture camera feeds.

Originally `imta-landing`; renamed when it became the reusable hero for the **secondsee** landing. Standalone it's a Vite app; it also exports a `mountHero()` embed entry so a host page (e.g. secondsee's React landing) can mount it as a component without the host editing this repo.

## Run

| Command | What it does |
| --- | --- |
| `npm install` | install dependencies |
| `npm run dev` | Vite dev server (default http://localhost:5173) |
| `npm run build` | `tsc && vite build` → `dist/` |
| `npm run preview` | preview the production build |

Debug hooks (query params / keys): `?env=<id>` picks an environment (`void` / `grid-hall` / `dusk` + the role scenes `circuit` / `pegboard` / `wood` / `solar` / `mural` / `vent`); `?mesh=a,b,t` holds a static blend of two; `?scroll=0.75` jumps the scroll story; `e` cycles environments; `c` skips to the next rig. The key hooks and the `window.env` console playground are standalone-only — embedded mounts default them off (`debugKeys`).

## Architecture

The app is split into focused modules under `src/`:

| Module | Responsibility |
| --- | --- |
| `main.ts` | standalone entry — boots the app |
| `hero.ts` | embed entry — `mountHero(container, options?)` |
| `embed.ts` | host-settable config (`debugKeys`, `maxPixelRatio`, `autoPause`, `assetBase`) written by `mountHero` before boot |
| `engine.ts` | renderer / scene / camera / composer / env map / scratch pool / resize |
| `environment.ts` | environment manager (crossfade/blend) + builders — prop kit and palette-driven scene builders |
| `config-data/` | the default scene content as data — environments (palettes), deck cards, labels, rigs — aggregated in `sceneConfig`; the host override layer plugs in here |
| `figure.ts` | the person model ("Joe") — normalize + materials |
| `rigs.ts` | camera-rig registry (drone, camera, glasses POV) |
| `flyers.ts` | the flying rigs, per-frame choreography, PiP feed compositing |
| `choreography.ts` | the de-synced flight + look-target splines |
| `director.ts` | camera state machine (follow / blend / drag / wander / scroll) + scroll story |
| `deck.ts` | the HTML card carousel (occupation cards, from `config-data`); drives the world as cards front |
| `nametag.ts` | the head-tracking name chip |
| `loading.ts` | loader UI + GLB loading |

## Embedding (`mountHero`)

The scene is **dual-mode**: standalone (`index.html` → `main.ts`) boots itself exactly as before; a host can mount it on demand. No module in this repo had to change to enable that — standalone is byte-identical.

```ts
// import path depends on how the host consumes this repo
// (submodule path, workspace package, or installed dependency)
import { mountHero } from './src/hero.ts'

const hero = await mountHero(document.getElementById('hero-root')!, {
  debugKeys: false,    // default when embedded — 'e'/'c' keys + window.env off
  maxPixelRatio: 1,    // renderer cap; standalone default is 1.5
  autoPause: true,     // default — loop stops while the canvas is offscreen
  assetBase: '/',      // default — sub-path or CDN prefix for the GLBs
  branding: {          // loader wordmark + HUD copy, no post-boot DOM surgery
    loaderTitle: 'SECONDSEE / LIVE PERCEPTION',
    headline: 'Every angle.<br />Expert insight.',
    subline: 'Grab the scene to take control.<br />Scroll to learn more',
  },
})

// the handle — runtime levers for the host
hero.environments()                 // ['void', 'grid-hall', 'dusk', 'circuit', ...]
hero.setEnvironment('dusk', 2)      // crossfade (scenes-by-role, see below)
hero.setPaused(true)                // explicit loop stop (autoPause covers offscreen)
const off = hero.onScrollProgress((p) => { /* 0..1 scroll story progress */ })
hero.getScrollRange()               // px of scrollY over which the story runs
```

`mountHero(container, options?)` injects the hero markup into the container, then dynamically imports the app so its modules boot against the injected DOM. Options land in `embed.ts` config before any app module evaluates, so they apply from the first frame. See **`embed-smoke.html`** for a working in-repo example — open it via the dev server at `/embed-smoke.html`; the scene should match the standalone build.

**Scenes by role** — the role scenes are places, not wallpaper: each is real geometry (studs and lumber, panel cabinets with conduit, scaffold, duct runs, racked panels) built by a palette-driven builder in `environment.ts`, with its palette exported from `config-data/environments.ts` so a host retunes colors without THREE code. The deck drives the world automatically — when a card fronts, the scene crossfades to the matching environment (ids are 1:1 with the deck's scene keys). Hosts can also steer it explicitly via `hero.setEnvironment(id)`. Next up for the override layer: `mountHero({ scene })` deep-merge over `sceneConfig` (`config-data/index.ts`).

**Host contract:**
- GLB assets load from `/assets/...` by default — the host must serve `public/assets/{camera,dji_3_mini_pro,person}.glb`, or pass `assetBase` for a sub-path/CDN. Keep copies in sync when bumping the pin; a drifted asset now fails loudly with the URL named in the console.
- The hero's CSS is page-global (`#scene` is `position: fixed`; `html`/`body` styles apply host-wide) — the host scopes it at build time (see the secondsee landing's `hero-css-scope` vite plugin); the hero side stays byte-identical.
- Touch scrolling works out of the box: the canvas is `touch-action: pan-y` (vertical swipes scroll the page, horizontal drags orbit).

**Current limits (single-mount, by design):**
- The hero mounts once and lives for the page lifetime — no unmount/remount or full resource teardown yet (a landing hero isn't unmounted). `setPaused` covers the offscreen case; graduate to an init-based lifecycle if mount/unmount on navigation becomes a thing.

## Status

Hero for the secondsee landing. The standalone scene is the source of truth and stays sovereign here; `mountHero` is the bridge for bringing it into secondsee as a real React hero (shared page scroll, navbar sliding over it). That host-side wiring is the next integration step.
