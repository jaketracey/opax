import { LinkRow } from '../../design/primitives';
import { titleSubject } from '../records/citations';
import { metaString, type DocumentRecord } from '../records/model';
import { topics } from './Options';
import { useOpenAsk } from './open';

/** portal/public/app.js docAskQuestion: a draft, never a submitted request. */
export function documentQuestion(doc: DocumentRecord) {
  const trim = (value: string, max: number) => {
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length > max
      ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…`
      : text;
  };
  const topicSlug = doc.topics.find((topic) => topics[topic]);
  const generic =
    /^(bills?|motions?|statements?(?: by (?:members|senators))?|matters? of public importance|questions? (?:without|on) notice|adjournment|committees?|business|documents|petitions|ministerial statements?|condolences?|debate)$/i;
  const stage =
    /\s+[-–—]\s+(?:first|second|third) reading$|\s+[-–—]\s+(?:in committee|consideration in detail|committee of the whole)$/i;
  const named = (value: string) => {
    const text = value.replace(stage, '').trim();
    return generic.test(text) ? '' : text;
  };
  const debate =
    metaString(doc, 'topic') ||
    metaString(doc, 'debate') ||
    (doc.speaker ? titleSubject(doc) : '');
  const fallback = named(titleSubject(doc));
  const heading = named(debate);
  const subject = topicSlug
    ? topics[topicSlug]!
    : heading.length <= 70
      ? heading
      : trim(heading || fallback, 70);
  let about = (subject || trim(fallback, 70)).replace(/[.?!]+$/, '').trim();
  if (/\bbill\b/i.test(about) && !/^(the|a|an)\s/i.test(about))
    about = `the ${about}`;
  const isRecord = [
    'press_release',
    'bill_text',
    'grant_invitation',
    'grant_award',
    'election_baseline',
    'parliamentary_profile',
    'research_report',
  ].includes(doc.labels.kind || '');
  if (isRecord)
    return `What does the record say about ${about || trim(doc.title, 70)}?`;
  if (doc.speaker && about)
    return `What did ${doc.speaker} say about ${about}?`;
  if (doc.speaker) return `What has ${doc.speaker} said in parliament?`;
  return `What has parliament said about ${about || trim(doc.title, 70)}?`;
}

export function DocumentAsk({ doc }: { doc: DocumentRecord }) {
  const openAsk = useOpenAsk();
  return (
    <LinkRow
      title="Ask about this"
      icon="text.bubble"
      accent="people"
      testID="doc-ask"
      onPress={() => openAsk({ question: documentQuestion(doc) })}
    />
  );
}
