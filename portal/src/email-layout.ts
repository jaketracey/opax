// The one layout every OPAX email is drawn with (docs/EMAIL-STYLE.md).
//
// It follows the app: a paper ground, one raised card with the app's container
// corners, serif record headings over a system sans body, and navy as the one
// tint: the pill for the one action, and every link. Bronze is the mark's
// alone. Colours and spacing are the design tokens' own values
// (docs/design/design-tokens.json); the corner radii and type roles are the
// app's (mobile/src/design/tokens.ts). They are written out here because an
// email carries its styles inline; test/email-layout.test.mjs holds them.
//
// Email clients are the constraint: tables and inline styles, no web fonts, no
// scripts, no background images, a button that survives Outlook, an embedded
// mark (no remote request), and nothing that tracks an open or a click. The
// light colours are inline, so a client that ignores dark mode still reads;
// the dark ones come from prefers-color-scheme where it is honoured.
import {emailBrandMark} from './community-email-mark.ts'

/** Text with optional strong runs. Every string is escaped when drawn. */
export type Rich = string | readonly (string | {strong:string})[]
/** One sourced item of a digest: what it is, where it leads, and its source. */
export type EmailItem = {title:string,href:string,summary?:string,source:string,sourceHref?:string,date?:string}
export type EmailBlock =
 | {kind:'text',text:Rich}
 /** A one-time code: its label, the code set large, and what to do with it. */
 | {kind:'code',label:string,code:string,note?:Rich}
 /** Someone else's words: an optional title, then the text behind a navy rule. */
 | {kind:'quote',title?:string,text:string}
 /** A digest list: an optional heading, then items, each with its source. */
 | {kind:'items',heading?:string,items:readonly EmailItem[]}
export type EmailLink = {href:string,label:string}
export type EmailSpec = {
 /** The site's origin, for the footer's home and privacy links. */
 origin:string
 /** Under 50 characters, and says what the email is. */
 subject:string
 /** The line a mailbox shows after the subject. */
 preheader:string
 title:string
 blocks:readonly EmailBlock[]
 /** The email's one action. An email with none (a code to type) has no button. */
 action?:EmailLink
 /** Fine print under the action. */
 note?:Rich
 /** Why this person got this email. */
 reason:Rich
 /** Footer links that are this email's own: manage notifications, unsubscribe. */
 links?:readonly EmailLink[]
 /** The plain-text part. Left out, it is written from the fields above. */
 text?:string
}

/** The tokens the layout draws with: light value, dark value. */
export const emailTokens = {
 paper:['#FAF9F6','#161915'],
 raised:['#FFFFFF','#20241E'],
 sunken:['#F1EFE8','#0E100D'],
 ink:['#23271F','#ECEAE2'],
 inkSoft:['#575C52','#A9AEA2'],
 navy:['#142A43','#9CB9DB'],
 onNavy:['#FFFFFF','#0E1A28'],
 dividerSubtle:['#DFDCD2','#30342D'],
} as const
/**
 * Sizes in px. Type is the app's roles as [size, line height]: recordTitle,
 * recordHeading, rowRecord, body, secondary, footnote. Body, secondary and
 * footnote keep the app's sizes with a longer line, for reading in a mailbox.
 * Then the spacing steps, the container and tile radii and the tap target.
 */
export const emailScale = {
 width:600,
 heading:[28,36],section:[22,30],subheading:[17,23],body:[17,26],metadata:[15,22],fine:[13,20],
 line:4,tight:8,heading_gap:12,block:16,group:24,section_gap:36,screen:20,
 radiusCard:22,radiusTile:18,target:44,
} as const

const SANS=`-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
const SERIF=`Georgia,'Times New Roman',serif`
const MONO=`ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`
const T=emailTokens,S=emailScale
const light=(name:keyof typeof emailTokens)=>T[name][0]

export const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
const rich=(value:Rich)=>typeof value==='string'?escapeHtml(value):value.map(part=>typeof part==='string'?escapeHtml(part):`<strong>${escapeHtml(part.strong)}</strong>`).join('')
const plain=(value:Rich)=>typeof value==='string'?value:value.map(part=>typeof part==='string'?part:part.strong).join('')
const host=(origin:string)=>origin.replace(/^https?:\/\//,'').replace(/\/.*$/,'')
const font=(role:'heading'|'section'|'subheading'|'body'|'metadata'|'fine')=>`font-size:${S[role][0]}px;line-height:${S[role][1]}px;`
/**
 * Only an https address becomes a link. Anything else (javascript:, data:, a
 * bare path) is drawn as plain text, so no email can carry a live link that
 * is not a web address. OPAX sends no mailto links.
 */
export const safeHref=(href:string)=>{try{return new URL(href).protocol==='https:'}catch{return false}}
const link=(href:string,label:string,style='')=>!safeHref(href)?label:`<a class="e-link" href="${escapeHtml(href)}" style="color:${light('navy')};text-decoration:underline;${style}">${label}</a>`
/** A link on its own line, as tall as a finger: for the footer and digest titles. */
const tapLink=(href:string,label:string,style:string)=>!safeHref(href)?`<span class="e-ink" style="display:inline-block;color:${light('ink')};${style}">${escapeHtml(label)}</span>`:`<a class="e-link" href="${escapeHtml(href)}" style="display:inline-block;padding:${(S.target-S.metadata[1])/2}px 0;color:${light('navy')};text-decoration:underline;${style}">${escapeHtml(label)}</a>`

function blockHtml(block:EmailBlock):string {
 if(block.kind==='text')return `<p class="e-ink" style="margin:0 0 ${S.block}px;${font('body')}color:${light('ink')};">${rich(block.text)}</p>`
 if(block.kind==='code')return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${S.block}px;"><tr><td class="e-panel" bgcolor="${light('sunken')}" style="padding:${S.block}px ${S.screen}px;background-color:${light('sunken')};border-radius:${S.radiusTile}px;">
<p class="e-soft" style="margin:0 0 ${S.line}px;${font('metadata')}color:${light('inkSoft')};">${escapeHtml(block.label)}</p>
<p class="e-ink" style="margin:0;font-family:${MONO};font-size:28px;line-height:40px;font-weight:bold;letter-spacing:4px;white-space:nowrap;color:${light('ink')};">${escapeHtml(block.code)}</p>
</td></tr></table>${block.note?`<p class="e-ink" style="margin:0 0 ${S.block}px;${font('body')}color:${light('ink')};">${rich(block.note)}</p>`:''}`
 if(block.kind==='quote')return `${block.title?`<p class="e-ink" style="margin:0 0 ${S.heading_gap}px;font-family:${SERIF};${font('subheading')}font-weight:bold;color:${light('ink')};">${escapeHtml(block.title)}</p>`:''}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${S.group}px;"><tr><td class="e-quote e-ink" style="padding:0 0 0 ${S.block}px;border-left:3px solid ${light('navy')};${font('body')}color:${light('ink')};">${escapeHtml(block.text).replaceAll('\n','<br>')}</td></tr></table>`
 const rows=block.items.map((item,i)=>`<tr><td class="e-rule" style="padding:${S.heading_gap}px 0;${i?`border-top:1px solid ${light('dividerSubtle')};`:''}">
${tapLink(item.href,item.title,`font-family:${SERIF};${font('subheading')}font-weight:bold;padding:${Math.ceil((S.target-S.subheading[1])/2)}px 0;`)}
${item.summary?`<p class="e-ink" style="margin:0 0 ${S.tight}px;${font('body')}color:${light('ink')};">${escapeHtml(item.summary)}</p>`:''}
<p class="e-soft" style="margin:0;${font('metadata')}color:${light('inkSoft')};">Source: ${item.sourceHref?link(item.sourceHref,escapeHtml(item.source)):escapeHtml(item.source)}${item.date?` &middot; ${escapeHtml(item.date)}`:''}</p>
</td></tr>`).join('\n')
 return `${block.heading?`<h2 class="e-ink" style="margin:${S.tight}px 0 ${S.line}px;font-family:${SERIF};${font('section')}font-weight:bold;color:${light('ink')};">${escapeHtml(block.heading)}</h2>`:''}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${S.block}px;">${rows}</table>`
}

function blockText(block:EmailBlock):string {
 if(block.kind==='text')return plain(block.text)
 if(block.kind==='code')return `${block.label}: ${block.code}${block.note?`\n${plain(block.note)}`:''}`
 if(block.kind==='quote')return `${block.title?`${block.title}\n\n`:''}${block.text}`
 return `${block.heading?`${block.heading}\n\n`:''}${block.items.map(item=>`${item.title}\n${item.summary?`${item.summary}\n`:''}${item.href}\nSource: ${item.source}${item.date?`, ${item.date}`:''}${item.sourceHref?`\n${item.sourceHref}`:''}`).join('\n\n')}`
}

const TAGLINE='The public record belongs to everyone.'
const SENDER='Open Parliamentary Accountability Exchange'

/** The plain-text part, written from the same fields as the HTML. */
export function emailText(spec:EmailSpec):string {
 return [spec.title,...spec.blocks.map(blockText),
  ...(spec.action?[`${spec.action.label}:\n${spec.action.href}`]:[]),
  ...(spec.note?[plain(spec.note)]:[]),
  [plain(spec.reason),...(spec.links??[]).map(item=>`${item.label}: ${item.href}`)].join('\n'),
  `${TAGLINE}\n${SENDER}\n${spec.origin}\nAccount privacy: ${spec.origin}/community?view=privacy`].join('\n\n')
}

/**
 * An email in the shared layout: the subject, the HTML and plain-text parts,
 * and the embedded mark. Every value is escaped here; no caller passes HTML.
 */
export function emailLayout(spec:EmailSpec) {
 const home=escapeHtml(spec.origin)
 // An action whose address is not https is not drawn: no button, no line to copy.
 const action=spec.action&&safeHref(spec.action.href)?spec.action:undefined,href=action?escapeHtml(action.href):''
 // Outlook draws the button from VML at a fixed size; everything else pads a link.
 const button=action?`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:${S.tight}px 0 ${S.group}px;">
<!--[if mso]><v:roundrect href="${href}" style="height:50px;v-text-anchor:middle;width:${Math.min(480,action.label.length*10+72)}px;" arcsize="50%" stroke="f" fillcolor="${light('navy')}"><w:anchorlock xmlns:w="urn:schemas-microsoft-com:office:word"/><center style="color:${light('onNavy')};font-family:Arial,sans-serif;font-size:17px;font-weight:bold;">${escapeHtml(action.label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a class="e-button" href="${href}" style="display:inline-block;background-color:${light('navy')};border:1px solid ${light('navy')};border-radius:999px;color:${light('onNavy')};font-family:${SANS};font-size:17px;font-weight:bold;line-height:24px;padding:12px 28px;text-align:center;text-decoration:none;">${escapeHtml(action.label)}</a><!--<![endif]-->
</td></tr></table>`:''
 const fallback=action?`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="e-rule" style="border-top:1px solid ${light('dividerSubtle')};padding-top:${S.block}px;">
<p class="e-soft" style="margin:0 0 ${S.line}px;${font('fine')}color:${light('inkSoft')};">Button not working? Copy this link into your browser:</p>
<p style="margin:0;${font('fine')}word-break:break-all;overflow-wrap:anywhere;">${link(action.href,href,'word-break:break-all;overflow-wrap:anywhere;')}</p>
</td></tr></table>`:''
 const footerLinks=[...(spec.links??[]),{href:spec.origin,label:host(spec.origin)},{href:`${spec.origin}/community?view=privacy`,label:'Account privacy'}]
 const dark=(name:keyof typeof emailTokens)=>T[name][1]
 const darkRules=`.e-ground{background-color:${dark('paper')}!important}.e-card{background-color:${dark('raised')}!important;border-color:${dark('dividerSubtle')}!important}.e-panel{background-color:${dark('sunken')}!important}.e-ink{color:${dark('ink')}!important}.e-soft{color:${dark('inkSoft')}!important}.e-rule{border-color:${dark('dividerSubtle')}!important}.e-quote{border-color:${dark('navy')}!important}.e-link{color:${dark('navy')}!important}.e-button{background-color:${dark('navy')}!important;border-color:${dark('navy')}!important;color:${dark('onNavy')}!important}`
 const html=`<!doctype html>
<html lang="en-AU" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(spec.subject)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
a:focus-visible{outline:2px solid ${light('navy')};outline-offset:4px}
.e-button:hover{text-decoration:underline!important}
@media only screen and (max-width:600px){.e-outer{padding:${S.screen}px ${S.heading_gap}px!important}.e-pad{padding:${S.group}px ${S.screen}px!important}}
@media (prefers-color-scheme:dark){${darkRules}}
${darkRules.replace(/(^|\})\./g,'$1[data-ogsc] .')}
</style>
</head>
<body class="e-ground" style="margin:0;padding:0;width:100%;background-color:${light('paper')};font-family:${SANS};color:${light('ink')};">
<div style="display:none;font-size:1px;line-height:1px;color:${light('paper')};max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(spec.preheader)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-ground" bgcolor="${light('paper')}"><tr><td align="center" class="e-outer" style="padding:${S.section_gap}px ${S.screen}px;">
<!--[if mso]><table role="presentation" width="${S.width}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${S.width}px;"><tr><td style="padding:0 0 ${S.group}px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="52" valign="middle"><img src="cid:opax-brand-mark" width="40" height="40" alt="" style="display:block;border:0;width:40px;height:40px;border-radius:8px;"></td><td valign="middle"><p class="e-ink" style="margin:0;font-family:${SERIF};font-size:22px;line-height:28px;font-weight:bold;color:${light('ink')};">OPAX</p><p class="e-soft" style="margin:0;${font('fine')}color:${light('inkSoft')};">${SENDER}</p></td></tr></table>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-card" bgcolor="${light('raised')}" style="max-width:${S.width}px;background-color:${light('raised')};border:1px solid ${light('dividerSubtle')};border-radius:${S.radiusCard}px;border-collapse:separate;">
<tr><td class="e-pad" style="padding:${S.section_gap}px;word-break:break-word;overflow-wrap:anywhere;">
<h1 class="e-ink" style="margin:0 0 ${S.block}px;font-family:${SERIF};${font('heading')}font-weight:bold;color:${light('ink')};">${escapeHtml(spec.title)}</h1>
${spec.blocks.map(blockHtml).join('\n')}
${button}
${spec.note?`<p class="e-soft" style="margin:0 0 ${S.group}px;${font('metadata')}color:${light('inkSoft')};">${rich(spec.note)}</p>`:''}
${fallback}
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${S.width}px;"><tr><td style="padding:${S.group}px ${S.heading_gap}px 0;">
<p class="e-soft" style="margin:0 0 ${S.tight}px;${font('metadata')}color:${light('inkSoft')};">${rich(spec.reason)}</p>
${footerLinks.map(item=>`<p style="margin:0;${font('metadata')}">${tapLink(item.href,item.label,'')}</p>`).join('\n')}
<p class="e-soft" style="margin:${S.block}px 0 0;font-family:${SERIF};${font('metadata')}color:${light('inkSoft')};">${TAGLINE}</p>
<p class="e-soft" style="margin:0;${font('fine')}color:${light('inkSoft')};">Sent by OPAX, the ${SENDER}.</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`
 return {
  subject:spec.subject,
  attachments:[{filename:'opax.png',type:'image/png',disposition:'inline' as const,contentId:'opax-brand-mark',content:emailBrandMark}],
  text:spec.text??emailText(spec),
  html,
 }
}
