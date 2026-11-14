import { RouteOptions } from '../../navigation/preview';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  router,
  useLocalSearchParams,
  type NativeStackHeaderItem,
} from 'expo-router';
import { track } from '../../analytics';
import { useScreenMargin } from '../../design/adaptive';
import { Button } from '../../design/controls';
import { copy } from '../../design/copy';
import { haptic } from '../../design/haptics';
import { InsetGroup } from '../../design/layout';
import { SurfaceContext } from '../../design/row-padding';
import { LinkRow } from '../../design/rows';
import { ContentUnavailable, InlineError } from '../../design/states';
import { Text } from '../../design/text';
import { colors, minimumTarget, rhythm, textStyles } from '../../design/tokens';
import { androidHeaderBar, headerItems } from '../../navigation/chrome';
import { copyText } from '../records/actions';
import { parseTurnKey } from './model';
import { reportMail, reportReasons, reportText } from './report-mail';
import { answerTurn } from './session';
import { citedSources, sourceTitle } from './source-present';
import { chatsSnapshot } from './store';

/**
 * "Report this answer" (journeys/ask.md 4.9, Mail fallback build): a reason,
 * an optional detail, and Email, which opens Mail addressed to OPAX with the
 * question, this answer and links to its records. Nothing is sent by the
 * app, so nothing says "Reported" or "Thanks" afterwards. When OPAX has a
 * report endpoint, Email becomes Send.
 */
export default function ReportSheet() {
  const params = useLocalSearchParams<{ turn?: string; source?: string }>();
  const found = answerTurn(params.turn);
  const margin = useScreenMargin();
  const insets = useSafeAreaInsets();
  const sourceIndex = params.source ? Number(params.source) : NaN;
  const source = found
    ? citedSources(found.answer.result?.sources ?? found.answer.sources ?? [])
        .cited[sourceIndex - 1]
    : undefined;
  const [reason, setReason] = useState<number | null>(params.source ? 0 : null);
  const [note, setNote] = useState('');
  const [noMail, setNoMail] = useState(false);
  // Legacy answers (saved before answer times) read their conversation's date.
  const parsed = params.turn ? parseTurnKey(params.turn) : null;
  const chat = parsed
    ? chatsSnapshot().chats.find((c) => c.id === parsed.chat)
    : undefined;
  const firstAnswer = chat?.thread.findIndex((t) => t.role === 'answer');
  const legacy =
    found && !found.answer.at && chat
      ? firstAnswer === found.index
        ? { at: chat.created, bound: false }
        : { at: chat.updated, bound: true }
      : null;
  const mail =
    found && reason !== null
      ? reportMail({
          reason: reportReasons[reason] ?? reportReasons[3],
          note,
          question: found.question,
          answer: found.answer,
          legacy,
        })
      : null;
  // One report_opened per sheet with an answer to report.
  const opened = useRef(false);
  useEffect(() => {
    if (!found || opened.current) return;
    opened.current = true;
    track('opax_answer_feedback', { surface: 'ask', action: 'report_opened' });
  }, [found]);
  async function email() {
    if (!mail) return;
    try {
      await Linking.openURL(mail.url);
      // Mail opened with the report; whether it was sent is never known.
      track('opax_answer_feedback', {
        surface: 'ask',
        action: 'report_sent_mail',
      });
      router.back();
    } catch {
      setNoMail(true);
    }
  }
  const cancel: NativeStackHeaderItem = {
    type: 'button',
    label: copy.cancel,
    variant: 'plain',
    tintColor: colors.navy,
    onPress: () => router.back(),
  };
  const send: NativeStackHeaderItem = {
    type: 'button',
    label: 'Email',
    accessibilityLabel: 'Email',
    variant: 'plain',
    tintColor: colors.navy,
    disabled: !mail,
    labelStyle: mail ? { fontWeight: '600' } : undefined,
    onPress: () => void email(),
  };
  return (
    <>
      <RouteOptions
        options={{
          title: 'Report this answer',
          headerTitleStyle: textStyles.inlineTitle,
          contentStyle: { backgroundColor: colors.sunken },
          ...headerItems(found ? () => [send] : () => [cancel]),
          unstable_headerLeftItems: () => (found ? [cancel] : []),
          ...(Platform.OS === 'android' && found
            ? { headerLeft: () => androidHeaderBar([cancel]) }
            : {}),
        }}
      />
      <SurfaceContext.Provider value="sunken">
        <ScrollView
          testID="ask-report-sheet"
          style={styles.screen}
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: margin,
              paddingBottom: rhythm.section + insets.bottom,
            },
          ]}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {found ? (
            <>
              <InsetGroup>
                {reportReasons.map((label, i) => (
                  <LinkRow
                    key={label}
                    title={label}
                    accessory={reason === i ? 'checkmark' : 'none'}
                    selected={reason === i}
                    onPress={() => {
                      haptic('selection');
                      setReason(i);
                      setNoMail(false);
                    }}
                    testID={`ask-report-reason-${i}`}
                  />
                ))}
              </InsetGroup>
              <InsetGroup>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder={
                    source
                      ? `Add detail about ${sourceTitle(source)} (optional)`
                      : 'Add detail (optional)'
                  }
                  accessibilityLabel={
                    source
                      ? `Add detail about ${sourceTitle(source)} (optional)`
                      : 'Add detail (optional)'
                  }
                  placeholderTextColor={colors.inkSoft}
                  multiline
                  maxLength={1000}
                  allowFontScaling
                  style={styles.note}
                  testID="ask-report-note"
                />
              </InsetGroup>
              <Text wordSafe variant="footnote" tone="inkSoft">
                Opens an email to corrections@opax.com.au with your question,
                this answer and its records.
              </Text>
              {noMail && mail ? (
                <View style={styles.noMail}>
                  <InlineError
                    subject="email"
                    message="No email app is set up."
                    testID="ask-report-no-mail"
                  />
                  <Button
                    label="Copy report"
                    variant="plain"
                    onPress={() =>
                      void copyText(reportText(mail)).then((copied) => {
                        if (!copied) return;
                        haptic('success');
                        AccessibilityInfo.announceForAccessibility(
                          'Report copied',
                        );
                      })
                    }
                    testID="ask-report-copy"
                  />
                </View>
              ) : null}
            </>
          ) : (
            <ContentUnavailable
              symbol="exclamationmark.triangle"
              title="This answer isn’t available"
            />
          )}
        </ScrollView>
      </SurfaceContext.Provider>
    </>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sunken },
  content: { paddingTop: rhythm.group, gap: rhythm.group },
  note: {
    ...textStyles.body,
    color: colors.ink,
    minHeight: minimumTarget * 2,
    paddingVertical: rhythm.row,
    textAlignVertical: 'top',
  },
  noMail: { gap: rhythm.tight, alignItems: 'flex-start' },
});
