import { useEffect, useState } from 'react';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { portraits as portraitStore } from '../../api/runtime';
import { FaceStack } from '../../design/people';
import { LinkRow } from '../../design/rows';
import type { RowMenuAction } from '../../design/row-link';
import { useAccessibilitySize } from '../../design/accessibility';

export interface FaceStackPerson {
  name: string;
  slug?: string;
}

/** Local portrait files for a face stack, in the given order; null where none. */
export function useFaceURIs(people: readonly FaceStackPerson[], max = 6) {
  const key = people
    .slice(0, max)
    .map((p) => p.slug ?? p.name)
    .join('|');
  const [found, setFound] = useState<{
    key: string;
    uris: (string | null)[];
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (!portraitStore) return;
    void Promise.all(
      people.slice(0, max).map((p) =>
        Promise.resolve(portraitStore.get({ name: p.name, slug: p.slug }))
          .then((value) => value?.localURI ?? null)
          .catch(() => null),
      ),
    ).then((uris) => {
      if (active) setFound({ key, uris });
    });
    return () => {
      active = false;
    };
    // The joined identities are the dependency; the array is rebuilt per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, max]);
  return found?.key === key ? found.uris : people.slice(0, max).map(() => null);
}

/** Family name, then the whole name: the members list's stated order. */
export function familyNameKey(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, '')
    .trim()
    .split(/\s+/);
  const family = words.length > 1 ? words[words.length - 1]! : (words[0] ?? '');
  return `${family.toLocaleLowerCase('en-AU')} ${name.toLocaleLowerCase('en-AU')}`;
}
export function byFamilyName<T>(name: (row: T) => string) {
  return (a: T, b: T) =>
    familyNameKey(name(a)).localeCompare(familyNameKey(name(b)));
}

/**
 * One row for a multi-member seat: up to six overlapping faces (four at
 * AX sizes) and "{n} senators for {State}". The faces are decorative; the
 * row reads as its title.
 */
export function FaceStackRow({
  title,
  people,
  href,
  testID,
  accessibilityHint = 'Opens the list',
  menu,
}: {
  title: string;
  /** Already in the list's order (family name, A to Z). */
  people: readonly FaceStackPerson[];
  href: Href;
  testID?: string;
  accessibilityHint?: string;
  /** Context menu items, already in sections (menuSections). */
  menu?: RowMenuAction[];
}) {
  const large = useAccessibilitySize();
  const max = large ? 4 : 6;
  const uris = useFaceURIs(people, max);
  return (
    <LinkRow
      title={title}
      leading={<FaceStack portraits={uris} max={max} />}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      href={href}
      onPress={() => router.push(href)}
      testID={testID}
      menu={menu}
    />
  );
}
