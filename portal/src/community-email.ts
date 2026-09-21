import {emailBrandMark} from './community-email-mark'
const escapeHtml = (value:string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))

export function signInEmail(link:string) {
 const origin=new URL(link).origin
 return communityEmail({origin,subject:'Your sign-in link for Opax',title:'Sign in to the community',
  preheader:'Your secure link to the Opax community. Valid for 15 minutes.',
  intro:'Use this secure link to sign in to your Opax community account. No password needed.',
  link,button:'Sign in to Opax',
  note:'This link expires in <strong>15 minutes</strong> and can only be used once. Keep it private.',
  reason:'If you didn’t request this email, you can safely ignore it.',
  text:`Sign in to Opax\n\nUse this secure link to sign in to your Opax community account:\n\n${link}\n\nThis link expires in 15 minutes and can only be used once. Keep it private.\n\nIf you did not request this email, you can safely ignore it.\n\nThe public record belongs to everyone.\nOpen Parliamentary Accountability Exchange\n${origin}\nAccount privacy: ${origin}/community?view=privacy`})
}

export function replyEmail(data:{origin:string,author:string,title:string,body:string,threadId:string,replyId:string,unsubscribeUrl:string}) {
 const link=`${data.origin}/community?view=thread&id=${encodeURIComponent(data.threadId)}&reply=${encodeURIComponent(data.replyId)}#reply-${encodeURIComponent(data.replyId)}`
 const settings=data.origin+'/community?view=settings#email-notifications'
 const excerpt=data.body.length>280?data.body.slice(0,280).trimEnd()+'…':data.body
 return {...communityEmail({origin:data.origin,subject:'New reply to your Opax discussion',title:'You have a new reply',
  preheader:`${data.author} replied to “${data.title}”.`,
  intro:`${data.author} replied to your discussion:`,
  detail:`<p class="email-ink" style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:30px;font-weight:bold;color:#23271F;">${escapeHtml(data.title)}</p><blockquote class="email-ink" style="margin:0 0 28px;padding:0 0 0 16px;border-left:3px solid #D9A84A;font-size:16px;line-height:26px;color:#23271F;">${escapeHtml(excerpt).replaceAll('\n','<br>')}</blockquote>`,
  link,button:'Read the reply',note:'Open the discussion to continue the conversation.',
  reason:`You’re receiving this because you started this discussion. <a class="email-link" href="${escapeHtml(settings)}" style="color:#8A5A12;text-decoration:underline;">Manage email notifications</a> or <a class="email-link" href="${escapeHtml(data.unsubscribeUrl)}" style="color:#8A5A12;text-decoration:underline;">unsubscribe from reply emails</a>.`,
  text:`You have a new reply\n\n${data.author} replied to your discussion:\n${data.title}\n\n${excerpt}\n\nRead the reply:\n${link}\n\nYou’re receiving this because you started this discussion.\nManage email notifications: ${settings}\nUnsubscribe from reply emails: ${data.unsubscribeUrl}\n\nThe public record belongs to everyone.\nOpen Parliamentary Accountability Exchange\n${data.origin}`}),
  headers:{'List-Unsubscribe':`<${data.unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}
}

/** All HTML slots are constructed here from escaped content, never supplied by members. */
function communityEmail(data:{origin:string,subject:string,title:string,preheader:string,intro:string,detail?:string,link:string,button:string,note:string,reason:string,text:string}) {
 const href=escapeHtml(data.link),home=escapeHtml(data.origin)
 return {
  subject:data.subject,
  attachments:[{filename:'opax.png',type:'image/png',disposition:'inline' as const,contentId:'opax-brand-mark',content:emailBrandMark}],
  text:data.text,
  html:`<!doctype html>
<html lang="en-AU" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(data.subject)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
a:focus-visible{outline:3px solid #D9A84A;outline-offset:4px}
.sign-in-button:hover{background-color:#254B70!important;border-color:#254B70!important;text-decoration:underline!important}
@media only screen and (max-width:600px){.outer-padding{padding:20px 12px!important}.email-padding{padding:28px 24px!important}.brand-padding{padding:24px!important}.email-title{font-size:28px!important;line-height:36px!important}}
@media (prefers-color-scheme:dark){.email-background{background-color:#101D2B!important}.email-card{background-color:#192C40!important;border-color:#405369!important}.email-ink{color:#F5F3ED!important}.email-muted{color:#BBC8D6!important}.email-rule{border-color:#405369!important}.email-link{color:#E9BE70!important}.sign-in-button{background-color:#D9A84A!important;border-color:#D9A84A!important;color:#142A43!important}.sign-in-button:hover{background-color:#E9BE70!important;border-color:#E9BE70!important}}
[data-ogsc] .email-background{background-color:#101D2B!important}[data-ogsc] .email-card{background-color:#192C40!important;border-color:#405369!important}[data-ogsc] .email-ink{color:#F5F3ED!important}[data-ogsc] .email-muted{color:#BBC8D6!important}[data-ogsc] .email-link{color:#E9BE70!important}
</style>
</head>
<body class="email-background" style="margin:0;padding:0;width:100%;background-color:#F1EFE8;font-family:Arial,Helvetica,sans-serif;color:#23271F;">
<div style="display:none;font-size:1px;line-height:1px;color:#F1EFE8;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(data.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-background" bgcolor="#F1EFE8"><tr><td align="center" class="outer-padding" style="padding:40px 20px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-card" bgcolor="#FAF9F6" style="max-width:560px;background-color:#FAF9F6;border:1px solid #D9D7CE;border-collapse:separate;">
<tr><td class="brand-padding" bgcolor="#142A43" style="padding:28px 36px;background-color:#142A43;border-bottom:4px solid #D9A84A;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="52" valign="middle"><img src="cid:opax-brand-mark" width="40" height="40" alt="" style="display:block;border:0;width:40px;height:40px;"></td><td valign="middle" style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:40px;font-weight:bold;color:#FFFFFF;">OPAX</td></tr></table>
<p style="margin:12px 0 0;font-size:13px;line-height:20px;color:#D0DBE7;">Open Parliamentary Accountability Exchange</p>
</td></tr>
<tr><td class="email-padding" style="padding:36px;word-break:break-word;overflow-wrap:anywhere;">
<h1 class="email-title email-ink" style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:40px;font-weight:bold;color:#23271F;">${escapeHtml(data.title)}</h1>
<p class="email-ink" style="margin:0 0 28px;font-size:16px;line-height:26px;color:#23271F;">${escapeHtml(data.intro)}</p>
${data.detail||''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 24px;">
<!--[if mso]><v:roundrect href="${href}" style="height:52px;v-text-anchor:middle;width:200px;" arcsize="8%" stroke="f" fillcolor="#142A43"><w:anchorlock xmlns:w="urn:schemas-microsoft-com:office:word"/><center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escapeHtml(data.button)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a class="sign-in-button" href="${href}" style="display:inline-block;background-color:#142A43;border:1px solid #142A43;border-radius:4px;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:24px;padding:14px 28px;text-align:center;text-decoration:none;">${escapeHtml(data.button)}</a><!--<![endif]-->
</td></tr></table>
<p class="email-muted" style="margin:0 0 28px;font-size:14px;line-height:22px;color:#596154;">${data.note}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="email-rule" style="border-top:1px solid #D9D7CE;padding-top:24px;">
<p class="email-muted" style="margin:0 0 16px;font-size:14px;line-height:22px;color:#596154;">${data.reason}</p>
<p class="email-muted" style="margin:0 0 8px;font-size:12px;line-height:20px;color:#596154;">Button not working? Copy this link into your browser:</p>
<p style="margin:0;font-size:12px;line-height:20px;word-break:break-all;overflow-wrap:anywhere;"><a class="email-link" href="${href}" style="color:#8A5A12;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${href}</a></p>
</td></tr></table>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;"><tr><td align="center" style="padding:24px 16px 0;">
<p class="email-muted" style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:24px;color:#596154;">The public record belongs to everyone.</p>
<p style="margin:0;font-size:12px;line-height:20px;"><a class="email-link" href="${home}" style="color:#8A5A12;text-decoration:underline;">${escapeHtml(new URL(data.origin).host)}</a>&nbsp;&nbsp;&nbsp;<a class="email-link" href="${home}/community?view=privacy" style="color:#8A5A12;text-decoration:underline;">Account privacy</a></p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`
 }
}
