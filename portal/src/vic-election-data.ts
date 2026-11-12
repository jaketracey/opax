/** One validation contract for the offline build and the app reader. */
import {validDate} from './app-http.ts'
import {VIC_ELECTION_PATH} from '../public/vic-election.js'
import type {Contest, Member, Seat, VicElection, VicPlaces} from './vic-election'

const slug = (path: string) => path.split('/').at(-1)!
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const VIC_ELECTION_SOURCE_KEYS = ['election','voting','enrolment','address','results','licence'] as const
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string'
const nullableText = (v: unknown) => v === null || text(v)
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const integer = (v: unknown) => number(v) && Number.isInteger(v) && (v as number) >= 0
const https = (v: unknown) => { try { return text(v) && new URL(v).protocol === 'https:' } catch { return false } }
const instant = (v: unknown) => text(v) && /T\d{2}:\d{2}:\d{2}\+11:00$/.test(v) && Number.isFinite(Date.parse(v))
const fields = (v: unknown, keys: string[], check: (value: unknown) => boolean) => object(v) && keys.every(k=>check(v[k]))

function validContest(c: Contest): boolean {
  return object(c) && validDate(c.date) && ['general','by-election','supplementary'].includes(c.kind)
    && fields(c,['party','against'],text) && fields(c,['share','against_share','margin'],number) && https(c.url)
}

function validMember(m: Member): boolean {
  return object(m) && text(m.name) && nullableText(m.party) && text(m.href) && /^\/subject\/person\/[a-z0-9-]+$/.test(m.href)
    && https(m.source_url) && nullableText(m.speech_gap)
    && (m.speeches === null || fields(m.speeches,['count','first','last'],integer) && typeof m.speeches?.within_term === 'boolean')
    && (m.votes === null || fields(m.votes,['count','ayes','noes'],integer))
    && Array.isArray(m.divisions) && m.divisions.every(v=>object(v) && validDate(v.date)
      && fields(v,['title','vote'],text) && text(v.href) && v.href.startsWith('/doc/') && https(v.source_url))
}

function validSeat(s: Seat): boolean {
  return object(s) && ['district','region'].includes(s.kind) && text(s.name) && text(s.path)
    && s.path === `${VIC_ELECTION_PATH}/${slug(s.path)}` && SLUG.test(slug(s.path)) && https(s.source_url)
    && text(s.electorate_url) && s.electorate_url.startsWith('/subject/electorate/') && validDate(s.roster_date)
    && nullableText(s.region) && nullableText(s.formerly) && nullableText(s.boundary_note) && typeof s.created === 'boolean'
    && Array.isArray(s.districts) && s.districts.every(text)
    && Array.isArray(s.members) && s.members.length === (s.kind === 'district' ? 1 : 5) && s.members.every(validMember)
    && (s.result === null || s.kind === 'district' && object(s.result) && validContest(s.result.general) && (s.result.since === null || validContest(s.result.since)))
    && (s.candidates === null || object(s.candidates) && validDate(s.candidates.published) && https(s.candidates.url)
      && Array.isArray(s.candidates.list) && s.candidates.list.every(c=>fields(c,['name','party'],text)))
}

export function validateVicElection(value: unknown): VicElection {
  const d = value as VicElection
  if (!object(d) || !fields(d,['updated','election_day','term_start','term_end','results_fetched','speech_updated','division_end'],validDate)
    || !(d.division_start === null || validDate(d.division_start))
    || !fields(d,['enrolment_close','nominations_close','postal_close'],instant)
    || !text(d.authorisation) || !fields(d.corrections,['email','response'],text)
    || !fields(d.sources,[...VIC_ELECTION_SOURCE_KEYS],https) || !Array.isArray(d.seats) || !d.seats.every(validSeat)
    || d.seats.filter(s=>s.kind === 'district').length !== 88 || d.seats.filter(s=>s.kind === 'region').length !== 8
    || new Set(d.seats.map(s=>s.path)).size !== 96
    || d.seats.some(s=>s.kind === 'district'
      ? !d.seats.some(r=>r.kind === 'region' && r.name === s.region)
      : s.districts.length !== 11 || s.districts.some(name=>!d.seats.some(x=>x.kind === 'district' && x.name === name)))
    || d.notice != null && (!object(d.notice) || !text(d.notice.text) || !d.notice.text.trim() || d.notice.text.length > 200
      || /[<>\r\n]/.test(d.notice.text) || !(d.notice.link === null || fields(d.notice.link,['label'],text) && https(d.notice.link?.url)))) {
    throw new Error('Invalid election asset')
  }
  return d
}

export function validateVicPlaces(value: unknown, d: VicElection): VicPlaces {
  const p = value as VicPlaces
  if (!fields(p,['attribution','note'],text) || !Array.isArray(p.districts) || !p.districts.every(text)
    || p.districts.length !== 88 || new Set(p.districts).size !== 88
    || p.districts.some(name=>!d.seats.some(s=>s.kind === 'district' && s.name === name))
    || !['suburb','postcode','council'].every(key=>{
      const rows = p[key as 'suburb' | 'postcode' | 'council']
      return Array.isArray(rows) && rows.every(r=>Array.isArray(r) && r.length === 3 && text(r[0]) && integer(r[2])
        && Array.isArray(r[1]) && r[1].length > 0 && r[1].every(part=>Array.isArray(part) && part.length === 2
          && integer(part[0]) && part[0] < p.districts.length && integer(part[1]) && part[1] <= 1000))
    })) throw new Error('Invalid places asset')
  return p
}
