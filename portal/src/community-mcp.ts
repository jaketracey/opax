import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {z} from 'zod'
import {body,CommunityError,digest,json,limit,now,type Member} from './community-core'
import {tools,getTool,toolSchema,toolOutputSchema,validateToolArgs,callTool,ToolInputError} from './tools'
import {DISPATCH_TEXT,MCP_DIRECT,MCP_INSTRUCTIONS,MCP_OUTPUT_BYTES,MCP_REGISTERS,MCP_TEXT,listedSchema,mcpName,registryName} from './tools/mcp-listing'
import {corpusKb} from './tools/corpus-records'
import {evidenceAsAt} from '../public/evidence-date.js'
import {mcpToolTitle} from './mcp-tool-titles'
export async function communityMcp(req:Request,env:Env,readPublic:(path:string)=>Promise<Response>):Promise<Response>{
 try{
  if(String(env.COMMUNITY_ENABLED)!=='true')throw new CommunityError(503,'Community access is being prepared.')
  const origin=req.headers.get('origin');if(origin&&origin!==env.COMMUNITY_ORIGIN)throw new CommunityError(403,'This origin is not allowed.')
  const token=req.headers.get('authorization')?.match(/^Bearer (opax_[\w-]{43})$/)?.[1]
  if(!token)return json({error:'Use an Opax community access token.'},401,{'www-authenticate':'Bearer realm="Opax community tools"'})
  const record=await env.COMMUNITY_DB.prepare('SELECT m.*,k.id AS key_id FROM mcp_keys k JOIN members m ON m.id=k.member_id WHERE k.token_hash=? AND k.revoked_at IS NULL AND k.expires_at>? AND m.disabled=0').bind(await digest(token),now()).first<Member&{key_id:string}>()
  if(!record)throw new CommunityError(401,'This access token is expired or revoked.')
  await limit(env,'mcp:'+record.id,60,60)
  if(req.method!=='POST')return json({error:'This endpoint accepts MCP requests over HTTP POST.'},405,{'allow':'POST'})
  const parsed=await body(req,16384)
  await env.COMMUNITY_DB.prepare('UPDATE mcp_keys SET last_used_at=? WHERE id=?').bind(now(),record.key_id).run()
  const params=parsed.params as {name?:unknown,arguments?:unknown}|undefined
  const toolEnv=()=>({ASSETS:env.ASSETS,TABLE_DB:env.TABLE_DB,COMMUNITY_ORIGIN:env.COMMUNITY_ORIGIN,VIC_ELECTION_HUB_ENABLED:env.VIC_ELECTION_HUB_ENABLED,origin:'https://opax.com.au',signal:req.signal,kb:corpusKb(env,req.signal)})
  const failed=(text:string)=>({content:[{type:'text' as const,text}],isError:true})
  // Bad arguments are answered before any read, as a tool result the model can correct from
  // (MCP: input validation errors are tool execution errors, not protocol errors).
  if(parsed.jsonrpc==='2.0'&&['string','number'].includes(typeof parsed.id)&&parsed.method==='tools/call'&&typeof params?.name==='string'&&getTool(registryName(params.name))){
   try{await validateToolArgs(toolEnv(),registryName(params.name),params.arguments??{})}
   catch(error){if(error instanceof ToolInputError)return json({jsonrpc:'2.0',id:parsed.id,result:failed(error.message.replaceAll(registryName(params.name),params.name))});throw error}
  }
  const server=new McpServer({name:'opax-public-record',version:'1.0.0'},{instructions:MCP_INSTRUCTIONS})
  // Every tool is listed with a title (mcp-tool-titles.ts), both on the tool and in its annotations.
  const register=server.registerTool.bind(server) as (name:string,config:Record<string,unknown>,handler:unknown)=>unknown
  server.registerTool=((name:string,config:Record<string,unknown>,handler:unknown)=>{const title=typeof config.title==='string'?config.title:MCP_TEXT[name]?.title??mcpToolTitle(name);return register(name,{...config,title,annotations:{title,...(config.annotations as object|undefined)}},handler)}) as typeof server.registerTool
  async function result(path:string){
   const response=await readPublic(path),reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0
   if(reader){while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MCP_OUTPUT_BYTES){await reader.cancel();return {content:[{type:'text' as const,text:JSON.stringify({error:path.startsWith('/api/resource/speech-')?'This speech is longer than one response allows. Read it in parts with hansard_search (record_id), or open the url.':'This record is larger than one response allows. Open the url, or narrow the search.',url:env.COMMUNITY_ORIGIN+path.replace('/api/resource/','/doc/').replace('/api/search-all','/search')})}],isError:true}}chunks.push(value)}}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
   const raw=new TextDecoder().decode(bytes)
   if(!response.ok)return {content:[{type:'text' as const,text:JSON.stringify({error:response.status===404&&path.startsWith('/api/resource/')?'No record has that slug. Use a slug exactly as search_records returns it.':response.status===404?'Nothing was found for that request.':'The record service could not answer just now (status '+response.status+'). Try again in a minute.'})}],isError:true}
   let data:Record<string,unknown>;try{data=JSON.parse(raw)}catch{return {content:[{type:'text' as const,text:JSON.stringify({error:'The record service returned an unreadable response. Try again in a minute.'})}],isError:true}}
   if(path.startsWith('/api/resource/'))data.opax_url=env.COMMUNITY_ORIGIN+path.replace('/api/resource/','/doc/')
   if(path.startsWith('/api/search-all')&&!Array.isArray(data.results))data.results=[]
   if(Array.isArray(data.results))data.results=data.results.map((row:Record<string,unknown>)=>{
    const href=typeof row.href==='string'?row.href:null
    const opax_url=href&&href.startsWith('/')&&!href.startsWith('//')?env.COMMUNITY_ORIGIN+href:typeof row.slug==='string'?env.COMMUNITY_ORIGIN+'/doc/'+encodeURIComponent(row.slug):null
    const params=href&&href.startsWith('/money/grants?')?new URLSearchParams(href.slice(href.indexOf('?')+1)):null,jurisdiction=params?.get('jur')
    // Program rows carry a stable catalog slug (grant-program-<jur>-<key>) and a program= deep link; recipient rows carry open=<id>.
    const programSlug=typeof row.slug==='string'?/^grant-program-(federal|qld)-([a-z0-9-]{1,80})$/.exec(row.slug):null
    const program=jurisdiction&&params?.get('program')?{jurisdiction,id:params.get('program') as string}:programSlug?{jurisdiction:programSlug[1],id:programSlug[2]}:null
    if(program)return {...row,opax_url,grant_program:program}
    const recipientPath=href?/^\/money\/grants\/(federal|qld)\/recipient\/([^/?#]+)(?:[?#]|$)/.exec(href):null
    let recipientId:string|null=null;try{recipientId=recipientPath?decodeURIComponent(recipientPath[2]):null}catch{}
    const recipient=recipientPath&&recipientId?{jurisdiction:recipientPath[1],id:recipientId}:jurisdiction&&params?.get('open')?{jurisdiction,id:params.get('open') as string}:null
    return recipient?{...row,opax_url,grant_recipient:recipient}:{...row,opax_url}
   })
   return {content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data,isError:false}
  }
  const readOnly={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
  // Inline results are the published JSON with links added; each schema names the fields a client can rely on.
  const detail=z.enum(['concise','full']).default('concise').describe('concise (default) lists the 25 largest grants; full lists as many as fit in one response.')
  const grantOutput=z.looseObject({n:z.string().describe('Recipient or program name.'),grants:z.array(z.unknown()),grants_total:z.number(),grants_listed:z.number(),truncated:z.boolean().optional(),field_guide:z.record(z.string(),z.unknown()),coverage:z.record(z.string(),z.unknown()),opax_url:z.string()})
  server.registerTool('search_records',{description:MCP_TEXT.search_records.description,outputSchema:z.looseObject({results:z.array(z.unknown()).describe('Ranked results, each with a title, an excerpt, a slug for read_record and an opax_url.')}),inputSchema:{query:z.string().min(2).max(300).describe('Words or a phrase.'),kind:z.enum(['all','speech','press_release','bill','bill_text','division','grant']).default('all').describe('Only this kind of record.'),page:z.number().int().min(1).max(20).default(1).describe('Results page, 10 a page.')},annotations:readOnly},async({query,kind,page})=>result('/api/search-all?'+new URLSearchParams({q:query,kind,per:'10',page:String(page)})))
  server.registerTool('read_record',{description:MCP_TEXT.read_record.description,outputSchema:z.looseObject({opax_url:z.string().describe('The OPAX page for this record.')}),inputSchema:{slug:z.string().regex(/^(?:speech-\d+|legal-\d+|news-\d+|bill-text-au-federal-[a-z0-9-]{1,180}|division-[a-z0-9-]+|press-(?:pmt|nsw|qld|vic|tre)-[a-z0-9-]+|grantconnect-award-ga\d+(?:-v\d+)?|grant-site-evidence-(?:ga\d+|mlci-invitation-\d{3})|mlci-invitation-\d{3}|mlci-award-ga[a-z0-9-]+|aec-seat-2025-[a-f0-9]{16}|roster-profile-[a-f0-9]{16}|research-(?:cpi-mlci|mlci-program)-2026)$/,'Use a slug exactly as search_records returns it, for example speech-931754.').describe('The slug of a search_records result.')},annotations:readOnly},async({slug})=>result('/api/resource/'+encodeURIComponent(slug)))
  server.registerTool('find_connections',{description:MCP_TEXT.find_connections.description,outputSchema:z.object({as_at:z.string().optional().describe('When the connections dataset was built.'),connections:z.array(z.object({id:z.string(),name:z.string(),kind:z.string(),records:z.number(),url:z.string()}))}),inputSchema:{query:z.string().min(2).max(120).describe('Part of a name.')},annotations:readOnly},async({query})=>{
   const response=await env.ASSETS.fetch(new Request(env.COMMUNITY_ORIGIN+'/evidence/index.json'));if(!response.ok)return {content:[{type:'text' as const,text:JSON.stringify({error:'The connections dataset could not be read just now. Try again in a minute.'})}],isError:true}
   const data=await response.json() as {meta?:unknown,entities:{id:string,name:string,kind:string,records:number}[]};const asAt=evidenceAsAt(data.meta);const hits=data.entities.filter(e=>e.name.toLowerCase().includes(query.toLowerCase())).slice(0,20).map(e=>({...e,url:env.COMMUNITY_ORIGIN+'/connections?entity='+e.id}));const found={...(asAt?{as_at:asAt}:{}),connections:hits};return {content:[{type:'text' as const,text:JSON.stringify(found)}],structuredContent:found}
  })
  server.registerTool('corpus_coverage',{description:MCP_TEXT.corpus_coverage.description,inputSchema:{},outputSchema:z.looseObject({version:z.string().describe('Date of this coverage statement.'),sources:z.array(z.unknown()).describe('Each source with its record count and years covered.')}),annotations:readOnly},async()=>{
   const unavailable={content:[{type:'text' as const,text:JSON.stringify({error:'The coverage statement could not be read just now. Try again in a minute.'})}],isError:true}
   const r=await env.ASSETS.fetch(new Request(env.COMMUNITY_ORIGIN+'/corpus.json'));if(!r.ok)return unavailable
   let data:Record<string,unknown>;try{data=await r.json() as Record<string,unknown>}catch{return unavailable}
   if(typeof data?.version!=='string'||!Array.isArray(data.sources))return unavailable
   data.opax_url=env.COMMUNITY_ORIGIN+'/stats'
   return {content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data,isError:false}
  })
  type ProgramEntry={id:string,n:string,key:string}
  async function grantIndex(jurisdiction:string){
   const response=await env.ASSETS.fetch(new Request(env.COMMUNITY_ORIGIN+'/graph/grants.'+jurisdiction+'.json'))
   if(!response.ok)return null
   try{return await response.json() as {recipients?:{id:string,sh:number}[],programs?:ProgramEntry[]}}catch{return null}
  }
  const programReference=(jurisdiction:string,p:ProgramEntry)=>({jurisdiction,id:p.id,name:p.n,opax_url:env.COMMUNITY_ORIGIN+'/money/grants?'+new URLSearchParams({jur:jurisdiction,program:p.id})})
  const fieldGuide={currency:'AUD',n:'name or grant title',t:'total grant value, not necessarily money paid',c:'grant count',k:'recipient kind',jur:'jurisdiction',y0:'first financial year',y1:'last financial year',by:'financial year -> [value, source row count]; see coverage.value_basis',agencies:'top agencies: [name, grant value]',programs:'top recipient program labels: [label, grant value]; use program_lookup for catalog IDs',sel:'selection process -> value (recipient) or [value, count] (program)',el:'electorate (grant) or top [electorate, value] pairs (recipient)',grants:{v:'value; see coverage.value_basis',n:'title',ag:'agency',pr:'program label',cat:'category',fy:'financial year',s:'start date',a:'approval date',rid:'recipient ID for read_grant_recipient',rn:'recipient name',guid:'original Grants.gov.au record identifier',source_url:'source link; source_kind distinguishes an original record from a dataset'},more:'grants omitted from the recipient asset',recipients:'top program recipients: [id, name, kind, value, count, donor_match]; a donor match does not establish influence'}
  function grantResult(file:Record<string,unknown>,opax_url:string,jurisdiction:string,full:boolean){
   const all=Array.isArray(file.grants)?file.grants:[]
   const qld=jurisdiction==='qld'
   const dataset_source_url=qld?'https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964':'https://www.grants.gov.au/'
   const grants=all.map((g:Record<string,unknown>)=>typeof g.guid==='string'&&g.guid?{...g,source_url:'https://www.grants.gov.au/Ga/Show/'+encodeURIComponent(g.guid),source_kind:'original_record',original_source_status:'available'}:qld?{...g,source_url:dataset_source_url,source_kind:'dataset',original_source_status:'individual_record_url_unavailable'}:{...g,original_source_status:'individual_record_url_unavailable'})
   const coverage={value_basis:qld?'Annual expenditure lines per funding agreement, including grants, service agreements and other assistance. A multi-year agreement appears once per financial year paid. Counts are expenditure rows, not distinct awards.':'Published award values; varied awards use their current value and aggregate awards may bundle recipients. Values are not evidence of payments received.',summaries:'Recipient agencies, programs and electorates and program top recipients may be partial summaries. Do not use their sums as complete totals.',program_lookup:'Only exported catalog programs can be opened. An empty candidate list means no matching catalog label, not that no program exists.',source_links:'Dataset links support dataset provenance, not an individual grant record. Source links are supplied when known; availability at the external site is not guaranteed.'}

   const size=(text:string)=>new TextEncoder().encode(text).length
   // The files list grants largest first. A short list by default; detail=full sends as many as one response holds.
   let listed=full?grants.length:Math.min(25,grants.length)
   const encode=()=>JSON.stringify({...file,grants:grants.slice(0,listed),grants_total:file.grants_total??file.c??grants.length,grants_listed:listed,...(file.truncated||Number(file.more)>0||listed<grants.length||Number(file.grants_total)>listed?{truncated:true}:{}),field_guide:{...fieldGuide,t:qld?'total expenditure value':'total published award value',c:qld?'expenditure row count, not distinct awards':'award record count'},coverage,dataset_source_url,opax_url})
   let payload=encode()
   if(size(payload)>MCP_OUTPUT_BYTES){
    listed=Math.min(200,listed);payload=encode()
    while(size(payload)>MCP_OUTPUT_BYTES&&listed>0){listed=Math.floor(listed/2);payload=encode()}
   }
   if(size(payload)>MCP_OUTPUT_BYTES)return {content:[{type:'text' as const,text:JSON.stringify({error:'This record is larger than one response allows, even without its grant list. Open the url.',url:opax_url})}],isError:true}
   return {content:[{type:'text' as const,text:payload}],structuredContent:JSON.parse(payload) as Record<string,unknown>,isError:false}
  }
  const fileKey=(id:string)=>{const i=id.indexOf(':'),kind=i<0?'x':id.slice(0,i),slug=(i<0?id:id.slice(i+1)).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'x';return kind+'-'+slug}
  server.registerTool('read_grant_recipient',{description:MCP_TEXT.read_grant_recipient.description,outputSchema:grantOutput,inputSchema:{jurisdiction:z.enum(['federal','qld']),id:z.string().describe('grant_recipient id.').regex(/^(?:abn:\d{11}|name:[a-z0-9 .&'()-]{2,120}|person:[a-z0-9 .'-]{2,120})$/,'Use the id from a search_records grant result (its grant_recipient field), for example abn:12345678901.'),detail},annotations:readOnly},async({jurisdiction,id,detail})=>{
   const notFound={content:[{type:'text' as const,text:JSON.stringify({error:'No grant recipient has that id in '+(jurisdiction==='qld'?'Queensland':'federal')+' grants. Get ids from search_records with kind grant: each result carries a grant_recipient field.'})}],isError:true}
   const opax_url=env.COMMUNITY_ORIGIN+'/money/grants/'+jurisdiction+'/recipient/'+encodeURIComponent(id)
   const index=await grantIndex(jurisdiction)
   if(!index)return notFound
   const recipients=index.recipients
   const entry=Array.isArray(recipients)?recipients.find(r=>r.id===id):undefined
   if(!entry||!Number.isInteger(entry.sh))return notFound
   const shardResponse=await env.ASSETS.fetch(new Request(env.COMMUNITY_ORIGIN+'/grants/'+jurisdiction+'/shard-'+String(entry.sh).padStart(2,'0')+'.json'))
   if(!shardResponse.ok)return notFound
   let shard:Record<string,Record<string,unknown>>;try{shard=await shardResponse.json() as Record<string,Record<string,unknown>>}catch{return notFound}
   const record=shard?.[fileKey(id)]
   if(!record||record.id!==id||typeof record.n!=='string'||!Array.isArray(record.grants))return notFound
   const catalog=Array.isArray(index.programs)?index.programs:[]
   const program_lookup=(Array.isArray(record.programs)?record.programs:[]).filter(Array.isArray).map((row:unknown[])=>({label:row[0],recipient_value:row[1],match:'catalog label only; verify membership against the program grants',candidates:catalog.filter(p=>p.n===row[0]||p.id===row[0]).map(p=>programReference(jurisdiction,p))}))
   return grantResult({...record,program_lookup},opax_url,jurisdiction,detail==='full')
  })
  server.registerTool('read_grant_program',{description:MCP_TEXT.read_grant_program.description,outputSchema:grantOutput,inputSchema:{jurisdiction:z.enum(['federal','qld']),id:z.string().trim().min(1).max(200).describe('grant_program id.'),detail},annotations:readOnly},async({jurisdiction,id,detail})=>{
   const notFound={content:[{type:'text' as const,text:JSON.stringify({error:'No grant program has that id in '+(jurisdiction==='qld'?'Queensland':'federal')+' grants. Get ids from search_records with kind grant (the grant_program field) or from read_grant_recipient (program_lookup candidates).'})}],isError:true}
   const index=await grantIndex(jurisdiction),catalog=Array.isArray(index?.programs)?index.programs:[]
   // The exporter assigns collision suffixes and trims truncated keys. Resolve its
   // authoritative key instead of guessing a filename from a name or ID.
   let matches=catalog.filter(p=>p.id===id)
   if(!matches.length)matches=catalog.filter(p=>p.key===id)
   if(!matches.length)matches=catalog.filter(p=>p.n===id)
   if(!matches.length)return notFound
   if(matches.length>1)return {content:[{type:'text' as const,text:JSON.stringify({error:'This program label matches several programs. Choose a candidate id.',candidates:matches.map(p=>programReference(jurisdiction,p))})}],isError:true}
   const entry=matches[0]
   if(!/^[a-z0-9][a-z0-9-]{0,100}$/.test(entry.key))return notFound
   const response=await env.ASSETS.fetch(new Request(env.COMMUNITY_ORIGIN+'/grants/'+jurisdiction+'/programs/'+entry.key+'.json'))
   if(!response.ok)return notFound
   let file:Record<string,unknown>;try{file=await response.json() as Record<string,unknown>}catch{return notFound}
   // Missing assets may return a 200 fallback page; identity must match the catalog.
   if(!file||typeof file!=='object'||file.id!==entry.id||typeof file.n!=='string'||!Array.isArray(file.grants))return notFound
   const opax_url=env.COMMUNITY_ORIGIN+'/money/grants?'+new URLSearchParams({jur:jurisdiction,program:entry.id})
   return grantResult(file,opax_url,jurisdiction,detail==='full')
  })
  const guide=(name:string)=>{const tool=getTool(registryName(name))!,text=MCP_TEXT[tool.name];return {register:name,title:text?.title??mcpToolTitle(name),description:text?.description??tool.description,arguments:listedSchema({...tool.inputSchema,examples:undefined}),examples:(tool.inputSchema.examples??[]).slice(0,3).map(example=>({register:name,arguments:example}))}}
  async function run(tool:(typeof tools)[number],name:string,args:unknown){
   let data
   try{data=await callTool(toolEnv(),tool.name,args)}
   catch(error){if(error instanceof ToolInputError)return failed(JSON.stringify({error:error.message.replaceAll(tool.name,name),...(MCP_REGISTERS[name]?{guide:guide(name)}:{})}));throw error}
   if(data.error==='Published tool data is temporarily unavailable.')data.error='This record source could not be read just now. Try again in a minute; if it keeps failing, try a narrower request.'
   const text=JSON.stringify(data)
   if(new TextEncoder().encode(text).length>MCP_OUTPUT_BYTES)return failed(JSON.stringify({error:'This result is larger than one response allows. Lower limit, or narrow the filters or dates.',url:'https://opax.com.au/methods#mcp'}))
   return {content:[{type:'text' as const,text}],structuredContent:data,isError:!!data.error}
  }
  // Core tools are listed by name. The specialised registers are listed once, inside query_register.
  // Any registry tool still answers a call by its own or its former name until the next release.
  const called=parsed.method==='tools/call'&&typeof params?.name==='string'?params.name:null
  for(const tool of tools){
   const names=MCP_DIRECT.has(tool.name)?[tool.name]:called&&(called===tool.name||called===mcpName(tool.name))?[called]:[]
   for(const name of names)server.registerTool(name,{title:tool.title??MCP_TEXT[tool.name]?.title??mcpToolTitle(name),description:MCP_TEXT[tool.name]?.description??tool.description,inputSchema:toolSchema(tool.name),outputSchema:toolOutputSchema(tool.name),annotations:readOnly},async args=>run(tool,name,args))
  }
  const registerName=z.enum(Object.keys(MCP_REGISTERS) as [string,...string[]])
  server.registerTool('query_register',{...DISPATCH_TEXT.query_register,inputSchema:{register:registerName,arguments:z.record(z.string(),z.unknown()).describe('The arguments register_guide lists for this register.')},outputSchema:toolOutputSchema('find_records'),annotations:readOnly},async({register,arguments:args})=>run(getTool(registryName(register))!,register,args))
  server.registerTool('register_guide',{...DISPATCH_TEXT.register_guide,inputSchema:{register:registerName},outputSchema:z.looseObject({register:z.string(),description:z.string(),arguments:z.record(z.string(),z.unknown()),examples:z.array(z.unknown())}),annotations:readOnly},async({register})=>{const found=guide(register);return {content:[{type:'text' as const,text:JSON.stringify(found)}],structuredContent:found,isError:false}})
  const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true})
  await server.connect(transport)
  try{
   const response=await transport.handleRequest(req,{parsedBody:parsed})
   if(parsed.method!=='tools/list'||!response.ok)return response
   // Every client holds this list in context: send each schema without examples, length bounds or SDK bookkeeping.
   const body=await response.json() as {result?:{tools?:Record<string,unknown>[]}}
   if(Array.isArray(body.result?.tools))body.result.tools=body.result.tools.map(({execution:_execution,inputSchema,outputSchema,...tool})=>({...tool,inputSchema:listedSchema(inputSchema),...(outputSchema?{outputSchema:listedSchema(outputSchema)}:{})}))
   const headers=new Headers(response.headers);headers.delete('content-length')
   return new Response(JSON.stringify(body),{status:response.status,headers})
  }finally{await server.close()}
 }catch(e){if(e instanceof CommunityError)return json({error:e.message},e.status,e.status===401?{'www-authenticate':'Bearer realm="Opax community tools"'}:{});return json({error:'Opax tools are temporarily unavailable.'},503)}
}
