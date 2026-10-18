import { assert, object, text, integer, type Usage } from './contracts.js';
import { claudeRequest,claudeFinal,claudeUsage } from './claude-protocol.js';
import { codexRequest,codexFinal } from './codex-protocol.js';
import type { Host } from '../core/contracts.js';
export function prepare(host:Host,path:string,body:unknown,maximum:number):Record<string,unknown> {
 assert(path===(host==='claude-code'?'/v1/messages':'/v1/responses'),'unsupported endpoint');
 return host==='claude-code'?claudeRequest(body,maximum):codexRequest(body,maximum);
}
export function completion(host:Host,contentType:string,body:Buffer,model:string):Usage {
 const source=new TextDecoder('utf-8',{fatal:true}).decode(body);
 if(contentType==='application/json'){const v=object(JSON.parse(source));assert(v.model===model,'response model changed');return host==='claude-code'?claudeFinal(v):codexFinal(v);}
 assert(contentType==='text/event-stream','unsupported response encoding');
 let result:Usage|undefined,start:Usage|undefined,ended=false,terminal=false;
 const frames=source.replace(/\r\n/g,'\n').split('\n\n');assert(frames.pop()==='','incomplete SSE frame');
 for(const frame of frames){if(!frame.trim()||frame.startsWith(':'))continue;
  const lines=frame.split('\n');assert(lines.every(l=>l.startsWith('event:')||l.startsWith('data:')),'unsupported SSE field');
  const data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
  const v=object(JSON.parse(data));const type=text(v.type);const event=lines.filter(l=>l.startsWith('event:'));
  assert(event.length<=1&&(!event.length||event[0]?.slice(6).trim()===type),'SSE event mismatch');assert(!ended,'event after terminal');
  if(host==='codex'){
   if(type==='response.completed'){assert(!terminal,'duplicate terminal');const r=object(v.response);assert(r.model===model,'response model changed');result=codexFinal(r);terminal=true;ended=true;}
   else assert(['response.created','response.in_progress','response.output_item.added','response.content_part.added','response.output_text.delta','response.output_text.done','response.content_part.done','response.output_item.done','response.function_call_arguments.delta','response.function_call_arguments.done','response.reasoning_summary_part.added','response.reasoning_summary_text.delta','response.reasoning_summary_text.done','response.reasoning_summary_part.done'].includes(type),'unsupported SSE event');
  }else{
   if(type==='message_start'){assert(!start&&!terminal,'duplicate start');const m=object(v.message);assert(m.model===model,'response model changed');start=claudeUsage(m.usage);}
   else if(type==='message_delta'){assert(start&&!terminal,'unexpected message delta');const u=object(v.usage);const d=object(v.delta);assert(['end_turn','tool_use','max_tokens','stop_sequence'].includes(String(d.stop_reason)),'ambiguous stop');assert(Object.keys(u).every(k=>k==='output_tokens'),'unknown usage');result={inputTokens:start.inputTokens,outputTokens:integer(u.output_tokens)};terminal=true;}
   else if(type==='message_stop'){assert(terminal&&result,'missing terminal usage');ended=true;}
   else assert(start&&!terminal&&['content_block_start','content_block_delta','content_block_stop','ping'].includes(type),'unsupported SSE event');
  }
 }
 assert(ended&&result,'missing final usage');return result;
}
