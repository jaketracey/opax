import { View } from 'react-native';
import {
  Disclosure,
  MachinePill,
  RecordRow,
  SectionHeader,
  SourceLine,
  Text,
  type SourceDetails,
} from '../../design/primitives';
import { counted, formatDate } from '../../design/format';
import { rhythm } from '../../design/tokens';
import { docRoute } from '../../navigation/routes/records';
import { useSpeechSpeakers } from '../records/speaker';
import { partyName } from '../reports/model';
import {
  cleanSpeechTitle,
  yearMachineNote,
  yearOpening,
  type Year,
} from './model';

type Source = Year['brief']['sources'][number];
/** The year's read: dated from its file, and saved when it could not refresh. */
export interface YearMeta {
  asOf: string | null;
  savedAt: number | null;
}
/** "Hansard · Statements by Members, 10 Feb 2025" in the sheet. */
const original = (s: Source) => ({
  label: 'Hansard',
  url: `/doc/${s.slug}`,
  record: [cleanSpeechTitle(s), s.date ? formatDate(s.date, 'short') : null]
    .filter(Boolean)
    .join(', '),
  asOf: s.date,
});
/** OPAX wrote the brief and tallied the voices; the Hansard speeches are originals. */
export function yearSource(
  data: Year,
  meta: YearMeta,
  notes: string[],
): SourceDetails {
  const sources = [
    ...data.brief.sources.filter((s) => s.cited),
    ...data.brief.sources.filter((s) => !s.cited),
  ];
  return {
    asOf: meta.asOf,
    savedAt: meta.savedAt,
    citation: 'OPAX',
    originals: sources.map(original),
    notes,
  };
}
function SpeechRow({
  speech: source,
  speakerFor,
}: {
  speech: Source;
  speakerFor: ReturnType<typeof useSpeechSpeakers>;
}) {
  const title = cleanSpeechTitle(source) ?? undefined;
  return (
    <RecordRow
      meta={['Speech', source.date ? formatDate(source.date, 'short') : null]
        .filter(Boolean)
        .join(' · ')}
      title={title}
      speaker={speakerFor({
        ...source,
        party: source.party ? partyName(source.party) : null,
      })}
      href={docRoute(source.slug, title)}
      testID={`tm-speech-${source.slug}`}
    />
  );
}

/** The machine-written brief, its cited speeches and one OPAX source line. */
export function YearBrief({ data, meta }: { data: Year; meta: YearMeta }) {
  const speakerFor = useSpeechSpeakers();
  const prose = yearOpening(data.brief.answer);
  const cited = data.brief.sources.filter((s) => s.cited);
  const note = yearMachineNote(data);
  return (
    <View style={{ gap: rhythm.block }}>
      <SectionHeader title="The year in brief" />
      <MachinePill
        note={{ title: 'Machine-written', body: [note] }}
        testID="explore-machine-pill"
      />
      <Text wordSafe variant="body" testID="tm-brief">
        {prose.lead}
      </Text>
      {prose.rest.length ? (
        <Disclosure label="More" testID="tm-rest">
          <View style={{ gap: rhythm.block }}>
            {prose.rest.map((p, i) => (
              <Text key={i} wordSafe variant="body">
                {p}
              </Text>
            ))}
          </View>
        </Disclosure>
      ) : null}
      {cited.length ? (
        <View testID="tm-records">
          {cited.slice(0, 3).map((s) => (
            <SpeechRow key={s.slug} speech={s} speakerFor={speakerFor} />
          ))}
          {cited.length > 3 ? (
            <Disclosure
              label={counted(cited.length - 3, 'more speech', 'more speeches')}
            >
              <View>
                {cited.slice(3).map((s) => (
                  <SpeechRow key={s.slug} speech={s} speakerFor={speakerFor} />
                ))}
              </View>
            </Disclosure>
          ) : null}
        </View>
      ) : null}
      <SourceLine {...yearSource(data, meta, [note])} testID="tm-year-as-at" />
    </View>
  );
}
