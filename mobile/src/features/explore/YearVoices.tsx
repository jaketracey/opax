import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { isPartyLabel } from '../../design/party';
import {
  PartyLabel,
  PersonRow,
  SectionHeader,
  SourceLine,
  Text,
} from '../../design/primitives';
import { minimumTarget, rhythm } from '../../design/tokens';
import { personRoute, partyRoute } from '../../navigation/routes/people';
import { CachedPortrait } from '../CachedPortrait';
import { partyName } from '../reports/model';
import {
  rosterMatch,
  speechesText,
  voicesDebates,
  voicesNote,
  type Year,
} from './model';
import { yearSource, type YearMeta } from './YearBrief';

/** Up to six speakers with at least two speeches, by count, ties by name. */
export function yearVoices(data: Year) {
  return data.voices.speakers
    .filter((s) => s.speeches >= 2)
    .sort((a, b) => b.speeches - a.speeches || a.name.localeCompare(b.name))
    .slice(0, 6);
}
export interface RosterLookup {
  people: readonly { name: string }[];
  slugs: Readonly<Record<string, string>>;
}

/**
 * The year's most-heard speakers in its sampled debates. A parliamentarian
 * (an exact, unique roster name) is a person row; anyone else is text.
 */
export function YearVoices({
  data,
  meta,
  roster,
}: {
  data: Year;
  meta: YearMeta;
  roster: RosterLookup | null;
}) {
  const voices = yearVoices(data);
  if (!voices.length) return null;
  const debates = voicesDebates(data);
  return (
    <View style={{ gap: rhythm.block }}>
      <SectionHeader title="Voices" />
      {debates ? (
        <Text wordSafe variant="secondary">
          {debates}
        </Text>
      ) : null}
      <View>
        {voices.map((voice) => {
          const slug = roster
            ? rosterMatch(voice.name, roster.people, roster.slugs)
            : null;
          const party = voice.party ? partyName(voice.party) : null;
          return slug ? (
            <PersonRow
              key={voice.name}
              name={voice.name}
              portrait={<CachedPortrait name={voice.name} slug={slug} />}
              party={party}
              detail={speechesText(voice.speeches)}
              href={personRoute(slug, voice.name)}
              menu="person"
            />
          ) : (
            <View
              key={voice.name}
              accessible
              accessibilityLabel={[
                voice.name,
                party,
                speechesText(voice.speeches),
              ]
                .filter(Boolean)
                .join(', ')}
              accessibilityActions={
                isPartyLabel(party)
                  ? [{ name: 'party', label: `Open ${party} party page` }]
                  : []
              }
              onAccessibilityAction={(event) => {
                if (
                  event.nativeEvent.actionName === 'party' &&
                  party &&
                  isPartyLabel(party)
                )
                  router.push(partyRoute(party));
              }}
              style={styles.plain}
            >
              <Text wordSafe variant="name">
                {voice.name}
              </Text>
              {party ? (
                <View style={styles.party}>
                  <PartyLabel party={party} linked nested compact />
                </View>
              ) : null}
              <Text wordSafe variant="secondary">
                {speechesText(voice.speeches)}
              </Text>
            </View>
          );
        })}
      </View>
      <SourceLine
        {...yearSource(data, meta, [voicesNote(data)])}
        testID="tm-voices-as-at"
      />
    </View>
  );
}
const styles = StyleSheet.create({
  plain: {
    minHeight: minimumTarget,
    paddingVertical: rhythm.tight,
    gap: rhythm.line,
    justifyContent: 'center',
  },
  party: { minHeight: minimumTarget },
});
