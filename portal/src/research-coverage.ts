import {trimQuestionEnd} from './question-text.mjs'
import {rankingRepairQuestion} from './research-ranking-repair.mjs'
/** A known coverage boundary is the explanation; unknown endpoints add nothing. */
export function donationCoverageLimit(question: string, text: string): string | undefined {
  const scope=rankingRepairQuestion(question)
  if(!scope||scope.jurisdiction!=='federal')return
  const range = /Federal AEC (?:donation returns|disclosed receipts), financial years ((?:19|20)\d{2}[–-]\d{2})/i.exec(text)
  const year = /\bin ((?:19|20)\d{2})[?.!]*$/i.exec(question)?.[1]
  if (!range || !year || Number(year) >= Number(range[1].slice(0,4))) return
  const ask = trimQuestionEnd(question.trim()).replace(/^./, c => c.toLowerCase())
  return `OPAX's federal donation records start in ${range[1]}, so they can't show ${ask}.`
}
