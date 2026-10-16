export function partySpeechLabel(label: string, sources?: {
  indexed?: { parties?: Record<string, number> } | null;
  roster?: { people?: { party?: string | null; speeches?: number | null }[] } | null;
  same?: (a: string, b: string) => boolean;
}): { label: string; count: number } | null;
