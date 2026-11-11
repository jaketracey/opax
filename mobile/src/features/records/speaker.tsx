import { useEffect, useState } from 'react';
import type { Roster, Slugs } from '../../api/catalog-decoders';
import { catalogs, portraits } from '../../api/runtime';
import { Portrait } from '../../design/people';
import type { RecordRowProps } from '../../design/rows';
import { personRoute } from '../../navigation/routes/people';
import { speechSpeaker, type SpeechSpeakerData } from './speech-speaker';

/** The same cached portrait as person rows, with no face when unavailable. */
export function SpeakerPortrait({
  name,
  slug,
}: {
  name: string;
  slug: string;
}) {
  const [photo, setPhoto] =
    useState<Awaited<ReturnType<typeof portraits.get>>>(null);
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => portraits.get({ name, slug }))
      .then(
        (value) => {
          if (active) setPhoto(value);
        },
        () => {
          if (active) setPhoto(null);
        },
      );
    return () => {
      active = false;
    };
  }, [name, slug]);
  return photo ? (
    <Portrait
      size="row"
      name={name}
      localURI={photo.localURI}
      official={/^\d+$/.test(photo.info.key)}
      onDisplay={(visible) => {
        if (!visible) setPhoto(null);
      }}
    />
  ) : null;
}

/** Only a verified catalogue slug creates a person link or requests a face. */
export function speakerSlot(
  name: string | null | undefined,
  party: string | null = null,
  slug?: string,
): RecordRowProps['speaker'] {
  return name
    ? {
        name,
        party,
        href: slug ? personRoute(slug, name) : undefined,
        portrait: slug ? (
          <SpeakerPortrait key={slug} name={name} slug={slug} />
        ) : undefined,
      }
    : null;
}

/** The same roster and catalogue verification used by Search, once per list. */
export function useSpeechSpeakers() {
  const [people, setPeople] = useState<{ roster: Roster; slugs: Slugs } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => Promise.all([catalogs.roster(), catalogs.slugs()]))
      .then(([roster, slugs]) => {
        if (active) setPeople({ roster: roster.data, slugs: slugs.data });
      })
      .catch(() => {
        // Keep the recorded name when either catalogue is unavailable.
      });
    return () => {
      active = false;
    };
  }, []);
  return (row: SpeechSpeakerData) => {
    const speaker = speechSpeaker(
      row,
      people?.roster ?? null,
      people?.slugs ?? null,
    );
    return speaker
      ? speakerSlot(speaker.name, speaker.party, speaker.slug)
      : null;
  };
}
