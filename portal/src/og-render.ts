// Rendering an OgCard to PNG inside the Worker: satori lays the tree out with
// yoga and returns SVG, resvg rasterises it. Both engines are wasm, imported
// as compiled modules (wrangler's CompiledWasm rule) and instantiated once
// per isolate on first use. The fonts arrive from the caller (index.ts reads
// them through the ASSETS binding and memoises the bytes).

import { encode } from 'jpeg-js'
import satori, { init as initSatori } from 'satori/wasm'
import initYoga from 'yoga-wasm-web'
import yogaWasm from 'yoga-wasm-web/dist/yoga.wasm'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm'
import { ogLayout, storySlideTree, PORTRAIT_WIDTH, PORTRAIT_HEIGHT, type OgCard, type OgFormat, type StoryImages } from './og'
import type { StorySlide } from './story'

export interface OgFont {
  name: string
  data: ArrayBuffer
  weight: 400 | 600 | 700
  style: 'normal' | 'italic'
}

let engines: Promise<void> | null = null
function ensureEngines(): Promise<void> {
  engines ??= (async () => {
    const yoga = await initYoga(yogaWasm)
    initSatori(yoga)
    await initWasm(resvgWasm)
  })().catch((err) => {
    engines = null
    throw err
  })
  return engines
}

/** The card laid out at its format's size (landscape 1200x630, portrait 1080x1350), ready to rasterise. */
async function rasterise(card: OgCard, fonts: OgFont[], format: OgFormat): Promise<InstanceType<typeof Resvg>> {
  await ensureEngines()
  const layout = ogLayout(format)
  const svg = await satori(layout.tree(card) as never, { width: layout.width, height: layout.height, fonts })
  return new Resvg(svg, { fitTo: { mode: 'width', value: layout.width } })
}

export async function renderOgPng(card: OgCard, fonts: OgFont[], format: OgFormat = 'landscape'): Promise<Uint8Array> {
  const resvg = await rasterise(card, fonts, format)
  const rendered = resvg.render()
  try { return rendered.asPng() } finally { rendered.free(); resvg.free() }
}

/** Instagram requires JPEG. Use the same card and fonts as the link preview. */
export async function renderOgJpeg(card: OgCard, fonts: OgFont[], format: OgFormat = 'landscape'): Promise<Uint8Array> {
  const resvg = await rasterise(card, fonts, format)
  const rendered = resvg.render()
  try {
    return new Uint8Array(encode({ data: rendered.pixels, width: rendered.width, height: rendered.height }, 90).data)
  } finally { rendered.free(); resvg.free() }
}

/** One slide of a story (src/story.ts) as the JPEG Instagram fetches, 1080x1350. */
export async function renderStoryJpeg(slide: StorySlide, images: StoryImages, fonts: OgFont[]): Promise<Uint8Array> {
  await ensureEngines()
  const svg = await satori(storySlideTree(slide, images) as never, { width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT, fonts })
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: PORTRAIT_WIDTH } })
  const rendered = resvg.render()
  try {
    return new Uint8Array(encode({ data: rendered.pixels, width: rendered.width, height: rendered.height }, 90).data)
  } finally { rendered.free(); resvg.free() }
}
