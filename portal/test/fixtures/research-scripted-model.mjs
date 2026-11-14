import { MockLanguageModelV4 } from 'ai/test'

const usage={inputTokens:{total:900,noCache:900,cacheRead:0,cacheWrite:0},outputTokens:{total:120,text:120,reasoning:0}}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
/** Existing route fixtures also exercise the SDK's streaming transport, with their original usage and receipts. */
export class StreamingResearchModel extends MockLanguageModelV4 {
  constructor(options){
    super(options)
    if(options.doStream)return
    this.doStream=async options=>{
      this.doStreamCalls.push(options)
      const reply=await this.doGenerate(options)
      if(!reply)throw Error(`scripted model has no reply for call ${this.doStreamCalls.length}`)
      return {stream:new ReadableStream({start(controller){
        controller.enqueue({type:'stream-start',warnings:reply.warnings??[]})
        for(const [i,part] of reply.content.entries()){
          if(part.type==='tool-call'){
            const id=part.toolCallId
            controller.enqueue({type:'tool-input-start',id,toolName:part.toolName})
            controller.enqueue({type:'tool-input-delta',id,delta:part.input})
            controller.enqueue({type:'tool-input-end',id})
            controller.enqueue(part)
          }else if(part.type==='text'){
            const id=String(i)
            controller.enqueue({type:'text-start',id})
            controller.enqueue({type:'text-delta',id,delta:part.text})
            controller.enqueue({type:'text-end',id})
          }
        }
        controller.enqueue({type:'finish',finishReason:reply.finishReason,usage:reply.usage,providerMetadata:reply.providerMetadata})
        controller.close()
      }})}
    }
  }
}
/** One script serves both SDK transports. Four characters approximate a token; pacing includes JSON and fact ids. */
export function scriptedResearchModel(turns,{tokensPerSecond=0,onPiece=()=>{}}={}) {
  const calls=[]
  const next=options=>{calls.push(options);const turn=turns[calls.length-1];if(!turn)throw Error(`scripted model has no reply for call ${calls.length}`);if(turn.error)throw Error(turn.error);return turn}
  const model=new MockLanguageModelV4({
    doGenerate:async options=>{
      const t=next(options),text=typeof t.text==='string'?t.text:JSON.stringify(t.text)
      const content=t.tool_calls?t.tool_calls.map((c,i)=>({type:'tool-call',toolName:c.name,toolCallId:c.id??`call-${i}`,input:JSON.stringify(c.args??{})})):[{type:'text',text}]
      if(tokensPerSecond)await pause(JSON.stringify(t.tool_calls?.map(c=>c.args)??t.text).length/4/tokensPerSecond*1000)
      return {content,finishReason:{unified:t.tool_calls?'tool-calls':'stop',raw:t.tool_calls?'tool_calls':'stop'},usage,warnings:[]}
    },
    doStream:async options=>{
      const t=next(options)
      return {stream:new ReadableStream({async start(controller){
        try{
          controller.enqueue({type:'stream-start',warnings:[]})
          const parts=t.tool_calls??[{text:typeof t.text==='string'?t.text:JSON.stringify(t.text)}]
          for(const [i,p] of parts.entries()){
            const id=p.id??`call-${i}`,tool=!!p.name,value=tool?JSON.stringify(p.args??{}):p.text
            controller.enqueue(tool?{type:'tool-input-start',id,toolName:p.name}:{type:'text-start',id})
            const started=performance.now()
            for(let at=0;at<value.length;at+=4){
              if(options.abortSignal?.aborted)throw options.abortSignal.reason
              if(tokensPerSecond)await pause(Math.max(0,(at+4)/4/tokensPerSecond*1000-(performance.now()-started)))
              const delta=value.slice(at,at+4)
              await onPiece(delta,at+4>=value.length)
              controller.enqueue({type:tool?'tool-input-delta':'text-delta',id,delta})
            }
            controller.enqueue({type:tool?'tool-input-end':'text-end',id})
            if(tool)controller.enqueue({type:'tool-call',toolCallId:id,toolName:p.name,input:value})
          }
          controller.enqueue({type:'finish',finishReason:{unified:t.tool_calls?'tool-calls':'stop',raw:t.tool_calls?'tool_calls':'stop'},usage})
          controller.close()
        }catch(error){controller.error(error)}
      }})}
    },
  })
  model.calls=calls
  return model
}
