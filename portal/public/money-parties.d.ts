export const MONEY_GRAPH_PATHS: string[];
export const MONEY_PARTIES_PATH: string;
export function moneyPartiesFile(graphs: { meta?: { generated?: string; sourceShort?: string }; nodes: { label: string; kind: string; colour?: string }[] }[]): {
  files: { meta: { generated?: string; sourceShort?: string }; nodes: { label: string; kind: string; colour?: string }[] }[];
};
