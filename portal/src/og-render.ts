// Rendering an OgCard to PNG inside the Worker: satori lays the tree out with
// yoga and returns SVG, resvg rasterises it. Both engines are wasm, imported
// as compiled modules (wrangler's CompiledWasm rule) and instantiated once
// per isolate on first use. The fonts arrive from the caller (index.ts reads
// them through the ASSETS binding and memoises the bytes).

import satori, { init as initSatori } from 'satori/wasm'
import initYoga from 'yoga-wasm-web'
import yogaWasm from 'yoga-wasm-web/dist/yoga.wasm'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm'
import { OG_HEIGHT, OG_WIDTH, cardTree, type OgCard } from './og'

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

export async function renderOgPng(card: OgCard, fonts: OgFont[]): Promise<Uint8Array> {
  await ensureEngines()
  const svg = await satori(cardTree(card) as never, { width: OG_WIDTH, height: OG_HEIGHT, fonts })
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } })
  const png = resvg.render().asPng()
  resvg.free()
  return png
}
