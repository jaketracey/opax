import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import { router } from 'expo-router';
import { Text } from '../../design/primitives';
import { presentSource } from '../../navigation/sheets';
import { explorePhotoRoute } from '../../navigation/routes/explore';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { yearPictureKey } from '../../api/year-picture-policy';
import { Picture } from './Picture';
import type { YearPicture } from './pictures';

export const pictureKey = (p: Pick<YearPicture, 'file'>) =>
  yearPictureKey('/' + p.file);
/** The photograph a link names, or the first; an unknown key is the first. */
export function photoIndex(
  photos: readonly Pick<YearPicture, 'file'>[],
  key?: string | null,
) {
  const index = key ? photos.findIndex((p) => pictureKey(p) === key) : -1;
  return Math.max(0, index);
}
/** "Photo: Alison Newman · CC0" */
export const creditText = (p: Pick<YearPicture, 'author' | 'licence'>) =>
  `${p.author} · ${p.licence}`;
/** A photograph's source sheet: its date, the Commons file page and the licence. */
export function openPhotoSource(p: YearPicture, testID?: string) {
  presentSource(
    {
      asOf: p.date,
      citation: [{ label: 'Wikimedia Commons', asOf: p.date }],
      originals: [
        { label: 'Wikimedia Commons', url: p.source_url, record: 'file page' },
        ...(p.licence_url
          ? [{ label: p.licence, url: p.licence_url, record: 'licence' }]
          : []),
      ],
      licence: p.licence,
    },
    { testID },
  );
}

/** The credit under a photograph: "Photo:" quiet, the author and licence in the tint. */
export function PhotoCredit({
  photo,
  testID,
}: {
  photo: YearPicture;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Photo: ${photo.author}, ${photo.licence}.`}
      accessibilityHint="Double-tap for the source and licence."
      onPress={() => openPhotoSource(photo, testID && `${testID}-sheet`)}
      testID={testID}
      style={styles.credit}
    >
      <Text wordSafe variant="footnote">
        <Text variant="footnote" tone="inkSoft">
          Photo:{' '}
        </Text>
        <Text variant="footnote" tone="link">
          {creditText(photo)}
        </Text>
      </Text>
    </Pressable>
  );
}

/**
 * The year's photographs, one page each in the manifest's order, with the
 * current page's caption and credit beneath. One adjustable element for
 * VoiceOver; a tap opens the full-screen viewer.
 */
export function YearGallery({
  year,
  photos,
  initial,
}: {
  year: number;
  photos: readonly YearPicture[];
  initial?: string | null;
}) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(() => photoIndex(photos, initial));
  const scroll = useRef<ScrollView>(null);
  const placed = useRef(false);
  useEffect(() => {
    if (!width || placed.current) return;
    placed.current = true;
    scroll.current?.scrollTo({ x: page * width, animated: false });
  }, [width, page]);
  const current = photos[Math.min(page, photos.length - 1)];
  if (!current) return null;
  const go = (next: number) => {
    const bounded = Math.max(0, Math.min(photos.length - 1, next));
    setPage(bounded);
    scroll.current?.scrollTo({ x: bounded * width, animated: false });
  };
  const open = () =>
    router.push(explorePhotoRoute(String(year), pictureKey(current)));
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') go(page + 1);
    if (event.nativeEvent.actionName === 'decrement') go(page - 1);
    if (event.nativeEvent.actionName === 'activate') open();
  };
  return (
    <View style={styles.gallery} testID="tm-gallery">
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Photograph ${page + 1} of ${photos.length}. ${current.caption}. Photo: ${current.author}, ${current.licence}.`}
        accessibilityHint="Double-tap to open it full screen."
        accessibilityActions={[
          { name: 'increment' },
          { name: 'decrement' },
          { name: 'activate' },
        ]}
        onAccessibilityAction={onAction}
        style={styles.frame}
      >
        <View
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={styles.frame}
        >
          <ScrollView
            ref={scroll}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) =>
              width &&
              setPage(Math.round(event.nativeEvent.contentOffset.x / width))
            }
            scrollEventThrottle={16}
          >
            {photos.map((p) => (
              <Pressable
                // a11y-ok(pressable-role): the adjustable frame around the
                // gallery is the one focus target: it names the photo, pages
                // with swipes up and down, and opens it on activate.
                key={p.file}
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                onPress={() =>
                  router.push(explorePhotoRoute(String(year), pictureKey(p)))
                }
                style={{ width: width || undefined }}
              >
                <Picture file={p.file} ratio={4 / 3} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
        {photos.length > 1 ? (
          <View style={styles.dots}>
            {photos.map((p, i) => (
              <View
                key={p.file}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === page ? colors.ink : colors.inkFaint,
                  },
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
      <View style={styles.caption}>
        <Text
          wordSafe
          variant="body"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {current.caption}
        </Text>
        <PhotoCredit
          photo={current}
          testID={`tm-photo-credit-${pictureKey(current)}`}
        />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  gallery: { gap: rhythm.tight, alignSelf: 'stretch' },
  frame: { alignSelf: 'stretch', gap: rhythm.tight },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: rhythm.line,
  },
  dot: { width: 8, height: 8, borderRadius: 4, borderCurve: 'continuous' },
  caption: { gap: rhythm.line },
  credit: { minHeight: minimumTarget, justifyContent: 'center' },
});
