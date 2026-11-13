export interface RepresentationProvenance {
  representation_as_of?: string | null;
  as_of?: string | null;
  representation_observation_only?: boolean;
  representation_source?: string;
  representation_exception?: { message: string };
}
export function representationNote(row: RepresentationProvenance, formatDate?: (value: string) => string): string;
export function representationGap(row: RepresentationProvenance): string;
