// ---------------------------------------------------------------------------
// card deck — joe's field ID + the trades the platform onboards.
// every card has its own scene backdrop instead of flat blue.
// Content (cards, joe's field ID, SVG backdrops, timings) lives in
// config-data/decks.ts so a host can retitle the deck via the scene-config
// override layer.
// ---------------------------------------------------------------------------

import { transitionTo } from './environment.ts'
import { sceneConfig } from './config-data/index.ts'
import type { OccCard, JoeCardContent } from './config-data/types.ts'

const deckContent = sceneConfig.decks
const SCENES = deckContent.scenes
const OCCUPATIONS = deckContent.occupations
const JOE_CARD = deckContent.joe

// scenes by role — the world crossfades to the front card's scene
// (environment ids match SCENES keys 1:1). Only while the deck is actually
// visible, so a hidden deck never repaints the world underneath the story.
let currentScene = JOE_CARD.scene
let lastVis = 0

function syncWorldToCard() {
  if (lastVis > 0.5) transitionTo(currentScene, deckContent.timings.crossfadeSeconds)
}

const deckEl = document.querySelector<HTMLDivElement>('#deck')!
const deckFront = document.querySelector<HTMLDivElement>('#deck-front')!
let occIdx = -1
let deckTick = 0

function joeHtml(c: JoeCardContent): string {
  const bars = c.bars
    .map(
      (b) => `
          <div class="sc-bar"><label>${b.label}</label><div class="bar${b.full ? ' full' : ''}"><i style="width:${b.pct}%"></i></div><em>${b.pct}%</em></div>`,
    )
    .join('')
  return `
      <div class="dc-joe">
        <div class="sc-head">
          <div class="sc-title">${c.fieldId}</div>
          <div class="sc-badge">${c.badge}</div>
        </div>
        <div class="sc-row"><span>ROLE</span><b>${c.role}</b></div>
        <div class="sc-row"><span>SITE</span><b>${c.site}</b></div>
        <div class="sc-row"><span>STATUS</span><b class="${c.statusKind}">${c.status}</b></div>
        <div class="sc-bars">${bars}
        </div>
        <div class="sc-row"><span>EXPERT EYES</span><b class="${c.expertKind}">${c.expertEyes}</b></div>
        <div class="sc-foot">${c.foot}</div>
      </div>`
}

function renderCard(o: OccCard) {
  currentScene = o.scene
  const sceneSvg = `<div class="dc-scene">${SCENES[o.scene]}</div>`
  deckFront.innerHTML = o.joe
    ? sceneSvg + joeHtml(JOE_CARD.content)
    : sceneSvg + `
      <div class="dc-role">${o.role}</div>
      <div class="dc-sub">${o.sub}</div>
      <div class="dc-note">${o.note}</div>`
}

function shuffleDeck() {
  deckFront.classList.add('out')
  window.setTimeout(() => {
    deckTick++
    // joe is the protagonist — his card comes back around every Nth shuffle
    if (deckTick % deckContent.timings.joeEveryNth === 0) {
      renderCard(JOE_CARD)
    } else {
      occIdx = (occIdx + 1) % OCCUPATIONS.length
      renderCard(OCCUPATIONS[occIdx])
    }
    syncWorldToCard()
    deckFront.classList.remove('out')
    deckFront.classList.add('in')
    window.setTimeout(() => deckFront.classList.remove('in'), 400)
  }, 360)
}

renderCard(JOE_CARD) // open on joe

/** scroll-driven reveal; the director computes `vis` each frame and hands it here */
export function setDeckVisibility(vis: number) {
  deckEl.style.opacity = String(vis)
  deckEl.style.transform = `translateY(${(1 - vis) * 24}px)`
  // first frame the deck is visibly on screen: catch the world up to the
  // card that's already fronting (the interval may have turned while hidden)
  const surfaced = vis > 0.5 && lastVis <= 0.5
  lastVis = vis
  if (surfaced) syncWorldToCard()
}

export function initDeck() {
  window.setInterval(shuffleDeck, deckContent.timings.shuffleMs)
}
