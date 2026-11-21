// Every email OPAX sends, each drawn with the shared layout (email-layout.ts,
// docs/EMAIL-STYLE.md). An email here is its facts: the layout owns the look.
import {emailLayout} from './email-layout.ts'

/** The sign-in link, with the app's one-time code when the app asked for one. */
export function signInEmail(link:string,code?:string) {
 const origin=new URL(link).origin
 return emailLayout({origin,subject:'Your sign-in link for Opax',title:'Sign in to the community',
  preheader:'Your secure link to the Opax community. Valid for 15 minutes.',
  blocks:[
   {kind:'text',text:code?'Enter this code in the Opax app. The link below signs you in through your browser.':'Use this secure link to sign in to your Opax community account. No password needed.'},
   ...(code?[{kind:'code' as const,label:'Your Opax app sign-in code',code,note:'Enter it in the app within 15 minutes. Never share this code. The link signs you in through your browser, not the app. Using the link also uses up this code.'}]:[]),
  ],
  action:{href:link,label:'Sign in to Opax'},
  note:['This link expires in ',{strong:'15 minutes'},' and can only be used once. Keep it private.'],
  reason:'If you didn’t request this email, you can safely ignore it.',
  text:`Sign in to Opax\n\n${code?`Your Opax app sign-in code: ${code}\nEnter it in the app within 15 minutes. Never share this code. The link signs you in through your browser, not the app. Using the link also uses up this code.\n\nSign in through your browser:\n\n${link}\n\n`:`Use this secure link to sign in to your Opax community account:\n\n${link}\n\n`}This link expires in 15 minutes and can only be used once. Keep it private.\n\nIf you did not request this email, you can safely ignore it.\n\nThe public record belongs to everyone.\nOpen Parliamentary Accountability Exchange\n${origin}\nAccount privacy: ${origin}/community?view=privacy`})
}

/** Someone replied to a discussion the member started. */
export function replyEmail(data:{origin:string,author:string,title:string,body:string,threadId:string,replyId:string,unsubscribeUrl:string}) {
 const link=`${data.origin}/community?view=thread&id=${encodeURIComponent(data.threadId)}&reply=${encodeURIComponent(data.replyId)}#reply-${encodeURIComponent(data.replyId)}`
 const settings=data.origin+'/community?view=settings#email-notifications'
 const excerpt=data.body.length>280?data.body.slice(0,280).trimEnd()+'…':data.body
 return {...emailLayout({origin:data.origin,subject:'New reply to your Opax discussion',title:'You have a new reply',
  preheader:`${data.author} replied to “${data.title}”.`,
  blocks:[
   {kind:'text',text:`${data.author} replied to your discussion:`},
   {kind:'quote',title:data.title,text:excerpt},
  ],
  action:{href:link,label:'Read the reply'},
  note:'Open the discussion to continue the conversation.',
  reason:'You’re receiving this because you started this discussion.',
  links:[{href:settings,label:'Manage email notifications'},{href:data.unsubscribeUrl,label:'Unsubscribe from reply emails'}],
  text:`You have a new reply\n\n${data.author} replied to your discussion:\n${data.title}\n\n${excerpt}\n\nRead the reply:\n${link}\n\nYou’re receiving this because you started this discussion.\nManage email notifications: ${settings}\nUnsubscribe from reply emails: ${data.unsubscribeUrl}\n\nThe public record belongs to everyone.\nOpen Parliamentary Accountability Exchange\n${data.origin}`}),
  headers:{'List-Unsubscribe':`<${data.unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}
}

/**
 * The code that confirms an account deletion. It has no button and no link to
 * sign in: the code is typed where the deletion was asked for, and nowhere else.
 */
export function deletionEmail(origin:string,code:string) {
 return emailLayout({origin,subject:'Confirm your Opax account deletion',title:'Confirm your account deletion',
  preheader:'Your code to delete your Opax account. Valid for 15 minutes.',
  blocks:[{kind:'code',label:'Your Opax account deletion code',code,note:'It expires in 15 minutes. Enter it only if you requested permanent account deletion. Never share this code.'}],
  reason:'If you did not request deletion, ignore this email.',
  text:`Your Opax account deletion code: ${code}\n\nIt expires in 15 minutes. Enter it only if you requested permanent account deletion. Never share this code. If you did not request deletion, ignore this email.`})
}
