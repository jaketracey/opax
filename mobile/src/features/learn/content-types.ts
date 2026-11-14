/**
 * The shapes of the generated guide (content.generated.ts). Kept apart so
 * the generated file only holds data.
 */

/** A run of text: plain words, a glossary term, or a link to a record. */
export type LearnInline<Id extends string = string> =
  | string
  | { t: string; term: Id }
  | { t: string; url: string };

export type LearnBlock<Id extends string = string> =
  | { kind: 'p'; inline: readonly LearnInline<Id>[] }
  | {
      kind: 'links';
      items: readonly {
        label: string;
        url: string;
        note: readonly LearnInline<Id>[];
      }[];
    };

/** One idea: the heading, then its paragraphs (or "See it in OPAX" links). */
export interface LearnScreen<Id extends string = string> {
  heading: string;
  blocks: readonly LearnBlock<Id>[];
}

export interface LearnChapter<Id extends string = string> {
  slug: string;
  title: string;
  order: number;
  summary: string;
  screens: readonly LearnScreen<Id>[];
}

export interface LearnTerm<Id extends string = string> {
  id: Id;
  /** The term as the guide writes it ("bill", "House of Representatives"). */
  word: string;
  /** One line, 20 words or fewer: the popover. */
  short: string;
  /** Two to four sentences: the answer sheet, after `short`. */
  more: string;
  chapter: string;
  /** A real OPAX record that shows the idea ("See it in OPAX"). */
  example?: { url: string; label: string };
  seeAlso: readonly Id[];
}

export interface LearnExample {
  id: string;
  chapter: string;
  url: string;
  label: string;
  lookAt: string;
}
