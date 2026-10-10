import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  Screen,
  Section,
  Group,
  Text,
  Heading,
  Button,
  SegmentedControl,
  Field,
  LinkRow,
  SourceLine,
  BigFigure,
} from '../../design/primitives';
import { isE2E } from '../../design/environment';
import { copyText } from '../records/actions';
import { CachedPortrait } from '../CachedPortrait';
import { openRecord } from '../reports/open';
import { quizStore } from './quiz-store';
import { grade, rankFor, type Question, type Answer } from './quiz-model';
import snapshot from './quiz-rounds.json';
import { ExploreHeader } from './parts';
import { quizRecordPath } from './quiz-links';
type Deck = 'mixed' | 'money' | 'words';
const decks = [
  { value: 'money', label: 'Money' },
  { value: 'words', label: 'Words' },
  { value: 'mixed', label: 'Mixed' },
];
export default function Quiz() {
  const [deck, setDeck] = useState<Deck>('mixed'),
    [round, setRound] = useState<Question[] | null>(null),
    [index, setIndex] = useState(0),
    [answer, setAnswer] = useState<Answer | undefined>(),
    [revealed, setRevealed] = useState(false),
    [points, setPoints] = useState(0),
    [correct, setCorrect] = useState(0),
    [streak, setStreak] = useState(0),
    [best, setBest] = useState(0),
    [copied, setCopied] = useState(false),
    [saveError, setSaveError] = useState(false),
    [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false),
    [attempts, setAttempts] = useState<string[]>([]);
  const answered = useRef(false),
    advancing = useRef(false);
  useEffect(() => {
    void quizStore.read().then((v) => {
      setBest(v?.bestStreak ?? 0);
      setReady(true);
    });
  }, []);
  const q = round?.[index],
    done = !!round && index === round.length,
    rank = rankFor(correct, round?.length ?? 8);
  const start = () => {
    const rounds = snapshot.rounds[deck];
    setRound(
      rounds[
        isE2E ? 0 : Math.floor(Math.random() * rounds.length)
      ] as Question[],
    );
    setIndex(0);
    setPoints(0);
    setCorrect(0);
    setStreak(0);
    setAnswer(undefined);
    setRevealed(false);
    setSaved(false);
    setSaveError(false);
    setCopied(false);
    setAttempts([]);
    answered.current = false;
    advancing.current = false;
  };
  const confirm = () => {
    if (!q || answer === undefined || answered.current) return;
    answered.current = true;
    advancing.current = false;
    const result = grade(q, answer),
      nextStreak = result.correct ? streak + 1 : 0,
      gained = result.base * (result.correct ? Math.min(streak + 1, 4) : 1);
    setPoints((v) => v + gained);
    setCorrect((v) => v + Number(result.correct));
    setStreak(nextStreak);
    setBest((v) => Math.max(v, nextStreak));
    setRevealed(true);
    setAttempts((v) => [...v, `${index + 1}. ${q.prompt} — ${q.fact}`]);
    AccessibilityInfo.announceForAccessibility(`${result.detail} ${q.fact}`);
  };
  const persist = () => {
    setSaved(false);
    void quizStore
      .save({
        version: 1,
        bestStreak: best,
        lastPoints: points,
        lastCorrect: correct,
      })
      .then(() => {
        setSaved(true);
        setSaveError(false);
      })
      .catch(() => setSaveError(true));
  };
  const next = () => {
    if (!round || !revealed || advancing.current) return;
    advancing.current = true;
    setIndex((i) => i + 1);
    setAnswer(undefined);
    setRevealed(false);
    answered.current = false;
    if (index + 1 === round.length) persist();
    AccessibilityInfo.announceForAccessibility(
      index + 1 === round.length
        ? `You scored ${points} points, with ${correct} out of ${round.length} right. Your rank: ${rank.name}.`
        : `Question ${index + 2} of ${round.length}`,
    );
  };
  const measured = q?.kind === 'year' || q?.kind === 'slider';
  const valid =
    q &&
    answer !== undefined &&
    (q.kind === 'order'
      ? Array.isArray(answer) && answer.length === q.options?.length
      : measured
        ? Number.isFinite(Number(answer)) &&
          Number(answer) >= q.min! &&
          Number(answer) <= q.max!
        : true);
  const resultText = `The Record Quiz — ${deck[0]!.toUpperCase() + deck.slice(1)}\n${points.toLocaleString('en-AU')} points · ${correct}/8 right · best streak ${best}\n${rank.name}: ${rank.blurb}\n\n${attempts.join('\n')}`;
  return (
    <>
      <ExploreHeader title="Quiz" game="quiz" />
      <Screen
        column="wide"
        key={round ? index : 'intro'}
        testID="explore-quiz-screen"
      >
        {!round ? (
          <Section rule={false}>
            <Text variant="body" wordSafe>
              A game from the public record
            </Text>
            <Heading level={3}>Choose a deck</Heading>
            <SegmentedControl
              segments={decks}
              value={deck}
              onChange={(v) => setDeck(v as Deck)}
            />
            <Text wordSafe variant="metadata" testID="quiz-best">
              Best streak {best}
            </Text>
            <Button
              label="Start 8 questions"
              variant="primary"
              onPress={start}
              disabled={!ready}
              testID="quiz-start"
            />
            <SourceLine
              asOf={snapshot.generated}
              citation="OPAX static quiz exports"
              testID="quiz-as-at"
            />
          </Section>
        ) : done ? (
          <Section title="Your result">
            <BigFigure
              value={points.toLocaleString('en-AU')}
              label="points"
              accent="votes"
            />
            <Heading level={3} testID="quiz-rank">
              {rank.name}
            </Heading>
            <Text wordSafe>{rank.blurb}</Text>
            <Text testID="quiz-result">
              {correct}/8 right · best streak {best}
            </Text>
            <Text variant="metadata" testID="quiz-save">
              {saved
                ? 'Streak saved on this device'
                : saveError
                  ? 'Your streak could not be saved. Try again.'
                  : 'Saving your streak'}
            </Text>
            {saveError ? <Button label="Try again" onPress={persist} /> : null}
            <Button
              label={copied ? 'Copied' : 'Copy result'}
              onPress={() => void copyText(resultText).then(setCopied)}
              testID="quiz-copy"
            />
            <Button label="Play again" onPress={start} testID="quiz-again" />
          </Section>
        ) : q ? (
          <Section title={`Question ${index + 1} of 8`}>
            <Text variant="metadata">
              {points.toLocaleString('en-AU')} points · {streak} streak
            </Text>
            <Heading level={3} testID="quiz-question">
              {q.prompt}
            </Heading>
            {q.comparison ? (
              <Text wordSafe>
                {q.comparison.shownLabel}: {q.comparison.shownDisplay} ·{' '}
                {q.comparison.hiddenLabel}:{' '}
                {revealed ? q.comparison.hiddenDisplay : '?'}
              </Text>
            ) : null}
            {measured ? (
              <Field
                label={q.kind === 'year' ? 'Choose a year' : 'Guess the figure'}
                hint={`${q.min!.toLocaleString('en-AU')} to ${q.max!.toLocaleString('en-AU')}`}
                value={answer === undefined ? '' : String(answer)}
                onChangeText={(v) =>
                  setAnswer(v.trim() ? Number(v) : undefined)
                }
                keyboardType="numeric"
                editable={!revealed}
                testID="quiz-number"
              />
            ) : (
              <Group>
                {q.options?.map((option, i) => {
                  const chosen = Array.isArray(answer)
                    ? answer.indexOf(option.label)
                    : -1;
                  return (
                    <Group key={option.label}>
                      {q.kind === 'portrait' ? (
                        <CachedPortrait name={option.label} />
                      ) : null}
                      <Button
                        key={option.label}
                        label={`${q.kind === 'order' && chosen >= 0 ? `${chosen + 1}. ` : ''}${option.label}${revealed && option.correct ? ' · Correct' : ''}`}
                        disabled={revealed}
                        variant={
                          answer === i || chosen >= 0 ? 'primary' : 'default'
                        }
                        testID={`quiz-answer-${i}`}
                        onPress={() =>
                          setAnswer(
                            q.kind === 'order'
                              ? chosen >= 0
                                ? (answer as string[]).filter(
                                    (v) => v !== option.label,
                                  )
                                : [
                                    ...(Array.isArray(answer) ? answer : []),
                                    option.label,
                                  ]
                              : i,
                          )
                        }
                      />
                    </Group>
                  );
                })}
              </Group>
            )}
            {revealed ? (
              <Group>
                <Text variant="strong">{grade(q, answer!).detail}</Text>
                <Text wordSafe>{q.fact}</Text>
                <Text wordSafe>{q.explanation}</Text>
                {quizRecordPath(q.link.href) ? (
                  <LinkRow
                    title={q.link.label}
                    onPress={() =>
                      openRecord(quizRecordPath(q.link.href)!, q.link.label)
                    }
                  />
                ) : (
                  <Text wordSafe variant="metadata">
                    {q.link.label}
                  </Text>
                )}
                <Button
                  label={index === 7 ? 'See result' : 'Next question'}
                  variant="primary"
                  onPress={next}
                  testID="quiz-next"
                />
              </Group>
            ) : (
              <Button
                label="Confirm answer"
                variant="primary"
                disabled={!valid}
                onPress={confirm}
                testID="quiz-confirm"
              />
            )}
          </Section>
        ) : null}
      </Screen>
    </>
  );
}
