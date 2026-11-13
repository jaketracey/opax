// The part of home-data.js the Worker imports (src/index.ts, the homepage map card).
export interface MapFallbackGraph {
  nodes?: { id: string; kind?: string }[];
  edges?: { source: string; total?: number; grant?: unknown; flow?: unknown }[];
  meta?: { coverage?: string };
}
export function mapSpan(meta: { coverage?: string } | null | undefined): string;
export function mapFallbackHTML(graph: MapFallbackGraph | null | undefined): string;
