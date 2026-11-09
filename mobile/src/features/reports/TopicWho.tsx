import {
  InsetGroup,
  LinkRow,
  Section,
  SourceLine,
} from '../../design/primitives';
import { counted } from '../../design/format';
import { byPartyGroup } from '../../design/party-groups';
import {
  parliamentNames,
  partyName,
  type SpeechFilters,
  type decodeTopic,
} from './model';
import type { ReadMeta } from './parts';
import { PARTY_GAP_NOTE, TOPIC_CITATION, LABEL_NOTE } from './topic-copy';

type Topic = ReturnType<typeof decodeTopic>;

/**
 * "Who speaks" (specs/search.md 5.4): parties in the neutral party order,
 * then parliaments. Each row is a button that filters Speeches; the chosen
 * row carries a checkmark and tapping it again removes the filter. No row
 * pushes a route, so none draws a chevron.
 */
export function TopicWho({
  topic,
  meta,
  filters,
  onFilter,
}: {
  topic: Topic;
  meta: ReadMeta;
  filters: SpeechFilters;
  onFilter: (change: Pick<SpeechFilters, 'party' | 'state'>) => void;
}) {
  const parties = byPartyGroup(
    topic.parties.map(([code, count]) => ({
      code,
      name: partyName(code),
      count,
    })),
    (row) => row.name,
  );
  const states = topic.states.filter(([state]) => parliamentNames[state]);
  if (!parties.length && !states.length) return null;
  return (
    <Section title="Who speaks" testID="topic-who">
      {parties.length ? (
        <InsetGroup header="Parties" testID="topic-who-parties">
          {parties.map((row) => {
            // The filter keeps the facet's own value ("LNP"); the row says
            // the party's name.
            const selected = filters.party === row.code;
            return (
              <LinkRow
                key={row.code}
                title={row.name}
                value={`${counted(row.count, 'speech', 'speeches')}`}
                accessory="checkmark"
                selected={selected}
                onPress={() =>
                  onFilter({ party: selected ? undefined : row.code })
                }
                testID={`topic-party-row-${row.code}`}
              />
            );
          })}
        </InsetGroup>
      ) : null}
      {states.length ? (
        <InsetGroup header="Parliaments" testID="topic-who-parliaments">
          {states.map(([state, count]) => {
            const selected = filters.state === state;
            return (
              <LinkRow
                key={state}
                title={parliamentNames[state]!}
                value={`${counted(count, 'speech', 'speeches')}`}
                accessory="checkmark"
                selected={selected}
                onPress={() =>
                  onFilter({ state: selected ? undefined : state })
                }
                testID={`topic-state-row-${state}`}
              />
            );
          })}
        </InsetGroup>
      ) : null}
      <SourceLine
        asOf={meta.asOf}
        savedAt={meta.savedAt}
        citation={TOPIC_CITATION}
        title="About who speaks"
        notes={[PARTY_GAP_NOTE(topic.count), LABEL_NOTE]}
        testID="topic-who-source"
      />
    </Section>
  );
}
