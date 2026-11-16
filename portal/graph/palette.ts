// ---------------------------------------------------------------------------
// The money map's palette, read at build time from the design token source:
// the web's colour roles and chart colours through the generated
// src/tokens.generated.ts (the values tokens.css draws, web overrides
// included), and the industry hues and party dots from
// docs/design/design-tokens.json. esbuild inlines them, so a scene is coloured
// without a stylesheet and buildGraph stays pure for the Node smoke test; the
// page's chrome reads the same values as tokens.css custom properties
// (--chart-industry-*, --party-*, --paper). This module holds no colour of
// its own.
//
// One hue per industry cluster, plus an ink darkened for 4.5:1 text on the
// paper surface. Party nodes override their cluster hue with their party's
// dot (carried per node in money.json, which the exporter takes from the same
// source), so the central 'parties' territory is a neutral grey holding
// individually coloured spheres.
// ---------------------------------------------------------------------------

import { chart, party } from '../../docs/design/design-tokens.json'
import { chart as webChart, light } from '../src/tokens.generated.ts'

export type ClusterColour = { colour: string; ink: string }

/** The paper the scene is drawn on: the clear colour and the fog. */
export const SURFACE: string = light.paper
/** The selection accent: the web's chart mark (bronze), for rings, paths and the scrub. */
export const ACCENT: string = webChart.mark
/** Bronze ink: the explain scene's guides, rules and gauge tracks. */
export const BRONZE_INK: string = light.bronzeInk
/** The grants hub and its flows: public money, in the money accent's ink. */
export const GRANTOR_COLOUR: string = light.moneyInk
/** The Commonwealth contracts hub: the second public-money source, in the teal bills ink. */
export const CONTRACTOR_COLOUR: string = light.billsInk
/** The public-money territory: both inks are text-safe on paper, so the hue is its own ink. */
export const PUBLIC_MONEY: ClusterColour = { colour: GRANTOR_COLOUR, ink: GRANTOR_COLOUR }

/**
 * Cluster order fixes palette slots AND the legend order: the token source
 * keeps chart.industry in legend order, largest clusters first, with
 * 'parties' leading because it is the map's centre.
 */
export const CLUSTER_COLOURS: ReadonlyMap<string, ClusterColour> = new Map(
  Object.entries(chart.industry)
    .filter((entry): entry is [string, ClusterColour] => typeof entry[1] === 'object')
    .map(([cluster, { colour, ink }]) => [cluster, { colour, ink }]),
)

const FALLBACK: ClusterColour = CLUSTER_COLOURS.get('other')!

export function clusterColour(group: string): ClusterColour {
  return CLUSTER_COLOURS.get(group) ?? FALLBACK
}

/** The shared dot for every party without one of its own. */
export const PARTY_OTHER = party.other.dot

/**
 * A party's dot by its money.json label, for a node exported without a
 * colour. The same mapping the exporters use (scripts/export_money_graph.py);
 * every other party shares the muted 'other' dot, which is why a party's
 * colour is never drawn without its name.
 */
const PARTY_DOTS: Readonly<Record<string, string>> = {
  'Labor': party.labor.dot,
  'Liberal': party.liberal.dot,
  'Nationals': party.nationals.dot,
  'LNP': party.lnp.dot,
  'Greens': party.greens.dot,
  'One Nation': party.oneNation.dot,
  'Independent': party.independent.dot,
}

export function partyDot(label: string | undefined): string {
  return (label && PARTY_DOTS[label]) || PARTY_OTHER
}
