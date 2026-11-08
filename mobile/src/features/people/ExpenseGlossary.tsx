import { useRef } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  findNodeHandle,
} from 'react-native';
import { AndroidReadingHeader } from '../../navigation/AndroidReadingHeader';
import { catalogs } from '../../api/runtime';
import { Screen } from '../../design/layout';
import { InlineError, Skeleton } from '../../design/states';
import { Heading, Text } from '../../design/text';
import { formatMoney } from '../../design/format';
import { colors, hairline, rhythm } from '../../design/tokens';
import { BlockSource, recordBlock } from '../your-mp/Evidence';
import { closeSheetItem, headerItems } from '../../navigation/chrome';
import { useRead } from './Sections';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** "travel" from "Travel" or "Office facilities" → "office-facilities". */
export const categoryKey = (name: string) =>
  name
    .toLocaleLowerCase('en-AU')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Expense categories (people.md 2.13): one name, a plain sheet of
 * definitions, "Done" only. Opened from a profile's category row, it is
 * scrolled to that category, washed in navy, with the member's own amount.
 */
export default function ExpenseGlossary() {
  const params = useLocalSearchParams<{
    category?: string;
    person?: string;
    amount?: string;
    years?: string;
  }>();
  const target = one(params.category);
  const person = one(params.person);
  const amount = Number(one(params.amount));
  const years = one(params.years);
  const { read, retry } = useRead(() => catalogs.expenseCategories(), 'all');
  const scroll = useRef<ScrollView>(null);
  const listY = useRef<number | null>(null);
  const groupY = useRef<number | null>(null);
  const targetY = useRef<number | null>(null);
  const targetName = useRef<View>(null);
  const placed = useRef<string | null>(null);
  const place = () => {
    if (
      placed.current === (target ?? '') ||
      listY.current === null ||
      groupY.current === null ||
      targetY.current === null
    )
      return;
    placed.current = target ?? '';
    scroll.current?.scrollTo({
      y: listY.current + groupY.current + targetY.current,
      animated: false,
    });
    const node = targetName.current && findNodeHandle(targetName.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  };
  const record = read.status === 'ready' ? read.value : null;
  const match = (name: string) =>
    !!target && (name === target || categoryKey(name) === categoryKey(target));
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Expense categories',
          ...(Platform.OS === 'android'
            ? { header: AndroidReadingHeader }
            : {}),
          ...headerItems(() => [closeSheetItem()]),
        }}
      />
      <Screen testID="expense-glossary" scrollRef={scroll}>
        {read.status === 'error' ? (
          <InlineError
            subject="Expense categories"
            onRetry={retry}
            testID="expense-glossary-error"
          />
        ) : !record ? (
          <Skeleton
            shape="rows"
            count={3}
            label="Loading expense categories"
            testID="expense-glossary-loading"
          />
        ) : (
          <View
            onLayout={(e) => {
              listY.current = e.nativeEvent.layout.y;
              place();
            }}
          >
            {record.data.groups.map((g, gi) => (
              <View
                key={g.id}
                style={gi ? styles.group : null}
                onLayout={
                  record.data.categories.some(
                    (c) => c.group === g.id && match(c.name),
                  )
                    ? (e) => {
                        groupY.current = e.nativeEvent.layout.y;
                        place();
                      }
                    : undefined
                }
              >
                {g.blurb || g.title ? (
                  <Text
                    wordSafe
                    variant="groupHeader"
                    tone="inkSoft"
                    accessibilityRole="header"
                    style={styles.groupHeader}
                  >
                    {g.blurb || g.title}
                  </Text>
                ) : null}
                {record.data.categories
                  .filter((c) => c.group === g.id)
                  .map((c, ci) => {
                    const here = match(c.name);
                    return (
                      <View
                        key={c.name}
                        testID={`expense-category-${categoryKey(c.name)}`}
                        onLayout={
                          here
                            ? (e) => {
                                targetY.current = e.nativeEvent.layout.y;
                                place();
                              }
                            : undefined
                        }
                        style={[
                          styles.category,
                          ci ? styles.inset : null,
                          here ? styles.here : null,
                        ]}
                      >
                        <View
                          ref={here ? targetName : undefined}
                          accessible
                          accessibilityRole="header"
                          accessibilityLabel={c.name}
                        >
                          <Heading level={3}>{c.name}</Heading>
                        </View>
                        {here && person && Number.isFinite(amount) ? (
                          <Text
                            wordSafe
                            variant="strong"
                            tone="moneyInk"
                            testID="expense-glossary-own"
                          >
                            {`${person} claimed ${formatMoney(amount)}${years ? `, ${years}` : ''}`}
                          </Text>
                        ) : null}
                        <Text wordSafe variant="body">
                          {c.text}
                        </Text>
                        {c.note ? (
                          <Text wordSafe variant="footnote" tone="inkSoft">
                            {c.note}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
              </View>
            ))}
            <View style={styles.source}>
              <BlockSource
                block={recordBlock(record)}
                citation={record.data.meta.source}
                licence={record.data.meta.licence ?? undefined}
                originals={record.data.categories.flatMap((c) =>
                  c.url
                    ? [{ label: c.source, url: c.url, record: c.name }]
                    : [],
                )}
                testID="expense-glossary-source"
              />
            </View>
            {/* The page's end, for journeys that scroll to it. */}
            <View
              testID="expense-glossary-end"
              collapsable={false}
              style={styles.end}
            />
          </View>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: rhythm.section },
  groupHeader: { marginBottom: rhythm.heading },
  category: { paddingVertical: rhythm.block, gap: rhythm.line },
  inset: { borderTopWidth: hairline, borderTopColor: colors.dividerSubtle },
  here: {
    backgroundColor: colors.navyWash,
    marginHorizontal: -rhythm.block,
    paddingHorizontal: rhythm.block,
  },
  source: { marginTop: rhythm.group },
  end: { height: 1 },
});
