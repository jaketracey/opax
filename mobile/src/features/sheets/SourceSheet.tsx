import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Appearance, Pressable, View } from 'react-native';
import { copy } from '../../design/copy';
import { hasSourcePreview, isE2E, webOrigin } from '../../design/environment';
import { calendarDate, formatDate, type DateInput } from '../../design/format';
import { InsetGroup } from '../../design/layout';
import { dark, light } from '../../design/palette';
import {
  useRowCellStyle,
  useRowHighlight,
  useRowInset,
} from '../../design/row-padding';
import { LinkRow } from '../../design/rows';
import {
  licenceText,
  sourceCitations,
  type SourceDetails,
  type SourceOriginal,
} from '../../design/source';
import { Text } from '../../design/text';
import { minimumTarget, rhythm } from '../../design/tokens';
import {
  canonicalUrl,
  fromWebPath,
  openCorrection,
  openSource,
  sourceUrl,
} from '../../navigation/external';
import {
  licenceHubRoute,
  licenceRoute,
} from '../../navigation/routes/reference';
import { useSheetPayload } from '../../navigation/sheets';
import {
  presentSourceDestination,
  recordExternalURL,
} from '../../navigation/source-destination';
import { MissingPayload, SheetFrame } from './frame';

export function sourceDate(value: DateInput | null | undefined, short = false) {
  return typeof value === 'string' && /^\d{4}$/.test(value)
    ? value
    : value == null
      ? ''
      : formatDate(value, short ? 'short' : 'long');
}
export function sourceHeader(details: SourceDetails) {
  if (details.header) return details.header;
  const newest = sourceCitations(details.citation)
    .flatMap(({ asOf }) => {
      const day = asOf == null ? null : calendarDate(asOf);
      return day && asOf != null
        ? [{ asOf, order: day.year * 10000 + day.month * 100 + day.day }]
        : [];
    })
    .sort((a, b) => b.order - a.order)[0]?.asOf;
  const date = sourceDate(details.asOf ?? newest);
  return date
    ? `${details.dateRole === 'recorded' ? 'Recorded' : details.dateRole === 'found' ? 'Found' : 'As at'} ${date}`
    : 'Date not published';
}
/** One action reaches the original. Above a modal, keep both underlying routes. */
export function openOriginal(original: SourceOriginal, overModal: boolean) {
  let path = original.url;
  if (path.startsWith('https://')) {
    try {
      const url = new URL(path);
      if (
        url.origin === new URL(canonicalUrl('/')).origin ||
        url.hostname === 'opax.com.au' ||
        url.hostname === 'www.opax.com.au'
      )
        path = url.pathname + url.search + url.hash;
    } catch {
      /* openSource validates external addresses */
    }
  }
  const native = path.startsWith('/') ? fromWebPath(path) : null;
  if (native && !overModal) {
    router.back();
    router.push(native);
  } else if (overModal && native) {
    // openSource normally resolves OPAX records to native routes. Here the
    // browser must stay above Account/Talk and the source sheet beneath it.
    void openAboveModal(
      path.startsWith('/') ? new URL(path, webOrigin).toString() : original.url,
      original.label,
    );
  } else
    void openSource(
      path.startsWith('/') ? new URL(path, webOrigin).toString() : original.url,
      original.label,
    );
}
async function openAboveModal(url: string, citation: string) {
  try {
    const checked = sourceUrl(url);
    recordExternalURL(checked);
    if (isE2E) {
      if (hasSourcePreview)
        presentSourceDestination({ url: checked, citation });
      else Alert.alert(`Source record: ${citation}`, checked);
      return;
    }
    await WebBrowser.openBrowserAsync(checked, {
      controlsColor: (Appearance.getColorScheme() === 'dark' ? dark : light)
        .navy,
      dismissButtonStyle: 'done',
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      readerMode: false,
    });
  } catch {
    Alert.alert('Couldn’t open the original', 'Check your connection.');
  }
}
export function OriginalsGroup({
  details,
  overModal = false,
  testID,
  header,
  showCitations = false,
}: {
  details: SourceDetails;
  overModal?: boolean;
  testID?: string;
  header?: string;
  showCitations?: boolean;
}) {
  const originals = (details.originals ?? []).filter(
    (original, index, all) =>
      (original.url.startsWith('https://') || original.url.startsWith('/')) &&
      all.findIndex((other) => other.url === original.url) === index,
  );
  const sources =
    showCitations && !originals.length ? sourceCitations(details.citation) : [];
  const perSourceDate =
    new Set(sources.map((source) => sourceDate(source.asOf ?? details.asOf)))
      .size > 1;
  if (!originals.length && !sources.length)
    return header ? (
      <Text variant="groupHeader" accessibilityRole="header">
        {header}
      </Text>
    ) : null;
  return (
    <View style={{ gap: rhythm.groupHeader }}>
      {header ? (
        <Text variant="groupHeader" accessibilityRole="header">
          {header}
        </Text>
      ) : null}
      <InsetGroup testID={testID && `${testID}-records`}>
        {originals.map((original, index) => (
          <LinkRow
            key={original.url}
            title={original.label}
            detail={
              [
                original.record,
                sourceDate(original.asOf, true),
                index === 0 ? details.coverage : null,
              ]
                .filter(Boolean)
                .join(' · ') || undefined
            }
            external={
              !fromWebPath(
                original.url.startsWith('/')
                  ? original.url
                  : (() => {
                      try {
                        const u = new URL(original.url);
                        return ['opax.com.au', 'www.opax.com.au'].includes(
                          u.hostname,
                        )
                          ? u.pathname + u.search + u.hash
                          : '';
                      } catch {
                        return '';
                      }
                    })(),
              )
            }
            onPress={() => openOriginal(original, overModal)}
            testID={testID ? `${testID}-original-${index}` : undefined}
          />
        ))}
        {sources.map((source, index) => {
          const date = perSourceDate
            ? sourceDate(source.asOf ?? details.asOf, true) ||
              'Date not published'
            : null;
          return (
            <View
              key={source.title}
              testID={testID && `${testID}-citation-${index}`}
              style={{
                minHeight: minimumTarget,
                paddingVertical: rhythm.row,
                gap: rhythm.line,
              }}
            >
              <Text wordSafe variant="body">
                {source.title}
              </Text>
              {date ? (
                <Text wordSafe variant="secondary">
                  {date}
                </Text>
              ) : null}
            </View>
          );
        })}
      </InsetGroup>
    </View>
  );
}
export function Paragraphs({
  paragraphs,
}: {
  paragraphs: readonly (string | false | null | undefined)[];
}) {
  return (
    <View
      style={{
        gap: rhythm.block,
        paddingVertical: rhythm.row,
        minHeight: minimumTarget,
      }}
    >
      {paragraphs
        .filter((p): p is string => !!p)
        .map((p, index) => (
          <Text key={index} wordSafe variant="body">
            {p}
          </Text>
        ))}
    </View>
  );
}
export function SourceContent({
  details,
  overModal = false,
  testID,
}: {
  details: SourceDetails;
  overModal?: boolean;
  testID?: string;
}) {
  const notes = [
    details.savedAt != null ? copy.savedCopyNote(details.savedAt) : null,
    details.state === 'partial' ? copy.partialNote : null,
    ...(details.notes ?? []),
  ].filter(Boolean);
  return (
    <>
      <OriginalsGroup
        details={details}
        overModal={overModal}
        testID={testID}
        header={sourceHeader(details)}
        showCitations
      />
      {details.rule ? (
        <InsetGroup header={copy.howChosen}>
          <Paragraphs paragraphs={[details.rule]} />
        </InsetGroup>
      ) : null}
      {notes.length ? (
        <InsetGroup header="Notes">
          <Paragraphs paragraphs={notes} />
        </InsetGroup>
      ) : null}
      {details.extra}
      <InsetGroup>
        {details.licenceDataset ? (
          <LinkRow
            title="Licence"
            value={details.licence ? licenceText(details.licence) : undefined}
            href={licenceRoute(details.licenceDataset)}
            testID={testID && `${testID}-licence`}
          />
        ) : null}
        <LinkRow
          title="Sources and licences"
          onPress={() => router.push(licenceHubRoute)}
          testID={testID && `${testID}-licences`}
        />
        <TintRow
          title={details.report?.label ?? copy.reportCorrection}
          onPress={details.report?.onPress ?? (() => void openCorrection())}
          testID={details.report?.testID ?? (testID && `${testID}-correction`)}
        />
      </InsetGroup>
    </>
  );
}
/**
 * An action row in a group (shell 9): the title in the tint, no accessory,
 * so it reads as something to do rather than somewhere to go.
 */
export function TintRow({
  title,
  onPress,
  testID,
}: {
  title: string;
  onPress: () => void;
  testID?: string;
}) {
  const highlight = useRowHighlight();
  const cellStyle = useRowCellStyle();
  useRowInset();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        {
          minHeight: minimumTarget,
          paddingVertical: rhythm.row,
          justifyContent: 'center',
        },
        cellStyle,
        pressed ? { backgroundColor: highlight } : null,
      ]}
    >
      <Text wordSafe variant="body" tone="navy">
        {title}
      </Text>
    </Pressable>
  );
}
export default function SourceSheet() {
  const payload = useSheetPayload('source');
  const testID = payload?.testID ? `${payload.testID}-sheet` : 'source-sheet';
  return (
    <SheetFrame title={copy.sources} testID={testID}>
      {payload ? (
        <SourceContent
          details={payload.details}
          overModal={payload.overModal}
          testID={testID}
        />
      ) : (
        <MissingPayload />
      )}
    </SheetFrame>
  );
}
